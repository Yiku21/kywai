import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@shared/defaults'
import type { CoworkEvent } from '@shared/types'
import { tapEvents } from './events'
import { computeQuotas, initQuota, latestQuotas, recomputeQuotas, recordUsage, stopQuota } from './quota'

vi.mock('electron', () => ({ app: {} }))
const { mergeConfig } = await import('./config')
const folder = mkdtempSync(join(tmpdir(), 'kywai-quota-'))
afterAll(() => { stopQuota(); rmSync(folder, { recursive: true, force: true }) })

const config = () => mergeConfig({ ...structuredClone(DEFAULT_CONFIG), agents: [
  ...structuredClone(DEFAULT_CONFIG.agents),
  { ...DEFAULT_CONFIG.agents[0], id: 'copilot', name: 'Copilot', provider: 'cli', quotaGroupId: undefined, plannerOnly: false, cli: { command: 'copilot', promptVia: 'stdin', args: [] } },
  { ...DEFAULT_CONFIG.agents[0], id: 'kilo', name: 'Kilo', provider: 'cli', quotaGroupId: undefined, plannerOnly: false, cli: { command: 'kilo', promptVia: 'stdin', args: [] } }
] }, folder)

describe('cuotas del equipo activo', () => {
  it('recupera agentes ya añadidos sin grupo y conserva las cuotas compartidas y sus presupuestos', () => {
    const cfg = config()
    const copilot = cfg.agents.find((a) => a.id === 'copilot')!
    expect(copilot.quotaGroupId).toBe('agent-copilot')
    expect(cfg.quotaGroups.find((g) => g.id === copilot.quotaGroupId)).toMatchObject({ label: 'Copilot', provider: 'cli' })
    const again = mergeConfig(cfg, folder)
    expect(again.quotaGroups.filter((g) => g.id === copilot.quotaGroupId)).toHaveLength(1)
    const claude = cfg.agents.find((a) => a.provider === 'claude')!
    const shared = { ...claude, id: 'claude-apoyo', isSubagent: true }
    const quotas = computeQuotas(cfg, [...cfg.agents, shared])
    expect(quotas.find((q) => q.id === claude.quotaGroupId)?.agentIds).toEqual([claude.id, shared.id])
    expect(quotas.filter((q) => q.id === claude.quotaGroupId)).toHaveLength(1)
    expect(quotas.find((q) => q.id === 'meta')?.source).toBe('estimate')
  })

  it('publica las altas y bajas de inmediato y oculta grupos sin agentes activos', () => {
    const cfg = config()
    initQuota(folder, () => cfg, () => cfg.agents)
    const events: CoworkEvent[] = []
    const off = tapEvents((e) => events.push(e))
    try {
      const added = recomputeQuotas()
      expect(added.find((q) => q.id === 'agent-copilot')).toMatchObject({ label: 'Copilot', source: 'none', remainingPct: null, agentIds: ['copilot'] })
      expect(added.find((q) => q.id === 'agent-kilo')?.unlimited).not.toBe(true)
      cfg.agents.find((a) => a.id === 'copilot')!.enabled = false
      cfg.agents = cfg.agents.filter((a) => a.id !== 'kilo')
      const removed = recomputeQuotas()
      expect(removed.some((q) => q.id === 'agent-copilot' || q.id === 'agent-kilo')).toBe(false)
      expect(latestQuotas()).toEqual(removed)
      expect(events.filter((e) => e.kind === 'quota.update')).toHaveLength(2)
      cfg.agents.find((a) => a.id === 'copilot')!.enabled = true
      expect(recomputeQuotas().some((q) => q.id === 'agent-copilot')).toBe(true)
    } finally { off() }
  })

  it('estima el presupuesto de un agente añadido con su consumo registrado', () => {
    const cfg = config()
    cfg.quotaGroups.find((g) => g.id === 'agent-copilot')!.budget = { limit: 10, unit: 'solicitudes', period: 'diario' }
    recordUsage('agent-copilot', 100, 2)
    expect(computeQuotas(cfg, cfg.agents).find((q) => q.id === 'agent-copilot')).toMatchObject({ source: 'estimate', remaining: 8, remainingPct: 80, usedRequests: 2 })
  })
})
