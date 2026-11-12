// @vitest-environment node
// «/instagram» de punta a punta: el agente escribe el texto, sale la tarjeta y «Te necesita», y «Publicar» sube el
// reel con la API (simulada). Con «Publicar sin preguntar», se publica solo.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@shared/types'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))

import { loadConfig } from './config'
import { __setBackendsForChecks, activeRunsFor, decideInstagramPost, sendMessage, setInstagramBackend } from './orchestrator'
import { __setInstagramFetchForTests, type InstagramSettings } from './instagram'
import { initInbox, listInbox } from './inbox'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'

const prompts: string[] = []
const graph: string[] = []
let settings: InstagramSettings = { userId: '1784', username: 'kywai.app' }
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-ig-'))
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
      return { ok: true, text: 'Texto: «Un gato resuelve el robo del queso 🧀\n\n¿Linterna o huye? Comenta A o B\n\n#gatos #misterio»', usage: { input: 1, output: 1 } }
    }
  })
  setInstagramBackend({ token: () => 'EAAtoken-de-prueba', settings: () => settings })
  __setInstagramFetchForTests(
    async (url, init) => {
      graph.push(`${init?.method ?? 'GET'} ${url}`)
      const out = /\/media$/.test(url) ? { id: 'C1' } : /rupload/.test(url) ? { success: true } : /\/C1\?/.test(url) ? { status_code: 'FINISHED' } : /media_publish$/.test(url) ? { id: 'M1' } : { permalink: 'https://www.instagram.com/reel/abc/' }
      return { ok: true, status: 200, text: async () => JSON.stringify(out) }
    },
    async () => undefined
  )
  projectId = store.listProjects()[0].id
  // Un vídeo que entregó una tarea anterior.
  const root = store.workRoot(projectId)
  mkdirSync(join(root, 'videos'), { recursive: true })
  writeFileSync(join(root, 'videos', 'gato.mp4'), Buffer.alloc(4096, 1))
  store.upsertArtifact({ id: 'art-1', projectId, name: 'gato.mp4', relPath: 'videos/gato.mp4', kind: 'video' as never, size: 4096, createdAt: Date.now() })
  store.upsertMessage({ id: 'msg-video', projectId, author: { type: 'agent', agentId: 'codex' }, text: 'Aquí tienes tu vídeo «El robo del queso».', createdAt: Date.now(), artifactIds: ['art-1'] })
})

const card = (): ChatMessage | undefined => [...store.snapshotProject(projectId).messages].reverse().find((m) => m.instagramPost)

describe('/instagram', () => {
  it('prepara el texto, pide el visto bueno y publica al pulsar «Publicar»', async () => {
    await sendMessage({ projectId, text: '/instagram que suene a misterio', filePaths: [] })
    await vi.waitFor(() => expect(card()).toBeTruthy())
    expect(prompts.at(-1)).toContain('@kywai.app')
    expect(prompts.at(-1)).toContain(join(store.workRoot(projectId), 'videos', 'gato.mp4'))
    expect(prompts.at(-1)).toContain('que suene a misterio')
    const m = card()!
    expect(m.instagramPost).toMatchObject({ status: 'pending', video: 'videos/gato.mp4', username: 'kywai.app' })
    expect(m.instagramPost!.caption).toBe('Un gato resuelve el robo del queso 🧀\n\n¿Linterna o huye? Comenta A o B\n\n#gatos #misterio')
    expect(m.artifactIds).toEqual(['art-1'])
    // Nada se publica solo: hasta pulsar no hay llamadas a Instagram.
    expect(graph).toEqual([])
    expect(listInbox().find((i) => i.kind === 'instagram' && i.messageId === m.id && !i.resolvedAt)).toBeTruthy()
    decideInstagramPost(projectId, m.id, 'publish', 'Texto cambiado #gatos')
    await vi.waitFor(() => expect(card()!.instagramPost!.status).toBe('published'))
    expect(card()!.instagramPost).toMatchObject({ caption: 'Texto cambiado #gatos', permalink: 'https://www.instagram.com/reel/abc/' })
    expect(card()!.text).toContain('https://www.instagram.com/reel/abc/')
    expect(graph.some((g) => g.includes('media_publish'))).toBe(true)
    expect(listInbox().find((i) => i.kind === 'instagram' && i.messageId === m.id)!.resolvedAt).toBeTruthy()
    expect(() => decideInstagramPost(projectId, m.id, 'publish')).toThrow(/ya está publicado/)
    await vi.waitFor(() => expect(activeRunsFor(projectId)).toEqual([]))
  })

  it('con «Publicar sin preguntar» sale solo; sin cuenta conectada, lo dice', async () => {
    graph.length = 0
    settings = { ...settings, autoPublish: true }
    await sendMessage({ projectId, text: '/ig', filePaths: [] })
    await vi.waitFor(() => expect(store.snapshotProject(projectId).messages.filter((m) => m.instagramPost)).toHaveLength(2))
    await vi.waitFor(() => expect(card()?.instagramPost?.status).toBe('published'))
    expect(card()!.instagramPost!.auto).toBe(true)
    expect(graph.some((g) => g.includes('media_publish'))).toBe(true)
    await vi.waitFor(() => expect(activeRunsFor(projectId)).toEqual([]))
    settings = {}
    await expect(sendMessage({ projectId, text: '/instagram', filePaths: [] })).rejects.toThrow(/Conecta primero la cuenta de Instagram/)
  })

  it('«/instagram prueba» publica un reel de prueba', async () => {
    graph.length = 0
    settings = { userId: '1784', username: 'kywai.app' }
    await sendMessage({ projectId, text: '/instagram prueba', filePaths: [] })
    await vi.waitFor(() => expect(card()?.instagramPost?.trial).toBe(true))
    expect(card()!.text).toContain('solo a quien no te sigue')
    decideInstagramPost(projectId, card()!.id, 'publish')
    await vi.waitFor(() => expect(card()!.instagramPost!.status).toBe('published'))
    expect(graph.some((g) => g.startsWith('POST') && g.endsWith('/1784/media'))).toBe(true)
    await vi.waitFor(() => expect(activeRunsFor(projectId)).toEqual([]))
  })

  it('«/instagram resultados» guarda los números y el siguiente texto aprende de ellos', async () => {
    __setInstagramFetchForTests(async (url) => {
      const out = /\/media\?/.test(url)
        ? { data: ['A', 'B', 'C'].map((id, i) => ({ id, media_product_type: 'REELS', caption: `Gancho ${id}`, timestamp: `2026-11-0${i + 1}T10:00:00+0000`, permalink: `https://www.instagram.com/reel/${id}/` })) }
        : { data: [{ name: 'views', total_value: { value: url.includes('/B/') ? 9000 : 300 } }] }
      return { ok: true, status: 200, text: async () => JSON.stringify(out) }
    })
    await sendMessage({ projectId, text: '/instagram resultados', filePaths: [] })
    const last = [...store.snapshotProject(projectId).messages].reverse().find((m) => m.author.type === 'system')!
    expect(last.text).toContain('últimos 3 reels de @kywai.app')
    expect(last.text).toContain('«Gancho B» · 9.000 vistas')
    expect(last.text).toContain('aprenden de lo que funcionó')
    const file = join(env.root, 'instagram', 'resultados.md')
    await sendMessage({ projectId, text: '/instagram', filePaths: [] })
    await vi.waitFor(() => expect(prompts.at(-1)).toContain('resultados.md'))
    await vi.waitFor(() => expect(activeRunsFor(projectId)).toEqual([]))
    expect(prompts.at(-1)).toContain(file.split('/').slice(-2).join('/'))
  })
})
