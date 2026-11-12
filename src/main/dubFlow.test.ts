// @vitest-environment node
// «/doblar» de punta a punta con el agente simulado: un vídeo hecho con «/video» se dobla al inglés reutilizando su
// carpeta de trabajo (mismas imágenes) y el doblado queda apuntado para poder doblarlo otra vez.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '', reply: '', renders: [] as { workDir: string; reuseFrom?: string; lang: string; title: string; images: string[] }[] }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))
vi.mock('./videoStudio', async (orig) => {
  const real = await orig<typeof import('./videoStudio')>()
  return {
    ...real,
    renderVideo: async (input: { script: { title: string; lang: string; scenes: { image: string }[] }; format: string; workDir: string; outDir: string; reuseFrom?: string }) => {
      mkdirSync(input.workDir, { recursive: true })
      writeFileSync(join(input.workDir, 'guion.json'), JSON.stringify({ format: input.format, ...input.script }))
      const file = join(input.outDir, `${input.script.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp4`)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, 'mp4')
      env.renders.push({ workDir: input.workDir, reuseFrom: input.reuseFrom, lang: input.script.lang, title: input.script.title, images: input.script.scenes.map((s) => s.image) })
      return { file, seconds: 31, width: 1080, height: 1920, images: 3, voice: 'kokoro', moving: 0 }
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
  env.root = mkdtempSync(join(tmpdir(), 'aicw-doblar-flow-'))
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
const lastText = () => store.snapshotProject(projectId).messages.filter((m) => m.author.type === 'agent').at(-1)?.text ?? ''

const scenes = (lang: string) =>
  ['uno', 'dos', 'tres'].map((n, i) => ({ heading: `${lang} ${n}`, narration: `[alegre] ${lang} frase ${n}.`, image: `imagen ${i + 1}` }))

describe('/doblar', () => {
  it('sin idioma lo pide y sin vídeo de «/video» lo dice', async () => {
    await expect(sendMessage({ projectId, text: '/doblar', filePaths: [] })).rejects.toThrow(/A qué idioma/)
    await expect(sendMessage({ projectId, text: '/doblar inglés', filePaths: [] })).rejects.toThrow(/No hay ningún vídeo que doblar/)
  })

  it('el último vídeo de «/video» se dobla con las mismas imágenes y se puede volver a doblar', async () => {
    env.reply = JSON.stringify({ title: 'Mi vídeo', lang: 'es', theme: 'neon', scenes: scenes('es'), outro: 'Adiós' })
    await sendMessage({ projectId, text: '/video mi vídeo', filePaths: [] })
    await until(() => activeRunsFor(projectId).length === 0 && env.renders.length === 1)
    const first = env.renders[0]
    expect(existsSync(join(first.workDir, 'entregado.json'))).toBe(true)

    env.reply = JSON.stringify({ title: 'My video', outro: 'Bye', scenes: scenes('en').map(({ heading, narration }) => ({ heading, narration })) })
    await sendMessage({ projectId, text: '/doblar al inglés', filePaths: [] })
    await until(() => activeRunsFor(projectId).length === 0 && env.renders.length === 2)
    expect(prompts.at(-1)).toContain('al inglés')
    expect(prompts.at(-1)).toContain('[alegre] es frase uno.')
    const dub = env.renders[1]
    expect(dub).toMatchObject({ reuseFrom: first.workDir, lang: 'en', title: 'My video', images: ['imagen 1', 'imagen 2', 'imagen 3'] })
    expect(existsSync(join(dub.workDir, 'entregado.json'))).toBe(true)
    expect(lastText()).toContain('«My video» en inglés (31 s)')

    await expect(sendMessage({ projectId, text: '/doblar inglés', filePaths: [] })).rejects.toThrow(/ya está en inglés/)
  })
})
