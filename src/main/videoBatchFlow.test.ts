// @vitest-environment node
// «/video hazme 3 vídeos de…»: una tarea por vídeo, cada una sabe cuál es y qué ángulo le toca. Agente simulado.
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
import { BATCH_ANGLES } from '@shared/videoBatch'

const prompts: string[] = []
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-batch-'))
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
      // Un guion que no vale: la tarea falla sin montar nada (aquí solo importa el encargo).
      return { ok: true, text: 'no es un guion', usage: { input: 1, output: 1 } }
    }
  })
  projectId = store.listProjects()[0].id
})

describe('varios vídeos con un solo /video', () => {
  it('crea una tarea por vídeo y cada encargo dice cuál es y qué le toca', async () => {
    await sendMessage({ projectId, text: '/video genérame 3 vídeos para promocionar kywai, en inglés', filePaths: [] })
    await vi.waitFor(() => expect(prompts.length).toBeGreaterThanOrEqual(3), { timeout: 10_000 })
    const tasks = store.snapshotProject(projectId).tasks.filter((t) => t.video)
    expect(tasks.map((t) => t.title.slice(0, 13))).toEqual(['Vídeo 1 de 3:', 'Vídeo 2 de 3:', 'Vídeo 3 de 3:'])
    expect(tasks.map((t) => t.video?.batch?.n)).toEqual([1, 2, 3])
    for (let n = 1; n <= 3; n++) {
      const p = prompts.find((x) => x.includes(`vídeo ${n} de 3`))
      expect(p).toBeDefined()
      expect(p).toContain(`Al tuyo le toca: ${BATCH_ANGLES[n - 1]}`)
    }
  })

  it('más de 6: todos en una petición, por tandas', async () => {
    const before = store.snapshotProject(projectId).tasks.length
    await sendMessage({ projectId, text: '/video hazme 8 vídeos de gatos', filePaths: [] })
    await vi.waitFor(() => expect(store.snapshotProject(projectId).tasks.length).toBe(before + 8), { timeout: 10_000 })
    expect(store.snapshotProject(projectId).tasks.at(-1)?.title.startsWith('Vídeo 8 de 8')).toBe(true)
    expect(store.snapshotProject(projectId).messages.some((m) => m.text.includes('hago 6 a la vez'))).toBe(true)
  })

  it('un vídeo normal sigue siendo una sola tarea', async () => {
    const before = store.snapshotProject(projectId).tasks.length
    await sendMessage({ projectId, text: '/video los 5 vídeos más vistos de la historia', filePaths: [] })
    await vi.waitFor(() => expect(store.snapshotProject(projectId).tasks.length).toBe(before + 1), { timeout: 10_000 })
    expect(store.snapshotProject(projectId).tasks.at(-1)?.video?.batch).toBeUndefined()
  })
})
