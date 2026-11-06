import type { TokenUsage } from '@shared/types'
import { clip, num, obj, str } from './spawn'
import type { RunAgentOptions, RunAgentResult } from './types'
import { tr } from '@shared/i18n'

export const OLLAMA_URL = 'http://127.0.0.1:11434'
export const OLLAMA_OFFLINE = 'Ollama no está en ejecución'

export function ollamaPullReason(model: string): string {
  return tr('Modelo local no descargado: ejecuta `ollama pull {model}`', { model })
}

function modelMatches(installed: string, wanted: string): boolean {
  if (installed === wanted) return true
  if (!wanted.includes(':')) return installed === `${wanted}:latest`
  return false
}

/** Is the local server up and the model pulled? (GET /api/tags, no generation). */
export async function checkOllama(model: string): Promise<{ ok: boolean; reason?: string }> {
  let res: Response
  try {
    res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) })
  } catch {
    return { ok: false, reason: tr(OLLAMA_OFFLINE) }
  }
  if (!res.ok) return { ok: false, reason: tr(OLLAMA_OFFLINE) }
  let names: string[] = []
  try {
    const j = (await res.json()) as { models?: { name?: string; model?: string }[] }
    names = (j.models ?? []).flatMap((m) => [m.name, m.model]).filter((n): n is string => typeof n === 'string')
  } catch {
    return { ok: false, reason: tr(OLLAMA_OFFLINE) }
  }
  if (!model) return { ok: false, reason: tr('No hay un modelo local configurado') }
  if (!names.some((n) => modelMatches(n, model))) return { ok: false, reason: ollamaPullReason(model) }
  return { ok: true }
}

/** Splits streamed content into visible text and <think>…</think> reasoning. */
export class ThinkSplitter {
  private raw = ''
  visible = ''
  /** Returns [newVisible, newThinking]. */
  push(chunk: string): [string, string] {
    const before = this.visible
    const beforeThink = this.thinking()
    this.raw += chunk
    this.visible = this.raw
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*$/, '')
      // a tag may arrive split across chunks: hold back a trailing "<thin"
      .replace(/<(t(h(i(n(k)?)?)?)?)?$/, '')
      .replace(/^\s+/, '')
    const t = this.thinking()
    return [this.visible.slice(before.length), t.slice(beforeThink.length)]
  }
  private thinking(): string {
    const parts: string[] = []
    const re = /<think>([\s\S]*?)(<\/think>|$)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(this.raw))) {
      parts.push(m[1])
      if (!m[2]) break
    }
    return parts.join('\n')
  }
}

export async function runOllama(opts: RunAgentOptions): Promise<RunAgentResult> {
  const usage: TokenUsage = { input: 0, output: 0 }
  const model = opts.model
  if (!model) return { ok: false, text: '', usage, errorKind: 'offline', errorMessage: tr('No hay un modelo local configurado') }
  let res: Response
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: opts.prompt }], stream: true }),
      signal: opts.signal
    })
  } catch {
    if (opts.signal.aborted) return { ok: false, text: '', usage, errorKind: 'cancelled', errorMessage: 'Cancelada' }
    return { ok: false, text: '', usage, errorKind: 'offline', errorMessage: tr(OLLAMA_OFFLINE) }
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    if (res.status === 404 || /not found|pull/i.test(body)) {
      return { ok: false, text: '', usage, errorKind: 'offline', errorMessage: ollamaPullReason(model) }
    }
    return { ok: false, text: '', usage, errorKind: 'failed', errorMessage: clip(`Ollama: ${body || res.statusText}`, 200) }
  }

  const splitter = new ThinkSplitter()
  const decoder = new TextDecoder()
  const reader = res.body.getReader()
  let buf = ''
  let done = false
  let error = ''
  let announced = false

  const handle = (line: string): void => {
    const t = line.trim()
    if (!t.startsWith('{')) return
    let o: Record<string, unknown>
    try {
      o = JSON.parse(t) as Record<string, unknown>
    } catch {
      return
    }
    if (str(o.error)) error = str(o.error)
    const msg = obj(o.message)
    const thinking = str(msg?.thinking)
    if (thinking) {
      opts.onTrace?.({ type: 'thinking', text: thinking, delta: true })
      opts.onThinking?.(thinking)
    }
    const content = str(msg?.content)
    if (content) {
      const [vis, think] = splitter.push(content)
      if (think) {
        opts.onTrace?.({ type: 'thinking', text: think, delta: true })
        opts.onThinking?.(think)
      }
      if (vis) {
        opts.onTrace?.({ type: 'text', text: vis, delta: true })
        opts.onText?.(vis)
        if (!announced) {
          announced = true
          opts.onActivity?.('Redactando', 'text')
        }
      }
    }
    if (o.done === true) {
      done = true
      usage.input = num(o.prompt_eval_count)
      usage.output = num(o.eval_count)
      if (usage.input) opts.onUsage?.({ contextUsed: usage.input + usage.output })
    }
  }

  try {
    for (;;) {
      const { value, done: end } = await reader.read()
      if (end) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        handle(buf.slice(0, nl))
        buf = buf.slice(nl + 1)
      }
    }
    if (buf) handle(buf)
  } catch {
    if (opts.signal.aborted) return { ok: false, text: splitter.visible, usage, errorKind: 'cancelled', errorMessage: 'Cancelada' }
    return { ok: false, text: splitter.visible, usage, errorKind: 'offline', errorMessage: tr('Se perdió la conexión con Ollama') }
  }

  if (error) return { ok: false, text: splitter.visible, usage, errorKind: 'failed', errorMessage: clip(`Ollama: ${error}`, 200) }
  if (!done) return { ok: false, text: splitter.visible, usage, errorKind: 'failed', errorMessage: tr('Ollama cortó la respuesta') }
  return { ok: true, text: splitter.visible.trim(), usage, model }
}
