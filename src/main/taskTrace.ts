// Registro de lo que hace cada agente en una tarea: lo que piensa, cada herramienta con su resultado y lo que
// responde. Se ve en directo (eventos task.trace) y después: se guarda un archivo por tarea en workspace/traces.
import { promises as fsp, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TraceEntry, WorkFile } from '@shared/types'
import type { TraceUpdate } from './agents/types'
import { emit } from './events'

const MAX_ENTRIES = 600
const BODY_MAX = 12_000
const OUTPUT_MAX = 6_000
const KEEP_MS = 30 * 24 * 3600_000
/** Tareas cuyo registro se queda en memoria (las demás se leen del disco). */
const MEMORY_TASKS = 40
/** Texto que sigue llegando (y resultados): como mucho unas 4 actualizaciones por segundo. */
const EMIT_MS = 250
const ID_RE = /^[\w-]{1,80}$/

interface Trace {
  projectId: string
  entries: TraceEntry[]
  byId: Map<string, TraceEntry>
  /** id del agente (herramienta, mensaje) → id de la entrada, en el intento actual. */
  ext: Map<string, string>
  /** Última entrada que crece con trozos de texto. */
  deltaId: string | null
  seq: number
  attempt: number
  open: boolean
  pending: Set<string>
  timer: NodeJS.Timeout | null
}

let dir = ''
const traces = new Map<string, Trace>()

export function initTaskTraces(workspaceRoot: string): void {
  dir = join(workspaceRoot, 'traces')
  try {
    mkdirSync(dir, { recursive: true })
    const now = Date.now()
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      const p = join(dir, f)
      try {
        if (now - statSync(p).mtimeMs > KEEP_MS) unlinkSync(p)
      } catch {
        /* otro proceso lo borró */
      }
    }
  } catch (e) {
    console.error('[cowork] no se pudo preparar la carpeta de registros de tareas', e)
  }
}

const clipBody = (s: string): string => (s.length > BODY_MAX ? `${s.slice(0, BODY_MAX)}\n… (recortado)` : s)
const clipOutput = (s: string): string => (s.length > OUTPUT_MAX ? `… (recortado)\n${s.slice(-OUTPUT_MAX)}` : s)

function send(taskId: string, t: Trace, e: TraceEntry): void {
  emit({ kind: 'task.trace', taskId, projectId: t.projectId, entry: { ...e } })
}

function flushPending(taskId: string, t: Trace): void {
  if (t.timer) clearTimeout(t.timer)
  t.timer = null
  for (const id of t.pending) {
    const e = t.byId.get(id)
    if (e) send(taskId, t, e)
  }
  t.pending.clear()
}

function changed(taskId: string, t: Trace, e: TraceEntry): void {
  t.pending.add(e.id)
  t.timer ??= setTimeout(() => flushPending(taskId, t), EMIT_MS)
}

function add(taskId: string, t: Trace, entry: Omit<TraceEntry, 'id' | 'ts'>): TraceEntry {
  // Lo que estaba pendiente sale antes, para que el orden sea el mismo en la interfaz.
  flushPending(taskId, t)
  const e: TraceEntry = { ...entry, id: `${t.attempt}-${++t.seq}`, ts: Date.now() }
  t.entries.push(e)
  t.byId.set(e.id, e)
  while (t.entries.length > MAX_ENTRIES) t.byId.delete(t.entries.shift()!.id)
  send(taskId, t, e)
  return e
}

/** Empieza (o sigue, si se reintenta) el registro de una tarea. */
export function startTrace(taskId: string, projectId: string): void {
  let t = traces.get(taskId)
  if (t) {
    traces.delete(taskId)
    t.attempt++
    t.ext.clear()
    t.deltaId = null
  } else {
    // Una tarea retomada tras reiniciar la app sigue su registro guardado.
    const saved = getTaskTrace(taskId)
    const attempts = saved.map((e) => Number(/^(\d+)-/.exec(e.id)?.[1] ?? 0))
    t = {
      projectId,
      entries: saved,
      byId: new Map(saved.map((e) => [e.id, e])),
      ext: new Map(),
      deltaId: null,
      seq: saved.length,
      attempt: Math.max(0, ...attempts) + 1,
      open: true,
      pending: new Set(),
      timer: null
    }
  }
  t.open = true
  traces.set(taskId, t)
  for (const [id, old] of traces) {
    if (traces.size <= MEMORY_TASKS) break
    if (!old.open) traces.delete(id)
  }
}

export function traceUpdate(taskId: string, u: TraceUpdate): void {
  const t = traces.get(taskId)
  if (!t) return
  // Ya terminada: solo admite avisos (p. ej. archivos que cambió fuera de los suyos) y se vuelve a guardar.
  if (!t.open) {
    if (u.type !== 'note' || !u.text.trim()) return
    add(taskId, t, { kind: u.error ? 'error' : 'note', title: u.text })
    save(taskId, t)
    return
  }
  const ext = (id: string | undefined): TraceEntry | undefined => {
    const eid = id ? t.ext.get(id) : undefined
    return eid ? t.byId.get(eid) : undefined
  }
  switch (u.type) {
    case 'thinking':
    case 'text': {
      if (!u.text) return
      const known = ext(u.id)
      if (known) {
        // Con id y por trozos (Muse): cada trozo se añade a lo anterior.
        known.body = clipBody(u.delta ? (known.body ?? '') + u.text : u.text)
        changed(taskId, t, known)
        return
      }
      const last = t.entries[t.entries.length - 1]
      if (u.delta && last && last.kind === u.type && t.deltaId === last.id) {
        last.body = clipBody((last.body ?? '') + u.text)
        changed(taskId, t, last)
        return
      }
      if (!u.delta && !u.text.trim()) return
      const e = add(taskId, t, { kind: u.type, title: u.type === 'thinking' ? 'Razonando' : 'Respuesta', body: clipBody(u.text) })
      t.deltaId = u.delta ? e.id : null
      if (u.id) t.ext.set(u.id, e.id)
      return
    }
    case 'tool': {
      const known = ext(u.id)
      if (known) {
        known.tool = u.tool
        known.title = u.title
        if (u.body != null) known.body = clipBody(u.body)
        changed(taskId, t, known)
        return
      }
      const e = add(taskId, t, { kind: 'tool', tool: u.tool, title: u.title, body: u.body ? clipBody(u.body) : undefined })
      t.deltaId = null
      if (u.id) t.ext.set(u.id, e.id)
      return
    }
    case 'result': {
      const e = ext(u.id)
      if (!e) return
      e.ok = u.ok
      const out = (u.output ?? '').trimEnd()
      if (out.trim()) e.output = clipOutput(out)
      changed(taskId, t, e)
      return
    }
    case 'note':
      if (!u.text.trim()) return
      add(taskId, t, { kind: u.error ? 'error' : 'note', title: u.text })
      t.deltaId = null
      return
  }
}

/** Archivos nuevos que la tarea acaba de crear o abrir (se enseñan en el chat mientras trabaja). */
export function traceFiles(taskId: string, files: WorkFile[]): void {
  const t = traces.get(taskId)
  if (!t || !t.open || !files.length) return
  add(taskId, t, { kind: 'files', title: files.length === 1 ? 'Archivo nuevo' : 'Archivos nuevos', body: JSON.stringify(files) })
}

export function traceNote(taskId: string, text: string, error = false): void {
  traceUpdate(taskId, { type: 'note', text, error })
}

function fileFor(taskId: string): string | null {
  return dir && ID_RE.test(taskId) ? join(dir, `${taskId}.json`) : null
}

function saveSync(taskId: string, t: Trace): void {
  const file = fileFor(taskId)
  if (!file || !t.entries.length) return
  try {
    writeFileSync(`${file}.tmp`, JSON.stringify({ projectId: t.projectId, entries: t.entries }), 'utf8')
    renameSync(`${file}.tmp`, file)
  } catch (e) {
    console.error('[cowork] no se pudo guardar el registro de la tarea', e)
  }
}

/** Guardado en segundo plano (en orden: cada uno espera al anterior de la misma tarea). */
const saving = new Map<string, Promise<void>>()
function save(taskId: string, t: Trace): void {
  const file = fileFor(taskId)
  if (!file || !t.entries.length) return
  const data = JSON.stringify({ projectId: t.projectId, entries: t.entries })
  const prev = saving.get(taskId) ?? Promise.resolve()
  const next = prev
    .then(() => fsp.writeFile(`${file}.tmp`, data, 'utf8'))
    .then(() => fsp.rename(`${file}.tmp`, file))
    .catch((e) => console.error('[cowork] no se pudo guardar el registro de la tarea', e))
    .finally(() => {
      if (saving.get(taskId) === next) saving.delete(taskId)
    })
  saving.set(taskId, next)
}

/** La tarea terminó (bien, mal o detenida): se guarda su registro. */
export function finishTrace(taskId: string): void {
  const t = traces.get(taskId)
  if (!t?.open) return
  flushPending(taskId, t)
  t.open = false
  save(taskId, t)
}

/** Al cerrar la app: se guarda lo que lleve cada tarea en marcha. */
export function flushTaskTraces(): void {
  for (const [id, t] of traces) {
    if (!t.open) continue
    flushPending(id, t)
    saveSync(id, t)
  }
}

/** Borra los registros de estas tareas (al eliminar su proyecto). */
export function deleteTraces(taskIds: string[]): void {
  for (const id of taskIds) {
    const t = traces.get(id)
    if (t?.timer) clearTimeout(t.timer)
    traces.delete(id)
    const file = fileFor(id)
    if (!file) continue
    try {
      unlinkSync(file)
    } catch {
      /* no tenía registro */
    }
  }
}

export function getTaskTrace(taskId: string): TraceEntry[] {
  const t = traces.get(taskId)
  if (t) return t.entries.map((e) => ({ ...e }))
  const file = fileFor(taskId)
  if (!file) return []
  try {
    const j = JSON.parse(readFileSync(file, 'utf8')) as { entries?: TraceEntry[] }
    return Array.isArray(j.entries) ? j.entries.filter((e) => e && typeof e.id === 'string') : []
  } catch {
    return []
  }
}
