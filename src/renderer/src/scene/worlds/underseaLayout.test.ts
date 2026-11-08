import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_STATIONS } from '@shared/defaults'
import { underseaLayout } from './UnderseaWorld'

vi.mock('./WorldScenery', () => ({ WorldModel: () => null }))

describe('undersea visual layout', () => {
  it('preserves saved stations and their metadata while leaving room for the central shell', () => {
    const before = JSON.stringify(DEFAULT_STATIONS)
    const visual = underseaLayout(DEFAULT_STATIONS)
    expect(visual.map(({ id }) => id)).toEqual(DEFAULT_STATIONS.map(({ id }) => id))
    expect(JSON.stringify(DEFAULT_STATIONS)).toBe(before)
    for (let i = 0; i < visual.length; i++) {
      const { position, ...metadata } = visual[i]
      const { position: _savedPosition, ...savedMetadata } = DEFAULT_STATIONS[i]
      expect(metadata).toEqual(savedMetadata)
      expect(Math.hypot(...position)).toBeGreaterThan(4)
      for (const other of visual.slice(i + 1)) {
        expect(Math.hypot(position[0] - other.position[0], position[1] - other.position[1])).toBeGreaterThanOrEqual(4.8)
      }
    }
  })

  it('handles empty and expanded teams deterministically without losing station identities', () => {
    expect(underseaLayout([])).toEqual([])
    const stations = Array.from({ length: 16 }, (_, i) => ({ id: `marine-${i}`, label: 'Custom', position: [i, -i] as [number, number] }))
    const visual = underseaLayout(stations)
    expect(visual).toEqual(underseaLayout(stations))
    expect(new Set(visual.map(s => s.position.join(','))).size).toBe(stations.length)
    expect(visual.flatMap(s => s.position).every(Number.isFinite)).toBe(true)
    expect(visual.map(s => s.id)).toEqual(stations.map(s => s.id))
  })

  it.each([8, 9, 16, 40])('separa todas las plataformas de un equipo con %i estaciones', (count) => {
    const stations = Array.from({ length: count }, (_, i) => ({ id: `marine-${i}`, label: 'Custom', position: [i, -i] as [number, number] }))
    const visual = underseaLayout(stations)
    for (let i = 0; i < visual.length; i++) {
      for (const other of visual.slice(i + 1)) {
        // Cada plataforma mide 3,6: además debe quedar espacio libre entre sus bordes.
        expect(Math.hypot(visual[i].position[0] - other.position[0], visual[i].position[1] - other.position[1])).toBeGreaterThanOrEqual(4.8)
      }
    }
    expect(underseaLayout(stations.slice(0, -1))).toEqual(visual.slice(0, -1))
  })
})
