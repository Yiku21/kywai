import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, promises as fsp, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Artifact, ArtifactKind, Attachment, ChatMessage, ChatVersion, ChatVersions, ProjectFileRef, ProjectState, ProjectSummary, Task } from '@shared/types'
import { INTERRUPTED_ERROR } from '@shared/defaults'
import { reopensWork } from '@shared/chatOrder'
import { emit, emitMobileOnly } from './events'

const SAVE_DEBOUNCE_MS = 400
/** Error de una publicación que se cortó al cerrar kywai. */
export const POST_INTERRUPTED = 'Se cortó al cerrar kywai: pulsa Reintentar'
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

/**
 * Una vez por proyecto: borra las copias antiguas de avances/ (una por tarea, muchas repetidas) y quita de Entregables y
 * Resultados lo que se registró de avances/ e historial/ (antes contaban como archivos nuevos). Las miniaturas de esos
 * avances en mensajes antiguos del chat se quedan sin imagen.
 */
export function cleanOldProgress(state: ProjectState): boolean {
  if (state.avancesCleaned) return false
  state.avancesCleaned = true
  if (!state.project.workDir) {
    const gone = new Set(state.artifacts.filter((a) => /^(avances|historial)\//.test(a.relPath)).map((a) => a.id))
    if (gone.size) {
      state.artifacts = state.artifacts.filter((a) => !gone.has(a.id))
      for (const t of state.tasks) if (t.artifactIds?.some((id) => gone.has(id))) t.artifactIds = t.artifactIds.filter((id) => !gone.has(id))
      for (const m of state.messages) if (m.artifactIds?.some((id) => gone.has(id))) m.artifactIds = m.artifactIds.filter((id) => !gone.has(id))
    }
  }
  try {
    rmSync(join(state.project.dir, 'avances'), { recursive: true, force: true })
  } catch (e) {
    console.error('[cowork] no se pudo borrar avances/', e)
  }
  return true
}

function sanitizeState(state: ProjectState): ProjectState {
  // Tasks left running by a previous session can't continue.
  let touched = cleanOldProgress(state)
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
    // Una publicación en Instagram o TikTok que se cortó al cerrar la app: se queda en «fallida» para poder
    // reintentarla (si no, la tarjeta seguiría dando vueltas para siempre y no dejaría reintentar).
    if (m.instagramPost?.status === 'publishing') {
      m.instagramPost = { ...m.instagramPost, status: 'failed', error: POST_INTERRUPTED }
      touched = true
    }
    if (m.tiktokPost?.status === 'sending') {
      m.tiktokPost = { ...m.tiktokPost, status: 'failed', error: POST_INTERRUPTED }
      touched = true
    }
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
      leanCode: raw.leanCode === true || undefined,
      routines: Array.isArray(raw.routines) ? raw.routines.filter((r) => r && typeof r.id === 'string' && r.trigger && typeof r.request === 'string') : [],
      conversation: raw.conversation && typeof raw.conversation.id === 'string' ? raw.conversation : undefined,
      conversations: Array.isArray(raw.conversations) ? raw.conversations.filter((c) => c && typeof c.id === 'string') : [],
      historyImported: raw.historyImported === true,
      avancesCleaned: raw.avancesCleaned === true
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
  const state: ProjectState = { project, messages: [], tasks: [], artifacts: [], attachments: [], avancesCleaned: true }
  cache.set(id, state)
  writeState(state)
  return { ...project }
}

/**
 * Quita un proyecto de kywai (deja de estar en memoria y sin guardados pendientes) y devuelve lo que hay que
 * borrar del disco: su carpeta interna (chat, tareas, adjuntos, resultados, historial y memoria) y, si trabajaba en
 * una carpeta del usuario, SOLO la subcarpeta .ai-cowork que creó la app dentro (la carpeta del usuario no se toca).
 */
export function forgetProject(id: string): { dirs: string[]; taskIds: string[] } {
  const st = getProject(id)
  const dir = resolve(st.project.dir)
  // Por seguridad: solo se borra lo que está dentro de la carpeta de proyectos de kywai.
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
  if (!existsSync(gi)) writeFileSync(gi, '# Carpeta de kywai: adjuntos y entregables\n*\n', 'utf8')
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

/** Pone un mensaje en una lista de chat: el bloque de una tarea que vuelve a trabajar (una corrección) baja al final. */
export function placeMessage(list: ChatMessage[], m: ChatMessage): void {
  const i = list.findIndex((x) => x.id === m.id)
  if (i >= 0 && reopensWork(list[i], m)) list.splice(i, 1)
  upsertBy(list, { ...m })
}

/**
 * Lo de una petición cuya conversación ya no es la abierta (el equipo sigue en segundo plano mientras miras
 * otra): conversations.ts lo guarda en esa conversación y devuelve true. Sin router, todo va a la abierta.
 */
export interface ChatRouter {
  message(m: ChatMessage): boolean
  task(t: Task): boolean
}
let router: ChatRouter | null = null
export function setChatRouter(r: ChatRouter | null): void {
  router = r
}

const FINISHED_TASK: ReadonlySet<Task['status']> = new Set(['done', 'failed', 'cancelled'])

/** Guarda un mensaje. Devuelve false si fue a una conversación en segundo plano (no hay que enseñarlo en el chat abierto). */
export function upsertMessage(m: ChatMessage): boolean {
  if (router?.message(m)) return false
  const st = getProject(m.projectId)
  placeMessage(st.messages, m)
  scheduleSave(m.projectId)
  return true
}

export function upsertTask(t: Task): void {
  const st = getProject(t.projectId)
  const copy = JSON.parse(JSON.stringify(t)) as Task
  if (router?.task(copy)) {
    // De una conversación en segundo plano: mientras trabaja sigue en el proyecto (el equipo y el 3D la ven);
    // al terminar se queda solo en su conversación, para no guardarla con la que tengas abierta.
    if (FINISHED_TASK.has(copy.status)) st.tasks = st.tasks.filter((x) => x.id !== copy.id)
    else upsertBy(st.tasks, copy)
  } else {
    upsertBy(st.tasks, copy)
  }
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

function withoutVersions(m: ChatMessage): ChatMessage {
  const copy = { ...m }
  delete copy.versions
  return copy
}

/**
 * El chat donde se edita un mensaje: la conversación abierta del proyecto o, si escribes en el chat de al lado o en
 * otra ventana, la suya (conversations.ts la da con setEditableChat mientras dura ese envío).
 */
export interface EditableChat {
  projectId: string
  conversationId?: string
  messages: ChatMessage[]
  tasks: Task[]
  save(): void
}
let editableScope: ((projectId: string) => EditableChat | null) | null = null
export function setEditableChat(fn: ((projectId: string) => EditableChat | null) | null): void {
  editableScope = fn
}

function editableChat(projectId: string): EditableChat {
  const scoped = editableScope?.(projectId)
  if (scoped) return scoped
  const st = getProject(projectId)
  return {
    projectId,
    conversationId: st.conversation?.id,
    get messages() {
      return st.messages
    },
    set messages(v) {
      st.messages = v
    },
    get tasks() {
      return st.tasks
    },
    set tasks(v) {
      st.tasks = v
    },
    save: () => scheduleSave(projectId)
  }
}

/** La parte del chat desde el mensaje [i] (incluido) y las tareas de las peticiones que solo están ahí. */
function chatTail(st: EditableChat, i: number, busyRunIds: string[]): { messages: ChatMessage[]; tasks: Task[] } {
  const kept = new Set(st.messages.slice(0, i).map((m) => m.runId).filter(Boolean))
  const messages = st.messages.slice(i)
  const runs = new Set(messages.map((m) => m.runId).filter((r): r is string => !!r && !kept.has(r)))
  if (busyRunIds.some((r) => runs.has(r))) throw new Error('Esa petición sigue en marcha: detenla antes de editar el mensaje')
  return { messages, tasks: st.tasks.filter((t) => t.runId && runs.has(t.runId)) }
}

/** Quita del chat abierto esa parte (mensajes desde [i] y sus tareas) y, si se dan, pone otros al final. */
function replaceTail(st: EditableChat, i: number, tail: { messages: ChatMessage[]; tasks: Task[] }, next?: { messages: ChatMessage[]; tasks: Task[] }): void {
  const gone = new Set(tail.tasks.map((t) => t.id))
  st.messages.splice(i, st.messages.length - i, ...(next?.messages ?? []))
  st.tasks = [...st.tasks.filter((t) => !gone.has(t.id)), ...(next?.tasks ?? [])]
  st.save()
  emit({
    kind: 'messages.replaced',
    projectId: st.projectId,
    ...(st.conversationId ? { conversationId: st.conversationId } : {}),
    messageIds: tail.messages.map((m) => m.id),
    taskIds: tail.tasks.map((t) => t.id),
    ...(next ? { messages: next.messages.map((m) => ({ ...m })), tasks: next.tasks.map((t) => ({ ...t })) } : {})
  })
}

/**
 * Editar un mensaje tuyo en el mismo chat (como en Claude): quita del chat abierto ese mensaje y todo lo que vino
 * después (con las tareas de esas peticiones; lo que entregaron se queda en Resultados) y lo guarda como una versión
 * más de ese punto. Devuelve las versiones que llevará el mensaje nuevo (que será la última) y cómo deshacerlo si el
 * envío falla. No se puede si alguna de esas peticiones sigue en marcha ([busyRunIds]).
 */
export function rewindChat(projectId: string, messageId: string, busyRunIds: string[]): { versions: ChatVersions; undo: () => void } {
  const st = editableChat(projectId)
  const i = st.messages.findIndex((m) => m.id === messageId)
  if (i < 0) throw new Error('Ese mensaje ya no está en la conversación')
  const head = st.messages[i]
  if (head.author.type !== 'user') throw new Error('Solo se pueden editar tus mensajes')
  const tail = chatTail(st, i, busyRunIds)
  const prior = head.versions ?? { current: 0, others: [] }
  const bare = withoutVersions(head)
  const saved: ChatVersion = { at: prior.current, messages: [bare, ...tail.messages.slice(1)], tasks: tail.tasks }
  const others = [...prior.others, saved].sort((a, b) => a.at - b.at)
  replaceTail(st, i, tail)
  return {
    versions: { current: others.length, others },
    undo: () => replaceTail(st, st.messages.length, { messages: [], tasks: [] }, tail)
  }
}

/** Pone las versiones en tu mensaje nuevo (el de esa petición) una vez enviado. */
export function attachVersions(projectId: string, runId: string, versions: ChatVersions): ChatMessage | null {
  const st = editableChat(projectId)
  const m = [...st.messages].reverse().find((x) => x.runId === runId && x.author.type === 'user')
  if (!m) return null
  m.versions = versions
  st.save()
  return m
}

/**
 * Flechas ‹ › de un mensaje tuyo editado: enseña otra versión de ese punto del chat (el mensaje y lo que vino después,
 * con sus tareas) y guarda la que se veía. No se puede mientras esa parte del chat sigue trabajando.
 */
export function switchMessageVersion(projectId: string, messageId: string, to: number, busyRunIds: string[]): void {
  const st = editableChat(projectId)
  const i = st.messages.findIndex((m) => m.id === messageId)
  if (i < 0) throw new Error('Ese mensaje ya no está en la conversación')
  const v = st.messages[i].versions
  if (!v) throw new Error('Ese mensaje no tiene otras versiones')
  if (to === v.current) return
  const target = v.others.find((o) => o.at === to)
  if (!target || !target.messages.length) throw new Error('Esa versión ya no existe')
  const tail = chatTail(st, i, busyRunIds)
  const bare = withoutVersions(st.messages[i])
  const others = [...v.others.filter((o) => o !== target), { at: v.current, messages: [bare, ...tail.messages.slice(1)], tasks: tail.tasks }].sort((a, b) => a.at - b.at)
  const head: ChatMessage = { ...target.messages[0], versions: { current: to, others } }
  replaceTail(st, i, tail, { messages: [head, ...target.messages.slice(1)], tasks: target.tasks })
}

/**
 * Clic derecho → Eliminar en Archivos o Resultados: borra el archivo del disco y lo quita de la lista del proyecto.
 * Un entregable puede estar en la carpeta del proyecto o en la de trabajo; un adjunto, solo en attachments/ (y sale
 * también del mensaje que lo llevaba).
 */
export async function deleteProjectFile(projectId: string, ref: ProjectFileRef): Promise<void> {
  const st = getProject(projectId)
  const artifactId = ref && 'artifactId' in ref && typeof ref.artifactId === 'string' ? ref.artifactId : null
  const attachmentId = ref && 'attachmentId' in ref && typeof ref.attachmentId === 'string' ? ref.attachmentId : null
  if (artifactId) {
    const a = st.artifacts.find((x) => x.id === artifactId)
    if (!a) throw new Error('No existe ese archivo')
    const abs = resolveProjectFile(projectId, a.relPath)
    if (abs) await fsp.rm(abs, { force: true })
    st.artifacts.splice(st.artifacts.indexOf(a), 1)
  } else if (attachmentId) {
    const a = st.attachments.find((x) => x.id === attachmentId)
    if (!a) throw new Error('No existe ese adjunto')
    const abs = a.relPath.startsWith('attachments/') ? resolveInProject(st.project.dir, a.relPath) : null
    if (abs) await fsp.rm(abs, { force: true })
    st.attachments.splice(st.attachments.indexOf(a), 1)
    // Fuera también de los mensajes, para que no vuelva a salir en Archivos.
    for (const m of st.messages) if (m.attachments?.some((x) => x.id === attachmentId)) m.attachments = m.attachments.filter((x) => x.id !== attachmentId)
    emitMobileOnly({ kind: 'attachments.updated', projectId, attachments: JSON.parse(JSON.stringify(st.attachments)) as Attachment[] })
  } else {
    throw new Error('Archivo no válido')
  }
  scheduleSave(projectId)
  emit({ kind: 'files.deleted', projectId, artifactIds: artifactId ? [artifactId] : [], attachmentIds: attachmentId ? [attachmentId] : [] })
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
/** Carpetas de la app dentro de la carpeta interna de un proyecto: nunca son entregables. */
export const APP_DIRS = new Set(['avances', 'historial'])

/** Recursive snapshot of the project's output files (relPath → mtime/size). Skips attachments, hidden dirs and project.json. */
export async function snapshotFiles(dir: string): Promise<Map<string, FileStamp>> {
  const out = new Map<string, FileStamp>()
  // Si la carpeta de trabajo contiene los datos de kywai (p. ej. la propia app), se ignoran.
  const internal = root ? resolve(root, '..').toLowerCase() : ''
  // En la carpeta interna del proyecto (la que tiene project.json), avances/ (copias de las imágenes que el agente
  // miró mientras trabajaba) e historial/ son de la app, no resultados: si no, salían en Entregables en cada tarea.
  const isProjectDir = existsSync(join(dir, 'project.json'))
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
        if (!rel && isProjectDir && APP_DIRS.has(e.name)) continue
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
