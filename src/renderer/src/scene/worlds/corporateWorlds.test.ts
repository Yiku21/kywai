import { describe, expect, it } from 'vitest'
import { DEFAULT_STATIONS } from '@shared/defaults'
import { environmentModel, centerpieceModel, platformModel } from './models'
import { CORPORATE_WORLDS } from './corporateWorlds'

describe('temas de empresa', () => {
  it.each(CORPORATE_WORLDS)('%s conserva geometría finita y determinista en ambas calidades', style => {
    const saved = JSON.stringify(DEFAULT_STATIONS)
    for (const detail of [false, true]) {
      const pieces = [...environmentModel(style, DEFAULT_STATIONS, detail), ...centerpieceModel(style), ...platformModel(style)]
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

  it.each(CORPORATE_WORLDS)('%s deja libre la zona de los puestos (nada alto encima de una plataforma)', style => {
    const tall = environmentModel(style, DEFAULT_STATIONS, true).filter(p => p.at[1] + p.size[1] / 2 > 0.3 && p.at[1] > -5)
    for (const st of DEFAULT_STATIONS) {
      const blocking = tall.filter(p => Math.hypot(p.at[0] - st.position[0], p.at[2] - st.position[1]) < 1.8 && Math.max(p.size[0], p.size[2]) < 10)
      expect(blocking).toEqual([])
    }
  })
})
