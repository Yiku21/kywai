import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_AGENTS } from '@shared/defaults'

const home = mkdtempSync(join(tmpdir(), 'cowork-agentscfg-'))
vi.mock('electron', () => ({ app: { isPackaged: true, getAppPath: () => home, getPath: () => home } }))
const config = await import('./config')

afterAll(() => rmSync(home, { recursive: true, force: true }))

const custom = { command: 'miagente', promptVia: 'stdin' as const, args: ['run'] }

describe('agentes añadidos y quitados', () => {
  it('un agente a medida se añade, aparece con su estación, puede coordinar y sobrevive a recargar', () => {
    config.loadConfig()
    const added = config.addAgent({ custom, name: 'Mi agente' })
    const agent = added.agents.find((a) => a.id === 'miagente')!
    expect(agent.provider).toBe('cli')
    expect(added.stations.some((s) => s.id === agent.stationId)).toBe(true)
    expect(added.plannerOrder).toContain('miagente')

    const coordinator = config.setCoordinator('miagente')
    expect(coordinator.plannerOrder[0]).toBe('miagente')

    // Recargar desde el disco lo conserva todo.
    const again = config.loadConfig()
    expect(again.agents.find((a) => a.id === 'miagente')?.cli?.command).toBe('miagente')
    expect(again.plannerOrder[0]).toBe('miagente')
    expect(again.stations.some((s) => s.id === 'st-miagente')).toBe(true)
  })

  it('quitar un agente de fábrica no lo trae de vuelta al recargar, ni su estación; volver a añadirlo sí', () => {
    config.loadConfig()
    const removed = config.removeAgent('muse')
    expect(removed.agents.some((a) => a.id === 'muse')).toBe(false)
    expect(removed.stations.some((s) => s.id === 'st-muse')).toBe(false)
    expect(removed.plannerOrder).not.toContain('muse')

    const again = config.loadConfig()
    expect(again.agents.some((a) => a.id === 'muse')).toBe(false)
    expect(again.stations.some((s) => s.id === 'st-muse')).toBe(false)
    expect(again.removedAgents).toContain('muse')

    const back = config.addAgent({ presetId: 'muse' })
    expect(back.agents.some((a) => a.id === 'muse')).toBe(true)
    expect(back.stations.some((s) => s.id === 'st-muse')).toBe(true)
    expect(back.removedAgents ?? []).not.toContain('muse')
  })

  it('quitar el coordinador pasa la coordinación al siguiente, y no se puede dejar al equipo sin quien trabaje', () => {
    const cfg = config.loadConfig()
    config.setCoordinator('claude')
    expect(config.getConfig().plannerOrder[0]).toBe('claude')
    expect(config.removeAgent('claude').plannerOrder[0]).not.toBe('claude')
    // Dejar solo al coordinador (que no trabaja) no se permite.
    for (const a of cfg.agents.filter((x) => !x.plannerOnly)) {
      try {
        config.removeAgent(a.id)
      } catch {
        /* ya no está, o es el último */
      }
    }
    const last = config.getConfig().agents.filter((a) => !a.plannerOnly)
    expect(last.length).toBe(1)
    expect(() => config.removeAgent(last[0].id)).toThrow(/al menos un agente/)
  })

  it('una ficha de catálogo rota en el disco se descarta en vez de romper el arranque', () => {
    const bad = { ...DEFAULT_AGENTS[1], id: 'roto', provider: 'cli', cli: { command: 'a;b', promptVia: 'stdin', args: [] } }
    const good = {
      ...DEFAULT_AGENTS[1],
      id: 'bueno',
      provider: 'cli',
      cli: { command: 'aider', versionArgs: ['--version'], promptVia: 'file', args: ['--message-file', '{promptFile}'] }
    }
    const cfg = config.mergeConfig({ configVersion: 10, agents: [bad, good] }, home)
    expect(cfg.agents.some((a) => a.id === 'roto')).toBe(false)
    expect(cfg.agents.some((a) => a.id === 'bueno')).toBe(true)
  })
})
