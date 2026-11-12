// @vitest-environment node
// «/demo <web>» de punta a punta con el agente simulado: kywai fotografía la web, el agente recibe las fichas de planos
// y las secciones y contesta en JSON, y kywai monta el vídeo en videos/.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({
  root: '',
  reply: '',
  shots: [] as string[],
  said: [] as { text: string; lang: string; voice?: string | null }[],
  renders: [] as { out: string; format: string; shots: string[]; mobile: boolean; secs: (number | undefined)[]; presenter: { image: string; cutout: boolean; voices: number } | null; repo: string | null; label?: string }[]
}))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))
vi.mock('./htmlShot', () => ({
  htmlToPng: async () => true,
  capturePage: async (url: string, out: string, opts: { mobile?: boolean } = {}) => {
    env.shots.push(`${opts.mobile ? 'móvil' : 'ordenador'} ${url}`)
    if (url.includes('caida')) return null
    writeFileSync(out, 'png')
    return { file: out, w: opts.mobile ? 780 : 1440, h: 5000, title: 'kywai', description: 'Agentes de IA', sections: [{ y: 0, h: 900, label: 'Inicio' }, { y: 900, h: 900, label: 'Cómo funciona' }], color: '#ff5e5b', background: '#ffffff' }
  }
}))
vi.mock('./webDemo', async (orig) => {
  const real = await orig<typeof import('./webDemo')>()
  return {
    ...real,
    fetchRepoFacts: async (r: { owner: string; repo: string }) => real.parseRepoFacts({ full_name: `${r.owner}/${r.repo}`, stargazers_count: 3812, license: { spdx_id: 'MIT' } }),
    renderDemo: async (input: {
      out: string
      format: string
      plan: { label?: string; shots: { ficha: string; secs?: number }[] }
      mobile: unknown
      presenter?: { image: string; cutout: boolean; voices: unknown[] } | null
      repo?: { name: string } | null
    }) => {
      mkdirSync(dirname(input.out), { recursive: true })
      writeFileSync(input.out, 'mp4')
      env.renders.push({
        out: input.out,
        format: input.format,
        shots: input.plan.shots.map((s) => s.ficha),
        mobile: !!input.mobile,
        secs: input.plan.shots.map((s) => s.secs),
        presenter: input.presenter ? { image: input.presenter.image, cutout: input.presenter.cutout, voices: input.presenter.voices.filter(Boolean).length } : null,
        repo: input.repo?.name ?? null,
        label: input.plan.label
      })
      return 21
    }
  }
})
vi.mock('./videoStudio', async (orig) => {
  const real = await orig<typeof import('./videoStudio')>()
  return {
    ...real,
    speakLine: async (text: string, lang: string, wav: string, voice?: string | null) => {
      env.said.push({ text, lang, voice })
      writeFileSync(wav, 'wav')
      return text.split(' ').length * 0.4
    }
  }
})
vi.mock('./videoCharacters', async (orig) => {
  const real = await orig<typeof import('./videoCharacters')>()
  return {
    ...real,
    videoCharacter: (id: string) => (id === 'robots-kywai' ? { id, name: 'robots', images: ['/r/hermes.png', '/r/claude.png', '/r/codex.png'], builtin: true } : null)
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
  env.root = mkdtempSync(join(tmpdir(), 'aicw-demo-'))
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
const snapshot = () => store.snapshotProject(projectId)
const lastText = () => snapshot().messages.filter((m) => m.author.type === 'agent').at(-1)?.text ?? ''

describe('/demo', () => {
  it('sin dirección la pide', async () => {
    await expect(sendMessage({ projectId, text: '/demo', filePaths: [] })).rejects.toThrow(/De qué web/)
  })

  it('fotografía la web, el agente hace el guion de planos y kywai monta el vídeo', async () => {
    env.reply = '{"title": "kywai en 20 segundos", "shots": [{"ficha": "portada", "text": "Tu equipo de IA"}, {"ficha": "acercamiento", "section": 1, "x": 0.5, "y": 0.5, "zoom": 2, "text": "Hermes planea"}, {"ficha": "movil", "text": "En el móvil"}, {"ficha": "cierre", "text": "Pruébalo gratis"}]}'
    await sendMessage({ projectId, text: '/demo kywai.app vertical que se vea el 3D', filePaths: [] })
    await until(() => activeRunsFor(projectId).length === 0 && env.renders.length > 0)
    expect(env.shots).toEqual(['ordenador https://kywai.app', 'móvil https://kywai.app'])
    expect(prompts.at(-1)).toContain('"acercamiento"')
    expect(prompts.at(-1)).toContain('1: Cómo funciona')
    expect(prompts.at(-1)).toContain('que se vea el 3D')
    const r = env.renders.at(-1)!
    expect(r).toMatchObject({ format: 'vertical', shots: ['portada', 'acercamiento', 'movil', 'cierre'], mobile: true })
    expect(r.out).toMatch(/videos[\\/]kywai-en-20-segundos-demo-vertical\.mp4$/)
    expect(existsSync(r.out)).toBe(true)
    expect(lastText()).toContain('«kywai en 20 segundos»: 4 planos, 21 s')
  })

  it('un repositorio de GitHub: sus datos al guion, Claude presenta con su voz y cada plano dura lo que su frase', async () => {
    env.reply = JSON.stringify({
      title: 'Repo del día',
      label: 'Repo de GitHub',
      shots: [
        { ficha: 'portada', text: 'IA en tu PC', say: 'Este repositorio te monta un estudio de IA en tu ordenador.' },
        { ficha: 'repo', say: 'Ya va por casi cuatro mil estrellas.' },
        { ficha: 'recorrido', from: 0, to: 1, say: 'Chat, imágenes y vídeo, todo junto.' },
        { ficha: 'cierre', text: 'Pruébalo', say: 'Guárdalo.' }
      ]
    })
    env.said = []
    await sendMessage({ projectId, text: '/demo https://github.com/a/estudio vertical presentador:claude', filePaths: [] })
    await until(() => activeRunsFor(projectId).length === 0 && env.renders.at(-1)?.repo === 'a/estudio')
    expect(prompts.at(-1)).toContain('3812 estrellas')
    expect(prompts.at(-1)).toContain('licencia MIT')
    expect(prompts.at(-1)).toContain('Presentador: Claude')
    const r = env.renders.at(-1)!
    expect(r).toMatchObject({ shots: ['portada', 'repo', 'recorrido', 'cierre'], presenter: { image: '/r/claude.png', cutout: true, voices: 4 }, label: 'REPO DE GITHUB' })
    expect(env.said.map((x) => x.text)).toEqual(['Este repositorio te monta un estudio de IA en tu ordenador.', 'Ya va por casi cuatro mil estrellas.', 'Chat, imágenes y vídeo, todo junto.', 'Guárdalo.'])
    // 11 palabras × 0,4 s de voz + el respiro: más que los 2,6 s de la ficha. «Guárdalo.» cabe en la ficha.
    expect(r.secs[0]).toBeCloseTo(4.4 + 0.25 + 0.45)
    expect(r.secs[3]).toBe(3)
    expect(snapshot().tasks.at(-1)!.title).toBe('Vídeo del repositorio a/estudio')
    expect(lastText()).toContain('Lo presenta Claude')
  })

  it('si la web no abre, la tarea falla y lo dice', async () => {
    const before = env.renders.length
    await sendMessage({ projectId, text: '/demo https://caida.example', filePaths: [] })
    await until(() => activeRunsFor(projectId).length === 0)
    expect(env.renders.length).toBe(before)
    const t = snapshot().tasks.at(-1)!
    expect(t.status).toBe('failed')
    expect(t.error).toMatch(/No pude fotografiar la web: No pude abrir https:\/\/caida\.example/)
  })
})
