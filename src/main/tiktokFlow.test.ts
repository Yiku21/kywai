// @vitest-environment node
// «/tiktok» de punta a punta: el agente escribe el texto, sale la tarjeta y «Te necesita»; «Enviar como borrador» lo
// manda a la bandeja y «Publicar» lo publica directo (solo en privado hasta que TikTok apruebe la app). API simulada.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@shared/types'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))

import { loadConfig } from './config'
import { __setBackendsForChecks, activeRunsFor, decideTikTokPost, sendMessage, setTikTokBackend } from './orchestrator'
import { __setTikTokFetchForTests, type TikTokSettings } from './tiktok'
import { initInbox, listInbox } from './inbox'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'

const prompts: string[] = []
const api: Array<{ url: string; body: string }> = []
let settings: TikTokSettings = { clientKey: 'ck', name: 'kywai', scopes: ['user.info.basic', 'video.upload', 'video.publish'] }
let connected = true
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-tt-'))
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
      return { ok: true, text: 'Un gato resuelve el robo del queso 🧀\n\n#gatos #misterio', usage: { input: 1, output: 1 } }
    }
  })
  setTikTokBackend({ token: async () => (connected ? 'act.prueba' : null), connected: () => connected, settings: () => settings })
  __setTikTokFetchForTests(
    async (url, init) => {
      api.push({ url, body: typeof init?.body === 'string' ? init.body : '' })
      const data = url.endsWith('creator_info/query/')
        ? { creator_nickname: 'kywai.app', privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], duet_disabled: true }
        : url.endsWith('init/')
          ? { publish_id: 'p1', upload_url: 'https://up.tiktok/x' }
          : url.endsWith('status/fetch/')
            ? { status: [...api].reverse().find((a) => a.url.endsWith('init/') && !a.url.includes('creator_info'))!.url.includes('inbox') ? 'SEND_TO_USER_INBOX' : 'PUBLISH_COMPLETE' }
            : {}
      return { ok: true, status: 200, text: async () => JSON.stringify({ data, error: { code: 'ok' } }) }
    },
    async () => undefined
  )
  projectId = store.listProjects()[0].id
  const root = store.workRoot(projectId)
  mkdirSync(join(root, 'videos'), { recursive: true })
  writeFileSync(join(root, 'videos', 'gato.mp4'), Buffer.alloc(4096, 1))
  store.upsertArtifact({ id: 'art-1', projectId, name: 'gato.mp4', relPath: 'videos/gato.mp4', kind: 'video' as never, size: 4096, createdAt: Date.now() })
  store.upsertMessage({ id: 'msg-video', projectId, author: { type: 'agent', agentId: 'codex' }, text: 'Aquí tienes tu vídeo «El robo del queso».', createdAt: Date.now(), artifactIds: ['art-1'] })
})

const cards = (): ChatMessage[] => store.snapshotProject(projectId).messages.filter((m) => m.tiktokPost)
const card = (): ChatMessage | undefined => cards().at(-1)

describe('/tiktok', () => {
  it('prepara el texto y lo envía como borrador al pulsar', async () => {
    await sendMessage({ projectId, text: '/tiktok que suene a misterio', filePaths: [] })
    await vi.waitFor(() => expect(card()).toBeTruthy())
    expect(prompts.at(-1)).toContain('TikTok')
    expect(prompts.at(-1)).toContain('que suene a misterio')
    const m = card()!
    // Sin aprobar la app, solo «Solo yo»; los dúos los tiene apagados la cuenta.
    expect(m.tiktokPost).toMatchObject({ status: 'pending', video: 'videos/gato.mp4', direct: true, name: 'kywai.app', privacyOptions: ['SELF_ONLY'], duetDisabled: true })
    expect(m.tiktokPost!.caption).toBe('Un gato resuelve el robo del queso 🧀\n\n#gatos #misterio')
    // Nada se sube solo: solo se consultó la cuenta.
    expect(api.map((a) => a.url.replace('https://open.tiktokapis.com/v2/', ''))).toEqual(['post/publish/creator_info/query/'])
    expect(listInbox().find((i) => i.kind === 'tiktok' && i.messageId === m.id && !i.resolvedAt)).toBeTruthy()
    expect(() => decideTikTokPost(projectId, m.id, 'publish', { privacy: 'PUBLIC_TO_EVERYONE' })).toThrow(/quién puede ver/)
    decideTikTokPost(projectId, m.id, 'draft')
    await vi.waitFor(() => expect(card()!.tiktokPost!.status).toBe('drafted'))
    expect(api.some((a) => a.url.endsWith('inbox/video/init/'))).toBe(true)
    expect(listInbox().find((i) => i.kind === 'tiktok' && i.messageId === m.id)!.resolvedAt).toBeTruthy()
    expect(() => decideTikTokPost(projectId, m.id, 'draft')).toThrow(/ya está en TikTok/)
    await vi.waitFor(() => expect(activeRunsFor(projectId)).toEqual([]))
  })

  it('publica directo en privado con lo elegido, sin dúos si la cuenta los apagó', async () => {
    api.length = 0
    await sendMessage({ projectId, text: '/tt', filePaths: [] })
    await vi.waitFor(() => expect(cards()).toHaveLength(2))
    const m = card()!
    decideTikTokPost(projectId, m.id, 'publish', { privacy: 'SELF_ONLY', caption: 'Otro texto #ia', allowComments: true, allowDuet: true })
    await vi.waitFor(() => expect(card()!.tiktokPost!.status).toBe('published'))
    const init = JSON.parse(api.find((a) => a.url.endsWith('publish/video/init/'))!.body)
    expect(init.post_info).toMatchObject({ title: 'Otro texto #ia', privacy_level: 'SELF_ONLY', disable_comment: false, disable_duet: true, is_aigc: true })
    await vi.waitFor(() => expect(activeRunsFor(projectId)).toEqual([]))
  })

  it('con «Enviar borradores sin preguntar» sale solo; sin cuenta, lo dice', async () => {
    settings = { ...settings, scopes: ['user.info.basic', 'video.upload'], autoDraft: true }
    await sendMessage({ projectId, text: '/tiktok', filePaths: [] })
    await vi.waitFor(() => expect(cards()).toHaveLength(3))
    await vi.waitFor(() => expect(card()?.tiktokPost?.status).toBe('drafted'))
    expect(card()!.tiktokPost).toMatchObject({ auto: true, direct: false })
    await vi.waitFor(() => expect(activeRunsFor(projectId)).toEqual([]))
    connected = false
    await expect(sendMessage({ projectId, text: '/tiktok', filePaths: [] })).rejects.toThrow(/Conecta primero la cuenta de TikTok/)
  })
})
