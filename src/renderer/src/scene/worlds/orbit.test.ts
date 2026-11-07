import { describe, expect, it } from 'vitest'
import { advanceOrbit, celestialPosition, ORBIT_SECONDS, TAU } from './orbit'

describe('orbital journey', () => {
  it('respects reduced effects and never catches up after a hidden tab', () => {
    expect(advanceOrbit(2, 30, true)).toBe(2)
    expect(advanceOrbit(2, 30, false)).toBeCloseTo(2 + 0.1 * TAU / ORBIT_SECONDS)
    expect(advanceOrbit(2, NaN, false)).toBe(2)
  })
  it('repeats continuously across multiple circuits without stopping or jumping', () => {
    let angle = 0
    for (let circuit = 0; circuit < 5; circuit++) {
      for (let i = 0; i < ORBIT_SECONDS * 10; i++) angle = advanceOrbit(angle, 0.1, false)
      expect(Math.min(angle, TAU - angle)).toBeLessThan(1e-9)
    }
    const next = advanceOrbit(angle, 0.1, false)
    expect(next).toBeCloseTo(0.1 * TAU / ORBIT_SECONDS)
    const start = celestialPosition(0, 0.3, 130, -35)
    const end = celestialPosition(TAU, 0.3, 130, -35)
    start.forEach((x, i) => expect(end[i]).toBeCloseTo(x))
  })
})
