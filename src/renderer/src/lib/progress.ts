import type { AgentRuntime, Task } from '@shared/types'

/** Progreso de una tarea en porcentaje. `real` = viene de la lista de pasos del agente. */
export interface TaskProgress {
  pct: number
  real: boolean
}

export const REAL_HINT = 'Progreso real: pasos completados de la lista de trabajo del agente'
export const ESTIMATE_HINT = 'Estimación (≈): este agente no informa sus pasos; se calcula con lo que tardaron tareas parecidas'

/** Duración por defecto (s) cuando aún no hay historial. */
const DEFAULT_SECONDS: Record<Task['difficulty'], number> = { easy: 60, medium: 180, hard: 420 }
const SILENT_MS = 30_000

const isBecario = (t: Task): boolean => /-becario-\d+$/.test(t.agentId)
const baseAgent = (id: string): string => id.replace(/-becario-\d+$/, '')

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Duración esperada (ms) según tareas parecidas ya terminadas en el proyecto. */
export function expectedDuration(task: Task, history: Iterable<Task>): number {
  const finished: Task[] = []
  for (const h of history) if (h.id !== task.id && h.status === 'done' && h.startedAt && h.finishedAt) finished.push(h)
  const dur = (h: Task): number => h.finishedAt! - h.startedAt!
  const same = finished.filter(
    (h) => baseAgent(h.agentId) === baseAgent(task.agentId) && isBecario(h) === isBecario(task) && h.difficulty === task.difficulty
  )
  const similar = finished.filter((h) => h.difficulty === task.difficulty)
  const pool = same.length ? same : similar.length >= 2 ? similar : []
  if (pool.length) return Math.min(30 * 60_000, Math.max(10_000, median(pool.map(dur))))
  return (DEFAULT_SECONDS[task.difficulty] ?? 180) * (isBecario(task) ? 0.6 : 1) * 1000
}

/** Progreso de una tarea: real si el agente lo informa; si no, estimado. null si no ha empezado. */
export function taskProgress(task: Task, history: Iterable<Task>, now = Date.now()): TaskProgress | null {
  if (task.status === 'done') return { pct: 100, real: true }
  if (task.status !== 'running') return null
  if (task.progress != null) return { pct: Math.round(Math.min(0.99, Math.max(0, task.progress)) * 100), real: true }
  const elapsed = Math.max(0, now - (task.startedAt ?? now))
  // Curva que avanza rápido al principio y nunca llega al 100 % hasta que la tarea termina de verdad.
  const p = 0.95 * (1 - Math.exp(-elapsed / expectedDuration(task, history)))
  return { pct: Math.max(2, Math.round(p * 100)), real: false }
}

/** Progreso global de un plan: tareas terminadas más la parte hecha de las que están en curso. */
export function planProgress(tasks: Task[], history: Iterable<Task>, now = Date.now()): TaskProgress {
  if (tasks.length === 0) return { pct: 0, real: true }
  let sum = 0
  let real = true
  for (const t of tasks) {
    if (t.status === 'done') {
      sum += 1
      continue
    }
    const p = taskProgress(t, history, now)
    if (p) {
      sum += p.pct / 100
      if (!p.real) real = false
    }
  }
  return { pct: Math.round((sum / tasks.length) * 100), real }
}

export function progressText(p: TaskProgress): string {
  return p.real ? `${p.pct}%` : `≈ ${p.pct}%`
}

/** El agente lleva un rato sin informar nada (suele estar razonando). */
export function isSilent(rt: AgentRuntime | undefined, now = Date.now()): boolean {
  if (!rt || (rt.activity !== 'working' && rt.activity !== 'thinking')) return false
  return !!rt.lastActivityAt && now - rt.lastActivityAt > SILENT_MS
}
