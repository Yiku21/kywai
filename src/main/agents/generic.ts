// Agentes de catálogo: cualquier programa de terminal que atienda un encargo y devuelva texto (Aider, OpenCode,
// Copilot CLI, Goose…). Se lanza con la sesión que el usuario ya tiene en él (su suscripción), en la carpeta del
// proyecto y sin que el texto del encargo pase por la línea de órdenes: entra por stdin o por un archivo.
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CliAgentSpec } from '@shared/types'
import { AUTH_RE, QUOTA_RE, clip, looksMissing, runCli, safeModel, stderrSummary } from './spawn'
import { EMPTY_USAGE, type JsonlParser, type ParserCallbacks, type RunAgentOptions, type RunAgentResult } from './types'

/** De dónde sale la clave de API de un agente (la app la pone al arrancar; en las pruebas no hay ninguna). */
let keyOf: (agentId: string) => string | null = () => null

export function setAgentKeyResolver(fn: (agentId: string) => string | null): void {
  keyOf = fn
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

/** Sustituye los marcadores de una plantilla de argumentos. */
export function expandArgs(template: string[], vars: Record<string, string>): string[] {
  return template.map((a) => a.replace(/\{(prompt|promptFile|model)\}/g, (_m, k: string) => vars[k] ?? ''))
}

/** Los argumentos de una consulta: base + (solo lectura al planificar, o aprobar todo con acceso completo) + modelo. */
export function genericArgs(
  spec: CliAgentSpec,
  opts: { mode: 'plan' | 'work'; access?: 'full' | 'project'; model: string },
  vars: { prompt: string; promptFile: string }
): string[] {
  const template = [...spec.args]
  if (opts.mode === 'plan') template.push(...(spec.planArgs ?? []))
  // Trabajando: con acceso completo, lo suyo (si lo tiene); si no, los argumentos de trabajo.
  else if (opts.access === 'full' && spec.fullAccessArgs) template.push(...spec.fullAccessArgs)
  else template.push(...(spec.workArgs ?? []))
  const model = safeModel(opts.model)
  if (model && spec.modelArgs?.length) template.push(...spec.modelArgs)
  return expandArgs(template, { ...vars, model: model ?? '' }).filter((a) => a !== '')
}

function safeRegExp(source: string | undefined): RegExp | null {
  if (!source) return null
  try {
    return new RegExp(source, 'i')
  } catch {
    return null
  }
}

export function createGenericParser(spec: CliAgentSpec, name: string, cb: ParserCallbacks): JsonlParser {
  let out = ''
  let lastActivity = 0
  const auth = safeRegExp(spec.authPattern)
  const quota = safeRegExp(spec.quotaPattern)
  return {
    // La salida entera, tal cual (con sus saltos de línea y sangrías): es el resultado.
    chunk(text) {
      out += text.replace(ANSI, '')
      const now = Date.now()
      if (now - lastActivity > 1500) {
        lastActivity = now
        const last = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop()
        if (last) cb.onActivity?.(clip(last, 90), 'text')
      }
    },
    line() {},
    finish(outcome): RunAgentResult {
      const text = out.trim()
      const usage = { ...EMPTY_USAGE }
      if (text) cb.onTrace?.({ type: 'text', text })
      if (outcome.cancelled) return { ok: false, text, usage, errorKind: 'cancelled', errorMessage: 'Cancelada' }
      if (outcome.spawnError || looksMissing(outcome)) {
        return { ok: false, text, usage, errorKind: 'missing', errorMessage: `No se encontró ${name} (comando \`${spec.command}\`)` }
      }
      const all = `${text}\n${outcome.stderrTail}`
      if (outcome.code !== 0 || !text) {
        if (auth ? auth.test(all) : AUTH_RE.test(all)) {
          return { ok: false, text, usage, errorKind: 'auth', errorMessage: `${name} no tiene la sesión iniciada: ábrelo en una terminal e inicia sesión` }
        }
        if (quota ? quota.test(all) : QUOTA_RE.test(all)) {
          return { ok: false, text, usage, errorKind: 'quota', errorMessage: `${name} alcanzó su límite de uso` }
        }
        if (outcome.timedOut) {
          return { ok: false, text, usage, errorKind: 'failed', errorMessage: `${name} dejó de responder` }
        }
        return {
          ok: false,
          text,
          usage,
          errorKind: 'failed',
          errorMessage: clip(`${name}: ${stderrSummary(outcome.stderrTail) || (text ? 'terminó con error' : 'no devolvió respuesta')}`, 220)
        }
      }
      return { ok: true, text, usage }
    }
  }
}

export async function runGeneric(opts: RunAgentOptions): Promise<RunAgentResult> {
  const spec = opts.agent.cli
  if (!spec) {
    return { ok: false, text: '', usage: { ...EMPTY_USAGE }, errorKind: 'missing', errorMessage: `${opts.agent.name} no tiene configurado cómo lanzarlo` }
  }
  const name = opts.agent.name
  let promptFile = ''
  let promptDir = ''
  try {
    if (spec.promptVia !== 'stdin') {
      // El archivo va dentro de la carpeta de trabajo (donde el agente tiene permiso para leer).
      promptDir = join(opts.cwd, '.ai-cowork', 'encargos')
      mkdirSync(promptDir, { recursive: true })
      promptFile = join(promptDir, `${randomUUID()}.md`)
      writeFileSync(promptFile, opts.prompt, 'utf8')
    }
    const file = promptFile.replace(/\\/g, '/')
    const instruction = `Read the file ${file} and carry out exactly the instructions in it. It is your complete task. Reply with the final result.`
    const args = genericArgs(spec, { mode: opts.mode, access: opts.access, model: opts.model }, { prompt: instruction, promptFile: file })
    opts.onActivity?.(opts.mode === 'plan' ? 'Planificando el trabajo' : 'Trabajando', 'tool')
    return await runCli({
      command: spec.command,
      args,
      cwd: opts.cwd,
      stdin: spec.promptVia === 'stdin' ? opts.prompt : '',
      signal: opts.signal,
      parser: createGenericParser(spec, name, opts),
      onStall: (text) => opts.onActivity?.(text, 'tool'),
      // La clave de API del agente (si la tiene guardada) va solo al entorno de su programa.
      env: { ...(spec.env ?? {}), ...(spec.apiKey && keyOf(opts.agent.id) ? { [spec.apiKey.env]: keyOf(opts.agent.id)! } : {}) }
    })
  } finally {
    if (promptFile) rmSync(promptFile, { force: true })
  }
}
