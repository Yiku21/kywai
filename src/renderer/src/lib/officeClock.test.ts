import { describe, expect, it } from 'vitest'
import { nightAt } from './officeClock'

const at = (h: number, m = 0) => { const d = new Date(2026, 10, 12); d.setHours(h, m, 0, 0); return d }

describe('reloj de la Oficina automática', () => {
  it('es de día de 8:00 a 17:00 y de noche de 20:30 a 6:00', () => {
    for (const h of [8, 10, 12, 15, 17]) expect(nightAt(at(h))).toBe(0)
    for (const [h, m] of [[20, 30], [22, 0], [0, 0], [3, 0], [6, 0]]) expect(nightAt(at(h, m))).toBe(1)
  })
  it('anochece poco a poco y sin saltos, y amanece igual', () => {
    let last = 0
    for (let min = 17 * 60; min <= 20.5 * 60; min += 10) {
      const v = nightAt(at(Math.floor(min / 60), min % 60))
      expect(v).toBeGreaterThanOrEqual(last)
      expect(v - last).toBeLessThan(0.1)
      last = v
    }
    expect(nightAt(at(18, 45))).toBeCloseTo(0.5, 1)
    expect(nightAt(at(7))).toBeCloseTo(0.5, 1)
    expect(nightAt(at(6, 30))).toBeGreaterThan(nightAt(at(7, 30)))
  })
})
