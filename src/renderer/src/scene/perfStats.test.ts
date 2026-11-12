import { describe, expect, it } from 'vitest'
import { FrameWindow } from './perfStats'

describe('FrameWindow', () => {
  it('cuenta fotogramas por segundo y el tiempo medio y máximo', () => {
    const w = new FrameWindow()
    for (let i = 0; i < 30; i++) w.add(i === 10 ? 12 : 4, 300, 1_000_000)
    const r = w.take(1000)
    expect(r.fps).toBe(30)
    expect(r.frameMs).toBeCloseTo((29 * 4 + 12) / 30)
    expect(r.frameMaxMs).toBe(12)
    expect(r.calls).toBe(300)
  })

  it('empieza de cero en cada intervalo', () => {
    const w = new FrameWindow()
    w.add(5, 1, 1)
    w.take(1000)
    expect(w.take(1000)).toMatchObject({ fps: 0, frameMs: 0, frameMaxMs: 0 })
  })
})
