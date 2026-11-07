// Registro de consumo por petición: tokens de cada llamada a un agente, tiempo, resultado y cuánto se movió la
// cuota de cada suscripción. Sirve para comparar kywai con usar un solo agente y ver si compensa.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MessageRating, QuotaSnapshot, UsageCall, UsageRun } from '@shared/types'
import { emit } from './events'

const KEEP_MS = 180 * 24 * 3600_000
const MAX_RUNS = 2000
const SAVE_MS = 1000
const EMIT_MS = 400

let file = ''
let runs: UsageRun[] = []
let saveTimer: NodeJS.Timeout | null = null
const emitTimers = new Map<string, NodeJS.Timeout>()

export function initUsageLog(workspaceRoot: string): void {
  file = join(workspaceRoot, 'usage-runs.json')
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, 'utf8')) as { runs?: UsageRun[] }
      runs = (j.runs ?? []).filter((r) => r && typeof r.runId === 'string' && Array.isArray(r.calls))
    }
  } catch {
    runs = []
  }
  // Peticiones que seguían en marcha cuando se cerró la app.
  for (const r of runs) {
    if (r.status === 'running') {
      r.status = 'cancelled'
      r.finishedAt ??= r.calls.length ? Math.max(...r.calls.map((c) => c.ts)) : r.startedAt
    }
  }
}

export function usageRuns(): UsageRun[] {
  return runs
}

function save(): void {
  if (!file) return
  try {
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify({ runs }), 'utf8')
    renameSync(tmp, file)
  } catch (e) {
    console.error('[cowork] no se pudo guardar el registro de consumo', e)
  }
}

export function flushUsageLog(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  save()
}

function changed(run: UsageRun): void {
  if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null
      save()
    }, SAVE_MS)
  }
  if (emitTimers.has(run.runId)) return
  emitTimers.set(
    run.runId,
    setTimeout(() => {
      emitTimers.delete(run.runId)
      emit({ kind: 'usage.run', run: JSON.parse(JSON.stringify(run)) as UsageRun })
    }, EMIT_MS)
  )
}

function find(runId: string): UsageRun | undefined {
  for (let i = runs.length - 1; i >= 0; i--) if (runs[i].runId === runId) return runs[i]
  return undefined
}

export function startRunUsage(r: { runId: string; projectId: string; projectName: string; request: string }): void {
  const now = Date.now()
  runs = runs.filter((x) => now - x.startedAt < KEEP_MS).slice(-(MAX_RUNS - 1))
  const run: UsageRun = {
    ...r,
    request: r.request.replace(/\s+/g, ' ').trim().slice(0, 240),
    startedAt: now,
    status: 'running',
    tasks: 0,
    tasksDone: 0,
    calls: []
  }
  runs.push(run)
  changed(run)
}

/** Una petición interrumpida que se reanuda: vuelve a «en marcha» sin contar el tiempo que estuvo parada. */
export function resumeRunUsage(runId: string): void {
  const run = find(runId)
  if (!run) return
  if (run.finishedAt) run.pausedMs = (run.pausedMs ?? 0) + Math.max(0, Date.now() - run.finishedAt)
  run.status = 'running'
  run.finishedAt = undefined
  changed(run)
}

export function recordCall(runId: string, call: UsageCall): void {
  const run = find(runId)
  if (!run) return
  run.calls.push(call)
  changed(run)
}

/**
 * Valoración del usuario (👍/👎): con taskId, en las llamadas de esa tarea (la ficha del agente la usa); sin él, en
 * la petición entera. null la quita. Funciona también con peticiones antiguas: el registro se guarda 180 días.
 */
export function rateUsage(runId: string, taskId: string | undefined, rating: MessageRating | null): void {
  const run = find(runId)
  if (!run) return
  if (taskId) for (const c of run.calls) if (c.kind === 'task' && c.taskId === taskId) c.rating = rating ?? undefined
  else run.rating = rating ?? undefined
  changed(run)
}

export function finishRunUsage(runId: string, status: UsageRun['status'], tasks: number, tasksDone: number): void {
  const run = find(runId)
  if (!run || run.status !== 'running') return
  run.status = status
  run.finishedAt = Date.now()
  run.tasks = tasks
  run.tasksDone = tasksDone
  changed(run)
}

export function setRunQuota(runId: string, when: 'before' | 'after', snap: QuotaSnapshot): void {
  const run = find(runId)
  if (!run || !Object.keys(snap).length) return
  if (when === 'before') run.quotaBefore = snap
  else run.quotaAfter = snap
  changed(run)
}
