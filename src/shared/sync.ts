// Sincronización de carpetas entre un cliente de escritorio y su servidor. Aquí, lo que decide qué hacer con cada
// archivo (sin tocar el disco ni la red, para poder probarlo a fondo) y los tipos que comparten el motor y la interfaz.

export interface FileState {
  size: number
  /** Milisegundos Unix, redondeados. Al copiar un archivo se le pone la misma fecha que tenía en el origen. */
  mtime: number
}

/** Lo que se sincronizó la última vez: con esto se sabe qué cambió desde entonces en cada lado. */
export interface BaseState {
  files: Record<string, FileState>
  dirs: string[]
}

export type SyncAction =
  | { kind: 'upload'; path: string; state: FileState }
  | { kind: 'download'; path: string; state: FileState }
  /** Se borró en el servidor: se borra aquí (a la papelera). */
  | { kind: 'deleteLocal'; path: string }
  /** Se borró aquí: se borra en el servidor (a su papelera). */
  | { kind: 'deleteRemote'; path: string }
  /** Cambió en los dos lados con distinto contenido: se conservan las dos versiones. */
  | { kind: 'conflict'; path: string }
  /** Cambió en los dos lados con el mismo tamaño: hay que mirar el contenido para saber si es igual. */
  | { kind: 'compare'; path: string; local: FileState; remote: FileState }
  /** Ya es igual en los dos lados: solo se anota. */
  | { kind: 'same'; path: string; state: FileState }
  | { kind: 'mkdirLocal'; path: string }
  | { kind: 'mkdirRemote'; path: string }
  | { kind: 'rmdirLocal'; path: string }
  | { kind: 'rmdirRemote'; path: string }

export const MTIME_TOLERANCE_MS = 2

export const sameMtime = (a: number, b: number): boolean => Math.abs(a - b) <= MTIME_TOLERANCE_MS

const same = (a: FileState, b: FileState): boolean => a.size === b.size && sameMtime(a.mtime, b.mtime)

/**
 * Qué hay que hacer para que los dos lados queden igual, con la última sincronización como punto de partida:
 * lo que cambió solo en un lado pasa al otro; lo que cambió en los dos y es distinto se conserva en las dos
 * versiones; un borrado en un lado se propaga, salvo que en el otro se haya editado (entonces gana la edición).
 */
export function planSync(base: BaseState, local: Map<string, FileState>, remote: Map<string, FileState>, localDirs: Set<string>, remoteDirs: Set<string>): SyncAction[] {
  const actions: SyncAction[] = []
  const paths = new Set<string>([...local.keys(), ...remote.keys(), ...Object.keys(base.files)])

  for (const path of [...paths].sort()) {
    const l = local.get(path)
    const r = remote.get(path)
    const b = base.files[path]

    if (l && r) {
      if (same(l, r)) {
        if (!b || !same(b, l)) actions.push({ kind: 'same', path, state: l })
        continue
      }
      const changedL = !b || !same(b, l)
      const changedR = !b || !same(b, r)
      if (changedL && !changedR) actions.push({ kind: 'upload', path, state: l })
      else if (!changedL && changedR) actions.push({ kind: 'download', path, state: r })
      else if (l.size !== r.size) actions.push({ kind: 'conflict', path })
      else actions.push({ kind: 'compare', path, local: l, remote: r })
      continue
    }

    if (l && !r) {
      // Nuevo aquí, o borrado en el servidor.
      if (!b) actions.push({ kind: 'upload', path, state: l })
      else if (same(b, l)) actions.push({ kind: 'deleteLocal', path })
      else actions.push({ kind: 'upload', path, state: l }) // editado aquí mientras lo borraban allí: gana la edición
      continue
    }

    if (!l && r) {
      if (!b) actions.push({ kind: 'download', path, state: r })
      else if (same(b, r)) actions.push({ kind: 'deleteRemote', path })
      else actions.push({ kind: 'download', path, state: r })
      continue
    }
    // En ningún lado: ya no hay nada que seguir (la entrada de la base se quita al ejecutar).
  }

  // Carpetas (las vacías no existirían si solo se miraran los archivos). Las más hondas, al final al borrar.
  const baseDirs = new Set(base.dirs)
  const dirPaths = new Set<string>([...localDirs, ...remoteDirs, ...baseDirs])
  for (const path of [...dirPaths].sort()) {
    const l = localDirs.has(path)
    const r = remoteDirs.has(path)
    const b = baseDirs.has(path)
    if (l && !r) actions.push(b ? { kind: 'rmdirLocal', path } : { kind: 'mkdirRemote', path })
    else if (!l && r) actions.push(b ? { kind: 'rmdirRemote', path } : { kind: 'mkdirLocal', path })
  }
  return actions
}

/** ¿El nombre de algún tramo de la ruta (o un patrón con *) está en la lista de exclusiones? */
export function isExcluded(path: string, patterns: string[]): boolean {
  if (!patterns.length) return false
  const segments = path.split('/').filter(Boolean)
  return segments.some((seg) =>
    patterns.some((p) => {
      if (p === seg) return true
      if (!p.includes('*')) return false
      const re = new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i')
      return re.test(seg)
    })
  )
}

/** Lo que no se sincroniza por defecto: repositorios, dependencias, cachés y basura del sistema. */
export const DEFAULT_EXCLUDES = ['.git', 'node_modules', '.venv', '__pycache__', '.DS_Store', 'Thumbs.db', 'desktop.ini', '*.part', '*.tmp', '~$*']

/** `nombre.ext` → `nombre (conflicto PC-Casa 2026-10-12 15-30).ext` */
export function conflictName(path: string, device: string, when: Date): string {
  const slash = path.lastIndexOf('/')
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ''
  const file = slash >= 0 ? path.slice(slash + 1) : path
  const dot = file.lastIndexOf('.')
  const stem = dot > 0 ? file.slice(0, dot) : file
  const ext = dot > 0 ? file.slice(dot) : ''
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}-${pad(when.getMinutes())}`
  const who = device.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || 'cliente'
  return `${dir}${stem} (conflicto ${who} ${stamp})${ext}`
}

// ---------- Lo que ve la interfaz ----------

export interface SyncPairConfig {
  id: string
  /** Nombre para mostrar. */
  name: string
  /** Carpeta de este equipo. */
  localDir: string
  /** Carpeta del servidor (ruta absoluta en el servidor). */
  remoteDir: string
  enabled: boolean
  exclude: string[]
}

export type SyncPhase = 'idle' | 'syncing' | 'paused' | 'error' | 'disabled'

export interface SyncNotice {
  t: number
  kind: 'deleted-local' | 'deleted-remote' | 'conflict' | 'paused' | 'error'
  message: string
}

export interface SyncPairStatus extends SyncPairConfig {
  phase: SyncPhase
  /** Última vez que terminó bien una ronda (ms Unix). */
  lastSyncAt?: number
  /** Qué está haciendo ahora (p. ej. «Subiendo informe.pdf»). */
  activity?: string
  /** Por qué se paró o falló. */
  problem?: string
  /** Cuántos archivos hay sincronizados. */
  files: number
  notices: SyncNotice[]
}
