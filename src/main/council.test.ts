// @vitest-environment node
// «/consejo pregunta»: la misma pregunta a varios agentes y uno junta lo mejor. Hermes recibe el encargo armado.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))

import { loadConfig } from './config'
import { __setBackendsForChecks, sendMessage } from './orchestrator'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'
import { initInbox } from './inbox'
import { councilPlannerText, parseCouncilRequest, pickCouncil } from './council'

describe('«/consejo» (lo que no depende del motor)', () => {
  it('entiende la pregunta y cuántos consejeros', () => {
    expect(parseCouncilRequest('/consejo ¿Postgres o SQLite para una app pequeña?')).toEqual({ question: '¿Postgres o SQLite para una app pequeña?', size: 3 })
    expect(parseCouncilRequest('/panel 5 agentes ¿qué framework?')).toEqual({ question: '¿qué framework?', size: 5 })
    expect(parseCouncilRequest('/mezcla 9 x')).toEqual({ question: 'x', size: 5 })
    expect(parseCouncilRequest('/consejo')).toEqual({ question: '', size: 3 })
    expect(parseCouncilRequest('/consejos x')).toBeNull()
  })

  it('elige primero agentes de familias distintas', () => {
    const agents = [
      { id: 'claude', name: 'Claude', provider: 'claude' as const },
      { id: 'claude2', name: 'Claude 2', provider: 'claude' as const },
      { id: 'codex', name: 'Codex', provider: 'codex' as const },
      { id: 'gemini', name: 'Gemini', provider: 'gemini' as const }
    ]
    expect(pickCouncil(agents, 3).map((a) => a.name)).toEqual(['Claude', 'Codex', 'Gemini'])
    expect(pickCouncil(agents, 5).map((a) => a.name)).toEqual(['Claude', 'Codex', 'Gemini', 'Claude 2'])
  })

  it('el encargo pide tareas en paralelo y una síntesis que dependa de todas', () => {
    const p = councilPlannerText({ question: '¿X o Y?', size: 2 }, ['Claude', 'Codex'])
    expect(p).toContain('«¿X o Y?»')
    expect(p).toContain('2 tareas EN PARALELO')
    expect(p).toContain('consejo/sintesis.md')
    expect(councilPlannerText({ question: 'a', size: 3 }, ['Claude'])).toContain('Solo hay un agente')
  })
})

describe('«/consejo» en el chat', () => {
  const prompts: string[] = []
  let projectId = ''

  beforeAll(() => {
    env.root = mkdtempSync(join(tmpdir(), 'aicw-consejo-'))
    const cfg = loadConfig()
    cfg.agents = cfg.agents.filter((a) => a.id === 'codex' || a.id === 'claude').map((a) => ({ ...a, enabled: true, lightModel: undefined }))
    cfg.plannerOrder = ['codex']
    cfg.stations = cfg.stations.filter((s) => !s.forSubagents)
    cfg.planApproval = false
    store.initProjects(cfg.workspaceRoot)
    store.ensureFirstProject()
    initUsageLog(cfg.workspaceRoot)
    initTaskTraces(cfg.workspaceRoot)
    initInbox(cfg.workspaceRoot)
    __setBackendsForChecks({
      presence: async () => null,
      run: async (o) => {
        prompts.push(o.prompt)
        return { ok: true, text: JSON.stringify({ reply: 'Listo.', tasks: [] }), usage: { input: 1, output: 1 } }
      }
    })
    projectId = store.listProjects()[0].id
  })

  it('Hermes recibe el encargo del consejo y en el chat se ve lo que escribiste', async () => {
    await sendMessage({ projectId, text: '/consejo ¿Postgres o SQLite para una app pequeña?', filePaths: [] })
    await vi.waitFor(() => expect(prompts.some((p) => p.includes('Consejo de agentes'))).toBe(true), { timeout: 10_000 })
    const planner = prompts.find((p) => p.includes('Consejo de agentes'))!
    expect(planner).toContain('¿Postgres o SQLite para una app pequeña?')
    expect(planner).toMatch(/Codex/)
    const mine = store.snapshotProject(projectId).messages.filter((m) => m.author.type === 'user')
    expect(mine.at(-1)?.text).toBe('/consejo ¿Postgres o SQLite para una app pequeña?')
  })

  it('sin pregunta, avisa y no envía nada', async () => {
    await expect(sendMessage({ projectId, text: '/consejo', filePaths: [] })).rejects.toThrow(/consejo/)
  })
})
