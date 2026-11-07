import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ChatMessage, ConversationSummary, ProjectState, SearchHit, Task } from '@shared/types'
import { exportSessions, replaceSessions, type AgentSession } from './agentSessions'
import { getProject, isValidProjectId, listProjects, scheduleSave } from './projects'

/**
 * Varias conversaciones por proyecto, como en Claude: la abierta vive en el proyecto (messages y tasks, como
 * siempre, así el motor no cambia) y las demás se guardan en conversaciones/<id>.json dentro de la carpeta
 * interna del proyecto, con las sesiones de CLI de cada agente para retomarlas donde se dejaron.
 * Abrir una guardada intercambia: la abierta se guarda y la elegida pasa a ser la abierta.
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
  return messages.length ? Math.max(fallback, ...messages.map((m) => m.createdAt || 0)) : fallback
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
    current: true
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
  return { id: c.id, projectId: st.project.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, messageCount: c.messages.length }
}

function writeConversation(st: ProjectState, c: StoredConversation): void {
  mkdirSync(folder(st), { recursive: true })
  const file = fileOf(st, c.id)
  writeFileSync(`${file}.tmp`, JSON.stringify(c, null, 1), 'utf8')
  renameSync(`${file}.tmp`, file)
}

function readConversation(st: ProjectState, cid: string): StoredConversation {
  if (!isValidConversationId(cid)) throw new Error('Conversación no válida')
  try {
    const raw = JSON.parse(readFileSync(fileOf(st, cid), 'utf8')) as StoredConversation
    return { ...raw, id: cid, messages: Array.isArray(raw.messages) ? raw.messages : [], tasks: Array.isArray(raw.tasks) ? raw.tasks : [] }
  } catch {
    throw new Error('No se encuentra esa conversación')
  }
}

function load(projectId: string): ProjectState {
  if (!isValidProjectId(projectId)) throw new Error('Proyecto no válido')
  const st = getProject(projectId)
  importHistory(st)
  return st
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
  const all: ConversationSummary[] = []
  for (const p of listProjects()) {
    try {
      all.push(...listConversations(p.id).filter((c) => c.messageCount > 0))
    } catch {
      /* un proyecto que no carga no deja la lista vacía */
    }
  }
  return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, Math.max(1, Math.min(50, limit)))
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
      sessions: exportSessions(st.project.id)
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
  stashCurrent(st)
  st.messages = conv.messages
  st.tasks = [...st.tasks, ...conv.tasks.filter((t) => !st.tasks.some((x) => x.id === t.id))]
  st.conversation = { id: conv.id, title: conv.title, createdAt: conv.createdAt }
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

/** Trozo del texto alrededor de lo encontrado (o el principio si no está). */
export function snippetOf(text: string, q: string, size = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const i = norm(flat).indexOf(q)
  if (i < 0) return flat.slice(0, size)
  const start = Math.max(0, i - Math.floor(size / 3))
  const end = Math.min(flat.length, start + size)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

const MAX_HITS = 40

/**
 * Busca un texto (sin distinguir mayúsculas ni tildes) en las conversaciones (abierta y guardadas), tareas,
 * resultados y memoria de un proyecto o de todos. Los títulos que coinciden van antes que el texto de dentro.
 */
export function search(query: unknown, onlyProject?: unknown): SearchHit[] {
  const q = norm(typeof query === 'string' ? query : '').trim()
  if (q.length < 2) return []
  const projects = listProjects().filter((p) => !onlyProject || p.id === onlyProject)
  const hits: Array<SearchHit & { score: number }> = []
  const has = (s: string | undefined): boolean => !!s && norm(s).includes(q)

  for (const p of projects) {
    let st: ProjectState
    try {
      st = load(p.id)
    } catch {
      continue
    }
    const base = { projectId: p.id, projectName: p.name }
    if (has(p.name)) hits.push({ ...base, kind: 'project', title: p.name, snippet: '', at: p.updatedAt, score: 3 })

    const convs: Array<{ id: string; title: string; updatedAt: number; messages: ChatMessage[]; tasks: Task[]; current: boolean }> = []
    const cur = currentSummary(st)
    convs.push({ id: cur.id, title: cur.title, updatedAt: cur.updatedAt, messages: st.messages, tasks: st.tasks, current: true })
    for (const c of st.conversations ?? []) {
      try {
        const full = readConversation(st, c.id)
        convs.push({ id: c.id, title: c.title, updatedAt: c.updatedAt, messages: full.messages, tasks: full.tasks, current: false })
      } catch {
        /* sin archivo: se salta */
      }
    }

    for (const c of convs) {
      if (!c.messages.length) continue
      const titleHit = has(c.title)
      const msg = titleHit ? undefined : c.messages.find((m) => has(m.text))
      if (titleHit || msg) {
        hits.push({
          ...base,
          kind: 'conversation',
          conversationId: c.id,
          title: c.title,
          snippet: msg ? snippetOf(msg.text, q) : snippetOf(c.messages.find((m) => m.author.type === 'user')?.text ?? '', q),
          at: msg?.createdAt ?? c.updatedAt,
          score: titleHit ? 2 : 1
        })
      }
      for (const t of c.tasks) {
        const where = has(t.title) ? t.title : has(t.result) ? t.result : has(t.description) ? t.description : undefined
        if (!where) continue
        hits.push({
          ...base,
          kind: 'task',
          conversationId: c.id,
          title: t.title,
          snippet: where === t.title ? snippetOf(t.result ?? t.description, q) : snippetOf(where, q),
          at: t.finishedAt ?? t.createdAt,
          ref: t.id,
          score: has(t.title) ? 2 : 1
        })
      }
    }
    for (const a of st.artifacts) {
      if (!has(a.name) && !has(a.relPath)) continue
      hits.push({ ...base, kind: 'artifact', title: a.name, snippet: a.relPath, at: a.createdAt, ref: a.id, score: 2 })
    }
    for (const m of st.memory ?? []) {
      if (m.status === 'superseded' || !has(m.text)) continue
      hits.push({ ...base, kind: 'memory', title: m.text.slice(0, 90), snippet: m.byName, at: m.updatedAt ?? m.createdAt, ref: m.id, score: 1 })
    }
  }
  return hits
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, MAX_HITS)
    .map(({ score: _s, ...h }) => h)
}
