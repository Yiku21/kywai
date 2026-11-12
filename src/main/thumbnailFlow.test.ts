// @vitest-environment node
// «/miniatura» de punta a punta con el agente simulado: kywai saca fotogramas del vídeo adjunto, el agente elige y
// escribe, y kywai hace las portadas en videos/miniaturas-<vídeo>/.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '', reply: '', pngs: [] as { out: string; w: number; h: number; html: string }[] }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))
vi.mock('./footage', async (orig) => ({ ...(await orig<typeof import('./footage')>()), probeMedia: async () => ({ seconds: 40, w: 1080, h: 1920, fps: 30, audio: true }) }))
vi.mock('./htmlShot', () => ({
  capturePage: async () => null,
  htmlToPng: async (html: string, size: { w: number; h: number }, out: string) => {
    writeFileSync(out, 'png')
    env.pngs.push({ out, w: size.w, h: size.h, html })
    return true
  }
}))
vi.mock('./thumbnail', async (orig) => ({
  ...(await orig<typeof import('./thumbnail')>()),
  thumbFrames: async (_v: string, _s: number, dir: string) => {
    mkdirSync(dir, { recursive: true })
    return [0, 1, 2].map((i) => join(dir, `fotograma-${i}.jpg`))
  }
}))

import { loadConfig } from './config'
import { __setBackendsForChecks, activeRunsFor, sendMessage } from './orchestrator'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'
import { initInbox } from './inbox'

const prompts: string[] = []
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-miniatura-'))
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

describe('/miniatura', () => {
  it('sin vídeo en el chat ni adjunto lo pide', async () => {
    await expect(sendMessage({ projectId, text: '/miniatura', filePaths: [] })).rejects.toThrow(/No hay ningún vídeo/)
  })

  it('el agente elige fotogramas y textos y kywai hace las tres portadas con el formato del vídeo', async () => {
    const file = join(env.root, 'mi reel.mp4')
    writeFileSync(file, 'video')
    env.reply = '{"covers": [{"frame": 2, "layout": "grande", "text": "Lo hice en un día"}, {"frame": 0, "layout": "lateral", "text": "Nadie lo cuenta", "sub": "kywai"}, {"frame": 1, "layout": "caja", "text": "Pruébalo"}]}'
    await sendMessage({ projectId, text: '/miniatura que se vea la pantalla', filePaths: [file] })
    await until(() => activeRunsFor(projectId).length === 0 && env.pngs.length >= 3)
    expect(prompts.at(-1)).toContain('2: ')
    expect(prompts.at(-1)).toContain('fotograma-2.jpg')
    expect(prompts.at(-1)).toContain('que se vea la pantalla')
    expect(env.pngs).toHaveLength(3)
    expect(env.pngs.every((p) => p.w === 1080 && p.h === 1920)).toBe(true)
    expect(env.pngs[0].out).toMatch(/videos[\\/]miniaturas-mi-reel[\\/]1-lo-hice-en-un-dia\.png$/)
    expect(env.pngs[0].html).toContain('fotograma-2.jpg')
    expect(existsSync(env.pngs[2].out)).toBe(true)
    expect(lastText()).toContain('3 portadas para «mi reel.mp4»')
    expect(lastText()).toContain('1080×1920')
  })
})
