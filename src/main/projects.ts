import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, promises as fsp, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Artifact, ArtifactKind, Attachment, ChatMessage, ProjectState, ProjectSummary, Task } from '@shared/types'
import { INTERRUPTED_ERROR } from '@shared/defaults'
import { emitMobileOnly } from './events'

const SAVE_DEBOUNCE_MS = 400
const ID_RE = /^[a-z0-9][a-z0-9\-]{0,80}$/

let root = ''
const cache = new Map<string, ProjectState>()
const timers = new Map<string, NodeJS.Timeout>()

export function initProjects(workspaceRoot: string): void {
  root = join(workspaceRoot, 'projects')
  mkdirSync(root, { recursive: true })
}

export function projectsRoot(): string {
  return root
}

export function slugify(name: string, max = 32): string {
  const s = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '')
  return s || 'proyecto'
}

function randomSuffix(n = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

export function isValidProjectId(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id)
}

function projectFile(dir: string): string {
  return join(dir, 'project.json')
}

/** Resolve a path relative to the project dir; null if it escapes the project. */
export function resolveInProject(projectDir: string, relPath: string): string | null {
  if (typeof relPath !== 'string' || relPath.includes('\0')) return null
  const abs = resolve(projectDir, relPath)
  const rel = relative(projectDir, abs)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return abs
}

export function toRelPath(projectDir: string, absOrRel: string): string | null {
  const abs = isAbsolute(absOrRel) ? absOrRel : resolve(projectDir, absOrRel)
  const rel = relative(projectDir, abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return rel.split(sep).join('/')
}

function sanitizeState(state: ProjectState): ProjectState {
  // Tasks left running by a previous session can't continue.
  let touched = false
  for (const t of state.tasks) {
    if (t.status === 'running' || t.status === 'pending' || t.status === 'blocked') {
      t.status = 'cancelled'
      t.error = t.error ?? INTERRUPTED_ERROR
      t.finishedAt = t.finishedAt ?? Date.now()
      touched = true
    }
  }
  for (const m of state.messages) {
    if (m.streaming) m.streaming = false
    // El agente de una tarea a medias ya no sigue contando.
    if (m.work?.status === 'running') m.work = { ...m.work, status: 'stopped' }
  }
  if (touched) scheduleSave(state.project.id)
  return state
}

function readState(dir: string): ProjectState | null {
  try {
    const raw = JSON.parse(readFileSync(projectFile(dir), 'utf8')) as Partial<ProjectState>
    if (!raw.project || typeof raw.project.id !== 'string') return null
    return {
      project: { ...raw.project, dir },
      messages: Array.isArray(raw.messages) ? raw.messages : [],
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      artifacts: Array.isArray(raw.artifacts) ? raw.artifacts : [],
      attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
      memory: Array.isArray(raw.memory) ? raw.memory.filter((e) => e && typeof e.id === 'string' && typeof e.text === 'string') : [],
      instructions: typeof raw.instructions === 'string' ? raw.instructions : '',
      routines: Array.isArray(raw.routines) ? raw.routines.filter((r) => r && typeof r.id === 'string' && r.trigger && typeof r.request === 'string') : [],
      conversation: raw.conversation && typeof raw.conversation.id === 'string' ? raw.conversation : undefined,
      conversations: Array.isArray(raw.conversations) ? raw.conversations.filter((c) => c && typeof c.id === 'string') : [],
      historyImported: raw.historyImported === true
    }
  } catch {
    return null
  }
}

/**
 * ¿Tiene rutinas el proyecto? Sin cargarlo en memoria si no estaba (el motor de rutinas lo mira en todos los proyectos
 * al arrancar y no hace falta tener en memoria el chat de cada uno).
 */
export function projectHasRoutines(id: string): boolean {
  if (!isValidProjectId(id)) return false
  const cached = cache.get(id)
  if (cached) return !!cached.routines?.length
  try {
    const raw = JSON.parse(readFileSync(projectFile(join(root, id)), 'utf8')) as { routines?: unknown }
    return Array.isArray(raw.routines) && raw.routines.length > 0
  } catch {
    return false
  }
}

export function listProjects(): ProjectSummary[] {
  const out: ProjectSummary[] = []
  let names: string[] = []
  try {
    names = readdirSync(root)
  } catch {
    return out
  }
  for (const name of names) {
    if (!isValidProjectId(name)) continue
    const cached = cache.get(name)
    if (cached) {
      out.push({ ...cached.project })
      continue
    }
    const dir = join(root, name)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    const st = readState(dir)
    if (st) out.push({ ...st.project, id: name, dir })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

function cleanName(name: unknown): string {
  return (typeof name === 'string' ? name : '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

export function createProject(name: string): ProjectSummary {
  const clean = cleanName(name) || 'Nuevo proyecto'
  let id = ''
  let dir = ''
  for (let i = 0; i < 10; i++) {
    id = `${slugify(clean)}-${randomSuffix()}`
    dir = join(root, id)
    if (!existsSync(dir)) break
  }
  mkdirSync(join(dir, 'attachments'), { recursive: true })
  mkdirSync(join(dir, 'artifacts'), { recursive: true })
  const now = Date.now()
  const project: ProjectSummary = { id, name: clean, dir, createdAt: now, updatedAt: now }
  const state: ProjectState = { project, messages: [], tasks: [], artifacts: [], attachments: [] }
  cache.set(id, state)
  writeState(state)
  return { ...project }
}

/**
 * Quita un proyecto de AI Cowork (deja de estar en memoria y sin guardados pendientes) y devuelve lo que hay que
 * borrar del disco: su carpeta interna (chat, tareas, adjuntos, resultados, historial y memoria) y, si trabajaba en
 * una carpeta del usuario, SOLO la subcarpeta .ai-cowork que creó la app dentro (la carpeta del usuario no se toca).
 */
export function forgetProject(id: string): { dirs: string[]; taskIds: string[] } {
  const st = getProject(id)
  const dir = resolve(st.project.dir)
  // Por seguridad: solo se borra lo que está dentro de la carpeta de proyectos de AI Cowork.
  if (!dir.startsWith(resolve(root) + sep)) throw new Error('La carpeta del proyecto no está donde debería: no se borra nada')
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  cache.delete(id)
  const dirs = [dir]
  const wd = st.project.workDir
  if (wd && existsSync(join(wd, '.ai-cowork'))) dirs.push(join(wd, '.ai-cowork'))
  return { dirs, taskIds: st.tasks.map((t) => t.id) }
}

export function renameProject(id: string, name: unknown): ProjectSummary {
  const clean = cleanName(name)
  if (!clean) throw new Error('Escribe un nombre para el proyecto')
  const st = getProject(id)
  st.project.name = clean
  st.project.updatedAt = Date.now()
  scheduleSave(id)
  return { ...st.project }
}

export function ensureFirstProject(): void {
  if (listProjects().length === 0) createProject('Mi primer proyecto')
}

export function getProject(id: string): ProjectState {
  if (!isValidProjectId(id)) throw new Error('Proyecto no válido')
  let st = cache.get(id)
  if (!st) {
    const dir = join(root, id)
    const loaded = readState(dir)
    if (!loaded) throw new Error('Proyecto no encontrado')
    loaded.project.id = id
    st = sanitizeState(loaded)
    cache.set(id, st)
  }
  mkdirSync(join(st.project.dir, 'attachments'), { recursive: true })
  mkdirSync(join(st.project.dir, 'artifacts'), { recursive: true })
  return st
}

export function projectDir(id: string): string {
  return getProject(id).project.dir
}

/** Carpeta donde trabajan los agentes: la del usuario si dio acceso, si no la interna. */
export function workRoot(id: string): string {
  const p = getProject(id).project
  if (p.workDir && existsSync(p.workDir)) return p.workDir
  return p.dir
}

/** Comprueba que la carpeta elegida es razonable (no la raíz de un disco ni del sistema). */
export function validateWorkDir(dir: string): string {
  if (typeof dir !== 'string' || !isAbsolute(dir)) throw new Error('Ruta no válida')
  const abs = resolve(dir).replace(/[\\/]+$/, '')
  if (!existsSync(abs) || !statSync(abs).isDirectory()) throw new Error('La carpeta no existe')
  if (/^[A-Za-z]:$/.test(abs) || abs === '') throw new Error('Elige una carpeta concreta, no la raíz de un disco')
  const lower = abs.toLowerCase()
  if (lower === homedir().replace(/[\\/]+$/, '').toLowerCase()) {
    throw new Error('Elige una carpeta concreta, no toda tu carpeta de usuario')
  }
  const system = (
    process.platform === 'win32'
      ? [process.env.SystemRoot ?? 'C:\\Windows', process.env.ProgramFiles, process.env['ProgramFiles(x86)']]
      : ['/System', '/Library', '/Applications', '/usr', '/bin', '/sbin', '/etc', '/private', '/var', '/opt']
  )
    .filter((x): x is string => !!x)
    .map((x) => x.toLowerCase())
  const sep = process.platform === 'win32' ? '\\' : '/'
  if (system.some((x) => lower === x || lower.startsWith(x + sep))) throw new Error('No se permite dar acceso a carpetas del sistema')
  return abs
}

export function setWorkDir(id: string, dir: string | null): ProjectSummary {
  const st = getProject(id)
  st.project.workDir = dir ? validateWorkDir(dir) : undefined
  st.project.updatedAt = Date.now()
  scheduleSave(id)
  return { ...st.project }
}

/** Ruta absoluta de un archivo del proyecto: primero en la carpeta interna y luego en la de trabajo. */
export function resolveProjectFile(id: string, rel: string): string | null {
  const p = getProject(id).project
  for (const base of [p.dir, p.workDir]) {
    if (!base) continue
    const abs = resolveInProject(base, rel)
    if (abs && existsSync(abs)) return abs
  }
  return null
}

/**
 * Con carpeta de trabajo, copia los adjuntos a .ai-cowork/adjuntos para que los agentes los lean sin
 * salir de ella. Devuelve ruta original → ruta relativa a la carpeta donde trabajan.
 */
export function stageAttachments(id: string, atts: Attachment[]): Map<string, string> {
  const p = getProject(id).project
  const map = new Map<string, string>()
  for (const a of atts) map.set(a.relPath, a.relPath)
  if (!p.workDir || !existsSync(p.workDir)) return map
  const base = join(p.workDir, '.ai-cowork')
  mkdirSync(join(base, 'adjuntos'), { recursive: true })
  mkdirSync(join(base, 'entregables'), { recursive: true })
  const gi = join(base, '.gitignore')
  if (!existsSync(gi)) writeFileSync(gi, '# Carpeta de AI Cowork: adjuntos y entregables\n*\n', 'utf8')
  for (const a of atts) {
    const name = basename(a.relPath)
    try {
      copyFileSync(join(p.dir, a.relPath), join(base, 'adjuntos', name))
      map.set(a.relPath, `.ai-cowork/adjuntos/${name}`)
    } catch {
      /* se deja la ruta original */
    }
  }
  return map
}

/** Deep copy for IPC. */
export function snapshotProject(id: string): ProjectState {
  return JSON.parse(JSON.stringify(getProject(id))) as ProjectState
}

function writeState(state: ProjectState): void {
  const file = projectFile(state.project.dir)
  const tmp = `${file}.tmp`
  const { dir: _dir, ...project } = state.project
  void _dir
  writeFileSync(tmp, JSON.stringify({ ...state, project }, null, 1), 'utf8')
  renameSync(tmp, file)
}

export function scheduleSave(id: string): void {
  const st = cache.get(id)
  if (!st) return
  st.project.updatedAt = Date.now()
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id)
      try {
        writeState(st)
      } catch (e) {
        console.error('[cowork] no se pudo guardar el proyecto', id, e)
      }
    }, SAVE_DEBOUNCE_MS)
  )
}

export function flushAll(): void {
  for (const [id, t] of timers) {
    clearTimeout(t)
    const st = cache.get(id)
    if (st) {
      try {
        writeState(st)
      } catch (e) {
        console.error('[cowork] no se pudo guardar el proyecto', id, e)
      }
    }
  }
  timers.clear()
}

// ---------- mutations (keep store and events in sync from the orchestrator) ----------

function upsertBy<T extends { id: string }>(list: T[], item: T): void {
  const i = list.findIndex((x) => x.id === item.id)
  if (i >= 0) list[i] = item
  else list.push(item)
}

export function upsertMessage(m: ChatMessage): void {
  const st = getProject(m.projectId)
  upsertBy(st.messages, { ...m })
  scheduleSave(m.projectId)
}

export function upsertTask(t: Task): void {
  const st = getProject(t.projectId)
  upsertBy(st.tasks, JSON.parse(JSON.stringify(t)) as Task)
  scheduleSave(t.projectId)
}

export function upsertArtifact(a: Artifact): void {
  const st = getProject(a.projectId)
  upsertBy(st.artifacts, { ...a })
  scheduleSave(a.projectId)
}

export function findArtifactByPath(projectId: string, relPath: string): Artifact | undefined {
  return getProject(projectId).artifacts.find((a) => a.relPath === relPath)
}

// ---------- attachments ----------

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.py': 'text/x-python',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4'
}

export function mimeFor(name: string): string {
  return MIME[extname(name).toLowerCase()] ?? 'application/octet-stream'
}

export function isImageName(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(name)
}

/** Only [A-Za-z0-9._-], spaces → '-', keep extension. */
export function sanitizeFileName(name: string): string {
  const ext = extname(name)
  const base = name.slice(0, name.length - ext.length)
  const clean = (s: string): string =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^A-Za-z0-9._-]/g, '')
      .replace(/-{2,}/g, '-')
  const b = clean(base).replace(/^[.-]+/, '').slice(0, 80) || 'archivo'
  const e = clean(ext).slice(0, 12)
  return e && e !== '.' ? `${b}${e.startsWith('.') ? e : '.' + e}` : b
}

function uniqueName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name
  const ext = extname(name)
  const base = name.slice(0, name.length - ext.length)
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}${ext}`
    if (!existsSync(join(dir, candidate))) return candidate
  }
  return `${base}-${randomSuffix(4)}${ext}`
}

const MAX_ATTACHMENT_BYTES = 500 * 1024 * 1024

export function copyAttachments(projectId: string, filePaths: string[]): Attachment[] {
  const st = getProject(projectId)
  const dir = join(st.project.dir, 'attachments')
  mkdirSync(dir, { recursive: true })
  const out: Attachment[] = []
  for (const p of filePaths.slice(0, 30)) {
    if (typeof p !== 'string' || !p || !isAbsolute(p)) continue
    try {
      const s = statSync(p)
      if (!s.isFile() || s.size > MAX_ATTACHMENT_BYTES) continue
      const original = p.split(/[\\/]/).pop() || 'archivo'
      const name = uniqueName(dir, sanitizeFileName(original))
      copyFileSync(p, join(dir, name))
      const att: Attachment = {
        id: randomUUID(),
        name: original,
        relPath: `attachments/${name}`,
        mime: mimeFor(name),
        size: s.size
      }
      out.push(att)
      st.attachments.push(att)
    } catch (e) {
      console.error('[cowork] no se pudo adjuntar', p, e)
    }
  }
  if (out.length) {
    scheduleSave(projectId)
    // Adjuntos nuevos (mensaje del escritorio o archivo subido desde el móvil): el móvil actualiza su lista.
    emitMobileOnly({ kind: 'attachments.updated', projectId, attachments: JSON.parse(JSON.stringify(st.attachments)) as Attachment[] })
  }
  return out
}

// ---------- artifacts ----------

export function artifactKind(name: string): ArtifactKind {
  const ext = extname(name).toLowerCase().slice(1)
  if (ext === 'html' || ext === 'htm') return 'html'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'image'
  if (
    [
      'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'css', 'scss', 'json', 'yml', 'yaml', 'toml', 'xml', 'sh', 'ps1',
      'bat', 'cmd', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'sql', 'lua', 'gd',
      'vue', 'svelte', 'ini', 'csv'
    ].includes(ext)
  )
    return 'code'
  if (ext === 'txt' || ext === 'log' || ext === '') return 'text'
  return 'other'
}

export interface FileStamp {
  mtime: number
  size: number
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', 'dist', 'build', 'out', 'target', 'bin', 'obj', 'coverage'])
const MAX_SCAN = 3000

/** Recursive snapshot of the project's output files (relPath → mtime/size). Skips attachments, hidden dirs and project.json. */
export async function snapshotFiles(dir: string): Promise<Map<string, FileStamp>> {
  const out = new Map<string, FileStamp>()
  // Si la carpeta de trabajo contiene los datos de AI Cowork (p. ej. la propia app), se ignoran.
  const internal = root ? resolve(root, '..').toLowerCase() : ''
  const walk = async (rel: string, depth: number): Promise<void> => {
    if (out.size >= MAX_SCAN || depth > 8) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(join(dir, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (out.size >= MAX_SCAN) return
      // Se ignoran las carpetas ocultas salvo .ai-cowork/entregables (documentos creados por los agentes).
      if (e.name.startsWith('.') && !(rel === '' && e.name === '.ai-cowork')) continue
      if (rel === '.ai-cowork' && e.name !== 'entregables') continue
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (e.name === 'attachments' ? !rel : SKIP_DIRS.has(e.name)) continue
        if (internal && resolve(dir, childRel).toLowerCase() === internal) continue
        await walk(childRel, depth + 1)
      } else if (e.isFile()) {
        if (!rel && (e.name === 'project.json' || e.name.startsWith('project.json'))) continue
        try {
          const s = await fsp.stat(join(dir, childRel))
          out.set(childRel, { mtime: s.mtimeMs, size: s.size })
        } catch {
          /* vanished */
        }
      }
    }
  }
  await walk('', 0)
  return out
}

/** Write text to artifacts/<slug>.md (deduped) and return the relPath. */
export function writeTextArtifact(projectId: string, title: string, text: string): string {
  const dir = join(projectDir(projectId), 'artifacts')
  mkdirSync(dir, { recursive: true })
  const name = uniqueName(dir, `${slugify(title, 48)}.md`)
  writeFileSync(join(dir, name), text, 'utf8')
  return `artifacts/${name}`
}
