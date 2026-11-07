// @vitest-environment node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { X509Certificate, createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { request as tlsRequest } from 'node:https'
import type { AddressInfo, Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import Ajv from 'ajv'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MobileChatReceipt, MobileEventEnvelope, MobileFolderFile, MobileSnapshot } from '@shared/mobile'
import type { Attachment, ChatMessage, UpdateStatus } from '@shared/types'
import { INTERRUPTED_ERROR } from '@shared/defaults'
import { getConfig, loadConfig, setAgentAccess, setAgentThinking, setPlanApproval, setUiTheme } from './config'
import { emit, setRuntime } from './events'
import { addMemory, deleteMemory, setInstructions, updateMemory } from './memory'
import { MAX_FILE_BYTES, __setFileLimitsForChecks } from './mobileFiles'
import { __setOrbitaReleaseDirForChecks } from './orbitaRelease'
import { __setBackendsForChecks, activeRunsFor, allAgents, approvePlan, cancelAll, getTaskChanges, undoTask, cancelRun, discardRun, rejectPlan, resetAgent, resumeRun, runtimeSnapshot, sendMessage } from './orchestrator'
import { actInbox, listInbox } from './inbox'
import * as store from './projects'
import * as conversations from './conversations'
import { selfSignedCert } from './selfCert'
import { flushTaskTraces, initTaskTraces } from './taskTrace'
import { flushUsageLog, initUsageLog, usageRuns } from './usageLog'
import { setClientReleaseDir, setFsAccess, startWebServer, stopWebServer, webMethods, withoutAccessCode } from './webServer'
import type { AccessEntry } from './serverFiles'
import { localIO, syncOnce } from './syncEngine'
import { connectRemote } from './syncRemote'
import { DEVICE_INACTIVE_MS, DeviceRegistry } from './devices'
import { createRoutine, initRoutines, runRoutineNow, stopRoutines } from './routines'

const env = vi.hoisted(() => ({ root: '' }))
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => env.root, getPath: () => env.root } }))
// Las pruebas no abren servicios en una Tailscale real ni lanzan consultas a proveedores.
vi.mock('node:os', async (original) => ({ ...await original<typeof import('node:os')>(), networkInterfaces: process.env.AI_COWORK_ANDROID_INTEGRATION === '1' ? (await original<typeof import('node:os')>()).networkInterfaces : () => ({}) }))
vi.mock('./quota', () => ({
  freshQuotaSnapshot: async () => ({}), latestQuotas: () => [], refreshQuotas: async () => [],
  recordUsage: () => {}, setClaudeRateLimit: () => {}
}))

const CODE = 'codigo-web-existente-123456'
const PREFIX = '/api/mobile/v1'
const openapi = JSON.parse(readFileSync(new URL('../../docs/mobile-api/openapi.json', import.meta.url), 'utf8'))
// Ajv ya está instalado y fijado en el lockfile del proyecto. Los formatos se validan contra OpenAPI.
const ajv = new Ajv({ strict: false, allowUnionTypes: true })
ajv.addFormat('date-time', (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)))
ajv.addSchema({ $id: 'urn:ai-cowork:mobile', components: openapi.components })
function schemaFormat(name: string, data: unknown): void {
  const validate = ajv.getSchema(`urn:ai-cowork:mobile#/components/schemas/${name}`)!
  expect(validate(data), JSON.stringify(validate.errors)).toBe(true)
}
let port: number
let base: string
let token: string
const peers: Socket[] = []
/** Encargos que reciben los agentes simulados (plan y tareas). */
const prompts: string[] = []

async function freePort(): Promise<number> {
  const srv = createServer()
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve))
  const result = (srv.address() as AddressInfo).port
  await new Promise<void>((resolve) => srv.close(() => resolve()))
  return result
}

async function api(path: string, data?: unknown, access = token): Promise<{ status: number; body: any }> {
  const res = await fetch(base + PREFIX + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...(access ? { Authorization: `Bearer ${access}` } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) })
  })
  const response = { status: res.status, body: await res.json() }
  if (res.status >= 400) schemaFormat('Error', response.body)
  else {
    const route = PREFIX + path.split('?')[0].replace(/\/requests\/[^/]+\//, '/requests/{requestId}/').replace(/^\/tasks\/[^/]+\//, '/tasks/{taskId}/').replace(/^\/memory\/[^/]+/, '/memory/{memoryId}').replace(/^\/plans\/[^/]+\//, '/plans/{messageId}/').replace(/^\/agents\/[^/]+\//, '/agents/{agentId}/').replace(/^\/inbox\/[^/]+\/[^/]+$/, '/inbox/{id}/{actionId}').replace(/^\/routines\/[^/]+\//, '/routines/{routineId}/').replace(/^\/chats\/[^/]+\//, '/chats/{chatId}/')
    const operation = openapi.paths[route][data === undefined ? 'get' : 'post']
    const schemaName = operation.responses[String(res.status)].content['application/json'].schema.$ref.split('/').at(-1)
    schemaFormat(schemaName, response.body)
  }
  return response
}

function errorFormat(data: unknown): void {
  schemaFormat('Error', data)
  expect(data).toEqual({ code: expect.any(String), message: expect.any(String), retryable: expect.any(Boolean) })
}

/** Rutas que no devuelven JSON (archivos) o no lo envían (subida). Los errores sí son JSON. */
async function raw(path: string, init: RequestInit = {}, access = token): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const res = await fetch(base + PREFIX + path, { ...init, headers: { ...(access ? { Authorization: `Bearer ${access}` } : {}), ...(init.headers as Record<string, string> | undefined) } })
  const body = Buffer.from(await res.arrayBuffer())
  if (res.status >= 400) errorFormat(JSON.parse(body.toString()))
  return { status: res.status, headers: res.headers, body }
}

interface Frame { opcode: number; payload: Buffer }
async function websocket(access: string | null, options: { path?: string; headers?: Record<string, string>; ca?: string } = {}): Promise<{ status: number; body?: any; socket?: Socket; frames: Frame[]; accept?: string; key: string }> {
  const key = randomBytes(16).toString('base64')
  return new Promise((resolve, reject) => {
    const httpRequest = options.ca ? tlsRequest : request
    const req = httpRequest({
      hostname: '127.0.0.1', port: port + (options.ca ? 1 : 0), path: options.path ?? `${PREFIX}/events`,
      ...(options.ca ? { ca: options.ca } : {}),
      headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13', ...(access ? { Authorization: `Bearer ${access}` } : {}), ...options.headers }
    })
    req.on('response', (res) => {
      let text = ''
      res.on('data', (chunk) => { text += String(chunk) })
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(text), frames: [], key }))
    })
    req.on('upgrade', (res, socket, head) => {
      peers.push(socket)
      const frames: Frame[] = []
      let pending = Buffer.alloc(0)
      const parse = (chunk: Buffer): void => {
        pending = Buffer.concat([pending, chunk])
        while (pending.length >= 2) {
          const short = pending[1] & 127
          const header = short < 126 ? 2 : short === 126 ? 4 : 10
          if (pending.length < header) return
          const length = short < 126 ? short : short === 126 ? pending.readUInt16BE(2) : Number(pending.readBigUInt64BE(2))
          if (pending.length < header + length) return
          frames.push({ opcode: pending[0] & 15, payload: Buffer.from(pending.subarray(header, header + length)) })
          pending = pending.subarray(header + length)
        }
      }
      socket.on('data', parse)
      socket.on('error', () => {})
      parse(head)
      resolve({ status: 101, socket, frames, accept: res.headers['sec-websocket-accept'] as string, key })
    })
    req.on('error', reject)
    req.end()
  })
}

function received(frames: Frame[], type: string): MobileEventEnvelope[] {
  return frames.filter((f) => f.opcode === 1).map((f) => JSON.parse(f.payload.toString()) as MobileEventEnvelope).filter((e) => e.type === type)
}

function maskedFrame(opcode: number, text = ''): Buffer {
  const data = Buffer.from(text)
  const mask = randomBytes(4)
  const output = Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | data.length]), mask, data])
  for (let i = 0; i < data.length; i++) output[6 + i] ^= mask[i % 4]
  return output
}

async function event(frames: Frame[], type: string): Promise<MobileEventEnvelope> {
  let found: MobileEventEnvelope | undefined
  await vi.waitFor(() => {
    found = frames.filter((f) => f.opcode === 1).map((f) => JSON.parse(f.payload.toString()) as MobileEventEnvelope).find((e) => e.type === type)
    expect(found).toBeDefined()
  })
  expect(found).toEqual({ type, sequence: expect.any(Number), payload: expect.any(Object) })
  schemaFormat('EventEnvelope', found)
  expect(Number.isSafeInteger(found!.sequence)).toBe(true)
  return found!
}

beforeAll(() => {
  env.root = mkdtempSync(join(tmpdir(), 'aicw-mobile-'))
  const cfg = loadConfig()
  cfg.agents = cfg.agents.filter((a) => a.id === 'codex').map((a) => ({ ...a, enabled: true, lightModel: undefined }))
  cfg.plannerOrder = ['codex']
  cfg.stations = cfg.stations.filter((s) => !s.forSubagents)
  // Las pruebas de siempre ejecutan el plan al momento; la del visto bueno lo activa.
  cfg.planApproval = false
  store.initProjects(cfg.workspaceRoot)
  store.ensureFirstProject()
  initUsageLog(cfg.workspaceRoot)
  initTaskTraces(cfg.workspaceRoot)
  __setBackendsForChecks({
    presence: async () => null,
    run: async (o) => {
      prompts.push(o.prompt)
      if (o.mode === 'plan') return { ok: true, text: JSON.stringify({ reply: 'Plan', tasks: [{ key: 't1', title: 'Prueba móvil', description: 'Trabajo de prueba', agent: 'codex', difficulty: 'medium', dependsOn: [], deliverable: 'text' }] }), usage: { input: 1, output: 1 } }
      return new Promise((resolve) => {
        const completion = process.env.AI_COWORK_ANDROID_INTEGRATION === '1' ? setTimeout(() => {
          o.onText?.('Resultado real de integración')
          resolve({ ok: true, text: 'Resultado real de integración\n\n## Para la memoria\n- hecho: Memoria recibida en vivo', usage: { input: 12, output: 8 } })
        }, 2_000) : undefined
        o.signal.addEventListener('abort', () => clearTimeout(completion), { once: true })
        const abort = (): void => resolve({ ok: false, text: '', errorKind: 'cancelled', usage: { input: 0, output: 0 } })
        if (o.signal.aborted) abort()
        else o.signal.addEventListener('abort', abort, { once: true })
      })
    }
  })
  webMethods.set('getConfig', getConfig)
  webMethods.set('listProjects', store.listProjects)
  webMethods.set('createProject', (name) => store.createProject(name as string))
  webMethods.set('loadProject', (id) => {
    const active = activeRunsFor(id as string)
    return { ...store.snapshotProject(id as string), activeRunId: active.at(-1), activeRunIds: active }
  })
  webMethods.set('getRuntime', () => ({ runtimes: runtimeSnapshot(), quotas: [] }))
  // Chats de cada proyecto: igual que index.ts, sin la comprobación de «el equipo está trabajando».
  webMethods.set('listConversations', (id) => conversations.listConversations(id as string))
  webMethods.set('newConversation', (id) => conversations.newConversation(id as string))
  webMethods.set('openConversation', (id, cid) => conversations.openConversation(id as string, cid as string))
  webMethods.set('renameConversation', (id, cid, title) => { conversations.renameConversation(id as string, cid as string, title); return conversations.listConversations(id as string) })
  webMethods.set('deleteConversation', (id, cid) => { conversations.deleteConversation(id as string, cid as string); return conversations.listConversations(id as string) })
  webMethods.set('search', (q, id) => conversations.search(q, id))
  webMethods.set('getUsageRuns', usageRuns)
  webMethods.set('sendMessage', (input) => sendMessage(input as Parameters<typeof sendMessage>[0]))
  webMethods.set('mobileStopRun', (id) => cancelRun(id as string, 'pause'))
  webMethods.set('resumeRun', (id, runId) => resumeRun(id as string, runId as string))
  webMethods.set('mobileDiscardRun', (id, runId) => discardRun(id as string, runId as string))
  // Igual que index.ts.
  webMethods.set('mobileRunningProjects', () => store.listProjects().filter((p) => activeRunsFor(p.id).length).map((p) => p.id))
  webMethods.set('resetAgent', (id) => resetAgent(id as string))
  webMethods.set('setAgentThinking', (id, enabled) => {
    setAgentThinking(id, enabled)
    emit({ kind: 'config.updated', config: getConfig() })
  })
  webMethods.set('addMemory', (id, input) => addMemory(id as string, input as Parameters<typeof addMemory>[1], { status: 'confirmed', by: 'user', byName: 'Tú' }))
  webMethods.set('updateMemory', (id, memoryId, patch) => updateMemory(id as string, memoryId as string, patch as Parameters<typeof updateMemory>[2]))
  webMethods.set('deleteMemory', (id, memoryId) => deleteMemory(id as string, memoryId as string))
  webMethods.set('setInstructions', (id, text) => setInstructions(id as string, text as string))
  webMethods.set('setAgentAccess', (access) => {
    setAgentAccess(access as 'full' | 'project')
    emit({ kind: 'config.updated', config: getConfig() })
  })
  webMethods.set('approvePlan', (id, messageId) => approvePlan(id as string, messageId as string))
  webMethods.set('rejectPlan', (id, messageId) => rejectPlan(id as string, messageId as string))
  webMethods.set('listInbox', () => listInbox())
  webMethods.set('actInbox', (id, actionId) => actInbox(id as string, actionId as string))
  webMethods.set('getTaskChanges', (id, taskId) => getTaskChanges(id as string, taskId as string))
  webMethods.set('undoTask', (id, taskId) => undoTask(id as string, taskId as string))
  webMethods.set('setPlanApproval', (on) => {
    setPlanApproval(on as boolean)
    emit({ kind: 'config.updated', config: getConfig() })
  })
})

beforeEach(async () => {
  port = await freePort()
  base = `http://127.0.0.1:${port}`
  await startWebServer(port, CODE, undefined, allAgents)
  const pair = await api('/pair', { code: CODE, deviceName: 'Pixel de prueba' }, '')
  token = pair.body.accessToken
})

afterEach(async () => {
  for (const peer of peers.splice(0)) peer.destroy()
  cancelAll()
  await stopWebServer()
  store.flushAll()
  flushUsageLog()
  flushTaskTraces()
})

afterAll(() => rmSync(env.root, { recursive: true, force: true }))

describe('API móvil integrada con el servidor y el motor existentes', () => {
  it('empareja con el código actual y devuelve el formato documentado', async () => {
    const result = await api('/pair', { code: CODE, deviceName: 'Android' }, '')
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ accessToken: expect.any(String), expiresAt: expect.any(String), serverName: expect.any(String) })
    expect(new Date(result.body.expiresAt).toISOString()).toBe(result.body.expiresAt)
    const invalid = await api('/pair', { code: 'incorrecto', deviceName: 'Android' }, '')
    expect(invalid.status).toBe(401)
    errorFormat(invalid.body)
  })

  const GET_ROUTES = ['/snapshot', '/events', '/projects', '/tasks/abc/trace', '/artifacts/abc/raw?conversationId=x', '/files?conversationId=x', '/files/raw?conversationId=x&source=folder&path=a']
  it.each([
    ...GET_ROUTES, '/chat/messages', '/conversations', '/requests/abc/stop', '/requests/abc/resume', '/requests/abc/discard', '/memory', '/memory/m1', '/memory/m1/delete',
    '/instructions', '/files?conversationId=x&name=a.txt', '/settings/agent-access', '/usage/refresh', '/voice/transcribe',
    '/plans/abc/approve', '/plans/abc/reject', '/settings/plan-approval', '/server/update'
  ])('exige Bearer en %s', async (path) => {
    const result = await api(path, GET_ROUTES.includes(path) ? undefined : {}, '')
    expect(result.status).toBe(401)
    errorFormat(result.body)
  })

  it('rechaza el código web y las cookies en rutas móviles y conserva la API web', async () => {
    expect((await api('/snapshot', undefined, CODE)).status).toBe(401)
    const cookie = await fetch(base + PREFIX + '/snapshot', { headers: { Cookie: `cowork_token=${CODE}` } })
    expect(cookie.status).toBe(401)
    const web = await fetch(base + '/api/call/listProjects', { method: 'POST', headers: { Authorization: `Bearer ${CODE}` }, body: '{}' })
    expect(web.status).toBe(200)
    expect(((await web.json()) as { result: unknown }).result).toEqual(store.listProjects())
    const mobileForWeb = await fetch(base + '/api/call/listProjects', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' })
    expect(mobileForWeb.status).toBe(401)
  })

  it('crea una conversación en el almacén existente y proyecta agentes, tareas, memoria y consumo actuales', async () => {
    const created = await api('/conversations', {})
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ conversation: { id: expect.any(String), title: 'Conversación móvil', createdAt: expect.any(Number), messages: [], artifacts: [], instructions: '', activeRequestId: null, activeRequestIds: [], attachments: [], folder: null, chat: null } })
    addMemory(created.body.conversation.id, { kind: 'fact', text: 'Memoria compartida' }, { status: 'confirmed', by: 'user', byName: 'Tú' })
    const snapshot = await api(`/snapshot?conversationId=${created.body.conversation.id}`)
    expect(snapshot.status).toBe(200)
    const state = snapshot.body as MobileSnapshot
    expect(state.conversation.id).toBe(created.body.conversation.id)
    expect(state.memory).toEqual(store.snapshotProject(created.body.conversation.id).memory)
    expect(state.agents[0]).toMatchObject({ id: 'codex', agentId: 'codex', activity: expect.any(String) })
    expect(state.usage).toMatchObject({ runs: usageRuns(), quotas: [], totals: { input: expect.any(Number), output: expect.any(Number), cached: expect.any(Number) }, byAgent: expect.any(Array) })
    expect(state.capabilities).toMatchObject({ apiVersion: 'v1', events: 'websocket', stop: true, resume: true, eventSequence: expect.any(Number) })
    expect(JSON.stringify(state)).not.toContain(CODE)
  })

  it('varios chats por proyecto: lista, nuevo, volver, renombrar, borrar y buscar', async () => {
    const project = store.createProject('Chats del móvil')
    const st = store.getProject(project.id)
    st.messages.push({ id: 'm-chat-1', projectId: project.id, author: { type: 'user', name: 'Tú' }, text: 'Revisa la ficha de seguridad', createdAt: Date.now() } as ChatMessage)
    const first = await api(`/chats?conversationId=${project.id}`)
    expect(first.status).toBe(200)
    schemaFormat('ChatsResponse', first.body)
    const original = first.body.chats.find((c: { current?: boolean }) => c.current)
    expect(original).toMatchObject({ messageCount: 1 })

    const fresh = await api('/chats', { conversationId: project.id })
    expect(fresh.status).toBe(200)
    schemaFormat('ConversationResponse', fresh.body)
    expect(fresh.body.conversation.messages).toEqual([])
    expect(fresh.body.conversation.chat.id).not.toBe(original.id)

    const listed = await api(`/chats?conversationId=${project.id}`)
    expect(listed.body.chats.map((c: { id: string }) => c.id)).toContain(original.id)

    const renamed = await api(`/chats/${original.id}/rename`, { conversationId: project.id, title: 'Fichas CLP' })
    expect(renamed.status).toBe(200)
    expect(renamed.body.chats.find((c: { id: string }) => c.id === original.id).title).toBe('Fichas CLP')

    const found = await api(`/search?q=${encodeURIComponent('ficha de seguridad')}`)
    expect(found.status).toBe(200)
    schemaFormat('SearchResponse', found.body)
    expect(found.body.hits.some((h: { projectId: string }) => h.projectId === project.id)).toBe(true)

    const back = await api(`/chats/${original.id}/open`, { conversationId: project.id })
    expect(back.status).toBe(200)
    expect(back.body.conversation.messages.map((m: { text: string }) => m.text)).toEqual(['Revisa la ficha de seguridad'])
    expect(back.body.conversation.chat).toEqual({ id: original.id, title: 'Fichas CLP' })

    const openOne = await api(`/chats/${original.id}/delete`, { conversationId: project.id })
    expect(openOne.status).toBe(409)
    expect(openOne.body.code).toBe('CHAT_OPEN')
    const missing = await api(`/chats/c-no-existe/open`, { conversationId: project.id })
    expect(missing.status).toBe(404)
    expect((await api('/chats/..%2Fx/open', { conversationId: project.id })).status).toBe(400)
    expect((await api(`/chats?conversationId=${project.id}&otro=1`)).status).toBe(400)
  })

  it('envía y deduplica reintentos concurrentes, persiste clientMessageId y rechaza reutilizarlo con otro texto', async () => {
    const conversation = (await api('/conversations', {})).body.conversation.id as string
    const data = { conversationId: conversation, text: 'Haz el trabajo', clientMessageId: 'client-1' }
    const results = await Promise.all([api('/chat/messages', data), api('/chat/messages', data)])
    expect(results.map((r) => r.status)).toEqual([202, 202])
    expect(results[0].body).toEqual(results[1].body)
    expect(results[0].body).toEqual({ conversationId: conversation, requestId: expect.any(String), clientMessageId: 'client-1', message: expect.objectContaining({ clientMessageId: 'client-1', conversationId: conversation, author: { type: 'user' }, text: 'Haz el trabajo' }) })
    const messages = store.snapshotProject(conversation).messages.filter((m) => m.clientMessageId === 'client-1')
    expect(messages).toHaveLength(1)
    store.flushAll()
    const persisted = JSON.parse(readFileSync(join(store.projectDir(conversation), 'project.json'), 'utf8'))
    expect(persisted.messages.filter((m: { clientMessageId?: string }) => m.clientMessageId === 'client-1')).toHaveLength(1)
    const conflict = await api('/chat/messages', { ...data, text: 'Otra cosa' })
    expect(conflict.status).toBe(409)
    expect(conflict.body.code).toBe('CLIENT_MESSAGE_CONFLICT')
    errorFormat(conflict.body)
    await api('/conversations', {})
    expect((await api('/chat/messages', { ...data, conversationId: null })).body).toEqual(results[0].body)
  })

  it('detiene y reanuda las mismas tareas y petición; cancelar desde escritorio sigue siendo definitivo', async () => {
    const conversation = (await api('/conversations', {})).body.conversation.id as string
    const receipt = (await api('/chat/messages', { conversationId: conversation, text: 'Trabajo reanudable', clientMessageId: 'client-pause' })).body as MobileChatReceipt
    await vi.waitFor(() => expect(store.snapshotProject(conversation).tasks.some((t) => t.runId === receipt.requestId && t.status === 'running')).toBe(true))
    const before = store.snapshotProject(conversation).tasks.map((t) => t.id)
    const stopped = await api(`/requests/${receipt.requestId}/stop`, {})
    expect(stopped).toEqual({ status: 200, body: { requestId: receipt.requestId, conversationId: conversation, status: 'stopped' } })
    expect(store.snapshotProject(conversation).tasks).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'cancelled', error: INTERRUPTED_ERROR })]))
    expect((await api(`/requests/${receipt.requestId}/stop`, {})).status).toBe(200)
    const resumed = await api(`/requests/${receipt.requestId}/resume`, {})
    expect(resumed).toEqual({ status: 200, body: { requestId: receipt.requestId, conversationId: conversation, status: 'running' } })
    expect(store.snapshotProject(conversation).tasks.map((t) => t.id)).toEqual(before)
    expect((await api(`/requests/${receipt.requestId}/resume`, {})).status).toBe(200)
    cancelRun(receipt.requestId)
    const definitive = await api(`/requests/${receipt.requestId}/resume`, {})
    expect(definitive.status).toBe(409)
    errorFormat(definitive.body)
  })

  it('quita lo que quedó en pausa: deja de poder reanudarse y no se quita con la petición en marcha', async () => {
    const conversation = (await api('/conversations', {})).body.conversation.id as string
    const receipt = (await api('/chat/messages', { conversationId: conversation, text: 'Trabajo que no quiero seguir', clientMessageId: 'client-discard' })).body as MobileChatReceipt
    await vi.waitFor(() => expect(store.snapshotProject(conversation).tasks.some((t) => t.runId === receipt.requestId && t.status === 'running')).toBe(true))
    const running = await api(`/requests/${receipt.requestId}/discard`, {})
    expect(running.status).toBe(409)
    errorFormat(running.body)
    await api(`/requests/${receipt.requestId}/stop`, {})
    const discarded = await api(`/requests/${receipt.requestId}/discard`, {})
    expect(discarded).toEqual({ status: 200, body: { requestId: receipt.requestId, conversationId: conversation, status: 'discarded' } })
    const tasks = store.snapshotProject(conversation).tasks.filter((t) => t.runId === receipt.requestId)
    expect(tasks.some((t) => t.error === INTERRUPTED_ERROR)).toBe(false)
    expect(tasks).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'cancelled', error: 'Cancelada por el usuario' })]))
    expect((await api(`/requests/${receipt.requestId}/resume`, {})).status).toBe(409)
    expect((await api(`/requests/${receipt.requestId}/discard`, {})).status).toBe(409)
  })

  it.each([
    ['/pair', { code: '', deviceName: 'Pixel' }],
    ['/pair', { code: CODE, deviceName: 12 }],
    ['/pair', { code: CODE, deviceName: 'Pixel', unexpected: true }],
    ['/conversations', { name: '' }],
    ['/conversations', { name: 'x'.repeat(121) }],
    ['/conversations', { name: 12 }],
    ['/conversations', { title: 'Otro campo' }],
    ['/chat/messages', { conversationId: null, text: 'Hola', clientMessageId: 'x', attachmentIds: 'a' }],
    ['/chat/messages', { conversationId: null, text: 'Hola', clientMessageId: 'x', attachmentIds: ['../a'] }],
    ['/chat/messages', { conversationId: null, text: 'Hola', clientMessageId: 'x', attachmentIds: Array.from({ length: 21 }, (_, i) => `a${i}`) }],
    ['/memory', { conversationId: 'proyecto', kind: 'fact' }],
    ['/memory', { conversationId: null, kind: 'fact', text: 'Texto válido' }],
    ['/memory', { conversationId: 'proyecto', kind: 'otro', text: 'Texto válido' }],
    ['/memory', { conversationId: 'proyecto', kind: 'fact', text: ' ab ' }],
    ['/memory', { conversationId: 'proyecto', kind: 'fact', text: 'x'.repeat(2001) }],
    ['/memory/m1', { conversationId: 'proyecto' }],
    ['/memory/m1', { conversationId: 'proyecto', status: 'borrado' }],
    ['/memory/m.1', { conversationId: 'proyecto', status: 'confirmed' }],
    ['/memory/m1/delete', { conversationId: 'proyecto', extra: 1 }],
    ['/instructions', { conversationId: 'proyecto', text: 'x'.repeat(8001) }],
    ['/instructions', { conversationId: 'proyecto' }],
    ['/settings/agent-access', { access: 'todo' }],
    ['/settings/plan-approval', { enabled: 'sí' }],
    ['/plans/m1/approve', {}],
    ['/plans/m1/reject', { conversationId: 'proyecto', extra: 1 }],
    ['/plans/m.1/approve', { conversationId: 'proyecto' }],
    ['/usage/refresh', { force: true }],
    ['/chat/messages', { conversationId: null, text: 'Hola' }],
    ['/chat/messages', { conversationId: '../escape', text: 'Hola', clientMessageId: 'x' }],
    ['/chat/messages', { conversationId: null, text: ' ', clientMessageId: 'x' }],
    ['/chat/messages', { conversationId: null, text: 'x'.repeat(50_001), clientMessageId: 'x' }],
    ['/chat/messages', { conversationId: null, text: 'Hola', clientMessageId: '../x' }],
    ['/requests/abc/stop', []]
  ])('valida el cuerpo de %s', async (path, input) => {
    const result = await api(path as string, input)
    expect(result.status).toBe(400)
    errorFormat(result.body)
  })

  it('devuelve errores uniformes para JSON, método, tipo, tamaño y recursos desconocidos', async () => {
    for (const [body, contentType, status] of [['{', 'application/json', 400], ['{}', 'text/plain', 415], ['x'.repeat(270_000), 'application/json', 413]] as const) {
      const res = await fetch(base + PREFIX + '/conversations', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body })
      expect(res.status).toBe(status)
      errorFormat(await res.json())
    }
    for (const [path, data, status] of [['/conversations', undefined, 405], ['/desconocido', undefined, 404], ['/snapshot?conversationId=missing', undefined, 404], ['/snapshot?foo=bar', undefined, 400], ['/requests/missing/resume', {}, 404], ['/events', undefined, 426]] as const) {
      const res = await api(path, data)
      expect(res.status).toBe(status)
      errorFormat(res.body)
    }
  })

  it('indica los métodos admitidos de cada ruta nueva', async () => {
    const put = await fetch(base + PREFIX + '/files?conversationId=x', { method: 'PUT', headers: { Authorization: `Bearer ${token}` } })
    expect([put.status, put.headers.get('allow')]).toEqual([405, 'GET, POST'])
    errorFormat(await put.json())
    for (const [path, data] of [['/projects', {}], ['/memory', undefined], ['/files/raw?conversationId=x&source=folder&path=a', {}], ['/usage/refresh', undefined]] as const) {
      const result = await api(path, data)
      expect([path, result.status]).toEqual([path, 405])
    }
  })

  it('limita también cuerpos chunked y rechaza JSON comprimido', async () => {
    const chunked = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: PREFIX + '/conversations', method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, (res) => {
        let text = ''
        res.on('data', (chunk) => { text += String(chunk) })
        res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(text) }))
      })
      req.on('error', reject)
      req.write('x'.repeat(140_000))
      req.end('x'.repeat(140_000))
    })
    expect(chunked.status).toBe(413)
    errorFormat(chunked.body)
    const compressed = await fetch(base + PREFIX + '/conversations', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: '{}' })
    expect(compressed.status).toBe(415)
    errorFormat(await compressed.json())
  })

  it('mantiene los errores internos uniformes sin revelar excepciones', async () => {
    const original = webMethods.get('getUsageRuns')!
    webMethods.set('getUsageRuns', () => { throw new Error('secret-ruta-interna') })
    try {
      const result = await api('/snapshot')
      expect(result.status).toBe(500)
      expect(result.body).toEqual({ code: 'INTERNAL_ERROR', message: 'No se pudo completar la operación', retryable: true })
    } finally { webMethods.set('getUsageRuns', original) }
  })

  it('proyecta los eventos de consumo en los totales que utiliza Android', async () => {
    const client = await websocket(token)
    const original = webMethods.get('getUsageRuns')!
    const run = { runId: 'usage-run', projectId: 'project-1', projectName: 'Prueba', request: 'Trabajo', startedAt: Date.now(), status: 'running' as const, tasks: 1, tasksDone: 0, calls: [{ ts: Date.now(), kind: 'task' as const, agentId: 'codex', agentName: 'Codex', provider: 'codex' as const, input: 10, output: 20, cached: 3, durationMs: 25, ok: true }] }
    webMethods.set('getUsageRuns', () => [run])
    try {
      emit({ kind: 'usage.run', run })
      const update = await event(client.frames, 'usage.updated')
      schemaFormat('Usage', update.payload.usage)
      expect(update.payload.usage).toMatchObject({ totals: { input: 10, output: 20, cached: 3 }, byAgent: [{ agentId: 'codex', input: 10, output: 20 }] })
    } finally { webMethods.set('getUsageRuns', original) }
  })

  it('preserva la entrega SSE web incluso si falla la proyección móvil', async () => {
    const original = webMethods.get('getUsageRuns')!
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    let stream: import('node:http').IncomingMessage | undefined
    const pending = new Promise<string>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path: '/api/events', headers: { Authorization: `Bearer ${CODE}` } }, (res) => {
        stream = res
        let text = ''
        res.on('data', (chunk) => {
          text += String(chunk)
          if (text.includes('usage.run')) resolve(text)
        })
      })
      req.on('error', reject)
      req.end()
    })
    try {
      await vi.waitFor(() => expect(stream).toBeDefined())
      webMethods.set('getUsageRuns', () => { throw new Error('Fallo de proyección') })
      emit({ kind: 'usage.run', run: { runId: 'sse-test', projectId: 'project-1', projectName: 'Prueba', request: 'Trabajo', startedAt: Date.now(), status: 'running', tasks: 0, tasksDone: 0, calls: [] } })
      expect(await pending).toContain('"kind":"usage.run"')
      expect(log).toHaveBeenCalled()
    } finally {
      stream?.destroy()
      webMethods.set('getUsageRuns', original)
      log.mockRestore()
    }
  })

  it('limita intentos de emparejamiento incorrectos', async () => {
    for (let i = 0; i < 10; i++) expect((await api('/pair', { code: 'incorrecto', deviceName: 'Pixel' }, '')).status).toBe(401)
    const result = await api('/pair', { code: CODE, deviceName: 'Pixel' }, '')
    expect(result.status).toBe(429)
    expect(result.body.retryable).toBe(true)
  })

  it('con la clave guardada el móvil sigue emparejado al reiniciar; un código de acceso nuevo lo desempareja', async () => {
    const key = Buffer.alloc(32, 7)
    await startWebServer(port, CODE, undefined, allAgents, key)
    const paired = (await api('/pair', { code: CODE, deviceName: 'Pixel' }, '')).body.accessToken
    // Reinicio de kywai (o actualización): misma clave, mismo código.
    await startWebServer(port, CODE, undefined, allAgents, key)
    expect((await api('/snapshot', undefined, paired)).status).toBe(200)
    // «Generar un código nuevo»: los móviles tienen que volver a emparejarse.
    await startWebServer(port, `${CODE}-nuevo`, undefined, allAgents, key)
    expect((await api('/snapshot', undefined, paired)).status).toBe(401)
    // Sin clave guardada, las credenciales solo valen mientras dura el servidor.
    const oldToken = token
    await startWebServer(port, CODE, undefined, allAgents)
    expect((await api('/snapshot', undefined, oldToken)).status).toBe(401)
  })

  it('cada dispositivo tiene su identificador y se revoca sin tocar los demás', async () => {
    const devices = new DeviceRegistry(null)
    await startWebServer(port, CODE, undefined, allAgents, Buffer.alloc(32, 9), devices)
    const phone = await api('/pair', { code: CODE, deviceName: 'Pixel' }, '')
    const client = await api('/pair', { code: CODE, deviceName: 'MacBook', kind: 'client', platform: 'darwin' }, '')
    expect(phone.body.deviceId).toEqual(expect.any(String))
    expect(devices.list().map((d) => [d.name, d.kind]).sort()).toEqual([['MacBook', 'client'], ['Pixel', 'mobile']])

    const me = await api('/device', undefined, client.body.accessToken)
    expect(me.body.device).toMatchObject({ name: 'MacBook', kind: 'client', platform: 'darwin' })

    // El móvil cierra su propia sesión: deja de valer, el cliente sigue.
    expect((await api('/device/revoke', {}, phone.body.accessToken)).body).toEqual({ revoked: true })
    const after = await api('/snapshot', undefined, phone.body.accessToken)
    expect(after.status).toBe(401)
    expect(after.body.code).toBe('DEVICE_REVOKED')
    expect((await api('/snapshot', undefined, client.body.accessToken)).status).toBe(200)

    // Revocarlo desde el servidor tampoco afecta a otros.
    expect(devices.revoke(client.body.deviceId)).toBe(true)
    expect((await api('/snapshot', undefined, client.body.accessToken)).status).toBe(401)
  })

  it('un dispositivo que lleva mucho sin usarse deja de valer', async () => {
    let now = Date.now()
    const devices = new DeviceRegistry(null, () => now)
    await startWebServer(port, CODE, undefined, allAgents, Buffer.alloc(32, 9), devices)
    const paired = (await api('/pair', { code: CODE, deviceName: 'Portátil', kind: 'client' }, '')).body.accessToken
    expect((await api('/snapshot', undefined, paired)).status).toBe(200)
    now += DEVICE_INACTIVE_MS + 1000
    const stale = await api('/snapshot', undefined, paired)
    expect(stale.status).toBe(401)
    expect(stale.body.code).toBe('DEVICE_REVOKED')
  })

  it('un emparejamiento anterior a la lista sigue valiendo y se explica cómo quitarlo', async () => {
    await startWebServer(port, CODE, undefined, allAgents, Buffer.alloc(32, 9))
    const legacy = (await api('/pair', { code: CODE, deviceName: 'Pixel' }, '')).body
    expect(legacy.deviceId).toBeUndefined()
    expect((await api('/device', undefined, legacy.accessToken)).body).toEqual({ device: null })
    const revoke = await api('/device/revoke', {}, legacy.accessToken)
    expect(revoke.status).toBe(409)
    expect(revoke.body.code).toBe('LEGACY_DEVICE')
    expect((await api('/snapshot', undefined, legacy.accessToken)).status).toBe(200)
  })

  it('un cliente de escritorio emparejado entra en la interfaz web con su llave y un móvil no', async () => {
    const devices = new DeviceRegistry(null)
    await startWebServer(port, CODE, undefined, allAgents, Buffer.alloc(32, 9), devices)
    const client = (await api('/pair', { code: CODE, deviceName: 'Portátil', kind: 'client', platform: 'win32' }, '')).body
    const phone = (await api('/pair', { code: CODE, deviceName: 'Pixel' }, '')).body
    const ping = (access: string | null, cookie = false): Promise<Response> =>
      fetch(base + '/api/ping', { headers: access ? (cookie ? { Cookie: `cowork_token=${access}` } : { Authorization: `Bearer ${access}` }) : {} })

    expect((await ping(client.accessToken)).status).toBe(200)
    expect((await ping(client.accessToken, true)).status).toBe(200)
    // El móvil solo usa la API móvil: su llave no abre la interfaz web ni sus funciones.
    expect((await ping(phone.accessToken)).status).toBe(401)
    expect((await ping(null)).status).toBe(401)
    expect((await ping('x.y')).status).toBe(401)
    // El código de acceso de siempre (navegador) sigue valiendo.
    expect((await ping(CODE)).status).toBe(200)

    // Revocarlo lo deja fuera de la interfaz web igual que de la API móvil.
    expect(devices.revoke(client.deviceId)).toBe(true)
    expect((await ping(client.accessToken)).status).toBe(401)
    expect((await ping(client.accessToken, true)).status).toBe(401)
  })

  it('un cliente emparejado no ve el código de acceso por la web, ni en la configuración ni en el enlace HTTPS', async () => {
    const devices = new DeviceRegistry(null)
    await startWebServer(port, CODE, undefined, allAgents, Buffer.alloc(32, 9), devices)
    const client = (await api('/pair', { code: CODE, deviceName: 'Portátil', kind: 'client', platform: 'win32' }, '')).body
    const withCode = { ...getConfig(), webAccess: { ...getConfig().webAccess, token: CODE } }
    webMethods.set('getConfig', () => withCode)
    webMethods.set('getHttpsLink', () => ({ url: `https://equipo:8788/?t=${CODE}`, selfSigned: true }))
    const call = async (name: string, access: string): Promise<unknown> =>
      ((await (await fetch(`${base}/api/call/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${access}` } })).json()) as { result: unknown }).result
    try {
      for (const access of [client.accessToken, CODE]) {
        const config = (await call('getConfig', access)) as { webAccess: { token: string } }
        expect(config.webAccess.token).toBe('')
      }
      expect(await call('getHttpsLink', client.accessToken)).toEqual({ url: 'https://equipo:8788/', selfSigned: true })
      // El dueño (con el código) sí recibe el enlace que entra solo.
      expect(await call('getHttpsLink', CODE)).toEqual({ url: `https://equipo:8788/?t=${CODE}`, selfSigned: true })
      // La configuración del Mac no cambia: solo se quita de la respuesta.
      expect(withCode.webAccess.token).toBe(CODE)
    } finally {
      webMethods.set('getConfig', getConfig)
      webMethods.delete('getHttpsLink')
    }
  })

  it('los avisos de configuración por la web no llevan el código de acceso', () => {
    const config = { ...getConfig(), webAccess: { ...getConfig().webAccess, token: CODE } }
    const out = withoutAccessCode({ id: 'e1', ts: 0, kind: 'config.updated', config })
    expect(out.kind === 'config.updated' && out.config.webAccess.token).toBe('')
    expect(JSON.stringify(out)).not.toContain(CODE)
  })

  it('sirve el instalador del cliente a los clientes y solo lo publica el dueño', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cowork-feed-'))
    setClientReleaseDir(dir)
    try {
      const devices = new DeviceRegistry(null)
      await startWebServer(port, CODE, undefined, allAgents, Buffer.alloc(32, 9), devices)
      const client = (await api('/pair', { code: CODE, deviceName: 'Portátil', kind: 'client' }, '')).body.accessToken
      const phone = (await api('/pair', { code: CODE, deviceName: 'Pixel' }, '')).body.accessToken
      const call = (method: string, path: string, access: string | null, body?: Buffer | string): Promise<Response> =>
        fetch(base + path, { method, headers: access ? { Authorization: `Bearer ${access}` } : {}, ...(body === undefined ? {} : { body }) })
      const yml = (version: string): string =>
        [`version: ${version}`, 'files:', `  - url: AI-Cowork-Setup-${version}.exe`, '    sha512: abc', '    size: 5', `path: AI-Cowork-Setup-${version}.exe`, 'sha512: abc', ''].join('\n')

      // Sin nada publicado.
      expect((await call('GET', '/app/client/latest.yml', client)).status).toBe(404)
      expect((await call('GET', '/app/client/latest.yml', null)).status).toBe(401)
      // Un cliente no puede publicar (el instalador se ejecuta en los demás equipos).
      expect((await call('PUT', '/api/client-release/AI-Cowork-Setup-0.1.5.exe', client, 'hello')).status).toBe(403)
      // Nombres que no son del canal.
      expect((await call('PUT', '/api/client-release/evil.exe', CODE, 'x')).status).toBe(400)
      expect((await call('PUT', '/api/client-release/..%2Fx.exe', CODE, 'x')).status).toBe(400)
      // El descriptor solo se acepta con su instalador ya subido.
      expect((await call('PUT', '/api/client-release/latest.yml', CODE, yml('0.1.5'))).status).toBe(400)
      expect((await call('PUT', '/api/client-release/AI-Cowork-Setup-0.1.5.exe', CODE, 'hello')).status).toBe(200)
      const published = await call('PUT', '/api/client-release/latest.yml', CODE, yml('0.1.5'))
      expect(published.status).toBe(200)
      expect(((await published.json()) as { published: unknown }).published).toMatchObject({ version: '0.1.5', file: 'AI-Cowork-Setup-0.1.5.exe', size: 5 })

      // Lo bajan los clientes, no los móviles.
      const feed = await call('GET', '/app/client/latest.yml', client)
      expect(feed.status).toBe(200)
      expect(await feed.text()).toContain('version: 0.1.5')
      const exe = await call('GET', '/app/client/AI-Cowork-Setup-0.1.5.exe', client)
      expect(exe.status).toBe(200)
      expect(Buffer.from(await exe.arrayBuffer()).toString()).toBe('hello')
      expect((await call('GET', '/app/client/latest.yml', phone)).status).toBe(401)
      expect((await call('GET', '/app/client/..%2Fconfig.json', client)).status).toBe(404)

      // Al publicar otra versión, el instalador anterior se retira.
      expect((await call('PUT', '/api/client-release/AI-Cowork-Setup-0.1.6.exe', CODE, 'hello2')).status).toBe(200)
      expect((await call('PUT', '/api/client-release/latest.yml', CODE, yml('0.1.6'))).status).toBe(200)
      expect((await call('GET', '/app/client/AI-Cowork-Setup-0.1.5.exe', client)).status).toBe(404)
      expect((await call('GET', '/app/client/AI-Cowork-Setup-0.1.6.exe', client)).status).toBe(200)
    } finally {
      setClientReleaseDir(null)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('los clientes ven y bajan archivos del disco del servidor; restringido, solo los proyectos; y todo queda en el registro', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cowork-fsapi-'))
    const project = join(root, 'proyecto')
    const outside = join(root, 'fuera')
    mkdirSync(join(project, 'sub'), { recursive: true })
    mkdirSync(outside)
    writeFileSync(join(project, 'a.txt'), '0123456789')
    writeFileSync(join(project, 'sub', 'b.txt'), 'bbb')
    writeFileSync(join(outside, 'otro.txt'), 'afuera')
    writeFileSync(join(root, 'mobile-key'), 'secreto')
    const log: Omit<AccessEntry, 't'>[] = []
    let restricted: string[] | null = null
    setFsAccess({
      allowedRoots: () => restricted,
      protectedPaths: () => [join(root, 'mobile-key')],
      projects: () => [{ name: 'Proyecto', dir: project }],
      log: (e) => log.push(e),
      trash: async () => {}
    })
    try {
      const devices = new DeviceRegistry(null)
      await startWebServer(port, CODE, undefined, allAgents, Buffer.alloc(32, 9), devices)
      const client = (await api('/pair', { code: CODE, deviceName: 'Portátil', kind: 'client' }, '')).body.accessToken
      const phone = (await api('/pair', { code: CODE, deviceName: 'Pixel' }, '')).body.accessToken
      const get = (path: string, access: string | null = client, headers: Record<string, string> = {}): Promise<Response> =>
        fetch(base + path, { headers: { ...(access ? { Authorization: `Bearer ${access}` } : {}), ...headers } })
      const q = (p: string): string => encodeURIComponent(p)

      // Quién entra: un cliente emparejado o el código de acceso; un móvil o nadie, no.
      expect((await get('/api/fs/roots', null)).status).toBe(401)
      expect((await get('/api/fs/roots', phone)).status).toBe(401)
      const roots = await (await get('/api/fs/roots')).json() as { roots: { kind: string; name: string }[]; restricted: boolean }
      expect(roots.restricted).toBe(false)
      expect(roots.roots.some((r) => r.kind === 'project' && r.name.includes('Proyecto'))).toBe(true)

      // Listar y leer: todo el disco por defecto, con ranuras y rangos.
      const listing = await (await get(`/api/fs/list?path=${q(project)}`)).json() as { entries: { name: string; kind: string }[]; parent: string }
      expect(listing.entries.map((e) => `${e.kind}:${e.name}`)).toEqual(['dir:sub', 'file:a.txt'])
      expect((await get(`/api/fs/list?path=${q(outside)}`)).status).toBe(200)
      const full = await get(`/api/fs/read?path=${q(join(project, 'a.txt'))}`)
      expect(await full.text()).toBe('0123456789')
      expect(full.headers.get('content-security-policy')).toBe('sandbox')
      const part = await get(`/api/fs/read?path=${q(join(project, 'a.txt'))}`, client, { Range: 'bytes=2-4' })
      expect(part.status).toBe(206)
      expect(await part.text()).toBe('234')
      expect((await get('/api/fs/list?path=relativa')).status).toBe(400)
      expect((await get(`/api/fs/list?path=${q(join(project, 'nada'))}`)).status).toBe(404)

      // Carpeta como zip.
      const zip = await get(`/api/fs/zip?path=${q(project)}`)
      expect(zip.status).toBe(200)
      expect(zip.headers.get('content-type')).toBe('application/zip')
      const bytes = Buffer.from(await zip.arrayBuffer())
      expect(bytes.readUInt32LE(0)).toBe(0x04034b50)
      expect(bytes.includes(Buffer.from('proyecto/sub/b.txt'))).toBe(true)

      // La llave de la app no se comparte nunca, ni como zip.
      expect((await get(`/api/fs/read?path=${q(join(root, 'mobile-key'))}`)).status).toBe(403)
      const rootZip = Buffer.from(await (await get(`/api/fs/zip?path=${q(root)}`)).arrayBuffer())
      expect(rootZip.includes(Buffer.from('mobile-key'))).toBe(false)
      expect(rootZip.includes(Buffer.from('proyecto/a.txt'))).toBe(true)

      // Restringido a los proyectos.
      restricted = [project]
      expect((await get(`/api/fs/list?path=${q(project)}`)).status).toBe(200)
      expect((await get(`/api/fs/list?path=${q(outside)}`)).status).toBe(403)
      expect((await get(`/api/fs/read?path=${q(join(outside, 'otro.txt'))}`)).status).toBe(403)
      expect((await get(`/api/fs/list?path=${q(join(project, '..'))}`)).status).toBe(403)
      const only = await (await get('/api/fs/roots')).json() as { roots: { kind: string }[]; restricted: boolean }
      expect(only.restricted).toBe(true)
      expect(only.roots.every((r) => r.kind === 'project')).toBe(true)
      const up = await (await get(`/api/fs/list?path=${q(project)}`)).json() as { parent: string | null }
      expect(up.parent).toBeNull()

      // El registro sabe quién hizo qué.
      expect(log.every((e) => e.device === 'Portátil')).toBe(true)
      expect(log.some((e) => e.action === 'read' && e.path === join(project, 'a.txt'))).toBe(true)
      expect(log.some((e) => e.action === 'zip' && e.path === project && (e.bytes ?? 0) > 0)).toBe(true)
      expect(log.filter((e) => e.action === 'denied').length).toBeGreaterThanOrEqual(3)
    } finally {
      setFsAccess(null)
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('los clientes escriben en el servidor con control de cambios, borran a la papelera y listan el árbol', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cowork-fsw-'))
    const work = join(root, 'trabajo')
    const outside = join(root, 'fuera')
    mkdirSync(join(work, 'node_modules', 'x'), { recursive: true })
    mkdirSync(join(work, 'src', 'vacia'), { recursive: true })
    mkdirSync(outside)
    writeFileSync(join(work, 'src', 'a.ts'), 'aaaa')
    writeFileSync(join(work, 'node_modules', 'x', 'i.js'), 'x')
    writeFileSync(join(root, 'mobile-key'), 'secreto')
    const log: Omit<AccessEntry, 't'>[] = []
    const trashed: string[] = []
    let restricted: string[] | null = null
    setFsAccess({
      allowedRoots: () => restricted,
      protectedPaths: () => [join(root, 'mobile-key')],
      projects: () => [{ name: 'Proyecto', dir: work }],
      log: (e) => log.push(e),
      trash: async (path) => {
        trashed.push(path)
        rmSync(path, { recursive: true, force: true })
      }
    })
    try {
      const devices = new DeviceRegistry(null)
      await startWebServer(port, CODE, undefined, allAgents, Buffer.alloc(32, 9), devices)
      const client = (await api('/pair', { code: CODE, deviceName: 'Portátil', kind: 'client' }, '')).body.accessToken
      const phone = (await api('/pair', { code: CODE, deviceName: 'Pixel' }, '')).body.accessToken
      const call = (method: string, path: string, access: string | null = client, body?: string): Promise<Response> =>
        fetch(base + path, { method, headers: access ? { Authorization: `Bearer ${access}` } : {}, ...(body === undefined ? {} : { body }) })
      const q = (x: string): string => encodeURIComponent(x)
      const MTIME = 1_700_000_000_000

      // Subir un archivo nuevo, con su fecha; las carpetas intermedias se crean solas.
      const target = join(work, 'docs', 'nuevo.txt')
      const put = await call('PUT', `/api/fs/file?path=${q(target)}&mtime=${MTIME}&expect=none`, client, 'contenido')
      expect(put.status).toBe(200)
      expect(((await put.json()) as { size: number; mtime: number }).mtime).toBeGreaterThan(MTIME - 3)
      expect(readFileSync(target, 'utf8')).toBe('contenido')
      expect(Math.abs(Math.round(statSync(target).mtimeMs) - MTIME)).toBeLessThanOrEqual(2)
      // No queda ningún temporal.
      expect(readdirSync(join(work, 'docs'))).toEqual(['nuevo.txt'])

      // Control de cambios: si ya existe (expect=none) o cambió desde lo que se creía, 409 y no se pisa.
      expect((await call('PUT', `/api/fs/file?path=${q(target)}&expect=none`, client, 'otro')).status).toBe(409)
      expect((await call('PUT', `/api/fs/file?path=${q(target)}&expect=${MTIME + 99999}`, client, 'otro')).status).toBe(409)
      expect(readFileSync(target, 'utf8')).toBe('contenido')
      expect((await call('PUT', `/api/fs/file?path=${q(target)}&mtime=${MTIME + 5000}&expect=${MTIME}`, client, 'nuevo valor')).status).toBe(200)
      expect(readFileSync(target, 'utf8')).toBe('nuevo valor')

      // Carpetas, papelera y huella.
      expect((await call('POST', `/api/fs/mkdir?path=${q(join(work, 'nueva', 'honda'))}`)).status).toBe(200)
      expect(statSync(join(work, 'nueva', 'honda')).isDirectory()).toBe(true)
      expect((await call('POST', `/api/fs/trash?path=${q(target)}`)).status).toBe(200)
      expect(trashed).toEqual([target])
      expect((await call('POST', `/api/fs/trash?path=${q(target)}`)).status).toBe(404)
      const hash = await (await call('GET', `/api/fs/hash?path=${q(join(work, 'src', 'a.ts'))}`)).json()
      expect(hash).toEqual({ sha256: createHash('sha256').update('aaaa').digest('hex'), size: 4 })

      // Árbol recursivo con exclusiones.
      const tree = await (await call('GET', `/api/fs/tree?path=${q(work)}&exclude=${q('node_modules,*.part')}`)).json() as { files: { p: string; s: number }[]; dirs: string[] }
      expect(tree.files.map((f) => f.p).sort()).toEqual(['src/a.ts'])
      expect(tree.dirs).toEqual(expect.arrayContaining(['src', 'src/vacia', 'nueva', 'nueva/honda']))
      expect(tree.dirs).not.toContain('node_modules')

      // Lo protegido y lo restringido tampoco se escribe; un móvil no entra; el método debe corresponder.
      expect((await call('PUT', `/api/fs/file?path=${q(join(root, 'mobile-key'))}`, client, 'x')).status).toBe(403)
      expect(readFileSync(join(root, 'mobile-key'), 'utf8')).toBe('secreto')
      expect((await call('PUT', `/api/fs/file?path=${q(join(work, 'p.txt'))}`, phone, 'x')).status).toBe(401)
      expect((await call('GET', `/api/fs/file?path=${q(target)}`)).status).toBe(405)
      restricted = [work]
      expect((await call('PUT', `/api/fs/file?path=${q(join(outside, 'x.txt'))}`, client, 'x')).status).toBe(403)
      expect((await call('POST', `/api/fs/trash?path=${q(outside)}`)).status).toBe(403)
      expect((await call('PUT', `/api/fs/file?path=${q(join(work, 'ok.txt'))}`, client, 'x')).status).toBe(200)

      expect(log.filter((e) => e.action === 'write').length).toBeGreaterThanOrEqual(3)
      expect(log.some((e) => e.action === 'trash' && e.path === target)).toBe(true)
      expect(log.some((e) => e.action === 'mkdir')).toBe(true)
    } finally {
      setFsAccess(null)
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('sincroniza de verdad con el servidor por HTTP: sube, baja, conserva conflictos y manda borrados a la papelera', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cowork-synchttp-'))
    const local = join(root, 'cliente')
    const remote = join(root, 'servidor')
    mkdirSync(local)
    mkdirSync(remote)
    const trashed: string[] = []
    setFsAccess({
      allowedRoots: () => null,
      protectedPaths: () => [],
      projects: () => [],
      log: () => {},
      trash: async (path) => {
        trashed.push(path)
        rmSync(path, { recursive: true, force: true })
      }
    })
    try {
      const devices = new DeviceRegistry(null)
      await startWebServer(port, CODE, undefined, allAgents, Buffer.alloc(32, 9), devices)
      const client = (await api('/pair', { code: CODE, deviceName: 'Portátil', kind: 'client' }, '')).body.accessToken
      const io = { local: localIO(async (p) => rmSync(p, { recursive: true, force: true })), remote: await connectRemote({ origin: base, token: client }) }
      const pair = { id: 'p', name: 'Prueba', localDir: local, remoteDir: remote, enabled: true, exclude: ['node_modules'] }
      const baseState = { files: {}, dirs: [] as string[] }
      const notices: string[] = []
      const ctx = { device: 'PC-Casa', now: () => new Date(2026, 9, 12, 15, 30), activity: () => {}, notice: (n: { message: string }) => notices.push(n.message), confirmDeletes: false }
      const big = Buffer.alloc(3 * 1024 * 1024, 5)
      writeFileSync(join(local, 'grande.bin'), big)
      writeFileSync(join(local, 'a.txt'), 'desde el cliente')
      mkdirSync(join(local, 'node_modules'))
      writeFileSync(join(local, 'node_modules', 'x.js'), 'no')
      writeFileSync(join(remote, 'b.txt'), 'desde el servidor')
      mkdirSync(join(remote, 'carpeta', 'honda'), { recursive: true })
      writeFileSync(join(remote, 'carpeta', 'honda', 'c.md'), '# c')

      const first = await syncOnce(pair, baseState, io, ctx)
      expect(first.errors).toEqual([])
      expect(first).toMatchObject({ uploaded: 2, downloaded: 2 })
      expect(readFileSync(join(remote, 'grande.bin')).equals(big)).toBe(true)
      expect(readFileSync(join(local, 'carpeta', 'honda', 'c.md'), 'utf8')).toBe('# c')
      expect(existsSync(join(remote, 'node_modules'))).toBe(false)
      expect(Math.abs(statSync(join(remote, 'a.txt')).mtimeMs - statSync(join(local, 'a.txt')).mtimeMs)).toBeLessThanOrEqual(2)
      expect(await syncOnce(pair, baseState, io, ctx)).toMatchObject({ uploaded: 0, downloaded: 0, conflicts: 0 })

      // Conflicto: cambia en los dos lados.
      writeFileSync(join(local, 'a.txt'), 'mi cambio')
      utimesSync(join(local, 'a.txt'), 1_800_000_000, 1_800_000_000)
      writeFileSync(join(remote, 'a.txt'), 'cambio del servidor!')
      utimesSync(join(remote, 'a.txt'), 1_800_000_100, 1_800_000_100)
      expect((await syncOnce(pair, baseState, io, ctx)).conflicts).toBe(1)
      expect(readFileSync(join(local, 'a.txt'), 'utf8')).toBe('cambio del servidor!')
      expect(readdirSync(local).some((n) => n.startsWith('a (conflicto PC-Casa'))).toBe(true)
      await syncOnce(pair, baseState, io, ctx)
      expect(readdirSync(remote).filter((n) => n.startsWith('a (conflicto'))).toHaveLength(1)

      // Borrado aquí: va a la papelera del servidor.
      rmSync(join(local, 'b.txt'))
      const del = await syncOnce(pair, baseState, io, ctx)
      expect(del.deletedRemote).toBe(1)
      expect(trashed).toEqual([join(remote, 'b.txt')])
      expect(notices.some((m) => m.includes('papelera del servidor'))).toBe(true)
    } finally {
      setFsAccess(null)
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rechaza un tipo de dispositivo desconocido al emparejar', async () => {
    const result = await api('/pair', { code: CODE, deviceName: 'X', kind: 'servidor' }, '')
    expect(result.status).toBe(400)
  })

  it('autentica el upgrade WebSocket exclusivamente con Bearer', async () => {
    for (const access of [null, CODE, 'invalid-token']) {
      const response = await websocket(access)
      expect(response.status).toBe(401)
      errorFormat(response.body)
    }
    expect((await websocket(null, { path: `${PREFIX}/events?accessToken=${token}`, headers: { Cookie: `cowork_token=${CODE}` } })).status).toBe(401)
    expect((await websocket(token, { headers: { 'Sec-WebSocket-Version': '12' } })).status).toBe(426)
    expect((await websocket(token, { headers: { 'Sec-WebSocket-Key': 'invalid' } })).status).toBe(400)
  })

  it('emite eventos del bus con secuencias comunes, watermark, reconexión y redacción del código', async () => {
    const a = await websocket(token)
    const b = await websocket(token)
    expect(a.status).toBe(101)
    expect(a.accept).toBe(createHash('sha1').update(a.key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64'))
    const hello = await event(a.frames, 'hello')
    expect(hello.payload).toMatchObject({ bootId: expect.any(String), snapshotRequired: true })
    emit({ kind: 'message.delta', messageId: 'message-1', text: 'Hola' })
    emit({ kind: 'config.updated', config: { ...getConfig(), webAccess: { enabled: true, port, token: CODE } } })
    const delta = await event(a.frames, 'message.delta')
    expect(delta.payload).toMatchObject({ messageId: 'message-1', text: 'Hola', id: expect.any(String), ts: expect.any(Number) })
    expect(delta.sequence).toBeGreaterThan(hello.sequence)
    expect((await event(b.frames, 'message.delta')).sequence).toBe(delta.sequence)
    const config = await event(a.frames, 'config.updated')
    expect(config.sequence).toBe(delta.sequence + 1)
    expect(JSON.stringify(config)).not.toContain(CODE)
    const watermark = (await api('/snapshot')).body.capabilities.eventSequence as number
    expect(watermark).toBeGreaterThanOrEqual(config.sequence)
    a.socket!.destroy()
    const reconnect = await websocket(token)
    expect((await event(reconnect.frames, 'hello')).sequence).toBeGreaterThanOrEqual(watermark)
  })

  it('responde ping, rechaza comandos por WebSocket y cierra clientes al apagar', async () => {
    const client = await websocket(token)
    client.socket!.write(maskedFrame(9, 'ping'))
    await vi.waitFor(() => expect(client.frames.find((f) => f.opcode === 10)?.payload.toString()).toBe('ping'))
    client.socket!.write(maskedFrame(1, '{}'))
    await vi.waitFor(() => expect(client.frames.find((f) => f.opcode === 8)?.payload.readUInt16BE()).toBe(1008))
    const remaining = await websocket(token)
    await stopWebServer()
    await vi.waitFor(() => expect(remaining.frames.find((f) => f.opcode === 8)?.payload.readUInt16BE()).toBe(1001))
  })

  it('sirve HTTP y WebSocket sobre el HTTPS existente usando confianza explícita en el certificado', async () => {
    const pair = selfSignedCert(['127.0.0.1'])
    await startWebServer(port, CODE, () => pair, allAgents)
    token = (await api('/pair', { code: CODE, deviceName: 'Pixel' }, '')).body.accessToken
    const snapshot = await new Promise<{ status: number; body: MobileSnapshot }>((resolve, reject) => {
      tlsRequest({ hostname: '127.0.0.1', port: port + 1, path: PREFIX + '/snapshot', ca: pair.cert, headers: { Authorization: `Bearer ${token}` } }, (res) => {
        let text = ''
        res.on('data', (chunk) => { text += String(chunk) })
        res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(text) }))
      }).on('error', reject).end()
    })
    expect(snapshot.status).toBe(200)
    expect(snapshot.body.capabilities.apiVersion).toBe('v1')
    expect((await websocket(token, { ca: pair.cert })).status).toBe(101)
  })
  it('amplía la instantánea con proyectos, estaciones, ajustes, adjuntos y carpeta, y recorta registros y consumo', async () => {
    const id = (await api('/conversations', {})).body.conversation.id as string
    const folder = mkdtempSync(join(tmpdir(), 'aicw-carpeta-'))
    store.getProject(id).project.workDir = folder
    const taskId = 'task-trace-largo'
    store.upsertTask({ id: taskId, projectId: id, runId: 'run-trace', title: 'Tarea con registro', description: 'Prueba', agentId: 'codex', dependsOn: [], status: 'done', difficulty: 'easy', createdAt: Date.now(), artifactIds: [] })
    const entries = Array.from({ length: 45 }, (_, i) => ({ id: `1-${i}`, ts: 1_000 + i, kind: 'note' as const, title: `Paso ${i}` }))
    writeFileSync(join(getConfig().workspaceRoot, 'traces', `${taskId}.json`), JSON.stringify({ projectId: id, entries }))
    const runs = Array.from({ length: 105 }, (_, i) => ({ runId: `run-${i}`, projectId: id, projectName: 'Prueba', request: 'Trabajo', startedAt: 1_000 + i, status: 'ok' as const, tasks: 1, tasksDone: 1, calls: [{ ts: 1_000 + i, kind: 'task' as const, agentId: 'codex', agentName: 'Codex', provider: 'codex' as const, input: 1, output: 2, cached: 0, durationMs: 5, ok: true }] }))
    const original = webMethods.get('getUsageRuns')!
    webMethods.set('getUsageRuns', () => runs)
    try {
      const client = await websocket(token)
      const state = (await api(`/snapshot?conversationId=${id}`)).body as MobileSnapshot
      expect(state.projects.map((p) => p.id)).toEqual(store.listProjects().map((p) => p.id))
      expect(state.projects.find((p) => p.id === id)).toEqual({ id, name: 'Conversación móvil', createdAt: expect.any(Number), updatedAt: expect.any(Number), running: false })
      expect(state.stations).toEqual(getConfig().stations)
      expect(state.settings).toEqual({ agentAccess: getConfig().agentAccess, planApproval: false, theme: 'clasico' })
      expect(state.conversation.attachments).toEqual([])
      expect(state.conversation.folder).toEqual({ name: basename(folder), path: folder })
      expect(state.capabilities).toMatchObject({ attachments: true, projects: true, memoryEdit: true, files: true, upload: true, artifacts: true, traceEndpoint: true, agentAccess: true, usageRefresh: true })
      const task = state.tasks.find((t) => t.id === taskId)!
      expect(task.traceCount).toBe(45)
      expect(task.trace).toEqual(entries.slice(-40))
      expect(state.usage.runs.map((r) => r.runId)).toEqual(runs.slice(-100).map((r) => r.runId))
      expect(state.usage.totals).toEqual({ input: 105, output: 210, cached: 0 })
      expect(state.usage.byAgent).toEqual([{ agentId: 'codex', input: 105, output: 210 }])
      emit({ kind: 'usage.run', run: runs[104] })
      const usage = (await event(client.frames, 'usage.updated')).payload.usage as MobileSnapshot['usage']
      expect(usage.runs).toEqual(state.usage.runs)
      expect(usage.totals).toEqual(state.usage.totals)
      // Registro completo aparte.
      expect(await api(`/tasks/${taskId}/trace`)).toEqual({ status: 200, body: { taskId, entries } })
      const unknown = await api('/tasks/no-existe/trace')
      expect(unknown.status).toBe(404)
      expect(unknown.body.code).toBe('TASK_NOT_FOUND')
      expect((await api('/tasks/a.b/trace')).status).toBe(400)
      expect((await api(`/tasks/${taskId}/trace?conversationId=${id}`)).status).toBe(400)
    } finally {
      webMethods.set('getUsageRuns', original)
      store.getProject(id).project.workDir = undefined
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('lista proyectos con su estado y crea conversaciones con nombre', async () => {
    const named = await api('/conversations', { name: '  Viaje a Lisboa  ' })
    expect(named.status).toBe(201)
    expect(named.body.conversation).toMatchObject({ title: 'Viaje a Lisboa', attachments: [], folder: null })
    const id = named.body.conversation.id as string
    const receipt = (await api('/chat/messages', { conversationId: id, text: 'Trabajo largo', clientMessageId: 'client-projects' })).body as MobileChatReceipt
    const listed = await api('/projects')
    expect(listed.status).toBe(200)
    const projects = listed.body.projects as MobileSnapshot['projects']
    expect(projects.map((p) => p.id)).toEqual(store.listProjects().map((p) => p.id))
    expect(projects.find((p) => p.id === id)).toEqual({ id, name: 'Viaje a Lisboa', createdAt: expect.any(Number), updatedAt: expect.any(Number), running: true })
    expect(projects.map((p) => p.updatedAt)).toEqual([...projects.map((p) => p.updatedAt)].sort((a, b) => b - a))
    cancelRun(receipt.requestId)
    await vi.waitFor(async () => expect(((await api('/projects')).body.projects as MobileSnapshot['projects']).find((p) => p.id === id)!.running).toBe(false))
    expect((await api('/projects?x=1')).status).toBe(400)
  })

  it('edita la memoria y las instrucciones del proyecto y avisa por WebSocket', async () => {
    const id = (await api('/conversations', {})).body.conversation.id as string
    const client = await websocket(token)
    const created = await api('/memory', { conversationId: id, kind: 'decision', text: '  Usar   pnpm en el monorepo ' })
    expect(created.status).toBe(201)
    expect(created.body.entry).toMatchObject({ id: expect.any(String), kind: 'decision', text: 'Usar pnpm en el monorepo', status: 'confirmed', by: 'user' })
    const entryId = created.body.entry.id as string
    const update = await event(client.frames, 'memory.updated')
    expect(update.payload).toMatchObject({ projectId: id, memory: [expect.objectContaining({ id: entryId })], instructions: '' })
    const duplicate = await api('/memory', { conversationId: id, kind: 'fact', text: 'usar pnpm en el monorepo' })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.code).toBe('MEMORY_DUPLICATE')
    const foreign = await api('/memory', { conversationId: 'no-existe', kind: 'fact', text: 'Otra cosa' })
    expect(foreign.status).toBe(404)
    expect(foreign.body.code).toBe('CONVERSATION_NOT_FOUND')
    const changed = await api(`/memory/${entryId}`, { conversationId: id, text: 'Usar pnpm siempre', kind: 'preference' })
    expect(changed).toEqual({ status: 200, body: { entry: expect.objectContaining({ id: entryId, text: 'Usar pnpm siempre', kind: 'preference', status: 'confirmed' }) } })
    expect((await api(`/memory/${entryId}`, { conversationId: id, status: 'superseded' })).body.entry.status).toBe('superseded')
    await vi.waitFor(() => expect(received(client.frames, 'memory.updated').at(-1)!.payload.memory).toEqual([expect.objectContaining({ id: entryId, status: 'superseded' })]))
    const missing = await api('/memory/m999', { conversationId: id, status: 'confirmed' })
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe('MEMORY_NOT_FOUND')
    expect(await api(`/memory/${entryId}/delete`, { conversationId: id })).toEqual({ status: 200, body: { deleted: true } })
    const again = await api(`/memory/${entryId}/delete`, { conversationId: id })
    expect(again.status).toBe(404)
    expect(again.body.code).toBe('MEMORY_NOT_FOUND')
    expect(store.snapshotProject(id).memory).toEqual([])
    expect(await api('/instructions', { conversationId: id, text: 'Responde en español' })).toEqual({ status: 200, body: { instructions: 'Responde en español' } })
    await vi.waitFor(() => expect(received(client.frames, 'memory.updated').at(-1)!.payload.instructions).toBe('Responde en español'))
    expect(await api('/instructions', { conversationId: id, text: '' })).toEqual({ status: 200, body: { instructions: '' } })
    expect((await api(`/snapshot?conversationId=${id}`)).body.conversation.instructions).toBe('')
  })

  it('sirve los resultados en bruto con su tipo y sin salir del proyecto', async () => {
    const id = (await api('/conversations', {})).body.conversation.id as string
    const dir = store.projectDir(id)
    const folder = mkdtempSync(join(tmpdir(), 'aicw-resultados-'))
    store.getProject(id).project.workDir = folder
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    writeFileSync(join(dir, 'artifacts', 'informe.html'), '<h1>Informe</h1>')
    writeFileSync(join(folder, 'gráfico.png'), png)
    writeFileSync(join(dir, '..', '..', 'secreto.txt'), 'secreto')
    const now = Date.now()
    store.upsertArtifact({ id: 'art-html', projectId: id, name: 'informe.html', relPath: 'artifacts/informe.html', kind: 'html', size: 16, createdAt: now })
    store.upsertArtifact({ id: 'art-png', projectId: id, name: 'gráfico.png', relPath: 'gráfico.png', kind: 'image', size: 4, createdAt: now })
    store.upsertArtifact({ id: 'art-fuera', projectId: id, name: 'secreto.txt', relPath: '../../secreto.txt', kind: 'text', size: 7, createdAt: now })
    try {
      const html = await raw(`/artifacts/art-html/raw?conversationId=${id}`)
      expect(html.status).toBe(200)
      expect(html.body.toString()).toBe('<h1>Informe</h1>')
      expect(Object.fromEntries(['content-type', 'content-length', 'content-disposition', 'x-content-type-options', 'cache-control', 'content-security-policy'].map((h) => [h, html.headers.get(h)]))).toEqual({
        'content-type': 'text/html; charset=utf-8', 'content-length': '16', 'content-disposition': "inline; filename*=UTF-8''informe.html",
        'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-security-policy': 'sandbox allow-scripts'
      })
      // En la carpeta de trabajo, como /api/file.
      const image = await raw(`/artifacts/art-png/raw?conversationId=${id}`)
      expect(image.status).toBe(200)
      expect(image.headers.get('content-type')).toBe('image/png')
      expect(image.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''gr%C3%A1fico.png")
      expect(image.body).toEqual(png)
      for (const [path, status, code] of [
        [`/artifacts/art-fuera/raw?conversationId=${id}`, 404, 'ARTIFACT_NOT_FOUND'],
        [`/artifacts/no-existe/raw?conversationId=${id}`, 404, 'ARTIFACT_NOT_FOUND'],
        [`/artifacts/..%2F..%2Fsecreto/raw?conversationId=${id}`, 400, 'INVALID_INPUT'],
        ['/artifacts/art-html/raw', 400, 'INVALID_INPUT'],
        [`/artifacts/art-html/raw?conversationId=${id}&x=1`, 400, 'INVALID_INPUT'],
        ['/artifacts/art-html/raw?conversationId=no-existe', 404, 'CONVERSATION_NOT_FOUND']
      ] as const) {
        const result = await raw(path)
        expect([path, result.status, JSON.parse(result.body.toString()).code]).toEqual([path, status, code])
      }
    } finally {
      store.getProject(id).project.workDir = undefined
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('sirve por source=project el archivo que un agente nombró en el chat, con ruta relativa o absoluta, sin salir del proyecto', async () => {
    const id = (await api('/conversations', {})).body.conversation.id as string
    const folder = mkdtempSync(join(tmpdir(), 'aicw-proy-'))
    const outside = mkdtempSync(join(tmpdir(), 'aicw-fuera-'))
    try {
      const png = Buffer.from('89504e470d0a1a0a', 'hex')
      mkdirSync(join(folder, 'artifacts', 'mapas'), { recursive: true })
      writeFileSync(join(folder, 'artifacts', 'mapas', 'hoja.png'), png)
      writeFileSync(join(outside, 'secreto.png'), png)
      store.getProject(id).project.workDir = folder
      const internal = store.getProject(id).project.dir
      mkdirSync(join(internal, 'artifacts'), { recursive: true })
      writeFileSync(join(internal, 'artifacts', 'interno.png'), png)
      const get = (path: string) => raw(`/files/raw?conversationId=${id}&source=project&path=${encodeURIComponent(path)}`)

      // Absoluta (como la escribe el agente), relativa y con ./ , en la carpeta de trabajo y en la interna.
      for (const path of [join(folder, 'artifacts', 'mapas', 'hoja.png'), 'artifacts/mapas/hoja.png', './artifacts/mapas/hoja.png', join(internal, 'artifacts', 'interno.png'), 'artifacts/interno.png']) {
        const r = await get(path)
        expect([path, r.status, r.headers.get('content-type')]).toEqual([path, 200, 'image/png'])
        expect(r.body.equals(png)).toBe(true)
      }
      // Fuera del proyecto, o saliendo de él: no.
      for (const path of [join(outside, 'secreto.png'), '../secreto.png', 'artifacts/../../x.png', 'artifacts/mapas/no-existe.png']) {
        const r = await get(path)
        expect([path, r.status, JSON.parse(r.body.toString()).code]).toEqual([path, 404, 'FILE_NOT_FOUND'])
      }
    } finally {
      store.getProject(id).project.workDir = undefined
      rmSync(folder, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('lista la carpeta de trabajo y los adjuntos, filtra, recorta y sirve sus archivos sin salir de ellos', async () => {
    const id = (await api('/conversations', {})).body.conversation.id as string
    expect((await api(`/files?conversationId=${id}`)).body).toEqual({ attachments: [], folder: null })
    const noFolder = await raw(`/files/raw?conversationId=${id}&source=folder&path=leeme.txt`)
    expect([noFolder.status, JSON.parse(noFolder.body.toString()).code]).toEqual([404, 'FILE_NOT_FOUND'])
    const folder = mkdtempSync(join(tmpdir(), 'aicw-lista-'))
    const outside = mkdtempSync(join(tmpdir(), 'aicw-fuera-'))
    const minutes: Record<string, number> = {
      'leeme.txt': 5, 'src/main.ts': 4, 'src/deep/util.py': 3, 'Notas Año.md': 2, 'a/b/c/d/e/f/g/h/hondo.txt': 1,
      'a/b/c/d/e/f/g/h/i/demasiado.txt': 6, 'node_modules/pkg/index.js': 6, '.git/config': 6, '.oculta/secreto.txt': 6, 'dist/app.js': 6,
      'build/x.js': 6, 'out/y.js': 6, 'release/z.txt': 6, '__pycache__/m.pyc': 6, '.venv/lib.py': 6
    }
    for (const [rel, minute] of Object.entries(minutes)) {
      const abs = join(folder, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, rel)
      const time = new Date(Date.UTC(2026, 0, 1, 0, minute))
      utimesSync(abs, time, time)
    }
    writeFileSync(join(outside, 'secreto.txt'), 'secreto')
    // Una unión (o enlace simbólico fuera de Windows) que sale de la carpeta: ni se recorre ni se sirve.
    symlinkSync(outside, join(folder, 'enlace'), 'junction')
    store.getProject(id).project.workDir = folder
    const pdf = join(outside, 'Presupuesto.pdf')
    writeFileSync(pdf, '%PDF-1.4')
    const [attachment] = store.copyAttachments(id, [pdf])
    const file = (rel: string): MobileFolderFile => ({ path: rel, name: basename(rel), size: Buffer.byteLength(rel), modifiedAt: Date.UTC(2026, 0, 1, 0, minutes[rel]), kind: rel.endsWith('.md') ? 'markdown' : rel.endsWith('.txt') ? 'text' : 'code' })
    try {
      const listed = await api(`/files?conversationId=${id}`)
      expect(listed).toEqual({ status: 200, body: { attachments: [attachment], folder: { name: basename(folder), path: folder, truncated: false, files: ['leeme.txt', 'src/main.ts', 'src/deep/util.py', 'Notas Año.md', 'a/b/c/d/e/f/g/h/hondo.txt'].map(file) } } })
      const filtered = await api(`/files?conversationId=${id}&q=SRC`)
      expect(filtered.body).toEqual({ attachments: [], folder: expect.objectContaining({ files: [file('src/main.ts'), file('src/deep/util.py')], truncated: false }) })
      const byName = await api(`/files?conversationId=${id}&q=presu`)
      expect(byName.body).toEqual({ attachments: [attachment], folder: expect.objectContaining({ files: [] }) })
      const restore = __setFileLimitsForChecks({ files: 2 })
      try {
        const cut = (await api(`/files?conversationId=${id}`)).body.folder
        expect(cut.truncated).toBe(true)
        expect(cut.files).toHaveLength(2)
      } finally { restore() }
      for (const path of [`/files?conversationId=${id}&x=1`, '/files', `/files?conversationId=${id}&q=${'q'.repeat(201)}`]) expect((await api(path)).status).toBe(400)

      const code = await raw(`/files/raw?conversationId=${id}&source=folder&path=src%2Fmain.ts`)
      expect([code.status, code.headers.get('content-type'), code.body.toString()]).toEqual([200, 'text/plain; charset=utf-8', 'src/main.ts'])
      const notes = await raw(`/files/raw?conversationId=${id}&source=folder&path=${encodeURIComponent('Notas Año.md')}`)
      expect([notes.status, notes.headers.get('content-type'), notes.headers.get('content-disposition')]).toEqual([200, 'text/markdown; charset=utf-8', "inline; filename*=UTF-8''Notas%20A%C3%B1o.md"])
      const attached = await raw(`/files/raw?conversationId=${id}&source=attachment&path=${encodeURIComponent(attachment.relPath)}`)
      expect([attached.status, attached.headers.get('content-type'), attached.body.toString()]).toEqual([200, 'application/pdf', '%PDF-1.4'])
      for (const [source, path, status, errorCode] of [
        ['folder', '../fuera.txt', 400, 'INVALID_INPUT'],
        ['folder', '/etc/passwd', 400, 'INVALID_INPUT'],
        ['folder', 'C:/Windows/win.ini', 400, 'INVALID_INPUT'],
        ['folder', 'src\\main.ts', 400, 'INVALID_INPUT'],
        ['folder', 'src//main.ts', 400, 'INVALID_INPUT'],
        ['folder', 'no-existe.txt', 404, 'FILE_NOT_FOUND'],
        ['folder', 'src', 404, 'FILE_NOT_FOUND'],
        ['folder', 'enlace/secreto.txt', 404, 'FILE_NOT_FOUND'],
        ['attachment', 'project.json', 400, 'INVALID_INPUT'],
        ['attachment', 'attachments/no-existe.pdf', 404, 'FILE_NOT_FOUND'],
        ['otro', 'leeme.txt', 400, 'INVALID_INPUT']
      ] as const) {
        const result = await raw(`/files/raw?conversationId=${id}&source=${source}&path=${encodeURIComponent(path)}`)
        expect([source, path, result.status, JSON.parse(result.body.toString()).code]).toEqual([source, path, status, errorCode])
      }
      writeFileSync(join(folder, 'grande.bin'), Buffer.alloc(MAX_FILE_BYTES + 1))
      const big = await raw(`/files/raw?conversationId=${id}&source=folder&path=grande.bin`)
      expect([big.status, JSON.parse(big.body.toString()).code]).toEqual([413, 'FILE_TOO_LARGE'])
    } finally {
      store.getProject(id).project.workDir = undefined
      rmSync(folder, { recursive: true, force: true })
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('sube archivos como adjuntos sin enviar mensajes y avisa solo al móvil', async () => {
    const id = (await api('/conversations', {})).body.conversation.id as string
    const client = await websocket(token)
    let stream: import('node:http').IncomingMessage | undefined
    let sse = ''
    request({ hostname: '127.0.0.1', port, path: '/api/events', headers: { Authorization: `Bearer ${CODE}` } }, (res) => {
      stream = res
      res.on('data', (chunk) => { sse += String(chunk) })
    }).on('error', () => {}).end()
    await vi.waitFor(() => expect(stream).toBeDefined())
    try {
      const content = Buffer.from('Contenido del informe')
      const uploaded = await raw(`/files?conversationId=${id}&name=${encodeURIComponent('../carpeta/Informe final?.txt')}`, { method: 'POST', body: content, headers: { 'Content-Type': 'application/octet-stream' } })
      expect(uploaded.status).toBe(201)
      const body = JSON.parse(uploaded.body.toString())
      schemaFormat('AttachmentResponse', body)
      const attachment = body.attachment as Attachment
      expect(attachment).toEqual({ id: expect.any(String), name: 'Informe final_.txt', relPath: 'attachments/Informe-final_.txt', mime: 'text/plain', size: content.length })
      expect(readFileSync(join(store.projectDir(id), attachment.relPath))).toEqual(content)
      expect(store.snapshotProject(id).messages).toEqual([])
      const update = await event(client.frames, 'attachments.updated')
      schemaFormat('AttachmentsUpdatedPayload', update.payload)
      expect(update.payload).toMatchObject({ projectId: id, conversationId: id, attachments: [attachment] })
      expect((await api(`/snapshot?conversationId=${id}`)).body.conversation.attachments).toEqual([attachment])
      const back = await raw(`/files/raw?conversationId=${id}&source=attachment&path=${encodeURIComponent(attachment.relPath)}`)
      expect(back.body).toEqual(content)
      // La web y el escritorio no conocen este evento: no les llega.
      emit({ kind: 'message.delta', messageId: 'marca-sse', text: '' })
      await vi.waitFor(() => expect(sse).toContain('marca-sse'))
      expect(sse).not.toContain('attachments.updated')

      // Límite de 25 MB, con Content-Length y por trozos.
      const big = await raw(`/files?conversationId=${id}&name=grande.bin`, { method: 'POST', body: Buffer.alloc(MAX_FILE_BYTES + 1) })
      expect([big.status, JSON.parse(big.body.toString()).code]).toEqual([413, 'PAYLOAD_TOO_LARGE'])
      const chunked = await new Promise<{ status: number; body: any }>((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port, path: `${PREFIX}/files?conversationId=${id}&name=trozos.bin`, method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' } }, (res) => {
          let text = ''
          res.on('data', (chunk) => { text += String(chunk) })
          res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(text) }))
        })
        req.on('error', reject)
        for (let i = 0; i < 26; i++) req.write(Buffer.alloc(1024 * 1024))
        req.end()
      })
      expect([chunked.status, chunked.body.code]).toEqual([413, 'PAYLOAD_TOO_LARGE'])
      errorFormat(chunked.body)
      expect(store.snapshotProject(id).attachments).toEqual([attachment])

      const long = await raw(`/files?conversationId=${id}&name=${'n'.repeat(300)}.txt`, { method: 'POST', body: 'x' })
      expect(JSON.parse(long.body.toString()).attachment.name).toBe(`${'n'.repeat(196)}.txt`)
      const empty = await raw(`/files?conversationId=${id}&name=vacio.txt`, { method: 'POST', body: '' })
      expect([empty.status, JSON.parse(empty.body.toString()).attachment.size]).toEqual([201, 0])
      for (const [query, status, code] of [
        [`conversationId=${id}&name=`, 400, 'INVALID_INPUT'],
        [`conversationId=${id}&name=..`, 400, 'INVALID_INPUT'],
        [`conversationId=${id}&name=%00%01`, 400, 'INVALID_INPUT'],
        [`conversationId=${id}&name=carpeta%2F`, 400, 'INVALID_INPUT'],
        [`conversationId=${id}`, 400, 'INVALID_INPUT'],
        ['conversationId=no-existe&name=a.txt', 404, 'CONVERSATION_NOT_FOUND']
      ] as const) {
        const result = await raw(`/files?${query}`, { method: 'POST', body: 'x' })
        expect([query, result.status, JSON.parse(result.body.toString()).code]).toEqual([query, status, code])
      }
      const gzip = await raw(`/files?conversationId=${id}&name=a.txt`, { method: 'POST', body: 'x', headers: { 'Content-Encoding': 'gzip' } })
      expect(gzip.status).toBe(415)

      // Adjuntos enviados desde el escritorio con un mensaje: el móvil también se entera.
      const before = received(client.frames, 'attachments.updated').length
      const local = join(mkdtempSync(join(tmpdir(), 'aicw-adjunto-')), 'foto.png')
      writeFileSync(local, Buffer.from([1, 2, 3]))
      await sendMessage({ projectId: id, text: 'Con adjunto', filePaths: [local] })
      await vi.waitFor(() => expect(received(client.frames, 'attachments.updated').length).toBe(before + 1))
      expect(received(client.frames, 'attachments.updated').at(-1)!.payload.attachments).toEqual(store.snapshotProject(id).attachments)
      rmSync(dirname(local), { recursive: true, force: true })
    } finally {
      stream?.destroy()
    }
  })

  it('envía adjuntos ya subidos con el mensaje, sin duplicarlos, para que los agentes los reciban', async () => {
    const id = (await api('/conversations', {})).body.conversation.id as string
    const folder = mkdtempSync(join(tmpdir(), 'aicw-envio-'))
    store.getProject(id).project.workDir = folder
    try {
      const uploaded = await raw(`/files?conversationId=${id}&name=datos.csv`, { method: 'POST', body: 'a,b\n1,2' })
      const attachment = JSON.parse(uploaded.body.toString()).attachment as Attachment
      const unknown = await api('/chat/messages', { conversationId: id, text: 'Analiza', clientMessageId: 'client-adjunto-x', attachmentIds: [attachment.id, 'no-existe'] })
      expect([unknown.status, unknown.body.code]).toEqual([400, 'INVALID_INPUT'])
      expect(unknown.body.message).toContain('no-existe')
      expect(store.snapshotProject(id).messages).toEqual([])
      const seen = prompts.length
      const receipt = await api('/chat/messages', { conversationId: id, text: 'Analiza los datos', clientMessageId: 'client-adjunto', attachmentIds: [attachment.id, attachment.id] })
      expect(receipt.status).toBe(202)
      expect(receipt.body.message.attachments).toEqual([attachment])
      expect(store.snapshotProject(id).attachments).toEqual([attachment])
      // Se prepara en la carpeta de trabajo como los adjuntos del escritorio y llega al plan y a la tarea.
      expect(readFileSync(join(folder, '.ai-cowork', 'adjuntos', 'datos.csv'), 'utf8')).toBe('a,b\n1,2')
      await vi.waitFor(() => {
        const sent = prompts.slice(seen)
        expect(sent.some((p) => p.includes('- .ai-cowork/adjuntos/datos.csv (datos.csv, text/csv)'))).toBe(true)
        expect(sent.some((p) => p.includes('- .ai-cowork/adjuntos/datos.csv (adjunto del usuario: datos.csv)'))).toBe(true)
      })
      // Un reintento devuelve lo mismo.
      expect((await api('/chat/messages', { conversationId: id, text: 'Analiza los datos', clientMessageId: 'client-adjunto', attachmentIds: [attachment.id] })).body).toEqual(receipt.body)
    } finally {
      cancelAll()
      store.getProject(id).project.workDir = undefined
      rmSync(folder, { recursive: true, force: true, maxRetries: 3 })
    }
  })

  it('el tema elegido en el escritorio llega a Órbita en la instantánea', async () => {
    try {
      setUiTheme('mundo-bosque')
      expect((await api('/snapshot')).body.settings.theme).toBe('mundo-bosque')
      // Un id raro no se guarda (el escritorio solo manda los suyos).
      setUiTheme('../../etc')
      expect(getConfig().uiTheme).toBe('mundo-bosque')
    } finally {
      delete getConfig().uiTheme
    }
    expect((await api('/snapshot')).body.settings.theme).toBe('clasico')
  })

  it('cambia el permiso de los agentes como el escritorio y actualiza las cuotas a petición', async () => {
    const client = await websocket(token)
    try {
      expect(await api('/settings/agent-access', { access: 'project' })).toEqual({ status: 200, body: { agentAccess: 'project' } })
      expect(getConfig().agentAccess).toBe('project')
      const update = await event(client.frames, 'config.updated')
      expect((update.payload.config as { agentAccess: string }).agentAccess).toBe('project')
      expect((await api('/snapshot')).body.settings).toEqual({ agentAccess: 'project', planApproval: false, theme: 'clasico' })
    } finally {
      expect(await api('/settings/agent-access', { access: 'full' })).toEqual({ status: 200, body: { agentAccess: 'full' } })
    }
    const quota = { id: 'codex', label: 'Codex', kind: 'usage', agentIds: ['codex'], remainingPct: 42, source: 'real' }
    const runtime = webMethods.get('getRuntime')!
    let refreshed = false
    webMethods.set('refreshQuotas', async () => { refreshed = true })
    webMethods.set('getRuntime', () => ({ runtimes: runtimeSnapshot(), quotas: refreshed ? [quota] : [] }))
    try {
      expect(await api('/usage/refresh', {})).toEqual({ status: 200, body: { quotas: [quota] } })
      expect(refreshed).toBe(true)
    } finally {
      webMethods.set('getRuntime', runtime)
      webMethods.delete('refreshQuotas')
    }
  })

  it('«Cómo rinde cada agente» desde el móvil: calidad por agente y dificultad del registro de consumo', async () => {
    const original = webMethods.get('getUsageRuns')!
    const now = Date.now()
    const call = (extra: Record<string, unknown>) => ({ ts: now, kind: 'task' as const, taskId: 't1', agentId: 'codex', agentName: 'Codex', provider: 'codex' as const, input: 100, output: 50, cached: 0, durationMs: 60_000, ok: true, difficulty: 'hard' as const, ...extra })
    const run = {
      runId: 'quality-run', projectId: 'project-1', projectName: 'Prueba', request: 'Trabajo', startedAt: now, status: 'ok' as const, tasks: 2, tasksDone: 2,
      calls: [
        call({ rating: 'up' }),
        call({ kind: 'verify', agentId: 'claude', agentName: 'Claude', provider: 'claude', verdict: 'fail', ts: now + 1 }),
        call({ rating: 'up', ts: now + 2 }),
        call({ taskId: 't2', ok: false, ts: now + 3 }),
        call({ taskId: 'old', ts: now - 40 * 86_400_000 })
      ]
    }
    webMethods.set('getUsageRuns', () => [run])
    try {
      expect((await api('/snapshot')).body.capabilities.agentQuality).toBe(true)
      const result = await api('/quality')
      expect(result.status).toBe(200)
      expect(result.body).toMatchObject({ days: 30, minTasks: 5, agents: [{ agentId: 'codex', tasks: 2, liked: 1, rated: 1, verified: 1, fixed: 1, firstPass: 0, failed: 1, failedPct: 50 }] })
      expect(result.body.agents[0].byDifficulty).toEqual([expect.objectContaining({ difficulty: 'hard', tasks: 2 })])
      expect((await api('/quality?days=60')).body.agents[0].tasks).toBe(3)
      for (const bad of ['?days=0', '?days=abc', '?days=1000', '?otro=1']) expect([bad, (await api(`/quality${bad}`)).status]).toEqual([bad, 400])
      expect((await api('/quality', {})).status).toBe(405)
    } finally { webMethods.set('getUsageRuns', original) }
  })

  it('bandeja «Te necesita»: el plan que espera tu visto bueno sale ahí y se aprueba desde el móvil', async () => {
    expect((await api('/settings/plan-approval', { enabled: true })).status).toBe(200)
    try {
      expect((await api('/snapshot')).body.capabilities).toMatchObject({ inbox: true, taskChanges: true })
      const conversation = (await api('/conversations', {})).body.conversation.id as string
      await api('/chat/messages', { conversationId: conversation, text: 'Haz el informe', clientMessageId: 'inbox-1' })
      let item: { id: string; actions: { id: string }[] } | undefined
      await vi.waitFor(async () => {
        item = (await api('/inbox')).body.items.find((i: { kind: string; projectId?: string; resolvedAt?: number }) => i.kind === 'plan' && i.projectId === conversation && !i.resolvedAt)
        expect(item).toBeTruthy()
      })
      expect(item!.actions.map((a) => a.id)).toEqual(['approve', 'reject'])
      expect((await api(`/inbox/${item!.id}/nada`, {})).status).toBe(404)
      const done = await api(`/inbox/${item!.id}/approve`, {})
      expect(done.status).toBe(200)
      expect(done.body.item.resolvedAt).toBeGreaterThan(0)
      expect(done.body.message).toMatch(/aprobado/i)
      await vi.waitFor(() => expect(store.snapshotProject(conversation).tasks.some((t) => t.status === 'running')).toBe(true))
      expect((await api('/inbox')).body.items.find((i: { id: string }) => i.id === item!.id).resolution).toMatch(/^Aprobar/)
      cancelAll()
      await vi.waitFor(() => expect(activeRunsFor(conversation)).toEqual([]))
      const task = store.snapshotProject(conversation).tasks[0]
      const changes = await api(`/tasks/${task.id}/changes`)
      expect(changes.status).toBe(200)
      expect(changes.body.taskId).toBe(task.id)
      expect((await api('/tasks/no-existe/changes')).status).toBe(404)
      expect((await api('/tasks/no-existe/undo', {})).status).toBe(404)
    } finally {
      cancelAll()
      await api('/settings/plan-approval', { enabled: false })
    }
  }, 30_000)

  it('«/model» desde el móvil: ve y cambia el modelo de Hermes; como mensaje no le llega a Hermes', async () => {
    const info = {
      installed: true,
      current: { provider: 'omnirouter', model: 'auto/smart', fromApp: false },
      hermesDefault: { provider: 'omnirouter', model: 'auto/smart' },
      providers: [{ id: 'omnirouter', label: 'omnirouter', models: ['auto/smart', 'claude/claude-opus-5'] }, { id: 'anthropic', label: 'Anthropic', models: ['claude-opus-5-5'] }],
      updatedAt: 1791686531740
    }
    const chosen: unknown[] = []
    webMethods.set('getHermesModels', () => info)
    webMethods.set('setHermesModel', (c) => {
      chosen.push(c)
      return { ...info, current: c ? { ...(c as { provider: string; model: string }), fromApp: true } : info.current }
    })
    try {
      expect((await api('/snapshot')).body.capabilities.hermesModel).toBe(true)
      expect(await api('/hermes/models')).toEqual({ status: 200, body: info })
      const set = await api('/hermes/model', { provider: 'anthropic', model: 'claude-opus-5-5' })
      expect([set.status, set.body.current]).toEqual([200, { provider: 'anthropic', model: 'claude-opus-5-5', fromApp: true }])
      expect((await api('/hermes/model', { reset: true })).status).toBe(200)
      expect(chosen).toEqual([{ provider: 'anthropic', model: 'claude-opus-5-5' }, null])
      for (const bad of [{ provider: 'x; rm -rf ~', model: 'a' }, { reset: true, model: 'a' }, { provider: 'anthropic' }, { reset: false }]) {
        expect([bad, (await api('/hermes/model', bad)).status]).toEqual([bad, 400])
      }
    } finally {
      webMethods.delete('getHermesModels')
      webMethods.delete('setHermesModel')
    }
    // Una Órbita que aún no lo abre lo manda como mensaje: se contesta sin llamar a Hermes.
    const conversation = (await api('/conversations', {})).body.conversation.id as string
    const asked = prompts.length
    const sent = await api('/chat/messages', { conversationId: conversation, text: '/model', clientMessageId: 'model-1' })
    expect(sent.status).toBe(202)
    expect(prompts.length).toBe(asked)
    expect(activeRunsFor(conversation)).toEqual([])
    const reply = store.snapshotProject(conversation).messages.at(-1)!
    expect([reply.author.type, reply.text]).toEqual(['system', expect.stringContaining('«/model» abre la lista de modelos de Hermes')])
  })

  it('actualizar el servidor desde el móvil: dice si hay versión nueva, la instala y cuenta si falló', async () => {
    let status: UpdateStatus = { canUpdate: true, current: { hash: 'a1', date: '2026-10-12', subject: 'Antes' }, branch: 'master', commits: [{ hash: 'b2', date: '2026-10-13', subject: 'Nuevo' }] }
    const applied: unknown[] = []
    let finish: (message: string) => void = () => undefined
    webMethods.set('checkForUpdates', () => status)
    webMethods.set('applyUpdate', (setAside) => {
      applied.push(setAside)
      return new Promise<string>((resolve) => { finish = resolve })
    })
    try {
      expect((await api('/snapshot')).body.capabilities.serverUpdate).toBe(true)
      expect((await api('/server/update')).body).toMatchObject({ canUpdate: true, commitCount: 1, commits: [{ subject: 'Nuevo' }], updating: false, lastError: null })
      expect(await api('/server/update', {})).toEqual({ status: 200, body: { status: 'started' } })
      expect((await api('/server/update')).body.updating).toBe(true)
      expect((await api('/server/update', {})).body.code).toBe('UPDATE_RUNNING')
      // Si falla (vuelve a la versión anterior), se cuenta por qué.
      finish('No se pudo actualizar: Compilando kywai: falló')
      await vi.waitFor(async () => expect((await api('/server/update')).body).toMatchObject({ updating: false, lastError: expect.stringContaining('No se pudo actualizar') }))
      status = { canUpdate: true, branch: 'master', commits: [] }
      expect((await api('/server/update', {})).body.code).toBe('UP_TO_DATE')
      // Con cambios hechos en el servidor, solo apartándolos.
      status = { canUpdate: false, reason: 'Cambios hechos aquí', branch: 'master', commits: [{ hash: 'b2', date: '2026-10-13', subject: 'Nuevo' }], localChanges: ['src/a.ts'] }
      expect((await api('/server/update')).body).toMatchObject({ canUpdate: false, reason: 'Cambios hechos aquí', localChanges: 1 })
      expect((await api('/server/update', {})).body.code).toBe('UPDATE_NOT_POSSIBLE')
      expect((await api('/server/update', { setAside: 'sí' })).status).toBe(400)
      expect((await api('/server/update', { setAside: true })).status).toBe(200)
      expect(applied).toEqual([false, true])
      finish('')
    } finally {
      webMethods.delete('checkForUpdates')
      webMethods.delete('applyUpdate')
    }
    expect((await api('/snapshot')).body.capabilities.serverUpdate).toBe(false)
  })

  it('«Reiniciar agente» desde el móvil: lo deja disponible; uno que no existe da 404', async () => {
    expect((await api('/snapshot')).body.capabilities.agentReset).toBe(true)
    setRuntime('codex', { activity: 'error', reason: '[API Error: An unknown error occurred.]' })
    expect(await api('/agents/codex/reset', {})).toEqual({ status: 200, body: { agentId: 'codex', activity: 'idle', reason: null } })
    expect(runtimeSnapshot().find((r) => r.agentId === 'codex')).toMatchObject({ activity: 'idle', lastActivity: 'Reiniciado' })
    expect((await api('/agents/nadie/reset', {})).body.code).toBe('AGENT_NOT_FOUND')
    expect((await api('/agents/codex/reset', { force: true })).status).toBe(400)
    expect((await api('/agents/codex/reset')).status).toBe(405)
  })

  it('razonamiento del modelo local desde el móvil: solo en el agente de LM Studio', async () => {
    expect((await api('/snapshot')).body.capabilities.agentThinking).toBe(true)
    const local = getConfig().agents.find((a) => a.id === 'codex')!
    const before = local.provider
    local.provider = 'lmstudio'
    try {
      expect(await api('/agents/codex/thinking', { enabled: true })).toEqual({ status: 200, body: { agentId: 'codex', thinking: true } })
      expect(getConfig().agents.find((a) => a.id === 'codex')?.thinking).toBe(true)
      expect((await api('/snapshot')).body.agents.find((a: { id: string }) => a.id === 'codex').thinking).toBe(true)
      expect(await api('/agents/codex/thinking', { enabled: false })).toEqual({ status: 200, body: { agentId: 'codex', thinking: false } })
      expect(getConfig().agents.find((a) => a.id === 'codex')?.thinking).toBeUndefined()
      expect((await api('/agents/codex/thinking', { enabled: 'sí' })).status).toBe(400)
    } finally {
      local.provider = before
    }
    expect((await api('/agents/codex/thinking', { enabled: true })).body.code).toBe('INVALID_INPUT')
    expect((await api('/agents/nadie/thinking', { enabled: true })).body.code).toBe('AGENT_NOT_FOUND')
  })

  it('rutinas desde el móvil: las ve sin el secreto del webhook y las lanza («Ejecutar ahora»), sin duplicar', async () => {
    expect((await api('/snapshot')).body.capabilities.routines).toBe(false)
    const launched: string[] = []
    initRoutines(
      {
        send: async (input) => {
          launched.push(input.text)
          return { runId: `rutina-${launched.length}` }
        },
        runState: (_p, runId) => (runId === 'rutina-1' ? 'running' : null),
        projectBusy: () => false,
        webBases: () => []
      },
      { firstCheckMs: 1e9 }
    )
    webMethods.set('runRoutineNow', (id, routineId) => runRoutineNow(id as string, routineId as string))
    try {
      const id = (await api('/conversations', {})).body.conversation.id as string
      const r = createRoutine(id, { name: 'Revisar PR', request: 'Revisa el PR que llega', trigger: { type: 'webhook' } })
      const secret = store.getProject(id).routines![0].webhookSecret!
      expect((await api('/snapshot')).body.capabilities.routines).toBe(true)
      const listed = await api(`/routines?conversationId=${id}`)
      expect(listed.status).toBe(200)
      expect(listed.body.routines).toEqual([expect.objectContaining({ id: r.id, name: 'Revisar PR', hasSecret: true, trigger: { type: 'webhook' }, runs: [] })])
      expect(JSON.stringify(listed.body)).not.toContain(secret)
      const run = await api(`/routines/${r.id}/run`, { conversationId: id })
      expect(run).toEqual({ status: 200, body: { run: expect.objectContaining({ status: 'running', reason: 'manual', runId: 'rutina-1' }) } })
      // La anterior sigue en marcha: se apunta como saltada y no se lanza otra.
      expect((await api(`/routines/${r.id}/run`, { conversationId: id })).body.run.status).toBe('skipped')
      expect(launched).toEqual(['Revisa el PR que llega'])
      // El webhook va por el mismo servidor web, sin el código de acceso: solo con el secreto de la rutina.
      const hook = (path: string): Promise<Response> => fetch(`${base}/hooks/${id}/${r.id}${path}`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
      expect((await hook('/no-es-el-secreto')).status).toBe(404)
      expect((await hook(`/${CODE}`)).status).toBe(404)
      const viaHook = await hook(`/${secret}`)
      expect(viaHook.status).toBe(202)
      expect(await viaHook.json()).toEqual({ status: 'skipped' })
      expect(launched).toHaveLength(1)
      expect((await api(`/routines/rnoexiste/run`, { conversationId: id })).body.code).toBe('ROUTINE_NOT_FOUND')
      expect((await api(`/routines/${r.id}/run`, { conversationId: 'no-existe' })).body.code).toBe('CONVERSATION_NOT_FOUND')
      expect((await api(`/routines/${r.id}/run`, {})).status).toBe(400)
      expect((await api('/routines')).status).toBe(400)
    } finally {
      stopRoutines()
      webMethods.delete('runRoutineNow')
    }
  })

  it('ofrece la última versión de Órbita y su APK para que el móvil se actualice sin pasarla a mano', async () => {
    // Sin código descargado de GitHub (como aquí) no hay nada que ofrecer.
    expect((await api('/app/android')).body.code).toBe('NO_ORBITA_RELEASE')
    expect((await api('/snapshot')).body.capabilities.appUpdate).toBe(true)
    const dir = mkdtempSync(join(tmpdir(), 'aicw-orbita-'))
    __setOrbitaReleaseDirForChecks(dir)
    try {
      const apk = randomBytes(4096)
      const sha256 = createHash('sha256').update(apk).digest('hex')
      writeFileSync(join(dir, 'orbita.apk'), apk)
      // Datos sin su APK, o una APK sin datos: incompleta.
      expect((await api('/app/android')).status).toBe(404)
      writeFileSync(join(dir, 'orbita.json'), JSON.stringify({ versionCode: 812, versionName: '1.812', sha256, builtAt: '2026-10-12T10:00:00Z' }))
      expect(await api('/app/android')).toEqual({ status: 200, body: { versionCode: 812, versionName: '1.812', size: 4096, sha256, builtAt: '2026-10-12T10:00:00Z' } })
      const file = await raw('/app/android/apk')
      expect([file.status, file.headers.get('content-type'), file.body.equals(apk)]).toEqual([200, 'application/vnd.android.package-archive', true])
      // Solo para móviles emparejados, y sin consultas de más.
      expect((await raw('/app/android/apk', {}, '')).status).toBe(401)
      expect((await api('/app/android?v=1')).status).toBe(400)
      expect((await api('/app/android/apk', {})).status).toBe(405)
      // Una APK que no es la anotada no se ofrece ni se entrega.
      writeFileSync(join(dir, 'orbita.apk'), randomBytes(5000))
      expect((await api('/app/android')).body.code).toBe('NO_ORBITA_RELEASE')
      expect((await raw('/app/android/apk')).status).toBe(404)
      writeFileSync(join(dir, 'orbita.json'), JSON.stringify({ versionCode: 0, versionName: '1.0', sha256 }))
      expect((await api('/app/android')).status).toBe(404)
    } finally {
      __setOrbitaReleaseDirForChecks(undefined)
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('propone el plan y espera el visto bueno: los cambios se piden por el chat, «sí» o el botón lo aprueban y descartarlo no hace nada', async () => {
    const client = await websocket(token)
    expect(await api('/settings/plan-approval', { enabled: true })).toEqual({ status: 200, body: { planApproval: true } })
    try {
      const conversation = (await api('/conversations', {})).body.conversation.id as string
      const pendingPlan = (): ChatMessage | undefined => store.snapshotProject(conversation).messages.find((m) => m.proposal?.status === 'pending')
      const planned = (): boolean => prompts.some((p) => p.includes('Ahora SOLO tienes que planificar'))

      // Propone y no empieza nada.
      await api('/chat/messages', { conversationId: conversation, text: 'Haz el informe', clientMessageId: 'plan-1' })
      await vi.waitFor(() => expect(pendingPlan()).toBeTruthy())
      const first = pendingPlan()!
      expect(first.proposal).toMatchObject({ status: 'pending', request: 'Haz el informe', tasks: [expect.objectContaining({ title: 'Prueba móvil', agentId: 'codex', dependsOn: [] })] })
      expect(store.snapshotProject(conversation).tasks).toEqual([])
      expect(activeRunsFor(conversation)).toEqual([])
      const snap = (await api(`/snapshot?conversationId=${conversation}`)).body as MobileSnapshot
      expect([snap.capabilities.planApproval, snap.settings.planApproval]).toEqual([true, true])
      schemaFormat('Snapshot', snap)

      // Le pide cambios: vuelve a planificar con el plan anterior y la respuesta; el anterior queda «revised».
      prompts.length = 0
      await api('/chat/messages', { conversationId: conversation, text: 'Que sea más corto', clientMessageId: 'plan-2' })
      await vi.waitFor(() => expect(pendingPlan()?.id ?? first.id).not.toBe(first.id))
      expect(store.snapshotProject(conversation).messages.find((m) => m.id === first.id)!.proposal!.status).toBe('revised')
      expect(prompts.find((p) => p.includes('## Su respuesta a ese plan'))).toMatch(/«Prueba móvil» → [^\n]+\n[\s\S]*Que sea más corto/)
      const second = pendingPlan()!
      expect(second.proposal!.request).toBe('Haz el informe\n\nCambios que pidió al revisar el plan: Que sea más corto')

      // «Sí, adelante» por el chat lo aprueba sin volver a planificar.
      prompts.length = 0
      const yes = (await api('/chat/messages', { conversationId: conversation, text: 'Sí, adelante', clientMessageId: 'plan-3' })).body as MobileChatReceipt
      expect(yes.requestId).toBe(second.runId)
      await vi.waitFor(() => expect(store.snapshotProject(conversation).tasks.some((t) => t.runId === second.runId && t.status === 'running')).toBe(true))
      expect(planned()).toBe(false)
      // Antes de lanzar el agente se guarda la instantánea de la carpeta: el encargo llega un momento después.
      await vi.waitFor(() => expect(prompts.some((p) => p.includes('Que sea más corto'))).toBe(true))
      const approved = store.snapshotProject(conversation).messages.find((m) => m.id === second.id)!
      expect([approved.proposal!.status, approved.taskIds?.length]).toEqual(['approved', 1])
      const again = await api(`/plans/${second.id}/approve`, { conversationId: conversation })
      expect(again.status).toBe(409)
      errorFormat(again.body)
      cancelAll()

      // Con los botones: descartar no crea nada; aprobar lo pone en marcha y avisa por WebSocket.
      await api('/chat/messages', { conversationId: conversation, text: 'Otra cosa distinta', clientMessageId: 'plan-4' })
      await vi.waitFor(() => expect(pendingPlan()).toBeTruthy())
      const third = pendingPlan()!
      expect(await api(`/plans/${third.id}/reject`, { conversationId: conversation })).toEqual({ status: 200, body: { conversationId: conversation, messageId: third.id, requestId: third.runId, status: 'rejected' } })
      expect(store.snapshotProject(conversation).tasks.filter((t) => t.runId === third.runId)).toEqual([])
      await api('/chat/messages', { conversationId: conversation, text: 'Y ahora esto', clientMessageId: 'plan-5' })
      await vi.waitFor(() => expect(pendingPlan()).toBeTruthy())
      const fourth = pendingPlan()!
      const ok = await api(`/plans/${fourth.id}/approve`, { conversationId: conversation })
      expect(ok).toEqual({ status: 200, body: { conversationId: conversation, messageId: fourth.id, requestId: fourth.runId, status: 'approved' } })
      schemaFormat('PlanDecision', ok.body)
      await vi.waitFor(() => expect(store.snapshotProject(conversation).tasks.some((t) => t.runId === fourth.runId && t.status === 'running')).toBe(true))
      const update = received(client.frames, 'message.upsert')
        .map((e) => e.payload.message as ChatMessage)
        .find((m) => m.id === fourth.id && m.proposal?.status === 'approved')
      expect(update?.taskIds).toHaveLength(1)
      const missing = await api('/plans/no-existe/approve', { conversationId: conversation })
      expect(missing.status).toBe(404)
      errorFormat(missing.body)
    } finally {
      cancelAll()
      expect(await api('/settings/plan-approval', { enabled: false })).toEqual({ status: 200, body: { planApproval: false } })
    }
  })

  it('convierte una nota de voz en texto con el dictado del propio equipo y no guarda el audio', async () => {
    expect((await api('/snapshot')).body.capabilities.voice).toBe(false)
    const seen: { path: string; language: unknown; bytes: number; exists: boolean }[] = []
    webMethods.set('transcribeAudio', async (path, language) => {
      const file = path as string
      seen.push({ path: file, language, bytes: readFileSync(file).length, exists: true })
      return '  hola equipo  '
    })
    try {
      expect((await api('/snapshot')).body.capabilities.voice).toBe(true)
      const audio = Buffer.from('RIFF....WAVEfmt prueba de audio')
      const ok = await raw('/voice/transcribe?language=es', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio })
      expect(ok.status).toBe(200)
      expect(JSON.parse(ok.body.toString())).toEqual({ text: 'hola equipo' })
      expect(seen).toEqual([{ path: expect.stringMatching(/ai-cowork-pegados.*nota-de-voz.wav$/), language: 'es', bytes: audio.length, exists: true }])
      // El audio no se queda en el equipo.
      expect(existsSync(dirname(seen[0].path))).toBe(false)

      const m4a = await raw('/voice/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/mp4' }, body: audio })
      expect(m4a.status).toBe(200)
      expect(seen[1].path).toMatch(/.m4a$/)
      expect(seen[1].language).toBe('es')

      const wrongType = await raw('/voice/transcribe', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: audio })
      expect(wrongType.status).toBe(415)
      expect((await raw('/voice/transcribe?language=espanol', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio })).status).toBe(400)
      expect((await raw('/voice/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: Buffer.alloc(0) })).status).toBe(400)

      webMethods.set('transcribeAudio', async () => { throw new Error('Whisper no arrancó') })
      const failed = await raw('/voice/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio })
      expect(failed.status).toBe(500)
      expect(JSON.parse(failed.body.toString())).toEqual({ code: 'TRANSCRIPTION_FAILED', message: 'Whisper no arrancó', retryable: true })
    } finally {
      webMethods.delete('transcribeAudio')
    }
  })

  it.runIf(process.env.AI_COWORK_ANDROID_INTEGRATION === '1')('cliente Android contra backend real por HTTPS y Tailscale', async () => {
    const host = process.env.AI_COWORK_TAILSCALE_HOST ?? '127.0.0.1'
    const certificate = selfSignedCert(['127.0.0.1', host])
    await startWebServer(port, CODE, () => certificate, allAgents)
    const project = store.createProject('Integración Android')
    addMemory(project.id, { kind: 'fact', text: 'Memoria real de integración' }, { status: 'confirmed', by: 'user', byName: 'Tú' })
    const result = await promisify(execFile)(join(process.cwd(), 'android/gradlew'), [
      ':app:testDebugUnitTest', '--tests', '*RealBackendIntegrationTest', '--rerun-tasks'
    ], {
      cwd: join(process.cwd(), 'android'), timeout: 240_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@21',
        AI_COWORK_TEST_URL: `https://${host}:${port + 1}`,
        AI_COWORK_TEST_CODE: CODE,
        AI_COWORK_TEST_PIN: new X509Certificate(certificate.cert).fingerprint256 }
    })
    expect(result.stdout).toContain('BUILD SUCCESSFUL')
    if (process.env.AI_COWORK_ANDROID_DEVICE === '1') {
      const deviceResult = await promisify(execFile)(join(process.cwd(), 'android/gradlew'), [
        ':app:connectedDebugAndroidTest',
        `-Pandroid.testInstrumentationRunnerArguments.serverUrl=https://${host}:${port + 1}`,
        `-Pandroid.testInstrumentationRunnerArguments.pairCode=${CODE}`,
        `-Pandroid.testInstrumentationRunnerArguments.fingerprint=${new X509Certificate(certificate.cert).fingerprint256}`
      ], { cwd: join(process.cwd(), 'android'), timeout: 240_000, maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@21' } })
      expect(deviceResult.stdout).toContain('BUILD SUCCESSFUL')
    }
    console.log(`Android → API/motor reales: HTTPS ${host}, integración completada`)
  }, 500_000)

})
