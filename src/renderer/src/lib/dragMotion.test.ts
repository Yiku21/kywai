import { describe, expect, it } from 'vitest'
import { rowShifts } from './dragMotion'

describe('filas que se recolocan al soltar', () => {
  it('solo cuenta las que se han movido, con la diferencia hacia donde estaban', () => {
    const before = new Map([
      ['a', { left: 0, top: 0 }],
      ['b', { left: 0, top: 30 }],
      ['c', { left: 0, top: 60 }]
    ])
    const after = new Map([
      ['b', { left: 0, top: 0 }],
      ['a', { left: 0, top: 30 }],
      ['c', { left: 0, top: 60 }],
      ['nueva', { left: 0, top: 90 }]
    ])
    const shifts = rowShifts(before, after)
    expect([...shifts.keys()].sort()).toEqual(['a', 'b'])
    expect(shifts.get('a')).toEqual({ dx: 0, dy: -30 })
    expect(shifts.get('b')).toEqual({ dx: 0, dy: 30 })
  })

  it('ignora movimientos de menos de un píxel', () => {
    expect(rowShifts(new Map([['a', { left: 0, top: 0 }]]), new Map([['a', { left: 0.4, top: 0.3 }]])).size).toBe(0)
  })
})
