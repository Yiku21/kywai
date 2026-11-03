// Memoria del proyecto: decisiones, hechos, preferencias y pendientes con su procedencia (quién, cuándo, en qué
// tarea) y su estado. Lo que dice el usuario queda confirmado; lo que aportan los agentes, provisional hasta que
// el usuario lo confirme. El coordinador y los agentes la leen en cada encargo, así que sobrevive a «Limpiar el
// chat» y a los reinicios. Se guarda en project.json junto con el resto del proyecto.
import type { AgentId, MemoryEntry, MemoryInput, MemoryKind, MemoryStatus } from '@shared/types'
import { emit } from './events'
import * as store from './projects'

const MAX_ENTRIES = 300
const MAX_TEXT = 400
const MAX_INSTRUCTIONS = 8000
/** Lo que entra en cada encargo: lo confirmado primero y lo más reciente antes. */
const PROMPT_ENTRIES = 40
const PROMPT_CHARS = 5000

export const KIND_LABEL: Record<MemoryKind, string> = {
  decision: 'decisión',
  fact: 'hecho',
  preference: 'preferencia',
  pending: 'pendiente'
}

const STATUS_LABEL: Record<MemoryStatus, string> = {
  confirmed: 'confirmado',
  provisional: 'provisional',
  superseded: 'sustituido'
}

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export function isMemoryKind(k: unknown): k is MemoryKind {
  return k === 'decision' || k === 'fact' || k === 'preference' || k === 'pending'
}

/** «decisión», «hecho», «dato», «pendiente», «preferencia»… → tipo. */
export function kindFromWord(word: string): MemoryKind | null {
  const w = fold(word)
  if (/^decisi|^decid/.test(w)) return 'decision'
  if (/^hecho|^dato|^fact|^descubri|^nota/.test(w)) return 'fact'
  if (/^preferenc|^prefier|^regla/.test(w)) return 'preference'
  if (/^pendiente|^por hacer|^falta|^todo|^problema/.test(w)) return 'pending'
  return null
}

export interface MemoryNote {
  kind: MemoryKind
  text: string
  /** Entrada que sustituye («m3»). */
  replaces?: string
}

const NOTE_LINE = /^\s*[-*•]\s*(?:\*\*)?([\p{L} ]{3,20}?)(?:\*\*)?\s*(?:\((?:sustituye|reemplaza|replaces)\s+(m\d+)\))?\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.+)$/iu

/**
 * Notas que un agente deja al final de su respuesta en «## Para la memoria»:
 * «- decisión: …», «- hecho: …», «- pendiente: …», «- decisión (sustituye m3): …». Como mucho 5.
 */
export function parseMemoryNotes(text: string): MemoryNote[] {
  const m = /^\s{0,3}(?:#{1,4}\s*|\*\*)para la memoria\b[^\n]*\n([\s\S]*?)(?=^\s{0,3}#{1,4}\s|$(?![\s\S]))/im.exec(text ?? '')
  if (!m) return []
  const out: MemoryNote[] = []
  for (const line of m[1].split('\n')) {
    const n = NOTE_LINE.exec(line)
    if (!n) continue
    const kind = kindFromWord(n[1])
    const body = n[3].replace(/\*\*/g, '').trim()
    if (!kind || body.length < 3) continue
    out.push({ kind, text: body.slice(0, MAX_TEXT), replaces: n[2]?.toLowerCase() })
    if (out.length >= 5) break
  }
  return out
}

/** Notas del plan del coordinador ("memory": [{kind, text, replaces}]). */
export function planMemoryNotes(raw: unknown): MemoryNote[] {
  if (!Array.isArray(raw)) return []
  const out: MemoryNote[] = []
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const kind = isMemoryKind(o.kind) ? o.kind : typeof o.kind === 'string' ? kindFromWord(o.kind) : null
    const text = typeof o.text === 'string' ? o.text.replace(/\s+/g, ' ').trim() : ''
    if (!kind || text.length < 3) continue
    const replaces = typeof o.replaces === 'string' && /^m\d+$/i.test(o.replaces.trim()) ? o.replaces.trim().toLowerCase() : undefined
    out.push({ kind, text: text.slice(0, MAX_TEXT), replaces })
  }
  return out
}

const shortDate = (ts: number): string => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

/** Líneas para los encargos (planificar y cada tarea). Sin lo sustituido. */
export function memoryLines(entries: MemoryEntry[]): string[] {
  const active = entries
    .filter((e) => e.status !== 'superseded')
    .sort((a, b) => (a.status === b.status ? b.updatedAt - a.updatedAt : a.status === 'confirmed' ? -1 : 1))
  const out: string[] = []
  let chars = 0
  for (const e of active.slice(0, PROMPT_ENTRIES)) {
    const who = e.by === 'user' ? 'el usuario' : `${e.byName}${e.taskTitle ? ` («${e.taskTitle}»)` : ''}`
    const line = `- ${e.id} · ${KIND_LABEL[e.kind]} · ${STATUS_LABEL[e.status]} · ${who}, ${shortDate(e.createdAt)}: ${e.text}`
    if (chars + line.length > PROMPT_CHARS) break
    chars += line.length
    out.push(line)
  }
  return out
}

function nextId(entries: MemoryEntry[]): string {
  let max = 0
  for (const e of entries) {
    const n = Number(/^m(\d+)$/.exec(e.id)?.[1] ?? 0)
    if (n > max) max = n
  }
  return `m${max + 1}`
}

/** Fuera lo más viejo si se pasa del máximo: primero lo sustituido, luego lo provisional. */
function prune(entries: MemoryEntry[]): MemoryEntry[] {
  if (entries.length <= MAX_ENTRIES) return entries
  const drop = new Set<string>()
  for (const status of ['superseded', 'provisional', 'confirmed'] as MemoryStatus[]) {
    const old = entries.filter((e) => e.status === status).sort((a, b) => a.updatedAt - b.updatedAt)
    for (const e of old) {
      if (entries.length - drop.size <= MAX_ENTRIES) break
      drop.add(e.id)
    }
  }
  return entries.filter((e) => !drop.has(e.id))
}

export interface AddOptions {
  status: MemoryStatus
  by: 'user' | AgentId
  byName: string
  via?: string
  taskId?: string
  taskTitle?: string
  runId?: string
  replaces?: string
}

/**
 * Añade una entrada a la lista (pura: devuelve la lista nueva y la entrada, o null si ya estaba). Un agente
 * no puede sustituir lo que confirmó el usuario: su nota queda como propuesta, sin tocar la confirmada.
 */
export function withEntry(entries: MemoryEntry[], input: MemoryInput, opts: AddOptions, now = Date.now()): { entries: MemoryEntry[]; entry: MemoryEntry | null } {
  const text = input.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
  if (text.length < 3 || !isMemoryKind(input.kind)) return { entries, entry: null }
  const key = fold(text)
  if (entries.some((e) => e.status !== 'superseded' && fold(e.text) === key)) return { entries, entry: null }
  const target = opts.replaces ? entries.find((e) => e.id === opts.replaces && e.status !== 'superseded') : undefined
  const canReplace = !!target && (opts.by === 'user' || target.status !== 'confirmed')
  const entry: MemoryEntry = {
    id: nextId(entries),
    kind: input.kind,
    text: target && !canReplace ? `${text} (propone sustituir ${target.id})` : text,
    status: opts.status,
    by: opts.by,
    byName: opts.byName,
    via: opts.via,
    taskId: opts.taskId,
    taskTitle: opts.taskTitle,
    runId: opts.runId,
    createdAt: now,
    updatedAt: now
  }
  const next = entries.map((e) => (canReplace && e.id === target!.id ? { ...e, status: 'superseded' as const, supersededBy: entry.id, updatedAt: now } : e))
  return { entries: prune([...next, entry]), entry }
}

// ---------- En el proyecto ----------

export function memoryOf(projectId: string): MemoryEntry[] {
  return store.getProject(projectId).memory ?? []
}

export function instructionsOf(projectId: string): string {
  return store.getProject(projectId).instructions ?? ''
}

function changed(projectId: string): void {
  const st = store.getProject(projectId)
  store.scheduleSave(projectId)
  emit({ kind: 'memory.updated', projectId, memory: JSON.parse(JSON.stringify(st.memory ?? [])) as MemoryEntry[], instructions: st.instructions ?? '' })
}

export function addMemory(projectId: string, input: MemoryInput, opts: AddOptions): MemoryEntry | null {
  const st = store.getProject(projectId)
  const { entries, entry } = withEntry(st.memory ?? [], input, opts)
  if (!entry) return null
  st.memory = entries
  changed(projectId)
  return entry
}

export function updateMemory(projectId: string, id: string, patch: Partial<MemoryInput> & { status?: MemoryStatus }): void {
  const st = store.getProject(projectId)
  const e = (st.memory ?? []).find((x) => x.id === id)
  if (!e) throw new Error('Esa entrada ya no está en la memoria')
  if (typeof patch.text === 'string') {
    const text = patch.text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
    if (text.length < 3) throw new Error('El texto es demasiado corto')
    e.text = text
  }
  if (isMemoryKind(patch.kind)) e.kind = patch.kind
  if (patch.status === 'confirmed' || patch.status === 'provisional' || patch.status === 'superseded') {
    e.status = patch.status
    if (patch.status !== 'superseded') e.supersededBy = undefined
  }
  e.updatedAt = Date.now()
  changed(projectId)
}

export function deleteMemory(projectId: string, id: string): void {
  const st = store.getProject(projectId)
  st.memory = (st.memory ?? []).filter((e) => e.id !== id)
  changed(projectId)
}

export function setInstructions(projectId: string, text: string): void {
  const st = store.getProject(projectId)
  st.instructions = text.slice(0, MAX_INSTRUCTIONS)
  changed(projectId)
}

/** Secciones de memoria e instrucciones para un encargo (vacío si no hay nada). */
export function memoryPromptSections(projectId: string): string[] {
  const out: string[] = []
  const instructions = instructionsOf(projectId).trim()
  if (instructions) out.push('', '## Instrucciones del proyecto (las puso el usuario: síguelas siempre)', instructions)
  const lines = memoryLines(memoryOf(projectId))
  if (lines.length) {
    out.push(
      '',
      '## Memoria del proyecto (decisiones y hechos de trabajos anteriores)',
      'Lo «confirmado» lo validó el usuario: respétalo. Lo «provisional» lo anotó un agente: tenlo en cuenta, pero compruébalo si depende de ello.',
      ...lines
    )
  }
  return out
}
