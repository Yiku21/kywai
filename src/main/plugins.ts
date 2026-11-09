// Plugins (⚙ → Ajustes → Extensiones → Plugins): paquetes con el formato de los plugins de Claude Code. Un plugin es
// una carpeta con, entre otras cosas:
//   - skills/<nombre>/SKILL.md     → se copian a «habilidades» (las ven todos los agentes);
//   - commands/<nombre>.md         → órdenes de Claude Code («/nombre»): pasan a ser habilidades «plugin-nombre»;
//   - agents/<nombre>.md           → subagentes de Claude Code: también pasan a ser habilidades;
//   - .mcp.json (o mcpServers en .claude-plugin/plugin.json) → servidores MCP, apagados hasta que los enciendas;
//   - hooks, servidores de lenguaje (LSP)… → kywai no los usa (los cambios de comportamiento son los mods).
// Los catálogos son los «marketplaces» de Claude Code (.claude-plugin/marketplace.json): el oficial de Anthropic y el
// de plugins de trabajo, más los que añadas con un enlace. Cada plugin se descarga entero de GitHub en un solo
// archivo (.tar.gz, sin el límite de consultas de su API) y se guarda en la carpeta de datos (plugins/<nombre>), así
// que sus servidores locales (${CLAUDE_PLUGIN_ROOT}/…) funcionan. Nada de lo descargado se ejecuta al instalar.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, relative, sep } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { MCP_ID_RE, MCP_RESERVED_IDS, mcpIdFrom, type McpServerInput, type PluginCatalogItem, type PluginInfo, type PluginSource } from '@shared/extensions'
import { tr } from '@shared/i18n'
import { mcpRegistry, removeMcp, syncGemini } from './extensions'
import { skillsDir, videoSkillsDir } from './skills'
import { isVideoExtension, VIDEO_SKILLS_FOLDER } from '@shared/videoExtensions'

/** Catálogos que salen siempre (los de Anthropic). */
export const DEFAULT_MARKETPLACES = ['anthropics/claude-plugins-official', 'anthropics/knowledge-work-plugins']
/** Catálogos cuyos plugins salen como verificados (los revisa Anthropic). */
const TRUSTED_MARKETPLACES = DEFAULT_MARKETPLACES

const MAX_DOWNLOAD = 60 * 1024 * 1024
const MAX_FILES = 3000
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_PLUGIN_BYTES = 40 * 1024 * 1024
const MAX_PLUGIN_SKILLS = 60
const REPO_RE = /^[\w-][\w.-]*\/(?!\.\.?$)[\w.-]+$/
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const REF_RE = /^[\w./-]{1,100}$/

type Fetch = typeof fetch
let fetcher: Fetch = (...a) => fetch(...a)

/** Para las pruebas: otra forma de descargar. */
export function __setFetchForTests(f: Fetch | null): void {
  fetcher = f ?? ((...a) => fetch(...a))
  marketCache.clear()
  entrySkills.clear()
}

// ---------- Descargar un repositorio (un .tar.gz, leído en memoria) ----------

/** Los archivos de un .tar (ustar, con las cabeceras pax y GNU de nombres largos que usa GitHub). */
export function readTar(tar: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>()
  let off = 0
  let longName: string | null = null
  const str = (b: Buffer): string => {
    const z = b.indexOf(0)
    return b.subarray(0, z < 0 ? b.length : z).toString('utf8')
  }
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512)
    if (h.every((x) => x === 0)) break
    const size = parseInt(str(h.subarray(124, 136)).trim() || '0', 8)
    if (!Number.isFinite(size) || size < 0) break
    const type = String.fromCharCode(h[156] || 48)
    const body = tar.subarray(off + 512, off + 512 + size)
    off += 512 + Math.ceil(size / 512) * 512
    if (type === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))
      if (m) longName = m[1]
      continue
    }
    if (type === 'L') {
      longName = str(body)
      continue
    }
    if (type === 'g') continue
    const prefix = str(h.subarray(345, 500))
    const name = longName ?? (prefix ? `${prefix}/${str(h.subarray(0, 100))}` : str(h.subarray(0, 100)))
    longName = null
    if (type !== '0' && type !== '\0' && type !== '7') continue
    if (files.size >= MAX_FILES) break
    if (size <= MAX_FILE_BYTES) files.set(name, Buffer.from(body))
  }
  return files
}

/** Los archivos de una carpeta de un repositorio de GitHub, con su ruta dentro de esa carpeta. */
export async function downloadFolder(src: PluginSource): Promise<Map<string, Buffer>> {
  if (!REPO_RE.test(src.repo) || !REF_RE.test(src.ref) || src.ref.includes('..')) throw new Error(tr('Datos no válidos'))
  const url = `https://codeload.github.com/${src.repo}/tar.gz/${src.ref.split('/').map(encodeURIComponent).join('/')}`
  let r: Response
  try {
    r = await fetcher(url, { headers: { 'user-agent': 'kywai' }, signal: AbortSignal.timeout(120_000) })
  } catch {
    throw new Error(tr('No se pudo descargar {repo} de GitHub', { repo: src.repo }))
  }
  if (!r.ok) throw new Error(tr('GitHub respondió con un error al descargar {repo} ({code})', { repo: src.repo, code: r.status }))
  const len = Number(r.headers.get('content-length') ?? 0)
  // Repositorio enorme (p. ej. un monorepo): solo la carpeta del plugin, archivo a archivo.
  if (len > MAX_DOWNLOAD) {
    void r.body?.cancel()
    return downloadFolderByFiles(src)
  }
  const gz = Buffer.from(await r.arrayBuffer())
  if (gz.length > MAX_DOWNLOAD) return downloadFolderByFiles(src)
  const all = readTar(gunzipSync(gz, { maxOutputLength: MAX_DOWNLOAD * 4 }))
  // Todo va dentro de «repo-<versión>/»: se quita, y se queda solo la carpeta del plugin.
  const base = src.path ? `${src.path.replace(/^\.?\/+|\/+$/g, '')}/` : ''
  const out = new Map<string, Buffer>()
  for (const [name, data] of all) {
    const rel = name.split('/').slice(1).join('/')
    if (!rel.startsWith(base)) continue
    const inner = rel.slice(base.length)
    if (!inner || inner.split('/').some((p) => p === '..' || p === '.git')) continue
    out.set(inner, data)
  }
  if (!out.size) throw new Error(tr('No se encontró el plugin en {repo}', { repo: src.repo }))
  return out
}

/**
 * La carpeta del plugin sin bajar el repositorio entero: su lista de archivos con la API de GitHub y cada archivo de
 * raw.githubusercontent.com. Para repositorios que pasan del límite de descarga.
 */
async function downloadFolderByFiles(src: PluginSource): Promise<Map<string, Buffer>> {
  const base = src.path.replace(/^\.?\/+|\/+$/g, '')
  const api = `https://api.github.com/repos/${src.repo}`
  const json = async (url: string): Promise<unknown> => {
    const r = await fetcher(url, { headers: { 'user-agent': 'kywai', accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(tr('GitHub respondió con un error al descargar {repo} ({code})', { repo: src.repo, code: r.status }))
    return r.json()
  }
  // El árbol solo de la carpeta del plugin (el del repositorio entero puede venir cortado).
  let sha = src.ref
  if (base) {
    const parent = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : ''
    const list = (await json(`${api}/contents/${parent.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(src.ref)}`)) as { name?: string; type?: string; sha?: string }[]
    const entry = Array.isArray(list) ? list.find((x) => x.type === 'dir' && x.name === base.split('/').pop()) : undefined
    if (!entry?.sha) throw new Error(tr('No se encontró el plugin en {repo}', { repo: src.repo }))
    sha = entry.sha
  }
  const tree = (await json(`${api}/git/trees/${encodeURIComponent(sha)}?recursive=1`)) as { tree?: { path?: string; type?: string; size?: number }[] }
  const blobs = (tree.tree ?? []).filter((x) => x.type === 'blob' && typeof x.path === 'string' && (x.size ?? 0) <= MAX_FILE_BYTES && !x.path.split('/').some((p) => p === '..' || p === '.git'))
  if (blobs.length > MAX_FILES) throw new Error(tr('El plugin es demasiado grande'))
  const out = new Map<string, Buffer>()
  let total = 0
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < blobs.length) {
      const b = blobs[next++]
      const path = (base ? `${base}/${b.path}` : b.path!).split('/').map(encodeURIComponent).join('/')
      const r = await fetcher(`https://raw.githubusercontent.com/${src.repo}/${encodeURIComponent(src.ref)}/${path}`, { headers: { 'user-agent': 'kywai' }, signal: AbortSignal.timeout(60_000) })
      if (!r.ok) throw new Error(tr('No se pudo descargar {repo} de GitHub', { repo: src.repo }))
      const data = Buffer.from(await r.arrayBuffer())
      total += data.length
      if (total > MAX_PLUGIN_BYTES) throw new Error(tr('El plugin es demasiado grande'))
      out.set(b.path!, data)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  if (!out.size) throw new Error(tr('No se encontró el plugin en {repo}', { repo: src.repo }))
  return out
}

// ---------- Catálogos (marketplaces) ----------

interface MarketEntry {
  name?: string
  displayName?: string
  description?: string
  category?: string
  homepage?: string
  author?: { name?: string } | string
  source?: string | { source?: string; url?: string; repo?: string; path?: string; ref?: string; sha?: string }
}

const marketCache = new Map<string, { at: number; items: PluginCatalogItem[] }>()
/** Las skills que la ficha del catálogo dice que trae cada plugin (catálogo/nombre → rutas). */
const entrySkills = new Map<string, unknown>()
const CACHE_MS = 60 * 60_000

/** owner/repo de una dirección de GitHub («https://github.com/a/b.git» → a/b), o null. */
export function githubRepoOf(url: string): string | null {
  const m = /^(?:https?:\/\/|git@)?(?:www\.)?github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(url.trim()) ?? /^([\w.-]+)\/([\w.-]+)$/.exec(url.trim())
  const repo = m ? `${m[1]}/${m[2]}` : ''
  return REPO_RE.test(repo) ? repo : null
}

/** Dónde está un plugin de un catálogo: en el propio repositorio del catálogo o en otro de GitHub. */
export function resolveSource(entry: MarketEntry, marketRepo: string): PluginSource | null {
  const s = entry.source
  const clean = (p: string | undefined): string => (p ?? '').replace(/^\.?\/+/, '').replace(/\/+$/, '')
  const safe = (p: string): boolean => !p.split('/').includes('..')
  if (typeof s === 'string') {
    const path = clean(s)
    return s.startsWith('./') && safe(path) ? { repo: marketRepo, ref: 'HEAD', path } : null
  }
  if (!s || typeof s !== 'object') return null
  const repo = s.source === 'github' ? (s.repo && REPO_RE.test(s.repo) ? s.repo : null) : s.url ? githubRepoOf(s.url) : null
  if (!repo) return null
  const ref = s.sha && /^[0-9a-f]{7,40}$/i.test(s.sha) ? s.sha : s.ref && REF_RE.test(s.ref) && !s.ref.includes('..') ? s.ref : 'HEAD'
  const path = s.source === 'git-subdir' ? clean(s.path) : clean(s.path)
  return safe(path) ? { repo, ref, path } : null
}

/** Las fichas de un catálogo (su .claude-plugin/marketplace.json), guardadas una hora. */
export async function loadMarketplace(repo: string): Promise<PluginCatalogItem[]> {
  const hit = marketCache.get(repo)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items
  if (!REPO_RE.test(repo)) throw new Error(tr('Datos no válidos'))
  const r = await fetcher(`https://raw.githubusercontent.com/${repo}/HEAD/.claude-plugin/marketplace.json`, { headers: { 'user-agent': 'kywai' }, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(tr('{repo} no tiene un catálogo de plugins (.claude-plugin/marketplace.json)', { repo }))
  const data = (await r.json()) as { plugins?: MarketEntry[] }
  const verified = TRUSTED_MARKETPLACES.includes(repo.toLowerCase())
  const items: PluginCatalogItem[] = []
  for (const e of Array.isArray(data.plugins) ? data.plugins : []) {
    if (!e?.name || !NAME_RE.test(e.name)) continue
    const author = typeof e.author === 'string' ? e.author : e.author?.name
    if ((e as { skills?: unknown }).skills) entrySkills.set(`${repo}/${e.name}`, (e as { skills?: unknown }).skills)
    items.push({
      name: e.name,
      title: String(e.displayName || e.name).slice(0, 80),
      description: String(e.description ?? '').slice(0, 400),
      ...(e.category ? { category: String(e.category).slice(0, 40) } : {}),
      ...(author ? { author: String(author).slice(0, 80) } : {}),
      ...(typeof e.homepage === 'string' && /^https:\/\//.test(e.homepage) ? { homepage: e.homepage } : {}),
      marketplace: repo,
      verified,
      source: resolveSource(e, repo)
    })
  }
  marketCache.set(repo, { at: Date.now(), items })
  return items
}

// ---------- Registro de plugins instalados ----------

interface Stored {
  plugins: PluginInfo[]
  marketplaces: string[]
}

let dataDir = ''

export function initPlugins(dir: string): void {
  dataDir = dir
}

const regFile = (): string => join(dataDir, 'plugins.json')
const pluginsRoot = (): string => join(dataDir, 'plugins')

function readReg(): Stored {
  try {
    const d = JSON.parse(readFileSync(regFile(), 'utf8')) as Partial<Stored>
    return { plugins: Array.isArray(d.plugins) ? d.plugins.filter((p) => p && NAME_RE.test(p.name)) : [], marketplaces: Array.isArray(d.marketplaces) ? d.marketplaces.filter((m) => REPO_RE.test(m)) : [] }
  } catch {
    return { plugins: [], marketplaces: [] }
  }
}

function writeReg(s: Stored): void {
  mkdirSync(dataDir, { recursive: true })
  const tmp = `${regFile()}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8')
  renameSync(tmp, regFile())
}

function safeJoin(root: string, rel: string): string | null {
  const abs = normalize(join(root, rel))
  const r = relative(root, abs)
  return !r || r.startsWith('..') || r.includes(`..${sep}`) ? null : abs
}

// ---------- Instalar ----------

/** Encabezado «--- name / description ---» de un .md. */
function frontmatter(text: string): Record<string, string> {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const out: Record<string, string> = {}
  for (const line of (m?.[1] ?? '').split(/\r?\n/)) {
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line)
    if (kv) out[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const body = (text: string): string => text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

/** Un nombre de carpeta seguro para «habilidades». */
const skillName = (s: string): string => s.replace(/[^\p{L}\p{N} ._-]/gu, '-').replace(/^[\s.]+/, '').slice(0, 64) || 'habilidad'

/** Lo que trae un plugin, leído de sus archivos (sin instalar nada). */
export interface PluginPlan {
  name: string
  title: string
  description: string
  version?: string
  /** Carpetas de skills (ruta dentro del plugin). */
  skillDirs: string[]
  /** commands/*.md y agents/*.md. */
  commands: string[]
  agents: string[]
  mcp: Record<string, Record<string, unknown>>
  skipped: string[]
}

function json(files: Map<string, Buffer>, path: string): Record<string, unknown> | null {
  const b = files.get(path)
  if (!b) return null
  try {
    const v = JSON.parse(b.toString('utf8')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function planPlugin(files: Map<string, Buffer>, fallbackName: string, entry?: { skills?: unknown }): PluginPlan {
  const manifest = json(files, '.claude-plugin/plugin.json') ?? {}
  const rawName = typeof manifest.name === 'string' && NAME_RE.test(manifest.name) ? manifest.name : fallbackName
  const name = rawName.toLowerCase()
  const paths = [...files.keys()]
  const listed = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []).map((p) => p.replace(/^\.?\/+|\/+$/g, ''))
  // Skills: las de skills/ (o las carpetas que diga el manifiesto o el catálogo) con su SKILL.md.
  // Si no hay carpeta skills/ ni lista, el plugin es una carpeta de skills: valen todas.
  const named = [...listed(manifest.skills), ...listed(entry?.skills)]
  const anywhere = !named.length && !paths.some((p) => p.startsWith('skills/'))
  const skillRoots = ['skills', ...named]
  const skillDirs = [...new Set(paths.filter((p) => p.endsWith('/SKILL.md') || p === 'SKILL.md').map((p) => p.replace(/\/?SKILL\.md$/, '')))]
    .filter((d) => anywhere || skillRoots.some((r) => d === r || d.startsWith(`${r}/`)))
    .filter((d) => !/(^|\/)(node_modules|tests?|__tests__|fixtures|examples?)(\/|$)/.test(d))
    .filter((d, _i, all) => !all.some((o) => o !== d && o !== '' && d.startsWith(`${o}/`)))
  const mdIn = (dir: string): string[] => paths.filter((p) => p.startsWith(`${dir}/`) && p.endsWith('.md') && !/(^|\/)README\.md$/i.test(p))
  const commands = [...mdIn('commands'), ...listed(manifest.commands).flatMap((c) => (c.endsWith('.md') ? [c] : mdIn(c)))].filter((p, i, a) => files.has(p) && a.indexOf(p) === i)
  const agents = [...mdIn('agents'), ...listed(manifest.agents).flatMap((c) => (c.endsWith('.md') ? [c] : mdIn(c)))].filter((p, i, a) => files.has(p) && a.indexOf(p) === i)
  // Servidores MCP: .mcp.json, o mcpServers en el manifiesto (un objeto o la ruta de un .json).
  let mcpSrc: unknown = json(files, '.mcp.json')
  if (manifest.mcpServers) mcpSrc = typeof manifest.mcpServers === 'string' ? json(files, manifest.mcpServers.replace(/^\.?\/+/, '')) : manifest.mcpServers
  const mcpObj = (mcpSrc && typeof mcpSrc === 'object' ? ((mcpSrc as { mcpServers?: unknown }).mcpServers ?? mcpSrc) : {}) as Record<string, unknown>
  const mcp: PluginPlan['mcp'] = {}
  for (const [k, v] of Object.entries(mcpObj)) if (v && typeof v === 'object' && !Array.isArray(v)) mcp[k] = v as Record<string, unknown>
  const skipped: string[] = []
  if (manifest.hooks || files.has('hooks/hooks.json')) skipped.push(tr('hooks (llegarán con los mods)'))
  if (manifest.lspServers || files.has('.lsp.json')) skipped.push(tr('servidores de lenguaje (LSP)'))
  if (manifest.outputStyles || paths.some((p) => p.startsWith('output-styles/'))) skipped.push(tr('estilos de respuesta'))
  return {
    name,
    title: typeof manifest.displayName === 'string' ? manifest.displayName.slice(0, 80) : rawName,
    description: typeof manifest.description === 'string' ? manifest.description.slice(0, 400) : '',
    ...(typeof manifest.version === 'string' ? { version: manifest.version.slice(0, 40) } : {}),
    skillDirs,
    commands,
    agents,
    mcp,
    skipped
  }
}

/** Un servidor de .mcp.json en el formato de kywai (o el motivo para no añadirlo). */
export function mcpInputOf(key: string, cfg: Record<string, unknown>, pluginName: string, pluginDir: string, taken: Set<string>): McpServerInput | string {
  const sub = (v: string): string => v.split('${CLAUDE_PLUGIN_ROOT}').join(pluginDir)
  const strMap = (v: unknown): Record<string, string> =>
    Object.fromEntries(
      Object.entries(v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
        .filter(([, x]) => typeof x === 'string')
        // «${TOKEN}» (o «Bearer ${TOKEN}») es una clave que pones tú: se deja vacía para rellenarla.
        .map(([k, x]) => [k, /\$\{[A-Za-z_][A-Za-z0-9_]*(:-[^}]*)?\}/.test(x as string) ? '' : sub(x as string)])
    )
  let id = mcpIdFrom(key) || 'mcp'
  if (!MCP_ID_RE.test(id)) id = 'mcp'
  if (MCP_RESERVED_IDS.includes(id) || taken.has(id)) id = mcpIdFrom(`${pluginName}-${id}`).slice(0, 31)
  for (let n = 2; taken.has(id) || MCP_RESERVED_IDS.includes(id); n++) id = `${id.slice(0, 28)}-${n}`
  const title = `${key} (${pluginName})`.slice(0, 80)
  const type = typeof cfg.type === 'string' ? cfg.type : cfg.url ? 'http' : 'stdio'
  if (type === 'sse') return tr('{name}: solo funciona por SSE', { name: key })
  if (type === 'http' || type === 'streamable-http') {
    if (typeof cfg.url !== 'string') return tr('{name}: no dice su dirección', { name: key })
    if (cfg.oauth) return tr('{name}: pide iniciar sesión en el navegador, que kywai aún no admite', { name: key })
    return { id, title, transport: 'http', url: sub(cfg.url), headers: strMap(cfg.headers), plugin: pluginName }
  }
  if (typeof cfg.command !== 'string' || !cfg.command) return tr('{name}: no dice cómo arrancarlo', { name: key })
  const args = Array.isArray(cfg.args) ? cfg.args.filter((a): a is string => typeof a === 'string').map(sub) : []
  return { id, title, transport: 'stdio', command: sub(cfg.command), args, env: strMap(cfg.env), plugin: pluginName }
}

/** Escribe los archivos de una carpeta (rel → contenido) dentro de target. */
function writeFolder(target: string, files: Array<[string, Buffer]>): void {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const [rel, data] of files) {
    const abs = safeJoin(target, rel)
    if (!abs) continue
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, data)
  }
}

/** Instala un plugin ya descargado: guarda sus archivos, copia sus habilidades y añade sus servidores MCP. */
export async function installFiles(files: Map<string, Buffer>, source: PluginSource, opts: { fallbackName: string; entry?: { skills?: unknown; title?: string; description?: string }; skills: string; probe?: boolean }): Promise<PluginInfo> {
  const plan = planPlugin(files, opts.fallbackName, opts.entry)
  // Sin manifiesto: el nombre y la descripción de su ficha del catálogo.
  if (plan.title === opts.fallbackName && opts.entry?.title) plan.title = opts.entry.title
  if (!plan.description && opts.entry?.description) plan.description = opts.entry.description
  if (!plan.skillDirs.length && !plan.commands.length && !plan.agents.length && !Object.keys(plan.mcp).length) throw new Error(tr('Ese plugin no trae nada que kywai pueda usar (habilidades, comandos ni servidores MCP)'))
  let total = 0
  for (const b of files.values()) total += b.length
  if (total > MAX_PLUGIN_BYTES) throw new Error(tr('El plugin es demasiado grande'))
  // Los plugins de vídeo dejan sus habilidades en la carpeta del estudio de vídeo (las usa el guion de los vídeos).
  const video = isVideoExtension(plan.name, plan.title, plan.description)
  const skillsTarget = video ? join(opts.skills, VIDEO_SKILLS_FOLDER) : opts.skills
  const reg = readReg()
  const previous = reg.plugins.find((p) => p.name === plan.name)
  // Al reinstalar, sus servidores MCP se conservan (con sus claves y sus agentes) si siguen en el plugin.
  if (previous) uninstall(previous, true)

  // 1. Sus archivos, enteros, en la carpeta de datos (los servidores locales los usan).
  const pluginDir = join(pluginsRoot(), plan.name)
  writeFolder(pluginDir, [...files])

  // 2. Habilidades: sus skills, y sus comandos y subagentes convertidos en skills.
  const skills: string[] = []
  const owned = new Set(reg.plugins.flatMap((p) => p.skills))
  const place = (wanted: string): string => {
    let n = skillName(wanted)
    if (existsSync(join(skillsTarget, n)) || skills.includes(n) || owned.has(n)) n = skillName(`${plan.name}-${wanted}`)
    for (let i = 2; existsSync(join(skillsTarget, n)) || skills.includes(n); i++) n = skillName(`${plan.name}-${wanted}-${i}`)
    return n
  }
  for (const dir of plan.skillDirs) {
    if (skills.length >= MAX_PLUGIN_SKILLS) break
    const md = files.get(dir ? `${dir}/SKILL.md` : 'SKILL.md')!.toString('utf8')
    const name = place(frontmatter(md).name || dir.split('/').pop() || plan.name)
    const prefix = dir ? `${dir}/` : ''
    const own = [...files].filter(([p]) => p.startsWith(prefix) && (dir || !p.includes('/') || p.startsWith('scripts/') || p.startsWith('references/'))).map(([p, b]): [string, Buffer] => [p.slice(prefix.length), b])
    writeFolder(join(skillsTarget, name), own)
    skills.push(name)
  }
  const fromMd = (path: string, kind: 'command' | 'agent'): void => {
    if (skills.length >= MAX_PLUGIN_SKILLS) return
    const text = files.get(path)!.toString('utf8')
    const fm = frontmatter(text)
    const base = path.split('/').pop()!.replace(/\.md$/, '')
    const name = place(`${plan.name}-${fm.name || base}`.replace(new RegExp(`^${plan.name}-${plan.name}-`), `${plan.name}-`))
    const what = kind === 'command' ? tr('Orden «/{name}» del plugin {plugin}', { name: base, plugin: plan.title }) : tr('Subagente «{name}» del plugin {plugin}', { name: fm.name || base, plugin: plan.title })
    const desc = (fm.description || what).replace(/[\r\n]+/g, ' ').slice(0, 300)
    const note =
      kind === 'command'
        ? tr('Es una orden del plugin {plugin}. Donde ponga $ARGUMENTS van los detalles de la petición.', { plugin: plan.title })
        : tr('Es un subagente del plugin {plugin}: sigue estas instrucciones como si fueras él.', { plugin: plan.title })
    const skill = `---\nname: ${name}\ndescription: ${JSON.stringify(desc)}\n---\n\n> ${note}\n\n${body(text).trim()}\n`
    writeFolder(join(skillsTarget, name), [['SKILL.md', Buffer.from(skill, 'utf8')]])
    skills.push(name)
  }
  for (const p of plan.commands) fromMd(p, 'command')
  for (const p of plan.agents) fromMd(p, 'agent')

  // 3. Servidores MCP: apagados (los enciendes por agente en «Servidores MCP»). Los remotos se prueban antes: si piden
  //    iniciar sesión en el navegador no sirven aún y no se añaden.
  const mcp: string[] = []
  const skipped = [...plan.skipped]
  const registry = mcpRegistry()
  if (Object.keys(plan.mcp).length) {
    if (!registry) skipped.push(tr('servidores MCP (las extensiones no están disponibles)'))
    else {
      const mine = registry.list().filter((s) => s.plugin === plan.name)
      const taken = new Set(registry.list().filter((s) => s.plugin !== plan.name).map((s) => s.id))
      for (const [key, cfg] of Object.entries(plan.mcp)) {
        const input = mcpInputOf(key, cfg, plan.name, pluginDir, taken)
        if (typeof input === 'string') {
          skipped.push(input)
          continue
        }
        const before = mine.find((s) => s.title === input.title)
        if (before) input.id = before.id
        if (input.transport === 'http' && opts.probe !== false && !Object.keys(input.headers ?? {}).length && (await needsLogin(input.url!))) {
          skipped.push(tr('{name}: pide iniciar sesión en el navegador, que kywai aún no admite', { name: key }))
          continue
        }
        try {
          registry.save(input, before?.id)
          taken.add(input.id)
          mcp.push(input.id)
        } catch (e) {
          skipped.push(`${key}: ${(e as Error).message}`)
        }
      }
      // Los que traía antes y ya no trae se quitan.
      for (const s of mine) if (!mcp.includes(s.id)) registry.remove(s.id)
      syncGemini()
    }
  }

  const info: PluginInfo = {
    name: plan.name,
    title: plan.title,
    description: plan.description,
    ...(plan.version ? { version: plan.version } : {}),
    source,
    skills,
    mcp,
    skipped,
    installedAt: new Date().toISOString(),
    ...(video ? { video: true } : {})
  }
  const fresh = readReg()
  writeReg({ ...fresh, plugins: [...fresh.plugins.filter((p) => p.name !== info.name), info] })
  return info
}

/** Un servidor remoto sin claves que responde 401/403: solo admite iniciar sesión en el navegador (OAuth). */
async function needsLogin(url: string): Promise<boolean> {
  try {
    const r = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'kywai', version: '1' } } }),
      signal: AbortSignal.timeout(15_000)
    })
    void r.body?.cancel()
    return r.status === 401 || r.status === 403
  } catch {
    return false
  }
}

/** Quita lo que trajo un plugin (sus habilidades, sus servidores y sus archivos). No toca el registro. */
function uninstall(p: PluginInfo, keepMcp = false): void {
  const dir = p.video ? videoSkillsDir() : skillsDir()
  for (const s of p.skills) {
    const abs = dir ? safeJoin(dir, s) : null
    if (abs) rmSync(abs, { recursive: true, force: true })
  }
  const registry = mcpRegistry()
  for (const id of keepMcp ? [] : p.mcp) {
    if (registry?.list().some((s) => s.id === id && s.plugin === p.name)) removeMcp(id)
  }
  const pd = safeJoin(pluginsRoot(), p.name)
  if (pd) rmSync(pd, { recursive: true, force: true })
}

// ---------- Lo que usa la interfaz ----------

export function listPlugins(): PluginInfo[] {
  return dataDir ? readReg().plugins : []
}

export function marketplaces(): string[] {
  return [...DEFAULT_MARKETPLACES, ...(dataDir ? readReg().marketplaces : [])]
}

/** Busca en todos los catálogos (sin texto: todos, los verificados primero). */
export async function pluginCatalog(query: unknown): Promise<{ items: PluginCatalogItem[]; errors: string[]; marketplaces: string[] }> {
  const q = typeof query === 'string' ? query.trim().toLowerCase().slice(0, 100) : ''
  const errors: string[] = []
  const lists = await Promise.all(
    marketplaces().map((m) =>
      loadMarketplace(m).catch((e: Error) => {
        errors.push(`${m}: ${e.message}`)
        return [] as PluginCatalogItem[]
      })
    )
  )
  const seen = new Set<string>()
  const items = lists.flat().filter((x) => {
    const key = `${x.marketplace}/${x.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return !q || [x.name, x.title, x.description, x.category ?? '', x.author ?? ''].some((f) => f.toLowerCase().includes(q))
  })
  items.sort((a, b) => Number(b.verified) - Number(a.verified))
  return { items: items.slice(0, 2000), errors, marketplaces: marketplaces() }
}

function need(): string {
  const s = skillsDir()
  if (!dataDir || !s) throw new Error(tr('Los plugins no están disponibles'))
  return s
}

/** Instala un plugin de un catálogo. */
export async function installCatalogPlugin(marketplace: unknown, name: unknown): Promise<PluginInfo[]> {
  const skills = need()
  if (typeof marketplace !== 'string' || typeof name !== 'string' || !marketplaces().includes(marketplace)) throw new Error(tr('Datos no válidos'))
  const item = (await loadMarketplace(marketplace)).find((x) => x.name === name)
  if (!item) throw new Error(tr('Ese plugin ya no está en el catálogo'))
  if (!item.source) throw new Error(tr('Ese plugin no está en GitHub: kywai aún no sabe descargarlo'))
  const files = await downloadFolder(item.source)
  await installFiles(files, item.source, { fallbackName: item.name, skills, entry: { skills: entrySkills.get(`${marketplace}/${item.name}`), title: item.title, description: item.description } })
  return listPlugins()
}

/**
 * Un enlace de GitHub: si es un catálogo (marketplace.json) se añade a la lista; si es un plugin, se instala.
 * Devuelve qué fue.
 */
export async function addPluginLink(url: unknown): Promise<{ kind: 'marketplace' | 'plugin'; name: string; plugins: PluginInfo[] }> {
  const skills = need()
  if (typeof url !== 'string') throw new Error(tr('Datos no válidos'))
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.*?))?)?\/?$/i.exec(url.trim()) ?? /^([\w.-]+)\/([\w.-]+)$/.exec(url.trim())
  const repo = m ? `${m[1]}/${m[2]}` : ''
  if (!m || !REPO_RE.test(repo)) throw new Error(tr('Pega un enlace de GitHub (https://github.com/dueño/repositorio)'))
  const source: PluginSource = { repo, ref: m[3] ?? 'HEAD', path: (m[4] ?? '').replace(/\/+$/, '') }
  if (source.path.split('/').includes('..')) throw new Error(tr('Datos no válidos'))
  if (!source.path) {
    // ¿Es un catálogo? Entonces se añade y sus plugins salen en la lista.
    try {
      await loadMarketplace(repo)
      const reg = readReg()
      if (!marketplaces().includes(repo)) writeReg({ ...reg, marketplaces: [...reg.marketplaces, repo] })
      return { kind: 'marketplace', name: repo, plugins: listPlugins() }
    } catch {
      /* no es un catálogo: un plugin */
    }
  }
  const files = await downloadFolder(source)
  const info = await installFiles(files, source, { fallbackName: (source.path.split('/').pop() || m[2]).toLowerCase(), skills })
  return { kind: 'plugin', name: info.name, plugins: listPlugins() }
}

export function removePlugin(name: unknown): PluginInfo[] {
  need()
  const reg = readReg()
  const p = reg.plugins.find((x) => x.name === name)
  if (!p) throw new Error(tr('Ese plugin ya no está'))
  uninstall(p)
  writeReg({ ...reg, plugins: reg.plugins.filter((x) => x.name !== p.name) })
  return listPlugins()
}

export function removeMarketplace(repo: unknown): string[] {
  if (!dataDir) throw new Error(tr('Los plugins no están disponibles'))
  const reg = readReg()
  writeReg({ ...reg, marketplaces: reg.marketplaces.filter((m) => m !== repo) })
  marketCache.delete(String(repo))
  return marketplaces()
}
