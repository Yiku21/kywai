import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { request } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { LocalModel, TokenUsage } from '@shared/types'
import { ThinkSplitter } from './ollama'
import { clip, num, obj, str } from './spawn'
import type { RunAgentOptions, RunAgentResult } from './types'
import { runTool, toolDefinitions, type ToolContext } from './localTools'
import { tr } from '@shared/i18n'

export const LMSTUDIO_URL = 'http://127.0.0.1:1234'
export const LMSTUDIO_OFFLINE = 'Servidor de LM Studio apagado: enciéndelo desde la configuración local o en LM Studio (Developer → Start server)'

/** Ruta del CLI `lms` (lo instala LM Studio en ~/.lmstudio/bin). */
export function lmsPath(): string | null {
  const exe = process.platform === 'win32' ? 'lms.exe' : 'lms'
  const p = join(homedir(), '.lmstudio', 'bin', exe)
  return existsSync(p) ? p : null
}

function lms(args: string[], timeoutMs = 20_000): Promise<string> {
  const bin = lmsPath()
  if (!bin) return Promise.reject(new Error(tr('LM Studio no está instalado')))
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(clip(stderr || err.message, 300)))
      else resolve(stdout)
    })
  })
}

/** Modelos de lenguaje descargados en LM Studio (no necesita el servidor encendido). */
export async function lmsListModels(): Promise<LocalModel[]> {
  const out = await lms(['ls', '--json'])
  const arr = JSON.parse(out) as unknown[]
  return arr
    .map((m) => obj(m))
    .filter((m): m is Record<string, unknown> => !!m && m.type !== 'embedding')
    .map((m) => ({
      id: str(m.modelKey) || str(m.path),
      label: str(m.displayName) || str(m.modelKey),
      sizeBytes: num(m.sizeBytes) || undefined,
      params: str(m.paramsString) || undefined,
      quantization: str(obj(m.quantization)?.name) || undefined
    }))
    .filter((m) => !!m.id)
}

export async function lmsServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${LMSTUDIO_URL}/v1/models`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

export async function lmsStartServer(): Promise<void> {
  await lms(['server', 'start'], 60_000)
}

/** ¿Servidor activo y modelo descargado? (sin generar nada). */
export async function checkLmStudio(model: string): Promise<{ ok: boolean; reason?: string }> {
  if (!lmsPath()) return { ok: false, reason: tr('LM Studio no está instalado') }
  if (!model) return { ok: false, reason: tr('No hay un modelo local configurado') }
  let ids: string[] = []
  try {
    const res = await fetch(`${LMSTUDIO_URL}/v1/models`, { signal: AbortSignal.timeout(2500) })
    if (!res.ok) return { ok: false, reason: tr(LMSTUDIO_OFFLINE) }
    const j = (await res.json()) as { data?: { id?: string }[] }
    ids = (j.data ?? []).map((d) => d.id).filter((x): x is string => typeof x === 'string')
  } catch {
    return { ok: false, reason: tr(LMSTUDIO_OFFLINE) }
  }
  const base = model.split('@')[0]
  if (!ids.some((id) => id === model || id === base || id.split('@')[0] === base)) {
    return { ok: false, reason: tr('Modelo no descargado en LM Studio: {model}', { model }) }
  }
  return { ok: true }
}

/** Contexto mínimo para trabajar con herramientas (instrucciones + archivos leídos). */
const MIN_CONTEXT = 16_384
const TARGET_CONTEXT = 32_768
const MAX_STEPS = 24
/** ~4 caracteres por token: por encima de esto se resumen los resultados antiguos. */
const MAX_HISTORY_CHARS = 80_000
const contextReady = new Set<string>()

/**
 * LM Studio carga los modelos con poco contexto por defecto (4–8 k tokens), insuficiente para
 * trabajar con archivos. Si hace falta, se recarga el modelo con 32 k.
 */
async function ensureContext(model: string, onActivity?: (t: string) => void): Promise<void> {
  if (contextReady.has(model)) return
  try {
    const loaded = JSON.parse(await lms(['ps', '--json'])) as Record<string, unknown>[]
    const base = model.split('@')[0]
    const inst = loaded.find((m) => str(m.identifier) === model || str(m.modelKey) === base)
    if (inst && num(inst.contextLength) >= MIN_CONTEXT) {
      contextReady.add(model)
      return
    }
    onActivity?.(tr('Preparando el modelo local'))
    if (inst) await lms(['unload', str(inst.identifier) || base], 60_000).catch(() => '')
    await lms(['load', base, '-c', String(TARGET_CONTEXT), '-y'], 240_000)
    contextReady.add(model)
  } catch (e) {
    console.warn('[cowork] no se pudo ajustar el contexto de LM Studio', e)
  }
}

const SYSTEM_PROMPT = [
  'Eres un agente de IA que trabaja dentro de la carpeta de un proyecto, en un equipo de agentes.',
  'Tienes herramientas para explorar, buscar, leer, crear y editar archivos del proyecto, y para buscar en internet y leer páginas web.',
  'Úsalas siempre que la tarea lo necesite: no inventes el contenido de archivos ni datos que puedes consultar.',
  'Las rutas son relativas a la carpeta del proyecto. Cuando termines, responde con un resumen breve de lo que hiciste.'
].join(' ')

interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

/** Resume los resultados de herramientas más antiguos si la conversación crece demasiado. */
function prune(messages: ChatMsg[]): void {
  let total = messages.reduce((n, m) => n + (m.content?.length ?? 0), 0)
  for (let i = 2; i < messages.length - 4 && total > MAX_HISTORY_CHARS; i++) {
    const m = messages[i]
    if (m.role === 'tool' && m.content && m.content.length > 300) {
      total -= m.content.length - 120
      m.content = `${m.content.slice(0, 100)}… [resultado anterior recortado para ahorrar memoria]`
    }
  }
}

/** Agente local con herramientas a través de la API compatible con OpenAI de LM Studio. */
interface PostResult {
  ok: boolean
  status: number
  statusText: string
  text: string
}

/**
 * POST sin límite de tiempo. `fetch` (undici) corta a los 5 minutos si no llegan las cabeceras, y un modelo local que
 * razona mucho tarda más en contestar sin streaming: eso se tomaba por «servidor apagado». Se para con `signal`.
 */
export function postJson(url: string, body: string, signal: AbortSignal): Promise<PostResult> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }, signal }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c: string) => (text += c))
      res.on('end', () => {
        const status = res.statusCode ?? 0
        resolve({ ok: status >= 200 && status < 300, status, statusText: res.statusMessage ?? '', text })
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end(body)
  })
}

export async function runLmStudio(opts: RunAgentOptions): Promise<RunAgentResult> {
  const usage: TokenUsage = { input: 0, output: 0 }
  const model = opts.model
  if (!model) return { ok: false, text: '', usage, errorKind: 'offline', errorMessage: tr('No hay un modelo local configurado') }
  await ensureContext(model, (t) => opts.onActivity?.(t, 'tool'))
  if (opts.signal.aborted) return { ok: false, text: '', usage, errorKind: 'cancelled', errorMessage: 'Cancelada' }

  const ctx: ToolContext = {
    cwd: opts.cwd,
    canWrite: opts.mode !== 'plan',
    signal: opts.signal,
    onActivity: (t) => opts.onActivity?.(t, 'tool'),
    onProgress: (p) => opts.onProgress?.(p),
    onFile: (p) => opts.onFile?.(p),
    onTrace: opts.onTrace
  }
  const tools = toolDefinitions(ctx.canWrite)
  const messages: ChatMsg[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: opts.prompt }
  ]
  opts.onActivity?.(tr('Leyendo la tarea'), 'tool')

  for (let step = 0; step < MAX_STEPS; step++) {
    prune(messages)
    let res: PostResult
    try {
      res = await postJson(
        `${LMSTUDIO_URL}/v1/chat/completions`,
        JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.3, stream: false }),
        opts.signal
      )
    } catch (e) {
      if (opts.signal.aborted) return { ok: false, text: '', usage, errorKind: 'cancelled', errorMessage: 'Cancelada' }
      // Solo «conexión rechazada» es que el servidor está apagado; lo demás es que se cortó a mitad.
      if ((e as NodeJS.ErrnoException).code === 'ECONNREFUSED') return { ok: false, text: '', usage, errorKind: 'offline', errorMessage: tr(LMSTUDIO_OFFLINE) }
      return { ok: false, text: '', usage, errorKind: 'failed', errorMessage: clip(tr('LM Studio cortó la respuesta: {message}', { message: (e as Error).message }), 200) }
    }
    const body = res.text
    if (!res.ok) {
      let msg = body
      try {
        msg = str(obj(obj(JSON.parse(body))?.error)?.message) || body
      } catch {
        /* texto plano */
      }
      if (/not found|no models? loaded|does not exist/i.test(msg)) {
        return { ok: false, text: '', usage, errorKind: 'offline', errorMessage: tr('Modelo no disponible en LM Studio: {model}', { model }) }
      }
      if (/context/i.test(msg)) contextReady.delete(model)
      return { ok: false, text: '', usage, errorKind: 'failed', errorMessage: clip(`LM Studio: ${msg || res.statusText}`, 200) }
    }
    let data: Record<string, unknown>
    try {
      data = JSON.parse(body) as Record<string, unknown>
    } catch {
      return { ok: false, text: '', usage, errorKind: 'failed', errorMessage: tr('LM Studio devolvió una respuesta no válida') }
    }
    const u = obj(data.usage)
    if (u) {
      usage.input += num(u.prompt_tokens)
      usage.output += num(u.completion_tokens)
      opts.onUsage?.({ contextUsed: num(u.prompt_tokens) + num(u.completion_tokens), contextCapacity: TARGET_CONTEXT })
    }
    const choice = obj((Array.isArray(data.choices) ? data.choices : [])[0])
    const msg = obj(choice?.message) ?? {}
    const reasoning = str(msg.reasoning_content) || str(msg.reasoning)
    if (reasoning) {
      opts.onTrace?.({ type: 'thinking', text: reasoning })
      opts.onThinking?.(reasoning)
    }
    const content = str(msg.content)
    const calls = (Array.isArray(msg.tool_calls) ? msg.tool_calls : [])
      .map((c) => obj(c))
      .filter((c): c is Record<string, unknown> => !!c && !!obj(c.function))

    if (calls.length) {
      const toolCalls = calls.map((c, i) => ({
        id: str(c.id) || `llamada-${step}-${i}`,
        type: 'function' as const,
        function: { name: str(obj(c.function)?.name), arguments: str(obj(c.function)?.arguments) || '{}' }
      }))
      if (content.trim()) opts.onTrace?.({ type: 'text', text: content })
      messages.push({ role: 'assistant', content: content || null, tool_calls: toolCalls })
      for (const call of toolCalls) {
        if (opts.signal.aborted) return { ok: false, text: '', usage, errorKind: 'cancelled', errorMessage: 'Cancelada' }
        const result = await runTool(call.function.name, call.function.arguments, ctx, `${step}:${call.id}`)
        messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
      continue
    }

    const splitter = new ThinkSplitter()
    const [visible, think] = splitter.push(content)
    if (think) {
      opts.onTrace?.({ type: 'thinking', text: think })
      opts.onThinking?.(think)
    }
    const text = (visible || splitter.visible).trim()
    if (text) {
      opts.onTrace?.({ type: 'text', text })
      opts.onActivity?.('Redactando', 'text')
      opts.onText?.(text)
    }
    return { ok: true, text, usage, model }
  }
  return { ok: false, text: '', usage, errorKind: 'failed', errorMessage: tr('El modelo local no terminó tras {MAX_STEPS} pasos', { MAX_STEPS }) }
}
