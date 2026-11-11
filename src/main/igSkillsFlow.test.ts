// @vitest-environment node
// «/ig-plan …»: kywai baja el paquete (aquí simulado) y un agente sigue la habilidad, sin pasar por Hermes.
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))
vi.mock('./plugins', () => ({
  downloadFolder: async () =>
    new Map([
      ['skills/ig-plan/SKILL.md', Buffer.from('---\nname: ig-plan\n---\nPlan the week.')],
      ['templates/voice.md', Buffer.from('# Voice')],
      ['.mcp.json', Buffer.from('{}')]
    ])
}))

import { loadConfig } from './config'
import { __setBackendsForChecks, sendMessage } from './orchestrator'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'
import { initInbox } from './inbox'

const prompts: string[] = []
let projectId = ''
let ws = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-ig-'))
  const cfg = loadConfig()
  cfg.agents = cfg.agents.filter((a) => a.id === 'codex').map((a) => ({ ...a, enabled: true, lightModel: undefined }))
  cfg.plannerOrder = ['codex']
  cfg.stations = cfg.stations.filter((s) => !s.forSubagents)
  cfg.planApproval = false
  ws = cfg.workspaceRoot
  store.initProjects(cfg.workspaceRoot)
  store.ensureFirstProject()
  initUsageLog(cfg.workspaceRoot)
  initTaskTraces(cfg.workspaceRoot)
  initInbox(cfg.workspaceRoot)
  __setBackendsForChecks({
    presence: async () => null,
    run: async (o) => {
      prompts.push(o.prompt)
      return { ok: true, text: 'Lunes: reel del modo diálogo.', usage: { input: 1, output: 1 } }
    }
  })
  projectId = store.listProjects()[0].id
})

describe('/ig-…', () => {
  it('crea una tarea que sigue la habilidad, sin plan de Hermes', async () => {
    await sendMessage({ projectId, text: '/ig-plan semana del modo diálogo', filePaths: [] })
    await vi.waitFor(() => expect(prompts.length).toBeGreaterThanOrEqual(1), { timeout: 10_000 })
    expect(existsSync(join(ws, 'instagram', 'instagram-agent-skill', 'skills', 'ig-plan', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(ws, 'instagram', 'instagram-agent-skill', '.mcp.json'))).toBe(false)
    expect(prompts[0]).toContain('Sigue la habilidad «ig-plan»')
    expect(prompts[0]).toContain('semana del modo diálogo')
    expect(prompts[0]).toContain('aún no está conectada')
    expect(store.snapshotProject(projectId).tasks.at(-1)?.title).toBe('/ig-plan: semana del modo diálogo')
  })
})
