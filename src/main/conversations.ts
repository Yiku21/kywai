import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { INTERRUPTED_ERROR } from '@shared/defaults'
import type { ChatMessage, ConversationSummary, ProjectState, ProviderKind, SearchHit, SearchOptions, SearchResult, Task } from '@shared/types'
import { exportSessions, lastSession, rememberSession, replaceSessions, usableSession, type AgentSession } from './agentSessions'
import { getProject, isValidProjectId, listProjects, placeMessage, scheduleSave, setChatRouter, setEditableChat } from './projects'

/**
 * Varias conversaciones por proyecto, como en Claude: la abierta vive en el proyecto (messages y tasks, como
 * siempre, así el motor no cambia) y las demás se guardan en conversaciones/<id>.json dentro de la carpeta
 * interna del proyecto, con las sesiones de CLI de cada agente para retomarlas donde se dejaron.
 * Abrir una guardada intercambia: la abierta se guarda y la elegida pasa a ser la abierta.
 *
 * Conversaciones en paralelo: cada petición recuerda la conversación donde empezó. Si cambias a otra mientras el
 * equipo trabaja, lo que siga llegando de esa petición (mensajes, tareas, sesiones de los CLI) va a su
 * conversación en segundo plano (ver «Segundo plano» más abajo) y no a la que tienes abierta.
 */

const FINISHED: ReadonlySet<Task['status']> = new Set(['done', 'failed', 'cancelled'])
const CID_RE = /^[a-z0-9][a-z0-9\-]{0,60}$/
const TITLE_MAX = 60

interface StoredConversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  tasks: Task[]
  /** Sesiones de CLI de los agentes en esta conversación (agentId → sesión). */
  sessions?: Record<string, AgentSession>
  pinned?: boolean
  /** Traída de otra app (ver importChats.ts). */
  importedFrom?: string
}

export function isValidConversationId(id: unknown): id is string {
  return typeof id === 'string' && CID_RE.test(id)
}

function newId(now = Date.now()): string {
  return `c-${now.toString(36)}-${randomBytes(3).toString('hex')}`
}

const folder = (st: ProjectState): string => join(st.project.dir, 'conversaciones')
const fileOf = (st: ProjectState, cid: string): string => join(folder(st), `${cid}.json`)

/** Título de una conversación: el comienzo de tu primer mensaje (cortado en una palabra), o la fecha. */
export function titleFrom(messages: ChatMessage[], at = Date.now()): string {
  const first = messages.find((m) => m.author.type === 'user' && m.text.trim())
  const text = (first?.text ?? '')
    .replace(/[#*_`>[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return `Conversación del ${new Date(at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
  if (text.length <= TITLE_MAX) return text
  const cut = text.slice(0, TITLE_MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > 30 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`
}

function lastAt(messages: ChatMessage[], fallback: number): number {
  const last = messages.reduce((max, m) => Math.max(max, m.createdAt || 0), 0)
  return last || fallback
}

/** La conversación abierta tiene id desde el primer momento que se necesita (proyectos de antes no lo tenían). */
function ensureCurrent(st: ProjectState): NonNullable<ProjectState['conversation']> {
  if (!st.conversation) {
    const createdAt = st.messages[0]?.createdAt ?? st.project.createdAt ?? Date.now()
    st.conversation = { id: newId(createdAt), title: '', createdAt }
    scheduleSave(st.project.id)
  }
  return st.conversation
}

function currentSummary(st: ProjectState): ConversationSummary {
  const c = ensureCurrent(st)
  return {
    id: c.id,
    projectId: st.project.id,
    title: c.title || titleFrom(st.messages, c.createdAt),
    createdAt: c.createdAt,
    updatedAt: lastAt(st.messages, c.createdAt),
    messageCount: st.messages.length,
    current: true,
    pinned: c.pinned || undefined,
    importedFrom: c.importedFrom
  }
}

/**
 * Pasa a conversaciones las copias que dejaba «Limpiar el chat» en historial/chat-<fecha>.json, una sola vez
 * por proyecto: así las conversaciones de antes también salen en la barra y se pueden retomar.
 */
function importHistory(st: ProjectState): void {
  if (st.historyImported) return
  st.historyImported = true
  const dir = join(st.project.dir, 'historial')
  let names: string[] = []
  try {
    names = existsSync(dir) ? readdirSync(dir).filter((n) => /^chat-.*\.json$/.test(n)) : []
  } catch {
    names = []
  }
  const list = st.conversations ?? []
  for (const name of names) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, name), 'utf8')) as { savedAt?: number; messages?: ChatMessage[]; tasks?: Task[] }
      const messages = Array.isArray(raw.messages) ? raw.messages : []
      if (!messages.length) continue
      const savedAt = typeof raw.savedAt === 'number' ? raw.savedAt : Date.now()
      const createdAt = messages[0]?.createdAt ?? savedAt
      const conv: StoredConversation = {
        id: newId(createdAt),
        title: titleFrom(messages, createdAt),
        createdAt,
        updatedAt: lastAt(messages, savedAt),
        messages,
        tasks: Array.isArray(raw.tasks) ? raw.tasks : []
      }
      writeConversation(st, conv)
      list.push(summaryOf(st, conv))
    } catch {
      /* una copia rota no impide las demás */
    }
  }
  st.conversations = list.sort((a, b) => b.updatedAt - a.updatedAt)
  scheduleSave(st.project.id)
}

function summaryOf(st: ProjectState, c: StoredConversation): ConversationSummary {
  return {
    id: c.id,
    projectId: st.project.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    messageCount: c.messages.length,
    pinned: c.pinned || undefined,
    importedFrom: c.importedFrom
  }
}

function writeConversation(st: ProjectState, c: StoredConversation): void {
  mkdirSync(folder(st), { recursive: true })
  const file = fileOf(st, c.id)
  writeFileSync(`${file}.tmp`, JSON.stringify(c, null, 1), 'utf8')
  renameSync(`${file}.tmp`, file)
}

function readConversation(st: ProjectState, cid: string): StoredConversation {
  if (!isValidConversationId(cid)) throw new Error('Conversación no válida')
  // Si el equipo trabaja en ella en segundo plano, la de memoria es la buena (el archivo va unos instantes por detrás).
  const live = background.get(bgKey(st.project.id, cid))
  if (live) return live.conv
  let conv: StoredConversation
  try {
    const raw = JSON.parse(readFileSync(fileOf(st, cid), 'utf8')) as StoredConversation
    conv = { ...raw, id: cid, messages: Array.isArray(raw.messages) ? raw.messages : [], tasks: Array.isArray(raw.tasks) ? raw.tasks : [] }
  } catch {
    throw new Error('No se encuentra esa conversación')
  }
  // Tareas que se quedaron a medias en segundo plano al cerrar la app: ya no pueden seguir.
  for (const t of conv.tasks) {
    if (t.status === 'running' || t.status === 'pending' || t.status === 'blocked') {
      t.status = 'cancelled'
      t.error = t.error ?? INTERRUPTED_ERROR
      t.finishedAt = t.finishedAt ?? Date.now()
    }
  }
  return conv
}

function load(projectId: string): ProjectState {
  if (!isValidProjectId(projectId)) throw new Error('Proyecto no válido')
  const st = getProject(projectId)
  importHistory(st)
  return st
}

// ---------- Segundo plano: conversaciones donde el equipo sigue trabajando mientras miras otra ----------

/** Petición → conversación donde empezó. En memoria: al reiniciar la app no queda ninguna petición en marcha. */
const runConversation = new Map<string, string>()

interface Background {
  st: ProjectState
  conv: StoredConversation
  timer?: NodeJS.Timeout
}
/** Conversaciones no abiertas que reciben trabajo: se cargan de su archivo y se guardan al rato de cada cambio. */
const background = new Map<string, Background>()
const BG_SAVE_MS = 400
const bgKey = (projectId: string, cid: string): string => `${projectId}/${cid}`

/**
 * Chat al lado o en otra ventana: escribes en una conversación que no es la abierta del proyecto. Mientras se
 * registra ese mensaje (sendMessage hasta que devuelve), las peticiones nuevas que nazcan van a esa conversación y
 * no a la abierta. Va por contexto asíncrono, así que lo que escribas a la vez en el chat principal no se mezcla.
 */
interface SendScope {
  projectId: string
  cid: string
  done: boolean
}
const sendScope = new AsyncLocalStorage<SendScope>()

function scopedConversation(projectId: string): string | undefined {
  const s = sendScope.getStore()
  return s && !s.done && s.projectId === projectId ? s.cid : undefined
}

/** Ejecuta `fn` (un envío) escribiendo en la conversación `cid` del proyecto, esté abierta o no. */
export async function inConversation<T>(projectId: string, cid: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (!cid) return fn()
  if (!isValidConversationId(cid)) throw new Error('Conversación no válida')
  const st = load(projectId)
  if (st.conversation?.id === cid) return fn()
  // Que exista antes de escribir nada en ella (la pudieron borrar o mover desde otra ventana).
  backgroundFor(st, cid)
  const scope: SendScope = { projectId, cid, done: false }
  return sendScope.run(scope, async () => {
    try {
      return await fn()
    } finally {
      // Lo que siga en marcha después (el equipo trabajando) ya tiene su petición atada a esta conversación.
      scope.done = true
    }
  })
}

/** La conversación de una petición; si aún no tiene, la abierta ahora (donde la escribiste). */
export function conversationOfRun(projectId: string, runId: string): string {
  let cid = runConversation.get(runId)
  if (!cid) {
    cid = scopedConversation(projectId) ?? ensureCurrent(load(projectId)).id
    runConversation.set(runId, cid)
  }
  return cid
}

/** La conversación de un mensaje: la de su petición, o la abierta si no tiene. */
export function conversationOfMessage(m: ChatMessage): string | undefined {
  if (!isValidProjectId(m.projectId)) return undefined
  if (m.runId) return conversationOfRun(m.projectId, m.runId)
  return scopedConversation(m.projectId) ?? ensureCurrent(load(m.projectId)).id
}

/**
 * Mensajes y tareas donde se está escribiendo ahora: la conversación del envío en curso (chat al lado u otra
 * ventana) o la abierta. Para buscar el mensaje al que respondes, el plan pendiente, tu último mensaje…
 */
export function currentChat(projectId: string): { messages: ChatMessage[]; tasks: Task[] } {
  const st = load(projectId)
  const cid = scopedConversation(projectId)
  if (!cid || st.conversation?.id === cid) return st
  return backgroundFor(st, cid).conv
}

/**
 * La conversación de una petición antigua. Cuál era se guarda solo en memoria: tras reiniciar kywai se busca en la
 * abierta y en las guardadas del proyecto y se apunta, para que Reanudar y Quitar trabajen en la buena y no en la
 * que tengas abierta ahora. Sin rastro de la petición (p. ej. borraste su conversación), no apunta nada.
 */
export function locateRun(projectId: string, runId: string): void {
  if (runConversation.has(runId)) return
  const st = load(projectId)
  const has = (c: { messages: ChatMessage[]; tasks: Task[] }): boolean => c.tasks.some((t) => t.runId === runId) || c.messages.some((m) => m.runId === runId)
  if (has(st)) {
    runConversation.set(runId, ensureCurrent(st).id)
    return
  }
  for (const c of st.conversations ?? []) {
    if (c.id === st.conversation?.id) continue
    try {
      if (has(readConversation(st, c.id))) {
        runConversation.set(runId, c.id)
        return
      }
    } catch {
      /* conversación ilegible: se sigue buscando */
    }
  }
}

/** Solo para pruebas: olvida en qué conversación empezó cada petición, como al reiniciar kywai. */
export function __forgetRunConversationsForChecks(): void {
  runConversation.clear()
}

/** Una conversación guardada (no la abierta), en memoria para recibir trabajo. Falla si ya no existe. */
function backgroundFor(st: ProjectState, cid: string): Background {
  const key = bgKey(st.project.id, cid)
  let b = background.get(key)
  if (!b) {
    b = { st, conv: readConversation(st, cid) }
    background.set(key, b)
  }
  return b
}

/** La conversación en segundo plano de una petición, o null si es la abierta (o ya no existe: entonces va a la abierta). */
function backgroundOf(projectId: string, runId: string | undefined): Background | null {
  if (!isValidProjectId(projectId)) return null
  // Sin petición (la nota de voz mientras se pasa a texto, un aviso): la del envío en curso, si escribes en otra.
  const cid = runId ? conversationOfRun(projectId, runId) : scopedConversation(projectId)
  if (!cid) return null
  const st = load(projectId)
  if (st.conversation?.id === cid) return null
  try {
    return backgroundFor(st, cid)
  } catch {
    return null
  }
}

function writeBackground(b: Background): void {
  if (b.timer) clearTimeout(b.timer)
  b.timer = undefined
  const { st, conv } = b
  conv.updatedAt = lastAt(conv.messages, conv.updatedAt)
  try {
    writeConversation(st, conv)
  } catch (e) {
    console.error('[cowork] no se pudo guardar la conversación en segundo plano', conv.id, e)
  }
  const summary = summaryOf(st, conv)
  st.conversations = [summary, ...(st.conversations ?? []).filter((c) => c.id !== conv.id)]
  scheduleSave(st.project.id)
}

function touch(b: Background): void {
  if (b.timer) return
  b.timer = setTimeout(() => writeBackground(b), BG_SAVE_MS)
}

/** Deja de tenerla en segundo plano (se abre, se borra o se mueve): lo pendiente se guarda antes en su archivo. */
function releaseBackground(projectId: string, cid: string, save = true): void {
  const key = bgKey(projectId, cid)
  const b = background.get(key)
  if (!b) return
  if (save) writeBackground(b)
  else if (b.timer) clearTimeout(b.timer)
  background.delete(key)
}

/** Guarda ya lo pendiente de las conversaciones en segundo plano (al cerrar la app). */
export function flushBackground(): void {
  for (const b of background.values()) if (b.timer) writeBackground(b)
}

setChatRouter({
  message(m) {
    const b = backgroundOf(m.projectId, m.runId)
    if (!b) return false
    placeMessage(b.conv.messages, m)
    touch(b)
    return true
  },
  task(t) {
    const b = backgroundOf(t.projectId, t.runId)
    if (!b) return false
    const copy = JSON.parse(JSON.stringify(t)) as Task
    const i = b.conv.tasks.findIndex((x) => x.id === copy.id)
    if (i >= 0) b.conv.tasks[i] = copy
    else b.conv.tasks.push(copy)
    touch(b)
    return true
  }
})

// Editar un mensaje tuyo (o cambiar de versión con ‹ ›) en el chat de al lado: se hace en su conversación.
setEditableChat((projectId) => {
  const cid = scopedConversation(projectId)
  if (!cid) return null
  const st = load(projectId)
  if (st.conversation?.id === cid) return null
  const b = backgroundFor(st, cid)
  return {
    projectId,
    conversationId: cid,
    get messages() {
      return b.conv.messages
    },
    set messages(v) {
      b.conv.messages = v
    },
    get tasks() {
      return b.conv.tasks
    },
    set tasks(v) {
      b.conv.tasks = v
    },
    save: () => touch(b)
  }
})

/** Mensajes y tareas de la conversación de una petición (la abierta o la que sigue en segundo plano). */
export function runChat(projectId: string, runId: string): { messages: ChatMessage[]; tasks: Task[] } {
  const b = backgroundOf(projectId, runId)
  return b ? b.conv : getProject(projectId)
}

/**
 * Una conversación para verla sin abrirla (chat al lado o en otra ventana): sus mensajes y tareas, estén en la
 * abierta, en memoria (trabajando en segundo plano) o en su archivo. Las tareas a medias siguen en el proyecto.
 */
export function conversationView(projectId: string, cid: string): { conversation: { id: string; title: string; createdAt: number }; open: boolean; messages: ChatMessage[]; tasks: Task[] } {
  if (!isValidConversationId(cid)) throw new Error('Conversación no válida')
  const st = load(projectId)
  if (st.conversation?.id === cid) return { conversation: { id: cid, title: st.conversation.title, createdAt: st.conversation.createdAt }, open: true, messages: st.messages, tasks: st.tasks }
  const conv = backgroundFor(st, cid).conv
  const mine = new Set(conv.tasks.map((t) => t.id))
  const running = st.tasks.filter((t) => !mine.has(t.id) && t.runId && runConversation.get(t.runId) === cid)
  return {
    conversation: { id: cid, title: conv.title || titleFrom(conv.messages, conv.createdAt), createdAt: conv.createdAt },
    open: false,
    messages: conv.messages,
    tasks: [...conv.tasks, ...running]
  }
}

/** Un mensaje del proyecto por su id: en la conversación abierta o en una que trabaja en segundo plano. */
export function findMessage(projectId: string, messageId: string): ChatMessage | undefined {
  const st = getProject(projectId)
  const open = st.messages.find((x) => x.id === messageId)
  if (open) return open
  for (const [key, b] of background) {
    if (!key.startsWith(`${projectId}/`)) continue
    const m = b.conv.messages.find((x) => x.id === messageId)
    if (m) return m
  }
  return undefined
}

/** Guarda la sesión de CLI con la que un agente acaba de trabajar, en la conversación de su petición. */
export function rememberRunSession(projectId: string, runId: string, agentId: string, s: AgentSession): void {
  const b = backgroundOf(projectId, runId)
  if (!b) return rememberSession(projectId, agentId, s)
  if (!s.sessionId) return
  b.conv.sessions = { ...(b.conv.sessions ?? {}), [agentId]: s }
  touch(b)
}

/** La sesión que un agente puede retomar en la conversación de su petición. */
export function lastRunSession(projectId: string, runId: string, agentId: string, want: { provider: ProviderKind; cwd: string }): AgentSession | undefined {
  const b = backgroundOf(projectId, runId)
  if (!b) return lastSession(projectId, agentId, want)
  return usableSession(b.conv.sessions?.[agentId], want)
}

/** Conversaciones del proyecto: la abierta primero si tiene algo, y luego las guardadas de la más reciente a la más antigua. */
export function listConversations(projectId: string): ConversationSummary[] {
  const st = load(projectId)
  const saved = [...(st.conversations ?? [])].sort((a, b) => b.updatedAt - a.updatedAt).map((c) => ({ ...c, projectId }))
  const cur = currentSummary(st)
  return cur.messageCount ? [cur, ...saved].sort((a, b) => b.updatedAt - a.updatedAt) : [cur, ...saved]
}

/** Las conversaciones con mensajes más recientes de todos los proyectos. */
export function recentConversations(limit = 12): ConversationSummary[] {
  return allConversations().slice(0, Math.max(1, Math.min(50, limit)))
}

/** Historial: todas las conversaciones con mensajes de todos los proyectos, de la más reciente a la más antigua. */
export function allConversations(): ConversationSummary[] {
  const all: ConversationSummary[] = []
  for (const p of listProjects()) {
    try {
      all.push(...listConversations(p.id).filter((c) => c.messageCount > 0))
    } catch {
      /* un proyecto que no carga no deja la lista vacía */
    }
  }
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Guarda la abierta en conversaciones/ (si tiene mensajes) y deja el proyecto sin conversación abierta. */
function stashCurrent(st: ProjectState): void {
  const finished = st.tasks.filter((t) => FINISHED.has(t.status))
  if (st.messages.length) {
    const cur = ensureCurrent(st)
    const conv: StoredConversation = {
      id: cur.id,
      title: cur.title || titleFrom(st.messages, cur.createdAt),
      createdAt: cur.createdAt,
      updatedAt: lastAt(st.messages, cur.createdAt),
      messages: st.messages,
      tasks: finished,
      sessions: exportSessions(st.project.id),
      pinned: cur.pinned || undefined,
      importedFrom: cur.importedFrom
    }
    writeConversation(st, conv)
    st.conversations = [summaryOf(st, conv), ...(st.conversations ?? []).filter((c) => c.id !== conv.id)]
  }
  st.messages = []
  // Las tareas a medias (en pausa, esperando) se quedan: siguen siendo del proyecto.
  st.tasks = st.tasks.filter((t) => !FINISHED.has(t.status))
  st.conversation = undefined
}

/** Conversación nueva: la abierta se guarda (si tiene algo) y el chat queda vacío. Devuelve el id de la nueva. */
export function newConversation(projectId: string): string {
  const st = load(projectId)
  if (!st.messages.length && st.conversation) return st.conversation.id
  stashCurrent(st)
  replaceSessions(projectId, {})
  const now = Date.now()
  st.conversation = { id: newId(now), title: '', createdAt: now }
  scheduleSave(projectId)
  return st.conversation.id
}

/** Vuelve a una conversación guardada para seguir en ella: sus mensajes, sus tareas y las sesiones de sus agentes. */
export function openConversation(projectId: string, conversationId: string): void {
  const st = load(projectId)
  if (st.conversation?.id === conversationId) return
  const conv = readConversation(st, conversationId)
  // Si trabajaba en segundo plano, vuelve a ser la abierta: lo que llegue irá otra vez al chat.
  releaseBackground(projectId, conversationId)
  stashCurrent(st)
  st.messages = conv.messages
  st.tasks = [...st.tasks, ...conv.tasks.filter((t) => !st.tasks.some((x) => x.id === t.id))]
  st.conversation = { id: conv.id, title: conv.title, createdAt: conv.createdAt, pinned: conv.pinned || undefined, importedFrom: conv.importedFrom }
  st.conversations = (st.conversations ?? []).filter((c) => c.id !== conv.id)
  // Su archivo se queda tal cual (sirve de copia): el índice ya no la lista y se reescribe al volver a guardarla.
  replaceSessions(projectId, conv.sessions)
  scheduleSave(projectId)
}

function cleanTitle(title: unknown): string {
  return (typeof title === 'string' ? title : '').replace(/\s+/g, ' ').trim().slice(0, 80)
}

export function renameConversation(projectId: string, conversationId: string, title: unknown): void {
  const st = load(projectId)
  const t = cleanTitle(title)
  if (!t) throw new Error('Escribe un nombre para la conversación')
  if (st.conversation?.id === conversationId) {
    st.conversation.title = t
  } else {
    const conv = readConversation(st, conversationId)
    conv.title = t
    writeConversation(st, conv)
    st.conversations = (st.conversations ?? []).map((c) => (c.id === conversationId ? { ...c, title: t } : c))
  }
  scheduleSave(projectId)
}

/** Borra una conversación guardada: el archivo pasa a conversaciones/borradas/ (no se pierde del todo). */
export function deleteConversation(projectId: string, conversationId: string): void {
  const st = load(projectId)
  if (st.conversation?.id === conversationId) throw new Error('Es la conversación abierta: abre otra o empieza una nueva antes de borrarla')
  if (!isValidConversationId(conversationId)) throw new Error('Conversación no válida')
  releaseBackground(projectId, conversationId)
  const trash = join(folder(st), 'borradas')
  mkdirSync(trash, { recursive: true })
  try {
    renameSync(fileOf(st, conversationId), join(trash, `${conversationId}.json`))
  } catch {
    /* ya no estaba el archivo: basta con quitarla de la lista */
  }
  st.conversations = (st.conversations ?? []).filter((c) => c.id !== conversationId)
  scheduleSave(projectId)
}

/** Fija o suelta una conversación (la abierta o una guardada) en la barra lateral. */
export function setConversationPinned(projectId: string, conversationId: string, pinned: boolean): void {
  const st = load(projectId)
  const value = pinned || undefined
  if (st.conversation?.id === conversationId) {
    st.conversation.pinned = value
  } else {
    const conv = readConversation(st, conversationId)
    conv.pinned = value
    writeConversation(st, conv)
    st.conversations = (st.conversations ?? []).map((c) => (c.id === conversationId ? { ...c, pinned: value } : c))
  }
  scheduleSave(projectId)
}

/** Las conversaciones fijadas de todos los proyectos, de la más reciente a la más antigua. */
export function pinnedConversations(): ConversationSummary[] {
  const all: ConversationSummary[] = []
  for (const p of listProjects()) {
    try {
      all.push(...listConversations(p.id).filter((c) => c.pinned && c.messageCount > 0))
    } catch {
      /* un proyecto que no carga no deja la lista vacía */
    }
  }
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Una conversación completa (la abierta o una guardada), para copiarla. */
function fullConversation(st: ProjectState, conversationId: string): StoredConversation {
  if (st.conversation?.id !== conversationId) return readConversation(st, conversationId)
  const cur = st.conversation
  return {
    id: cur.id,
    title: cur.title || titleFrom(st.messages, cur.createdAt),
    createdAt: cur.createdAt,
    updatedAt: lastAt(st.messages, cur.createdAt),
    messages: st.messages,
    tasks: st.tasks.filter((t) => FINISHED.has(t.status)),
    pinned: cur.pinned,
    importedFrom: cur.importedFrom
  }
}

/**
 * Bifurca una conversación: una copia aparte con sus mensajes y tareas terminadas, para seguir por otro camino
 * sin tocar la original. Los agentes empiezan sesión nueva en la copia (compartir la de la original mezclaría las dos).
 * Con `from`, la copia llega solo hasta ese mensaje (clic derecho → «Bifurcar desde aquí»); con `before`, hasta
 * justo antes de él («Editar y reenviar» un mensaje tuyo: la copia sigue desde ahí con el texto cambiado).
 */
export function forkConversation(projectId: string, conversationId: string, from?: { messageId: string; before?: boolean }): string {
  const st = load(projectId)
  const src = fullConversation(st, conversationId)
  if (!src.messages.length) throw new Error('La conversación está vacía: no hay nada que bifurcar')
  let messages = src.messages
  if (from) {
    const i = messages.findIndex((m) => m.id === from.messageId)
    if (i < 0) throw new Error('Ese mensaje ya no está en la conversación')
    messages = messages.slice(0, from.before ? i : i + 1)
  }
  // Solo las tareas de las peticiones que siguen en la copia.
  const runs = new Set(messages.map((m) => m.runId).filter(Boolean))
  const tasks = from ? src.tasks.filter((t) => !t.runId || runs.has(t.runId)) : src.tasks
  const now = Date.now()
  const copy: StoredConversation = {
    id: newId(now),
    title: cleanTitle(`${src.title} (bifurcada)`),
    createdAt: now,
    updatedAt: now,
    messages: messages.map((m) => ({ ...m })),
    tasks: tasks.map((t) => ({ ...t }))
  }
  writeConversation(st, copy)
  st.conversations = [summaryOf(st, copy), ...(st.conversations ?? [])]
  scheduleSave(projectId)
  return copy.id
}

/**
 * Pasa una conversación a otro proyecto. Si era la abierta, el proyecto de origen queda con una conversación nueva.
 * Las sesiones de los agentes no viajan (son de la carpeta del proyecto de origen): allí empiezan de cero.
 * Devuelve el id que tiene en el destino.
 */
export function moveConversation(projectId: string, conversationId: string, toProjectId: string): string {
  if (projectId === toProjectId) return conversationId
  const st = load(projectId)
  const dest = load(toProjectId)
  releaseBackground(projectId, conversationId)
  if (st.conversation?.id === conversationId) {
    if (!st.messages.length) throw new Error('La conversación está vacía: no hay nada que mover')
    stashCurrent(st)
    replaceSessions(projectId, {})
    const now = Date.now()
    st.conversation = { id: newId(now), title: '', createdAt: now }
  }
  const conv = readConversation(st, conversationId)
  delete conv.sessions
  if (existsSync(fileOf(dest, conv.id))) conv.id = newId()
  writeConversation(dest, conv)
  dest.conversations = [summaryOf(dest, conv), ...(dest.conversations ?? []).filter((c) => c.id !== conv.id)]
  try {
    unlinkSync(fileOf(st, conversationId))
  } catch {
    /* ya no estaba: basta con quitarla de la lista */
  }
  st.conversations = (st.conversations ?? []).filter((c) => c.id !== conversationId)
  scheduleSave(projectId)
  scheduleSave(toProjectId)
  return conv.id
}

export function setPinned(projectId: string, pinned: boolean): void {
  const st = load(projectId)
  st.project.pinned = pinned || undefined
  scheduleSave(projectId)
}

// ---------- buscador ----------

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/**
 * Lo que se busca, ya normalizado: cada palabra por separado (en cualquier orden) y lo que va entre comillas
 * («frase exacta», "frase exacta" o “frase exacta”) como un solo trozo. Sin palabras de menos de dos letras sueltas.
 */
export function parseQuery(raw: unknown): string[] {
  const text = norm(typeof raw === 'string' ? raw : '').slice(0, 200)
  const terms: string[] = []
  const rest = text.replace(/["“”«»]([^"“”«»]+)["“”«»]?/g, (_m, phrase: string) => {
    const p = phrase.replace(/\s+/g, ' ').trim()
    if (p) terms.push(p)
    return ' '
  })
  for (const w of rest.split(/\s+/)) {
    const word = w.replace(/^[.,;:¿?¡!()]+|[.,;:¿?¡!()]+$/g, '')
    if (word.length >= 2 || (word.length === 1 && /\d/.test(word))) terms.push(word)
  }
  return [...new Set(terms)]
}

/** Trozo del texto alrededor de lo encontrado (o el principio si no está). */
export function snippetOf(text: string, q: string | string[], size = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const folded = norm(flat)
  const terms = Array.isArray(q) ? q : [q]
  const found = terms.map((t) => folded.indexOf(t)).filter((x) => x >= 0)
  const i = found.length ? Math.min(...found) : -1
  if (i < 0) return flat.slice(0, size)
  const start = Math.max(0, i - Math.floor(size / 3))
  const end = Math.min(flat.length, start + size)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

/*
 * Índice en memoria: el texto normalizado de cada mensaje se calcula una vez (mientras no cambie) y las
 * conversaciones guardadas se leen del disco solo cuando su archivo cambia. Así buscar a cada tecla no relee
 * todos los archivos de todos los proyectos.
 */
const folded = new WeakMap<object, { text: string; norm: string }>()

function normOf(owner: object, text: string | undefined): string {
  if (!text) return ''
  const hit = folded.get(owner)
  if (hit && hit.text === text) return hit.norm
  const n = norm(text)
  folded.set(owner, { text, norm: n })
  return n
}

const fileCache = new Map<string, { stamp: string; conv: StoredConversation }>()

function readCached(st: ProjectState, cid: string): StoredConversation {
  const file = fileOf(st, cid)
  let stamp = ''
  try {
    const info = statSync(file)
    stamp = `${info.mtimeMs}:${info.size}`
  } catch {
    fileCache.delete(file)
    throw new Error('No se encuentra esa conversación')
  }
  const hit = fileCache.get(file)
  if (hit && hit.stamp === stamp) return hit.conv
  const conv = readConversation(st, cid)
  fileCache.set(file, { stamp, conv })
  return conv
}

/** Vacía el índice (pruebas). */
export function resetSearchIndex(): void {
  fileCache.clear()
}

const DEFAULT_HITS = 40
const MAX_LIMIT = 400
const MAX_MATCHES = 5

function byOf(m: ChatMessage): string {
  return m.author.type === 'agent' ? m.author.agentId : m.author.type
}

function authorOk(by: string, author: string | undefined): boolean {
  if (!author) return true
  if (author === 'user') return by === 'user'
  if (author === 'agents') return by !== 'user' && by !== 'system'
  return by === author
}

/**
 * Busca en el historial (sin distinguir mayúsculas ni tildes): conversaciones (abierta y guardadas), tareas,
 * resultados, memoria y nombres de proyecto, de uno o de todos. Con varias palabras, todas tienen que estar (en
 * cualquier orden) en el mismo mensaje, tarea o nota; lo que va entre comillas, tal cual. Los títulos que coinciden
 * van antes que el texto de dentro, y luego lo más reciente. Devuelve los primeros `limit` y el total.
 */
export function searchHistory(query: unknown, options: SearchOptions = {}): SearchResult {
  const terms = parseQuery(query)
  if (!terms.length || terms.join('').length < 2) return { hits: [], total: 0 }
  const onlyProject = typeof options.projectId === 'string' && options.projectId ? options.projectId : undefined
  const since = typeof options.since === 'number' && Number.isFinite(options.since) ? options.since : 0
  const author = typeof options.author === 'string' && options.author ? options.author : undefined
  const limit = Math.max(1, Math.min(MAX_LIMIT, typeof options.limit === 'number' ? Math.floor(options.limit) : DEFAULT_HITS))
  const projects = listProjects().filter((p) => !onlyProject || p.id === onlyProject)
  const hits: Array<SearchHit & { score: number }> = []
  const all = (n: string): boolean => terms.every((t) => n.includes(t))
  const has = (owner: object, s: string | undefined): boolean => !!s && all(normOf(owner, s))
  const hasPlain = (s: string | undefined): boolean => !!s && all(norm(s))
  const recent = (at: number | undefined): boolean => !since || (at ?? 0) >= since

  for (const p of projects) {
    let st: ProjectState
    try {
      st = load(p.id)
    } catch {
      continue
    }
    const base = { projectId: p.id, projectName: p.name }
    if (!author && hasPlain(p.name) && recent(p.updatedAt)) hits.push({ ...base, kind: 'project', title: p.name, snippet: '', at: p.updatedAt, score: 3 })

    const convs: Array<{ id: string; title: string; updatedAt: number; messages: ChatMessage[]; tasks: Task[] }> = []
    const cur = currentSummary(st)
    convs.push({ id: cur.id, title: cur.title, updatedAt: cur.updatedAt, messages: st.messages, tasks: st.tasks })
    for (const c of st.conversations ?? []) {
      try {
        const full = readCached(st, c.id)
        convs.push({ id: c.id, title: c.title, updatedAt: c.updatedAt, messages: full.messages, tasks: full.tasks })
      } catch {
        /* sin archivo: se salta */
      }
    }

    for (const c of convs) {
      if (!c.messages.length) continue
      const titleHit = !author && hasPlain(c.title) && recent(c.updatedAt)
      const found = c.messages.filter((m) => recent(m.createdAt) && authorOk(byOf(m), author) && has(m, m.text))
      if (titleHit || found.length) {
        const first = found[0]
        const matches = found.slice(0, MAX_MATCHES).map((m) => ({ messageId: m.id, snippet: snippetOf(m.text, terms), at: m.createdAt, by: byOf(m) }))
        hits.push({
          ...base,
          kind: 'conversation',
          conversationId: c.id,
          title: c.title,
          snippet: first ? snippetOf(first.text, terms) : snippetOf(c.messages.find((m) => m.author.type === 'user')?.text ?? '', terms),
          at: found.length ? found[found.length - 1].createdAt : c.updatedAt,
          ...(first ? { messageId: first.id, matchCount: found.length, matches } : {}),
          score: titleHit ? 2 : 1
        })
      }
      if (author === 'user') continue
      for (const t of c.tasks) {
        if (!recent(t.finishedAt ?? t.createdAt) || !authorOk(t.agentId, author)) continue
        const where = has(t, t.title) ? t.title : hasPlain(t.result) ? t.result : hasPlain(t.description) ? t.description : undefined
        if (!where) continue
        hits.push({
          ...base,
          kind: 'task',
          conversationId: c.id,
          title: t.title,
          snippet: where === t.title ? snippetOf(t.result ?? t.description, terms) : snippetOf(where, terms),
          at: t.finishedAt ?? t.createdAt,
          ref: t.id,
          score: where === t.title ? 2 : 1
        })
      }
    }
    if (author) continue
    for (const a of st.artifacts) {
      if (!recent(a.createdAt) || (!hasPlain(a.name) && !hasPlain(a.relPath))) continue
      hits.push({ ...base, kind: 'artifact', title: a.name, snippet: a.relPath, at: a.createdAt, ref: a.id, score: 2 })
    }
    for (const m of st.memory ?? []) {
      if (m.status === 'superseded' || !recent(m.updatedAt ?? m.createdAt) || !has(m, m.text)) continue
      hits.push({ ...base, kind: 'memory', title: m.text.slice(0, 90), snippet: m.byName, at: m.updatedAt ?? m.createdAt, ref: m.id, score: 1 })
    }
  }
  const sorted = hits.sort((a, b) => b.score - a.score || b.at - a.at)
  return { hits: sorted.slice(0, limit).map(({ score: _s, ...h }) => h), total: sorted.length }
}

/** El buscador de antes (Órbita y clientes antiguos): una sola caja, de uno o de todos los proyectos, 40 resultados. */
export function search(query: unknown, onlyProject?: unknown): SearchHit[] {
  return searchHistory(query, { projectId: typeof onlyProject === 'string' ? onlyProject : undefined }).hits
}

/** Lo que trae una conversación importada de otra app (ver importChats.ts). */
export interface ImportedConversation {
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  sessions?: Record<string, AgentSession>
  importedFrom: string
}

/**
 * Guarda en el proyecto una conversación traída de otra app, como una más de la barra lateral (no la abre: la
 * abierta sigue igual). Los mensajes llevan el id del proyecto. Devuelve su id.
 */
export function addImportedConversation(projectId: string, input: ImportedConversation): string {
  const st = load(projectId)
  const conv: StoredConversation = {
    id: newId(input.createdAt),
    title: cleanTitle(input.title) || titleFrom(input.messages, input.createdAt),
    createdAt: input.createdAt,
    updatedAt: Math.max(input.createdAt, input.updatedAt),
    messages: input.messages.map((m) => ({ ...m, projectId })),
    tasks: [],
    sessions: input.sessions && Object.keys(input.sessions).length ? input.sessions : undefined,
    importedFrom: input.importedFrom
  }
  while (existsSync(fileOf(st, conv.id))) conv.id = newId(conv.createdAt)
  writeConversation(st, conv)
  st.conversations = [summaryOf(st, conv), ...(st.conversations ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)
  scheduleSave(projectId)
  return conv.id
}

/**
 * Quita una conversación importada para volver a importarla ordenada (reimportar desde ⚙ → «Importar de otras
 * apps…»). Su archivo va a conversaciones/borradas/. Si era la abierta, el proyecto queda con el chat vacío y
 * devuelve true (hay que avisar a la ventana).
 */
export function dropImportedConversation(projectId: string, conversationId: string): boolean {
  const st = load(projectId)
  if (!isValidConversationId(conversationId)) throw new Error('Conversación no válida')
  const wasOpen = st.conversation?.id === conversationId
  releaseBackground(projectId, conversationId)
  if (wasOpen) {
    st.messages = []
    st.tasks = st.tasks.filter((t) => !FINISHED.has(t.status))
    st.conversation = undefined
    replaceSessions(projectId, {})
  }
  const trash = join(folder(st), 'borradas')
  try {
    mkdirSync(trash, { recursive: true })
    renameSync(fileOf(st, conversationId), join(trash, `${conversationId}.json`))
  } catch {
    /* no tenía archivo (la abierta sin guardar): basta con quitarla de la lista */
  }
  st.conversations = (st.conversations ?? []).filter((c) => c.id !== conversationId)
  scheduleSave(projectId)
  return wasOpen
}

/** Mensajes de una conversación (la abierta o una guardada), para saber si alguien siguió escribiendo en ella. */
export function conversationMessages(projectId: string, conversationId: string): ChatMessage[] {
  const st = load(projectId)
  return st.conversation?.id === conversationId ? st.messages : readConversation(st, conversationId).messages
}

/** La conversación sigue existiendo en el proyecto (guardada o abierta): sirve para no duplicar al importar otra vez. */
export function hasConversation(projectId: string, conversationId: string): boolean {
  if (!isValidProjectId(projectId) || !isValidConversationId(conversationId)) return false
  try {
    const st = load(projectId)
    return st.conversation?.id === conversationId || (st.conversations ?? []).some((c) => c.id === conversationId)
  } catch {
    return false
  }
}
