// Acceso web por Tailscale: sirve la interfaz y la misma API que usa la app de escritorio a los demás
// dispositivos de tu red de Tailscale (móvil, portátil). Escucha solo en 127.0.0.1 y en la IP de Tailscale
// del equipo (nunca en la red local ni en internet) y exige el código de acceso en cada petición.
import { createReadStream, readFileSync, realpathSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createServer as createTlsServer, type Server as TlsServer } from 'node:https'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { hostname, networkInterfaces } from 'node:os'
import { basename, dirname, extname, join, normalize, sep } from 'node:path'
import { app } from 'electron'
import type { AgentConfig, CoworkEvent, WebAccessInfo } from '@shared/types'
import { tapEvents, tapMobileEvents } from './events'
import { savePastedFile } from './local'
import * as store from './projects'
import type { TlsPair } from './selfCert'
import { MobileApi } from './mobileApi'
import { handleRoutineWebhook } from './routines'
import { MobileBackend } from './mobileBackend'
import { MobileError } from './mobileErrors'
import { rejectUpgrade } from './mobileWebSocket'
import type { DeviceRegistry } from './devices'
import { createHash, randomBytes as randomId } from 'node:crypto'
import { createWriteStream, mkdirSync as makeDir, renameSync as renameFile, rmSync as removeFile, utimesSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { isExcluded } from '@shared/sync'
import { acceptsGzip, gzipStatic } from './staticGzip'
import { listDirectory, listRoots, normalizePath, walkTree, withinAny, writeZip, type AccessEntry } from './serverFiles'
import { MAX_INSTALLER_BYTES, currentRelease, isFeedFile, pruneInstallers, validDescriptor, writeFeedFile } from './clientRelease'

export type WebMethod = (...args: unknown[]) => unknown

/** Métodos de la API disponibles por web (los registra index.ts junto con los de la app). */
export const webMethods = new Map<string, WebMethod>()

const COOKIE = 'cowork_token'
/** Cambia en cada arranque de la app: la versión web lo usa para recargarse sola tras un reinicio. */
const BOOT_ID = randomBytes(6).toString('hex')
const MAX_JSON = 4 * 1024 * 1024
const MAX_UPLOAD = 25 * 1024 * 1024

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4'
}

export function newWebToken(): string {
  return randomBytes(18).toString('base64url')
}

/** IPv4 de Tailscale de este equipo (rango 100.64.0.0/10), si está conectado. */
export function tailscaleIPv4(): string | null {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue
      const [p, q] = a.address.split('.').map(Number)
      if (p === 100 && q >= 64 && q <= 127) return a.address
    }
  }
  return null
}

let servers: Server[] = []
let boundIp: string | null = null
// Versión HTTPS con certificado propio en el puerto siguiente (la que deja usar el micrófono desde otro equipo).
let tlsServers: TlsServer[] = []
const tlsIps = new Set<string>()
let tls: TlsPair | null = null
let certFor: ((ips: string[]) => TlsPair) | null = null
let current: { port: number; token: string } | null = null
let retryTimer: NodeJS.Timeout | null = null
let untap: (() => void) | null = null
let untapMobile: (() => void) | null = null
const clients = new Set<ServerResponse>()
let heartbeat: NodeJS.Timeout | null = null
let mobile: MobileApi | null = null
/** Carpeta del instalador del cliente de escritorio que sirve este servidor (null: no sirve ninguno). */
let clientReleaseDir: string | null = null

export function setClientReleaseDir(dir: string | null): void {
  clientReleaseDir = dir
}

function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function cookieToken(req: IncomingMessage): string {
  const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return m ? decodeURIComponent(m[1]) : ''
}

/** Qué ofrece este servidor a los clientes: archivos del disco (todos o solo los de los proyectos) y su registro. */
export interface FsAccess {
  /** null: todo el disco; si no, solo estas carpetas. */
  allowedRoots(): string[] | null
  /** Archivos y carpetas de la propia app que no se enseñan nunca (llaves, configuración con el código…). */
  protectedPaths(): string[]
  projects(): { name: string; dir: string }[]
  log(entry: Omit<AccessEntry, 't'>): void
  /** Manda un archivo o carpeta a la papelera de este equipo (nunca lo borra del todo). */
  trash(path: string): Promise<void>
}

let fsAccess: FsAccess | null = null

export function setFsAccess(access: FsAccess | null): void {
  fsAccess = access
}

/** Quién llama a la API de archivos: el dueño (código de acceso, navegador) o un cliente emparejado. */
function whoIs(req: IncomingMessage): { name: string; id?: string } {
  if (!current) return { name: 'Desconocido' }
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const token = cookieToken(req) || bearer
  if (sameToken(token, current.token)) return { name: 'Código de acceso (navegador)' }
  return mobile?.clientDeviceFor(token, req.socket.remoteAddress) ?? { name: 'Desconocido' }
}

const FS_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Cache-Control': 'no-store' }

/** Lo que bajan clientes y navegadores del disco del servidor: ver, leer y bajar carpetas como zip. */
async function handleFs(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (!fsAccess) return json(res, 503, { error: 'Este servidor no comparte archivos' })
  const writes = req.method === 'PUT' || req.method === 'POST'
  if (req.method !== 'GET' && !writes) return json(res, 405, { error: 'Método no permitido' })
  const who = whoIs(req)
  const access = fsAccess
  const log = (action: AccessEntry['action'], path: string, extra: Partial<AccessEntry> = {}): void =>
    access.log({ device: who.name, ...(who.id ? { deviceId: who.id } : {}), ...(req.socket.remoteAddress ? { ip: req.socket.remoteAddress } : {}), action, path, ...extra })
  const restricted = access.allowedRoots()
  const sub = url.pathname.slice('/api/fs/'.length)

  if (writes !== (sub === 'file' || sub === 'mkdir' || sub === 'trash')) return json(res, 405, { error: 'Método no permitido' })

  if (sub === 'roots') {
    const roots = listRoots({ projects: access.projects() }).filter((r) => !restricted || r.kind === 'project')
    return json(res, 200, { roots, restricted: !!restricted, platform: process.platform, sep })
  }

  const abs = normalizePath(url.searchParams.get('path'))
  if (!abs) return json(res, 400, { error: 'Ruta no válida' })
  if (withinAny(abs, access.protectedPaths())) {
    log('denied', abs, { note: 'archivo de la propia app' })
    return json(res, 403, { error: 'Ese archivo es de la propia app y no se comparte' })
  }
  if (restricted) {
    let real = abs
    try {
      real = realpathSync(abs)
    } catch {
      /* no existe: se comprueba la ruta tal cual */
    }
    if (!withinAny(abs, restricted) || !withinAny(real, restricted)) {
      log('denied', abs, { note: 'restringido a las carpetas de los proyectos' })
      return json(res, 403, { error: 'Este servidor limita a los clientes a las carpetas de los proyectos' })
    }
  }
  // Escribir: subir un archivo (con su fecha), crear una carpeta o mandar algo a la papelera.
  if (sub === 'file') {
    let existing
    try {
      existing = statSync(abs)
    } catch {
      existing = null
    }
    if (existing?.isDirectory()) return json(res, 400, { error: 'Es una carpeta' })
    const expect = url.searchParams.get('expect')
    if (expect === 'none' && existing) return json(res, 409, { error: 'Ya existe en el servidor', mtime: Math.round(existing.mtimeMs), size: existing.size })
    if (expect && expect !== 'none') {
      const wanted = Number(expect)
      if (!existing || !Number.isFinite(wanted) || Math.abs(Math.round(existing.mtimeMs) - wanted) > 2) {
        return json(res, 409, { error: 'Cambió en el servidor mientras tanto', ...(existing ? { mtime: Math.round(existing.mtimeMs), size: existing.size } : {}) })
      }
    }
    const tmp = join(dirname(abs), `.cowork-${randomId(6).toString('hex')}.part`)
    try {
      makeDir(dirname(abs), { recursive: true })
      await pipeline(req, createWriteStream(tmp))
      const mtime = Number(url.searchParams.get('mtime'))
      if (Number.isFinite(mtime) && mtime > 0) utimesSync(tmp, mtime / 1000, mtime / 1000)
      renameFile(tmp, abs)
      const done = statSync(abs)
      log('write', abs, { bytes: done.size })
      return json(res, 200, { size: done.size, mtime: Math.round(done.mtimeMs) })
    } catch (e) {
      try {
        removeFile(tmp, { force: true })
      } catch {
        /* nada que limpiar */
      }
      return json(res, 500, { error: (e as Error).message })
    }
  }
  if (sub === 'mkdir') {
    try {
      makeDir(abs, { recursive: true })
      log('mkdir', abs)
      return json(res, 200, { ok: true })
    } catch (e) {
      return json(res, 500, { error: (e as Error).message })
    }
  }
  if (sub === 'trash') {
    try {
      statSync(abs)
    } catch {
      return json(res, 404, { error: 'No existe' })
    }
    try {
      await access.trash(abs)
      log('trash', abs)
      return json(res, 200, { ok: true })
    } catch (e) {
      return json(res, 500, { error: (e as Error).message })
    }
  }

  let st
  try {
    st = statSync(abs)
  } catch {
    return json(res, 404, { error: 'No existe' })
  }

  // Todo lo que hay bajo una carpeta (para sincronizar); y la huella de un archivo para saber si dos son iguales.
  if (sub === 'tree') {
    if (!st.isDirectory()) return json(res, 400, { error: 'No es una carpeta' })
    const patterns = (url.searchParams.get('exclude') ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 100)
    const protectedPaths = access.protectedPaths()
    const tree = await walkTree(abs, { skip: (rel, full) => isExcluded(rel, patterns) || withinAny(full, protectedPaths) })
    return json(res, 200, tree)
  }
  if (sub === 'hash') {
    if (!st.isFile()) return json(res, 400, { error: 'No es un archivo' })
    const hash = createHash('sha256')
    try {
      await pipeline(createReadStream(abs), hash)
      return json(res, 200, { sha256: hash.digest('hex'), size: st.size })
    } catch (e) {
      return json(res, 500, { error: (e as Error).message })
    }
  }

  if (sub === 'list') {
    if (!st.isDirectory()) return json(res, 400, { error: 'No es una carpeta' })
    try {
      const { entries, truncated } = await listDirectory(abs)
      log('list', abs)
      const parent = dirname(abs)
      const up = parent === abs || (restricted && !withinAny(parent, restricted)) ? null : parent
      return json(res, 200, { path: abs, parent: up, entries, truncated })
    } catch (e) {
      return json(res, 403, { error: (e as NodeJS.ErrnoException).code === 'EACCES' ? 'Sin permiso para ver esta carpeta' : (e as Error).message })
    }
  }

  if (sub === 'read') {
    if (!st.isFile()) return json(res, 400, { error: 'No es un archivo' })
    const type = TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream'
    const name = encodeURIComponent(basename(abs))
    const disposition = url.searchParams.get('download') === '1' ? 'attachment' : 'inline'
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
    let start = 0
    let end = st.size - 1
    let status = 200
    if (range && st.size > 0) {
      start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2] || 0))
      end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1
      if (start > end || start >= st.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` })
        return void res.end()
      }
      status = 206
    }
    res.writeHead(status, {
      ...FS_HEADERS,
      'Content-Type': type,
      'Content-Length': st.size === 0 ? 0 : end - start + 1,
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `${disposition}; filename*=UTF-8''${name}`,
      ...(status === 206 ? { 'Content-Range': `bytes ${start}-${end}/${st.size}` } : {})
    })
    log('read', abs, { bytes: st.size === 0 ? 0 : end - start + 1 })
    if (st.size === 0) return void res.end()
    createReadStream(abs, { start, end }).on('error', () => res.destroy()).pipe(res)
    return
  }

  if (sub === 'zip') {
    const name = encodeURIComponent(`${basename(abs) || 'disco'}.zip`)
    res.writeHead(200, { ...FS_HEADERS, 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${name}` })
    const protectedPaths = access.protectedPaths()
    try {
      const r = await writeZip(abs, res, { skip: (p) => withinAny(p, protectedPaths) })
      log('zip', abs, { bytes: r.bytes, note: `${r.files} archivos${r.skipped ? `, ${r.skipped} omitidos` : ''}` })
    } catch (e) {
      log('zip', abs, { note: `cortado: ${(e as Error).message}` })
      res.destroy()
    }
    return
  }

  return json(res, 404, { error: 'Función no válida' })
}

/** Solo quien tiene el código de acceso del servidor (no la llave de un dispositivo) puede publicar instaladores. */
function isOwner(req: IncomingMessage): boolean {
  if (!current) return false
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  return sameToken(cookieToken(req) || bearer, current.token)
}

function authorized(req: IncomingMessage): boolean {
  if (!current) return false
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  const supplied = cookieToken(req) || bearer
  // El código de acceso (navegador) o el token de un cliente de escritorio emparejado (revocable por separado).
  return sameToken(supplied, current.token) || (mobile?.acceptsClient(supplied, req.socket.remoteAddress) ?? false)
}

function send(res: ServerResponse, status: number, body: string | Buffer, type = 'text/plain; charset=utf-8', extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...extra })
  res.end(body)
}

function json(res: ServerResponse, status: number, data: unknown): void {
  send(res, status, JSON.stringify(data), 'application/json; charset=utf-8')
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > limit) {
        reject(new Error('Demasiado grande'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const LOGIN_PAGE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>kywai</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060a12;color:#e9eef8;font:15px system-ui,sans-serif}
form{width:min(340px,90vw);padding:28px;border-radius:16px;background:#0e1524;border:1px solid #23324d}h1{margin:0 0 6px;font-size:20px}
p{margin:0 0 18px;color:#9aa8bf;line-height:1.45}input{width:100%;box-sizing:border-box;height:42px;padding:0 12px;border-radius:10px;border:1px solid #2c3d5c;background:#0a101d;color:#e9eef8;font-size:15px}
button{margin-top:12px;width:100%;height:42px;border:0;border-radius:10px;background:#38d6ff;color:#04121c;font-weight:650;font-size:15px}</style></head>
<body><form method="get" action="/"><h1>kywai</h1><p>Abre el enlace de acceso que muestra kywai en el Mac (⚙ → Ajustes → Acceso desde otros dispositivos), o pega aquí su código.</p>
<input name="t" placeholder="Código de acceso" autocomplete="off" autofocus required><button>Entrar</button></form></body></html>`

function rendererDir(): string {
  return join(app.getAppPath(), 'out', 'renderer')
}

/** Archivos de la interfaz (sin salir de out/renderer). index.html avisa a la interfaz de que va por web. */
function serveStatic(res: ServerResponse, pathname: string, acceptEncoding?: string | string[]): void {
  const root = rendererDir()
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1))
  const abs = normalize(join(root, rel))
  if (!abs.startsWith(root + sep) && abs !== root) return send(res, 403, 'Forbidden')
  let st
  try {
    st = statSync(abs)
  } catch {
    return send(res, 404, 'Not found')
  }
  if (!st.isFile()) return send(res, 404, 'Not found')
  if (rel === 'index.html') {
    const html = readFileSync(abs, 'utf8').replace('<script type="module"', '<script src="/__cowork_web.js"></script>\n    <script type="module"')
    return send(res, 200, html, TYPES['.html'])
  }
  const headers = {
    'Content-Type': TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding'
  }
  // Comprimida: la interfaz baja en menos de un tercio (cuenta por Tailscale: navegador y clientes).
  const gz = acceptsGzip(acceptEncoding) ? gzipStatic(abs, st) : null
  if (gz) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': gz.length })
    res.end(gz)
    return
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size })
  createReadStream(abs).pipe(res)
}

/** Archivos de un proyecto (adjuntos, resultados, carpeta de trabajo). Se sirven aislados (sandbox). */
function serveProjectFile(res: ServerResponse, pathname: string): void {
  const segments = pathname.slice('/api/file/'.length).split('/').filter(Boolean).map((s) => decodeURIComponent(s))
  const [projectId, ...rest] = segments
  if (!store.isValidProjectId(projectId) || !rest.length || rest.some((s) => s === '..' || s.includes('\\') || s.includes('\0'))) {
    return send(res, 403, 'Forbidden')
  }
  let abs: string | null = null
  try {
    abs = store.resolveProjectFile(projectId, rest.join('/'))
  } catch {
    abs = null
  }
  if (!abs) return send(res, 404, 'Not found')
  const st = statSync(abs)
  if (!st.isFile()) return send(res, 404, 'Not found')
  res.writeHead(200, {
    'Content-Type': TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': st.size,
    'X-Content-Type-Options': 'nosniff',
    // Un HTML creado por un agente no puede usar la sesión de kywai aunque se abra directamente.
    'Content-Security-Policy': 'sandbox allow-scripts',
    'Cache-Control': 'no-cache'
  })
  createReadStream(abs).pipe(res)
}

function openEvents(req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })
  res.write('retry: 3000\n\n')
  res.write(`event: hello\ndata: ${JSON.stringify({ boot: BOOT_ID })}\n\n`)
  clients.add(res)
  req.on('close', () => clients.delete(res))
}

/**
 * Lo que sale por web nunca lleva el código de acceso: la interfaz web no lo necesita y, si lo llevara, un cliente
 * emparejado (cuya llave se puede revocar) podría quedarse con él y seguir entrando tras revocarlo.
 */
export function withoutAccessCode(e: CoworkEvent): CoworkEvent {
  if (e.kind !== 'config.updated') return e
  return { ...e, config: { ...e.config, webAccess: { ...e.config.webAccess, token: '' } } }
}

/** Respuesta de un método por web: getConfig sin el código y, para quien no es el dueño, el enlace HTTPS sin él. */
export function webResult(name: string, result: unknown, owner: boolean): unknown {
  if (name === 'getConfig' && result && typeof result === 'object' && 'webAccess' in result) {
    const config = result as { webAccess: Record<string, unknown> }
    return { ...config, webAccess: { ...config.webAccess, token: '' } }
  }
  if (name === 'getHttpsLink' && !owner && result && typeof result === 'object' && 'url' in result) {
    const link = result as { url: string }
    return { ...link, url: link.url.replace(/\/\?t=[^&#]*$/, '/') }
  }
  return result
}

function broadcast(e: CoworkEvent): void {
  // Un fallo de un consumidor móvil no debe impedir la entrega SSE que ya usa la interfaz web.
  try { mobile?.broadcast(e) } catch (error) { console.error('[cowork] mobile event', error) }
  if (!clients.size) return
  const msg = `data: ${JSON.stringify(withoutAccessCode(e))}\n\n`
  for (const c of clients) c.write(msg)
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Webhooks de las rutinas: se identifican con el secreto de cada rutina, nunca con el código de acceso.
  if (await handleRoutineWebhook(req, res)) return
  if (mobile && await mobile.handle(req, res)) return
  const url = new URL(req.url ?? '/', 'http://cowork')
  const path = url.pathname

  // Enlace de acceso (?t=…): guarda el código en una cookie y limpia la dirección.
  const t = url.searchParams.get('t')
  if (t != null && req.method === 'GET') {
    if (current && sameToken(t.trim(), current.token)) {
      res.writeHead(302, {
        'Set-Cookie': `${COOKIE}=${encodeURIComponent(current.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`,
        Location: '/'
      })
      res.end()
      return
    }
    return send(res, 401, LOGIN_PAGE, TYPES['.html'])
  }

  if (!authorized(req)) {
    if (path.startsWith('/api/')) return json(res, 401, { error: 'Sin acceso: abre el enlace de acceso de kywai' })
    return send(res, 401, LOGIN_PAGE, TYPES['.html'])
  }

  if (path === '/__cowork_web.js') {
    return send(res, 200, `window.__COWORK_WEB__ = true\nwindow.__COWORK_BOOT__ = ${JSON.stringify(BOOT_ID)}\n`, TYPES['.js'])
  }
  if (path === '/api/ping' && req.method === 'GET') return json(res, 200, { boot: BOOT_ID })
  if (path === '/api/events' && req.method === 'GET') return openEvents(req, res)
  if (path.startsWith('/api/file/') && req.method === 'GET') return serveProjectFile(res, path)

  if (path.startsWith('/api/fs/')) return handleFs(req, res, url)

  // Canal de actualización del cliente de escritorio: lo lee electron-updater (GET) y lo publica el dueño (PUT).
  if (path.startsWith('/app/client/') && req.method === 'GET') {
    const name = decodeURIComponent(path.slice('/app/client/'.length))
    if (!clientReleaseDir || !isFeedFile(name)) return send(res, 404, 'Not found')
    let st
    try {
      st = statSync(join(clientReleaseDir, name))
    } catch {
      return send(res, 404, 'Not found')
    }
    if (!st.isFile()) return send(res, 404, 'Not found')
    res.writeHead(200, {
      'Content-Type': name.endsWith('.yml') ? 'text/yaml; charset=utf-8' : 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store'
    })
    createReadStream(join(clientReleaseDir, name)).pipe(res)
    return
  }
  if (path.startsWith('/api/client-release/') && req.method === 'PUT') {
    if (!isOwner(req)) return json(res, 403, { error: 'Publicar el cliente exige el código de acceso del servidor' })
    const name = decodeURIComponent(path.slice('/api/client-release/'.length))
    if (!clientReleaseDir) return json(res, 503, { error: 'Este servidor no guarda instaladores del cliente' })
    if (!isFeedFile(name)) return json(res, 400, { error: 'Nombre de archivo no válido' })
    try {
      const body = await readBody(req, name === 'latest.yml' ? 64 * 1024 : MAX_INSTALLER_BYTES)
      if (name === 'latest.yml') {
        const problem = validDescriptor(clientReleaseDir, body.toString('utf8'))
        if (problem) return json(res, 400, { error: problem })
      }
      writeFeedFile(clientReleaseDir, name, body)
      if (name === 'latest.yml') {
        const release = currentRelease(clientReleaseDir)
        if (release) pruneInstallers(clientReleaseDir, [release.file])
        return json(res, 200, { published: release })
      }
      return json(res, 200, { saved: name, size: body.length })
    } catch (e) {
      return json(res, 400, { error: (e as Error).message })
    }
  }

  if (path === '/api/upload' && req.method === 'POST') {
    try {
      const body = await readBody(req, MAX_UPLOAD)
      return json(res, 200, { path: savePastedFile(url.searchParams.get('name') ?? '', body) })
    } catch (e) {
      return json(res, 400, { error: (e as Error).message })
    }
  }

  if (path.startsWith('/api/call/') && req.method === 'POST') {
    const name = path.slice('/api/call/'.length)
    const fn = webMethods.get(name)
    if (!fn) return json(res, 404, { error: 'Esta función solo está disponible en el Mac' })
    try {
      const body = await readBody(req, MAX_JSON)
      const parsed = body.length ? (JSON.parse(body.toString('utf8')) as { args?: unknown }) : {}
      const args = Array.isArray(parsed.args) ? parsed.args : []
      const result = webResult(name, await fn(...args), isOwner(req))
      return json(res, 200, { result: result ?? null })
    } catch (e) {
      return json(res, 400, { error: (e as Error).message || 'Error' })
    }
  }

  if (req.method === 'GET' && !path.startsWith('/api/')) return serveStatic(res, path, req.headers['accept-encoding'])
  return send(res, 404, 'Not found')
}

function listen(host: string, port: number): Promise<Server>
function listen(host: string, port: number, secure: TlsPair): Promise<TlsServer>
function listen(host: string, port: number, secure?: TlsPair): Promise<Server | TlsServer> {
  return new Promise((resolve, reject) => {
    const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
      handle(req, res).catch((e) => {
        console.error('[cowork] web', e)
        if (!res.headersSent) send(res, 500, 'Error')
      })
    }
    const srv = secure ? createTlsServer({ key: secure.key, cert: secure.cert }, onRequest) : createServer(onRequest)
    srv.on('upgrade', (req, socket, head) => {
      if (mobile) mobile.upgrade(req, socket, head)
      else rejectUpgrade(socket, new MobileError(503, 'UNAVAILABLE', 'El acceso remoto está detenido', true))
    })
    srv.once('error', reject)
    srv.listen(port, host, () => resolve(srv))
  })
}

/** Abre la versión HTTPS en estas IPs (con un certificado que las cubra a todas). */
async function startTls(ips: string[]): Promise<void> {
  if (!current || !certFor) return
  const missing = ips.filter((ip) => !tlsIps.has(ip))
  if (!missing.length) return
  try {
    const pair = certFor([...tlsIps, ...missing])
    // Certificado nuevo (con una IP más): lo usan también los servidores que ya estaban abiertos.
    if (tls && pair.cert !== tls.cert) for (const srv of tlsServers) srv.setSecureContext({ key: pair.key, cert: pair.cert })
    tls = pair
    for (const ip of missing) {
      tlsServers.push(await listen(ip, current.port + 1, pair))
      tlsIps.add(ip)
    }
  } catch (e) {
    console.error('[cowork] web: no se pudo abrir la versión HTTPS propia', e)
  }
}

/** Código de 6 cifras para emparejar la app del móvil (null si el acceso web está apagado). */
export function mobilePairingPin(): { pin: string; expiresAt: number } | null {
  return mobile?.newPin() ?? null
}

/** Revoca un dispositivo emparejado (corta también sus conexiones abiertas). */
export function revokeMobileDevice(id: string): boolean {
  return mobile?.revokeDevice(id) ?? false
}

/** Puerto de la versión HTTPS propia, si está abierta en la IP de Tailscale (o en este equipo). */
export function webHttpsPort(): number | null {
  return current && tlsIps.size ? current.port + 1 : null
}

/** Escucha también en la IP de Tailscale en cuanto aparezca (Tailscale puede conectarse después). */
async function bindTailscale(): Promise<void> {
  if (!current || boundIp) return
  const ip = tailscaleIPv4()
  if (!ip) return
  try {
    servers.push(await listen(ip, current.port))
    boundIp = ip
    await startTls([ip])
  } catch (e) {
    console.error('[cowork] web: no se pudo escuchar en Tailscale', e)
  }
}

/**
 * `certificate`: da un certificado para esas IPs (para la versión HTTPS propia, en el puerto siguiente).
 * `mobileKey`: clave guardada para firmar los tokens del móvil (sin ella, los móviles se desemparejan al reiniciar).
 */
export async function startWebServer(
  port: number,
  token: string,
  certificate?: (ips: string[]) => TlsPair,
  agents?: () => AgentConfig[],
  mobileKey?: Buffer,
  devices?: DeviceRegistry
): Promise<void> {
  await stopWebServer()
  current = { port, token }
  mobile = new MobileApi(token, hostname().replace(/\.local$/i, ''), randomBytes(12).toString('hex'), new MobileBackend(webMethods, agents), mobileKey, devices)
  certFor = certificate ?? null
  servers.push(await listen('127.0.0.1', port))
  await startTls(['127.0.0.1'])
  await bindTailscale()
  retryTimer = setInterval(() => void bindTailscale(), 30_000)
  untap = tapEvents(broadcast)
  // Eventos que la interfaz web aún no conoce: solo al móvil.
  untapMobile = tapMobileEvents((e) => {
    try { mobile?.broadcast(e) } catch (error) { console.error('[cowork] mobile event', error) }
  })
  heartbeat = setInterval(() => {
    for (const c of clients) c.write(': ping\n\n')
  }, 20_000)
}

export async function stopWebServer(): Promise<void> {
  if (retryTimer) clearInterval(retryTimer)
  if (heartbeat) clearInterval(heartbeat)
  retryTimer = heartbeat = null
  untap?.()
  untapMobile?.()
  untap = untapMobile = null
  mobile?.close()
  mobile = null
  for (const c of clients) c.end()
  clients.clear()
  await Promise.all([...servers, ...tlsServers].map((s) => new Promise<void>((r) => s.close(() => r()))))
  servers = []
  tlsServers = []
  tlsIps.clear()
  tls = null
  boundIp = null
  current = null
}

/** Direcciones para abrir kywai desde otros dispositivos de Tailscale. */
export function webAccessInfo(enabled: boolean, port: number, token: string): WebAccessInfo {
  const ip = boundIp ?? tailscaleIPv4()
  // Nombre MagicDNS habitual: el del equipo en minúsculas, sin «.local».
  const name = hostname().replace(/\.local$/i, '').toLowerCase()
  const urls = enabled && current ? [ip && `http://${ip}:${port}`, name && `http://${name}:${port}`].filter((u): u is string => !!u) : []
  const secureUrl = enabled && current && ip && tlsIps.has(ip) ? `https://${ip}:${port + 1}` : null
  return { enabled, running: !!current, port, token: enabled ? token : '', tailscaleIp: ip, urls, listeningOnTailscale: !!boundIp, secureUrl }
}
