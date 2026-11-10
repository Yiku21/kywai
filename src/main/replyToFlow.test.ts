// @vitest-environment node
// «Responder» bajo la respuesta de un agente: el mensaje va directo a ese mismo agente (sin Hermes) con su respuesta
// citada, retoma su sesión, y el chat enseña la cita encima de tu mensaje. Sin texto, le pide que la revise.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
vi.mock('./quota', () => ({ freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [], recordUsage: () => {}, setClaudeRateLimit: () => {} }))

import { loadConfig } from './config'
import { __setBackendsForChecks, activeRunsFor, sendMessage } from './orchestrator'
import * as store from './projects'
import { initUsageLog } from './usageLog'
import { initTaskTraces } from './taskTrace'
import { initInbox } from './inbox'
import { replyExcerpt, replyRequest } from '@shared/replyTo'

const calls: Array<{ agent: string; prompt: string }> = []
let projectId = ''

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-reply-'))
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
      calls.push({ agent: (o as { agentId?: string }).agentId ?? '', prompt: o.prompt })
      return { ok: true, text: 'Revisada: la cifra buena es 42.', usage: { input: 1, output: 1 } }
    }
  })
  projectId = store.listProjects()[0].id
  store.upsertMessage({ id: 'msg-claude', projectId, author: { type: 'agent', agentId: 'claude' }, text: 'El resultado del cálculo es **41**, sumando las tres partidas.', createdAt: Date.now() })
  store.upsertMessage({ id: 'msg-sys', projectId, author: { type: 'system' }, text: 'Aviso del sistema', createdAt: Date.now() })
})

async function settle(): Promise<void> {
  for (let i = 0; i < 200 && activeRunsFor(projectId).length > 0; i++) await new Promise((r) => setTimeout(r, 10))
}

describe('Responder a un agente', () => {
  it('el texto citado y lo que pides llegan al mismo agente', async () => {
    await sendMessage({ projectId, text: 'revisa la suma, creo que falta una partida', filePaths: [], replyTo: 'msg-claude' })
    await settle()
    const mine = store.snapshotProject(projectId).messages.filter((m) => m.author.type === 'user').at(-1)!
    expect(mine.text).toBe('revisa la suma, creo que falta una partida')
    expect(mine.direct?.agentId).toBe('claude')
    expect(mine.replyTo).toEqual({ messageId: 'msg-claude', agentId: 'claude', name: expect.any(String), excerpt: 'El resultado del cálculo es 41 , sumando las tres partidas.' })
    const task = store.snapshotProject(projectId).tasks.at(-1)!
    expect(task.agentId).toBe('claude')
    expect(task.direct).toBe(true)
    expect(task.continues).toBe(true)
    const prompt = calls.at(-1)!.prompt
    expect(prompt).toContain('El resultado del cálculo es **41**')
    expect(prompt).toContain('Lo que te pide ahora: revisa la suma, creo que falta una partida')
  })

  it('sin texto le pide que revise su respuesta', async () => {
    await sendMessage({ projectId, text: '', filePaths: [], replyTo: 'msg-claude' })
    await settle()
    const mine = store.snapshotProject(projectId).messages.filter((m) => m.author.type === 'user').at(-1)!
    expect(mine.text).toMatch(/^Revisa tu respuesta/)
    expect(calls.at(-1)!.prompt).toContain('Lo que te pide ahora: Revisa tu respuesta')
  })

  it('solo se responde a mensajes de un agente', async () => {
    await expect(sendMessage({ projectId, text: 'hola', filePaths: [], replyTo: 'msg-sys' })).rejects.toThrow(/No encuentro esa respuesta/)
    await expect(sendMessage({ projectId, text: 'hola', filePaths: [], replyTo: 'nada' })).rejects.toThrow(/No encuentro esa respuesta/)
  })
})

describe('replyTo (textos)', () => {
  it('la cita es una línea corta sin markdown ni código', () => {
    expect(replyExcerpt('# Título\n\n```js\nx()\n```\nTexto **fuerte** aquí')).toBe('Título Texto fuerte aquí')
    expect(replyExcerpt('a'.repeat(200)).length).toBe(90)
  })

  it('una respuesta muy larga se cita por el final', () => {
    const req = replyRequest(`${'x'.repeat(7000)}FINAL`, 'sigue')
    expect(req).toContain('recortada')
    expect(req).toContain('FINAL')
    expect(req.length).toBeLessThan(6400)
  })
})
