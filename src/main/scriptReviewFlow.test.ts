// @vitest-environment node
// «Repasar el guion antes de grabar» (guion:repasar) de punta a punta con el agente simulado: el guion sale en el chat
// y en «Te necesita», se graba con tus cambios al pulsar «Grabar» y «Descartar» termina sin grabar.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '', reply: '', renders: [] as { workDir: string; narrations: string[]; headings: string[] }[] }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))
vi.mock('./videoStudio', async (orig) => {
  const real = await orig<typeof import('./videoStudio')>()
  return {
    ...real,
    renderVideo: async (input: { script: { title: string; scenes: { heading: string; narration: string }[] }; format: string; workDir: string; outDir: string }) => {
      mkdirSync(input.workDir, { recursive: true })
      writeFileSync(join(input.workDir, 'guion.json'), JSON.stringify({ format: input.format, ...input.script }))
      const file = join(input.outDir, `${input.script.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp4`)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, 'mp4')
      env.renders.push({ workDir: input.workDir, narrations: input.script.scenes.map((s) => s.narration), headings: input.script.scenes.map((s) => s.heading) })
      return { file, seconds: 31, width: 1080, height: 1920, images: 3, voice: 'kokoro', moving: 0 }
    }
  }
})

import { loadConfig } from './config'
import { __setBackendsForChecks, activeRunsFor, decideScriptReview, sendMessage } from './orchestrator'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'
import { initInbox, openInbox } from './inbox'

const prompts: string[] = []
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-repasar-flow-'))
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

const scenes = ['uno', 'dos', 'tres'].map((n, i) => ({ heading: `Rótulo ${n}`, narration: `[alegre] Frase ${n}.`, image: `imagen ${i + 1}` }))
const card = () => store.snapshotProject(projectId).messages.filter((m) => m.scriptReview).at(-1)

describe('repasar el guion antes de grabar', () => {
  it('espera tu «Grabar» y graba con tus cambios', async () => {
    env.reply = JSON.stringify({ title: 'Mi guion', lang: 'es', theme: 'neon', scenes, outro: 'Adiós' })
    await sendMessage({ projectId, text: '/video tipo:rapido guion:repasar las abejas', filePaths: [] })
    await until(() => card()?.scriptReview?.status === 'pending')
    const m = card()!
    expect(m.scriptReview!.scenes.map((s) => s.narration)).toEqual(['[alegre] Frase uno.', '[alegre] Frase dos.', '[alegre] Frase tres.'])
    expect(openInbox().some((i) => i.kind === 'script' && i.messageId === m.id)).toBe(true)
    expect(env.renders.length).toBe(0)
    expect(prompts.at(-1)).not.toContain('guion:repasar')

    const edited = m.scriptReview!.scenes.map((s, i) => (i === 1 ? { heading: 'Nuevo', narration: '[sorprendido] Otra frase.' } : s))
    expect(() => decideScriptReview(projectId, m.id, 'record', edited.map((s) => ({ ...s, narration: ' ' })))).toThrow(/vacía/)
    decideScriptReview(projectId, m.id, 'record', edited)
    await until(() => activeRunsFor(projectId).length === 0 && env.renders.length === 1)
    expect(env.renders[0].narrations).toEqual(['Frase uno.', 'Otra frase.', 'Frase tres.'])
    expect(env.renders[0].headings[1]).toBe('Nuevo')
    expect(card()?.scriptReview?.status).toBe('recorded')
    expect(openInbox().some((i) => i.kind === 'script' && i.messageId === m.id)).toBe(false)
    expect(() => decideScriptReview(projectId, m.id, 'record')).toThrow(/ya no espera/)
  })

  it('«Descartar» termina sin grabar', async () => {
    await sendMessage({ projectId, text: '/video guion:repasar los delfines', filePaths: [] })
    await until(() => card()?.scriptReview?.status === 'pending')
    decideScriptReview(projectId, card()!.id, 'dismiss')
    await until(() => activeRunsFor(projectId).length === 0)
    expect(env.renders.length).toBe(1)
    expect(card()?.scriptReview?.status).toBe('dismissed')
    expect(store.snapshotProject(projectId).messages.some((m) => m.text.startsWith('Descartaste el guion «Mi guion»'))).toBe(true)
  })
})
