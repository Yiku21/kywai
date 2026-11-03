// Archivos del servidor para los clientes de escritorio: listar carpetas, leer archivos, bajar una carpeta como zip y
// el registro de lo que hizo cada dispositivo. Sin Electron, para poder probarlo.
import { existsSync, mkdirSync, promises as fsp, readFileSync, renameSync, statSync, appendFileSync } from 'node:fs'
import { createDeflateRaw } from 'node:zlib'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Writable } from 'node:stream'

export interface FsEntry {
  name: string
  kind: 'dir' | 'file'
  size: number
  mtime: number
  /** Es un enlace simbólico (se enseña, pero no se sigue al bajar una carpeta). */
  link?: boolean
}

export interface FsRoot {
  name: string
  path: string
  kind: 'home' | 'drive' | 'root' | 'project'
}

export const MAX_LIST_ENTRIES = 5000

/** Una ruta absoluta y limpia, o null (vacía, relativa o con caracteres que no valen en ninguna ruta). */
export function normalizePath(input: unknown): string | null {
  if (typeof input !== 'string' || !input || input.length > 4096 || input.includes('\0')) return null
  if (!isAbsolute(input)) return null
  return resolve(input)
}

const caseFold = (p: string): string => (process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p)

/** `abs` es `base` o está dentro de ella. */
export function isInside(abs: string, base: string): boolean {
  const rel = relative(caseFold(resolve(base)), caseFold(resolve(abs)))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function withinAny(abs: string, bases: string[]): boolean {
  return bases.some((b) => isInside(abs, b))
}

/** Dónde puede empezar a mirar el cliente: la carpeta del usuario, los discos y las carpetas de los proyectos. */
export function listRoots(options: { projects: { name: string; dir: string }[]; platform?: NodeJS.Platform; home?: string }): FsRoot[] {
  const platform = options.platform ?? process.platform
  const home = options.home ?? homedir()
  const roots: FsRoot[] = [{ name: 'Carpeta del usuario', path: home, kind: 'home' }]
  for (const p of options.projects) {
    if (p.dir && existsSync(p.dir)) roots.push({ name: `Proyecto · ${p.name}`, path: p.dir, kind: 'project' })
  }
  if (platform === 'win32') {
    for (let c = 65; c <= 90; c++) {
      const drive = `${String.fromCharCode(c)}:\\`
      try {
        if (statSync(drive).isDirectory()) roots.push({ name: `Disco ${String.fromCharCode(c)}:`, path: drive, kind: 'drive' })
      } catch {
        /* no existe */
      }
    }
  } else {
    roots.push({ name: 'Sistema de archivos (/)', path: '/', kind: 'root' })
    if (platform === 'darwin' && existsSync('/Volumes')) roots.push({ name: 'Discos y volúmenes', path: '/Volumes', kind: 'root' })
  }
  return roots
}

export async function listDirectory(abs: string): Promise<{ entries: FsEntry[]; truncated: boolean }> {
  const names = await fsp.readdir(abs, { withFileTypes: true })
  const entries: FsEntry[] = []
  for (const d of names) {
    if (entries.length >= MAX_LIST_ENTRIES) break
    const full = join(abs, d.name)
    try {
      const link = d.isSymbolicLink()
      const st = await fsp.stat(full) // sigue el enlace: es una carpeta o un archivo para quien navega
      entries.push({ name: d.name, kind: st.isDirectory() ? 'dir' : 'file', size: st.isDirectory() ? 0 : st.size, mtime: st.mtimeMs, ...(link ? { link: true } : {}) })
    } catch {
      /* ilegible o enlace roto: no se enseña */
    }
  }
  entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'es', { numeric: true, sensitivity: 'base' }) : a.kind === 'dir' ? -1 : 1))
  return { entries, truncated: names.length > entries.length }
}

// ---------- Árbol recursivo y huella (sincronización) ----------

export interface TreeResult {
  /** Archivos: ruta relativa con «/», tamaño y fecha de modificación (ms). */
  files: { p: string; s: number; m: number }[]
  dirs: string[]
  truncated: boolean
}

export const MAX_TREE_ENTRIES = 200_000

/** Todos los archivos y carpetas bajo `root`, sin enlaces simbólicos ni lo excluido ni lo protegido. */
export async function walkTree(root: string, options: { skip: (rel: string, abs: string) => boolean }): Promise<TreeResult> {
  const files: TreeResult['files'] = []
  const dirs: string[] = []
  let truncated = false
  async function walk(abs: string, rel: string): Promise<void> {
    let names
    try {
      names = await fsp.readdir(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const d of names) {
      if (files.length + dirs.length >= MAX_TREE_ENTRIES) {
        truncated = true
        return
      }
      if (d.isSymbolicLink()) continue
      const childRel = rel ? `${rel}/${d.name}` : d.name
      const childAbs = join(abs, d.name)
      if (options.skip(childRel, childAbs)) continue
      if (d.isDirectory()) {
        dirs.push(childRel)
        await walk(childAbs, childRel)
      } else if (d.isFile()) {
        try {
          const st = await fsp.stat(childAbs)
          files.push({ p: childRel, s: st.size, m: Math.round(st.mtimeMs) })
        } catch {
          /* desapareció o no se puede leer */
        }
      }
    }
  }
  await walk(root, '')
  return { files, dirs, truncated }
}

// ---------- Zip en streaming (sin dependencias) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32Update(crc: number, chunk: Buffer): number {
  let c = crc ^ 0xffffffff
  for (let i = 0; i < chunk.length; i++) c = CRC_TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(Math.max(ms, Date.UTC(1980, 0, 1)))
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  }
}

interface CentralEntry {
  name: Buffer
  crc: number
  comp: number
  size: number
  offset: number
  dir: boolean
  time: number
  date: number
}

const FOUR_GB = 0xffffffff

/**
 * Escribe `root` (carpeta o archivo) como zip en `out`, sin cargarlo en memoria. No sigue enlaces simbólicos, salta lo
 * ilegible y no admite más de 4 GB en total (zip clásico).
 */
export async function writeZip(root: string, out: Writable, options: { skip?: (abs: string) => boolean } = {}): Promise<{ files: number; bytes: number; skipped: number }> {
  const base = dirname(root)
  const central: CentralEntry[] = []
  let offset = 0
  let files = 0
  let bytes = 0
  let skipped = 0

  const write = (buf: Buffer): Promise<void> =>
    new Promise((res, rej) => {
      offset += buf.length
      if (out.write(buf)) return res()
      out.once('drain', res)
      out.once('error', rej)
    })

  const nameOf = (abs: string, dir: boolean): Buffer => Buffer.from(relative(base, abs).split(sep).join('/') + (dir ? '/' : ''), 'utf8')

  async function addDirectory(abs: string, mtime: number): Promise<void> {
    const name = nameOf(abs, true)
    const { time, date } = dosDateTime(mtime)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt16LE(time, 10)
    header.writeUInt16LE(date, 12)
    header.writeUInt16LE(name.length, 26)
    const start = offset
    await write(Buffer.concat([header, name]))
    central.push({ name, crc: 0, comp: 0, size: 0, offset: start, dir: true, time, date })
  }

  async function addFile(abs: string, size: number, mtime: number): Promise<void> {
    if (size > FOUR_GB) {
      skipped++
      return
    }
    // Se abre antes de escribir nada: un archivo ilegible se salta sin estropear el zip.
    let handle
    try {
      handle = await fsp.open(abs, 'r')
    } catch {
      skipped++
      return
    }
    const name = nameOf(abs, false)
    const { time, date } = dosDateTime(mtime)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0808, 6) // UTF-8 + tamaños tras los datos
    header.writeUInt16LE(8, 8) // deflate
    header.writeUInt16LE(time, 10)
    header.writeUInt16LE(date, 12)
    header.writeUInt16LE(name.length, 26)
    const start = offset
    await write(Buffer.concat([header, name]))

    let crc = 0
    let total = 0
    let comp = 0
    const deflate = createDeflateRaw({ level: 1 })
    const source = handle.createReadStream()
    try {
      await new Promise<void>((res, rej) => {
        source.on('data', (c) => {
          const chunk = c as Buffer
          crc = crc32Update(crc, chunk)
          total += chunk.length
        })
        source.on('error', rej)
        deflate.on('error', rej)
        deflate.on('data', (c: Buffer) => {
          comp += c.length
          if (!out.write(c)) {
            deflate.pause()
            out.once('drain', () => deflate.resume())
          }
          offset += c.length
        })
        deflate.on('end', res)
        source.pipe(deflate)
      })
    } catch {
      // Se leyó a medias: sin entrada válida no se puede seguir (el archivo ya empezó en el zip).
      throw new Error(`No se pudo leer ${abs}`)
    }
    const descriptor = Buffer.alloc(16)
    descriptor.writeUInt32LE(0x08074b50, 0)
    descriptor.writeUInt32LE(crc >>> 0, 4)
    descriptor.writeUInt32LE(comp, 8)
    descriptor.writeUInt32LE(total, 12)
    await write(descriptor)
    central.push({ name, crc, comp, size: total, offset: start, dir: false, time, date })
    files++
    bytes += total
    if (offset > FOUR_GB) throw new Error('La carpeta pasa de 4 GB: bájala por partes')
  }

  async function walk(abs: string): Promise<void> {
    if (options.skip?.(abs)) {
      skipped++
      return
    }
    let st
    try {
      st = await fsp.lstat(abs)
    } catch {
      skipped++
      return
    }
    if (st.isSymbolicLink()) {
      skipped++
      return
    }
    if (st.isDirectory()) {
      await addDirectory(abs, st.mtimeMs)
      let names: string[] = []
      try {
        names = (await fsp.readdir(abs)).sort()
      } catch {
        skipped++
      }
      for (const n of names) await walk(join(abs, n))
    } else if (st.isFile()) {
      // Si falla a mitad de un archivo el zip queda a medias: mejor cortar que entregar uno roto.
      await addFile(abs, st.size, st.mtimeMs)
    } else skipped++
  }

  await walk(root)

  const cdStart = offset
  for (const e of central) {
    const h = Buffer.alloc(46)
    h.writeUInt32LE(0x02014b50, 0)
    h.writeUInt16LE(0x031e, 4)
    h.writeUInt16LE(20, 6)
    h.writeUInt16LE(e.dir ? 0x0800 : 0x0808, 8)
    h.writeUInt16LE(e.dir ? 0 : 8, 10)
    h.writeUInt16LE(e.time, 12)
    h.writeUInt16LE(e.date, 14)
    h.writeUInt32LE(e.crc >>> 0, 16)
    h.writeUInt32LE(e.comp, 20)
    h.writeUInt32LE(e.size, 24)
    h.writeUInt16LE(e.name.length, 28)
    h.writeUInt32LE(e.dir ? 0x10 : 0, 38)
    h.writeUInt32LE(e.offset, 42)
    await write(Buffer.concat([h, e.name]))
  }
  const cdSize = offset - cdStart
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(cdSize, 12)
  end.writeUInt32LE(cdStart, 16)
  await write(end)
  await new Promise<void>((res) => out.end(res))
  return { files, bytes, skipped }
}

// ---------- Registro de accesos ----------

export interface AccessEntry {
  /** Milisegundos Unix. */
  t: number
  /** Quién: nombre del dispositivo, o «Código de acceso» si entró con el navegador. */
  device: string
  deviceId?: string
  ip?: string
  action: 'list' | 'read' | 'zip' | 'folder' | 'write' | 'mkdir' | 'trash' | 'denied'
  path: string
  /** Bytes enviados, si se sabe. */
  bytes?: number
  note?: string
}

const MAX_LOG_BYTES = 5 * 1024 * 1024

export class AccessLog {
  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now
  ) {}

  append(entry: Omit<AccessEntry, 't'>): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      try {
        if (statSync(this.file).size > MAX_LOG_BYTES) renameSync(this.file, `${this.file}.1`)
      } catch {
        /* todavía no existe */
      }
      appendFileSync(this.file, `${JSON.stringify({ t: this.now(), ...entry })}\n`, { encoding: 'utf8', mode: 0o600 })
    } catch (e) {
      console.error('[cowork] registro de accesos: no se pudo escribir', e)
    }
  }

  /** Las últimas entradas, de la más reciente a la más antigua. */
  read(limit = 200): AccessEntry[] {
    const out: AccessEntry[] = []
    for (const f of [this.file, `${this.file}.1`]) {
      let text = ''
      try {
        text = readFileSync(f, 'utf8')
      } catch {
        continue
      }
      const lines = text.split('\n').filter(Boolean)
      for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
        try {
          out.push(JSON.parse(lines[i]) as AccessEntry)
        } catch {
          /* línea a medias */
        }
      }
      if (out.length >= limit) break
    }
    return out
  }
}
