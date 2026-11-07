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
import type { JsonlParser, ParserCallbacks, ProcessOutcome, RunAgentOptions, RunAgentResult } from './types'
import { geminiToolTrace, resultText } from './traceText'
import { tr } from '@shared/i18n'

export const GEMINI_AUTH_MESSAGE =
  'Gemini CLI no está autenticado: revisa tu API key (GEMINI_API_KEY) o ejecuta `gemini` para iniciar sesión'

/** `-p` is appended to stdin; the real prompt goes through stdin. Fixed ASCII text only. */
export const GEMINI_P_TEXT = 'Follow the instructions above.'

export function geminiArgs(model: string, mode: 'plan' | 'work', access: AgentAccess = 'project'): string[] {
  const approval = mode === 'plan' ? 'plan' : access === 'full' ? 'yolo' : 'auto_edit'
  const args = ['-p', GEMINI_P_TEXT, '-o', 'stream-json', '--skip-trust', '--approval-mode', approval]
  const m = safeModel(model)
  if (m) args.push('-m', m)
  // Same policy as Claude's --strict-mcp-config: no user MCP servers in automated runs.
  args.push('--allowed-mcp-server-names', 'none')
  return args
}

export function geminiToolActivity(name: string, params: Record<string, unknown> | null): string {
  const file = params?.file_path ?? params?.absolute_path ?? params?.path
  switch (name) {
    case 'read_file':
    case 'read_many_files':
      return name === 'read_many_files' ? tr('Leyendo archivos') : tr('Leyendo {baseName}', { baseName: baseName(file) })
    case 'write_file':
      return `Creando ${baseName(file)}`
    case 'replace':
    case 'edit':
    case 'smart_edit':
      return `Editando ${baseName(file)}`
    case 'glob':
    case 'list_directory':
    case 'search_file_content':
    case 'grep':
    case 'grep_search':
      return tr('Buscando archivos')
    case 'run_shell_command':
      return tr('Ejecutando un comando')
    case 'google_web_search':
    case 'web_search':
      return tr('Buscando en la web')
    case 'web_fetch':
      return tr('Consultando una web')
    case 'write_todos':
      return tr('Organizando las tareas')
    case 'update_topic':
      return tr('Organizando el trabajo')
    default:
      return `Usando ${name || 'una herramienta'}`
  }
}

export function createGeminiParser(cb: ParserCallbacks, cliName = 'Gemini'): JsonlParser {
  let text = ''
  let sawInit = false
  let result: Record<string, unknown> | null = null
  let model: string | undefined
  const errors: string[] = []

  return {
    line(o) {
      const type = str(o.type)
      switch (type) {
        case 'init':
          sawInit = true
          if (str(o.model)) model = str(o.model)
          return
        case 'message': {
          if (str(o.role) !== 'assistant') return
          const c = typeof o.content === 'string' ? o.content : ''
          if (!c) return
          if (o.delta === true) text += c
          else text = c
          cb.onTrace?.({ type: 'text', text: c, delta: o.delta === true })
          cb.onText?.(c)
          cb.onActivity?.('Redactando', 'text')
          return
        }
        case 'thought':
        case 'thinking': {
          const t = str(o.content) || str(o.subject) || str(o.text)
          if (t.trim()) cb.onTrace?.({ type: 'thinking', text: t, delta: o.delta === true })
          cb.onThinking?.(t)
          return
        }
        case 'tool_use': {
          const name = str(o.tool_name) || str(o.name)
          const params = obj(o.parameters) ?? obj(o.args) ?? obj(o.input)
          cb.onTrace?.({ type: 'tool', id: str(o.tool_id) || str(o.id) || undefined, ...geminiToolTrace(name, params) })
          cb.onActivity?.(geminiToolActivity(name, params), 'tool')
          if (name === 'write_todos') {
            const p = todoProgress(params?.todos, (t) => str(t.status) === 'completed')
            if (p != null) cb.onProgress?.(p)
          } else if (['write_file', 'replace', 'edit', 'smart_edit'].includes(name)) {
            const f = str(params?.file_path) || str(params?.absolute_path) || str(params?.path)
            if (f) cb.onFile?.(f)
          }
          return
        }
        case 'tool_result': {
          const id = str(o.tool_id) || str(o.id)
          const err = str(obj(o.error)?.message) || (typeof o.error === 'string' ? o.error : '')
          if (id) cb.onTrace?.({ type: 'result', id, ok: str(o.status) !== 'error' && !err, output: err || resultText(o.output) })
          return
        }
        case 'error': {
          const m = str(o.message) || str(obj(o.error)?.message)
          if (m) errors.push(m)
          return
        }
        case 'result': {
          result = o
          const err = obj(o.error)
          if (err && str(err.message)) errors.push(str(err.message))
          return
        }
      }
    },

    finish(outcome: ProcessOutcome): RunAgentResult {
      const stats = result ? obj(result.stats) : null
      const usage: TokenUsage = {
        input: num(stats?.input_tokens),
        output: num(stats?.output_tokens),
        cached: num(stats?.cached)
      }
      if (outcome.cancelled) {
        return { ok: false, text, usage, model, errorKind: 'cancelled', errorMessage: 'Cancelada' }
      }
      if (!sawInit && !result && looksMissing(outcome)) {
        return { ok: false, text: '', usage, errorKind: 'missing', errorMessage: tr('No se encontró el CLI de {cliName}', { cliName }) }
      }
      const status = result ? str(result.status) : ''
      if (status === 'success') return { ok: true, text: text.trim(), usage, model }

      const errText = [...errors.slice(-3), stderrSummary(outcome.stderrTail)].filter(Boolean).join(' ')
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
      if (QUOTA_RE.test(errText)) {
        return { ok: false, text, usage, model, errorKind: 'quota', errorMessage: tr('{cliName} alcanzó su límite de uso', { cliName }) }
      }
      // La cuenta de Google no entra en el plan gratuito (o pide un proyecto de Google Cloud): con traza ilegible.
      if (/IneligibleOrProjectId|GOOGLE_CLOUD_PROJECT|not eligible/i.test(errText)) {
        return {
          ok: false,
          text,
          usage,
          model,
          errorKind: 'auth',
          errorMessage:
            tr('Tu cuenta de Google no puede usar Gemini CLI con inicio de sesión: usa una clave de API de Google AI Studio (⚙ → Ajustes → Configurar agentes → Sesiones)')
        }
      }
      if (AUTH_RE.test(errText)) {
        return {
          ok: false,
          text,
          usage,
          model,
          errorKind: 'auth',
          errorMessage: cliName === 'Gemini' ? tr(GEMINI_AUTH_MESSAGE) : tr('{cliName} no está autenticado: ejecuta `qwen` en una terminal e inicia sesión', { cliName })
        }
      }
      if (outcome.timedOut) {
        return { ok: false, text, usage, model, errorKind: 'failed', errorMessage: tr('El CLI dejó de responder (sin salida durante 20 min)') }
      }
      return {
        ok: false,
        text,
        usage,
        model,
        errorKind: 'failed',
        errorMessage: errText ? clip(errText, 200) : outcome.spawnError ? tr('No se pudo lanzar: {clip}', { clip: clip(outcome.spawnError.message, 180) }) : tr('{cliName} terminó con un error (código {v2})', { cliName, v2: outcome.code ?? '?' })
      }
    }
  }
}

export function runGemini(opts: RunAgentOptions): Promise<RunAgentResult> {
  return runCli({
    command: 'gemini',
    args: geminiArgs(opts.model, opts.mode, opts.access),
    cwd: opts.cwd,
    stdin: opts.prompt,
    signal: opts.signal,
    parser: createGeminiParser(opts),
    onStall: (text) => opts.onActivity?.(text, 'tool')
  })
}
