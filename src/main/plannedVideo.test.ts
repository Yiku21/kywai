// @vitest-environment node
// «créame un vídeo por guion…» (con otras palabras, sin «/video»): Hermes pone la orden en "video" y kywai la lanza.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
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

const prompts: string[] = []
let plan = ''
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-planvideo-'))
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
      // El coordinador devuelve el plan; el guionista, un guion que no vale (aquí solo importa el encargo).
      if (o.prompt.includes('"video": si el usuario pide crear')) return { ok: true, text: plan, usage: { input: 1, output: 1 } }
      return { ok: true, text: 'no es un guion', usage: { input: 1, output: 1 } }
    }
  })
  projectId = store.listProjects()[0].id
})

describe('vídeos pedidos con otras palabras', () => {
  it('Hermes pone la orden en "video" y kywai crea los vídeos sin repetir el mensaje', async () => {
    plan = JSON.stringify({
      reply: 'Ya están en marcha los 2 vídeos.',
      tasks: [],
      video: ['/video personaje:robots-kywai voz:kokoro-am_adam\n1) los agentes que trabajan en equipo\n2) cómo se reparten el trabajo']
    })
    await sendMessage({ projectId, text: 'oke ycrame ahora un video por cada idea, con los personajes de kywai, en ingles', filePaths: [] })
    await vi.waitFor(() => expect(store.snapshotProject(projectId).tasks.filter((t) => t.video).length).toBe(2), { timeout: 10_000 })
    const vids = store.snapshotProject(projectId).tasks.filter((t) => t.video)
    expect(vids.map((t) => t.video?.batch?.n)).toEqual([1, 2])
    expect(vids[0].video?.voice).toBe('kokoro-am_adam')
    expect(vids[0].video?.character).toBe('robots-kywai')
    const msgs = store.snapshotProject(projectId).messages
    expect(msgs.filter((m) => m.author.type === 'user')).toHaveLength(1)
    expect(msgs.some((m) => m.text.includes('Ya están en marcha'))).toBe(true)
  })

  it('si el vídeo nombra un guion del proyecto, kywai lo lee y se lo da al guionista', async () => {
    const dir = join(store.workRoot(projectId), 'artifacts', 'guiones', 'redes')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, '01-stop-picking-one-ai.md'), 'HOOK: Stop picking one AI. Use them all.')
    writeFileSync(join(dir, '02-draft-your-ai-dream-team.md'), 'HOOK: Draft your AI dream team.')
    const before = store.snapshotProject(projectId).tasks.length
    plan = JSON.stringify({
      reply: 'En marcha.',
      tasks: [],
      video: ['/video personaje:robots-kywai voz:kokoro-am_adam un vídeo por guion: 1) artifacts/guiones/redes/01-stop-picking-one-ai.md 2) artifacts/guiones/redes/02-draft-your-ai-dream-team.md']
    })
    await sendMessage({ projectId, text: 'oke ycrame ahora usando cada uno de esos guiones un video por gion', filePaths: [] })
    await vi.waitFor(() => expect(store.snapshotProject(projectId).tasks.length).toBe(before + 2), { timeout: 10_000 })
    const vids = store.snapshotProject(projectId).tasks.slice(before)
    expect(vids[0].video?.source).toContain('Stop picking one AI')
    expect(vids[1].video?.source).toContain('Draft your AI dream team')
  }, 15_000)

  it('una orden que no es de vídeo no lanza nada', async () => {
    const before = store.snapshotProject(projectId).tasks.length
    plan = JSON.stringify({ reply: 'Hecho.', tasks: [], video: ['/video'] })
    await sendMessage({ projectId, text: 'gracias', filePaths: [] })
    await vi.waitFor(() => expect(store.snapshotProject(projectId).messages.some((m) => m.text.includes('Hecho.'))).toBe(true), { timeout: 10_000 })
    expect(store.snapshotProject(projectId).tasks.length).toBe(before)
  }, 15_000)
})
