import { describe, expect, it } from 'vitest'
import type { UsageCall, UsageRun } from './types'
import { agentQuality, baseAgentId, qualityLine, type AgentQuality } from './agentQuality'

let clock = 1_000_000
const task = (agentId: string, taskId: string, ok: boolean, extra: Partial<UsageCall> = {}): UsageCall => ({
  ts: (clock += 1000),
  kind: 'task',
  taskId,
  agentId,
  agentName: agentId === 'codex' ? 'Codex' : agentId === 'claude' ? 'Claude' : 'Becario',
  provider: agentId.startsWith('codex') ? 'codex' : 'claude',
  input: 1000,
  output: 500,
  cached: 0,
  durationMs: 60_000,
  ok,
  difficulty: 'medium',
  ...extra
})
const verify = (taskId: string, verdict?: 'pass' | 'fail'): UsageCall => ({
  ts: (clock += 1000),
  kind: 'verify',
  taskId,
  agentId: 'claude',
  agentName: 'Claude',
  provider: 'claude',
  input: 10,
  output: 10,
  cached: 0,
  durationMs: 1000,
  ok: !!verdict,
  verdict
})
const run = (calls: UsageCall[], status: UsageRun['status'] = 'ok'): UsageRun => ({
  runId: `r${clock}`,
  projectId: 'p',
  projectName: 'P',
  request: 'x',
  startedAt: 0,
  status,
  tasks: 0,
  tasksDone: 0,
  calls
})

describe('calidad por agente', () => {
  it('cuenta tareas, 👍, verificación a la primera, correcciones, fallos y medianas', () => {
    const runs = [
      run([
        // t1: pasa a la primera y le sirve.
        task('codex', 't1', true, { rating: 'up' }),
        verify('t1', 'pass'),
        // t2: el verificador ve fallos, Codex corrige (otra llamada suya) y pasa; no le sirve.
        task('codex', 't2', true, { rating: 'down', difficulty: 'hard' }),
        verify('t2', 'fail'),
        task('codex', 't2', true, { rating: 'down', difficulty: 'hard', durationMs: 30_000 }),
        verify('t2', 'pass'),
        // t3: Codex falla y la termina Claude, que recibe la valoración.
        task('codex', 't3', false),
        task('claude', 't3', true, { rating: 'up' }),
        // Planificar no cuenta.
        { ...task('codex', 'x', true), kind: 'plan', taskId: undefined }
      ])
    ]
    const [codex, claude] = agentQuality(runs)
    expect(codex).toMatchObject({
      agentId: 'codex',
      agentName: 'Codex',
      tasks: 3,
      rated: 2,
      liked: 1,
      likedPct: 50,
      verified: 2,
      firstPass: 1,
      firstPassPct: 50,
      fixed: 1,
      fixedPct: 50,
      failed: 1,
      failedPct: 33,
      medianMs: 60_000,
      medianTokens: 1500
    })
    expect(codex.byDifficulty.map((g) => [g.difficulty, g.tasks])).toEqual([
      ['hard', 1],
      ['medium', 2]
    ])
    // La tarea corregida cuenta su tiempo y sus tokens de las dos llamadas.
    expect(codex.byDifficulty[0]).toMatchObject({ medianMs: 90_000, medianTokens: 3000, fixed: 1 })
    expect(claude).toMatchObject({ tasks: 1, liked: 1, rated: 1, failed: 0, verified: 0, firstPassPct: null })
  })

  it('los becarios cuentan para su jefe; lo cancelado no cuenta; registros antiguos sin dificultad ni veredicto', () => {
    expect(baseAgentId('codex-becario-3')).toBe('codex')
    const old = (agentId: string, taskId: string, ok: boolean): UsageCall => {
      const c = task(agentId, taskId, ok)
      delete c.difficulty
      return c
    }
    const runs = [
      run([old('codex-becario-1', 'a', true), task('codex', 'b', false, { cancelled: true })]),
      // Petición cancelada de antes de guardar «cancelled»: su llamada fallida no es un fallo del agente.
      run([old('codex', 'c', false)], 'cancelled')
    ]
    const [codex] = agentQuality(runs)
    expect(codex).toMatchObject({ agentId: 'codex', agentName: 'Codex', tasks: 1, failed: 0, verified: 0 })
    expect(codex.byDifficulty).toEqual([expect.objectContaining({ difficulty: 'unknown', tasks: 1 })])
  })

  it('sin tokens informados la mediana de tokens es null; el periodo filtra por fecha', () => {
    const runs = [run([task('codex', 'a', true, { noTokens: true, ts: 10 }), task('codex', 'b', true, { noTokens: true, ts: 5_000_000_000 })])]
    expect(agentQuality(runs)[0]).toMatchObject({ tasks: 2, medianTokens: null })
    expect(agentQuality(runs, 1000)[0].tasks).toBe(1)
  })

  it('la línea para el coordinador solo aparece con 5 tareas o más', () => {
    const base = { agentId: 'codex', agentName: 'Codex', provider: 'codex' as const }
    const q: AgentQuality = {
      ...base,
      tasks: 12,
      rated: 9,
      liked: 7,
      verified: 8,
      firstPass: 6,
      fixed: 2,
      failed: 1,
      likedPct: 78,
      firstPassPct: 75,
      fixedPct: 25,
      failedPct: 8,
      medianMs: 4 * 60_000,
      medianTokens: 120_000,
      byDifficulty: [
        { difficulty: 'hard', tasks: 4, rated: 3, liked: 1, verified: 4, firstPass: 2, fixed: 2, failed: 1, likedPct: 33, firstPassPct: 50, fixedPct: 50, failedPct: 25, medianMs: 1, medianTokens: 1 },
        { difficulty: 'medium', tasks: 8, rated: 6, liked: 6, verified: 4, firstPass: 4, fixed: 0, failed: 0, likedPct: 100, firstPassPct: 100, fixedPct: 0, failedPct: 0, medianMs: 1, medianTokens: 1 }
      ]
    }
    expect(qualityLine(q)).toBe(
      'calidad (30 días, 12 tareas): le sirvieron al usuario 7 de 9 valoradas; verificación: 6 de 8 a la primera, 2 necesitaron corrección; 1 falló o pasó a otro (8 %); mediana unos 4 min y 120 k tokens por tarea · por dificultad → difíciles 4: le sirvieron al usuario 1 de 3 valoradas; verificación: 2 de 4 a la primera, 2 necesitaron corrección; 1 falló o pasó a otro (25 %)'
    )
    expect(qualityLine({ ...q, tasks: 4 })).toBeNull()
    expect(qualityLine(null)).toBeNull()
  })
})
