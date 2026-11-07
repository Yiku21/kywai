import type { AgentAccess, TokenUsage } from '@shared/types'
import {
  AUTH_RE,
  MODEL_UNAVAILABLE_RE,
  QUOTA_RE,
  baseName,
  clip,
  looksMissing,
  num,
  obj,
  runCli,
  safeModel,
  stderrSummary,
  str,
  todoProgress
} from './spawn'
import type {
  Effort,
  JsonlParser,
  ParserCallbacks,
  ProcessOutcome,
  RateLimitInfo,
  RateLimitWindow,
  McpServerLaunch,
  RunAgentOptions,
  RunAgentResult
} from './types'
import { claudeToolTrace, resultText } from './traceText'
import { locale, tr } from '@shared/i18n'

export const CLAUDE_AUTH_MESSAGE = 'Sesión de Claude expirada: abre una terminal, ejecuta `claude` e inicia sesión'

/** Un identificador de sesión del CLI: solo lo que es seguro poner en la línea de comandos. */
export const SESSION_ID_RE = /^[0-9a-zA-Z_-]{8,80}$/

/** Nombre de un servidor MCP: lo que vale como clave en la configuración y en el nombre de sus herramientas. */
export const MCP_NAME_RE = /^[a-z][a-z0-9_-]{0,30}$/

export function claudeArgs(model: string, mode: 'plan' | 'work', access: AgentAccess = 'project', effort?: Effort, resume?: string, mcp?: McpServerLaunch): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--verbose']
  if (resume && SESSION_ID_RE.test(resume)) args.push('--resume', resume)
  const m = safeModel(model)
  if (m) args.push('--model', m)
  if (effort) args.push('--effort', effort)
  args.push('--permission-mode', mode === 'plan' ? 'plan' : access === 'full' ? 'bypassPermissions' : 'acceptEdits')
  args.push('--strict-mcp-config')
  // Solo el servidor de kywai (nunca los del usuario), con sus herramientas permitidas sin preguntar.
  // La configuración va en un archivo: por la consola solo pasan argumentos de texto sencillo (sin comillas ni llaves).
  if (mcp && MCP_NAME_RE.test(mcp.name) && mcp.configFile) {
    args.push('--mcp-config', mcp.configFile)
    args.push('--allowedTools', `mcp__${mcp.name}`)
  }
  // Las sesiones de trabajo se guardan para poder retomarlas en una continuación o una corrección (el CLI
  // las limpia solo a los 30 días). Planificar y verificar son de un solo uso: no dejan rastro.
  if (mode !== 'work') args.push('--no-session-persistence')
  return args
}

export function claudeToolActivity(name: string, input: Record<string, unknown> | null): string {
  const file = input?.file_path ?? input?.notebook_path ?? input?.path
  switch (name) {
    case 'Read':
      return `Leyendo ${baseName(file)}`
    case 'Write':
      return `Creando ${baseName(file)}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `Editando ${baseName(file)}`
    case 'Glob':
    case 'Grep':
    case 'LS':
      return tr('Buscando archivos')
    case 'WebSearch':
      return tr('Buscando en la web')
    case 'WebFetch':
      return tr('Consultando una web')
    case 'Bash':
    case 'PowerShell':
      return tr('Ejecutando un comando')
    case 'Task':
    case 'Agent':
      return tr('Delegando una subtarea')
    case 'TodoWrite':
      return tr('Organizando las tareas')
    case 'ExitPlanMode':
      return tr('Presentando el plan')
    default:
      return `Usando ${name || 'una herramienta'}`
  }
}

function toPct(u: unknown): number | null {
  if (typeof u !== 'number' || !Number.isFinite(u)) return null
  const pct = u <= 1 ? u * 100 : u
  return Math.max(0, Math.min(100, pct))
}

function toMs(t: unknown): number | null {
  if (typeof t === 'number' && Number.isFinite(t) && t > 0) return t < 1e12 ? t * 1000 : t
  if (typeof t === 'string' && t) {
    const n = Date.parse(t)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** `{"type":"rate_limit_event","rate_limit_info":{status,resetsAt,rateLimitType,unifiedWindows:{five_hour:{utilization,resetsAt},...}}}` */
export function parseClaudeRateLimit(o: Record<string, unknown>): RateLimitInfo | null {
  const info = obj(o.rate_limit_info) ?? obj(o.rateLimitInfo) ?? obj(o.rate_limit) ?? o
  const windows: RateLimitWindow[] = []
  const unified = obj(info.unifiedWindows) ?? obj(info.unified_windows)
  if (unified) {
    for (const [name, w] of Object.entries(unified)) {
      const wo = obj(w)
      if (!wo) continue
      windows.push({ name, usedPct: toPct(wo.utilization), resetsAt: toMs(wo.resetsAt ?? wo.resets_at) })
    }
  } else if (info.utilization != null) {
    windows.push({
      name: str(info.rateLimitType) || str(info.rate_limit_type) || 'window',
      usedPct: toPct(info.utilization),
      resetsAt: toMs(info.resetsAt ?? info.resets_at)
    })
  }
  const status = str(info.status) || undefined
  if (!windows.length && !status) return null
  return {
    provider: 'claude',
    status,
    windows,
    resetsAt: toMs(info.resetsAt ?? info.resets_at),
    receivedAt: Date.now()
  }
}

function resetText(ms: number | null | undefined): string {
  if (!ms) return ''
  const d = new Date(ms)
  const sameDay = new Date().toDateString() === d.toDateString()
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  return sameDay ? tr(' (se renueva a las {time})', { time }) : tr(' (se renueva el {v1} a las {time})', { v1: d.toLocaleDateString(locale()), time })
}

export function createClaudeParser(cb: ParserCallbacks): JsonlParser {
  let lastText = ''
  let syntheticText = ''
  let synthetic = false
  let exitPlanText = ''
  let result: Record<string, unknown> | null = null
  let lastContext = 0
  let model: string | undefined
  let rateRejected = false
  let rateResets: number | null = null
  let sessionId: string | undefined
  const sumUsage: TokenUsage = { input: 0, output: 0, cached: 0 }

  return {
    line(o) {
      const type = str(o.type)
      if (SESSION_ID_RE.test(str(o.session_id))) sessionId = str(o.session_id)
      if (type === 'system') {
        if (str(o.subtype) === 'init' && str(o.model)) model = str(o.model)
        return
      }
      if (type.includes('rate_limit')) {
        const info = parseClaudeRateLimit(o)
        if (info) {
          if (info.status === 'rejected') {
            rateRejected = true
            rateResets = info.resetsAt ?? info.windows.find((w) => w.resetsAt)?.resetsAt ?? null
          }
          cb.onRateLimit?.(info)
        }
        return
      }
      if (type === 'assistant') {
        const msg = obj(o.message)
        if (!msg) return
        const msgModel = str(msg.model)
        const isSynthetic = msgModel === '<synthetic>' || o.isApiErrorMessage === true || o.error != null
        if (isSynthetic) synthetic = true
        const content = Array.isArray(msg.content) ? msg.content : []
        for (const raw of content) {
          const block = obj(raw)
          if (!block) continue
          const bt = str(block.type)
          if (bt === 'text') {
            const t = str(block.text)
            if (isSynthetic) {
              syntheticText += (syntheticText ? '\n' : '') + t
            } else if (t.trim()) {
              lastText = t
              cb.onTrace?.({ type: 'text', text: t })
              cb.onText?.(t)
              cb.onActivity?.('Redactando', 'text')
            }
          } else if (bt === 'thinking' || bt === 'redacted_thinking') {
            const th = str(block.thinking)
            if (th.trim()) cb.onTrace?.({ type: 'thinking', text: th })
            cb.onThinking?.(th)
          } else if (bt === 'tool_use' || bt === 'server_tool_use') {
            const name = str(block.name)
            const input = obj(block.input)
            cb.onTrace?.({ type: 'tool', id: str(block.id) || undefined, ...claudeToolTrace(name, input) })
            cb.onActivity?.(claudeToolActivity(name, input), 'tool')
            if (name === 'TodoWrite') {
              const p = todoProgress(input?.todos, (t) => str(t.status) === 'completed')
              if (p != null) cb.onProgress?.(p)
            } else if (name === 'ExitPlanMode') {
              exitPlanText = str(input?.plan)
            } else if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) {
              const f = str(input?.file_path) || str(input?.notebook_path)
              if (f) cb.onFile?.(f)
            }
          }
        }
        const usage = obj(msg.usage)
        if (usage && !isSynthetic) {
          lastContext =
            num(usage.input_tokens) + num(usage.cache_read_input_tokens) + num(usage.cache_creation_input_tokens)
          if (lastContext > 0) cb.onUsage?.({ contextUsed: lastContext })
          sumUsage.input += lastContext
          sumUsage.output += num(usage.output_tokens)
          sumUsage.cached = (sumUsage.cached ?? 0) + num(usage.cache_read_input_tokens)
        }
        return
      }
      if (type === 'user') {
        // Resultados de las herramientas (salida de un comando, archivo leído, error…).
        const content = obj(o.message)?.content
        for (const raw of Array.isArray(content) ? content : []) {
          const block = obj(raw)
          if (!block || str(block.type) !== 'tool_result') continue
          const id = str(block.tool_use_id)
          if (id) cb.onTrace?.({ type: 'result', id, ok: block.is_error !== true, output: resultText(block.content) })
        }
        return
      }
      if (type === 'result' || ('result' in o && 'subtype' in o && 'session_id' in o)) {
        result = o
        const mu = obj(o.modelUsage)
        if (mu) {
          let capacity = 0
          for (const v of Object.values(mu)) capacity = Math.max(capacity, num(obj(v)?.contextWindow))
          if (capacity > 0) cb.onUsage?.({ contextUsed: lastContext || undefined, contextCapacity: capacity })
        }
      }
    },

    finish(outcome: ProcessOutcome): RunAgentResult {
      const r = finishInner(outcome)
      return sessionId ? { ...r, sessionId } : r
    }
  }

  function finishInner(outcome: ProcessOutcome): RunAgentResult {
      const usage: TokenUsage = { ...sumUsage }
      const ru = result ? obj(result.usage) : null
      if (ru) {
        const cacheRead = num(ru.cache_read_input_tokens)
        usage.input = num(ru.input_tokens) + num(ru.cache_creation_input_tokens) + cacheRead
        usage.output = num(ru.output_tokens)
        usage.cached = cacheRead
      }
      if (outcome.cancelled) {
        return { ok: false, text: lastText, usage, errorKind: 'cancelled', errorMessage: 'Cancelada', model }
      }
      if (!result && looksMissing(outcome)) {
        return { ok: false, text: '', usage, errorKind: 'missing', errorMessage: tr('No se encontró el CLI de Claude') }
      }

      let text = result ? str(result.result) : ''
      if (!text && !synthetic) text = lastText
      if (exitPlanText && !text.includes('{')) text = text ? `${text}\n\n${exitPlanText}` : exitPlanText

      const terminal = result ? str(result.terminal_reason) : ''
      const apiStatus = result ? num(result.api_error_status) : 0
      const isError =
        !result ||
        (synthetic && terminal !== 'completed') ||
        result.is_error === true ||
        (str(result.subtype) !== '' && str(result.subtype) !== 'success') ||
        terminal === 'api_error'

      if (!isError) return { ok: true, text, usage, model }

      const errors = result && Array.isArray(result.errors) ? result.errors.map((e) => String(e)).join(' ') : ''
      const errText = [syntheticText, result ? str(result.result) : '', errors, stderrSummary(outcome.stderrTail)]
        .filter(Boolean)
        .join(' ')

      if (rateRejected || apiStatus === 429) {
        return { ok: false, text, usage, model, errorKind: 'quota', errorMessage: tr('Claude alcanzó su límite de uso{resetText}', { resetText: resetText(rateResets) }) }
      }
      if (apiStatus === 401 || apiStatus === 403 || AUTH_RE.test(errText)) {
        return { ok: false, text, usage, model, errorKind: 'auth', errorMessage: tr(CLAUDE_AUTH_MESSAGE) }
      }
      if (QUOTA_RE.test(errText)) {
        return { ok: false, text, usage, model, errorKind: 'quota', errorMessage: tr('Claude alcanzó su límite de uso{resetText}', { resetText: resetText(rateResets) }) }
      }
      if (MODEL_UNAVAILABLE_RE.test(errText)) {
        return {
          ok: false,
          text,
          usage,
          model,
          errorKind: 'failed',
          modelUnavailable: true,
          errorMessage: tr('El modelo no está disponible: {clip}', { clip: clip(errText, 160) })
        }
      }
      if (outcome.timedOut) {
        return { ok: false, text, usage, model, errorKind: 'failed', errorMessage: tr('El CLI dejó de responder (sin salida durante 20 min)') }
      }
      const msg = errText
        ? clip(errText, 200)
        : result && str(result.subtype) === 'error_max_turns'
          ? tr('Se alcanzó el máximo de turnos')
          : outcome.spawnError ? tr('No se pudo lanzar: {clip}', { clip: clip(outcome.spawnError.message, 180) }) : tr('Claude terminó con un error (código {v1})', { v1: outcome.code ?? '?' })
      return { ok: false, text, usage, model, errorKind: 'failed', errorMessage: msg }
  }
}

export function runClaude(opts: RunAgentOptions): Promise<RunAgentResult> {
  return runCli({
    command: 'claude',
    args: claudeArgs(opts.model, opts.mode, opts.access, opts.effort, opts.resume, opts.mcp),
    cwd: opts.cwd,
    stdin: opts.prompt,
    signal: opts.signal,
    parser: createClaudeParser(opts),
    onStall: (text) => opts.onActivity?.(text, 'tool'),
    // La variable manda sobre --effort: se fija también para que no gane una que el usuario tenga puesta.
    env: opts.effort ? { CLAUDE_CODE_EFFORT_LEVEL: opts.effort } : undefined
  })
}
