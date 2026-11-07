import { isUtf8 } from 'node:buffer'
import { promises as fsp } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { CoworkEvent, MemoryKind, MemoryStatus, MobileOnlyEvent } from '@shared/types'
import type { MobileEventEnvelope } from '@shared/mobile'
import type { DeviceKind, DeviceRegistry } from './devices'
import { MobileAuth } from './mobileAuth'
import { MobileBackend } from './mobileBackend'
import { MobileError, mobileErrorBody, mobileJson } from './mobileErrors'
import { receiveUpload, sendFile, uploadName } from './mobileFiles'
import { MobileWebSocket, rejectUpgrade } from './mobileWebSocket'
import { orbitaRelease } from './orbitaRelease'

export const MOBILE_PREFIX = '/api/mobile/v1'
const MAX_BODY = 256 * 1024
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,80}$/
const MEMORY_KINDS: readonly string[] = ['decision', 'fact', 'preference', 'pending']
const MEMORY_STATUSES: readonly string[] = ['confirmed', 'provisional', 'superseded']

/** Ruta relativa → nombre y métodos admitidos; los parámetros son los grupos de la expresión. */
const ROUTES: Array<[RegExp, string, string[]]> = [
  [/^\/pair$/, 'pair', ['POST']],
  [/^\/device$/, 'device', ['GET']],
  [/^\/device\/revoke$/, 'deviceRevoke', ['POST']],
  [/^\/snapshot$/, 'snapshot', ['GET']],
  [/^\/events$/, 'events', ['GET']],
  [/^\/chat\/messages$/, 'chat', ['POST']],
  [/^\/conversations$/, 'conversations', ['POST']],
  [/^\/chats$/, 'chats', ['GET', 'POST']],
  [/^\/chats\/([^/]+)\/(open|rename|delete)$/, 'chatAction', ['POST']],
  [/^\/search$/, 'search', ['GET']],
  [/^\/music\/search$/, 'musicSearch', ['GET']],
  [/^\/requests\/([^/]+)\/(stop|resume|discard)$/, 'control', ['POST']],
  [/^\/plans\/([^/]+)\/(approve|reject)$/, 'plan', ['POST']],
  [/^\/projects$/, 'projects', ['GET']],
  [/^\/tasks\/([^/]+)\/trace$/, 'trace', ['GET']],
  [/^\/memory$/, 'memoryAdd', ['POST']],
  [/^\/memory\/([^/]+)$/, 'memoryUpdate', ['POST']],
  [/^\/memory\/([^/]+)\/delete$/, 'memoryDelete', ['POST']],
  [/^\/instructions$/, 'instructions', ['POST']],
  [/^\/routines$/, 'routines', ['GET']],
  [/^\/routines\/([^/]+)\/run$/, 'routineRun', ['POST']],
  [/^\/artifacts\/([^/]+)\/raw$/, 'artifactRaw', ['GET']],
  [/^\/files$/, 'files', ['GET', 'POST']],
  [/^\/files\/raw$/, 'fileRaw', ['GET']],
  [/^\/settings\/agent-access$/, 'agentAccess', ['POST']],
  [/^\/settings\/plan-approval$/, 'planApproval', ['POST']],
  [/^\/usage\/refresh$/, 'usageRefresh', ['POST']],
  [/^\/quality$/, 'quality', ['GET']],
  [/^\/inbox$/, 'inbox', ['GET']],
  [/^\/inbox\/([^/]+)\/([a-z][a-z0-9-]{0,39})$/, 'inboxAction', ['POST']],
  [/^\/tasks\/([^/]+)\/changes$/, 'taskChanges', ['GET']],
  [/^\/tasks\/([^/]+)\/undo$/, 'taskUndo', ['POST']],
  [/^\/voice\/transcribe$/, 'voice', ['POST']],
  [/^\/app\/android$/, 'orbitaRelease', ['GET']],
  [/^\/app\/android\/apk$/, 'orbitaApk', ['GET']],
  [/^\/hermes\/models$/, 'hermesModels', ['GET']],
  [/^\/hermes\/model$/, 'hermesModel', ['POST']],
  [/^\/agents\/([^/]+)\/reset$/, 'agentReset', ['POST']],
  [/^\/agents\/([^/]+)\/thinking$/, 'agentThinking', ['POST']],
  [/^\/server\/update$/, 'serverUpdate', ['GET', 'POST']]
]

/** Lo que se le pasa a Hermes con --provider y -m (como valida el escritorio). */
const HERMES_PROVIDER = /^[\w.\-:]{1,120}$/
const HERMES_MODEL = /^[\w.:\-/@]{1,200}$/

/** Formatos de nota de voz que entiende el dictado (Whisper), por su tipo. */
const VOICE_TYPES: Record<string, string> = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a',
  'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mpeg': 'mp3'
}

function route(path: string): { name: string; methods: string[]; params: string[] } | null {
  for (const [pattern, name, methods] of ROUTES) {
    const match = pattern.exec(path)
    if (match) return { name, methods, params: match.slice(1) }
  }
  return null
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] ?? '')) throw new MobileError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Usa Content-Type: application/json')
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new MobileError(415, 'UNSUPPORTED_ENCODING', 'Envía JSON sin comprimir')
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) { req.resume(); throw new MobileError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera 256 KiB') }
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let length = 0
    let tooLarge = false
    req.on('data', (data: Buffer) => {
      if (tooLarge) return
      length += data.length
      if (length > MAX_BODY) {
        tooLarge = true
        chunks.length = 0
        reject(new MobileError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera 256 KiB'))
        return
      }
      chunks.push(data)
    })
    req.once('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks)) })
    req.once('error', reject)
    req.once('aborted', () => reject(new MobileError(400, 'INVALID_INPUT', 'La petición se interrumpió')))
  })
  if (!isUtf8(raw)) throw new MobileError(400, 'INVALID_JSON', 'El cuerpo debe ser JSON UTF-8')
  let parsed: unknown
  try { parsed = JSON.parse(raw.toString('utf8')) } catch { throw new MobileError(400, 'INVALID_JSON', 'El cuerpo debe ser un objeto JSON válido') }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new MobileError(400, 'INVALID_INPUT', 'El cuerpo debe ser un objeto JSON')
  return parsed as Record<string, unknown>
}

function fields(input: Record<string, unknown>, expected: string[], optional: string[] = []): void {
  if (Object.keys(input).some((key) => !expected.includes(key) && !optional.includes(key)) || expected.some((key) => !Object.hasOwn(input, key))) throw new MobileError(400, 'INVALID_INPUT', 'Los campos no corresponden al contrato')
}

/** Parámetros de consulta: solo los admitidos, cada uno una vez como mucho, y los obligatorios presentes. */
function query(url: URL, allowed: string[], required: string[] = []): Record<string, string | undefined> {
  const params = url.searchParams
  if ([...params.keys()].some((key) => !allowed.includes(key)) || allowed.some((key) => params.getAll(key).length > 1) || required.some((key) => !params.has(key))) {
    throw new MobileError(400, 'INVALID_INPUT', 'Consulta no válida')
  }
  return Object.fromEntries(allowed.map((key) => [key, params.get(key) ?? undefined]))
}

function string(input: unknown, name: string, max: number): string {
  if (typeof input !== 'string' || !input.trim() || input.length > max || input.includes('\0')) throw new MobileError(400, 'INVALID_INPUT', `${name} debe ser texto no vacío de hasta ${max} caracteres`)
  return input
}

function conversationId(input: unknown): string | null {
  if (input === null) return null
  if (typeof input !== 'string' || !PROJECT_ID.test(input)) throw new MobileError(400, 'INVALID_INPUT', 'conversationId no válido')
  return input
}

/** conversationId obligatorio (no admite null). */
function projectId(input: unknown): string {
  if (input === null) throw new MobileError(400, 'INVALID_INPUT', 'conversationId no válido')
  return conversationId(input)!
}

/** Id de un chat de un proyecto (el mismo formato que admite conversations.ts). */
function chatId(input: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(input)) throw new MobileError(400, 'INVALID_INPUT', 'chatId no válido')
  return input
}

function id(input: string, name: string): string {
  if (!ID.test(input)) throw new MobileError(400, 'INVALID_INPUT', `${name} no válido`)
  return input
}

/** El almacén une espacios, descarta lo que queda con menos de 3 caracteres y recorta a 400. */
function memoryText(input: unknown): string {
  const text = string(input, 'text', 2000)
  if (text.replace(/\s+/g, ' ').trim().length < 3) throw new MobileError(400, 'INVALID_INPUT', 'text debe tener al menos 3 caracteres')
  return text
}

function memoryKind(input: unknown): MemoryKind {
  if (typeof input !== 'string' || !MEMORY_KINDS.includes(input)) throw new MobileError(400, 'INVALID_INPUT', 'kind debe ser decision, fact, preference o pending')
  return input as MemoryKind
}

/** La instancia comparte listeners HTTP/HTTPS, secuencias y bus del motor, sin copiar el estado de dominio. */
export class MobileApi {
  private readonly auth: MobileAuth
  private sequence = 0
  private readonly clients = new Set<MobileWebSocket>()
  /** Dispositivo de cada conexión abierta, para cerrarlas al revocarlo. */
  private readonly clientDevice = new Map<MobileWebSocket, string>()
  private readonly pairingFailures = new Map<string, { count: number; until: number }>()

  constructor(code: string, private readonly serverName: string, private readonly bootId: string, private readonly backend: MobileBackend, signingKey?: Buffer, private readonly devices?: DeviceRegistry) {
    this.auth = new MobileAuth(code, Date.now, signingKey, devices)
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://cowork')
    if (url.pathname !== MOBILE_PREFIX && !url.pathname.startsWith(`${MOBILE_PREFIX}/`)) return false
    try {
      const path = url.pathname.slice(MOBILE_PREFIX.length)
      const caller = path !== '/pair' ? this.auth.authenticate(req) : undefined
      const target = route(path)
      if (!target) throw new MobileError(404, 'NOT_FOUND', 'Endpoint móvil no encontrado')
      if (!target.methods.includes(req.method ?? '')) { res.setHeader('Allow', target.methods.join(', ')); throw new MobileError(405, 'METHOD_NOT_ALLOWED', `Usa ${target.methods.join(' o ')}`) }
      const [param, action] = target.params
      switch (target.name) {
        case 'pair': {
          this.checkPairingRate(req)
          const input = await body(req)
          fields(input, ['code', 'deviceName'], ['kind', 'platform'])
          const code = string(input.code, 'code', 256)
          const deviceName = string(input.deviceName, 'deviceName', 120).trim()
          const kind = input.kind === undefined ? 'mobile' : input.kind
          if (kind !== 'mobile' && kind !== 'client') throw new MobileError(400, 'INVALID_INPUT', 'kind debe ser mobile o client')
          const platform = input.platform === undefined ? undefined : string(input.platform, 'platform', 40).trim()
          let token
          try { token = this.auth.pair(code, deviceName, { kind: kind as DeviceKind, platform, ip: req.socket.remoteAddress }) } catch (e) { this.recordPairingFailure(req); throw e }
          this.pairingFailures.delete(req.socket.remoteAddress ?? '')
          mobileJson(res, 200, { ...token, serverName: this.serverName })
          break
        }
        case 'device': {
          const device = caller?.deviceId ? this.devices?.get(caller.deviceId) : undefined
          mobileJson(res, 200, { device: device ? { id: device.id, name: device.name, kind: device.kind, ...(device.platform ? { platform: device.platform } : {}), createdAt: device.createdAt, lastSeenAt: device.lastSeenAt } : null })
          break
        }
        case 'deviceRevoke': {
          const input = await body(req)
          fields(input, [])
          if (!caller?.deviceId || !this.devices) throw new MobileError(409, 'LEGACY_DEVICE', 'Este emparejamiento es anterior a la lista de dispositivos: se quita generando un código de acceso nuevo en kywai')
          this.revokeDevice(caller.deviceId)
          mobileJson(res, 200, { revoked: true })
          break
        }
        case 'snapshot':
          if ([...url.searchParams.keys()].some((key) => key !== 'conversationId') || url.searchParams.getAll('conversationId').length > 1) throw new MobileError(400, 'INVALID_INPUT', 'Consulta no válida')
          mobileJson(res, 200, await this.backend.snapshot(conversationId(url.searchParams.get('conversationId')), this.bootId, () => this.sequence))
          break
        case 'events':
          throw new MobileError(426, 'WEBSOCKET_REQUIRED', 'Abre este endpoint con WebSocket y Authorization: Bearer')
        case 'chat': {
          const input = await body(req)
          fields(input, ['conversationId', 'text', 'clientMessageId'], ['attachmentIds'])
          const clientMessageId = string(input.clientMessageId, 'clientMessageId', 128)
          if (!ID.test(clientMessageId)) throw new MobileError(400, 'INVALID_INPUT', 'clientMessageId no válido')
          const attachmentIds = input.attachmentIds ?? []
          if (!Array.isArray(attachmentIds) || attachmentIds.length > 20 || attachmentIds.some((a) => typeof a !== 'string' || !ID.test(a))) throw new MobileError(400, 'INVALID_INPUT', 'attachmentIds debe ser una lista de hasta 20 identificadores de adjunto')
          mobileJson(res, 202, await this.backend.send(conversationId(input.conversationId), string(input.text, 'text', 50_000), clientMessageId, attachmentIds as string[]))
          break
        }
        case 'conversations': {
          const input = await body(req)
          fields(input, [], ['name'])
          const name = input.name === undefined ? undefined : string(input.name, 'name', 120).trim()
          mobileJson(res, 201, { conversation: await this.backend.createConversation(name) })
          break
        }
        // Chats de un proyecto (las conversaciones retomables de la barra lateral); conversationId es el proyecto.
        case 'chats': {
          if (req.method === 'GET') {
            mobileJson(res, 200, await this.backend.chats(projectId(query(url, ['conversationId'], ['conversationId']).conversationId)))
          } else {
            const input = await body(req)
            fields(input, ['conversationId'])
            mobileJson(res, 200, { conversation: await this.backend.newChat(projectId(input.conversationId)) })
          }
          break
        }
        case 'chatAction': {
          const chat = chatId(param)
          const input = await body(req)
          if (action === 'rename') {
            fields(input, ['conversationId', 'title'])
            mobileJson(res, 200, await this.backend.renameChat(projectId(input.conversationId), chat, string(input.title, 'title', 80)))
          } else {
            fields(input, ['conversationId'])
            const project = projectId(input.conversationId)
            mobileJson(res, 200, action === 'open' ? { conversation: await this.backend.openChat(project, chat) } : await this.backend.deleteChat(project, chat))
          }
          break
        }
        case 'search': {
          const params = query(url, ['q', 'conversationId'], ['q'])
          const q = params.q!.trim()
          if (!q || q.length > 200) throw new MobileError(400, 'INVALID_INPUT', 'q debe ser texto de hasta 200 caracteres')
          mobileJson(res, 200, await this.backend.search(q, params.conversationId === undefined ? undefined : projectId(params.conversationId)))
          break
        }
        case 'musicSearch': {
          const params = query(url, ['kind', 'q'], ['kind'])
          if (params.kind !== 'radio' && params.kind !== 'audius') throw new MobileError(400, 'INVALID_INPUT', 'kind debe ser radio o audius')
          const q = (params.q ?? '').trim()
          if (q.length > 200) throw new MobileError(400, 'INVALID_INPUT', 'q debe tener hasta 200 caracteres')
          mobileJson(res, 200, await this.backend.musicSearch(params.kind, q))
          break
        }
        case 'control':
          fields(await body(req), [])
          mobileJson(res, 200, await this.backend.control(id(param, 'requestId'), action as 'stop' | 'resume' | 'discard'))
          break
        case 'plan': {
          const messageId = id(param, 'messageId')
          const input = await body(req)
          fields(input, ['conversationId'])
          mobileJson(res, 200, await this.backend.plan(projectId(input.conversationId), messageId, action as 'approve' | 'reject'))
          break
        }
        case 'projects':
          query(url, [])
          mobileJson(res, 200, { projects: await this.backend.projects() })
          break
        case 'trace':
          query(url, [])
          mobileJson(res, 200, await this.backend.trace(id(param, 'taskId')))
          break
        case 'taskChanges':
          query(url, [])
          mobileJson(res, 200, await this.backend.taskChanges(id(param, 'taskId')))
          break
        case 'taskUndo':
          fields(await body(req), [])
          mobileJson(res, 200, await this.backend.undoTask(id(param, 'taskId')))
          break
        case 'inbox':
          query(url, [])
          mobileJson(res, 200, await this.backend.inbox())
          break
        case 'inboxAction':
          fields(await body(req), [])
          mobileJson(res, 200, await this.backend.inboxAction(id(param, 'id'), action))
          break
        case 'memoryAdd': {
          const input = await body(req)
          fields(input, ['conversationId', 'kind', 'text'])
          const project = projectId(input.conversationId)
          const kind = memoryKind(input.kind)
          mobileJson(res, 201, { entry: await this.backend.addMemory(project, kind, memoryText(input.text)) })
          break
        }
        case 'memoryUpdate': {
          const memoryId = id(param, 'memoryId')
          const input = await body(req)
          fields(input, ['conversationId'], ['text', 'kind', 'status'])
          const project = projectId(input.conversationId)
          if (input.text === undefined && input.kind === undefined && input.status === undefined) throw new MobileError(400, 'INVALID_INPUT', 'Indica text, kind o status')
          const patch: { text?: string; kind?: MemoryKind; status?: MemoryStatus } = {}
          if (input.text !== undefined) patch.text = memoryText(input.text)
          if (input.kind !== undefined) patch.kind = memoryKind(input.kind)
          if (input.status !== undefined) {
            if (typeof input.status !== 'string' || !MEMORY_STATUSES.includes(input.status)) throw new MobileError(400, 'INVALID_INPUT', 'status debe ser confirmed, provisional o superseded')
            patch.status = input.status as MemoryStatus
          }
          mobileJson(res, 200, { entry: await this.backend.updateMemory(project, memoryId, patch) })
          break
        }
        case 'memoryDelete': {
          const memoryId = id(param, 'memoryId')
          const input = await body(req)
          fields(input, ['conversationId'])
          mobileJson(res, 200, await this.backend.deleteMemory(projectId(input.conversationId), memoryId))
          break
        }
        case 'instructions': {
          const input = await body(req)
          fields(input, ['conversationId', 'text'])
          const project = projectId(input.conversationId)
          // Puede quedar vacío: así se borran.
          if (typeof input.text !== 'string' || input.text.length > 8000 || input.text.includes('\0')) throw new MobileError(400, 'INVALID_INPUT', 'text debe ser texto de hasta 8000 caracteres')
          mobileJson(res, 200, await this.backend.setInstructions(project, input.text))
          break
        }
        case 'routines':
          mobileJson(res, 200, await this.backend.routines(projectId(query(url, ['conversationId'], ['conversationId']).conversationId)))
          break
        case 'routineRun': {
          const routineId = id(param, 'routineId')
          const input = await body(req)
          fields(input, ['conversationId'])
          mobileJson(res, 200, await this.backend.runRoutine(projectId(input.conversationId), routineId))
          break
        }
        case 'artifactRaw': {
          const artifactId = id(param, 'artifactId')
          const project = projectId(query(url, ['conversationId'], ['conversationId']).conversationId)
          await sendFile(res, await this.backend.artifactPath(project, artifactId), new MobileError(404, 'ARTIFACT_NOT_FOUND', 'No se encontró el resultado'))
          break
        }
        case 'files':
          if (req.method === 'GET') {
            const params = query(url, ['conversationId', 'q'], ['conversationId'])
            const q = params.q ?? ''
            if (q.length > 200 || q.includes('\0')) throw new MobileError(400, 'INVALID_INPUT', 'q no válido')
            mobileJson(res, 200, await this.backend.files(projectId(params.conversationId), q.trim()))
          } else {
            await this.upload(req, res, url)
          }
          break
        case 'fileRaw': {
          const params = query(url, ['conversationId', 'source', 'path'], ['conversationId', 'source', 'path'])
          const project = projectId(params.conversationId)
          if (params.source !== 'attachment' && params.source !== 'folder' && params.source !== 'project') throw new MobileError(400, 'INVALID_INPUT', 'source debe ser attachment, folder o project')
          await sendFile(res, await this.backend.filePath(project, params.source, params.path!), new MobileError(404, 'FILE_NOT_FOUND', 'No se encontró el archivo'))
          break
        }
        case 'agentAccess': {
          const input = await body(req)
          fields(input, ['access'])
          if (input.access !== 'full' && input.access !== 'project') throw new MobileError(400, 'INVALID_INPUT', 'access debe ser full o project')
          mobileJson(res, 200, await this.backend.setAgentAccess(input.access))
          break
        }
        case 'planApproval': {
          const input = await body(req)
          fields(input, ['enabled'])
          if (typeof input.enabled !== 'boolean') throw new MobileError(400, 'INVALID_INPUT', 'enabled debe ser true o false')
          mobileJson(res, 200, await this.backend.setPlanApproval(input.enabled))
          break
        }
        case 'agentReset':
          fields(await body(req), [])
          mobileJson(res, 200, await this.backend.resetAgent(id(param, 'agentId')))
          break
        case 'agentThinking': {
          const input = await body(req)
          fields(input, ['enabled'])
          if (typeof input.enabled !== 'boolean') throw new MobileError(400, 'INVALID_INPUT', 'enabled debe ser true o false')
          mobileJson(res, 200, await this.backend.setAgentThinking(id(param, 'agentId'), input.enabled))
          break
        }
        case 'serverUpdate':
          if (req.method === 'GET') {
            query(url, [])
            mobileJson(res, 200, await this.backend.serverUpdate())
          } else {
            const input = await body(req)
            fields(input, [], ['setAside'])
            if (input.setAside !== undefined && typeof input.setAside !== 'boolean') throw new MobileError(400, 'INVALID_INPUT', 'setAside debe ser true o false')
            mobileJson(res, 200, await this.backend.startServerUpdate(input.setAside === true))
          }
          break
        case 'usageRefresh':
          fields(await body(req), [])
          mobileJson(res, 200, await this.backend.refreshUsage())
          break
        case 'quality': {
          const { days } = query(url, ['days'])
          if (days !== undefined && !/^(?:[1-9]\d{0,2})$/.test(days)) throw new MobileError(400, 'INVALID_INPUT', 'days debe ser un número de días entre 1 y 999')
          mobileJson(res, 200, await this.backend.quality(days === undefined ? 30 : Number(days)))
          break
        }
        case 'voice':
          await this.voice(req, res, url)
          break
        case 'hermesModels':
          query(url, [])
          mobileJson(res, 200, await this.backend.hermesModels())
          break
        case 'hermesModel': {
          // {provider, model} elige uno; {reset: true} vuelve al de la configuración de Hermes.
          const input = await body(req)
          fields(input, [], ['provider', 'model', 'reset'])
          if (input.reset === true && input.provider === undefined && input.model === undefined) {
            mobileJson(res, 200, await this.backend.setHermesModel(null))
            break
          }
          if (input.reset !== undefined || typeof input.provider !== 'string' || typeof input.model !== 'string' || !HERMES_PROVIDER.test(input.provider) || !HERMES_MODEL.test(input.model)) {
            throw new MobileError(400, 'INVALID_INPUT', 'Indica provider y model válidos, o reset: true')
          }
          mobileJson(res, 200, await this.backend.setHermesModel({ provider: input.provider, model: input.model }))
          break
        }
        case 'orbitaRelease':
        case 'orbitaApk': {
          query(url, [])
          const release = await orbitaRelease()
          if (!release) throw new MobileError(404, 'NO_ORBITA_RELEASE', 'El ordenador aún no tiene ninguna versión de Órbita para descargar: actualiza kywai en él (⚙ → «Buscar actualizaciones…»).')
          if (target.name === 'orbitaRelease') mobileJson(res, 200, release.info)
          else await sendFile(res, release.apk, new MobileError(404, 'NO_ORBITA_RELEASE', 'La APK de Órbita ya no está en el ordenador'))
          break
        }
      }
    } catch (e) {
      // Un fallo con el archivo ya a medio enviar solo puede cortar la conexión.
      if (res.headersSent) res.destroy()
      else mobileJson(res, e instanceof MobileError ? e.status : 500, mobileErrorBody(e))
    }
    return true
  }

  /** Cuerpo sin JSON (cualquier tipo, hasta 25 MB) → adjunto del proyecto, sin enviar ningún mensaje. */
  private async upload(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const params = query(url, ['conversationId', 'name'], ['conversationId', 'name'])
    const project = projectId(params.conversationId)
    const name = uploadName(params.name!)
    // Antes de recibir el archivo: una conversación que no existe no obliga a subirlo entero.
    await this.backend.ensureConversation(project)
    const upload = await receiveUpload(req, name)
    try {
      mobileJson(res, 201, { attachment: await this.backend.addAttachment(project, upload.file) })
    } finally {
      await fsp.rm(upload.dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
    }
  }

  /** Nota de voz (WAV, M4A, OGG, WebM o MP3, hasta 25 MB) → texto con el dictado del propio equipo. */
  private async voice(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const language = query(url, ['language']).language ?? 'es'
    if (!/^[a-z]{2}$/.test(language)) throw new MobileError(400, 'INVALID_INPUT', 'language debe ser un código de dos letras')
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
    const ext = VOICE_TYPES[type]
    if (!ext) {
      req.resume()
      throw new MobileError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envía la nota como audio/wav, audio/mp4, audio/ogg, audio/webm o audio/mpeg')
    }
    const upload = await receiveUpload(req, `nota-de-voz.${ext}`)
    try {
      if (upload.size === 0) throw new MobileError(400, 'INVALID_INPUT', 'La nota de voz está vacía')
      const audio = new Uint8Array(await fsp.readFile(upload.file))
      mobileJson(res, 200, await this.backend.transcribe(audio, ext, language))
    } finally {
      await fsp.rm(upload.dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {})
    }
  }

  upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    try {
      const url = new URL(req.url ?? '/', 'http://cowork')
      const { expires, deviceId } = this.auth.authenticate(req)
      if (url.pathname !== `${MOBILE_PREFIX}/events`) throw new MobileError(404, 'NOT_FOUND', 'WebSocket móvil no encontrado')
      if (url.search) throw new MobileError(400, 'INVALID_INPUT', 'El token WebSocket se envía únicamente en Authorization: Bearer')
      let client: MobileWebSocket | undefined
      client = MobileWebSocket.accept(req, socket, head, expires, () => { if (client) { this.clients.delete(client); this.clientDevice.delete(client) } })
      // head puede contener un close: no conservar una conexión ya cerrada.
      if (socket.writableEnded) return
      this.clients.add(client)
      if (deviceId) this.clientDevice.set(client, deviceId)
      client.send({ type: 'hello', sequence: this.sequence, payload: { bootId: this.bootId, snapshotRequired: true, heartbeatMs: 20_000 } })
    } catch (e) {
      rejectUpgrade(socket, e instanceof MobileError ? e : new MobileError(500, 'INTERNAL_ERROR', 'No se pudo abrir el WebSocket', true))
    }
  }

  broadcast(event: CoworkEvent | MobileOnlyEvent): void {
    const { kind, ...data } = event
    const payload: Record<string, unknown> = { ...data }
    if (event.kind === 'message.upsert') payload.message = { ...event.message, conversationId: event.message.projectId }
    if (event.kind === 'attachments.updated') payload.conversationId = event.projectId
    if (event.kind === 'usage.run') payload.usage = this.backend.currentUsage()
    if (event.kind === 'config.updated') {
      const { token: _token, ...access } = event.config.webAccess
      payload.config = { ...event.config, webAccess: access }
    }
    const envelope: MobileEventEnvelope = { type: kind === 'usage.run' ? 'usage.updated' : kind, sequence: ++this.sequence, payload }
    for (const client of this.clients) client.send(envelope)
  }

  /**
   * El token de un cliente de escritorio emparejado (va en la cookie de su interfaz): le da la misma interfaz web y API
   * que el enlace de acceso, pero revocable por separado. Los móviles no entran por aquí: solo usan la API móvil.
   */
  acceptsClient(token: string, ip?: string): boolean {
    return !!this.clientDeviceFor(token, ip)
  }

  /** El cliente de escritorio dueño de ese token, o null (token no válido, revocado o de un móvil). */
  clientDeviceFor(token: string, ip?: string): { id: string; name: string } | null {
    try {
      const { deviceId } = this.auth.verify(token, ip)
      const device = deviceId ? this.devices?.get(deviceId) : undefined
      return device && device.kind === 'client' ? { id: device.id, name: device.name } : null
    } catch {
      return null
    }
  }

  /** Revoca un dispositivo y corta sus conexiones abiertas; devuelve false si no existe. */
  revokeDevice(id: string): boolean {
    if (!this.devices?.revoke(id)) return false
    for (const [client, deviceId] of this.clientDevice) {
      if (deviceId !== id) continue
      client.close()
      this.clients.delete(client)
      this.clientDevice.delete(client)
    }
    return true
  }

  /** Código de 6 cifras para emparejar un móvil (10 minutos, un solo uso). */
  newPin(): { pin: string; expiresAt: number } {
    return this.auth.newPin()
  }

  close(): void {
    for (const client of this.clients) client.close()
    this.clients.clear()
    this.clientDevice.clear()
    this.pairingFailures.clear()
  }

  private checkPairingRate(req: IncomingMessage): void {
    const now = Date.now()
    for (const [key, entry] of this.pairingFailures) if (entry.until <= now) this.pairingFailures.delete(key)
    const failure = this.pairingFailures.get(req.socket.remoteAddress ?? '')
    if (failure && failure.count >= 10) throw new MobileError(429, 'PAIRING_RATE_LIMITED', 'Demasiados códigos incorrectos; espera un minuto', true)
  }

  private recordPairingFailure(req: IncomingMessage): void {
    const address = req.socket.remoteAddress ?? ''
    const previous = this.pairingFailures.get(address)
    if (!previous && this.pairingFailures.size >= 1024) this.pairingFailures.delete(this.pairingFailures.keys().next().value!)
    this.pairingFailures.set(address, { count: (previous?.count ?? 0) + 1, until: previous?.until ?? Date.now() + 60_000 })
  }
}
