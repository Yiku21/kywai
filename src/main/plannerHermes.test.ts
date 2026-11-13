// @vitest-environment node
// Hermes coordina siempre: también con una captura adjunta (antes se saltaba y planificaba Claude sin decirlo). Si
// alguna vez coordina otro, el chat dice por qué.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))

import { loadConfig } from './config'
import { __setBackendsForChecks, activeRunsFor, refreshPresence, sendMessage } from './orchestrator'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'
import { initInbox } from './inbox'

const plans: Array<{ agent: string; prompt: string }> = []
let hermesOff: string | null = null
let hermesFails = false
let projectId = ''
let image = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-hermes-coord-'))
  const cfg = loadConfig()
  cfg.agents = cfg.agents.filter((a) => a.id === 'hermes' || a.id === 'claude').map((a) => ({ ...a, enabled: true, lightModel: undefined }))
  cfg.plannerOrder = ['hermes', 'claude']
  cfg.stations = cfg.stations.filter((s) => !s.forSubagents)
  cfg.planApproval = false
  store.initProjects(cfg.workspaceRoot)
  store.ensureFirstProject()
  initUsageLog(cfg.workspaceRoot)
  initTaskTraces(cfg.workspaceRoot)
  initInbox(cfg.workspaceRoot)
  __setBackendsForChecks({
    presence: async (a) => (a.id === 'hermes' ? hermesOff : null),
    run: async (o) => {
      if (o.mode === 'plan') plans.push({ agent: o.agent.id, prompt: o.prompt })
      if (o.mode === 'plan' && o.agent.id === 'hermes' && hermesFails) return { ok: false, text: 'x', usage: { input: 0, output: 0 }, errorKind: 'failed', errorMessage: 'Hermes: terminó con error' }
      return { ok: true, text: '{"reply":"Hecho.","tasks":[]}', usage: { input: 1, output: 1 } }
    }
  })
  projectId = store.listProjects()[0].id
  image = join(env.root, 'captura.png')
  writeFileSync(image, Buffer.from('89504e470d0a1a0a', 'hex'))
})

async function settle(): Promise<void> {
  for (let i = 0; i < 200 && activeRunsFor(projectId).length > 0; i++) await new Promise((r) => setTimeout(r, 10))
}

const systemTexts = (): string[] =>
  store
    .snapshotProject(projectId)
    .messages.filter((m) => m.author.type === 'system')
    .map((m) => m.text)

describe('Hermes coordina siempre', () => {
  it('con una captura adjunta planifica Hermes, que la mira con su herramienta de visión', async () => {
    await sendMessage({ projectId, text: 'desinstala lo que marqué', filePaths: [image] })
    await settle()
    expect(plans.at(-1)!.agent).toBe('hermes')
    expect(plans.at(-1)!.prompt).toContain('vision_analyze')
    expect(systemTexts().some((t) => t.includes('no coordina esta vez'))).toBe(false)
  })

  it('si Hermes no puede, coordina Claude y el chat lo dice', async () => {
    hermesOff = 'Hermes no está instalado'
    await refreshPresence()
    await sendMessage({ projectId, text: 'resume el proyecto', filePaths: [] })
    await settle()
    expect(plans.at(-1)!.agent).toBe('claude')
    expect(systemTexts().at(-1)).toMatch(/Hermes no coordina esta vez \(Hermes no está instalado\): lo hace Claude/)
  })

  it('si Hermes falla dos veces seguidas, las dos veces coordina Claude', async () => {
    hermesOff = null
    await refreshPresence()
    hermesFails = true
    for (const text of ['primera', 'hazlo']) {
      const before = plans.length
      await sendMessage({ projectId, text, filePaths: [] })
      await settle()
      expect(plans.slice(before).map((p) => p.agent)).toContain('claude')
    }
    hermesFails = false
  })
})
