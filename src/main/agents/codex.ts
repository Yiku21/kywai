import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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
import type { Effort, JsonlParser, ParserCallbacks, ProcessOutcome, RunAgentOptions, RunAgentResult } from './types'
import { resultText, todoTrace, unwrapShell } from './traceText'
import { tr } from '@shared/i18n'

export const CODEX_AUTH_MESSAGE = 'Sesión de Codex caducada: ejecuta `codex login` en una terminal'

/** Image paths must be sanitized relative paths (attachments/foo.png). */
const REL_IMAGE_RE = /^[\w.\-]+(\/[\w.\-]+)*$/

/** Un identificador de hilo de Codex (UUID): solo lo que es seguro poner en la línea de comandos. */
const THREAD_ID_RE = /^[0-9a-fA-F-]{36}$/

export function codexArgs(model: string, mode: 'plan' | 'work', images: string[] = [], access: AgentAccess = 'project', effort?: Effort, resume?: string): string[] {
  const args = ['exec']
  const resuming = !!resume && THREAD_ID_RE.test(resume)
  const imageArgs: string[] = []
  // -i takes several values: put images first so the following flags end the list.
  for (const img of images) {
    const rel = img.replace(/\\/g, '/')
    if (REL_IMAGE_RE.test(rel) && !rel.split('/').includes('..')) imageArgs.push('-i', rel)
  }
  if (!resuming) args.push(...imageArgs)
  // Con acceso completo, sin entorno protegido: puede instalar dependencias y usar internet.
  const sandbox = mode === 'plan' ? 'read-only' : access === 'full' ? 'danger-full-access' : 'workspace-write'
  args.push('--json', '--skip-git-repo-check', '--sandbox', sandbox)
  // La app de escritorio de Codex configura el modo "elevated", que necesita su propio ayudante
  // registrado: lanzado desde AI Cowork falla y no puede ejecutar comandos. El modo estándar sí funciona.
  if (process.platform === 'win32' && sandbox !== 'danger-full-access') args.push('-c', 'windows.sandbox=unelevated')
  const m = safeModel(model)
  if (m) args.push('-m', m)
  if (effort) args.push('-c', `model_reasoning_effort=${effort}`)
  // Retomar un hilo: `codex exec [opciones] resume <id> [-i img] -`. Las opciones no se heredan del hilo, por eso
  // van siempre; si el hilo ya no existe, Codex empieza uno nuevo sin fallar.
  if (resuming) args.push('resume', resume!, ...imageArgs)
  args.push('-') // prompt from stdin
  return args
}

/** Codex errors often embed a JSON payload in the message. */
function innerMessage(msg: string): string {
  const t = msg.trim()
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>
      const e = obj(j.error)
      return str(e?.message) || str(j.message) || t
    } catch {
      /* not JSON */
    }
  }
  return t
}

export function createCodexParser(cb: ParserCallbacks): JsonlParser {
  let lastMessage = ''
  let completed = false
  let failedMsg = ''
  const errors: string[] = []
  let threadId: string | undefined
  const usage: TokenUsage = { input: 0, output: 0, cached: 0 }

  return {
    line(o) {
      const type = str(o.type)
      if (type === 'thread.started' && THREAD_ID_RE.test(str(o.thread_id))) {
        threadId = str(o.thread_id)
        return
      }
      if (type.startsWith('item.')) {
        const item = obj(o.item)
        if (!item) return
        const phase = type.slice(5)
        const it = str(item.type)
        const id = str(item.id) || undefined
        const finished = phase === 'completed'
        const failed = str(item.status) === 'failed'
        switch (it) {
          case 'agent_message': {
            const t = str(item.text)
            if (phase === 'completed' && t.trim()) {
              lastMessage = t
              cb.onTrace?.({ type: 'text', text: t, id })
              cb.onText?.(t)
              cb.onActivity?.('Redactando', 'text')
            }
            break
          }
          case 'reasoning': {
            const t = str(item.text)
            if (t.trim()) cb.onTrace?.({ type: 'thinking', text: t, id })
            if (t) cb.onThinking?.(t)
            break
          }
          case 'command_execution': {
            const cmd = unwrapShell(str(item.command))
            if (phase === 'started' || !id) cb.onTrace?.({ type: 'tool', id, tool: 'command', title: tr('Ejecutando: {v1}', { v1: clip(cmd, 70) }), body: cmd })
            if (finished && id) {
              const code = typeof item.exit_code === 'number' ? item.exit_code : null
              const out = str(item.aggregated_output)
              cb.onTrace?.({ type: 'result', id, ok: !failed && (code == null || code === 0), output: code ? tr('{out}{v2}(código de salida {code})', { out, v2: out ? '\n' : '', code }) : out })
            }
            if (phase === 'started') cb.onActivity?.(`Ejecutando: ${clip(cmd, 40)}`, 'tool')
            break
          }
          case 'file_change': {
            const changes = (Array.isArray(item.changes) ? item.changes : []).map(obj).filter((c): c is Record<string, unknown> => !!c)
            const paths = changes.map((c) => str(c.path)).filter(Boolean)
            const names = [...new Set(paths.map(baseName))]
            const label = names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '') : 'archivos'
            const verb = (k: string): string => (k === 'add' ? 'nuevo' : k === 'delete' ? 'borrado' : 'cambiado')
            cb.onTrace?.({
              type: 'tool',
              id,
              tool: 'edit',
              title: tr('Editando {label}', { label }),
              body: changes.map((c) => `${verb(str(c.kind))}: ${str(c.path)}`).join('\n') || undefined
            })
            if (finished && id) cb.onTrace?.({ type: 'result', id, ok: !failed })
            if (paths.length) {
              cb.onActivity?.(`Editando ${label}`, 'tool')
              for (const p of paths) cb.onFile?.(p)
            } else {
              cb.onActivity?.(tr('Editando archivos'), 'tool')
            }
            break
          }
          case 'mcp_tool_call': {
            const name = [str(item.server), str(item.tool)].filter(Boolean).join(' · ') || tr('una herramienta')
            if (phase === 'started' || !id) {
              let args: string | undefined
              try {
                args = item.arguments != null ? JSON.stringify(item.arguments, null, 2) : undefined
              } catch {
                args = undefined
              }
              cb.onTrace?.({ type: 'tool', id, tool: 'other', title: tr('Usando {name}', { name }), body: args })
            }
            if (finished && id) {
              const err = str(obj(item.error)?.message) || str(item.error)
              cb.onTrace?.({ type: 'result', id, ok: !failed && !err, output: err || resultText(obj(item.result)?.content ?? item.result) })
            }
            if (phase === 'started') cb.onActivity?.(`Usando ${str(item.tool) || str(item.server) || 'una herramienta'}`, 'tool')
            break
          }
          case 'web_search': {
            const q = str(item.query)
            cb.onTrace?.({ type: 'tool', id, tool: 'web', title: q ? tr('Buscando en la web: «{clip}»', { clip: clip(q, 60) }) : tr('Buscando en la web') })
            if (finished && id) cb.onTrace?.({ type: 'result', id, ok: !failed })
            if (phase === 'started') cb.onActivity?.(tr('Buscando en la web'), 'tool')
            break
          }
          case 'todo_list': {
            const p = todoProgress(item.items, (t) => t.completed === true)
            if (p != null) cb.onProgress?.(p)
            cb.onTrace?.({ type: 'tool', id, ...todoTrace(item.items, (t) => t.completed === true, (t) => str(t.text)) })
            if (phase === 'started') cb.onActivity?.(tr('Organizando las tareas'), 'tool')
            break
          }
          case 'error': {
            // Non fatal warnings ("Model metadata ... not found") arrive as items.
            const m = str(item.message)
            if (m) {
              errors.push(m)
              cb.onTrace?.({ type: 'note', text: innerMessage(m) })
            }
            break
          }
        }
        return
      }
      if (type === 'turn.completed') {
        completed = true
        const u = obj(o.usage)
        if (u) {
          usage.input += num(u.input_tokens)
          usage.cached = (usage.cached ?? 0) + num(u.cached_input_tokens)
          usage.output += num(u.output_tokens) + num(u.reasoning_output_tokens)
        }
        return
      }
      if (type === 'turn.failed') {
        failedMsg = innerMessage(str(obj(o.error)?.message) || tr('La tarea falló'))
        return
      }
      if (type === 'error') {
        const m = innerMessage(str(o.message))
        if (m) errors.push(m)
      }
    },

    finish(outcome: ProcessOutcome): RunAgentResult {
      const r = finishInner(outcome)
      return threadId ? { ...r, sessionId: threadId } : r
    }
  }

  function finishInner(outcome: ProcessOutcome): RunAgentResult {
      if (outcome.cancelled) {
        return { ok: false, text: lastMessage, usage, errorKind: 'cancelled', errorMessage: 'Cancelada' }
      }
      if (!completed && !failedMsg && looksMissing(outcome)) {
        return { ok: false, text: '', usage, errorKind: 'missing', errorMessage: tr('No se encontró el CLI de Codex') }
      }
      if (completed && !failedMsg) return { ok: true, text: lastMessage, usage }

      const errText = [failedMsg, ...errors.slice(-3), stderrSummary(outcome.stderrTail)].filter(Boolean).join(' ')
      if (MODEL_UNAVAILABLE_RE.test(errText)) {
        return {
          ok: false,
          text: lastMessage,
          usage,
          errorKind: 'failed',
          modelUnavailable: true,
          errorMessage: tr('El modelo no está disponible para tu cuenta: {clip}', { clip: clip(failedMsg || errText, 160) })
        }
      }
      if (QUOTA_RE.test(errText)) {
        return { ok: false, text: lastMessage, usage, errorKind: 'quota', errorMessage: tr('Codex alcanzó su límite de uso') }
      }
      if (AUTH_RE.test(errText)) {
        return { ok: false, text: lastMessage, usage, errorKind: 'auth', errorMessage: tr(CODEX_AUTH_MESSAGE) }
      }
      if (outcome.timedOut) {
        return { ok: false, text: lastMessage, usage, errorKind: 'failed', errorMessage: tr('El CLI dejó de responder (sin salida durante 20 min)') }
      }
      return {
        ok: false,
        text: lastMessage,
        usage,
        errorKind: 'failed',
        errorMessage: errText ? clip(errText, 200) : outcome.spawnError ? tr('No se pudo lanzar: {clip}', { clip: clip(outcome.spawnError.message, 180) }) : tr('Codex terminó con un error (código {v1})', { v1: outcome.code ?? '?' })
      }
  }
}

export function runCodex(opts: RunAgentOptions): Promise<RunAgentResult> {
  return runCli({
    command: 'codex',
    args: codexArgs(opts.model, opts.mode, opts.images, opts.access, opts.effort, opts.resume),
    cwd: opts.cwd,
    stdin: opts.prompt,
    signal: opts.signal,
    parser: createCodexParser(opts),
    onStall: (text) => opts.onActivity?.(text, 'tool')
  })
}

// ---------- Real rate limits from the persisted sessions (~/.codex/sessions) ----------

export interface CodexRateWindow {
  usedPercent: number
  windowMinutes: number | null
  resetsAt: number | null
}

export interface CodexRateLimits {
  windows: { primary?: CodexRateWindow; secondary?: CodexRateWindow }
  reachedType: string | null
  planType: string | null
  /** mtime of the rollout file the data came from. */
  updatedAt: number
  file: string
}

/** Extract the balanced JSON object that starts at `start` ('{'). */
export function balancedObject(text: string, start: number): string | null {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function parseWindow(v: unknown): CodexRateWindow | undefined {
  const w = obj(v)
  if (!w || typeof w.used_percent !== 'number') return undefined
  const resets = typeof w.resets_at === 'number' ? w.resets_at * 1000 : null
  return {
    usedPercent: w.used_percent,
    windowMinutes: typeof w.window_minutes === 'number' ? w.window_minutes : null,
    resetsAt: resets
  }
}

/** Find the LAST `"rate_limits":{...}` object with data in a chunk of rollout JSONL. */
export function lastRateLimitsIn(text: string): Record<string, unknown> | null {
  const key = '"rate_limits":'
  let idx = text.lastIndexOf(key)
  while (idx >= 0) {
    const brace = text.indexOf('{', idx + key.length)
    const between = text.slice(idx + key.length, brace)
    if (brace > 0 && /^\s*$/.test(between)) {
      const json = balancedObject(text, brace)
      if (json) {
        try {
          const o = JSON.parse(json) as Record<string, unknown>
          const limitId = str(o.limit_id)
          if ((!limitId || limitId === 'codex') && (obj(o.primary) || obj(o.secondary))) return o
        } catch {
          /* partial line */
        }
      }
    }
    idx = idx > 0 ? text.lastIndexOf(key, idx - 1) : -1
  }
  return null
}

async function listDirsDesc(dir: string, re: RegExp): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && re.test(e.name))
      .map((e) => e.name)
      .sort((a, b) => Number(b) - Number(a))
  } catch {
    return []
  }
}

async function readTail(file: string, size: number, bytes: number): Promise<string> {
  const fh = await fsp.open(file, 'r')
  try {
    const len = Math.min(size, bytes)
    const buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, size - len)
    return buf.toString('utf8')
  } finally {
    await fh.close()
  }
}

/** Newest rollout files (walks YYYY/MM/DD newest-first, a few days deep), sorted by mtime desc. */
async function newestRollouts(root: string, maxDays = 4): Promise<{ file: string; mtime: number; size: number }[]> {
  const out: { file: string; mtime: number; size: number }[] = []
  let days = 0
  for (const y of await listDirsDesc(root, /^\d{4}$/)) {
    for (const m of await listDirsDesc(join(root, y), /^\d{1,2}$/)) {
      for (const d of await listDirsDesc(join(root, y, m), /^\d{1,2}$/)) {
        const dayDir = join(root, y, m, d)
        let names: string[] = []
        try {
          names = (await fsp.readdir(dayDir)).filter((n) => n.startsWith('rollout-') && n.endsWith('.jsonl'))
        } catch {
          /* ignore */
        }
        for (const n of names) {
          try {
            const st = await fsp.stat(join(dayDir, n))
            out.push({ file: join(dayDir, n), mtime: st.mtimeMs, size: st.size })
          } catch {
            /* ignore */
          }
        }
        if (++days >= maxDays) return out.sort((a, b) => b.mtime - a.mtime)
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

export async function readCodexRateLimits(codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')): Promise<CodexRateLimits | null> {
  const files = await newestRollouts(join(codexHome, 'sessions'))
  for (const f of files.slice(0, 15)) {
    for (const bytes of [256 * 1024, 4 * 1024 * 1024]) {
      let tail: string
      try {
        tail = await readTail(f.file, f.size, bytes)
      } catch {
        break
      }
      const rl = lastRateLimitsIn(tail)
      if (rl) {
        return {
          windows: { primary: parseWindow(rl.primary), secondary: parseWindow(rl.secondary) },
          reachedType: rl.rate_limit_reached_type == null ? null : String(rl.rate_limit_reached_type),
          planType: rl.plan_type == null ? null : String(rl.plan_type),
          updatedAt: f.mtime,
          file: f.file
        }
      }
      if (f.size <= bytes) break
    }
  }
  return null
}
