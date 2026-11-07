// Catálogo de Extensiones (⚙ → Ajustes → Extensiones → Catálogo): de dónde salen los servidores MCP y las habilidades
// que se instalan con un clic.
//   - Servidores MCP: el registro oficial de MCP (registry.modelcontextprotocol.io), el directorio abierto del
//     estándar. Cada ficha dice cómo se instala (paquete npm o Python, imagen de Docker o servidor remoto). Cualquiera
//     puede publicar en él: los de un dominio comprobado (com.empresa/…) salen como verificados y primero.
//   - Habilidades: el buscador de skills.sh (el directorio grande de skills, el mismo formato para Claude, Codex y
//     Gemini) y cualquier repositorio de GitHub con carpetas que tengan su SKILL.md. Se copian a la carpeta
//     «habilidades» de kywai, que ya ven todos los agentes.
// Lo que llega de fuera son datos: nada de aquí se ejecuta al buscar, y al instalar un servidor se enseña antes la
// orden y sus claves para revisarlas.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, relative, sep } from 'node:path'
import { mcpIdFrom, type McpCatalogItem, type McpServerInput, type SkillCatalogItem, type SkillInfo } from '@shared/extensions'
import { listSkills, skillsDir } from './skills'
import { tr } from '@shared/i18n'

export const MCP_REGISTRY = 'https://registry.modelcontextprotocol.io/v0/servers'
export const SKILLS_SEARCH = 'https://skills.sh/api/search'

/** Fuentes de habilidades conocidas: salen como verificadas y primero. */
export const TRUSTED_SKILL_SOURCES = ['anthropics/skills', 'openai/skills', 'obra/superpowers', 'pbakaus/impeccable', 'cloudflare/security-audit-skill', 'heygen-com/hyperframes', 'vercel-labs/agent-skills', 'anthropics/knowledge-work-plugins']

const MAX_SKILL_FILES = 40
const MAX_SKILL_BYTES = 400_000
const MAX_SKILLS_PER_REPO = 40

type Fetch = typeof fetch
let fetcher: Fetch = (...a) => fetch(...a)

/** Para las pruebas: otra forma de descargar. */
export function __setFetchForTests(f: Fetch | null): void {
  fetcher = f ?? ((...a) => fetch(...a))
}

async function getJson(url: string, timeoutMs = 20_000): Promise<unknown> {
  const r = await fetcher(url, { headers: { accept: 'application/json', 'user-agent': 'kywai' }, signal: AbortSignal.timeout(timeoutMs) })
  if (!r.ok) throw new Error(tr('El catálogo respondió con un error ({code})', { code: r.status }))
  return r.json()
}

// ---------- Servidores MCP (registro oficial) ----------

interface RegArg {
  type?: string
  name?: string
  value?: string
  default?: string
  isRequired?: boolean
  valueHint?: string
}
interface RegVar {
  name?: string
  description?: string
  isRequired?: boolean
  isSecret?: boolean
  default?: string
}
interface RegPackage {
  registryType?: string
  identifier?: string
  version?: string
  runtimeHint?: string
  transport?: { type?: string }
  runtimeArguments?: RegArg[]
  packageArguments?: RegArg[]
  environmentVariables?: RegVar[]
}
interface RegRemote {
  type?: string
  url?: string
  headers?: RegVar[]
}
interface RegServer {
  name?: string
  title?: string
  description?: string
  version?: string
  websiteUrl?: string
  repository?: { url?: string }
  packages?: RegPackage[]
  remotes?: RegRemote[]
  _meta?: Record<string, { title?: string } | undefined>
}

/**
 * Publicadores conocidos (su espacio de nombres en el registro está comprobado: su dominio o su cuenta de GitHub).
 * Cualquiera puede publicar en el registro, así que «verificado» es solo para estos; el resto sale después.
 */
export const TRUSTED_MCP_PUBLISHERS = [
  'com.microsoft', 'io.github.microsoft', 'com.github', 'io.github.github', 'io.github.modelcontextprotocol', 'com.notion', 'com.atlassian',
  'com.stripe', 'com.cloudflare', 'com.vercel', 'com.supabase', 'com.figma', 'app.linear', 'com.linear', 'io.sentry', 'com.sentry',
  'com.google', 'com.googleapis', 'io.github.googleapis', 'com.upstash', 'io.github.upstash', 'com.mongodb', 'co.elastic', 'com.redis',
  'com.postman', 'com.browserbase', 'ai.exa', 'com.brave', 'com.paypal', 'com.shopify', 'com.hubspot', 'com.zapier', 'com.canva',
  'com.asana', 'com.monday', 'com.wix', 'com.netlify', 'com.neon', 'tech.neon', 'com.prisma', 'io.prisma', 'com.docker', 'io.github.docker',
  'com.apify', 'com.firecrawl', 'dev.firecrawl', 'com.anthropic', 'com.openai', 'com.huggingface', 'co.huggingface', 'com.gitlab', 'com.box', 'com.dropbox'
]

export function verifiedName(name: string): boolean {
  const ns = name.split('/')[0]?.toLowerCase() ?? ''
  return TRUSTED_MCP_PUBLISHERS.some((p) => ns === p || ns.startsWith(`${p}.`))
}

function argsOf(list: RegArg[] | undefined): { args: string[]; missing: boolean } {
  const args: string[] = []
  let missing = false
  for (const a of list ?? []) {
    const v = a.value ?? a.default
    if (a.type === 'named' && a.name) {
      if (v !== undefined) args.push(`${a.name}=${v}`)
      else if (a.isRequired) {
        args.push(`${a.name}=<${a.valueHint ?? a.name.replace(/^-+/, '')}>`)
        missing = true
      } else if (!a.valueHint) args.push(a.name)
    } else if (v !== undefined) args.push(v)
    else if (a.isRequired) {
      args.push(`<${a.valueHint ?? a.name ?? 'valor'}>`)
      missing = true
    }
  }
  return { args, missing }
}

/** Cómo se instala una ficha del registro: la orden (o la dirección) y sus claves, para revisarlas antes de guardar. */
export function catalogItemOf(s: RegServer): McpCatalogItem | null {
  const name = typeof s.name === 'string' ? s.name : ''
  if (!name) return null
  const meta = s._meta?.['io.modelcontextprotocol.registry/publisher-provided']
  // Si su nombre corto no dice nada («mcp», «server»), el del publicador: com.notion/mcp → Notion.
  const short = name.split('/').pop() || name
  const owner = (name.split('/')[0] ?? '').split('.').pop() ?? ''
  const generic = /^(mcp|server|mcp[-_]server|remote|api)$/i.test(short) && owner
  const title = s.title || meta?.title || (generic ? owner.charAt(0).toUpperCase() + owner.slice(1) : short)
  const base = {
    name,
    title: String(title).slice(0, 80),
    description: String(s.description ?? '').slice(0, 300),
    version: String(s.version ?? ''),
    verified: verifiedName(name),
    ...(s.repository?.url ? { repo: s.repository.url } : {}),
    ...(s.websiteUrl ? { website: s.websiteUrl } : {})
  }
  const id = mcpIdFrom(name.split('/').pop() ?? name)
  const help = (vars: RegVar[] | undefined): McpCatalogItem['keys'] =>
    (vars ?? []).filter((v) => v.name).map((v) => ({ name: v.name!, description: String(v.description ?? '').slice(0, 200), required: !!v.isRequired, secret: !!v.isSecret }))
  // Primero un paquete local que sepamos arrancar; si no, un servidor remoto.
  for (const p of s.packages ?? []) {
    const ident = p.identifier ?? ''
    if (!ident || (p.transport?.type && p.transport.type !== 'stdio')) continue
    const ver = p.version && p.version !== 'latest' ? p.version : ''
    const rt = argsOf(p.runtimeArguments)
    const pk = argsOf(p.packageArguments)
    let command = ''
    let args: string[] = []
    if (p.registryType === 'npm') {
      command = 'npx'
      args = [...(rt.args.includes('-y') || rt.args.includes('--yes') ? [] : ['-y']), ...rt.args, ver ? `${ident}@${ver}` : ident, ...pk.args]
    } else if (p.registryType === 'pypi') {
      command = 'uvx'
      args = [...rt.args, ver ? `${ident}==${ver}` : ident, ...pk.args]
    } else if (p.registryType === 'oci') {
      command = 'docker'
      const envs = (p.environmentVariables ?? []).flatMap((v) => (v.name ? ['-e', v.name] : []))
      args = ['run', '-i', '--rm', ...envs, ...rt.args, ver && !ident.includes(':') ? `${ident}:${ver}` : ident, ...pk.args]
    } else continue
    const env = Object.fromEntries((p.environmentVariables ?? []).filter((v) => v.name).map((v) => [v.name!, v.default ?? '']))
    const install: McpServerInput = { id, title: base.title, transport: 'stdio', command, args, ...(Object.keys(env).length ? { env } : {}) }
    return { ...base, kind: 'stdio', install, keys: help(p.environmentVariables), needsEdit: rt.missing || pk.missing }
  }
  for (const r of s.remotes ?? []) {
    if (!r.url || (r.type && r.type !== 'streamable-http')) continue
    const headers = Object.fromEntries((r.headers ?? []).filter((h) => h.name).map((h) => [h.name!, '']))
    const install: McpServerInput = { id, title: base.title, transport: 'http', url: r.url, ...(Object.keys(headers).length ? { headers } : {}) }
    return { ...base, kind: 'http', install, keys: help(r.headers), needsEdit: /[{}]/.test(r.url) }
  }
  const sse = (s.remotes ?? []).some((r) => r.type === 'sse')
  return { ...base, kind: 'http', install: null, keys: [], needsEdit: false, unsupported: sse ? tr('Solo funciona por SSE, que kywai aún no admite') : tr('No dice cómo instalarlo en este equipo') }
}

/** Busca en el registro oficial (solo la última versión de cada uno). Los verificados primero. */
export async function searchMcpCatalog(query: string, cursor?: string): Promise<{ items: McpCatalogItem[]; next?: string }> {
  const q = query.trim().slice(0, 100)
  const url = new URL(MCP_REGISTRY)
  url.searchParams.set('limit', '40')
  url.searchParams.set('version', 'latest')
  if (q) url.searchParams.set('search', q)
  if (cursor) url.searchParams.set('cursor', cursor.slice(0, 300))
  const data = (await getJson(url.toString())) as { servers?: Array<{ server?: RegServer }>; metadata?: { nextCursor?: string } }
  const seen = new Set<string>()
  const items: McpCatalogItem[] = []
  for (const row of data.servers ?? []) {
    const item = row?.server ? catalogItemOf(row.server) : null
    if (!item || seen.has(item.name)) continue
    seen.add(item.name)
    items.push(item)
  }
  items.sort((a, b) => Number(b.verified) - Number(a.verified))
  return { items, ...(data.metadata?.nextCursor ? { next: data.metadata.nextCursor } : {}) }
}

// ---------- Habilidades (skills.sh y GitHub) ----------

// dueño/repositorio (sin «.» ni «..» como nombre, que harían otra dirección).
const REPO_RE = /^[\w-][\w.-]*\/(?!\.\.?$)[\w.-]+$/
const SKILL_ID_RE = /^[\w.-]{1,64}$/

export async function searchSkillCatalog(query: string): Promise<SkillCatalogItem[]> {
  const q = query.trim().slice(0, 100)
  if (q.length < 2) return []
  const data = (await getJson(`${SKILLS_SEARCH}?q=${encodeURIComponent(q)}`)) as { skills?: Array<{ source?: string; skillId?: string; name?: string; installs?: number }> }
  const items: SkillCatalogItem[] = []
  for (const s of data.skills ?? []) {
    if (!s.source || !REPO_RE.test(s.source) || !s.skillId || !SKILL_ID_RE.test(s.skillId)) continue
    items.push({ source: s.source, skillId: s.skillId, name: String(s.name ?? s.skillId).slice(0, 64), installs: Number(s.installs) || 0, verified: TRUSTED_SKILL_SOURCES.includes(s.source.toLowerCase()) })
  }
  items.sort((a, b) => Number(b.verified) - Number(a.verified))
  return items.slice(0, 40)
}

/** «https://github.com/dueño/repo[/tree/rama/carpeta]» → sus partes (o null). */
export function parseGithubUrl(text: string): { repo: string; ref: string; path: string } | null {
  const t = text.trim().replace(/\.git$/, '').replace(/\/+$/, '')
  const m = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/(?:tree|blob)\/([^/]+)(?:\/(.*))?)?$/i.exec(t) ?? /^([\w.-]+)\/([\w.-]+)$/.exec(t)
  if (!m) return null
  const path = (m[4] ?? '').replace(/\/?SKILL\.md$/i, '')
  if (path.split('/').includes('..') || !REPO_RE.test(`${m[1]}/${m[2]}`)) return null
  return { repo: `${m[1]}/${m[2]}`, ref: m[3] ?? 'HEAD', path }
}

const raw = (repo: string, ref: string, path: string): string => `https://raw.githubusercontent.com/${repo}/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`

async function getText(url: string): Promise<string | null> {
  try {
    const r = await fetcher(url, { headers: { 'user-agent': 'kywai' }, signal: AbortSignal.timeout(20_000) })
    if (!r.ok) return null
    const t = await r.text()
    return t.length > MAX_SKILL_BYTES ? null : t
  } catch {
    return null
  }
}

/** Todos los archivos del repositorio (la API de GitHub sin sesión: 60 consultas por hora), o null si no responde. */
async function repoTree(repo: string, ref: string): Promise<string[] | null> {
  try {
    const data = (await getJson(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`)) as { tree?: Array<{ path?: string; type?: string; size?: number }> }
    return (data.tree ?? []).filter((x) => x.type === 'blob' && typeof x.path === 'string' && (x.size ?? 0) <= MAX_SKILL_BYTES).map((x) => x.path!)
  } catch {
    return null
  }
}

/** Dónde suelen estar las skills dentro de un repositorio. */
const SKILL_DIRS = (id: string): string[] => [`skills/${id}`, `.claude/skills/${id}`, `plugin/skills/${id}`, `.agents/skills/${id}`, `skills/.curated/${id}`, id, '']

/** Rutas relativas que cita un SKILL.md (scripts/x.py, references/y.md…), para traerlas sin la API de GitHub. */
export function referencedFiles(text: string): string[] {
  const out = new Set<string>()
  // En enlaces y `código`, o sueltas como «see REFERENCE.md» o «scripts/fill.py».
  const re = /(?:\]\(|`)((?:\.\/)?[\w.-]+(?:\/[\w.-]+)*\.[a-z0-9]{1,6})(?:\)|`)|(?<![\w/.:@-])((?:[\w-]+\/)*[\w-]+\.(?:md|py|sh|js|mjs|cjs|ts|json|txt|yaml|yml|html|css|xsd))\b/gi
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const p = (m[1] ?? m[2]).replace(/^\.\//, '')
    if (!/^https?:/i.test(p) && !p.split('/').includes('..') && p !== 'SKILL.md') out.add(p)
  }
  return [...out].slice(0, MAX_SKILL_FILES)
}

function safeJoin(root: string, rel: string): string | null {
  const abs = normalize(join(root, rel))
  const r = relative(root, abs)
  return !r || r.startsWith('..') || r.includes(`..${sep}`) ? null : abs
}

/** Copia una skill (su carpeta) a habilidades/<nombre>. Devuelve el nombre con el que quedó. */
async function copySkill(skillsDir: string, repo: string, ref: string, dir: string, files: string[] | null): Promise<string> {
  const skillMd = dir ? `${dir}/SKILL.md` : 'SKILL.md'
  const main = await getText(raw(repo, ref, skillMd))
  if (main === null || !/^﻿?---/.test(main)) throw new Error(tr('No se encontró su SKILL.md'))
  const fm = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(main)?.[1] ?? ''
  const declared = /^name\s*:\s*["']?([^"'\r\n]+)/m.exec(fm)?.[1]?.trim()
  const name = (declared ?? dir.split('/').pop() ?? repo.split('/')[1]).replace(/[^\p{L}\p{N} ._-]/gu, '-').replace(/^[\s.]+/, '').slice(0, 64) || 'habilidad'
  const target = safeJoin(skillsDir, name)
  if (!target) throw new Error(tr('Nombre de habilidad no válido'))
  const prefix = dir ? `${dir}/` : ''
  const rest = files ? files.filter((f) => f.startsWith(prefix) && f !== skillMd && (dir || !f.includes('/'))).map((f) => f.slice(prefix.length)) : referencedFiles(main)
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'SKILL.md'), main, 'utf8')
  let count = 0
  for (const rel of rest) {
    if (count >= MAX_SKILL_FILES) break
    const abs = safeJoin(target, rel)
    if (!abs) continue
    const text = await getText(raw(repo, ref, prefix + rel))
    if (text === null) continue
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, text, 'utf8')
    count++
  }
  return name
}

/** Instala una skill del buscador (su repositorio y su nombre). */
export async function installSkill(skillsDir: string, repo: string, skillId: string): Promise<string[]> {
  if (!REPO_RE.test(repo) || !SKILL_ID_RE.test(skillId)) throw new Error(tr('Datos no válidos'))
  const files = await repoTree(repo, 'HEAD')
  if (files) {
    const md = files.filter((f) => f === 'SKILL.md' || f.endsWith('/SKILL.md'))
    const dir = md.map((f) => f.replace(/\/?SKILL\.md$/, '')).find((d) => d.split('/').pop() === skillId) ?? (md.length === 1 ? md[0].replace(/\/?SKILL\.md$/, '') : undefined)
    if (dir !== undefined) return [await copySkill(skillsDir, repo, 'HEAD', dir, files)]
  }
  // Sin la API de GitHub: en los sitios de siempre, con los archivos que cita su SKILL.md.
  for (const dir of SKILL_DIRS(skillId)) {
    try {
      return [await copySkill(skillsDir, repo, 'HEAD', dir, null)]
    } catch {
      /* el siguiente sitio */
    }
  }
  throw new Error(tr('No se encontró «{name}» en {repo}', { name: skillId, repo }))
}

/** Instala las skills de un enlace de GitHub: una carpeta con su SKILL.md o todas las de un repositorio. */
export async function installSkillsFromUrl(skillsDir: string, url: string): Promise<string[]> {
  const g = parseGithubUrl(url)
  if (!g) throw new Error(tr('Pega un enlace de GitHub (https://github.com/dueño/repositorio)'))
  const files = await repoTree(g.repo, g.ref)
  if (!files) {
    // Sin la API: al menos una carpeta concreta (o la raíz) con su SKILL.md.
    return [await copySkill(skillsDir, g.repo, g.ref, g.path, null)]
  }
  const base = g.path ? `${g.path}/` : ''
  const dirs = files
    .filter((f) => (f === `${base}SKILL.md` || (f.startsWith(base) && f.endsWith('/SKILL.md'))))
    .map((f) => f.replace(/\/?SKILL\.md$/, ''))
    // Ni las de ejemplo de las pruebas ni las de node_modules.
    .filter((d) => !/(^|\/)(node_modules|test|tests|__tests__|fixtures)(\/|$)/.test(d))
  if (!dirs.length) throw new Error(tr('Ese enlace no tiene ninguna carpeta con SKILL.md'))
  // Las de una carpeta dentro de otra skill son parte de ella.
  const top = dirs.filter((d) => !dirs.some((o) => o !== d && (o === '' || d.startsWith(`${o}/`))))
  const names: string[] = []
  for (const d of top.slice(0, MAX_SKILLS_PER_REPO)) names.push(await copySkill(skillsDir, g.repo, g.ref, d, files))
  return names
}

/** Quita una habilidad (su carpeta o su .md suelto) de la carpeta de habilidades. */
export function removeSkillFiles(skillsDir: string, file: string): void {
  const r = relative(skillsDir, file)
  if (!r || r.startsWith('..')) throw new Error(tr('Datos no válidos'))
  const first = r.split(sep)[0]
  const abs = safeJoin(skillsDir, first)
  if (!abs) throw new Error(tr('Datos no válidos'))
  rmSync(abs, { recursive: true, force: true })
}

/** Servidores destacados (los de siempre, con su orden comprobada) para cuando aún no has buscado nada. */
export const FEATURED_MCP: McpCatalogItem[] = [
  {
    name: 'microsoft/playwright-mcp',
    title: 'Playwright',
    description: 'Abrir webs, hacer clic, rellenar formularios y sacar capturas con un navegador de verdad.',
    version: '',
    verified: true,
    repo: 'https://github.com/microsoft/playwright-mcp',
    kind: 'stdio',
    install: { id: 'playwright', title: 'Playwright', transport: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest', '--headless', '--isolated'] },
    keys: [],
    needsEdit: false
  },
  {
    name: 'github/github-mcp-server',
    title: 'GitHub',
    description: 'Issues, pull requests, código y acciones de tus repositorios (servidor remoto oficial de GitHub).',
    version: '',
    verified: true,
    repo: 'https://github.com/github/github-mcp-server',
    kind: 'http',
    install: { id: 'github', title: 'GitHub', transport: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: '' } },
    keys: [{ name: 'Authorization', description: 'Bearer y un token de GitHub (github.com/settings/tokens)', required: true, secret: true }],
    needsEdit: false
  },
  {
    name: 'upstash/context7',
    title: 'Context7',
    description: 'Documentación al día de miles de librerías, para que el código use su versión actual.',
    version: '',
    verified: true,
    repo: 'https://github.com/upstash/context7',
    kind: 'stdio',
    install: { id: 'context7', title: 'Context7', transport: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    keys: [],
    needsEdit: false
  },
  {
    name: 'cognition/deepwiki',
    title: 'DeepWiki',
    description: 'Preguntas sobre cualquier repositorio público de GitHub, con su documentación generada.',
    version: '',
    verified: true,
    website: 'https://deepwiki.com',
    kind: 'http',
    install: { id: 'deepwiki', title: 'DeepWiki', transport: 'http', url: 'https://mcp.deepwiki.com/mcp' },
    keys: [],
    needsEdit: false
  },
  {
    name: 'modelcontextprotocol/fetch',
    title: 'Fetch',
    description: 'Leer páginas web y convertirlas a texto (necesita uv/uvx en este equipo).',
    version: '',
    verified: true,
    repo: 'https://github.com/modelcontextprotocol/servers',
    kind: 'stdio',
    install: { id: 'fetch', title: 'Fetch', transport: 'stdio', command: 'uvx', args: ['mcp-server-fetch'] },
    keys: [],
    needsEdit: false
  },
  {
    name: 'modelcontextprotocol/sequential-thinking',
    title: 'Sequential Thinking',
    description: 'Pensar paso a paso los problemas difíciles, revisando y corrigiendo el razonamiento.',
    version: '',
    verified: true,
    repo: 'https://github.com/modelcontextprotocol/servers',
    kind: 'stdio',
    install: { id: 'sequential-thinking', title: 'Sequential Thinking', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
    keys: [],
    needsEdit: false
  }
]

/** Habilidades destacadas (de fuentes conocidas). */
export const FEATURED_SKILLS: Array<SkillCatalogItem & { description: string; url: string }> = [
  { source: 'obra/superpowers', skillId: '', name: 'Superpowers', installs: 0, verified: true, description: 'Planificar, TDD, depurar con método y revisar código (todas sus habilidades).', url: 'https://github.com/obra/superpowers' },
  { source: 'pbakaus/impeccable', skillId: 'impeccable', name: 'Impeccable', installs: 0, verified: true, description: 'Diseño de interfaces que no parecen hechas por IA.', url: 'https://github.com/pbakaus/impeccable' },
  { source: 'cloudflare/security-audit-skill', skillId: '', name: 'Auditoría de seguridad', installs: 0, verified: true, description: 'Revisión de seguridad del código antes de publicar (Cloudflare).', url: 'https://github.com/cloudflare/security-audit-skill' },
  { source: 'anthropics/skills', skillId: '', name: 'Skills de Anthropic', installs: 0, verified: true, description: 'PDF, Word, Excel, PowerPoint, diseño, pruebas de webs… (las oficiales de Claude).', url: 'https://github.com/anthropics/skills' },
  { source: 'heygen-com/hyperframes', skillId: '', name: 'HyperFrames', installs: 0, verified: true, description: 'Vídeos a partir de HTML (con el que se hizo la presentación de kywai).', url: 'https://github.com/heygen-com/hyperframes' }
]

// ---------- Lo que llama la interfaz ----------

export async function mcpCatalog(query: unknown, cursor?: unknown): Promise<{ items: McpCatalogItem[]; next?: string }> {
  const q = typeof query === 'string' ? query.trim() : ''
  if (!q && !cursor) return { items: FEATURED_MCP }
  return searchMcpCatalog(q, typeof cursor === 'string' ? cursor : undefined)
}

export async function skillCatalog(query: unknown): Promise<SkillCatalogItem[]> {
  const q = typeof query === 'string' ? query.trim() : ''
  return q ? searchSkillCatalog(q) : FEATURED_SKILLS
}

export function installedSkills(): SkillInfo[] {
  return listSkills().map((s) => ({ name: s.name, description: s.description }))
}

/** Instala una del catálogo (sin carpeta: todas las de su repositorio). Devuelve lo instalado y la lista nueva. */
export async function installCatalogSkill(source: unknown, skillId: unknown): Promise<{ installed: string[]; skills: SkillInfo[] }> {
  const dir = skillsDir()
  if (!dir) throw new Error(tr('Las habilidades no están disponibles'))
  if (typeof source !== 'string' || typeof skillId !== 'string') throw new Error(tr('Datos no válidos'))
  const installed = skillId ? await installSkill(dir, source, skillId) : await installSkillsFromUrl(dir, `https://github.com/${source}`)
  return { installed, skills: installedSkills() }
}

export async function installSkillLink(url: unknown): Promise<{ installed: string[]; skills: SkillInfo[] }> {
  const dir = skillsDir()
  if (!dir) throw new Error(tr('Las habilidades no están disponibles'))
  if (typeof url !== 'string') throw new Error(tr('Datos no válidos'))
  return { installed: await installSkillsFromUrl(dir, url), skills: installedSkills() }
}

export function removeSkill(name: unknown): SkillInfo[] {
  const s = listSkills().find((x) => x.name === name)
  if (!s) throw new Error(tr('Esa habilidad ya no está'))
  removeSkillFiles(skillsDir(), s.file)
  return installedSkills()
}
