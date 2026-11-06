// Hermes Agent (Nous Research) como coordinador. Se ejecuta en modo «una sola consulta» y devuelve
// solo la respuesta final; su modelo y proveedor los decide su propia configuración (p. ej. OmniRoute).
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AUTH_RE, QUOTA_RE, clip, looksMissing, runCli, safeModel, stderrSummary } from './spawn'
import { EMPTY_USAGE, type JsonlParser, type RunAgentOptions, type RunAgentResult } from './types'
import { tr } from '@shared/i18n'

/** Para planificar, solo herramientas de consulta: nada de archivos, terminal ni subagentes propios. */
export const HERMES_PLAN_TOOLSETS = 'web,memory,skills,todo,session_search'
export const HERMES_WORK_TOOLSETS = 'web,file,terminal,memory,skills,todo,vision'

/** Avisos de arranque, actualizaciones e identificadores que no forman parte de la respuesta. */
const NOISE = /^(\s*[⚠✓✗→•…]|hermes:|Preparing the isolated|session_id:|\s*Restored hermes|install out of sync)/i

/**
 * Un plan normal le lleva 20–60 s, pero uno grande (mucho contexto y seis tareas) puede pasar de 2 minutos solo en
 * escribirse: el 13 oct, uno de 11 000 palabras tardó 2 min 14 s con Fable 5.1 y con Opus 5 por OmniRoute se cortó a
 * los 3 minutos (y lo repitió otro agente desde cero). Hermes en modo -Q no enseña nada hasta el final, así que no
 * se distingue «escribiendo» de «colgado»: pasado esto, su modelo no responde y planifica el siguiente.
 */
export const HERMES_PLAN_TIMEOUT_MS = 6 * 60_000

/** Nombre de un proveedor de Hermes (propio, como «anthropic», o de `providers:` en su config, como «omnirouter»). */
const PROVIDER_RE = /^[\w.\-:]+$/

export function hermesArgs(queryFile: string, model: string, mode: 'plan' | 'work', provider?: string): string[] {
  const args = ['chat', '-Q', '--query-file', queryFile.replace(/\\/g, '/'), '--ignore-rules']
  args.push('-t', mode === 'plan' ? HERMES_PLAN_TOOLSETS : HERMES_WORK_TOOLSETS)
  const m = safeModel(model)
  if (m) args.push('-m', m)
  // El modelo elegido con «/model» en AI Cowork, con su proveedor (sin tocar la configuración de Hermes).
  if (m && provider && PROVIDER_RE.test(provider)) args.push('--provider', provider)
  return args
}

export function createHermesParser(): JsonlParser {
  const lines: string[] = []
  return {
    line(o) {
      lines.push(JSON.stringify(o))
    },
    raw(line) {
      if (!NOISE.test(line)) lines.push(line)
    },
    finish(outcome): RunAgentResult {
      const text = lines.join('\n').trim()
      const usage = { ...EMPTY_USAGE }
      if (outcome.cancelled) return { ok: false, text, usage, errorKind: 'cancelled', errorMessage: 'Cancelada' }
      if (outcome.spawnError || looksMissing(outcome)) {
        return { ok: false, text, usage, errorKind: 'missing', errorMessage: tr('No se encontró Hermes Agent (comando `hermes`)') }
      }
      const all = `${text}\n${outcome.stderrTail}`
      if (outcome.code !== 0 || !text) {
        if (AUTH_RE.test(all) || /\b401\b|unauthori[sz]ed/i.test(all)) {
          return { ok: false, text, usage, errorKind: 'auth', errorMessage: tr('Hermes no pudo autenticarse con su proveedor de modelos (revisa OmniRoute o `hermes model`)') }
        }
        if (/connection refused|connecterror|failed to connect|unreachable|ECONNREFUSED|timed? ?out/i.test(all)) {
          return { ok: false, text, usage, errorKind: 'offline', errorMessage: tr('Hermes no puede conectar con su proveedor de modelos (¿OmniRoute está apagado?)') }
        }
        if (QUOTA_RE.test(all)) return { ok: false, text, usage, errorKind: 'quota', errorMessage: tr('El proveedor de Hermes alcanzó su límite de uso') }
        return {
          ok: false,
          text,
          usage,
          errorKind: 'failed',
          errorMessage: clip(`Hermes: ${stderrSummary(outcome.stderrTail) || (text ? 'terminó con error' : 'no devolvió respuesta')}`, 220)
        }
      }
      return { ok: true, text, usage }
    }
  }
}

export async function runHermes(opts: RunAgentOptions): Promise<RunAgentResult> {
  // La consulta va en un archivo temporal: el texto del usuario nunca pasa por la línea de comandos.
  const dir = join(tmpdir(), 'ai-cowork-hermes')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${randomUUID()}.txt`)
  writeFileSync(file, opts.prompt, 'utf8')
  opts.onActivity?.(opts.mode === 'plan' ? tr('Planificando el trabajo') : tr('Trabajando'), 'tool')
  const slow = new AbortController()
  const timer = opts.mode === 'plan' ? setTimeout(() => slow.abort(), HERMES_PLAN_TIMEOUT_MS) : null
  try {
    const res = await runCli({
      command: 'hermes',
      args: hermesArgs(file, opts.model, opts.mode, opts.agent.modelProvider),
      cwd: opts.cwd,
      stdin: '',
      signal: AbortSignal.any([opts.signal, slow.signal]),
      parser: createHermesParser(),
      onStall: (text) => opts.onActivity?.(text, 'tool')
    })
    if (slow.signal.aborted && !opts.signal.aborted) {
      const minutes = HERMES_PLAN_TIMEOUT_MS / 60_000
      return {
        ...res,
        ok: false,
        errorKind: 'failed',
        errorMessage: tr('Hermes no respondió en {minutes} minutos: su modelo es demasiado lento o no responde (revísalo con «hermes status»)', { minutes })
      }
    }
    return res
  } finally {
    if (timer) clearTimeout(timer)
    rmSync(file, { force: true })
  }
}
