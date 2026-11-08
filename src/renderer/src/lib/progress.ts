import type { AgentRuntime, Task } from '@shared/types'
import { t } from '@/lib/i18n'
import { serverNow } from './serverClock'

/**
 * Progreso de una tarea. `real` = viene de la lista de pasos del agente y `pct` es su porcentaje. Si el agente no
 * informa de sus pasos no se inventa un porcentaje (una barra que sube sola y se queda en el 95 % engaña): `pct` es 0
 * y se enseña cuánto lleva (`elapsedMs`) y cuánto suelen tardar las parecidas (`expectedMs`), con un brillo que
 * recorre la barra para que se vea que sigue vivo.
 */
export interface TaskProgress {
  pct: number
  real: boolean
  elapsedMs: number
  expectedMs: number
}

export const REAL_HINT = t('Progreso real: pasos completados de la lista de trabajo del agente')
export const ESTIMATE_HINT = t('Este agente no informa de sus pasos: se ve cuánto lleva, sin inventar un porcentaje')

/** «45 s», «4 min», «1 h 05». */
export function shortClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

/** Explicación de una tarea sin progreso real: cuánto lleva y cuánto suelen tardar las parecidas. */
export function progressHint(p: TaskProgress): string {
  if (p.real) return REAL_HINT
  return t('Lleva {elapsed}; las tareas parecidas suelen tardar unos {expected}. {hint}', { elapsed: shortClock(p.elapsedMs), expected: shortClock(p.expectedMs), hint: ESTIMATE_HINT })
}

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
export function taskProgress(task: Task, history: Iterable<Task>, now = serverNow()): TaskProgress | null {
  const elapsedMs = Math.max(0, now - (task.startedAt ?? now))
  const expectedMs = task.status === 'running' ? expectedDuration(task, history) : 0
  if (task.status === 'done') return { pct: 100, real: true, elapsedMs, expectedMs }
  if (task.status !== 'running') return null
  if (task.progress != null) return { pct: Math.round(Math.min(0.99, Math.max(0, task.progress)) * 100), real: true, elapsedMs, expectedMs }
  return { pct: 0, real: false, elapsedMs, expectedMs }
}

/**
 * Progreso global de un plan: tareas terminadas más la parte hecha (real) de las que están en curso. Las que no
 * informan de sus pasos no suman hasta terminar: es el avance seguro, no una estimación.
 */
export function planProgress(tasks: Task[], history: Iterable<Task>, now = serverNow()): TaskProgress {
  const started = tasks.map((x) => x.startedAt).filter((x): x is number => !!x)
  const elapsedMs = started.length ? Math.max(0, now - Math.min(...started)) : 0
  if (tasks.length === 0) return { pct: 0, real: true, elapsedMs, expectedMs: 0 }
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
  return { pct: Math.round((sum / tasks.length) * 100), real, elapsedMs, expectedMs: 0 }
}

/** «37%» si es real; si no, cuánto lleva («4 min»). */
export function progressText(p: TaskProgress): string {
  return p.real ? `${p.pct}%` : shortClock(p.elapsedMs)
}

/** Cuánto lleva el agente sin contar nada nuevo mientras trabaja (ms), o 0 si no está trabajando. */
export function quietFor(rt: AgentRuntime | undefined, now = serverNow()): number {
  if (!rt || (rt.activity !== 'working' && rt.activity !== 'thinking') || !rt.lastActivityAt) return 0
  return Math.max(0, now - rt.lastActivityAt)
}

/**
 * Frase para cuando el agente lleva un rato callado (30 s o más): dice cuánto y qué suele estar haciendo, para que
 * no parezca atascado. Los CLI no avisan mientras piensan ni mientras escriben un archivo largo de una vez (medido:
 * Codex estuvo 4 min 41 s escribiendo un documento de 43 KB sin ningún aviso). null si no hace falta.
 */
export function quietText(ms: number): string | null {
  if (ms < SILENT_MS) return null
  const m = Math.floor(ms / 60_000)
  const time = m < 1 ? `${Math.floor(ms / 1000)} s` : `${m} min`
  return t('Pensando o escribiendo algo largo · sin novedades desde hace {time}', { time })
}

/** El agente lleva un rato sin informar nada (suele estar razonando). */
export function isSilent(rt: AgentRuntime | undefined, now = serverNow()): boolean {
  if (!rt || (rt.activity !== 'working' && rt.activity !== 'thinking')) return false
  return !!rt.lastActivityAt && now - rt.lastActivityAt > SILENT_MS
}
