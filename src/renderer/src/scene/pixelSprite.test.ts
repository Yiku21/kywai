import { describe, expect, it } from 'vitest'
import { frameFov, frameRadius, spriteTexels } from './pixelSprite'
import { parsePixelSize, parseSkin, usesCharacters } from './characters'

describe('aspecto Píxel', () => {
  it('la textura sigue lo que mide el personaje en pantalla, en múltiplos de 4 y con tope', () => {
    expect(spriteTexels(144, 3)).toBe(48)
    expect(spriteTexels(150, 2)).toBe(76)
    expect(spriteTexels(20, 4)).toBe(16)
    expect(spriteTexels(4000, 2)).toBe(128)
    expect(spriteTexels(150, 3) % 4).toBe(0)
  })

  it('el cuadro abarca al personaje entero con margen', () => {
    const r = frameRadius(1)
    expect(r).toBeGreaterThan(0.5)
    // A 10 unidades, el ángulo cubre justo ese radio.
    const fov = frameFov(r, 10)
    expect(Math.tan(((fov / 2) * Math.PI) / 180) * 10).toBeCloseTo(r, 5)
    // Muy cerca no se dispara.
    expect(frameFov(r, 0.01)).toBeLessThan(180)
  })

  it('recuerda la skin y el tamaño del píxel', () => {
    expect(parseSkin('pixel')).toBe('pixel')
    expect(usesCharacters('pixel')).toBe(true)
    expect(usesCharacters('clasico')).toBe(false)
    expect(parsePixelSize('4')).toBe(4)
    expect(parsePixelSize('64')).toBe(3)
    expect(parsePixelSize(null)).toBe(3)
  })
})
