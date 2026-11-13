import { describe, expect, it, vi } from 'vitest'
import { SHAKE_FRAMES, shake } from './shake'

describe('shake', () => {
  it('pone el foco y hace temblar el campo en 300 ms', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    const animate = vi.fn()
    ;(input as unknown as { animate: typeof animate }).animate = animate
    shake(input)
    expect(document.activeElement).toBe(input)
    expect(animate).toHaveBeenCalledWith(SHAKE_FRAMES, expect.objectContaining({ duration: 300 }))
    // ±6 px como mucho
    expect(SHAKE_FRAMES.every((f) => Math.abs(parseFloat(String(f.transform).slice(11))) <= 6)).toBe(true)
  })

  it('no falla sin campo', () => {
    expect(() => shake(null)).not.toThrow()
  })
})
