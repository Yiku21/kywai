import { spawn, type ChildProcess } from 'node:child_process'
import { waitForFolderAccess } from '../macPermissions'
import type { JsonlParser, ProcessOutcome, RunAgentResult } from './types'
import { tr } from '@shared/i18n'

const IS_WIN = process.platform === 'win32'
const STDERR_KEEP = 4096
/** Kill the CLI if it produces no output at all for this long. */
const IDLE_TIMEOUT_MS = 20 * 60 * 1000
/**
 * Tras el corte por silencio: si el CLI no se cierra (p. ej. parado en una ventana de permisos de macOS, que no
 * atiende a SIGTERM), se le fuerza con SIGKILL y, si ni así, la tarea se da por terminada igualmente.
 */
const KILL_GRACE_MS = 10_000
const GIVE_UP_MS = 30_000
/**
 * Sin salida durante este rato se avisa (una vez por silencio): suele ser una ventana de permisos de macOS o del
 * llavero que solo se puede contestar delante del equipo, y así se ve desde el móvil sin esperar los 20 minutos.
 */
export const STALL_NOTICE_MS = 3 * 60 * 1000
export const STALL_NOTICE =
  'Lleva 3 min sin dar señales: si sigue así, puede que espere un aviso de permisos en la pantalla del servidor'

/** Model names allowed as CLI arguments. Anything else is dropped. */
export const MODEL_RE = /^[\w.:\-\/]+$/

export function safeModel(model: string | undefined): string | null {
  const m = (model ?? '').trim()
  return m && MODEL_RE.test(m) ? m : null
}

/** Arguments are only fixed flags, validated models or sanitized relative paths. */
// Letras y números de cualquier idioma (rutas con acentos), nunca los caracteres que interpreta una consola.
const PLAIN_ARG = /^[\p{L}\p{N}_.:\-\/=,@]+$/u
const QUOTABLE_ARG = /^[\p{L}\p{N}_.:\-\/=,@ ]+$/u

/** Quote one argument for shell:true (cmd.exe or /bin/sh). Throws on anything unsafe. */
export function quoteArg(arg: string): string {
  if (PLAIN_ARG.test(arg)) return arg
  if (QUOTABLE_ARG.test(arg)) return `"${arg}"`
  throw new Error(tr('Argumento no permitido para el CLI: {v1}', { v1: JSON.stringify(arg) }))
}

export function buildCommandLine(command: string, args: string[]): string {
  if (!/^[\w.\-]+$/.test(command)) throw new Error(tr('Comando no permitido: {command}', { command }))
  return [command, ...args.map(quoteArg)].join(' ')
}

export function killTree(child: ChildProcess, sig: NodeJS.Signals = 'SIGTERM'): void {
  const pid = child.pid
  if (!pid) return
  try {
    if (IS_WIN) {
      const k = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      k.on('error', () => child.kill())
    } else {
      try {
        process.kill(-pid, sig)
      } catch {
        child.kill(sig)
      }
    }
  } catch {
    /* already gone */
  }
}

export interface CliRun {
  command: string
  args: string[]
  cwd: string
  stdin: string
  signal: AbortSignal
  parser: JsonlParser
  env?: Record<string, string>
  /** Variables que el CLI no debe ver (por ejemplo una clave de API que se cobraría por uso). */
  unsetEnv?: string[]
  /** Se llama con STALL_NOTICE si el CLI lleva STALL_NOTICE_MS sin escribir nada. */
  onStall?: (text: string) => void
}

/**
 * Spawn a CLI through the shell (needed for npm .cmd shims on Windows). The user text NEVER goes
 * in the command line: it is written to stdin. stdout is parsed as JSONL.
 */
export async function runCli(run: CliRun): Promise<RunAgentResult> {
  // En macOS, antes de lanzar: si la carpeta está retenida por una ventana de permisos, se avisa al momento y se
  // espera la respuesta (el agente no se queda colgado sin saber por qué); si macOS la deniega, se dice cómo darla.
  const denied = await waitForFolderAccess(run.cwd, { signal: run.signal, onWaiting: run.onStall })
  if (denied && run.signal.aborted) return run.parser.finish({ code: null, stderrTail: '', cancelled: true })
  if (denied) return { ok: false, text: '', usage: { input: 0, output: 0 }, errorKind: 'failed', errorMessage: denied }
  return runCliProcess(run)
}

function runCliProcess(run: CliRun): Promise<RunAgentResult> {
  return new Promise((resolve) => {
    let cmdline: string
    try {
      cmdline = buildCommandLine(run.command, run.args)
    } catch (e) {
      resolve(run.parser.finish({ code: null, stderrTail: '', spawnError: e as Error, cancelled: false }))
      return
    }
    if (run.signal.aborted) {
      resolve(run.parser.finish({ code: null, stderrTail: '', cancelled: true }))
      return
    }

    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...run.env }
    for (const k of run.unsetEnv ?? []) delete env[k]
    const child = spawn(cmdline, {
      shell: true,
      cwd: run.cwd,
      windowsHide: true,
      detached: !IS_WIN,
      env
    })

    let stdoutBuf = ''
    let stderrTail = ''
    let cancelled = false
    let timedOut = false
    let spawnError: Error | undefined
    let done = false
    let idleTimer: NodeJS.Timeout | undefined
    let stallTimer: NodeJS.Timeout | undefined

    const resetIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        timedOut = true
        killTree(child)
        setTimeout(() => {
          if (done) return
          killTree(child, 'SIGKILL')
          setTimeout(() => finish(null), GIVE_UP_MS).unref()
        }, KILL_GRACE_MS).unref()
      }, IDLE_TIMEOUT_MS)
      if (stallTimer) clearTimeout(stallTimer)
      if (run.onStall) stallTimer = setTimeout(() => run.onStall?.(STALL_NOTICE), STALL_NOTICE_MS)
    }
    resetIdle()

    const handleLine = (raw: string): void => {
      const line = raw.trim()
      if (!line) return
      if (line.startsWith('{')) {
        let obj: unknown
        try {
          obj = JSON.parse(line)
        } catch {
          run.parser.raw?.(line)
          return
        }
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          try {
            run.parser.line(obj as Record<string, unknown>)
          } catch (e) {
            console.error('[cowork] parser error', e)
          }
        }
      } else {
        run.parser.raw?.(line)
      }
    }

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      resetIdle()
      if (run.parser.chunk) {
        run.parser.chunk(chunk)
        return
      }
      stdoutBuf += chunk
      let nl: number
      while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, nl)
        stdoutBuf = stdoutBuf.slice(nl + 1)
        handleLine(line)
      }
    })
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_KEEP)
    })
    child.stdin?.on('error', () => {
      /* EPIPE if the CLI exits early */
    })

    const onAbort = (): void => {
      cancelled = true
      killTree(child)
    }
    run.signal.addEventListener('abort', onAbort, { once: true })

    const finish = (code: number | null): void => {
      if (done) return
      done = true
      if (idleTimer) clearTimeout(idleTimer)
      if (stallTimer) clearTimeout(stallTimer)
      run.signal.removeEventListener('abort', onAbort)
      if (stdoutBuf.trim()) handleLine(stdoutBuf)
      stdoutBuf = ''
      const outcome: ProcessOutcome = { code, stderrTail, spawnError, cancelled, timedOut }
      let result: RunAgentResult
      try {
        result = run.parser.finish(outcome)
      } catch (e) {
        result = {
          ok: false,
          text: '',
          usage: { input: 0, output: 0 },
          errorKind: 'failed',
          errorMessage: tr('Error interno: {message}', { message: (e as Error).message })
        }
      }
      if (timedOut && result.ok === false && result.errorKind === 'failed') {
        result.errorMessage = tr('El CLI dejó de responder (sin salida durante 20 min)')
      }
      resolve(result)
    }

    child.on('error', (err) => {
      spawnError = err
      finish(null)
    })
    child.on('close', (code) => finish(code))

    child.stdin?.write(run.stdin, 'utf8')
    child.stdin?.end()
  })
}

/** Is the CLI available on PATH? (no network, no paid calls) */
export function commandExists(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!/^[\w.\-]+$/.test(name)) return resolve(false)
    const p = IS_WIN
      ? spawn('where.exe', [name], { windowsHide: true, stdio: 'ignore' })
      : spawn('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' })
    const t = setTimeout(() => {
      p.kill()
      resolve(false)
    }, 8000)
    p.on('error', () => {
      clearTimeout(t)
      resolve(false)
    })
    p.on('close', (code) => {
      clearTimeout(t)
      resolve(code === 0)
    })
  })
}

// ---------- helpers shared by the parsers ----------

/** cmd.exe "not recognized" / sh "not found" → the CLI is not installed. */
export function looksMissing(outcome: ProcessOutcome): boolean {
  if (outcome.spawnError && (outcome.spawnError as NodeJS.ErrnoException).code === 'ENOENT') return true
  if (outcome.code === 9009 || outcome.code === 127) return true
  return /is not recognized as an internal or external command|no se reconoce como un comando|command not found/i.test(
    outcome.stderrTail
  )
}

export function baseName(p: unknown): string {
  if (typeof p !== 'string' || !p) return 'un archivo'
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || p
}

export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/** Last meaningful line of stderr, without ANSI codes. */
export function stderrSummary(stderr: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = stderr.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
  const lines = clean
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(warning:|ripgrep is not available|\(node:|\(use `node)/i.test(l))
  return lines.slice(-3).join(' ').slice(0, 300)
}

export const AUTH_RE =
  /authenticat|\blog ?in\b|oauth|api[ _-]?key|unauthori[sz]ed|\b401\b|not logged|session expired|credentials|refresh token|token (has )?expired/i
export const QUOTA_RE =
  /usage limit|rate limit|rate_limit|limit reached|quota|\b429\b|too many requests|resource[_ ]exhausted|out of credits|spend.?control/i
export const MODEL_UNAVAILABLE_RE =
  /model[^.\n]{0,80}(not supported|not found|does not exist|not available|unknown|invalid|no existe)|unknown model|invalid model/i

/** Progress 0..1 from a list of todos with some notion of "completed". */
export function todoProgress(items: unknown, isDone: (item: Record<string, unknown>) => boolean): number | null {
  if (!Array.isArray(items) || items.length === 0) return null
  const list = items.filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
  if (!list.length) return null
  const done = list.filter(isDone).length
  return Math.max(0, Math.min(1, done / list.length))
}

export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}
