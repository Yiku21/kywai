// Qwen Code CLI (provider 'qwen'). Not used by the default config (the "Qwen" agent runs on Ollama).
// Its stream-json format is not verified on this machine: it is detected from the first JSON line
// (Gemini-style "init" or Claude-style "system") and parsed with the matching parser.
import type { AgentAccess } from '@shared/types'
import { createClaudeParser } from './claude'
import { createGeminiParser } from './gemini'
import { runCli, safeModel, str } from './spawn'
import type { JsonlParser, ParserCallbacks, RunAgentOptions, RunAgentResult } from './types'

export function qwenArgs(model: string, mode: 'plan' | 'work', access: AgentAccess = 'project'): string[] {
  const approval = mode === 'plan' ? 'plan' : access === 'full' ? 'yolo' : 'auto-edit'
  const args = ['-p', 'Follow the instructions above.', '-o', 'stream-json', '--approval-mode', approval]
  const m = safeModel(model)
  if (m) args.push('-m', m)
  args.push('--allowed-mcp-server-names', 'none')
  return args
}

export function createQwenParser(cb: ParserCallbacks): JsonlParser {
  const gemini = createGeminiParser(cb, 'Qwen Code')
  const claude = createClaudeParser(cb)
  let active: JsonlParser | null = null
  return {
    line(o) {
      if (!active) {
        const t = str(o.type)
        if (t === 'system' || t === 'assistant' || t === 'user') active = claude
        else active = gemini
      }
      active.line(o)
    },
    finish(outcome) {
      const r = (active ?? gemini).finish(outcome)
      if (r.errorKind === 'missing') r.errorMessage = 'No se encontró el CLI de Qwen Code'
      if (r.errorKind === 'auth') r.errorMessage = 'Qwen Code no está autenticado: ejecuta `qwen` en una terminal e inicia sesión'
      if (r.errorKind === 'quota') r.errorMessage = 'Qwen Code alcanzó su límite de uso'
      return r
    }
  }
}

export function runQwen(opts: RunAgentOptions): Promise<RunAgentResult> {
  return runCli({
    command: 'qwen',
    args: qwenArgs(opts.model, opts.mode, opts.access),
    cwd: opts.cwd,
    stdin: opts.prompt,
    signal: opts.signal,
    parser: createQwenParser(opts),
    onStall: (text) => opts.onActivity?.(text, 'tool')
  })
}
