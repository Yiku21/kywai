import { describe, expect, it } from 'vitest'
import { characterRole, pickClip } from './characters'

const base = { visual: 'idle' as const, speed: 0, checkAmt: 0, questionAmt: 0, eyeError: 0, ackAmt: 0, t: 0 }

describe('personajes 3D', () => {
  it('reconoce el personaje por el nombre o el id', () => {
    expect(characterRole('Claude claude')).toBe('claude')
    expect(characterRole('Aider cli-aider')).toBe('aider')
    expect(characterRole('Kilo CLI kilo')).toBe('kilo')
    expect(characterRole('Mi agente raro x1')).toBeUndefined()
  })

  it('elige el movimiento según lo que hace el agente', () => {
    expect(pickClip(base)).toBe('reposo')
    expect(pickClip({ ...base, visual: 'thinking' })).toBe('piensa')
    expect(pickClip({ ...base, visual: 'working', t: 1 })).toBe('explica')
    expect(pickClip({ ...base, visual: 'working', t: 8 })).toBe('habla')
    expect(pickClip({ ...base, visual: 'error' })).toBe('duda')
    expect(pickClip({ ...base, checkAmt: 0.9, visual: 'working' })).toBe('celebra')
    expect(pickClip({ ...base, ackAmt: 0.5 })).toBe('saluda')
    // Caminar manda sobre todo lo demás.
    expect(pickClip({ ...base, speed: 2, visual: 'error' })).toBe('camina')
  })
})
