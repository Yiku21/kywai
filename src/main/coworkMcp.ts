// Servidor MCP de AI Cowork: herramientas que AI Cowork da a los agentes mientras hacen una tarea (Claude Code y Codex,
// que aceptan servidores MCP por la línea de comandos). Con ellas leen la memoria del proyecto y las habilidades del
// equipo, anotan lo que descubren, ven qué hacen los compañeros y te preguntan algo sin parar el trabajo (sale en
// «Te necesita»).
//
// Cómo funciona: el CLI lanza un script pequeño (ai-cowork-mcp.cjs, lo escribe AI Cowork en su carpeta de trabajo y
// lo ejecuta el propio Electron como Node) que habla MCP por stdio y pasa cada llamada a un servidor HTTP de AI Cowork
// en 127.0.0.1. Cada tarea lleva su propio token: solo sirve para su proyecto y su tarea, y se anula al terminar.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { dirname, join } from 'node:path'
import type { MemoryKind } from '@shared/types'
import { getConfig } from './config'
import { addInbox } from './inbox'
import { addMemory, instructionsOf, KIND_LABEL, memoryLines, memoryOf } from './memory'
import * as store from './projects'
import { listSkills, readSkill } from './skills'

export const MCP_SERVER_NAME = 'ai-cowork'

export interface McpTaskContext {
  projectId: string
  runId: string
  taskId: string
  taskTitle: string
  agentId: string
  agentName: string
}

/** Lo que el CLI necesita para lanzar el servidor. */
export interface McpLaunch {
  command: string
  args: string[]
  env: Record<string, string>
  /**
   * Configuración MCP en un archivo (Claude la lee con --mcp-config <archivo>). Los CLI se lanzan por la consola y
   * sus argumentos solo admiten texto sencillo: el JSON (comillas, llaves) no puede ir en la línea de comandos.
   */
  configFile: string
  /** Para anularlo al terminar la tarea. */
  token: string
}

interface ToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const MAX_QUESTIONS_PER_TASK = 3
const MAX_BODY = 64 * 1024

export const MCP_TOOLS: ToolDef[] = [
  {
    name: 'memoria_proyecto',
    description: 'Instrucciones fijas del usuario y memoria del proyecto (decisiones, hechos, preferencias y pendientes, con su id). Consúltala antes de decidir algo que pueda estar ya decidido.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'anotar_memoria',
    description: 'Anota en la memoria del proyecto algo que los demás deben saber en el futuro: una decisión tomada, un hecho descubierto del entorno o un pendiente. Queda provisional hasta que el usuario lo confirme.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['decision', 'hecho', 'preferencia', 'pendiente'] },
        texto: { type: 'string', description: 'Una frase concreta.' },
        sustituye: { type: 'string', description: 'Id de la entrada que deja anticuada (m12), si la hay.' }
      },
      required: ['tipo', 'texto'],
      additionalProperties: false
    }
  },
  {
    name: 'estado_equipo',
    description: 'Qué están haciendo ahora los demás agentes en este proyecto (tarea, agente, estado y lo último que hicieron), para no pisar su trabajo.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'preguntar_usuario',
    description: 'Deja una pregunta al usuario en su bandeja «Te necesita» (le llega también al móvil). No esperes la respuesta: sigue con la opción más razonable y di en tu respuesta final qué supusiste. Solo para dudas que cambian el resultado.',
    inputSchema: { type: 'object', properties: { pregunta: { type: 'string' } }, required: ['pregunta'], additionalProperties: false }
  },
  {
    name: 'leer_habilidad',
    description: 'Lee una habilidad del equipo (un procedimiento ya escrito) por su nombre. Sin nombre, lista las que hay.',
    inputSchema: { type: 'object', properties: { nombre: { type: 'string' } }, additionalProperties: false }
  }
]

const TIPO: Record<string, MemoryKind> = { decision: 'decision', decisión: 'decision', hecho: 'fact', preferencia: 'preference', pendiente: 'pending' }

const sessions = new Map<string, McpTaskContext & { questions: number }>()
let server: Server | null = null
let port = 0
let scriptPath = ''

/** Escribe el script y arranca el servidor local. Si algo falla, las tareas siguen sin herramientas de AI Cowork. */
export async function startCoworkMcp(workspaceRoot: string): Promise<void> {
  if (server) return
  try {
    const dir = join(workspaceRoot, 'mcp')
    mkdirSync(dir, { recursive: true })
    scriptPath = join(dir, 'ai-cowork-mcp.cjs')
    writeFileSync(scriptPath, MCP_SCRIPT, 'utf8')
    // Configuraciones de tareas que no terminaron (la app se cerró): sus tokens ya no valen.
    for (const f of readdirSync(dir)) if (/^tarea-[0-9a-f]+\.json$/.test(f)) rmSync(join(dir, f), { force: true })
    const s = createServer((req, res) => void handleHttp(req, res))
    await new Promise<void>((ok, ko) => {
      s.once('error', ko)
      s.listen(0, '127.0.0.1', () => ok())
    })
    port = (s.address() as { port: number }).port
    server = s
  } catch (e) {
    console.warn('[cowork] no se pudo arrancar el servidor MCP de AI Cowork', e)
    server = null
  }
}

export function stopCoworkMcp(): void {
  server?.close()
  server = null
  sessions.clear()
}

/** Las herramientas para una tarea (null si el servidor no está en marcha). */
export function mcpForTask(ctx: McpTaskContext): McpLaunch | null {
  if (!server || !scriptPath) return null
  const token = randomBytes(24).toString('hex')
  const command = process.execPath
  const args = [scriptPath]
  const env = { ELECTRON_RUN_AS_NODE: '1', AICW_MCP_URL: `http://127.0.0.1:${port}`, AICW_MCP_TOKEN: token }
  const configFile = join(dirname(scriptPath), `tarea-${token.slice(0, 16)}.json`)
  try {
    writeFileSync(configFile, JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: 'stdio', command, args, env } } }), { encoding: 'utf8', mode: 0o600 })
  } catch {
    return null
  }
  sessions.set(token, { ...ctx, questions: 0 })
  return { command, args, env, token, configFile }
}

export function releaseMcp(launch: McpLaunch | null | undefined): void {
  if (!launch) return
  sessions.delete(launch.token)
  try {
    rmSync(launch.configFile, { force: true })
  } catch {
    /* ya no está */
  }
}

function session(token: unknown): (McpTaskContext & { questions: number }) | null {
  if (typeof token !== 'string' || token.length !== 48) return null
  for (const [k, v] of sessions) {
    if (k.length === token.length && timingSafeEqual(Buffer.from(k), Buffer.from(token))) return v
  }
  return null
}

async function handleHttp(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): Promise<void> {
  const reply = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (req.method !== 'POST' || (req.url !== '/tools' && req.url !== '/call')) return reply(404, { error: 'no existe' })
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > MAX_BODY) return reply(413, { error: 'demasiado grande' })
    chunks.push(c as Buffer)
  }
  let body: { token?: unknown; name?: unknown; arguments?: unknown }
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return reply(400, { error: 'JSON no válido' })
  }
  const ctx = session(body.token)
  if (!ctx) return reply(403, { error: 'Esta tarea ya terminó o el token no es válido' })
  if (req.url === '/tools') return reply(200, { tools: MCP_TOOLS })
  try {
    reply(200, { text: await callTool(ctx, String(body.name ?? ''), (body.arguments ?? {}) as Record<string, unknown>) })
  } catch (e) {
    reply(200, { text: (e as Error).message, isError: true })
  }
}

/** Ejecuta una herramienta para la tarea `ctx`. Exportada para las pruebas. */
export async function callTool(ctx: McpTaskContext & { questions?: number }, name: string, args: Record<string, unknown>): Promise<string> {
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
  switch (name) {
    case 'memoria_proyecto': {
      const instructions = instructionsOf(ctx.projectId).trim()
      const lines = memoryLines(memoryOf(ctx.projectId))
      return [
        instructions ? `Instrucciones del usuario:\n${instructions}` : 'El usuario no ha dejado instrucciones fijas.',
        lines.length ? `Memoria del proyecto:\n${lines.join('\n')}` : 'La memoria del proyecto está vacía.'
      ].join('\n\n')
    }
    case 'anotar_memoria': {
      const kind = TIPO[str(args.tipo, 20).toLowerCase()]
      const text = str(args.texto, 400)
      if (!kind) throw new Error('tipo debe ser decision, hecho, preferencia o pendiente')
      if (text.length < 3) throw new Error('Falta el texto')
      const replaces = /^m\d{1,5}$/.test(str(args.sustituye, 8)) ? str(args.sustituye, 8) : undefined
      const e = addMemory(ctx.projectId, { kind, text }, { status: 'provisional', by: ctx.agentId, byName: ctx.agentName, taskId: ctx.taskId, taskTitle: ctx.taskTitle, runId: ctx.runId, replaces })
      return e ? `Anotado como ${e.id} (${KIND_LABEL[kind]}, provisional hasta que el usuario lo confirme).` : 'Ya estaba en la memoria: no se repite.'
    }
    case 'estado_equipo': {
      const st = store.getProject(ctx.projectId)
      const live = st.tasks.filter((t) => t.id !== ctx.taskId && (t.status === 'running' || t.status === 'pending' || t.status === 'blocked'))
      if (!live.length) return 'Nadie más está trabajando ahora en este proyecto.'
      return live
        .slice(0, 20)
        .map((t) => {
          const who = getConfig().agents.find((a) => a.id === t.agentId)?.name ?? t.agentId
          const files = t.files?.length ? ` · archivos: ${t.files.slice(0, 8).join(', ')}` : ''
          return `- «${t.title}» · ${who} · ${t.status}${t.runId === ctx.runId ? ' · misma petición' : ' · otra petición'}${t.lastActivity ? ` · ${t.lastActivity}` : ''}${files}`
        })
        .join('\n')
    }
    case 'preguntar_usuario': {
      const q = str(args.pregunta, 600)
      if (q.length < 5) throw new Error('Falta la pregunta')
      if ((ctx.questions ?? 0) >= MAX_QUESTIONS_PER_TASK) throw new Error('Ya hay bastantes preguntas pendientes de esta tarea: sigue con lo más razonable y explícalo en tu respuesta.')
      ctx.questions = (ctx.questions ?? 0) + 1
      addInbox({
        kind: 'question',
        title: `${ctx.agentName} te pregunta («${ctx.taskTitle}»)`,
        detail: q,
        projectId: ctx.projectId,
        runId: ctx.runId,
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        actions: [{ id: 'dismiss', label: 'Lo contesto en el chat' }]
      })
      return 'Pregunta enviada a «Te necesita». No esperes: sigue con la opción más razonable y di en tu respuesta final qué supusiste.'
    }
    case 'leer_habilidad': {
      const n = str(args.nombre, 64)
      if (!n) {
        const list = listSkills()
        return list.length ? list.map((s) => `- ${s.name}: ${s.description}`).join('\n') : 'El equipo aún no tiene habilidades escritas.'
      }
      const s = readSkill(n)
      if (!s) throw new Error(`No hay ninguna habilidad «${n}». Llama sin nombre para ver la lista.`)
      return s.text
    }
    default:
      throw new Error(`Herramienta desconocida: ${name}`)
  }
}

/**
 * El servidor MCP por stdio (JSON-RPC, un mensaje por línea). No depende de nada: lo ejecuta Electron como Node.
 * Cada petición tools/list o tools/call se pasa a AI Cowork con el token de la tarea.
 */
export const MCP_SCRIPT = `'use strict'
// Servidor MCP de AI Cowork (lo genera la app; se reescribe en cada arranque).
const http = require('http')
const readline = require('readline')
const BASE = process.env.AICW_MCP_URL || ''
const TOKEN = process.env.AICW_MCP_TOKEN || ''
function post(path, body) {
  return new Promise((ok, ko) => {
    const data = Buffer.from(JSON.stringify(Object.assign({ token: TOKEN }, body)))
    const u = new URL(path, BASE)
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (e) { ko(new Error('Respuesta no válida de AI Cowork')) }
      })
    })
    req.on('error', ko)
    req.setTimeout(60000, () => req.destroy(new Error('AI Cowork no respondió a tiempo')))
    req.end(data)
  })
}
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\\n') }
async function handle(msg) {
  const { id, method, params } = msg
  if (id === undefined || id === null) return
  try {
    if (method === 'initialize') {
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'ai-cowork', version: '1.0.0' } } })
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} })
    if (method === 'tools/list') {
      const r = await post('/tools', {})
      if (!r.tools) throw new Error(r.error || 'Sin herramientas')
      return send({ jsonrpc: '2.0', id, result: { tools: r.tools } })
    }
    if (method === 'tools/call') {
      const r = await post('/call', { name: params && params.name, arguments: (params && params.arguments) || {} })
      const text = r.text !== undefined ? String(r.text) : String(r.error || 'Error')
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }], isError: !!(r.isError || r.error) } })
    }
    if (method === 'resources/list') return send({ jsonrpc: '2.0', id, result: { resources: [] } })
    if (method === 'prompts/list') return send({ jsonrpc: '2.0', id, result: { prompts: [] } })
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Método no disponible: ' + method } })
  } catch (e) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: String((e && e.message) || e) } })
  }
}
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  if (!line.trim()) return
  let msg
  try { msg = JSON.parse(line) } catch (e) { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON no válido' } }) }
  void handle(msg)
})
rl.on('close', () => process.exit(0))
`
