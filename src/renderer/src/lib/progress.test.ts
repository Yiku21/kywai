import { describe, expect, it } from 'vitest'
import type { AgentRuntime } from '@shared/types'
import { quietFor, quietText } from './progress'

describe('agente callado', () => {
  const rt = (activity: AgentRuntime['activity'], lastActivityAt?: number): AgentRuntime => ({ agentId: 'codex', activity, lastActivityAt }) as AgentRuntime
  it('dice cuánto lleva sin novedades mientras trabaja, a partir de 30 s', () => {
    expect(quietFor(rt('working', 1000), 1000 + 281_000)).toBe(281_000)
    expect(quietText(281_000)).toBe('Pensando o escribiendo algo largo · sin novedades desde hace 4 min')
    expect(quietText(45_000)).toBe('Pensando o escribiendo algo largo · sin novedades desde hace 45 s')
    expect(quietText(10_000)).toBeNull()
    // Parado o sin dato: no hay nada que contar.
    expect(quietFor(rt('idle', 1000), 999_999)).toBe(0)
    expect(quietFor(rt('working'), 999_999)).toBe(0)
  })
})
