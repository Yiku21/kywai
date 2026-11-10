// @vitest-environment node
// Nota de voz enviada al momento: sale ya en el chat mientras se pasa a texto por detrás; con el texto, va al equipo
// como un mensaje normal en el mismo sitio del chat (mismo id). Si no se entiende, se queda marcada con un aviso.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '', said: [] as Array<string | Error>, release: null as null | (() => void) }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))
vi.mock('./voice', () => ({
  transcribeAudio: async () => {
    await new Promise<void>((r) => (env.release = r))
    const next = env.said.shift() ?? ''
    if (next instanceof Error) throw next
    return next
  }
}))

import { loadConfig } from './config'
import { __setBackendsForChecks, activeRunsFor, sendVoiceNote } from './orchestrator'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'
import { initInbox } from './inbox'

const prompts: string[] = []
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-voz-'))
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
      return { ok: true, text: 'Hecho.', usage: { input: 1, output: 1 } }
    }
  })
  projectId = store.listProjects()[0].id
})

async function until(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 10))
}
const messages = () => store.snapshotProject(projectId).messages

describe('nota de voz enviada al momento', () => {
  it('sale ya en el chat y, con el texto, va al agente en el mismo mensaje', async () => {
    env.said.push('revisa el informe y dime qué falta')
    const doc = join(env.root, 'informe.txt')
    writeFileSync(doc, 'datos')
    const { messageId } = sendVoiceNote({ projectId, audioPath: join(env.root, 'nota.wav'), language: 'es', text: '@Claude', filePaths: [doc] })
    const draft = messages().find((m) => m.id === messageId)!
    expect(draft.voiceNote).toBe('transcribing')
    expect(draft.attachments?.map((a) => a.name)).toEqual(['informe.txt'])
    await until(() => !!env.release)
    env.release!()
    env.release = null
    await until(() => messages().find((m) => m.id === messageId)?.voiceNote === 'sent')
    await until(() => activeRunsFor(projectId).length === 0)
    const mine = messages().filter((m) => m.id === messageId)
    expect(mine).toHaveLength(1)
    expect(mine[0].text).toBe('revisa el informe y dime qué falta')
    expect(mine[0].direct?.agentId).toBe('claude')
    expect(mine[0].attachments?.map((a) => a.name)).toEqual(['informe.txt'])
    expect(prompts.at(-1)).toContain('revisa el informe y dime qué falta')
    expect(messages().filter((m) => m.voiceNote === 'transcribing')).toHaveLength(0)
  })

  it('si no se entiende nada, se queda marcada y avisa', async () => {
    env.said.push('')
    const { messageId } = sendVoiceNote({ projectId, audioPath: join(env.root, 'nota2.wav') })
    await until(() => !!env.release)
    env.release!()
    env.release = null
    await until(() => messages().find((m) => m.id === messageId)?.voiceNote === 'failed')
    expect(messages().at(-1)).toMatchObject({ author: { type: 'system' }, tone: 'error', text: expect.stringMatching(/No se entendió nada/) })
  })

  it('si falla el dictado, el aviso dice por qué', async () => {
    env.said.push(new Error('sin modelo'))
    const { messageId } = sendVoiceNote({ projectId, audioPath: join(env.root, 'nota3.wav') })
    await until(() => !!env.release)
    env.release!()
    env.release = null
    await until(() => messages().find((m) => m.id === messageId)?.voiceNote === 'failed')
    expect(messages().at(-1)?.text).toMatch(/No se pudo pasar a texto la nota de voz: sin modelo/)
  })
})
