// Archivos para la API móvil: descarga de resultados, adjuntos y archivos de la carpeta de trabajo, lista de esa
// carpeta y subida de adjuntos. Todo con fs asíncrono y límites fijos, sin salir de las carpetas del proyecto.
import { createWriteStream, promises as fsp } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { MobileFolderFile } from '@shared/mobile'
import { MobileError } from './mobileErrors'
import { artifactKind, projectsRoot, resolveInProject } from './projects'

/** Máximo de un archivo que se sube o se descarga. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024
/** Carpetas que no se recorren (además de las ocultas). */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'release', '__pycache__'])
const limits = { files: 2000, scan: 20_000, depth: 8 }

/** Solo para las pruebas: límites pequeños para comprobar el recorte. Devuelve cómo restaurarlos. */
export function __setFileLimitsForChecks(next: Partial<typeof limits>): () => void {
  const previous = { ...limits }
  Object.assign(limits, next)
  return () => void Object.assign(limits, previous)
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.markdown': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.apk': 'application/vnd.android.package-archive',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4'
}

/** Por extensión; el resto del código (ts, py…) como texto plano y lo desconocido como binario. */
export function contentType(name: string): string {
  const ext = extname(name).toLowerCase()
  if (TYPES[ext]) return TYPES[ext]
  const kind = artifactKind(name)
  return ext && (kind === 'code' || kind === 'text') ? 'text/plain; charset=utf-8' : 'application/octet-stream'
}

/** RFC 5987/6266: el nombre en UTF-8, sin comillas que escapar. */
function disposition(name: string): string {
  return `inline; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
}

function within(base: string, abs: string): boolean {
  const rel = relative(base, abs)
  return !!rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/** Ruta relativa con «/», sin «..», sin «\» y no absoluta (400 si no lo es). */
export function relPath(input: unknown, name = 'path'): string {
  if (typeof input !== 'string' || !input || input.length > 4096 || input.includes('\0') || input.includes('\\') ||
      input.startsWith('/') || /^[A-Za-z]:/.test(input) || input.split('/').some((s) => !s || s === '.' || s === '..')) {
    throw new MobileError(400, 'INVALID_INPUT', `${name} no válido`)
  }
  return input
}

/** Archivo dentro de `base` (también una vez resueltos los enlaces simbólicos), o null. */
export async function resolveInside(base: string, rel: string): Promise<string | null> {
  const abs = resolveInProject(base, rel)
  if (!abs) return null
  try {
    const [realBase, real] = await Promise.all([fsp.realpath(base), fsp.realpath(abs)])
    return within(realBase, real) ? real : null
  } catch {
    return null
  }
}

/** Envía el archivo tal cual, aislado como en /api/file (sandbox) y sin caché. */
export async function sendFile(res: ServerResponse, abs: string, missing: MobileError): Promise<void> {
  let handle: import('node:fs/promises').FileHandle
  try {
    handle = await fsp.open(abs, 'r')
  } catch {
    throw missing
  }
  try {
    const st = await handle.stat()
    if (!st.isFile()) throw missing
    if (st.size > MAX_FILE_BYTES) throw new MobileError(413, 'FILE_TOO_LARGE', 'El archivo supera 25 MB')
    res.writeHead(200, {
      'Content-Type': contentType(abs),
      'Content-Length': st.size,
      'Content-Disposition': disposition(basename(abs)),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      // Un HTML creado por un agente no puede usar nada de kywai aunque se abra directamente.
      'Content-Security-Policy': 'sandbox allow-scripts'
    })
    await pipeline(handle.createReadStream({ autoClose: false }), res)
  } finally {
    await handle.close().catch(() => {})
  }
}

/**
 * Archivos de la carpeta de trabajo, de los menos profundos a los más (sin ocultas ni carpetas de dependencias o
 * compilados; hasta 8 niveles). `truncated` si había más de los que caben o se agotó el recorrido.
 */
export async function listFolder(dir: string, q: string): Promise<{ files: MobileFolderFile[]; truncated: boolean }> {
  const files: MobileFolderFile[] = []
  const needle = q.toLowerCase()
  // Si la carpeta contiene los datos de kywai (p. ej. la propia app), se ignoran.
  const internal = projectsRoot() ? resolve(projectsRoot(), '..').toLowerCase() : ''
  const queue: Array<{ rel: string; depth: number }> = [{ rel: '', depth: 0 }]
  let scanned = 0
  let truncated = false
  while (queue.length && !truncated) {
    const { rel, depth } = queue.shift()!
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(rel ? join(dir, rel) : dir, { withFileTypes: true })
    } catch {
      continue
    }
    const found: string[] = []
    for (const e of entries) {
      if (++scanned > limits.scan) {
        truncated = true
        break
      }
      const child = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name) || depth >= limits.depth) continue
        if (internal && resolve(dir, child).toLowerCase() === internal) continue
        queue.push({ rel: child, depth: depth + 1 })
      } else if (e.isFile() && (!needle || child.toLowerCase().includes(needle))) {
        found.push(child)
      }
    }
    for (let i = 0; i < found.length && !truncated; i += 32) {
      const batch = found.slice(i, i + 32)
      const stats = await Promise.all(batch.map((p) => fsp.stat(join(dir, p)).catch(() => null)))
      for (let j = 0; j < batch.length; j++) {
        const st = stats[j]
        if (!st?.isFile()) continue
        if (files.length >= limits.files) {
          truncated = true
          break
        }
        files.push({ path: batch[j], name: basename(batch[j]), size: st.size, modifiedAt: Math.floor(st.mtimeMs), kind: artifactKind(batch[j]) })
      }
    }
  }
  files.sort((a, b) => b.modifiedAt - a.modifiedAt || a.path.localeCompare(b.path))
  return { files, truncated }
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i

/** Nombre del archivo subido: solo el último tramo, sin caracteres de control ni los que Windows no admite. */
export function uploadName(input: string | null): string {
  let name = (input ?? '').split(/[\\/]/).pop()!
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, '')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .replace(/[. ]+$/, '')
  if (name.length > 200) {
    const ext = extname(name)
    name = (ext.length < 20 ? name.slice(0, 200 - ext.length) + ext : name.slice(0, 200)).replace(/[. ]+$/, '')
  }
  if (!name || /^\.+$/.test(name)) throw new MobileError(400, 'INVALID_INPUT', 'name debe ser un nombre de archivo')
  return RESERVED.test(name) ? `_${name}` : name
}

/**
 * Guarda el cuerpo de la petición tal cual (cualquier tipo, hasta 25 MB) en una carpeta temporal nueva, con ese
 * nombre. Quien llama borra `dir` al terminar.
 */
export async function receiveUpload(req: IncomingMessage, name: string): Promise<{ dir: string; file: string; size: number }> {
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new MobileError(415, 'UNSUPPORTED_ENCODING', 'Envía el archivo sin comprimir')
  if (Number(req.headers['content-length'] ?? 0) > MAX_FILE_BYTES) { req.resume(); throw new MobileError(413, 'PAYLOAD_TOO_LARGE', 'El archivo supera 25 MB') }
  const dir = await fsp.mkdtemp(join(tmpdir(), 'aicw-upload-'))
  const file = join(dir, name)
  const out = createWriteStream(file, { flags: 'wx' })
  try {
    const size = await new Promise<number>((done, reject) => {
      let length = 0
      let failed = false
      let ended = false
      const fail = (error: unknown): void => {
        if (failed) return
        failed = true
        out.destroy()
        // El resto del cuerpo se descarta para poder responder.
        req.resume()
        reject(error)
      }
      const interrupted = (): void => fail(new MobileError(400, 'INVALID_INPUT', 'La petición se interrumpió'))
      // Lo que sigue es síncrono: un corte anterior se ve aquí y uno posterior llega por los eventos.
      if (req.destroyed) return interrupted()
      out.once('error', fail)
      req.on('data', (data: Buffer) => {
        if (failed) return
        length += data.length
        if (length > MAX_FILE_BYTES) return fail(new MobileError(413, 'PAYLOAD_TOO_LARGE', 'El archivo supera 25 MB'))
        if (!out.write(data)) {
          req.pause()
          out.once('drain', () => { if (!failed) req.resume() })
        }
      })
      req.once('end', () => {
        ended = true
        if (!failed) out.end(() => done(length))
      })
      req.once('error', fail)
      req.once('aborted', interrupted)
      req.once('close', () => { if (!ended) interrupted() })
    })
    return { dir, file, size }
  } catch (e) {
    if (!out.closed) await new Promise((r) => out.once('close', r))
    await fsp.rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
    throw e
  }
}
