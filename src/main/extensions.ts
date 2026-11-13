// Extensiones: servidores MCP que instalas tú (⚙ → Ajustes → Extensiones) y repartes entre los agentes. Cada tarea
// recibe solo los servidores encendidos para su agente, además del servidor propio de kywai:
//   - Claude: en el mismo archivo --mcp-config de la tarea (se borra al terminar), con sus herramientas permitidas.
//   - Codex: con «-c mcp_servers.<nombre>.…». Sus valores no pueden llevar comillas por la consola, así que cada
//     servidor local se arranca con un lanzador pequeño (un script con sus variables) que se borra al terminar.
//   - Gemini: con una extensión «kywai» en ~/.gemini/extensions que lista los servidores encendidos para Gemini (sus
//     claves no se escriben: van como ${VARIABLE} y kywai se las pasa al lanzar la tarea), y
//     --allowed-mcp-server-names con los de la tarea. Los archivos de configuración de sistema de Gemini no sirven:
//     solo los lee si son de root.
// Las claves (variables de entorno y cabeceras) se guardan cifradas con el llavero del sistema si se puede, en la
// carpeta de datos de este equipo, y nunca salen hacia la interfaz: solo sus nombres.
// Antes de encender un servidor para un agente se prueba de verdad (se arranca y se le piden sus herramientas): si
// falla, se queda apagado y se dice por qué. Así ninguna tarea se rompe por una extensión.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  ENV_NAME_RE,
  HEADER_NAME_RE,
  MCP_AGENT_KINDS,
  MCP_ID_RE,
  MCP_RESERVED_IDS,
  isMcpAgentKind,
  mcpRuntimeFor,
  type McpAgentKind,
  type McpServerInfo,
  type McpServerInput,
  type McpTestResult
} from '@shared/extensions'
import type { KeyCipher } from './secrets'
import { quoteArg } from './agents/spawn'
import type { ExtraMcp } from './agents/types'
import { syncHermesHome } from './hermesHomeMcp'
import { tr } from '@shared/i18n'

const IS_WIN = process.platform === 'win32'
const MAX_SERVERS = 60
const MAX_ARGS = 40
const MAX_SECRETS = 20
/** Un servidor con npx o uvx descarga su paquete la primera vez: puede tardar. */
export const MCP_TEST_TIMEOUT_MS = 90_000
/** Lo mismo para el arranque dentro de una tarea (Codex corta a los 10 s si no se le dice otra cosa). */
const STARTUP_TIMEOUT_SEC = 60

interface Sealed {
  value: string
  encrypted: boolean
}

interface StoredServer {
  id: string
  title: string
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  env: Record<string, Sealed>
  headers: Record<string, Sealed>
  agents: McpAgentKind[]
  test?: McpTestResult
  /** El plugin que lo trajo (se quita con él). */
  plugin?: string
}

/** Un servidor con sus claves ya descifradas: solo para lanzarlo (nunca va a la interfaz). */
export interface ResolvedMcpServer {
  id: string
  title: string
  transport: 'stdio' | 'http'
  command: string
  args: string[]
  url: string
  env: Record<string, string>
  headers: Record<string, string>
  agents: McpAgentKind[]
  test?: McpTestResult
}

function err(msg: string): Error {
  return new Error(msg)
}

/** Sin saltos de línea ni caracteres de control (todo esto acaba en scripts y archivos de configuración). */
function clean(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  if (s.length > max || /[\u0000-\u001f\u007f]/.test(s)) throw err(tr('Hay un valor demasiado largo o con caracteres no permitidos'))
  return s
}

function validUrl(u: string): boolean {
  try {
    const x = new URL(u)
    if (x.username || x.password) return false
    if (x.protocol === 'https:') return true
    return x.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname)
  } catch {
    return false
  }
}

export class McpRegistry {
  constructor(
    private readonly file: string,
    private readonly cipher: KeyCipher
  ) {}

  private read(): StoredServer[] {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { servers?: StoredServer[] }
      return Array.isArray(data.servers) ? data.servers.filter((s) => s && MCP_ID_RE.test(s.id)) : []
    } catch {
      return []
    }
  }

  private write(servers: StoredServer[]): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ servers }, null, 2), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, this.file)
  }

  private seal(plain: string): Sealed {
    const encrypted = this.cipher.available()
    return { value: encrypted ? this.cipher.encrypt(plain) : plain, encrypted }
  }

  private open(s: Sealed): string {
    return (s.encrypted ? this.cipher.decrypt(s.value) : s.value) ?? ''
  }

  private info(s: StoredServer): McpServerInfo {
    return {
      id: s.id,
      title: s.title,
      transport: s.transport,
      ...(s.transport === 'stdio' ? { command: s.command, args: s.args ?? [] } : { url: s.url }),
      envNames: Object.keys(s.env ?? {}),
      headerNames: Object.keys(s.headers ?? {}),
      agents: (s.agents ?? []).filter(isMcpAgentKind),
      ...(s.test ? { test: s.test } : {}),
      ...(s.plugin ? { plugin: s.plugin } : {})
    }
  }

  list(): McpServerInfo[] {
    return this.read().map((s) => this.info(s))
  }

  /** Vuelve a cifrar con el sistema actual lo cifrado con uno anterior (por ejemplo, el llavero del Mac). */
  private migrated(): StoredServer[] {
    const servers = this.read()
    const outdated = this.cipher.outdated
    if (!outdated || !this.cipher.available()) return servers
    let changed = false
    const redo = (vals?: Record<string, Sealed>): void => {
      for (const [k, v] of Object.entries(vals ?? {})) {
        if (!v.encrypted || !outdated(v.value)) continue
        const plain = this.cipher.decrypt(v.value)
        if (plain === null) continue
        vals![k] = this.seal(plain)
        changed = true
      }
    }
    for (const s of servers) {
      redo(s.env)
      redo(s.headers)
    }
    if (changed) {
      try {
        this.write(servers)
      } catch {
        /* se reintenta en la próxima lectura */
      }
    }
    return servers
  }

  resolved(): ResolvedMcpServer[] {
    return this.migrated().map((s) => ({
      id: s.id,
      title: s.title,
      transport: s.transport,
      command: s.command ?? '',
      args: s.args ?? [],
      url: s.url ?? '',
      env: Object.fromEntries(Object.entries(s.env ?? {}).map(([k, v]) => [k, this.open(v)])),
      headers: Object.fromEntries(Object.entries(s.headers ?? {}).map(([k, v]) => [k, this.open(v)])),
      agents: (s.agents ?? []).filter(isMcpAgentKind),
      ...(s.test ? { test: s.test } : {})
    }))
  }

  get(id: string): ResolvedMcpServer | null {
    return this.resolved().find((s) => s.id === id) ?? null
  }

  /**
   * Añade un servidor o cambia uno. Un valor secreto vacío deja el guardado; una variable que ya no viene se borra.
   * Cambiar cómo se arranca lo apaga para todos (hay que volver a probarlo).
   */
  save(input: McpServerInput, replaces?: string): McpServerInfo {
    if (!input || typeof input !== 'object') throw err(tr('Datos no válidos'))
    const id = clean(input.id, 31).toLowerCase()
    if (!MCP_ID_RE.test(id)) throw err(tr('El nombre solo admite minúsculas, números, - y _ (empieza por una letra)'))
    if (MCP_RESERVED_IDS.includes(id)) throw err(tr('Ese nombre está reservado para kywai'))
    const transport = input.transport === 'http' ? 'http' : 'stdio'
    const servers = this.read()
    const prevId = replaces && MCP_ID_RE.test(replaces) ? replaces : id
    const prev = servers.find((s) => s.id === prevId)
    if (id !== prevId && servers.some((s) => s.id === id)) throw err(tr('Ya hay un servidor con ese nombre'))
    if (!prev && servers.length >= MAX_SERVERS) throw err(tr('Hay demasiados servidores: quita alguno antes'))
    const next: StoredServer = { id, title: clean(input.title, 80) || prev?.title || id, transport, env: {}, headers: {}, agents: prev?.agents ?? [] }
    const plugin = prev?.plugin ?? clean(input.plugin, 64)
    if (plugin) next.plugin = plugin
    if (transport === 'stdio') {
      const command = clean(input.command, 400)
      if (!command) throw err(tr('Falta la orden que arranca el servidor'))
      const args = Array.isArray(input.args) ? input.args.map((a) => clean(a, 1000)) : []
      if (args.length > MAX_ARGS) throw err(tr('Demasiados argumentos'))
      next.command = command
      next.args = args
    } else {
      const url = clean(input.url, 1000)
      if (!validUrl(url)) throw err(tr('La dirección debe empezar por https:// (o ser de este equipo)'))
      next.url = url
    }
    const secrets = (src: Record<string, string> | undefined, old: Record<string, Sealed>, re: RegExp, what: string): Record<string, Sealed> => {
      const out: Record<string, Sealed> = {}
      const entries = Object.entries(src && typeof src === 'object' ? src : {})
      if (entries.length > MAX_SECRETS) throw err(what === 'variables' ? tr('Demasiadas variables') : tr('Demasiadas cabeceras'))
      for (const [k, v] of entries) {
        if (!re.test(k)) throw err(tr('Nombre no válido: {k}', { k }))
        const val = clean(v, 4000)
        if (val) out[k] = this.seal(val)
        else if (old[k]) out[k] = old[k]
      }
      return out
    }
    if (transport === 'stdio') next.env = secrets(input.env, prev?.env ?? {}, ENV_NAME_RE, 'variables')
    else next.headers = secrets(input.headers, prev?.headers ?? {}, HEADER_NAME_RE, 'cabeceras')
    const sameLaunch =
      prev &&
      prev.transport === next.transport &&
      prev.command === next.command &&
      JSON.stringify(prev.args ?? []) === JSON.stringify(next.args ?? []) &&
      prev.url === next.url &&
      JSON.stringify(Object.keys(prev.env ?? {}).sort()) === JSON.stringify(Object.keys(next.env).sort()) &&
      JSON.stringify(Object.keys(prev.headers ?? {}).sort()) === JSON.stringify(Object.keys(next.headers).sort()) &&
      Object.keys(input.env ?? {}).every((k) => !input.env?.[k]) &&
      Object.keys(input.headers ?? {}).every((k) => !input.headers?.[k])
    if (sameLaunch && prev?.test) next.test = prev.test
    else next.agents = []
    const out = prev ? servers.map((s) => (s.id === prevId ? next : s)) : [...servers, next]
    this.write(out)
    return this.info(next)
  }

  remove(id: string): boolean {
    const servers = this.read()
    const out = servers.filter((s) => s.id !== id)
    if (out.length === servers.length) return false
    this.write(out)
    return true
  }

  setAgents(id: string, agents: McpAgentKind[]): McpServerInfo {
    const servers = this.read()
    const s = servers.find((x) => x.id === id)
    if (!s) throw err(tr('Ese servidor ya no existe'))
    s.agents = MCP_AGENT_KINDS.filter((k) => agents.includes(k))
    this.write(servers)
    return this.info(s)
  }

  setTest(id: string, test: McpTestResult): void {
    const servers = this.read()
    const s = servers.find((x) => x.id === id)
    if (!s) return
    s.test = test
    // Si deja de funcionar, se apaga: mejor sin la herramienta que una tarea que no arranca.
    if (!test.ok) s.agents = []
    this.write(servers)
  }
}

// ---------- Probar un servidor ----------

/** Cómo se ve la orden en Windows (cmd.exe): sin los caracteres que interpreta la consola. */
function winQuote(a: string): string {
  if (/["%!^&|<>\r\n]/.test(a)) throw err(tr('En Windows no se admite este argumento: {a}', { a }))
  return /[\s()]/.test(a) || !a ? `"${a}"` : a
}

interface RpcReply {
  id?: number
  result?: Record<string, unknown>
  error?: { message?: string }
}

function toolsOf(r: RpcReply | undefined): string[] {
  const tools = (r?.result?.tools ?? []) as Array<{ name?: unknown }>
  return Array.isArray(tools) ? tools.map((t) => (typeof t?.name === 'string' ? t.name : '')).filter(Boolean) : []
}

function okResult(tools: string[]): McpTestResult {
  return {
    ok: true,
    at: Date.now(),
    message: tools.length === 1 ? tr('Responde: 1 herramienta') : tools.length ? tr('Responde: {n} herramientas', { n: tools.length }) : tr('Responde (sin herramientas)'),
    tools: tools.slice(0, 40)
  }
}

function failResult(message: string): McpTestResult {
  return { ok: false, at: Date.now(), message: message.slice(0, 300) }
}

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'kywai', version: '1.0' } }
}

/** Arranca un servidor local, le saluda y le pide sus herramientas, como hará el CLI en una tarea. */
export function testStdio(s: Pick<ResolvedMcpServer, 'command' | 'args' | 'env'>, timeoutMs = MCP_TEST_TIMEOUT_MS): Promise<McpTestResult> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      const env = { ...process.env, ...s.env }
      child = IS_WIN
        ? spawn([s.command, ...s.args].map(winQuote).join(' '), { shell: true, windowsHide: true, env })
        : spawn(s.command, s.args, { env, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      resolve(failResult(tr('No se pudo arrancar: {msg}', { msg: (e as Error).message })))
      return
    }
    let done = false
    let buf = ''
    let stderr = ''
    const finish = (r: McpTestResult): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        child.stdin?.end()
        child.kill()
      } catch {
        /* ya terminó */
      }
      resolve(r)
    }
    const timer = setTimeout(() => finish(failResult(tr('No respondió en {n} s', { n: Math.round(timeoutMs / 1000) }) + (stderr.trim() ? `: ${lastLine(stderr)}` : ''))), timeoutMs)
    const send = (o: unknown): void => {
      try {
        child.stdin?.write(`${JSON.stringify(o)}\n`)
      } catch {
        /* se cerró */
      }
    }
    const missing = (): McpTestResult => {
      const runtime = mcpRuntimeFor(s.command)
      return { ...failResult(tr('No se encontró «{command}» en este equipo', { command: s.command })), ...(runtime ? { runtime } : {}) }
    }
    child.on('error', (e) => finish(/ENOENT/.test(e.message) ? missing() : failResult(tr('No se pudo arrancar: {msg}', { msg: e.message }))))
    child.on('exit', (code) => {
      // En Windows se lanza por la consola: si falta el programa, cmd lo dice con el código 9009 o «no se reconoce».
      if (IS_WIN && (code === 9009 || /not recognized|no se reconoce/i.test(stderr))) return finish(missing())
      finish(failResult(tr('Se cerró al arrancar (código {code})', { code: code ?? '?' }) + (stderr.trim() ? `: ${lastLine(stderr)}` : '')))
    })
    child.stderr?.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString('utf8')).slice(-4000)
    })
    child.stdout?.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('{')) continue
        let m: RpcReply
        try {
          m = JSON.parse(line) as RpcReply
        } catch {
          continue
        }
        if (m.id === 1) {
          if (m.error) return finish(failResult(tr('Rechazó el saludo: {msg}', { msg: m.error.message ?? '?' })))
          send({ jsonrpc: '2.0', method: 'notifications/initialized' })
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        } else if (m.id === 2) {
          return finish(m.error ? failResult(tr('No dio sus herramientas: {msg}', { msg: m.error.message ?? '?' })) : okResult(toolsOf(m)))
        }
      }
    })
    send(INIT)
  })
}

function lastLine(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return (lines[lines.length - 1] ?? '').slice(0, 200)
}

/** La respuesta de un servidor remoto: JSON o eventos (SSE) con el JSON en «data:». */
function rpcFrom(body: string, id: number): RpcReply | undefined {
  const t = body.trim()
  const candidates = t.startsWith('{') ? [t] : t.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim())
  for (const c of candidates) {
    try {
      const m = JSON.parse(c) as RpcReply
      if (m.id === id) return m
    } catch {
      /* otra línea */
    }
  }
  return undefined
}

export async function testHttp(s: Pick<ResolvedMcpServer, 'url' | 'headers'>, timeoutMs = 30_000): Promise<McpTestResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const base: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...s.headers }
  try {
    const r1 = await fetch(s.url, { method: 'POST', headers: base, body: JSON.stringify(INIT), signal: ctrl.signal })
    if (r1.status === 401 || r1.status === 403)
      return failResult(tr('Pide autorización: añade su token como cabecera «Authorization» (Bearer …). Los que solo admiten iniciar sesión en el navegador aún no se pueden usar en las tareas'))
    if (!r1.ok) return failResult(tr('Respondió con un error ({code})', { code: r1.status }))
    const init = rpcFrom(await r1.text(), 1)
    if (!init) return failResult(tr('No responde como un servidor MCP'))
    if (init.error) return failResult(tr('Rechazó el saludo: {msg}', { msg: init.error.message ?? '?' }))
    const session = r1.headers.get('mcp-session-id')
    const headers = { ...base, ...(session ? { 'mcp-session-id': session } : {}) }
    await fetch(s.url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), signal: ctrl.signal }).then((r) => r.text()).catch(() => '')
    const r2 = await fetch(s.url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }), signal: ctrl.signal })
    const list = rpcFrom(await r2.text(), 2)
    if (!list) return failResult(tr('No dio la lista de herramientas'))
    return list.error ? failResult(tr('No dio sus herramientas: {msg}', { msg: list.error.message ?? '?' })) : okResult(toolsOf(list))
  } catch (e) {
    return failResult(ctrl.signal.aborted ? tr('No respondió en {n} s', { n: Math.round(timeoutMs / 1000) }) : tr('No se pudo conectar: {msg}', { msg: (e as Error).message }))
  } finally {
    clearTimeout(timer)
  }
}

export function testServer(s: ResolvedMcpServer): Promise<McpTestResult> {
  return s.transport === 'http' ? testHttp(s) : testStdio(s)
}

// ---------- Lo que recibe cada tarea ----------

/** Nombre de una variable de entorno con la clave de un servidor (para Gemini y Codex). */
export function secretVar(id: string, name: string): string {
  return `KYWAI_MCP_${id.replace(/-/g, '_').toUpperCase()}_${name.replace(/-/g, '_').toUpperCase()}`
}

/** Los servidores de un agente en el formato de Claude (--mcp-config). */
export function claudeServers(list: ResolvedMcpServer[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const s of list) {
    out[s.id] =
      s.transport === 'http'
        ? { type: 'http', url: s.url, ...(Object.keys(s.headers).length ? { headers: s.headers } : {}) }
        : { type: 'stdio', command: s.command, args: s.args, ...(Object.keys(s.env).length ? { env: s.env } : {}) }
  }
  return out
}

function shQuote(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`
}

/** El lanzador de un servidor local para Codex: un script sin argumentos con sus variables. */
export function launcherScript(s: Pick<ResolvedMcpServer, 'command' | 'args' | 'env'>, win = IS_WIN): string {
  if (win) {
    const sets = Object.entries(s.env).map(([k, v]) => {
      if (/["%!^&|<>]/.test(v)) throw err(tr('En Windows no se admite este valor en {k}', { k }))
      return `set "${k}=${v}"`
    })
    return ['@echo off', ...sets, `call ${[s.command, ...s.args].map(winQuote).join(' ')}`, ''].join('\r\n')
  }
  return ['#!/bin/sh', ...Object.entries(s.env).map(([k, v]) => `export ${k}=${shQuote(v)}`), `exec ${[s.command, ...s.args].map(shQuote).join(' ')}`, ''].join('\n')
}

export interface CodexMcp {
  args: string[]
  env: Record<string, string>
  files: string[]
}

/**
 * Los «-c» de Codex para los servidores de una tarea. Los locales se arrancan con un lanzador escrito en `dir`
 * (se borra al terminar); los remotos llevan sus cabeceras en variables de entorno del propio Codex.
 */
export function codexMcp(list: ResolvedMcpServer[], dir: string, tag: string, win = IS_WIN): CodexMcp & { skipped: string[] } {
  const out: CodexMcp & { skipped: string[] } = { args: [], env: {}, files: [], skipped: [] }
  for (const s of list) {
    const key = `mcp_servers.${s.id}`
    const args: string[] = []
    const env: Record<string, string> = {}
    let file = ''
    try {
      if (s.transport === 'http') {
        args.push('-c', `${key}.url=${s.url}`)
        for (const [h, v] of Object.entries(s.headers)) {
          const name = secretVar(s.id, `H_${h}`)
          env[name] = v
          args.push('-c', `${key}.env_http_headers.${h}=${name}`)
        }
      } else {
        mkdirSync(dir, { recursive: true })
        file = join(dir, `ext-${tag}-${s.id}.${win ? 'cmd' : 'sh'}`)
        writeFileSync(file, launcherScript(s, win), { encoding: 'utf8', mode: 0o700 })
        if (!win) chmodSync(file, 0o700)
        args.push('-c', `${key}.command=${file.replace(/\\/g, '/')}`)
      }
      args.push('-c', `${key}.startup_timeout_sec=${STARTUP_TIMEOUT_SEC}`)
      // Todo pasa por la consola: lo que no se pueda escribir ahí sin riesgo (una dirección con ? o &) se queda fuera.
      args.forEach((a) => quoteArg(a))
    } catch {
      if (file) rmSync(file, { force: true })
      out.skipped.push(s.id)
      continue
    }
    if (file) out.files.push(file)
    out.args.push(...args)
    Object.assign(out.env, env)
  }
  return out
}

/**
 * Los servidores de Hermes para una tarea. Hermes solo lee servidores MCP de su config.yaml, pero mezcla encima la de
 * su «ámbito gestionado» (HERMES_MANAGED_DIR): kywai escribe ahí, en una carpeta propia de la tarea (se borra al
 * terminar), un config.yaml solo con «mcp_servers», sin tocar la configuración del usuario. Si ya hay un ámbito
 * gestionado de verdad (/etc/hermes o la variable puesta), no se pisa: Hermes trabaja sin ellos.
 */
export function hermesMcp(
  list: ResolvedMcpServer[],
  root: string,
  tag: string,
  opts: { env?: NodeJS.ProcessEnv; managedExists?: boolean } = {}
): (ExtraMcp & { dir: string }) | { skipped: string } {
  const env = opts.env ?? process.env
  if (env.HERMES_MANAGED_DIR?.trim() || (opts.managedExists ?? (!IS_WIN && existsSync('/etc/hermes')))) {
    return { skipped: tr('Hermes ya tiene una configuración gestionada (/etc/hermes): no se le añaden servidores') }
  }
  const servers: Record<string, unknown> = {}
  for (const s of list) {
    servers[s.id] =
      s.transport === 'http'
        ? { url: s.url, ...(Object.keys(s.headers).length ? { headers: s.headers } : {}), connect_timeout: STARTUP_TIMEOUT_SEC }
        : { command: s.command, args: s.args, ...(Object.keys(s.env).length ? { env: s.env } : {}), connect_timeout: STARTUP_TIMEOUT_SEC }
  }
  const dir = join(root, `hermes-${tag}`)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  // JSON es YAML válido: así no hace falta escapar nada a mano.
  writeFileSync(join(dir, 'config.yaml'), JSON.stringify({ mcp_servers: servers }, null, 2), { encoding: 'utf8', mode: 0o600 })
  return { dir, names: list.map((s) => s.id), args: [], env: { HERMES_MANAGED_DIR: dir } }
}

/** El archivo de ajustes «de sistema» de Gemini en este equipo (el que sustituye GEMINI_CLI_SYSTEM_SETTINGS_PATH). */
export function geminiSystemSettingsPath(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return '/Library/Application Support/GeminiCli/settings.json'
  if (platform === 'win32') return 'C:\\ProgramData\\gemini-cli\\settings.json'
  return '/etc/gemini-cli/settings.json'
}

/**
 * Servidores que Gemini solo debe tener en UNA tarea (el navegador de kywai, con su token de un solo uso). La
 * extensión «kywai» es fija para todo el equipo, así que estos van en unos ajustes «de sistema» propios de la tarea
 * (GEMINI_CLI_SYSTEM_SETTINGS_PATH, se borran al terminar). Si el equipo ya tiene ajustes de sistema, se copian y
 * se les añaden los servidores: Gemini sigue con los suyos.
 */
export function geminiTaskSettings(
  list: ResolvedMcpServer[],
  root: string,
  tag: string,
  opts: { systemFile?: string } = {}
): { file: string; env: Record<string, string> } {
  const systemFile = opts.systemFile ?? geminiSystemSettingsPath()
  let base: Record<string, unknown> = {}
  try {
    if (existsSync(systemFile)) {
      const parsed = JSON.parse(readFileSync(systemFile, 'utf8')) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) base = parsed as Record<string, unknown>
    }
  } catch {
    // Ajustes ilegibles (o con comentarios): Gemini los leería igual de mal; seguimos sin ellos.
  }
  const prev = base.mcpServers && typeof base.mcpServers === 'object' ? (base.mcpServers as Record<string, unknown>) : {}
  const servers: Record<string, unknown> = { ...prev }
  for (const s of list) {
    // «trust»: sin confirmar cada llamada (Gemini no puede preguntar sin consola); lo delicado ya lo pregunta kywai.
    servers[s.id] = { command: s.command, args: s.args, ...(Object.keys(s.env).length ? { env: s.env } : {}), timeout: STARTUP_TIMEOUT_SEC * 1000, trust: true }
  }
  mkdirSync(root, { recursive: true })
  const file = join(root, `gemini-${tag}.json`)
  writeFileSync(file, JSON.stringify({ ...base, mcpServers: servers }, null, 2), { encoding: 'utf8', mode: 0o600 })
  return { file, env: { GEMINI_CLI_SYSTEM_SETTINGS_PATH: file } }
}

/** La extensión «kywai» de Gemini: los servidores encendidos para Gemini, con las claves como ${VARIABLE}. */
export function geminiExtension(list: ResolvedMcpServer[]): Record<string, unknown> {
  const servers: Record<string, unknown> = {}
  for (const s of list) {
    servers[s.id] =
      s.transport === 'http'
        ? { httpUrl: s.url, ...(Object.keys(s.headers).length ? { headers: Object.fromEntries(Object.keys(s.headers).map((h) => [h, `\${${secretVar(s.id, `H_${h}`)}}`])) } : {}) }
        : {
            command: s.command,
            args: s.args,
            ...(Object.keys(s.env).length ? { env: Object.fromEntries(Object.keys(s.env).map((k) => [k, `\${${secretVar(s.id, k)}}`])) } : {}),
            timeout: STARTUP_TIMEOUT_SEC * 1000
          }
  }
  return {
    name: 'kywai',
    version: '1.0.0',
    description: 'Servidores MCP que kywai da a Gemini en sus tareas (se cambian en kywai: Ajustes › Extensiones).',
    mcpServers: servers
  }
}

/** Las claves de los servidores de Gemini, en las variables que espera su extensión. */
export function geminiEnv(list: ResolvedMcpServer[]): Record<string, string> {
  const env: Record<string, string> = {}
  for (const s of list) {
    for (const [k, v] of Object.entries(s.env)) env[secretVar(s.id, k)] = v
    for (const [h, v] of Object.entries(s.headers)) env[secretVar(s.id, `H_${h}`)] = v
  }
  return env
}

/** Lo que ve el coordinador: qué herramientas extra tiene cada tipo de agente. */
export function guideLines(list: McpServerInfo[], agentNames: Partial<Record<McpAgentKind, string[]>>): string[] {
  const lines: string[] = []
  for (const kind of MCP_AGENT_KINDS) {
    const names = agentNames[kind] ?? []
    if (!names.length) continue
    const mine = list.filter((s) => s.agents.includes(kind) && s.test?.ok)
    if (!mine.length) continue
    const tools = mine.map((s) => `${s.title}${s.test?.tools?.length ? ` (${s.test.tools.slice(0, 6).join(', ')}${s.test.tools.length > 6 ? '…' : ''})` : ''}`)
    lines.push(`- ${names.join(', ')}: ${tools.join('; ')}`)
  }
  if (!lines.length) return []
  return [
    '',
    '### Herramientas extra de cada agente (servidores MCP que instaló el usuario)',
    ...lines,
    '- Solo esos agentes tienen esas herramientas. Si una tarea las necesita, dásela a uno que las tenga; si ninguno disponible las tiene, dilo en "reply" en vez de mandarla a quien no puede usarlas.'
  ]
}

// ---------- Este equipo ----------

let registry: McpRegistry | null = null
let geminiDir = join(homedir(), '.gemini', 'extensions', 'kywai')

export function initExtensions(r: McpRegistry, opts: { geminiDir?: string } = {}): void {
  registry = r
  if (opts.geminiDir) geminiDir = opts.geminiDir
  syncAgentConfigs()
}

export function mcpRegistry(): McpRegistry | null {
  return registry
}

/** Los servidores encendidos (y que funcionaron al probarlos) para un tipo de agente. */
export function serversFor(kind: string): ResolvedMcpServer[] {
  if (!registry || !isMcpAgentKind(kind)) return []
  try {
    return registry.resolved().filter((s) => s.agents.includes(kind) && s.test?.ok)
  } catch {
    return []
  }
}

/**
 * Tras cada cambio en Extensiones: la extensión «kywai» de Gemini y los servidores sin claves (Lightpanda) en la
 * configuración propia de Hermes, para que también los pueda usar al coordinar (hermesHomeMcp.ts).
 */
export function syncAgentConfigs(): void {
  syncGemini()
  syncHermesHome(serversFor('hermes'))
}

/** Escribe (o quita) la extensión «kywai» de Gemini según lo encendido para Gemini. */
export function syncGemini(): void {
  const list = serversFor('gemini')
  try {
    if (!list.length) {
      rmSync(geminiDir, { recursive: true, force: true })
      return
    }
    mkdirSync(geminiDir, { recursive: true })
    writeFileSync(join(geminiDir, 'gemini-extension.json'), JSON.stringify(geminiExtension(list), null, 2), 'utf8')
  } catch (e) {
    console.warn('[cowork] no se pudo escribir la extensión de Gemini', e)
  }
}

export function listMcp(): McpServerInfo[] {
  return registry?.list() ?? []
}

export function saveMcp(input: McpServerInput, replaces?: string): McpServerInfo[] {
  if (!registry) throw err(tr('Las extensiones no están disponibles'))
  registry.save(input, replaces)
  syncAgentConfigs()
  return registry.list()
}

export function removeMcp(id: string): McpServerInfo[] {
  if (!registry) throw err(tr('Las extensiones no están disponibles'))
  registry.remove(id)
  syncAgentConfigs()
  return registry.list()
}

export async function testMcp(id: string): Promise<McpServerInfo[]> {
  if (!registry) throw err(tr('Las extensiones no están disponibles'))
  const s = registry.get(id)
  if (!s) throw err(tr('Ese servidor ya no existe'))
  registry.setTest(id, await testServer(s))
  syncAgentConfigs()
  return registry.list()
}

/** Enciende o apaga un servidor para unos agentes. Al encenderlo se prueba antes: si falla, se queda apagado. */
export async function setMcpAgents(id: string, agents: unknown): Promise<McpServerInfo[]> {
  if (!registry) throw err(tr('Las extensiones no están disponibles'))
  const wanted = Array.isArray(agents) ? agents.filter(isMcpAgentKind) : []
  const s = registry.get(id)
  if (!s) throw err(tr('Ese servidor ya no existe'))
  const adding = wanted.some((k) => !s.agents.includes(k))
  if (adding) {
    const test = await testServer(s)
    registry.setTest(id, test)
    if (!test.ok) {
      syncAgentConfigs()
      return registry.list()
    }
  }
  registry.setAgents(id, wanted)
  syncAgentConfigs()
  return registry.list()
}

/** Etiqueta corta y única para los archivos de una tarea. */
export function taskTag(): string {
  return randomBytes(6).toString('hex')
}

export function removeFiles(files: string[]): void {
  for (const f of files) rmSync(f, { force: true, recursive: true })
}
