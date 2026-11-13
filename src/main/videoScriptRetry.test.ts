// @vitest-environment node
// El guion de /video no viene en JSON: el mismo agente lo repite una vez sabiendo qué falló, y el título de la tarea
// sale limpio aunque el tema venga en Markdown.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))

import { loadConfig } from './config'
import { __setBackendsForChecks, plainLabel, sendMessage } from './orchestrator'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'
import { initInbox } from './inbox'

const prompts: string[] = []
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-guion-'))
  const cfg = loadConfig()
  cfg.agents = cfg.agents.filter((a) => a.id === 'codex').map((a) => ({ ...a, enabled: true, lightModel: undefined }))
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
      // Un guion de cine en Markdown, como el que escribió Aider: no trae el JSON.
      return { ok: true, text: "# The Wrong Address\n\nBEN: That's our old address.\nLENA: It's on the flyer you sent.", usage: { input: 1, output: 1 } }
    }
  })
  projectId = store.listProjects()[0].id
})

describe('guion de /video que no viene en JSON', () => {
  it('título limpio y el mismo agente lo repite una vez con lo que falló antes de darlo por fallido', async () => {
    await sendMessage({ projectId, text: '/video # The Wrong Address\n**Format:** vertical 9:16 reel for @kywai_app\n\nBEN and LENA argue about an address.', filePaths: [] })
    await vi.waitFor(() => expect(store.snapshotProject(projectId).tasks.find((t) => t.video)?.status).toBe('failed'), { timeout: 15_000 })
    const t = store.snapshotProject(projectId).tasks.find((x) => x.video)!
    expect(t.title).toBe('Vídeo: The Wrong Address')
    const scripts = prompts.filter((p) => p.includes('The Wrong Address'))
    expect(scripts).toHaveLength(2)
    expect(scripts[0]).not.toContain('## Corrección pedida')
    expect(scripts[1]).toContain('## Corrección pedida')
    expect(scripts[1]).toContain('no trae el guion en JSON')
    expect(t.error).toContain('no trae el guion en JSON')
  })
})

describe('plainLabel', () => {
  it('quita el Markdown y se queda con el encabezado', () => {
    expect(plainLabel('# The Wrong Address\n**Format:** vertical')).toBe('The Wrong Address')
    expect(plainLabel('cómo **ahorrar** con `kywai`')).toBe('cómo ahorrar con kywai')
    expect(plainLabel('- uno\n- dos')).toBe('uno dos')
    expect(plainLabel(undefined)).toBe('')
  })
})
