import { describe, expect, it } from 'vitest'
import { clampZoom, zoomAfterWheel, ZOOM_MAX, ZOOM_MIN } from './chatZoom'

describe('zoom del chat', () => {
  it('rueda hacia arriba agranda y hacia abajo achica de 10 en 10', () => {
    expect(zoomAfterWheel(100, -120)).toBe(110)
    expect(zoomAfterWheel(100, 120)).toBe(90)
    expect(zoomAfterWheel(100, -3)).toBe(110)
    expect(zoomAfterWheel(100, 0)).toBe(100)
  })

  it('no pasa de los límites', () => {
    expect(zoomAfterWheel(ZOOM_MAX, -120)).toBe(ZOOM_MAX)
    expect(zoomAfterWheel(ZOOM_MIN, 120)).toBe(ZOOM_MIN)
  })

  it('redondea a pasos de 10 y aguanta valores raros', () => {
    expect(clampZoom(107)).toBe(110)
    expect(clampZoom(NaN)).toBe(100)
    expect(clampZoom(999)).toBe(ZOOM_MAX)
  })
})
