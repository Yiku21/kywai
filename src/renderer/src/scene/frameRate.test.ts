import { describe, expect, it } from 'vitest'
import { frameDue, IDLE_FPS, MAX_FPS, REST_FPS, sceneFps } from './frameRate'

/** Cuántos fotogramas se dibujan en un segundo con una pantalla de [hz]. */
function framesIn(hz: number, fps: number): number {
  let last = -Infinity
  let n = 0
  for (let i = 0; i < hz; i++) {
    const now = (i * 1000) / hz
    const next = frameDue(now, last, fps)
    if (next !== null) {
      last = next
      n++
    }
  }
  return n
}

describe('frameDue', () => {
  it('se queda en 30 con pantallas de 60, 120 y 144 Hz', () => {
    for (const hz of [60, 120, 144]) {
      const n = framesIn(hz, MAX_FPS)
      expect(n).toBeGreaterThanOrEqual(29)
      expect(n).toBeLessThanOrEqual(31)
    }
  })

  it('no pasa de lo que da la pantalla', () => {
    expect(framesIn(24, MAX_FPS)).toBe(24)
  })

  it('tras un parón vuelve a contar desde ahora', () => {
    expect(frameDue(10_000, 0, 30)).toBe(10_000)
  })
})

describe('sceneFps', () => {
  it('en reposo baja a 10 tenga o no foco', () => {
    expect(sceneFps(true, true)).toBe(REST_FPS)
    expect(sceneFps(false, true)).toBe(REST_FPS)
  })

  it('con actividad, 30 con foco y 20 sin foco', () => {
    expect(sceneFps(true, false)).toBe(MAX_FPS)
    expect(sceneFps(false, false)).toBe(IDLE_FPS)
  })

  it('una pantalla de 60 Hz da 10 en reposo', () => {
    expect(framesIn(60, REST_FPS)).toBe(10)
  })
})
