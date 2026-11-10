import { describe, expect, it } from 'vitest'
import type { AgentConfig, StationConfig } from '@shared/types'
import { DEFAULT_STATIONS } from '@shared/defaults'
import { withTempStations } from '@shared/tempStations'
import { EXTENSION_GAP, POLYGON_SIDE, polygonLayout, polygonRadius } from './polygonLayout'

const agent = (id: string, stationId: string, extra: Partial<AgentConfig> = {}): AgentConfig =>
  ({ id, name: id, provider: 'cli', model: '', modelLabel: '', color: '#fff', stationId, role: '', strengths: [], enabled: true, ...extra }) as AgentConfig

const dist = (a: StationConfig, b: StationConfig): number => Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1])
const radius = (s: StationConfig): number => Math.hypot(s.position[0], s.position[1])

function team(ids: string[]): AgentConfig[] {
  return ids.map((id) => agent(id, `st-${id}`, id === 'hermes' ? { provider: 'hermes' } : {}))
}

describe('puestos en polígono regular', () => {
  it('3 agentes (con el becario) forman un triángulo equilátero y los puestos vacíos no salen', () => {
    const out = polygonLayout(DEFAULT_STATIONS, team(['hermes', 'claude']))
    expect(out.map((s) => s.id).sort()).toEqual(['st-claude', 'st-hermes', 'st-sub-1'])
    const [a, b, c] = out
    expect(dist(a, b)).toBeCloseTo(dist(b, c), 2)
    expect(dist(b, c)).toBeCloseTo(dist(c, a), 2)
  })

  it.each([4, 5, 6, 7, 8, 9, 10, 12])('%i puestos: mismo radio y mismo lado entre vecinos', (n) => {
    const extra = Array.from({ length: n - 1 }, (_, i) => ({ id: `st-x${i}`, label: 'x', position: [Math.cos(i) * 6, Math.sin(i) * 6] as [number, number] }))
    const stations = [...extra, { id: 'st-sub-1', label: 'Apoyo', position: [-5, 3] as [number, number], forSubagents: true }]
    const agents = extra.map((s, i) => agent(i === 0 ? 'hermes' : `a${i}`, s.id, i === 0 ? { provider: 'hermes' } : {}))
    const out = polygonLayout(stations, agents)
    expect(out).toHaveLength(n)
    const r = polygonRadius(n)
    out.forEach((s) => expect(radius(s)).toBeCloseTo(r, 2))
    const sorted = out.slice().sort((a, b) => Math.atan2(a.position[0], a.position[1]) - Math.atan2(b.position[0], b.position[1]))
    const sides = sorted.map((s, i) => dist(s, sorted[(i + 1) % n]))
    sides.forEach((d) => expect(d).toBeCloseTo(sides[0], 2))
    expect(sides[0]).toBeGreaterThanOrEqual(POLYGON_SIDE - 0.01)
  })

  it('Hermes va delante y el becario al fondo (cuadrado)', () => {
    const out = polygonLayout(DEFAULT_STATIONS, team(['hermes', 'claude', 'codex']))
    const hermes = out.find((s) => s.id === 'st-hermes')!
    const intern = out.find((s) => s.id === 'st-sub-1')!
    expect(hermes.position[1]).toBeGreaterThan(0)
    expect(intern.position[1]).toBeLessThan(0)
    // Cuadrado «recto» (lados paralelos a los ejes) y ningún puesto escondido justo detrás del núcleo.
    for (const s of out) expect(Math.abs(Math.abs(s.position[0]) - Math.abs(s.position[1]))).toBeLessThan(0.01)
  })

  it('los becarios de más salen pegados al becario original, sin tomar vértice', () => {
    const base = team(['hermes', 'claude', 'codex'])
    const subs = [agent('sub-a', 'st-sub-1', { isSubagent: true }), agent('sub-b', 'st-sub-tmp-1', { isSubagent: true }), agent('sub-c', 'st-sub-tmp-2', { isSubagent: true }), agent('sub-d', 'st-sub-tmp-3', { isSubagent: true })]
    const agents = [...base, ...subs]
    const out = polygonLayout(withTempStations(DEFAULT_STATIONS, agents), agents)
    const fixed = out.filter((s) => !s.id.startsWith('st-sub-tmp-'))
    expect(fixed).toHaveLength(4)
    fixed.forEach((s) => expect(radius(s)).toBeCloseTo(polygonRadius(4), 2))
    const intern = out.find((s) => s.id === 'st-sub-1')!
    const t1 = out.find((s) => s.id === 'st-sub-tmp-1')!
    expect(dist(intern, t1)).toBeCloseTo(EXTENSION_GAP, 2)
    expect(radius(t1)).toBeGreaterThan(radius(intern))
    // Ningún puesto se monta encima de otro.
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) expect(dist(out[i], out[j])).toBeGreaterThan(3.8)
  })

  it('no cambia la configuración guardada', () => {
    const copy = JSON.parse(JSON.stringify(DEFAULT_STATIONS))
    polygonLayout(DEFAULT_STATIONS, team(['hermes', 'claude', 'codex', 'muse']))
    expect(DEFAULT_STATIONS).toEqual(copy)
  })
})
