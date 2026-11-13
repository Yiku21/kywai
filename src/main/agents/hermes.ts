// Hermes Agent (Nous Research) como coordinador. Se ejecuta en modo «una sola consulta» y devuelve
// solo la respuesta final; su modelo y proveedor los decide su propia configuración (p. ej. OmniRoute).
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AUTH_RE, QUOTA_RE, clip, looksMissing, runCli, safeModel, stderrSummary } from './spawn'
import { EMPTY_USAGE, type JsonlParser, type RunAgentOptions, type RunAgentResult } from './types'
import { tr } from '@shared/i18n'
import { hermesHomeToolsets } from '../hermesHomeMcp'

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

/** El gateway de Hermes rechaza la sesión por un toolset que no está en su configuración. */
export const INVALID_TOOLSET_RE = /invalid toolset name|unknown toolset/i

/** Nombre de un proveedor de Hermes (propio, como «anthropic», o de `providers:` en su config, como «omnirouter»). */
const PROVIDER_RE = /^[\w.\-:]+$/

export function hermesArgs(queryFile: string, model: string, mode: 'plan' | 'work', provider?: string, mcpNames: string[] = [], images = false, homeToolsets: string[] = []): string[] {
  const args = ['chat', '-Q', '--query-file', queryFile.replace(/\\/g, '/'), '--ignore-rules']
  // Los servidores MCP de Extensiones entran como «toolsets» con su nombre (solo al trabajar, no al planificar). Al
  // planificar, ninguno: «hermes chat» abre la sesión en su gateway, que valida -t con SU configuración (~/.hermes) y
  // no con la de HERMES_MANAGED_DIR; un servidor que solo existe ahí («kywai-navegador») hace que rechace la sesión
  // entera («unknown or invalid toolset name», 13 nov) y Hermes no puede coordinar.
  // Los que kywai apuntó en ~/.hermes (Lightpanda, hermesHomeMcp.ts) sí valen en los dos modos: el gateway los conoce.
  const valid = (n: string): boolean => /^[a-z][a-z0-9_-]{0,30}$/.test(n)
  const extra = [...new Set([...(mode === 'work' ? mcpNames.filter(valid) : []), ...homeToolsets.filter(valid)])]
  // Con capturas adjuntas, Hermes planifica igual y las mira con su herramienta de visión (vision_analyze).
  if (mode === 'plan' && images) extra.push('vision')
  args.push('-t', [mode === 'plan' ? HERMES_PLAN_TOOLSETS : HERMES_WORK_TOOLSETS, ...extra].join(','))
  const m = safeModel(model)
  if (m) args.push('-m', m)
  // El modelo elegido con «/model» en kywai, con su proveedor (sin tocar la configuración de Hermes).
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
          // Sin nada en stderr, su propio aviso (p. ej. «Hermes couldn't start the model connection: …») dice más que «terminó con error».
          errorMessage: clip(`Hermes: ${stderrSummary(outcome.stderrTail) || stderrSummary(text) || 'no devolvió respuesta'}`, 220)
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
    const home = hermesHomeToolsets()
    const call = (mcp: boolean) =>
      runCli({
        command: 'hermes',
        args: hermesArgs(file, opts.model, opts.mode, opts.agent.modelProvider, mcp ? opts.extraMcp?.names : [], !!opts.images?.length, mcp ? home : []),
        ...(mcp && opts.mode === 'work' && opts.extraMcp && Object.keys(opts.extraMcp.env).length ? { env: opts.extraMcp.env } : {}),
        cwd: opts.cwd,
        stdin: '',
        signal: AbortSignal.any([opts.signal, slow.signal]),
        parser: createHermesParser(),
        onStall: (text) => opts.onActivity?.(text, 'tool')
      })
    let res = await call(true)
    // Su gateway valida las herramientas con ~/.hermes: si rechaza un servidor de Extensiones, se repite sin ellos.
    if (!res.ok && (opts.extraMcp?.names.length || home.length) && INVALID_TOOLSET_RE.test(`${res.text}\n${res.errorMessage ?? ''}`)) {
      opts.onActivity?.(tr('Hermes no admite esas herramientas: sigue sin ellas'), 'tool')
      res = await call(false)
    }
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
