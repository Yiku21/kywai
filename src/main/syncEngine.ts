// Motor de sincronización de una pareja de carpetas (una de este equipo, una del servidor). Hace una ronda: mira los
// dos lados, decide con `planSync` y lo ejecuta; el estado de la ronda anterior (la «base») dice qué cambió desde
// entonces. No sabe nada de Electron ni de la red: la entrada y la salida llegan por `LocalIO` y `RemoteIO`.
import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  conflictName,
  isExcluded,
  planSync,
  sameMtime,
  type BaseState,
  type FileState,
  type SyncAction,
  type SyncNotice,
  type SyncPairConfig
} from '@shared/sync'
import { walkTree } from './serverFiles'

export interface TreeSnapshot {
  files: Map<string, FileState>
  dirs: Set<string>
  truncated: boolean
}

export interface LocalIO {
  tree(dir: string, exclude: string[]): Promise<TreeSnapshot>
  hash(abs: string): Promise<string>
  mkdir(abs: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  /** A la papelera del sistema. */
  trash(abs: string): Promise<void>
  /** Borra una carpeta solo si está vacía; true si se borró. */
  rmdirIfEmpty(abs: string): Promise<boolean>
  setMtime(abs: string, ms: number): Promise<void>
  stat(abs: string): Promise<FileState | null>
}

export class RemoteConflict extends Error {}

export interface RemoteIO {
  /** Ruta absoluta en el servidor de una ruta relativa con «/». */
  abs(base: string, rel: string): string
  tree(dir: string, exclude: string[]): Promise<TreeSnapshot>
  download(remoteAbs: string, localAbs: string, mtime: number): Promise<void>
  /** `expect`: la fecha que se creía que tenía allí (o 'none' si no debía existir). Lanza RemoteConflict si cambió. */
  upload(localAbs: string, remoteAbs: string, mtime: number, expect: number | 'none'): Promise<void>
  mkdir(remoteAbs: string): Promise<void>
  trash(remoteAbs: string): Promise<void>
  hash(remoteAbs: string): Promise<string>
}

export interface SyncContext {
  /** Nombre de este equipo (va en el nombre de las copias de conflicto). */
  device: string
  now: () => Date
  activity: (message: string) => void
  notice: (n: Omit<SyncNotice, 't'>) => void
  /** El usuario confirmó que se borren muchos archivos de golpe en esta ronda. */
  confirmDeletes: boolean
  /** Cuántos borrados de golpe se consideran sospechosos (por defecto, más de 25 y más del 30 % de lo sincronizado). */
  maxDeletes?: (tracked: number) => number
}

export interface SyncResult {
  uploaded: number
  downloaded: number
  deletedLocal: number
  deletedRemote: number
  conflicts: number
  /** Se paró sin hacer nada por esta razón. */
  paused?: string
  errors: string[]
}

const defaultMaxDeletes = (tracked: number): number => Math.max(25, Math.floor(tracked * 0.3))

const toLocal = (dir: string, rel: string): string => join(dir, ...rel.split('/'))

/** Una ronda de sincronización. Devuelve la base nueva en `base` (modificada en sitio). */
export async function syncOnce(pair: SyncPairConfig, base: BaseState, io: { local: LocalIO; remote: RemoteIO }, ctx: SyncContext): Promise<SyncResult> {
  const result: SyncResult = { uploaded: 0, downloaded: 0, deletedLocal: 0, deletedRemote: 0, conflicts: 0, errors: [] }
  const { local, remote } = io

  ctx.activity('Mirando los cambios…')
  const [l, r] = await Promise.all([local.tree(pair.localDir, pair.exclude), remote.tree(pair.remoteDir, pair.exclude)])
  if (l.truncated || r.truncated) {
    result.paused = 'La carpeta tiene demasiados archivos para sincronizarla entera (más de 200 000). Elige una subcarpeta.'
    return result
  }

  const actions = planSync(base, l.files, r.files, l.dirs, r.dirs)
  const deletions = actions.filter((a) => a.kind === 'deleteLocal' || a.kind === 'deleteRemote')
  const tracked = Object.keys(base.files).length
  const limit = (ctx.maxDeletes ?? defaultMaxDeletes)(tracked)
  if (deletions.length > limit && !ctx.confirmDeletes) {
    const side = deletions.filter((a) => a.kind === 'deleteLocal').length >= deletions.length / 2 ? 'aquí (porque ya no están en el servidor)' : 'en el servidor (porque ya no están aquí)'
    result.paused = `Se iban a borrar ${deletions.length} archivos de golpe ${side}. Por si ha sido un error, no se ha tocado nada: revisa y confirma.`
    return result
  }

  const done = (path: string, state: FileState): void => {
    base.files[path] = { size: state.size, mtime: state.mtime }
  }
  const forget = (path: string): void => {
    delete base.files[path]
  }
  const order = (a: SyncAction): number =>
    a.kind === 'mkdirLocal' || a.kind === 'mkdirRemote' ? 0 : a.kind === 'rmdirLocal' || a.kind === 'rmdirRemote' ? 3 : a.kind === 'deleteLocal' || a.kind === 'deleteRemote' ? 2 : 1
  const sorted = [...actions].sort((a, b) => order(a) - order(b) || (order(a) === 3 ? b.path.length - a.path.length : a.path.localeCompare(b.path)))

  const deletedLocalNames: string[] = []
  const deletedRemoteNames: string[] = []
  const createdDirs = new Set<string>()
  const removedDirs = new Set<string>()

  for (const a of sorted) {
    try {
      switch (a.kind) {
        case 'same':
          done(a.path, a.state)
          break
        case 'mkdirLocal':
          await local.mkdir(toLocal(pair.localDir, a.path))
          createdDirs.add(a.path)
          break
        case 'mkdirRemote':
          await remote.mkdir(remote.abs(pair.remoteDir, a.path))
          createdDirs.add(a.path)
          break
        case 'upload': {
          ctx.activity(`Subiendo ${a.path}`)
          const existing = r.files.get(a.path)
          try {
            await remote.upload(toLocal(pair.localDir, a.path), remote.abs(pair.remoteDir, a.path), a.state.mtime, existing ? existing.mtime : 'none')
          } catch (e) {
            if (e instanceof RemoteConflict) break // cambió allí mientras tanto: la próxima ronda lo decide
            throw e
          }
          done(a.path, a.state)
          result.uploaded++
          break
        }
        case 'download': {
          ctx.activity(`Bajando ${a.path}`)
          const abs = toLocal(pair.localDir, a.path)
          // Si aquí cambió desde que se miró, no se pisa: la próxima ronda lo decide.
          const seen = l.files.get(a.path)
          const now = await local.stat(abs)
          if (seen ? !now || now.size !== seen.size || !sameMtime(now.mtime, seen.mtime) : !!now) break
          await remote.download(remote.abs(pair.remoteDir, a.path), abs, a.state.mtime)
          done(a.path, a.state)
          result.downloaded++
          break
        }
        case 'compare': {
          ctx.activity(`Comparando ${a.path}`)
          const [hl, hr] = await Promise.all([local.hash(toLocal(pair.localDir, a.path)), remote.hash(remote.abs(pair.remoteDir, a.path))])
          if (hl === hr) {
            // Mismo contenido: se iguala la fecha para que no se vuelva a mirar.
            await local.setMtime(toLocal(pair.localDir, a.path), a.remote.mtime)
            done(a.path, a.remote)
          } else {
            await keepBoth(a.path)
          }
          break
        }
        case 'conflict':
          await keepBoth(a.path)
          break
        case 'deleteLocal':
          ctx.activity(`Mandando a la papelera ${a.path}`)
          await local.trash(toLocal(pair.localDir, a.path))
          forget(a.path)
          deletedLocalNames.push(a.path)
          result.deletedLocal++
          break
        case 'deleteRemote':
          ctx.activity(`Mandando a la papelera del servidor ${a.path}`)
          await remote.trash(remote.abs(pair.remoteDir, a.path))
          forget(a.path)
          deletedRemoteNames.push(a.path)
          result.deletedRemote++
          break
        case 'rmdirLocal':
          if (await local.rmdirIfEmpty(toLocal(pair.localDir, a.path))) removedDirs.add(a.path)
          break
        case 'rmdirRemote': {
          // Solo si en el servidor ya no queda ningún archivo dentro (lo vio la lista de este mismo momento).
          const prefix = `${a.path}/`
          const hasFiles = [...r.files.keys()].some((p) => p.startsWith(prefix) && !deletedRemoteNames.includes(p))
          if (!hasFiles) {
            await remote.trash(remote.abs(pair.remoteDir, a.path))
            removedDirs.add(a.path)
          }
          break
        }
      }
    } catch (e) {
      result.errors.push(`${'path' in a ? a.path : ''}: ${(e as Error).message}`)
    }
  }

  /** Cambió en los dos lados: la copia de aquí pasa a llamarse «… (conflicto …)» y se baja la del servidor. */
  async function keepBoth(path: string): Promise<void> {
    const remoteState = r.files.get(path)
    if (!remoteState) return
    const copy = conflictName(path, ctx.device, ctx.now())
    ctx.activity(`Conflicto en ${path}: se conservan las dos versiones`)
    await local.rename(toLocal(pair.localDir, path), toLocal(pair.localDir, copy))
    await remote.download(remote.abs(pair.remoteDir, path), toLocal(pair.localDir, path), remoteState.mtime)
    forget(path)
    done(path, remoteState)
    result.conflicts++
    ctx.notice({ kind: 'conflict', message: `«${path}» cambió aquí y en el servidor: se conservan las dos versiones (la de aquí quedó como «${copy}»).` })
  }

  if (deletedLocalNames.length) {
    ctx.notice({
      kind: 'deleted-local',
      message: `Se mandaron a la papelera de este equipo ${deletedLocalNames.length} ${deletedLocalNames.length === 1 ? 'archivo' : 'archivos'} porque se borraron en el servidor: ${deletedLocalNames.slice(0, 5).join(', ')}${deletedLocalNames.length > 5 ? '…' : ''}`
    })
  }
  if (deletedRemoteNames.length) {
    ctx.notice({
      kind: 'deleted-remote',
      message: `Se mandaron a la papelera del servidor ${deletedRemoteNames.length} ${deletedRemoteNames.length === 1 ? 'archivo' : 'archivos'} porque se borraron aquí: ${deletedRemoteNames.slice(0, 5).join(', ')}${deletedRemoteNames.length > 5 ? '…' : ''}`
    })
  }

  // La base de carpetas: las que existen en los dos lados tras la ronda.
  const dirs = new Set<string>()
  for (const d of l.dirs) if (r.dirs.has(d) && !removedDirs.has(d)) dirs.add(d)
  for (const d of createdDirs) dirs.add(d)
  base.dirs = [...dirs].sort()
  // Lo que ya no existe en ningún lado sale de la base.
  for (const p of Object.keys(base.files)) {
    if (!l.files.has(p) && !r.files.has(p)) delete base.files[p]
  }
  return result
}

// ---------- Entrada y salida de este equipo ----------

export function localIO(trash: (abs: string) => Promise<void>): LocalIO {
  const stateOf = async (abs: string): Promise<FileState | null> => {
    try {
      const st = await fsp.stat(abs)
      return st.isFile() ? { size: st.size, mtime: Math.round(st.mtimeMs) } : null
    } catch {
      return null
    }
  }
  return {
    async tree(dir, exclude) {
      await fsp.access(dir)
      const t = await walkTree(dir, { skip: (rel) => isExcluded(rel, exclude) })
      return { files: new Map(t.files.map((f) => [f.p, { size: f.s, mtime: f.m }])), dirs: new Set(t.dirs), truncated: t.truncated }
    },
    async hash(abs) {
      const { createHash } = await import('node:crypto')
      const { createReadStream } = await import('node:fs')
      const { pipeline } = await import('node:stream/promises')
      const h = createHash('sha256')
      await pipeline(createReadStream(abs), h)
      return h.digest('hex')
    },
    mkdir: async (abs) => void (await fsp.mkdir(abs, { recursive: true })),
    rename: async (from, to) => {
      await fsp.mkdir(dirname(to), { recursive: true })
      await fsp.rename(from, to)
    },
    trash,
    async rmdirIfEmpty(abs) {
      try {
        await fsp.rmdir(abs)
        return true
      } catch {
        return false
      }
    },
    async setMtime(abs, ms) {
      await fsp.utimes(abs, ms / 1000, ms / 1000)
    },
    stat: stateOf
  }
}
