import { promises as fsp } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { clip } from './spawn'
import { localToolTrace } from './traceText'
import type { TraceUpdate } from './types'

/**
 * Herramientas sencillas para los modelos locales (LM Studio): les dan acceso a la carpeta del
 * proyecto y a internet sin depender de un CLI. Todo queda limitado a la carpeta de trabajo.
 */

export interface ToolContext {
  cwd: string
  /** false en modo planificación: sin herramientas de escritura. */
  canWrite: boolean
  signal: AbortSignal
  onActivity(text: string): void
  onProgress(p: number): void
  onFile(path: string): void
  /** Paso a paso para el registro de la tarea (opcional). */
  onTrace?(update: TraceUpdate): void
}

type Json = Record<string, unknown>

const fn = (name: string, description: string, properties: Json, required: string[] = []): Json => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
})

const READ_TOOLS = [
  fn('list_files', 'Lista archivos y carpetas del proyecto.', {
    path: { type: 'string', description: 'Carpeta relativa al proyecto (por defecto ".")' },
    depth: { type: 'integer', description: 'Niveles de profundidad, 1 a 3 (por defecto 2)' }
  }),
  fn(
    'search_files',
    'Busca un texto en los archivos del proyecto (sin distinguir mayúsculas). Devuelve archivo, línea y contenido.',
    { query: { type: 'string', description: 'Texto a buscar' }, path: { type: 'string', description: 'Carpeta donde buscar (opcional)' } },
    ['query']
  ),
  fn(
    'read_file',
    'Lee un archivo de texto del proyecto. Para archivos largos, usa start_line para seguir leyendo.',
    {
      path: { type: 'string', description: 'Ruta relativa al proyecto' },
      start_line: { type: 'integer', description: 'Primera línea (1 por defecto)' }
    },
    ['path']
  ),
  fn(
    'web_search',
    'Busca en internet y devuelve los primeros resultados (título, enlace y resumen).',
    { query: { type: 'string', description: 'Qué buscar' } },
    ['query']
  ),
  fn('fetch_url', 'Descarga una página web pública y devuelve su texto.', { url: { type: 'string', description: 'Dirección http(s)' } }, ['url']),
  fn(
    'update_plan',
    'Registra tu lista de pasos y cuáles has completado. La app la usa para mostrar tu progreso.',
    {
      steps: {
        type: 'array',
        items: { type: 'object', properties: { step: { type: 'string' }, done: { type: 'boolean' } }, required: ['step', 'done'] }
      }
    },
    ['steps']
  )
]

const WRITE_TOOLS = [
  fn(
    'write_file',
    'Crea o reemplaza un archivo del proyecto con el contenido indicado.',
    { path: { type: 'string', description: 'Ruta relativa al proyecto' }, content: { type: 'string', description: 'Contenido completo' } },
    ['path', 'content']
  ),
  fn(
    'edit_file',
    'Reemplaza un fragmento exacto de un archivo (old_text debe aparecer una sola vez).',
    {
      path: { type: 'string', description: 'Ruta relativa al proyecto' },
      old_text: { type: 'string', description: 'Texto actual, exacto' },
      new_text: { type: 'string', description: 'Texto nuevo' }
    },
    ['path', 'old_text', 'new_text']
  )
]

export function toolDefinitions(canWrite: boolean): Json[] {
  return canWrite ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS
}

const SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build', 'out', 'target', '.godot', '.next'])
const MAX_READ_CHARS = 12_000
const MAX_READ_LINES = 300

/** Ruta absoluta dentro de la carpeta de trabajo, o error si intenta salir de ella. */
function inside(ctx: ToolContext, p: unknown): string {
  const rel = typeof p === 'string' && p.trim() ? p.trim() : '.'
  const abs = resolve(ctx.cwd, rel)
  const r = relative(ctx.cwd, abs)
  if (r.startsWith('..') || isAbsolute(r)) throw new Error('Esa ruta está fuera de la carpeta del proyecto')
  return abs
}

const relOf = (ctx: ToolContext, abs: string): string => relative(ctx.cwd, abs).split(sep).join('/') || '.'

async function listFiles(ctx: ToolContext, a: Json): Promise<string> {
  const root = inside(ctx, a.path)
  const depth = Math.min(3, Math.max(1, Number(a.depth) || 2))
  const out: string[] = []
  const walk = async (dir: string, level: number): Promise<void> => {
    if (out.length >= 250) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries.sort((x, y) => Number(y.isDirectory()) - Number(x.isDirectory()) || x.name.localeCompare(y.name))) {
      if (out.length >= 250) break
      if (SKIP.has(e.name)) continue
      const abs = join(dir, e.name)
      out.push(`${'  '.repeat(level)}${e.isDirectory() ? `${e.name}/` : e.name}`)
      if (e.isDirectory() && level + 1 < depth) await walk(abs, level + 1)
    }
  }
  await walk(root, 0)
  return out.length ? `Contenido de ${relOf(ctx, root)}:\n${out.join('\n')}${out.length >= 250 ? '\n… (lista recortada)' : ''}` : 'Carpeta vacía'
}

async function searchFiles(ctx: ToolContext, a: Json): Promise<string> {
  const q = String(a.query ?? '').toLowerCase()
  if (!q) throw new Error('Falta el texto a buscar')
  const root = inside(ctx, a.path)
  const hits: string[] = []
  let scanned = 0
  const walk = async (dir: string): Promise<void> => {
    if (hits.length >= 40 || scanned >= 3000) return
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      if (hits.length >= 40 || ctx.signal.aborted) return
      if (SKIP.has(e.name) || e.name.startsWith('.')) continue
      const abs = join(dir, e.name)
      if (e.isDirectory()) await walk(abs)
      else if (e.isFile()) {
        scanned++
        const st = await fsp.stat(abs).catch(() => null)
        if (!st || st.size > 1_000_000) continue
        const text = await fsp.readFile(abs, 'utf8').catch(() => '')
        if (!text || text.includes('\u0000')) continue
        const lines = text.split(/\r?\n/)
        for (let i = 0; i < lines.length && hits.length < 40; i++) {
          if (lines[i].toLowerCase().includes(q)) hits.push(`${relOf(ctx, abs)}:${i + 1}: ${clip(lines[i].trim(), 160)}`)
        }
      }
    }
  }
  await walk(root)
  return hits.length ? hits.join('\n') : `No se encontró «${a.query}»`
}

async function readFile(ctx: ToolContext, a: Json): Promise<string> {
  const abs = inside(ctx, a.path)
  const text = await fsp.readFile(abs, 'utf8')
  if (text.includes('\u0000')) return 'Es un archivo binario: no se puede leer como texto'
  const lines = text.split(/\r?\n/)
  const start = Math.max(1, Number(a.start_line) || 1)
  let out = ''
  let end = start - 1
  for (let i = start - 1; i < lines.length && i < start - 1 + MAX_READ_LINES; i++) {
    if (out.length + lines[i].length > MAX_READ_CHARS) break
    out += `${lines[i]}\n`
    end = i + 1
  }
  const more = end < lines.length ? `\n… (quedan líneas: sigue con start_line=${end + 1})` : ''
  return `${relOf(ctx, abs)} · líneas ${start}-${end} de ${lines.length}\n${out}${more}`
}

async function writeFile(ctx: ToolContext, a: Json): Promise<string> {
  const abs = inside(ctx, a.path)
  if (relOf(ctx, abs).split('/').includes('.git')) throw new Error('No se puede escribir dentro de .git')
  await fsp.mkdir(dirname(abs), { recursive: true })
  await fsp.writeFile(abs, String(a.content ?? ''), 'utf8')
  ctx.onFile(abs)
  return `Guardado ${relOf(ctx, abs)}`
}

async function editFile(ctx: ToolContext, a: Json): Promise<string> {
  const abs = inside(ctx, a.path)
  const text = await fsp.readFile(abs, 'utf8')
  const oldText = String(a.old_text ?? '')
  if (!oldText) throw new Error('old_text está vacío')
  const first = text.indexOf(oldText)
  if (first < 0) throw new Error('No se encontró old_text en el archivo (debe ser exacto)')
  if (text.indexOf(oldText, first + 1) >= 0) throw new Error('old_text aparece varias veces: añade más contexto')
  await fsp.writeFile(abs, text.slice(0, first) + String(a.new_text ?? '') + text.slice(first + oldText.length), 'utf8')
  ctx.onFile(abs)
  return `Editado ${relOf(ctx, abs)}`
}

// ---------- Internet ----------

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 AI-Cowork'

/** Bloquea direcciones locales y privadas (la red de tu casa o empresa). */
function publicUrl(raw: unknown): URL {
  const u = new URL(String(raw ?? ''))
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Solo se permiten direcciones http(s)')
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    h === 'localhost' ||
    h.endsWith('.local') ||
    h === '0.0.0.0' ||
    h === '::1' ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^f[cd][0-9a-f]{2}:/.test(h)
  ) {
    throw new Error('No se permite acceder a direcciones locales o privadas')
  }
  return u
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

async function fetchText(url: URL, signal: AbortSignal): Promise<{ text: string; type: string }> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5', 'accept-language': 'es,en;q=0.8' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    redirect: 'follow'
  })
  if (!res.ok) throw new Error(`La web respondió ${res.status}`)
  publicUrl(res.url || url.href)
  const type = res.headers.get('content-type') ?? ''
  const reader = res.body?.getReader()
  if (!reader) return { text: '', type }
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    size += value.length
    if (size > 1_500_000) {
      void reader.cancel()
      break
    }
  }
  return { text: Buffer.concat(chunks).toString('utf8'), type }
}

async function webSearch(ctx: ToolContext, a: Json): Promise<string> {
  const q = String(a.query ?? '').trim()
  if (!q) throw new Error('Falta qué buscar')
  const { text } = await fetchText(new URL(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=es-es`), ctx.signal)
  const results: string[] = []
  const linkRe = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRe = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
  const snippets = [...text.matchAll(snippetRe)].map((m) => htmlToText(m[1]))
  let i = 0
  for (const m of text.matchAll(linkRe)) {
    let href = decodeEntities(m[1])
    const uddg = /[?&]uddg=([^&]+)/.exec(href)
    if (uddg) href = decodeURIComponent(uddg[1])
    if (href.startsWith('//')) href = `https:${href}`
    if (!/^https?:/.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue
    results.push(`${results.length + 1}. ${htmlToText(m[2])}\n   ${href}\n   ${clip(snippets[i] ?? '', 220)}`)
    i++
    if (results.length >= 6) break
  }
  return results.length ? `Resultados para «${q}»:\n${results.join('\n')}` : `Sin resultados para «${q}» (prueba con otras palabras)`
}

async function fetchUrl(ctx: ToolContext, a: Json): Promise<string> {
  const url = publicUrl(a.url)
  const { text, type } = await fetchText(url, ctx.signal)
  const body = /html/i.test(type) ? htmlToText(text) : text
  return `${url.href}\n\n${clip(body, MAX_READ_CHARS)}`
}

function updatePlan(ctx: ToolContext, a: Json): string {
  const steps = Array.isArray(a.steps) ? (a.steps as Json[]) : []
  if (!steps.length) return 'Lista vacía'
  const done = steps.filter((s) => s.done === true).length
  ctx.onProgress(done / steps.length)
  return `Plan actualizado: ${done}/${steps.length} pasos completados`
}

/** Texto de actividad para la etiqueta del robot. */
export function toolActivity(name: string, a: Json): string {
  const file = typeof a.path === 'string' && a.path ? a.path.split(/[\\/]/).pop() : ''
  switch (name) {
    case 'list_files':
      return 'Explorando archivos'
    case 'search_files':
      return `Buscando «${clip(String(a.query ?? ''), 24)}»`
    case 'read_file':
      return `Leyendo ${file}`
    case 'write_file':
      return `Creando ${file}`
    case 'edit_file':
      return `Editando ${file}`
    case 'web_search':
      return 'Buscando en la web'
    case 'fetch_url':
      return 'Consultando una web'
    case 'update_plan':
      return 'Organizando los pasos'
    default:
      return `Usando ${name}`
  }
}

let traceSeq = 0

/** Ejecuta una herramienta y devuelve el texto que verá el modelo (los errores también se le devuelven). */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext, callId?: string): Promise<string> {
  let a: Json = {}
  try {
    a = rawArgs ? (JSON.parse(rawArgs) as Json) : {}
  } catch {
    return 'Error: los argumentos no son JSON válido'
  }
  const id = callId || `local-${++traceSeq}`
  ctx.onTrace?.({ type: 'tool', id, ...localToolTrace(name, a) })
  ctx.onActivity(toolActivity(name, a))
  const out = await execTool(name, a, ctx)
  ctx.onTrace?.({ type: 'result', id, ok: !out.startsWith('Error'), output: out })
  return out
}

async function execTool(name: string, a: Json, ctx: ToolContext): Promise<string> {
  try {
    switch (name) {
      case 'list_files':
        return await listFiles(ctx, a)
      case 'search_files':
        return await searchFiles(ctx, a)
      case 'read_file':
        return await readFile(ctx, a)
      case 'web_search':
        return await webSearch(ctx, a)
      case 'fetch_url':
        return await fetchUrl(ctx, a)
      case 'update_plan':
        return updatePlan(ctx, a)
      case 'write_file':
        if (!ctx.canWrite) return 'Error: en este modo no puedes modificar archivos'
        return await writeFile(ctx, a)
      case 'edit_file':
        if (!ctx.canWrite) return 'Error: en este modo no puedes modificar archivos'
        return await editFile(ctx, a)
      default:
        return `Error: herramienta desconocida «${name}»`
    }
  } catch (e) {
    return `Error: ${clip((e as Error).message || String(e), 300)}`
  }
}
