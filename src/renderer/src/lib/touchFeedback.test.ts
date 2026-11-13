import { describe, expect, it } from 'vitest'
import { rippleRadius } from './touchFeedback'

describe('onda al pulsar', () => {
  it('llega hasta la esquina más lejana desde donde has pulsado', () => {
    expect(rippleRadius(0, 0, 30, 40)).toBeCloseTo(50)
    expect(rippleRadius(30, 40, 30, 40)).toBeCloseTo(50)
    expect(rippleRadius(15, 20, 30, 40)).toBeCloseTo(25)
  })
})
