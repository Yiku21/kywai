import { describe, expect, it } from 'vitest'
import type { AgentConfig, QuotaInfo, UsageCall, UsageRun } from '@shared/types'
import { DEFAULT_AGENTS, upgradeAgentProfile } from '@shared/defaults'
import { agentHistory, agentQualityFor, modelLines, profileLines, quotaLine } from './agentProfile'

const NOW = Date.UTC(2026, 9, 11, 12)
const call = (agentId: string, ok: boolean, min: number, daysAgo = 1): UsageCall => ({
  ts: NOW - daysAgo * 86_400_000,
  kind: 'task',
  agentId,
  agentName: agentId,
  provider: 'codex',
  input: 1,
  output: 1,
  cached: 0,
  durationMs: min * 60_000,
  ok
})
const run = (calls: UsageCall[]): UsageRun => ({
  runId: 'r',
  projectId: 'p',
  projectName: 'P',
  request: 'x',
  startedAt: 0,
  status: 'ok',
  tasks: 0,
  tasksDone: 0,
  calls
})

describe('ficha de cada agente', () => {
  it('historial: tareas del agente y sus becarios en los últimos 30 días', () => {
    const runs = [
      run([call('codex', true, 4), call('codex-becario-1', true, 2), call('codex', false, 10), call('claude', true, 3)]),
      run([call('codex', true, 6), call('codex', true, 99, 40)])
    ]
    expect(agentHistory(runs, 'codex', NOW)).toEqual({ tasks: 4, okPct: 75, medianMs: 5 * 60_000 })
    expect(agentHistory(runs, 'gemini', NOW)).toBeNull()
  })

  it('las valoraciones del usuario (👍/👎) se cuentan por tarea, aunque tuviera varios intentos', () => {
    const rated = (id: string, taskId: string, rating: 'up' | 'down'): UsageCall => ({ ...call(id, true, 3), taskId, rating })
    const runs = [run([rated('codex', 't1', 'up'), rated('codex', 't1', 'up'), rated('codex-becario-1', 't2', 'down'), call('codex', true, 2)])]
    expect(agentHistory(runs, 'codex', NOW)).toMatchObject({ tasks: 4, liked: 1, disliked: 1 })
    expect(agentHistory([run([call('codex', true, 2)])], 'codex', NOW)!.liked).toBeUndefined()
  })

  it('cuota en palabras, avisando cuando queda poca', () => {
    const q = (remainingPct: number | null, extra: Partial<QuotaInfo> = {}): QuotaInfo => ({
      id: 'g',
      label: 'G',
      kind: 'usage',
      agentIds: [],
      remainingPct,
      source: 'real',
      period: 'Ventana semanal',
      ...extra
    })
    expect(quotaLine(q(81), 20)).toBe('81 % (ventana semanal)')
    expect(quotaLine(q(12), 20)).toBe('12 % (ventana semanal): queda poca, dale solo lo imprescindible')
    expect(quotaLine(q(null), 20)).toBe('sin dato')
    expect(quotaLine(q(null, { unlimited: true }), 20)).toBe('sin límite (en tu equipo, gratis)')
    expect(quotaLine(undefined, 20)).toBe('sin dato')
  })

  it('la ficha que ve el coordinador lleva fortalezas, qué evitar, modelos, cuota e historial', () => {
    const claude = DEFAULT_AGENTS.find((a) => a.id === 'claude')!
    const lines = profileLines(claude, {
      available: 'sí',
      warn: 20,
      quota: { id: 'anthropic', label: 'Claude', kind: 'usage', agentIds: [], remainingPct: 81, source: 'real', period: 'Ventana semanal' },
      history: { tasks: 12, okPct: 92, medianMs: 6 * 60_000 },
      abilities: ['terminal con acceso completo']
    }).join('\n')
    expect(lines).toContain('- id: "claude" · Claude — Interfaces, textos en español y código complejo · disponible: sí')
    expect(lines).toContain('se le da mejor: interfaces y diseño visual (Opus 5.5: 1.º en WebDev Arena);')
    expect(lines).toContain('evitar: tareas mecánicas o de mero volumen')
    expect(lines).toContain(
      'modelos: fáciles → Sonnet 5.5 con esfuerzo medio (si es solo una respuesta de texto: Haiku 5.5); normales → Sonnet 5.5 con esfuerzo alto; difíciles → Opus 5.5 con esfuerzo alto'
    )
    expect(lines).toMatch(/cómo son: Haiku 5\.5: muy rápido[^·]+· Sonnet 5\.5: rápido[^·]+· Opus 5\.5: moderado/)
    expect(lines).toContain('cuota restante: 81 % (ventana semanal)')
    expect(lines).toContain('historial en AI Cowork (30 días): 12 tareas, 92 % bien, unos 6 min cada una')
    expect(lines).not.toMatch(/revisión/)
  })

  it('con 5 tareas o más, la ficha lleva su calidad (y las valoraciones salen de ahí, no del historial)', () => {
    const claude = DEFAULT_AGENTS.find((a) => a.id === 'claude')!
    const done = (taskId: string, rating?: 'up' | 'down'): UsageCall => ({ ...call('claude', true, 3), taskId, rating, difficulty: 'medium' })
    const pass = (taskId: string, verdict: 'pass' | 'fail'): UsageCall => ({ ...call('codex', true, 1), kind: 'verify', taskId, verdict })
    const runs = [run([done('a', 'up'), pass('a', 'pass'), done('b', 'down'), pass('b', 'fail'), done('b', 'down'), done('c'), done('d'), done('e')])]
    const quality = agentQualityFor(runs, 'claude', NOW)
    const lines = profileLines(claude, { available: 'sí', warn: 20, history: agentHistory(runs, 'claude', NOW), quality, abilities: [] }).join('\n')
    expect(lines).toContain('  calidad (30 días, 5 tareas): le sirvieron al usuario 1 de 2 valoradas; verificación: 1 de 2 a la primera, 1 necesitó corrección, 1 sin superar la revisión; ninguna falló')
    expect(lines).not.toContain('que valoró')
    const few = agentQualityFor([run([done('a'), done('b')])], 'claude', NOW)
    expect(profileLines(claude, { available: 'sí', warn: 20, quality: few, abilities: [] }).join('\n')).not.toContain('calidad (')
  })

  it('Codex hace lo difícil con GPT-6.1 Sol y esfuerzo muy alto; el agente local, un solo modelo', () => {
    const codex = modelLines(DEFAULT_AGENTS.find((a) => a.id === 'codex')!).join('\n')
    expect(codex).toContain('difíciles → GPT-6.1 Sol con esfuerzo muy alto')
    expect(codex).toContain('fáciles → GPT-6.1 Sol con esfuerzo medio (si es solo una respuesta de texto: GPT-6 Luna)')
    const gemini = modelLines(DEFAULT_AGENTS.find((a) => a.id === 'gemini')!).join('\n')
    expect(gemini).toContain('normales → Gemini 3.8 Flash;')
    const local = { ...DEFAULT_AGENTS.find((a) => a.id === 'qwen')!, provider: 'lmstudio', model: 'google/gemma-4-e4b', modelLabel: 'Gemma 4 E4B' } as AgentConfig
    expect(modelLines(local)).toEqual(['  modelo: Gemma 4 E4B — ~34 t/s en un Mac mini M4, coste gratis'])
  })

  it('al actualizar, las fichas antiguas sin tocar pasan a las nuevas; las personalizadas se respetan', () => {
    const old = { ...DEFAULT_AGENTS.find((a) => a.id === 'claude')!, role: 'Diseño, razonamiento y revisión', strengths: ['diseño', 'interfaces', 'redacción', 'revisión', 'código'], avoid: undefined } as AgentConfig
    expect(upgradeAgentProfile(old)).toBe(true)
    expect(old.role).toBe('Interfaces, textos en español y código complejo')
    expect(old.avoid?.length).toBeGreaterThan(0)
    const mine = { ...old, strengths: ['mis cosas'] }
    expect(upgradeAgentProfile(mine)).toBe(false)
    expect(mine.strengths).toEqual(['mis cosas'])
  })
})
