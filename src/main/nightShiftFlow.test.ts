// @vitest-environment node
// «/turno-noche»: el agente busca y escribe; con la orden «/video …» que deja, kywai lanza el vídeo vertical, marcado
// para prepararlo después como reel de prueba.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))
vi.mock('./plugins', () => ({
  downloadFolder: async () =>
    new Map([
      ['skills/ig-viral/SKILL.md', Buffer.from('---\nname: ig-viral\n---\nFind outliers.')],
      ['skills/ig-reel/SKILL.md', Buffer.from('---\nname: ig-reel\n---\nWrite a reel.')],
      ['templates/voice.md', Buffer.from('# Voice')]
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
  env.root = mkdtempSync(join(tmpdir(), 'aicw-noche-'))
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
      if (o.prompt.includes('Turno de noche'))
        return { ok: true, text: 'Salí de un short 6× su normal.\n/video Cinco cosas que tu agente hace mientras duermes: gancho y tres pasos', usage: { input: 1, output: 1 } }
      return { ok: false, text: '', errorKind: 'failed', errorMessage: 'sin guion en la prueba', usage: { input: 1, output: 1 } }
    }
  })
  projectId = store.listProjects()[0].id
})

describe('/turno-noche', () => {
  it('busca y escribe, y lanza el vídeo vertical marcado para el reel de prueba', async () => {
    const radar = join(store.workRoot(projectId), 'radar')
    mkdirSync(radar, { recursive: true })
    writeFileSync(join(radar, '2026-11-12-0400.md'), '# Radar')
    await sendMessage({ projectId, text: '/turno-noche IA y negocio', filePaths: [] })
    await vi.waitFor(() => expect(store.snapshotProject(projectId).tasks.some((t) => t.video)).toBe(true), { timeout: 10_000 })
    expect(prompts[0]).toContain('IA y negocio')
    expect(prompts[0]).toContain('ig-viral')
    expect(prompts[0]).toContain(join(radar, '2026-11-12-0400.md'))
    expect(existsSync(join(ws, 'instagram', 'turno-noche'))).toBe(true)
    const snap = store.snapshotProject(projectId)
    const night = snap.tasks.find((t) => t.nightShift)!
    expect(night.title).toBe('Turno de noche: IA y negocio')
    const video = snap.tasks.find((t) => t.video)!
    expect(video.video).toMatchObject({ format: 'vertical', afterwards: 'ig-trial' })
    expect(snap.messages.some((m) => m.text.includes('Ahora hago el vídeo y, cuando esté, lo preparo como reel de prueba'))).toBe(true)
    expect(snap.messages.some((m) => m.text.includes('/video Cinco'))).toBe(false)
  }, 20_000)
})
