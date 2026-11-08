import { describe, expect, it } from 'vitest'
import { DEFAULT_STATIONS } from '@shared/defaults'
import { environmentModel, centerpieceModel } from './models'
import { HERITAGE_WORLDS } from './heritageWorlds'

describe('escenarios de fantasía y temporada', () => {
  it.each(HERITAGE_WORLDS)('%s conserva geometría finita y determinista en ambas calidades', style => {
    const saved = JSON.stringify(DEFAULT_STATIONS)
    for (const detail of [false, true]) {
      const pieces = [...environmentModel(style, DEFAULT_STATIONS, detail), ...centerpieceModel(style)]
      expect(pieces.length).toBeGreaterThan(0)
      for (const p of pieces) {
        expect(p.at.every(Number.isFinite)).toBe(true)
        expect(p.size.every(v => Number.isFinite(v) && v > 0)).toBe(true)
        if (p.quaternion) expect(p.quaternion.toArray().every(Number.isFinite)).toBe(true)
      }
      expect(environmentModel(style, DEFAULT_STATIONS, detail)).toEqual(environmentModel(style, DEFAULT_STATIONS, detail))
    }
    expect(JSON.stringify(DEFAULT_STATIONS)).toBe(saved)
  })
})
