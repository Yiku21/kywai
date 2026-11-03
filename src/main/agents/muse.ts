import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentAccess, TraceTool } from '@shared/types'
import { AUTH_RE, MODEL_UNAVAILABLE_RE, QUOTA_RE, baseName, clip, looksMissing, num, obj, runCli, safeModel, stderrSummary, str } from './spawn'
import { EMPTY_USAGE } from './types'
import type { Effort, JsonlParser, ParserCallbacks, ProcessOutcome, RunAgentOptions, RunAgentResult } from './types'

export const MUSE_AUTH_MESSAGE = 'Sesión de Muse Code caducada: abre `muse` en una terminal y usa /login'

/** Image paths must be sanitized relative paths (attachments/foo.png). */
const REL_IMAGE_RE = /^[\w.\-]+(\/[\w.\-]+)*$/

/**
 * `muse exec` sin ventana. El encargo va en un archivo (--prompt-file), nunca en la línea de órdenes.
 * Planificar: sin escribir ni ejecutar nada. Trabajar: sin pedir aprobaciones (nadie podría darlas) y, con
 * acceso al proyecto, dentro de su sandbox y sin red para los comandos; con acceso completo, sin sandbox.
 */
export function museArgs(
  promptFile: string,
  model: string,
  mode: 'plan' | 'work',
  images: string[] = [],
  access: AgentAccess = 'project',
  effort?: Effort
): string[] {
  const args = ['exec', '--json', '--prompt-file', promptFile, '--no-session-log']
  if (mode === 'plan') args.push('--disable-approval', '--disable-write', '--disable-shell')
  else if (access === 'full') args.push('--yolo')
  else args.push('--disable-approval', '--trust-workspace', '--sandbox-network', 'restricted')
  for (const img of images) {
    const rel = img.replace(/\\/g, '/')
    if (REL_IMAGE_RE.test(rel) && !rel.split('/').includes('..')) args.push('--image', rel)
  }
  // Sin modelo: el que tenga configurado Muse Code (así se respeta su modo Contributor).
  const m = safeModel(model)
  if (m) args.push('--model', m)
  if (effort) args.push('--reasoning-effort', effort)
  return args
}

interface ToolLook {
  tool: TraceTool
  title: string
}

/** Cómo se ve cada herramienta de Muse (task_kind «tool.<nombre>»). */
function toolLook(name: string): ToolLook {
  const n = name.toLowerCase()
  if (/bash|shell|exec|command|powershell/.test(n)) return { tool: 'command', title: 'Ejecutando un comando' }
  if (/write/.test(n)) return { tool: 'write', title: 'Escribiendo un archivo' }
  if (/edit|patch/.test(n)) return { tool: 'edit', title: 'Editando un archivo' }
  if (/read|view|open/.test(n)) return { tool: 'read', title: 'Leyendo un archivo' }
  if (/web|search_web|browse|fetch|url/.test(n)) return { tool: 'web', title: 'Buscando en la web' }
  if (/grep|glob|search|find|list|ls/.test(n)) return { tool: 'search', title: 'Buscando en el proyecto' }
  if (/todo|plan/.test(n)) return { tool: 'todo', title: 'Organizando las tareas' }
  if (/agent|delegat|spawn|subagent/.test(n)) return { tool: 'agent', title: 'Encargando una parte a un ayudante' }
  return { tool: 'other', title: `Usando ${name.replace(/_/g, ' ')}` }
}

/** Avisos de Muse en stderr que no son errores (carpeta de trabajo, delegación sin confianza). */
const STDERR_NOISE = /^muse: (workspace root|agent delegation)[^\n]*$/gim

/**
 * Lector de `muse exec --json`. Cada línea es un registro con `payload_type`; lo que hace el agente son
 * «tareas» internas (`task_kind`): `model.meta.response` cuando piensa y `tool.<nombre>` para cada herramienta.
 * La respuesta llega en trozos (`run.output.delta`) y entera al final (`run.terminal.completed`).
 * Muse no informa de tokens: el consumo se cuenta sin ellos (como Hermes).
 */
export function createMuseParser(cb: ParserCallbacks): JsonlParser {
  const tasks = new Map<string, string>()
  const callToTask = new Map<string, string>()
  let answer = ''
  let terminal: string | null = null
  let finalText = ''
  let reason = ''
  let model: string | undefined
  const errors: string[] = []

  const toolName = (kind: string): string | null => (kind.startsWith('tool.') ? kind.slice(5) : null)

  return {
    line(o) {
      const type = str(o.payload_type)
      const p = obj(o.payload) ?? {}
      const ev = obj(p.event) ?? {}
      const id = str(ev.task_id)

      if (type === 'run.model.configured') {
        model = str(p.model_id) || undefined
        return
      }
      if (type === 'task.lifecycle.proposed') {
        const kind = str(ev.task_kind)
        if (!id || !kind) return
        tasks.set(id, kind)
        const name = toolName(kind)
        if (name) {
          const look = toolLook(name)
          cb.onTrace?.({ type: 'tool', id, tool: look.tool, title: look.title })
          cb.onActivity?.(look.title, 'tool')
        } else if (kind === 'model.meta.response') {
          cb.onThinking?.('')
        }
        return
      }
      if (type === 'task.lifecycle.scheduled') {
        const key = str(ev.idempotency_key)
        if (id && key.startsWith('tool:')) callToTask.set(key.slice(5), id)
        return
      }
      if (type === 'task.lifecycle.output') {
        const name = toolName(tasks.get(id) ?? '')
        if (!name) return
        const chunk = str(ev.chunk)
        if (toolLook(name).tool === 'command') {
          let res: Record<string, unknown> | null = null
          try {
            res = obj(JSON.parse(chunk))
          } catch {
            res = null
          }
          const cmd = str(res?.command)
          if (cmd) {
            cb.onTrace?.({ type: 'tool', id, tool: 'command', title: `Ejecutando: ${clip(cmd, 70)}`, body: cmd })
            cb.onActivity?.(`Ejecutando: ${clip(cmd, 40)}`, 'tool')
          }
          const code = typeof res?.exit_code === 'number' ? (res.exit_code as number) : null
          const out = res ? str(res.output) : chunk
          cb.onTrace?.({ type: 'result', id, ok: code == null || code === 0, output: code ? `${out}${out ? '\n' : ''}(código de salida ${code})` : out })
        } else if (ev.final_result === true) {
          cb.onTrace?.({ type: 'result', id, ok: true, output: clip(chunk, 4000) })
        }
        return
      }
      if (type === 'task.lifecycle.failed') {
        const why = str(ev.error) || str(obj(ev.error)?.message) || str(ev.reason) || str(ev.message)
        if (toolName(tasks.get(id) ?? '')) cb.onTrace?.({ type: 'result', id, ok: false, output: why || 'Falló' })
        else if (why) errors.push(why)
        return
      }
      if (type === 'tool.result') {
        const taskId = callToTask.get(str(p.call_id))
        const edit = obj(p.edit_facts)
        const path = str(edit?.path)
        if (path) {
          const tool = str(edit?.tool_name)
          const verb = /write/.test(tool) ? 'Escribiendo' : 'Editando'
          const added = num(edit?.added)
          const removed = num(edit?.removed)
          if (taskId) {
            cb.onTrace?.({
              type: 'tool',
              id: taskId,
              tool: verb === 'Escribiendo' ? 'write' : 'edit',
              title: `${verb} ${baseName(path)}`,
              body: `${path}${added || removed ? ` (+${added} −${removed} líneas)` : ''}`
            })
          }
          cb.onActivity?.(`${verb} ${baseName(path)}`, 'tool')
          cb.onFile?.(path)
        }
        const outcome = str(obj(p.correlation_facts)?.outcome)
        if (taskId && outcome && outcome !== 'success') cb.onTrace?.({ type: 'result', id: taskId, ok: false, output: clip(str(p.text), 4000) })
        return
      }
      if (type === 'task.lifecycle.status') {
        // Reintentos y errores al hablar con Meta (cuota, sesión…): se guardan por si la petición acaba mal.
        const facets = Array.isArray(obj(ev.details)?.facets) ? (obj(ev.details)!.facets as unknown[]) : []
        for (const f of facets.map(obj)) {
          const kind = str(f?.error_kind)
          if (kind && kind !== 'stream_succeeded') errors.push(`${str(ev.message)} (${kind})`)
          if (num(f?.attempt) > 1 && /opening/i.test(str(ev.message))) cb.onTrace?.({ type: 'note', text: `Reintentando la conexión con Meta (intento ${num(f?.attempt)})` })
        }
        return
      }
      if (type === 'run.output.delta') {
        const t = str(p.text)
        if (!t) return
        answer += t
        cb.onTrace?.({ type: 'text', text: t, delta: true, id: 'answer' })
        cb.onText?.(answer)
        cb.onActivity?.('Redactando', 'text')
        return
      }
      if (type.startsWith('run.terminal.')) {
        terminal = str(p.terminal) || type.slice('run.terminal.'.length)
        finalText = str(p.text)
        const r = p.reason
        reason = typeof r === 'string' ? r : r ? JSON.stringify(r) : ''
      }
    },

    raw(lineText) {
      if (/error|failed|denied/i.test(lineText)) errors.push(lineText)
    },

    finish(outcome: ProcessOutcome): RunAgentResult {
      const text = (finalText || answer).trim()
      const usage = { ...EMPTY_USAGE }
      if (outcome.cancelled) return { ok: false, text, usage, errorKind: 'cancelled', errorMessage: 'Cancelada', model }
      if (terminal === 'completed') return { ok: true, text, usage, model }
      if (!terminal && looksMissing(outcome)) {
        return { ok: false, text: '', usage, errorKind: 'missing', errorMessage: 'No se encontró el CLI de Muse Code' }
      }
      const stderr = stderrSummary(outcome.stderrTail.replace(STDERR_NOISE, ''))
      const errText = [reason, ...errors.slice(-3), stderr].filter(Boolean).join(' ')
      if (MODEL_UNAVAILABLE_RE.test(errText)) {
        return { ok: false, text, usage, model, errorKind: 'failed', modelUnavailable: true, errorMessage: `El modelo no está disponible para tu cuenta: ${clip(errText, 160)}` }
      }
      if (QUOTA_RE.test(errText)) {
        return { ok: false, text, usage, model, errorKind: 'quota', errorMessage: 'Muse Code alcanzó el límite de su plan (se renueva cada 5 horas)' }
      }
      if (AUTH_RE.test(errText)) return { ok: false, text, usage, model, errorKind: 'auth', errorMessage: MUSE_AUTH_MESSAGE }
      if (outcome.timedOut) {
        return { ok: false, text, usage, model, errorKind: 'failed', errorMessage: 'El CLI dejó de responder (sin salida durante 20 min)' }
      }
      const what = terminal && terminal !== 'completed' ? `Muse terminó «${terminal}»` : ''
      return {
        ok: false,
        text,
        usage,
        model,
        errorKind: terminal === 'cancelled' ? 'cancelled' : 'failed',
        errorMessage: clip([what, errText].filter(Boolean).join(': '), 200) || `Muse Code terminó con un error (código ${outcome.code ?? '?'})`
      }
    }
  }
}

export async function runMuse(opts: RunAgentOptions): Promise<RunAgentResult> {
  const dir = mkdtempSync(join(tmpdir(), 'aicw-muse-'))
  const promptFile = join(dir, 'encargo.md')
  writeFileSync(promptFile, opts.prompt, 'utf8')
  try {
    return await runCli({
      command: 'muse',
      args: museArgs(promptFile, opts.model, opts.mode, opts.images, opts.access, opts.effort),
      cwd: opts.cwd,
      stdin: '',
      signal: opts.signal,
      parser: createMuseParser(opts),
      onStall: (text) => opts.onActivity?.(text, 'tool'),
      // La suscripción va con la sesión de Muse Code: una clave en el entorno se cobraría por uso.
      unsetEnv: ['META_API_KEY']
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
