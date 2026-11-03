import { describe, expect, it } from 'vitest'
import { DEFAULT_AGENTS, DEFAULT_STATIONS } from './defaults'
import { allocateStation, buildAgent, generatedAvatar } from './agentCatalog'
import type { CliAgentSpec } from './types'

const custom: Pick<CliAgentSpec, 'command' | 'promptVia' | 'args'> = { command: 'miagente', promptVia: 'stdin', args: ['run', '--once'] }

describe('construir un agente', () => {
  it('uno a medida recibe identificador, aspecto, estación libre y su ficha', () => {
    const { agent, station } = buildAgent({ custom, name: 'Mi agente' }, DEFAULT_AGENTS, DEFAULT_STATIONS)
    expect(agent).toMatchObject({ id: 'miagente', name: 'Mi agente', provider: 'cli', enabled: true, stationId: 'st-miagente' })
    expect(agent.cli).toMatchObject({ command: 'miagente', promptVia: 'stdin', args: ['run', '--once'], versionArgs: ['--version'] })
    expect(agent.avatar).toEqual(generatedAvatar('miagente', agent.color))
    expect(station?.id).toBe('st-miagente')
    // La estación no pisa a las que ya hay.
    for (const s of DEFAULT_STATIONS) {
      expect(Math.hypot(s.position[0] - station!.position[0], s.position[1] - station!.position[1])).toBeGreaterThan(3.3)
    }
  })

  it('si el identificador ya existe, añade un número', () => {
    const first = buildAgent({ custom }, DEFAULT_AGENTS, DEFAULT_STATIONS)
    const second = buildAgent({ custom }, [...DEFAULT_AGENTS, first.agent], [...DEFAULT_STATIONS, first.station!])
    expect(second.agent.id).toBe('miagente-2')
    expect(second.station!.position).not.toEqual(first.station!.position)
  })

  it('recuperar un agente de fábrica quitado trae el suyo, con su estación; uno que ya está, no', () => {
    const without = DEFAULT_AGENTS.filter((a) => a.id !== 'muse')
    const back = buildAgent({ presetId: 'muse' }, without, DEFAULT_STATIONS)
    expect(back.agent.id).toBe('muse')
    expect(back.agent.stationId).toBe('st-muse')
    expect(back.station).toBeUndefined()
    expect(() => buildAgent({ presetId: 'muse' }, DEFAULT_AGENTS, DEFAULT_STATIONS)).toThrow(/ya está/)
  })

  it('rechaza programas con caracteres de consola y formas de lanzar desconocidas', () => {
    expect(() => buildAgent({ custom: { ...custom, command: 'rm -rf /' } }, DEFAULT_AGENTS, DEFAULT_STATIONS)).toThrow(/programa/)
    expect(() => buildAgent({ custom: { ...custom, command: 'a;b' } }, DEFAULT_AGENTS, DEFAULT_STATIONS)).toThrow()
    expect(() => buildAgent({ custom: { ...custom, promptVia: 'pipe' as never } }, DEFAULT_AGENTS, DEFAULT_STATIONS)).toThrow(/promptVia/)
    expect(() => buildAgent({ presetId: 'no-existe' }, DEFAULT_AGENTS, DEFAULT_STATIONS)).toThrow(/catálogo/)
    expect(() => buildAgent({}, DEFAULT_AGENTS, DEFAULT_STATIONS)).toThrow()
  })

  it('Qwen Code del catálogo es un agente de terminal aparte del Qwen local de fábrica', () => {
    const { agent } = buildAgent({ presetId: 'qwen-code' }, DEFAULT_AGENTS, DEFAULT_STATIONS)
    expect(agent).toMatchObject({ id: 'qwen-code', name: 'Qwen Code', provider: 'cli' })
    expect(agent.cli).toMatchObject({ command: 'qwen', presetId: 'qwen-code', promptVia: 'stdin' })
    expect(DEFAULT_AGENTS.find((a) => a.id === 'qwen')?.provider).not.toBe('cli')
  })

  it('el aspecto es siempre el mismo para el mismo agente', () => {
    expect(generatedAvatar('aider', '#fff')).toEqual(generatedAvatar('aider', '#fff'))
    expect(generatedAvatar('aider', '#fff').body).toBeTruthy()
  })
})

describe('estaciones', () => {
  it('cuando se acaban los huecos preparados, sigue encontrando sitio sin pisar a nadie', () => {
    let stations = [...DEFAULT_STATIONS]
    for (let i = 0; i < 30; i++) {
      const next = allocateStation(stations, `st-n${i}`, 'Agente')
      for (const s of stations) {
        expect(Math.hypot(s.position[0] - next.position[0], s.position[1] - next.position[1])).toBeGreaterThan(3.3)
      }
      stations = [...stations, next]
    }
  })
})
