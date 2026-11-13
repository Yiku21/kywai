// Servidor MCP de kywai: herramientas que kywai da a los agentes mientras hacen una tarea (Claude Code y Codex,
// que aceptan servidores MCP por la línea de comandos). Con ellas leen la memoria del proyecto y las habilidades del
// equipo, anotan lo que descubren, ven qué hacen los compañeros y te preguntan algo sin parar el trabajo (sale en
// «Te necesita»).
//
// Cómo funciona: el CLI lanza un script pequeño (ai-cowork-mcp.cjs, lo escribe kywai en su carpeta de trabajo y
// lo ejecuta el propio Electron como Node) que habla MCP por stdio y pasa cada llamada a un servidor HTTP de kywai
// en 127.0.0.1. Cada tarea lleva su propio token: solo sirve para su proyecto y su tarea, y se anula al terminar.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { dirname, join, resolve, sep } from 'node:path'
import type { MemoryKind } from '@shared/types'
import { getConfig } from './config'
import { addInbox } from './inbox'
import { tl, type Msg } from '@shared/i18n'
import { addMemory, instructionsOf, KIND_LABEL, memoryLines, memoryOf } from './memory'
import * as store from './projects'
import { listSkills, readSkill } from './skills'
import { askPermission, describeToolRequest } from './permissions'
import { BROWSER_KEYS, captureRelPath, isBrowserKey, siteOf } from '@shared/browser'
import * as browser from './browser'

export const MCP_SERVER_NAME = 'ai-cowork'

export interface McpTaskContext {
  projectId: string
  runId: string
  taskId: string
  taskTitle: string
  agentId: string
  agentName: string
  /**
   * Modo «Preguntarme antes»: Claude pide aquí (con --permission-prompt-tool) lo que no tiene permitido y espera tu
   * respuesta. Solo entonces existe la herramienta pedir_permiso.
   */
  askPermission?: boolean
  /** Carpeta de trabajo de la tarea (ahí guarda las capturas del navegador que pide guardar). */
  dir?: string
  /** Solo las herramientas del navegador (las que se le dan a Hermes por su configuración de servidores). */
  browserOnly?: boolean
}

/** La herramienta que usa Claude con --permission-prompt-tool (no la llama el agente por su cuenta). */
export const PERMISSION_TOOL_NAME = 'pedir_permiso'

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
  /** Los servidores del usuario que van en el mismo archivo (sus herramientas se permiten sin preguntar). */
  extraNames: string[]
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

/** El navegador de kywai (src/main/browser.ts): leer y moverse sin preguntar; cambiar cosas, con permiso. */
export const BROWSER_TOOLS: ToolDef[] = [
  {
    name: 'navegador_estado',
    description: 'Qué página tiene abierta el navegador de kywai: la pestaña «Navegador» de la app, donde el usuario ya inició sesión con sus cuentas (por ejemplo GoHighLevel). Úsalo para trabajar con webs que necesitan la cuenta del usuario; nunca pidas su contraseña.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'navegador_leer',
    description: 'Lee la página abierta en el navegador de kywai: el texto visible y los elementos con los que se puede hacer algo, cada uno con su referencia (e12, o f1e3 dentro de un marco) para navegador_clic y navegador_escribir. Las referencias valen hasta la siguiente lectura. Los campos de contraseña nunca enseñan su valor.',
    inputSchema: { type: 'object', properties: { parte: { type: 'number', description: 'Si el texto es largo sale por partes: 2, 3…' } }, additionalProperties: false }
  },
  {
    name: 'navegador_captura',
    description: 'Captura de lo que se ve en el navegador de kywai (para ver lo que el texto no cuenta: un diagrama, un flujo, un diseño). Con «guardar» la deja además en tu carpeta de trabajo (p. ej. capturas/paso-1.png) para usarla en un informe.',
    inputSchema: { type: 'object', properties: { guardar: { type: 'string', description: 'Ruta relativa en tu carpeta de trabajo (opcional).' } }, additionalProperties: false }
  },
  {
    name: 'navegador_ir',
    description: 'Abre una dirección (http o https) en el navegador de kywai, con la sesión del usuario.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false }
  },
  {
    name: 'navegador_atras',
    description: 'Vuelve a la página anterior del navegador de kywai.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'navegador_desplazar',
    description: 'Desplaza la página del navegador de kywai hacia abajo o hacia arriba (o hasta un elemento, con su referencia).',
    inputSchema: { type: 'object', properties: { direccion: { type: 'string', enum: ['abajo', 'arriba'] }, ref: { type: 'string' } }, additionalProperties: false }
  },
  {
    name: 'navegador_clic',
    description: 'Hace clic en un elemento de la página (referencia de navegador_leer). Pide permiso al usuario y espera su respuesta, salvo que ya te lo diera para ese sitio en esta sesión. Explica en «motivo» para qué.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string' }, motivo: { type: 'string' } }, required: ['ref', 'motivo'], additionalProperties: false }
  },
  {
    name: 'navegador_escribir',
    description: 'Escribe en un campo de la página (sustituye lo que tenga; en una lista elige la opción con ese texto). Con enviar=true pulsa Intro después. Pide permiso al usuario. Nunca sirve para contraseñas, códigos ni tarjetas: eso lo escribe el usuario.',
    inputSchema: { type: 'object', properties: { ref: { type: 'string' }, texto: { type: 'string' }, enviar: { type: 'boolean' }, motivo: { type: 'string' } }, required: ['ref', 'texto', 'motivo'], additionalProperties: false }
  },
  {
    name: 'navegador_tecla',
    description: 'Pulsa una tecla en la página (Enter, Tab, Escape, flechas, PageDown…). Pide permiso al usuario.',
    inputSchema: { type: 'object', properties: { tecla: { type: 'string', enum: [...BROWSER_KEYS] }, motivo: { type: 'string' } }, required: ['tecla', 'motivo'], additionalProperties: false }
  }
]

const PERMISSION_TOOL: ToolDef = {
  name: PERMISSION_TOOL_NAME,
  description: 'Pide al usuario permiso para una acción que no está permitida y espera su respuesta (la usa el propio Claude Code con --permission-prompt-tool).',
  inputSchema: {
    type: 'object',
    properties: { tool_name: { type: 'string' }, input: { type: 'object' }, tool_use_id: { type: 'string' } },
    required: ['tool_name', 'input']
  }
}

const TIPO: Record<string, MemoryKind> = { decision: 'decision', decisión: 'decision', hecho: 'fact', preferencia: 'preference', pendiente: 'pending' }

const sessions = new Map<string, McpTaskContext & { questions: number }>()
let server: Server | null = null
let port = 0
let scriptPath = ''

/** Escribe el script y arranca el servidor local. Si algo falla, las tareas siguen sin herramientas de kywai. */
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
    console.warn('[cowork] no se pudo arrancar el servidor MCP de kywai', e)
    server = null
  }
}

export function stopCoworkMcp(): void {
  server?.close()
  server = null
  sessions.clear()
}

/**
 * Las herramientas para una tarea (null si el servidor no está en marcha). `extra` son los servidores que el usuario
 * encendió para este agente (⚙ → Ajustes → Extensiones), ya en el formato de Claude: van en el mismo archivo.
 */
export function mcpForTask(ctx: McpTaskContext, extra: Record<string, unknown> = {}): McpLaunch | null {
  if (!server || !scriptPath) return null
  const token = randomBytes(24).toString('hex')
  const command = process.execPath
  const args = [scriptPath]
  const env = { ELECTRON_RUN_AS_NODE: '1', AICW_MCP_URL: `http://127.0.0.1:${port}`, AICW_MCP_TOKEN: token }
  const configFile = join(dirname(scriptPath), `tarea-${token.slice(0, 16)}.json`)
  try {
    writeFileSync(configFile, JSON.stringify({ mcpServers: { ...extra, [MCP_SERVER_NAME]: { type: 'stdio', command, args, env } } }), { encoding: 'utf8', mode: 0o600 })
  } catch {
    return null
  }
  sessions.set(token, { ...ctx, questions: 0 })
  return { command, args, env, token, configFile, extraNames: Object.keys(extra).filter((n) => n !== MCP_SERVER_NAME) }
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
  if (req.url === '/tools') return reply(200, { tools: toolsFor(ctx) })
  try {
    const name = String(body.name ?? '')
    if (!toolsFor(ctx).some((t) => t.name === name)) throw new Error(`Herramienta desconocida: ${name}`)
    const out = await callTool(ctx, name, (body.arguments ?? {}) as Record<string, unknown>)
    reply(200, typeof out === 'string' ? { text: out } : out)
  } catch (e) {
    reply(200, { text: (e as Error).message, isError: true })
  }
}

/** Las herramientas de una tarea. */
export function toolsFor(ctx: McpTaskContext): ToolDef[] {
  if (ctx.browserOnly) return BROWSER_TOOLS
  return [...MCP_TOOLS, ...BROWSER_TOOLS, ...(ctx.askPermission ? [PERMISSION_TOOL] : [])]
}

/** Respuesta de una herramienta con imagen (la captura del navegador). */
export interface ToolImageResult {
  text: string
  image: { data: string; mimeType: string }
}

/** Ejecuta una herramienta para la tarea `ctx`. Exportada para las pruebas. */
export async function callTool(ctx: McpTaskContext & { questions?: number }, name: string, args: Record<string, unknown>): Promise<string | ToolImageResult> {
  const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
  if (name.startsWith('navegador_')) return browserTool(ctx, name, args, str)
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
        title: tl('{agentName} te pregunta («{taskTitle}»)', { agentName: ctx.agentName, taskTitle: ctx.taskTitle }),
        detail: q,
        projectId: ctx.projectId,
        runId: ctx.runId,
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        actions: [{ id: 'dismiss', label: tl('Lo contesto en el chat') }]
      })
      return 'Pregunta enviada a «Te necesita». No esperes: sigue con la opción más razonable y di en tu respuesta final qué supusiste.'
    }
    case PERMISSION_TOOL_NAME: {
      if (!ctx.askPermission) throw new Error('Esta tarea no pide permisos')
      const tool = str(args.tool_name, 80) || 'una herramienta'
      const input = args.input && typeof args.input === 'object' && !Array.isArray(args.input) ? (args.input as Record<string, unknown>) : {}
      const what = describeToolRequest(tool, input)
      const answer = await askPermission({ projectId: ctx.projectId, runId: ctx.runId, taskId: ctx.taskId, taskTitle: ctx.taskTitle, agentId: ctx.agentId, agentName: ctx.agentName, ...what })
      // El formato que espera Claude Code de su --permission-prompt-tool.
      return JSON.stringify(
        answer === 'deny'
          ? { behavior: 'deny', message: 'El usuario lo ha denegado. No lo intentes de otra forma: sigue con lo que puedas sin eso y, si sin eso no se puede hacer la tarea, empieza tu respuesta con «BLOQUEADA:» y explica qué falta.' }
          : { behavior: 'allow', updatedInput: input }
      )
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

/** Las herramientas del navegador de kywai. Lo que cambia algo en la página pide permiso antes (en cualquier modo). */
async function browserTool(ctx: McpTaskContext, name: string, args: Record<string, unknown>, str: (v: unknown, max: number) => string): Promise<string | ToolImageResult> {
  const who = { taskId: ctx.taskId, agentName: ctx.agentName, taskTitle: ctx.taskTitle }
  const ask = async (action: Msg, what: string, doing: string): Promise<void> => {
    const site = siteOf(browser.browserState().url)
    const why = str(args.motivo, 300)
    const answer = await askPermission({
      projectId: ctx.projectId,
      runId: ctx.runId,
      taskId: ctx.taskId,
      taskTitle: ctx.taskTitle,
      agentId: ctx.agentId,
      agentName: ctx.agentName,
      action,
      detail: [
        `${what} · ${site}`,
        why ? `Motivo: ${why}` : '',
        `«Permitir siempre en esta sesión» le deja hacer clic y escribir en ${site} sin volver a preguntar hasta que reinicies kywai.`
      ]
        .filter(Boolean)
        .join('\n'),
      key: `Navegador:${site}`
    })
    if (answer === 'deny') throw new Error('El usuario lo ha denegado. No lo intentes de otra forma: sigue con lo que puedas sin eso y, si sin eso no se puede hacer la tarea, explícalo en tu respuesta.')
    browser.useByAgent(who, doing)
  }
  switch (name) {
    case 'navegador_estado':
      browser.useByAgent(who, 'mira qué página hay abierta')
      return browser.stateForAgent()
    case 'navegador_leer': {
      browser.useByAgent(who, 'lee la página')
      const part = typeof args.parte === 'number' ? args.parte : 1
      return browser.readForAgent(part)
    }
    case 'navegador_captura': {
      browser.useByAgent(who, 'hace una captura')
      const png = await browser.captureForAgent()
      let saved = ''
      if (args.guardar !== undefined) {
        const rel = captureRelPath(args.guardar)
        if (!rel) throw new Error('«guardar» debe ser una ruta relativa dentro de tu carpeta de trabajo, como capturas/paso-1.png')
        if (!ctx.dir) throw new Error('Esta tarea no tiene carpeta de trabajo donde guardar la captura')
        const root = resolve(ctx.dir)
        const abs = resolve(root, rel)
        if (!abs.startsWith(root + sep)) throw new Error('Esa ruta sale de tu carpeta de trabajo')
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, png)
        saved = ` Guardada en ${rel}.`
      }
      return { text: `Captura de ${browser.browserState().url || 'una página en blanco'}.${saved}`, image: { data: png.toString('base64'), mimeType: 'image/png' } }
    }
    case 'navegador_ir': {
      const url = str(args.url, 2000)
      browser.useByAgent(who, 'abre una página')
      return browser.goForAgent(url)
    }
    case 'navegador_atras':
      browser.useByAgent(who, 'vuelve atrás')
      return browser.backForAgent()
    case 'navegador_desplazar': {
      browser.useByAgent(who, 'se desplaza por la página')
      const ref = str(args.ref, 12)
      return browser.scrollForAgent(args.direccion === 'arriba' ? 'arriba' : 'abajo', ref || undefined)
    }
    case 'navegador_clic': {
      browser.useByAgent(who, 'espera tu permiso para hacer clic')
      const ref = str(args.ref, 12)
      const el = await browser.describeRef(ref)
      await ask(tl('hacer clic en el navegador'), `Clic en ${el.label}`, 'hace clic')
      return browser.clickForAgent(ref)
    }
    case 'navegador_escribir': {
      browser.useByAgent(who, 'espera tu permiso para escribir')
      const ref = str(args.ref, 12)
      const text = typeof args.texto === 'string' ? args.texto.slice(0, 5000) : ''
      const el = await browser.describeRef(ref)
      const shown = text.length > 200 ? `${text.slice(0, 200)}…` : text
      await ask(tl('escribir en el navegador'), `Escribir «${shown}» en ${el.label}${args.enviar === true ? ' y pulsar Intro' : ''}`, 'escribe')
      return browser.typeForAgent(ref, text, args.enviar === true)
    }
    case 'navegador_tecla': {
      const key = args.tecla
      if (!isBrowserKey(key)) throw new Error(`Tecla no admitida. Usa una de: ${BROWSER_KEYS.join(', ')}`)
      browser.useByAgent(who, 'espera tu permiso para pulsar una tecla')
      await ask(tl('pulsar una tecla en el navegador'), `Pulsar ${key}`, 'pulsa una tecla')
      return browser.keyForAgent(key)
    }
    default:
      throw new Error(`Herramienta desconocida: ${name}`)
  }
}

/**
 * Las herramientas del navegador para Hermes, como un servidor MCP más de su configuración (Hermes no lee
 * --mcp-config). Lleva su propio token, que solo sirve para el navegador y se anula con releaseBrowserMcp.
 */
export function browserMcpForTask(ctx: McpTaskContext): { server: { id: string; title: string; command: string; args: string[]; env: Record<string, string> }; token: string } | null {
  if (!server || !scriptPath) return null
  const token = randomBytes(24).toString('hex')
  sessions.set(token, { ...ctx, browserOnly: true, askPermission: false, questions: 0 })
  return {
    token,
    server: { id: 'kywai-navegador', title: 'Navegador de kywai', command: process.execPath, args: [scriptPath], env: { ELECTRON_RUN_AS_NODE: '1', AICW_MCP_URL: `http://127.0.0.1:${port}`, AICW_MCP_TOKEN: token } }
  }
}

export function releaseBrowserMcp(token: string | undefined): void {
  if (token) sessions.delete(token)
}

/**
 * El servidor MCP por stdio (JSON-RPC, un mensaje por línea). No depende de nada: lo ejecuta Electron como Node.
 * Cada petición tools/list o tools/call se pasa a kywai con el token de la tarea.
 */
export const MCP_SCRIPT = `'use strict'
// Servidor MCP de kywai (lo genera la app; se reescribe en cada arranque).
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
        try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch (e) { ko(new Error('Respuesta no válida de kywai')) }
      })
    })
    req.on('error', ko)
    // Pedir permiso espera a que el usuario conteste (puede tardar horas): sin límite.
    if (!(body && /^(pedir_permiso|navegador_(clic|escribir|tecla))$/.test(body.name))) req.setTimeout(60000, () => req.destroy(new Error('kywai no respondió a tiempo')))
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
      const content = [{ type: 'text', text }]
      if (r.image && r.image.data) content.push({ type: 'image', data: String(r.image.data), mimeType: String(r.image.mimeType || 'image/png') })
      return send({ jsonrpc: '2.0', id, result: { content, isError: !!(r.isError || r.error) } })
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
