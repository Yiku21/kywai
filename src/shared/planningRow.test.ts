import { describe, expect, it } from 'vitest'
import { planningRowAgent } from './planningRow'

const task = (over: Partial<Parameters<typeof planningRowAgent>[1][number]>): Parameters<typeof planningRowAgent>[1][number] => ({
  runId: 'r1',
  agentId: 'claude',
  status: 'running',
  createdAt: 1,
  ...over
})

describe('planningRowAgent: la fila de espera del chat nombra a quien de verdad está con la petición', () => {
  it('sin tareas todavía: quien planifica', () => {
    expect(planningRowAgent({ runId: 'r1' }, [], 'hermes')).toEqual({ agentId: 'hermes', planning: true })
    // Las tareas de otras peticiones no cuentan.
    expect(planningRowAgent({ runId: 'r1' }, [task({ runId: 'otra' })], 'hermes')).toEqual({ agentId: 'hermes', planning: true })
  })

  it('«/video …» ya tiene su tarea sin pasar por un plan: sale ese agente, no el coordinador', () => {
    expect(planningRowAgent({ runId: 'r1' }, [task({ agentId: 'claude', status: 'pending' })], 'hermes')).toEqual({ agentId: 'claude', planning: false })
  })

  it('un mensaje directo es de ese agente aunque su tarea aún no haya llegado', () => {
    expect(planningRowAgent({ runId: 'r1', direct: { agentId: 'qwen', name: 'Qwen' } }, [], 'hermes')).toEqual({ agentId: 'qwen', planning: false })
  })

  it('con varias tareas sale la primera que se creó; las terminadas no cuentan', () => {
    expect(planningRowAgent({ runId: 'r1' }, [task({ agentId: 'codex', createdAt: 5 }), task({ agentId: 'gemini', createdAt: 2 })], 'hermes')).toEqual({ agentId: 'gemini', planning: false })
    expect(planningRowAgent({ runId: 'r1' }, [task({ status: 'done' })], 'hermes')).toEqual({ agentId: 'hermes', planning: true })
  })
})
