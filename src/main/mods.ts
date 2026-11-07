// Mods (⚙ → Ajustes → Extensiones → Mods): cambian kywai en sí, no a los agentes. Un mod es una carpeta con un
// manifiesto «kywai-mod.json» que puede declarar:
//   - commands: órdenes «/nombre …» del chat. Lo que escribes se cambia por su texto antes de llegar a Hermes
//     ({args} = lo que va detrás). En el chat se ve lo que escribiste.
//   - hooks: una orden del sistema al empezar o acabar una petición o una tarea (en la carpeta del proyecto, con
//     variables KYWAI_…). NO se ejecutan hasta que des permiso viendo las órdenes; si cambian, hay que darlo otra vez.
//   - panels: páginas HTML del mod que se abren junto al chat (pestaña «Mods»), en una caja aislada (iframe sin
//     acceso a la app ni a internet, salvo el permiso «network»). Con el permiso «chat» pueden proponer un mensaje,
//     que tú confirmas.
// Se instalan desde un enlace de GitHub (la carpeta con el manifiesto) o desde una carpeta de este equipo, y se
// guardan en «mods/<nombre>» de la carpeta de datos. Nada se ejecuta al instalar.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, normalize, relative, resolve, sep } from 'node:path'
import { MOD_HOOK_EVENTS, type ModCommand, type ModHook, type ModHookEvent, type ModInfo, type ModPanel, type PluginSource } from '@shared/extensions'
import type { CoworkEvent, Task } from '@shared/types'
import { tr } from '@shared/i18n'
import { tapEvents } from './events'
import { downloadFolder } from './plugins'

export const MANIFEST = 'kywai-mod.json'
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/
const COMMAND_RE = /^[a-z][a-z0-9-]{0,30}$/
/** Órdenes que ya son de kywai. */
export const RESERVED_COMMANDS = ['directo', 'direct', 'dm', 'rutina', 'routine', 'model']
const PERMISSIONS = ['network', 'chat']
const MAX_MOD_BYTES = 20 * 1024 * 1024
const MAX_PROMPT = 8000
const MAX_OUTPUT = 4000
const IS_WIN = process.platform === 'win32'

interface Stored {
  name: string
  source: string
  enabled: boolean
  /** Huella de los hooks a los que diste permiso. */
  hooksApproved?: string
  lastHook?: ModInfo['lastHook']
}

interface Manifest {
  name: string
  title: string
  description: string
  version?: string
  commands: ModCommand[]
  hooks: ModHook[]
  panels: ModPanel[]
  permissions: string[]
}

let dataDir = ''
let projectInfo: (id: string) => { name: string; dir: string } | null = () => null
let untap: (() => void) | null = null

const regFile = (): string => join(dataDir, 'mods.json')
const modsRoot = (): string => join(dataDir, 'mods')

function safeJoin(root: string, rel: string): string | null {
  const abs = normalize(join(root, rel))
  const r = relative(root, abs)
  return !r || r.startsWith('..') || r.includes(`..${sep}`) ? null : abs
}

function readReg(): Stored[] {
  try {
    const d = JSON.parse(readFileSync(regFile(), 'utf8')) as { mods?: Stored[] }
    return Array.isArray(d.mods) ? d.mods.filter((m) => m && NAME_RE.test(m.name)) : []
  } catch {
    return []
  }
}

function writeReg(mods: Stored[]): void {
  mkdirSync(dataDir, { recursive: true })
  const tmp = `${regFile()}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify({ mods }, null, 2), 'utf8')
  renameSync(tmp, regFile())
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '')

/** Lee y valida un manifiesto. Lanza un error que se entiende si algo no vale. */
export function parseManifest(text: string, files: (rel: string) => boolean): Manifest {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(tr('{file} no es un JSON válido', { file: MANIFEST }))
  }
  if (!raw || typeof raw !== 'object') throw new Error(tr('{file} no es un JSON válido', { file: MANIFEST }))
  const name = str(raw.name, 64).toLowerCase()
  if (!NAME_RE.test(name)) throw new Error(tr('El mod necesita un «name» con minúsculas, números, puntos o guiones'))
  const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])
  const commands: ModCommand[] = []
  for (const c of list(raw.commands).slice(0, 20)) {
    const cn = str(c.name, 31).replace(/^\//, '').toLowerCase()
    const prompt = str(c.prompt, MAX_PROMPT)
    if (!COMMAND_RE.test(cn)) throw new Error(tr('Orden no válida: «{name}» (minúsculas, números y guiones)', { name: String(c.name) }))
    if (!prompt) throw new Error(tr('La orden «/{name}» no tiene «prompt»', { name: cn }))
    if (!commands.some((x) => x.name === cn)) commands.push({ name: cn, description: str(c.description, 200), prompt })
  }
  const hooks: ModHook[] = []
  for (const h of list(raw.hooks).slice(0, 10)) {
    const on = str(h.on, 40) as ModHookEvent
    if (!MOD_HOOK_EVENTS.includes(on)) throw new Error(tr('Hook con un «on» desconocido: «{on}» (vale {list})', { on: String(h.on), list: MOD_HOOK_EVENTS.join(', ') }))
    const run = str(h.run, 2000)
    if (!run || /[\r\n]/.test(String(h.run ?? '').trim())) throw new Error(tr('Cada hook necesita una orden «run» de una sola línea'))
    const timeout = Math.min(600, Math.max(1, Math.round(Number(h.timeout) || 60)))
    hooks.push({ on, run, timeout })
  }
  const panels: ModPanel[] = []
  for (const p of list(raw.panels).slice(0, 5)) {
    const id = str(p.id, 31).toLowerCase() || `panel${panels.length + 1}`
    const file = str(p.file, 200).replace(/^\.?\/+/, '')
    if (!COMMAND_RE.test(id)) throw new Error(tr('Panel con un «id» no válido: «{id}»', { id }))
    if (!/\.html?$/i.test(file) || file.split('/').includes('..') || !files(file)) throw new Error(tr('El panel «{id}» apunta a un archivo .html que no está en el mod', { id }))
    panels.push({ id, title: str(p.title, 60) || id, file })
  }
  const permissions = (Array.isArray(raw.permissions) ? raw.permissions : []).filter((x): x is string => typeof x === 'string' && PERMISSIONS.includes(x))
  if (!commands.length && !hooks.length && !panels.length) throw new Error(tr('El mod no declara ninguna orden, hook ni panel'))
  return { name, title: str(raw.title, 80) || name, description: str(raw.description, 400), ...(str(raw.version, 40) ? { version: str(raw.version, 40) } : {}), commands, hooks, panels, permissions: [...new Set(permissions)] }
}

const hooksHash = (hooks: ModHook[]): string => createHash('sha256').update(JSON.stringify(hooks)).digest('hex').slice(0, 32)

function manifestOf(name: string): Manifest | null {
  const dir = safeJoin(modsRoot(), name)
  if (!dir) return null
  try {
    return parseManifest(readFileSync(join(dir, MANIFEST), 'utf8'), (rel) => {
      const abs = safeJoin(dir, rel)
      return !!abs && existsSync(abs)
    })
  } catch {
    return null
  }
}

/** Los mods con su manifiesto, en el orden en que se instalaron (el primero gana si dos usan la misma orden). */
function loaded(): Array<{ stored: Stored; m: Manifest }> {
  return readReg().flatMap((stored) => {
    const m = manifestOf(stored.name)
    return m ? [{ stored, m }] : []
  })
}

export function listMods(): ModInfo[] {
  if (!dataDir) return []
  const owner = new Map<string, string>()
  for (const r of RESERVED_COMMANDS) owner.set(r, '')
  return loaded().map(({ stored, m }) => {
    const shadowed: string[] = []
    for (const c of m.commands) {
      if (owner.has(c.name) && owner.get(c.name) !== m.name) shadowed.push(c.name)
      else if (stored.enabled) owner.set(c.name, m.name)
    }
    return {
      name: m.name,
      title: m.title,
      description: m.description,
      ...(m.version ? { version: m.version } : {}),
      source: stored.source,
      enabled: stored.enabled,
      commands: m.commands,
      hooks: m.hooks,
      panels: m.panels,
      permissions: m.permissions,
      hooksAllowed: !!m.hooks.length && stored.hooksApproved === hooksHash(m.hooks),
      shadowed,
      ...(stored.lastHook ? { lastHook: stored.lastHook } : {})
    }
  })
}

// ---------- Órdenes «/nombre» ----------

/**
 * Si el texto empieza por una orden de un mod encendido, el texto que la sustituye ({args} = lo de detrás; si el
 * prompt no lo usa, lo de detrás va al final). null si no es una orden de un mod.
 */
export function expandModCommand(text: string): { mod: string; command: string; text: string } | null {
  const m = /^\/([a-z][a-z0-9-]{0,30})(?:\s+([\s\S]*))?$/i.exec(text.trim())
  if (!m || !dataDir) return null
  const name = m[1].toLowerCase()
  if (RESERVED_COMMANDS.includes(name)) return null
  const args = (m[2] ?? '').trim()
  for (const x of listMods()) {
    if (!x.enabled || x.shadowed.includes(name)) continue
    const c = x.commands.find((k) => k.name === name)
    if (!c) continue
    const out = c.prompt.includes('{args}') ? c.prompt.split('{args}').join(args) : args ? `${c.prompt}\n\n${args}` : c.prompt
    return { mod: x.name, command: name, text: out }
  }
  return null
}

// ---------- Hooks ----------

/** Variables que recibe la orden de un hook. */
export function hookEnv(on: ModHookEvent, data: { projectId: string; projectName?: string; projectDir?: string; ok?: boolean; task?: Pick<Task, 'title' | 'status' | 'result' | 'agentId'> }, modDir: string): Record<string, string> {
  return {
    KYWAI_EVENT: on,
    KYWAI_PROJECT_ID: data.projectId,
    KYWAI_PROJECT: data.projectName ?? '',
    KYWAI_PROJECT_DIR: data.projectDir ?? '',
    KYWAI_MOD_DIR: modDir,
    ...(data.ok !== undefined ? { KYWAI_OK: data.ok ? '1' : '0' } : {}),
    ...(data.task
      ? { KYWAI_TASK_TITLE: data.task.title, KYWAI_TASK_STATUS: data.task.status, KYWAI_TASK_AGENT: String(data.task.agentId ?? ''), KYWAI_TASK_RESULT: (data.task.result ?? '').slice(0, 4000) }
      : {})
  }
}

/** Ejecuta una orden con un tiempo máximo. Devuelve si acabó bien y lo último que escribió. */
export function runHookCommand(cmd: string, cwd: string, env: Record<string, string>, timeoutSec: number): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolveRun) => {
    let finished = false
    const done = (r: { ok: boolean; output: string }): void => {
      if (finished) return
      finished = true
      resolveRun(r)
    }
    let out = ''
    const add = (b: Buffer): void => {
      out = (out + b.toString('utf8')).slice(-MAX_OUTPUT)
    }
    let child
    try {
      // En su propio grupo de procesos, para cortar también lo que lance.
      child = spawn(cmd, { cwd: existsSync(cwd) ? cwd : undefined, env: { ...process.env, ...env }, shell: IS_WIN ? true : '/bin/sh', windowsHide: true, detached: !IS_WIN })
    } catch (e) {
      done({ ok: false, output: (e as Error).message })
      return
    }
    const timer = setTimeout(() => {
      try {
        if (IS_WIN) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true })
        else process.kill(-child.pid!, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
      done({ ok: false, output: `${out}\n${tr('Cortado: pasó de {n} s', { n: timeoutSec })}`.trim() })
    }, timeoutSec * 1000)
    child.stdout?.on('data', add)
    child.stderr?.on('data', add)
    child.on('error', (e) => {
      clearTimeout(timer)
      done({ ok: false, output: `${out}\n${e.message}`.trim() })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ ok: code === 0, output: out.trim() })
    })
  })
}

/** Lanza los hooks de los mods encendidos (y con permiso) para un suceso. */
export async function fireHooks(on: ModHookEvent, data: { projectId: string; ok?: boolean; task?: Pick<Task, 'title' | 'status' | 'result' | 'agentId'> }): Promise<void> {
  if (!dataDir) return
  const proj = projectInfo(data.projectId)
  for (const x of listMods()) {
    if (!x.enabled || !x.hooksAllowed) continue
    for (const h of x.hooks.filter((k) => k.on === on)) {
      const modDir = join(modsRoot(), x.name)
      const env = hookEnv(on, { ...data, projectName: proj?.name, projectDir: proj?.dir }, modDir)
      const r = await runHookCommand(h.run, proj?.dir ?? modDir, env, h.timeout)
      const reg = readReg()
      const s = reg.find((k) => k.name === x.name)
      if (s) {
        s.lastHook = { at: Date.now(), on, ok: r.ok, output: r.output.slice(-MAX_OUTPUT) }
        writeReg(reg)
      }
    }
  }
}

/** Qué hook toca para un suceso del motor (o null). */
export function hookFor(e: CoworkEvent, seen: Map<string, string>): { on: ModHookEvent; projectId: string; ok?: boolean; task?: Task } | null {
  if (e.kind === 'run.started') return { on: 'request.started', projectId: e.projectId }
  if (e.kind === 'run.finished') return { on: 'request.finished', projectId: e.projectId, ok: e.ok }
  if (e.kind === 'task.upsert') {
    const t = e.task
    const before = seen.get(t.id)
    if (before === t.status) return null
    seen.set(t.id, t.status)
    if (seen.size > 2000) seen.delete(seen.keys().next().value!)
    if (t.status === 'running') return { on: 'task.started', projectId: t.projectId, task: t }
    if (t.status === 'done') return { on: 'task.done', projectId: t.projectId, task: t }
    if (t.status === 'failed') return { on: 'task.failed', projectId: t.projectId, task: t }
  }
  return null
}

export function initMods(dir: string, opts: { project?: (id: string) => { name: string; dir: string } | null } = {}): void {
  dataDir = dir
  if (opts.project) projectInfo = opts.project
  untap?.()
  const seen = new Map<string, string>()
  // Los hooks van en segundo plano: nunca frenan ni rompen una tarea.
  untap = tapEvents((e) => {
    const h = hookFor(e, seen)
    if (h) void fireHooks(h.on, h).catch((err) => console.warn('[cowork] hook de mod', err))
  })
}

/**
 * La respuesta con la que se sirve un panel (cowork://mod/<mod>/<panel> en la app, /api/mod-panel/… en la web): su
 * propia política de seguridad y «sandbox», así que no hereda la de kywai ni puede usar su sesión.
 */
export function modPanelResponse(pathname: string): { status: number; body: string; headers: Record<string, string> } {
  const [name, panelId] = pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s))
  try {
    const p = modPanelHtml(name, panelId)
    return {
      status: 200,
      body: p.html,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `${p.csp}; sandbox allow-scripts allow-forms`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }
    }
  } catch (e) {
    return { status: 404, body: (e as Error).message, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  }
}

/**
 * En Órbita el panel es la página principal de un WebView: no hay ventana madre y `parent.postMessage` le llegaría a
 * sí mismo. Este guion (lo primero que corre) manda las peticiones del panel («context» sin datos y «send») al
 * puente `KywaiBridge` de la app; el contexto que manda Órbita entra como un mensaje normal.
 */
export const ANDROID_BRIDGE =
  "<script>(function(){if(window.parent!==window||!window.KywaiBridge)return;var post=window.postMessage.bind(window);" +
  "window.postMessage=function(d,o){if(d&&d.kywai==='send'){KywaiBridge.send(String(d.text==null?'':d.text));return}" +
  "if(d&&d.kywai==='context'&&!('tasks' in d)){KywaiBridge.context();return}post(d,o||'*')}})()</script>"

export function withAndroidBridge(html: string): string {
  // Justo después de la política de seguridad que puso modPanelHtml (siempre la primera <meta>).
  const i = html.search(/<meta http-equiv="Content-Security-Policy"[^>]*>/i)
  if (i < 0) return ANDROID_BRIDGE + html
  const end = html.indexOf('>', i) + 1
  return html.slice(0, end) + ANDROID_BRIDGE + html.slice(end)
}

// ---------- Instalar y quitar ----------

function install(files: Map<string, Buffer>, source: string): ModInfo[] {
  const text = files.get(MANIFEST)?.toString('utf8')
  if (text === undefined) throw new Error(tr('Esa carpeta no tiene {file}', { file: MANIFEST }))
  const m = parseManifest(text, (rel) => files.has(rel))
  let total = 0
  for (const b of files.values()) total += b.length
  if (total > MAX_MOD_BYTES) throw new Error(tr('El mod es demasiado grande'))
  const target = join(modsRoot(), m.name)
  rmSync(target, { recursive: true, force: true })
  for (const [rel, data] of files) {
    const abs = safeJoin(target, rel)
    if (!abs) continue
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, data)
  }
  const reg = readReg()
  const prev = reg.find((x) => x.name === m.name)
  const next: Stored = { name: m.name, source, enabled: prev?.enabled ?? true, ...(prev?.hooksApproved ? { hooksApproved: prev.hooksApproved } : {}) }
  writeReg(prev ? reg.map((x) => (x.name === m.name ? next : x)) : [...reg, next])
  return listMods()
}

function need(): void {
  if (!dataDir) throw new Error(tr('Los mods no están disponibles'))
}

/** Desde un enlace de GitHub a la carpeta del mod (o al repositorio, si el manifiesto está en la raíz). */
export async function installModLink(url: unknown): Promise<ModInfo[]> {
  need()
  if (typeof url !== 'string') throw new Error(tr('Datos no válidos'))
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*?))?)?\/?$/i.exec(url.trim())
  if (!m) throw new Error(tr('Pega un enlace de GitHub (https://github.com/dueño/repositorio)'))
  const path = (m[4] ?? '').replace(/\/?kywai-mod\.json$/, '').replace(/\/+$/, '')
  if (path.split('/').includes('..')) throw new Error(tr('Datos no válidos'))
  const src: PluginSource = { repo: `${m[1]}/${m[2]}`, ref: m[3] ?? 'HEAD', path }
  const files = await downloadFolder(src)
  return install(files, `https://github.com/${src.repo}${path ? `/tree/${src.ref}/${path}` : ''}`)
}

/** Desde una carpeta de este equipo (para probar un mod que estás haciendo). */
export function installModFolder(folder: unknown): ModInfo[] {
  need()
  if (typeof folder !== 'string' || !folder.trim()) throw new Error(tr('Datos no válidos'))
  const root = resolve(folder.trim())
  if (!existsSync(join(root, MANIFEST))) throw new Error(tr('Esa carpeta no tiene {file}', { file: MANIFEST }))
  const files = new Map<string, Buffer>()
  const walk = (dir: string, depth: number): void => {
    if (depth > 6) return
    for (const n of readdirSync(dir)) {
      if (n === '.git' || n === 'node_modules') continue
      const abs = join(dir, n)
      const st = statSync(abs)
      if (st.isDirectory()) walk(abs, depth + 1)
      else if (st.isFile() && st.size <= MAX_MOD_BYTES) {
        if (files.size >= 500) throw new Error(tr('El mod es demasiado grande'))
        files.set(relative(root, abs).split(sep).join('/'), readFileSync(abs))
      }
    }
  }
  walk(root, 0)
  return install(files, root)
}

export function removeMod(name: unknown): ModInfo[] {
  need()
  const reg = readReg()
  if (!reg.some((x) => x.name === name)) throw new Error(tr('Ese mod ya no está'))
  const dir = safeJoin(modsRoot(), String(name))
  if (dir) rmSync(dir, { recursive: true, force: true })
  writeReg(reg.filter((x) => x.name !== name))
  return listMods()
}

export function setModEnabled(name: unknown, enabled: unknown): ModInfo[] {
  need()
  const reg = readReg()
  const s = reg.find((x) => x.name === name)
  if (!s) throw new Error(tr('Ese mod ya no está'))
  s.enabled = !!enabled
  writeReg(reg)
  return listMods()
}

/** Das (o quitas) permiso a los hooks del mod tal como están ahora. */
export function allowModHooks(name: unknown, allow: unknown): ModInfo[] {
  need()
  const reg = readReg()
  const s = reg.find((x) => x.name === name)
  const m = s ? manifestOf(s.name) : null
  if (!s || !m) throw new Error(tr('Ese mod ya no está'))
  if (allow) s.hooksApproved = hooksHash(m.hooks)
  else delete s.hooksApproved
  writeReg(reg)
  return listMods()
}

/**
 * El HTML de un panel, listo para una caja aislada: sin acceso a internet (salvo el permiso «network») ni a nada de
 * la app. Las imágenes, estilos y scripts del mod van dentro (como data:) si los cita con una ruta relativa.
 */
export function modPanelHtml(name: unknown, panelId: unknown): { html: string; title: string; chat: boolean; csp: string } {
  need()
  const x = listMods().find((k) => k.name === name)
  if (!x || !x.enabled) throw new Error(tr('Ese mod ya no está'))
  const p = x.panels.find((k) => k.id === panelId)
  const dir = join(modsRoot(), x.name)
  const file = p ? safeJoin(dir, p.file) : null
  if (!p || !file || !existsSync(file)) throw new Error(tr('Ese panel ya no está'))
  let html = readFileSync(file, 'utf8')
  const base = join(file, '..')
  const MIME: Record<string, string> = { js: 'text/javascript', css: 'text/css', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp', json: 'application/json' }
  html = html.replace(/(\s(?:src|href)=)(["'])(?!https?:|data:|#|\/\/)([^"']+)\2/gi, (all, attr: string, q: string, rel: string) => {
    const abs = safeJoin(dir, relative(dir, join(base, rel)))
    const ext = rel.split('.').pop()?.toLowerCase() ?? ''
    if (!abs || !MIME[ext] || !existsSync(abs) || statSync(abs).size > 2_000_000) return all
    return `${attr}${q}data:${MIME[ext]};base64,${readFileSync(abs).toString('base64')}${q}`
  })
  const net = x.permissions.includes('network')
  const csp = net
    ? "default-src 'none'; script-src 'unsafe-inline' data: https:; style-src 'unsafe-inline' data: https:; img-src data: https:; font-src data: https:; connect-src https:; media-src data: https:; form-action 'none'; base-uri 'none'"
    : "default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline' data:; img-src data:; font-src data:; media-src data:; form-action 'none'; base-uri 'none'"
  const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`
  // Lo primero del documento (antes de cualquier script suyo), así vale para todo.
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html)
  html = doctype ? `${doctype[0]}${meta}${html.slice(doctype[0].length)}` : `${meta}${html}`
  return { html, title: p.title, chat: x.permissions.includes('chat'), csp }
}
