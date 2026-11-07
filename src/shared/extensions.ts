// Extensiones de kywai: servidores MCP que instalas tú y repartes entre los agentes (⚙ → Ajustes → Extensiones).
// Aquí van los tipos que comparten el motor y la interfaz, y cómo se entiende lo que pegas al añadir uno (la línea
// de su README, su JSON o su dirección).

/** Agentes a los que kywai sabe pasar servidores MCP en cada tarea. */
export type McpAgentKind = 'claude' | 'codex' | 'gemini'
export const MCP_AGENT_KINDS: McpAgentKind[] = ['claude', 'codex', 'gemini']

export function isMcpAgentKind(v: unknown): v is McpAgentKind {
  return v === 'claude' || v === 'codex' || v === 'gemini'
}

/** Nombre de un servidor: clave de la configuración y prefijo de sus herramientas (mcp__nombre__…). */
export const MCP_ID_RE = /^[a-z][a-z0-9_-]{0,30}$/
/** Nombres reservados: el servidor propio de kywai. */
export const MCP_RESERVED_IDS = ['ai-cowork', 'kywai']

export interface McpTestResult {
  ok: boolean
  /** Cuándo se probó (ms). */
  at: number
  /** Qué pasó, en una frase (por qué falló, o cuántas herramientas ofrece). */
  message: string
  /** Nombres de sus herramientas (las primeras). */
  tools?: string[]
}

/** Un servidor tal como lo ve la interfaz: sin los valores secretos (solo sus nombres). */
export interface McpServerInfo {
  id: string
  title: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  /** Nombres de las variables de entorno guardadas (sus valores nunca salen del servidor). */
  envNames: string[]
  /** Nombres de las cabeceras guardadas (Authorization…), sin su valor. */
  headerNames: string[]
  /** A qué agentes llega. */
  agents: McpAgentKind[]
  test?: McpTestResult
  /** El plugin que lo trajo, si vino con uno. */
  plugin?: string
}

/** Lo que se manda al añadir o cambiar un servidor. Un valor secreto vacío deja el que estaba guardado. */
export interface McpServerInput {
  id: string
  title?: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  /** Solo al instalarlo un plugin: su nombre. */
  plugin?: string
}

export const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
export const HEADER_NAME_RE = /^[A-Za-z0-9-]{1,64}$/

/** Un nombre válido a partir de cualquier texto (el paquete, la dirección…). */
export function mcpIdFrom(text: string): string {
  let s = text.trim().toLowerCase().replace(/(.)@[\w.^~<>=*-]*$/, '$1') // paquete@versión → paquete
  // @scope/paquete → paquete; si el paquete es genérico («@playwright/mcp»), el scope.
  const scoped = /^@([^/]+)\/(.+)$/.exec(s)
  if (scoped) s = /^(mcp|server|mcp-server|server-mcp)$/.test(scoped[2]) ? scoped[1] : scoped[2]
  s = s.replace(/^(mcp[-_]server[-_]|server[-_])/, '').replace(/([-_]mcp[-_]server|[-_]mcp|[-_]server)$/, '')
  s = s.replace(/[^a-z0-9_-]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 31)
  return MCP_ID_RE.test(s) ? s : 'servidor'
}

/** Parte una línea de comandos en palabras (respeta comillas simples y dobles). */
export function splitCommandLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  let any = false
  for (const ch of line.trim()) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      any = true
    } else if (/\s/.test(ch)) {
      if (cur || any) out.push(cur)
      cur = ''
      any = false
    } else cur += ch
  }
  if (cur || any) out.push(cur)
  return out
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function strMap(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out: Record<string, string> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === 'string' || typeof x === 'number') out[k] = String(x)
  return Object.keys(out).length ? out : undefined
}

/** Una entrada del JSON de un README ({ command, args, env } o { url, headers }). */
function fromJson(id: string, o: Record<string, unknown>): McpServerInput | null {
  const url = str(o.url) ?? str(o.httpUrl) ?? str(o.serverUrl)
  if (url) return { id: mcpIdFrom(id), transport: 'http', url, ...(strMap(o.headers) ? { headers: strMap(o.headers) } : {}) }
  const command = str(o.command)
  if (!command) return null
  const args = Array.isArray(o.args) ? o.args.filter((a): a is string => typeof a === 'string') : []
  // «command» con espacios y sin args: «npx -y paquete» escrito en una sola cadena.
  const parts = args.length ? [command, ...args] : splitCommandLine(command)
  return { id: mcpIdFrom(id), transport: 'stdio', command: parts[0], args: parts.slice(1), ...(strMap(o.env) ? { env: strMap(o.env) } : {}) }
}

/** El nombre del paquete en «npx -y @scope/paquete@1.2 --opción», «uvx paquete»… (para sugerir un nombre). */
function packageOf(words: string[]): string {
  const runner = /^(npx|bunx|pnpm|uvx|pipx|docker|deno|yarn)$/i.test(words[0] ?? '')
  const rest = runner ? words.slice(1) : words
  const pkg = rest.find((w) => !w.startsWith('-') && !/^(dlx|run|exec|--from)$/i.test(w))
  return pkg ? (pkg.split(/[\\/]/).length > 2 ? pkg.split(/[\\/]/).pop()! : pkg) : (words[0] ?? '')
}

/**
 * Lo que pegas al añadir un servidor: el JSON de su README ({"mcpServers": {...}} o una sola entrada), la orden
 * «claude mcp add …» / «codex mcp add …», una línea de comandos («npx -y @playwright/mcp@latest») o una dirección
 * (https://…). Devuelve los servidores que entiende, o un texto con el problema.
 */
export function parseMcpPaste(text: string): McpServerInput[] | string {
  const t = text.trim()
  if (!t) return 'Pega la línea de su README, su JSON o su dirección'
  if (t.startsWith('{') || t.startsWith('"')) {
    let o: unknown
    try {
      o = JSON.parse(t)
    } catch {
      // A veces se copia solo «"nombre": { … }» o con una coma de más: se intenta envolverlo.
      try {
        o = JSON.parse(`{${t.replace(/^\{|\}$/g, '').replace(/,\s*$/, '')}}`)
      } catch {
        return 'Ese JSON no se entiende: cópialo entero, con sus llaves'
      }
    }
    if (!o || typeof o !== 'object') return 'Ese JSON no se entiende: cópialo entero, con sus llaves'
    const root = o as Record<string, unknown>
    const map = (root.mcpServers ?? root.servers ?? root['mcp_servers'] ?? root) as Record<string, unknown>
    if ('command' in root || 'url' in root) {
      const one = fromJson(packageOf([String(root.command ?? ''), ...(Array.isArray(root.args) ? (root.args as string[]) : [])]) || String(root.url ?? ''), root)
      return one ? [one] : 'Falta «command» o «url» en el JSON'
    }
    const out: McpServerInput[] = []
    for (const [id, v] of Object.entries(map ?? {})) {
      if (v && typeof v === 'object') {
        const one = fromJson(id, v as Record<string, unknown>)
        if (one) out.push(one)
      }
    }
    return out.length ? out : 'No hay ningún servidor en ese JSON (busca «command» o «url»)'
  }
  if (/^https?:\/\/\S+$/i.test(t)) {
    const host = (() => {
      try {
        return new URL(t).hostname.replace(/^(www|api|mcp)\./, '').split('.')[0] ?? ''
      } catch {
        return ''
      }
    })()
    return [{ id: mcpIdFrom(host), transport: 'http', url: t }]
  }
  let words = splitCommandLine(t.split(/\r?\n/).find((l) => l.trim()) ?? '')
  if (words[0] === '$') words = words.slice(1)
  // «claude mcp add [opciones] nombre [-- ] orden…» o «codex mcp add nombre -- orden…» o «gemini mcp add nombre orden…».
  if (/^(claude|codex|gemini|qwen)$/i.test(words[0] ?? '') && words[1] === 'mcp' && words[2] === 'add') {
    const env: Record<string, string> = {}
    const headers: Record<string, string> = {}
    let transport: 'stdio' | 'http' = 'stdio'
    let name = ''
    let url = ''
    let i = 3
    for (; i < words.length; i++) {
      const w = words[i]
      if (w === '--') {
        i++
        break
      }
      if (w === '-e' || w === '--env') {
        const kv = words[++i] ?? ''
        const eq = kv.indexOf('=')
        if (eq > 0) env[kv.slice(0, eq)] = kv.slice(eq + 1)
      } else if (w === '-H' || w === '--header') {
        const kv = words[++i] ?? ''
        const c = kv.indexOf(':')
        if (c > 0) headers[kv.slice(0, c).trim()] = kv.slice(c + 1).trim()
      } else if (w === '-t' || w === '--transport') {
        transport = /http|sse/i.test(words[++i] ?? '') ? 'http' : 'stdio'
      } else if (w.startsWith('--transport=')) {
        transport = /http|sse/i.test(w) ? 'http' : 'stdio'
      } else if (w === '-s' || w === '--scope') {
        i++
      } else if (w.startsWith('-')) {
        continue
      } else if (!name) {
        name = w
      } else if (!url && (transport === 'http' || /^https?:\/\//i.test(w))) {
        url = w // los remotos pueden llevar opciones después (-H …)
      } else break
    }
    const rest = url ? [url] : words.slice(i)
    if (!name) return 'Falta el nombre del servidor en la orden'
    if (transport === 'http' || /^https?:\/\//i.test(rest[0] ?? '')) {
      if (!rest[0]) return 'Falta la dirección del servidor'
      return [{ id: mcpIdFrom(name), transport: 'http', url: rest[0], ...(Object.keys(headers).length ? { headers } : {}) }]
    }
    if (!rest.length) return 'Falta la orden que arranca el servidor'
    return [{ id: mcpIdFrom(name), transport: 'stdio', command: rest[0], args: rest.slice(1), ...(Object.keys(env).length ? { env } : {}) }]
  }
  // Variables delante de la orden: «GITHUB_TOKEN=xxx npx -y …».
  const env: Record<string, string> = {}
  while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) {
    const [k, ...v] = words.shift()!.split('=')
    env[k] = v.join('=')
  }
  if (!words.length) return 'Falta la orden que arranca el servidor'
  return [{ id: mcpIdFrom(packageOf(words)), transport: 'stdio', command: words[0], args: words.slice(1), ...(Object.keys(env).length ? { env } : {}) }]
}

/** Una ficha del catálogo de servidores MCP (registro oficial o destacados). */
export interface McpCatalogItem {
  /** Nombre en el registro (com.empresa/servidor). */
  name: string
  title: string
  description: string
  version: string
  /** Publicado desde un dominio comprobado, o de los destacados de kywai. */
  verified: boolean
  repo?: string
  website?: string
  kind: 'stdio' | 'http'
  /** Lo que se rellena al instalarlo (se revisa antes de guardar); null si no se sabe instalar aquí. */
  install: McpServerInput | null
  /** Sus claves: qué es cada una y si hace falta. */
  keys: Array<{ name: string; description: string; required: boolean; secret: boolean }>
  /** La orden o la dirección lleva algo entre <> o {} que hay que poner a mano. */
  needsEdit: boolean
  /** Por qué no se puede instalar (si install es null). */
  unsupported?: string
}

/** Una habilidad del catálogo (skills.sh, destacados o un repositorio). */
export interface SkillCatalogItem {
  /** Repositorio de GitHub (dueño/nombre). */
  source: string
  /** Su carpeta en el repositorio ('' = todas las del repositorio). */
  skillId: string
  name: string
  installs: number
  verified: boolean
  description?: string
  url?: string
}

/** Una habilidad instalada (carpeta «habilidades» de kywai). */
export interface SkillInfo {
  name: string
  description: string
}

/** De dónde se descarga un plugin: una carpeta de un repositorio de GitHub. */
export interface PluginSource {
  repo: string
  ref: string
  /** Carpeta del plugin dentro del repositorio ('' = la raíz). */
  path: string
}

/** Un plugin de un catálogo (marketplace de plugins de Claude Code). */
export interface PluginCatalogItem {
  name: string
  title: string
  description: string
  category?: string
  author?: string
  homepage?: string
  /** El catálogo del que sale (dueño/repositorio). */
  marketplace: string
  /** Catálogo oficial de Anthropic o uno conocido. */
  verified: boolean
  /** null si no se puede descargar desde aquí (no está en GitHub…). */
  source: PluginSource | null
}

/** Un plugin instalado y lo que trajo. */
export interface PluginInfo {
  name: string
  title: string
  description: string
  version?: string
  source: PluginSource
  /** Habilidades que añadió (sus carpetas en «habilidades»), incluidos sus comandos y subagentes. */
  skills: string[]
  /** Servidores MCP que añadió (apagados hasta que los enciendas). */
  mcp: string[]
  /** Lo que traía y kywai no usa (hooks, servidores de lenguaje, servidores que piden iniciar sesión…). */
  skipped: string[]
  installedAt: string
}
