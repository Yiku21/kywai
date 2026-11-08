import { describe, expect, it } from 'vitest'
import type { AgentConfig } from './types'
import { DEFAULT_STATIONS } from './defaults'
import { tempStationId, tempStationPosition, withTempStations } from './tempStations'

const becario = (id: string, stationId: string) => ({ id, name: 'Becario', stationId, isSubagent: true }) as unknown as AgentConfig

describe('puestos temporales de becarios', () => {
  it('sin becarios en puestos temporales, los puestos son los configurados', () => {
    expect(withTempStations(DEFAULT_STATIONS, [becario('claude-becario-1', 'st-sub-1')])).toBe(DEFAULT_STATIONS)
  })

  it('cada becario en un puesto temporal lo hace aparecer, lejos de los demás puestos', () => {
    const all = withTempStations(DEFAULT_STATIONS, [becario('claude-becario-1', 'st-sub-1'), becario('codex-becario-1', tempStationId(1)), becario('gemini-becario-1', tempStationId(2))])
    const extra = all.slice(DEFAULT_STATIONS.length)
    expect(extra.map((s) => s.id)).toEqual(['st-sub-tmp-1', 'st-sub-tmp-2'])
    for (const t of extra) {
      expect(t.forSubagents).toBe(true)
      for (const s of all) if (s !== t) expect(Math.hypot(s.position[0] - t.position[0], s.position[1] - t.position[1])).toBeGreaterThanOrEqual(2.6)
    }
  })

  it('más allá de los sitios previstos sigue dando sitio al fondo', () => {
    const p = tempStationPosition(20, DEFAULT_STATIONS)
    expect(p[1]).toBeLessThan(-12)
  })
})
