import { describe, expect, it } from 'vitest'
import { QUALITY, sceneQuality } from './quality'

describe('sceneQuality', () => {
  it('el ajuste automático no quita el bloom ni las luces de los puestos de un equipo capaz', () => {
    const q = sceneQuality('low', 'high')
    expect(q.bloom).toBe(true)
    expect(q.stationLights).toBe(true)
    expect(q.dpr).toEqual(QUALITY.low.dpr)
    expect(q.particles).toBe(QUALITY.low.particles)
    expect(q.msaa).toBe(0)
  })

  it('un equipo modesto sigue sin bloom ni luces aunque suba de nivel', () => {
    const q = sceneQuality('low', 'low')
    expect(q.bloom).toBe(false)
    expect(q.stationLights).toBe(false)
  })

  it('en su nivel de partida, igual que la tabla', () => {
    expect(sceneQuality('high', 'high')).toEqual(QUALITY.high)
    expect(sceneQuality('medium', 'medium')).toEqual(QUALITY.medium)
  })
})
