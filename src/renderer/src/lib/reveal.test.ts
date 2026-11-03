import { describe, expect, it } from 'vitest'
import { revealTimes } from './reveal'

describe('el texto se escribe al ritmo de la voz', () => {
  it('una letra por sílaba, la puntuación hace pausa y el espacio media', () => {
    expect(revealTimes('Hola, sí', 10, 28)).toEqual([10, 110, 210, 310, 410, 510, 560, 660])
  })

  it('cuando la voz calla, el resto sale deprisa y como mucho en 1,5 s', () => {
    const t = revealTimes('a'.repeat(28) + 'b'.repeat(1000), 10, 28)
    expect(t[28]).toBe(10 + 28 * 100)
    expect(t.at(-1)! - t[28]).toBeLessThanOrEqual(1500)
    // Un emoji ocupa dos posiciones del texto y aparece entero.
    const e = revealTimes('a😀', 10, 28)
    expect(e).toHaveLength(3)
    expect(e[1]).toBe(e[2])
  })
})
