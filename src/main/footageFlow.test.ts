// @vitest-environment node
// «/editar» y «/recortes» de punta a punta con el agente simulado: se transcribe la grabación adjunta, el agente
// recibe la transcripción numerada y contesta en JSON, y kywai monta y entrega el vídeo (o los clips) en videos/.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '', reply: '', renders: [] as { out: string; title?: string; segs: number; frame: string }[] }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))
vi.mock('./footage', async (orig) => {
  const real = await orig<typeof import('./footage')>()
  const said = 'Hola a todos eh hoy os enseño perdón hoy os enseño a editar vídeos en kywai sin perder tiempo y con buen resultado'.split(' ')
  return {
    ...real,
    probeMedia: async () => ({ seconds: 60, w: 1920, h: 1080, fps: 30, audio: true }),
    transcribeWords: async (_file: string, dir: string) => {
      const words = said.map((w, i) => ({ i, s: i * 2, e: i * 2 + 1.5, w }))
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'palabras.json'), JSON.stringify(words))
      return words
    },
    renderFootage: async (input: { out: string; title?: string; segs: unknown[]; frame: string }) => {
      mkdirSync(dirname(input.out), { recursive: true })
      writeFileSync(input.out, 'mp4')
      env.renders.push({ out: input.out, title: input.title, segs: input.segs.length, frame: input.frame })
      return { seconds: 30, subtitles: true }
    }
  }
})

import { loadConfig } from './config'
import { __setBackendsForChecks, activeRunsFor, sendMessage } from './orchestrator'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'
import { initInbox } from './inbox'

const prompts: string[] = []
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-editar-'))
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
      return { ok: true, text: env.reply, usage: { input: 1, output: 1 } }
    }
  })
  projectId = store.listProjects()[0].id
})

async function until(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !ok(); i++) await new Promise((r) => setTimeout(r, 10))
}
const messages = () => store.snapshotProject(projectId).messages
const lastText = () => messages().filter((m) => m.author.type === 'agent').at(-1)?.text ?? ''

function grabacion(): string {
  const file = join(env.root, 'toma.mp4')
  writeFileSync(file, 'video')
  return file
}

describe('/editar y /recortes', () => {
  it('sin vídeo adjunto pide adjuntarlo', async () => {
    await expect(sendMessage({ projectId, text: '/editar', filePaths: [] })).rejects.toThrow(/Adjunta la grabación/)
    await expect(sendMessage({ projectId, text: '/recortes 3', filePaths: [] })).rejects.toThrow(/Adjunta el vídeo largo/)
  })

  it('/editar: el agente ve las palabras numeradas y kywai monta el vídeo editado', async () => {
    env.reply = '{"title": "Editar con kywai", "cut": [[4, 6]]}'
    await sendMessage({ projectId, text: '/editar quita el titubeo', filePaths: [grabacion()] })
    await until(() => activeRunsFor(projectId).length === 0 && env.renders.length > 0)
    expect(prompts.at(-1)).toContain('{3}eh')
    expect(prompts.at(-1)).toContain('quita el titubeo')
    const r = env.renders.at(-1)!
    expect(r.out).toMatch(/videos[\\/]editar-con-kywai-editado\.mp4$/)
    expect(r.frame).toBe('original')
    expect(existsSync(r.out)).toBe(true)
    expect(lastText()).toContain('«Editar con kywai» editado: de 60 s a 30 s')
    expect(lastText()).toMatch(/Quité 3 palabras .* 1 muletillas/)
  })

  it('/recortes: un vídeo por clip, verticales y con su título', async () => {
    env.reply = '{"clips": [{"title": "Edita sin perder tiempo", "from": 9, "to": 19, "why": "promete algo"}, {"title": "Pisa", "from": 15, "to": 20}]}'
    const before = env.renders.length
    await sendMessage({ projectId, text: '/recortes 2', filePaths: [grabacion()] })
    await until(() => activeRunsFor(projectId).length === 0 && env.renders.length > before)
    expect(prompts.at(-1)).toContain('los 2 mejores momentos')
    expect(prompts.at(-1)).toMatch(/#0-#\d+ \[00:00\.0\] Hola/)
    const clips = env.renders.slice(before)
    expect(clips).toHaveLength(1)
    expect(clips[0]).toMatchObject({ title: 'Edita sin perder tiempo', frame: 'vertical' })
    expect(clips[0].out).toMatch(/recortes-toma[\\/]1-edita-sin-perder-tiempo\.mp4$/)
    expect(lastText()).toContain('un clip de «toma.mp4»')
    expect(lastText()).toContain('«Edita sin perder tiempo» (30 s): promete algo')
  })
})
