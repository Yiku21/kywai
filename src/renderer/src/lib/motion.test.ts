import { describe, expect, it } from 'vitest'
import { springAt, springEasing, springMs } from './motion'

describe('muelles de la interfaz', () => {
  it('sale de 0, se pasa un poco y se asienta en 1', () => {
    expect(springAt(0)).toBeCloseTo(0)
    const peak = Math.max(...Array.from({ length: 120 }, (_, i) => springAt(i / 240)))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.1)
    expect(springAt(springMs() / 1000)).toBeCloseTo(1, 2)
  })

  it('da una curva linear() de CSS que empieza en 0 y acaba en 1', () => {
    const e = springEasing(260, 22, 8)
    expect(e.startsWith('linear(0, ')).toBe(true)
    expect(e.endsWith(', 1)')).toBe(true)
    expect(e.split(',').length).toBe(9)
  })

  it('cuanto más rígido, antes se asienta', () => {
    expect(springMs(400, 30)).toBeLessThan(springMs(150, 20))
  })
})
