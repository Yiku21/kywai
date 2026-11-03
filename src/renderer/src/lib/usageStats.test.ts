import { describe, expect, it } from 'vitest'
import type { UsageCall, UsageRun } from '@shared/types'
import { compactTokens, deltaText, quotaDeltas, shortDuration, summarize, usageCsv } from './usageStats'

const call = (p: Partial<UsageCall>): UsageCall => ({
  ts: 0,
  kind: 'task',
  agentId: 'claude',
  agentName: 'Claude',
  provider: 'claude',
  input: 0,
  output: 0,
  cached: 0,
  durationMs: 0,
  ok: true,
  ...p
})

const H = 3600_000
const RESET = 10 * H

const runA: UsageRun = {
  runId: 'a',
  projectId: 'p',
  projectName: 'Proyecto',
  request: 'Haz una web, con "comillas"',
  startedAt: 0,
  finishedAt: 10 * 60_000,
  status: 'ok',
  tasks: 2,
  tasksDone: 2,
  calls: [
    call({ kind: 'plan', agentId: 'hermes', agentName: 'Hermes', provider: 'hermes', durationMs: 60_000, noTokens: true }),
    call({ input: 10_000, cached: 6000, output: 2000, durationMs: 8 * 60_000 }),
    call({ agentId: 'codex', agentName: 'Codex', provider: 'codex', input: 5000, output: 1000, durationMs: 7 * 60_000 })
  ],
  quotaBefore: {
    anthropic: { label: 'Claude', at: 0, windows: [{ name: 'seven_day', label: 'Ventana semanal', usedPct: 19, resetsAt: RESET }] },
    openai: { label: 'GPT', at: 0, windows: [{ name: 'primary', label: 'Ventana semanal', usedPct: 2, resetsAt: RESET }] }
  },
  quotaAfter: {
    anthropic: { label: 'Claude', at: 0, windows: [{ name: 'seven_day', label: 'Ventana semanal', usedPct: 21, resetsAt: RESET }] },
    // La ventana de GPT se renovó por medio: no se puede restar.
    openai: { label: 'GPT', at: 0, windows: [{ name: 'primary', label: 'Ventana semanal', usedPct: 1, resetsAt: RESET + 7 * 24 * H }] }
  }
}

const runB: UsageRun = {
  runId: 'b',
  projectId: 'p',
  projectName: 'Proyecto',
  request: 'Otra',
  startedAt: 0,
  finishedAt: 2 * 60_000,
  status: 'failed',
  tasks: 1,
  tasksDone: 0,
  calls: [call({ kind: 'plan', input: 3000, output: 500, durationMs: 30_000 }), call({ input: 4000, output: 0, ok: false, durationMs: 90_000 })]
}

describe('registro de consumo', () => {
  it('resta la cuota solo si es la misma ventana', () => {
    expect(quotaDeltas(runA.quotaBefore, runA.quotaAfter)).toEqual([
      { groupId: 'anthropic', group: 'Claude', window: 'seven_day', label: 'Ventana semanal', delta: 2 }
    ])
    expect(quotaDeltas(undefined, runA.quotaAfter)).toEqual([])
  })

  it('suma tokens, tiempo, coordinación, fallos y reparto por agente', () => {
    const t = summarize([runA, runB])
    expect(t.runs).toBe(2)
    expect(t.ok).toBe(1)
    expect(t.failed).toBe(1)
    expect(t.wallMs).toBe(12 * 60_000)
    // Los agentes trabajaron a la vez: más tiempo de agentes que real.
    expect(t.agentMs).toBe(60_000 + 8 * 60_000 + 7 * 60_000 + 30_000 + 90_000)
    expect(t.tokens).toBe(12_000 + 6000 + 3500 + 4000)
    expect(t.freshTokens).toBe(6000 + 6000 + 3500 + 4000)
    expect(t.planTokens).toBe(3500)
    expect(t.wastedTokens).toBe(4000)
    expect(t.noTokenCalls).toBe(1)
    expect(t.byAgent.map((a) => [a.name, a.calls, a.tokens])).toEqual([
      ['Claude', 3, 19_500],
      ['Codex', 1, 6000],
      ['Hermes', 1, 0]
    ])
    expect(t.quota).toEqual([{ key: 'anthropic:seven_day', group: 'Claude', label: 'Ventana semanal', delta: 2, runs: 1 }])
  })

  it('nombra las ventanas de cuota en corto y sin partir «+5 %»', () => {
    const d = (label: string) => deltaText({ groupId: 'g', group: 'Claude', window: 'w', label, delta: 5 })
    expect(d('Ventana de 5 h')).toBe('Claude 5 h +5 %')
    expect(d('Ventana semanal')).toBe('Claude semana +5 %')
    expect(d('Semanal (Fable)')).toBe('Claude semana Fable +5 %')
  })

  it('formatea tokens y tiempos', () => {
    expect(compactTokens(950)).toBe('950')
    expect(compactTokens(1500)).toBe('1,5 k')
    expect(compactTokens(184_000)).toBe('184 k')
    expect(compactTokens(2_150_000)).toBe('2,2 M')
    expect(shortDuration(45_000)).toBe('45 s')
    expect(shortDuration(12 * 60_000)).toBe('12 min')
    expect(shortDuration(65 * 60_000)).toBe('1 h 05 min')
  })

  it('exporta un CSV con una fila por llamada y texto entrecomillado cuando hace falta', () => {
    const csv = usageCsv([runA]).trim().split('\n')
    expect(csv).toHaveLength(4)
    expect(csv[0]).toMatch(/^fecha,proyecto,peticion,/)
    expect(csv[1]).toContain('"Haz una web, con ""comillas"""')
    expect(csv[1]).toContain('Claude Ventana semanal +2%')
    expect(csv[1]).toContain('planificar,Hermes,hermes,,,,,60,si')
    expect(csv[2]).toContain('tarea,Claude,claude,,10000,2000,6000,480,si')
  })
})
