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
import { __setBackendsForChecks, decideInstagramReply, sendMessage, setInstagramBackend } from './orchestrator'
import { __setInstagramFetchForTests } from './instagram'
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
      if (o.prompt.includes('comentarios sin responder'))
        return { ok: true, text: '{"replies": [{"id": "c1", "kind": "question", "reply": "En kywai.app, gratis."}, {"id": "c2", "kind": "noise", "reply": ""}]}', usage: { input: 1, output: 1 } }
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

  it('/ig-reply: trae los comentarios, enseña las respuestas y solo envía las que apruebas', async () => {
    const posted: string[] = []
    __setInstagramFetchForTests(async (url, init) => {
      const u = new URL(String(url))
      if (init?.method === 'POST') {
        posted.push(`${u.pathname} ${String(init.body)}`)
        return new Response(JSON.stringify({ id: 'r1' }), { status: 200 })
      }
      const body = u.pathname.endsWith('/comments')
        ? { data: [{ id: 'c1', text: '¿Dónde se descarga?', username: 'ana' }, { id: 'c2', text: '🔥', username: 'bot' }] }
        : u.pathname.endsWith('/media')
          ? { data: [{ id: 'm1', caption: 'Reel', comments_count: 2, permalink: 'https://instagram.com/p/x' }] }
          : u.pathname.endsWith('/insights')
            ? { data: [] }
            : { username: 'kywai.app', followers_count: 10 }
      return new Response(JSON.stringify(body), { status: 200 })
    })
    setInstagramBackend({ token: () => 'IGx', settings: () => ({ userId: '1789', username: 'kywai.app' }) })
    await sendMessage({ projectId, text: '/ig-reply', filePaths: [] })
    await vi.waitFor(() => expect(store.snapshotProject(projectId).messages.some((m) => m.instagramReplies)).toBe(true), { timeout: 10_000 })
    const card = store.snapshotProject(projectId).messages.find((m) => m.instagramReplies)!
    expect(card.instagramReplies!.items.map((i) => [i.commentId, i.status])).toEqual([
      ['c1', 'pending'],
      ['c2', 'skipped']
    ])
    expect(posted).toEqual([])
    decideInstagramReply(projectId, card.id, 'send', 'c1', 'En kywai.app 🙂')
    await vi.waitFor(() => expect(store.snapshotProject(projectId).messages.find((m) => m.id === card.id)?.instagramReplies?.status).toBe('done'), { timeout: 5000 })
    expect(posted).toEqual(['/v21.0/c1/replies message=En+kywai.app+%F0%9F%99%82'])
    setInstagramBackend(null)
    __setInstagramFetchForTests(null)
  }, 20_000)
})
