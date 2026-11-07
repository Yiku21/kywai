import { describe, expect, it } from 'vitest'
import { DEFAULT_STATIONS } from '@shared/defaults'
import { centerpieceModel, environmentModel, platformModel, type WorldStyle } from './models'
import { environmentDetails, platformDetails } from './details'
import { detailedGeometry } from './surfaces'

const worlds: WorldStyle[] = ['clasico', 'orbita', 'marfil', 'grafito', 'bosque', 'matrix', 'eva']

describe('world models', () => {
  it.each(worlds)('%s supports empty and custom station layouts at either quality', style => {
    for (const stations of [[], DEFAULT_STATIONS, [{ id: 'custom', label: 'Custom', position: [12, -12] as [number, number] }]]) {
      for (const detail of [false, true]) {
        const parts = [...environmentModel(style, stations, detail), ...environmentDetails(style, stations, detail)]
        expect(parts.length).toBeGreaterThan(0)
        for (const p of parts) {
          expect([...p.at, ...p.size].every(Number.isFinite)).toBe(true)
          expect(p.size.every(v => v > 0)).toBe(true)
          if (p.quaternion) expect(p.quaternion.length()).toBeCloseTo(1)
        }
        // Repeated props share instanced batches, even in detailed worlds.
        expect(new Set(parts.map(p => `${p.shape}:${p.color}:${p.glow ?? 0}`)).size).toBeLessThan(96)
      }
    }
  })

  it('all curved and detailed shapes produce finite geometry at both detail sizes', () => {
    const shapes = new Set(worlds.flatMap(style => [
      ...environmentModel(style, DEFAULT_STATIONS, true), ...environmentDetails(style, DEFAULT_STATIONS, true),
      ...platformModel(style), ...platformDetails(style), ...centerpieceModel(style)
    ]).map(p => p.shape))
    for (const shape of shapes) for (const small of [false, true]) {
      const geometry = detailedGeometry(shape, small)
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0)
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
      expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true)
      geometry.dispose()
    }
  })

  it('worlds retain different geometry even without their color palettes', () => {
    const silhouette = (parts: ReturnType<typeof platformModel>) => JSON.stringify(parts.map(({ shape, at, size }) => ({ shape, at, size })))
    expect(new Set(worlds.map(w => silhouette(platformModel(w)))).size).toBe(7)
    expect(new Set(worlds.map(w => silhouette(environmentModel(w, DEFAULT_STATIONS, false)))).size).toBe(7)
  })
})
