import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBubbles } from './bubbleStore'

describe('bocadillos de las escenas sociales', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-08T12:00:00Z')); useBubbles.getState().clearAll() })
  afterEach(() => { useBubbles.getState().clearAll(); vi.useRealTimers() })
  it('las bromas nunca impiden ni sustituyen un aviso de trabajo', () => {
    const bubbles = useBubbles.getState()
    expect(bubbles.social('a', '¡Buuu!')).toBe(true)
    expect(bubbles.say('a', 'boss', 'task')).toBe(true)
    expect(bubbles.social('a', '¡Buuu!')).toBe(false)
    bubbles.clearSocial('a')
    expect(useBubbles.getState().map.a.event).toBe('task')
    vi.advanceTimersByTime(2801)
    expect(useBubbles.getState().map.a?.event).toBe('task')
  })
  it('limita los bocadillos ambientales y los limpia al cancelar', () => {
    const bubbles = useBubbles.getState()
    expect(bubbles.social('a', 'Hola')).toBe(true)
    expect(bubbles.social('b', 'Buenas')).toBe(true)
    expect(bubbles.social('c', 'Hola')).toBe(false)
    bubbles.clearSocial('a')
    expect(bubbles.social('c', 'Hola')).toBe(true)
    vi.advanceTimersByTime(2801)
    expect(useBubbles.getState().map).toEqual({})
  })
})
