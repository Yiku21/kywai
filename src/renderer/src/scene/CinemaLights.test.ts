import { describe, expect, it } from 'vitest'
import { lightBreath } from './CinemaLights'

describe('lightBreath', () => {
  it('la luz cambia poco: nunca más de un 15 % arriba o abajo con el equipo parado', () => {
    for (let t = 0; t < 600; t += 0.7) {
      const b = lightBreath(t, 0)
      for (const v of [b.key, b.fill, b.rim]) {
        expect(v).toBeGreaterThan(0.85)
        expect(v).toBeLessThan(1.15)
      }
    }
  })

  it('cada luz va a su ritmo (no suben a la vez)', () => {
    const peak = (part: 'key' | 'fill' | 'rim') => {
      let best = 0, at = 0
      for (let t = 0; t < 60; t += 0.1) if (lightBreath(t, 0)[part] > best) [best, at] = [lightBreath(t, 0)[part], t]
      return at
    }
    expect(Math.abs(peak('key') - peak('rim'))).toBeGreaterThan(3)
    expect(Math.abs(peak('key') - peak('fill'))).toBeGreaterThan(3)
  })

  it('con el equipo trabajando la luz se aviva', () => {
    expect(lightBreath(5, 1).key).toBeGreaterThan(lightBreath(5, 0).key)
    expect(lightBreath(5, 1).rim).toBeGreaterThan(lightBreath(5, 0).rim)
  })
})
