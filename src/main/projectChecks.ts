/**
 * kywai ejecuta él mismo las pruebas del proyecto antes de verificar una tarea, cuando el registro no muestra
 * que el agente las pasara después de su último cambio. Así el verificador (que solo lee) tiene un resultado real
 * delante y un «CUMPLE» no sale sin que nadie haya probado nada.
 */
import { spawn } from 'node:child_process'
import { killTree } from './agents/spawn'

export interface ProjectCheckResult {
  /** passed / failed: terminó con ese resultado. unavailable: no se pudo ejecutar (falta el programa, sin dependencias, tardó demasiado). */
  status: 'passed' | 'failed' | 'unavailable'
  command: string
  /** El final de lo que escribió (para el verificador y el registro). */
  output: string
  /** Por qué no se pudo ejecutar (solo con unavailable). */
  reason?: string
  ms: number
}

/** Tiempo máximo de las pruebas: calidad antes que prisa, pero una prueba colgada no puede parar la tarea. */
export const PROJECT_CHECK_TIMEOUT_MS = 8 * 60_000
const OUTPUT_KEEP = 4000

/**
 * Señales de que no se pudo ni empezar (no de que las pruebas fallen): el programa de pruebas o sus dependencias no
 * están instalados. Un «Cannot find module» del código de la tarea NO entra aquí: eso es un fallo real.
 */
const MISSING =
  /command not found|not recognized as an internal or external command|no se reconoce como un comando|sh: (?:\d+: )?\S+: not found|Missing script|No module named (?:pytest|unittest)|Cannot find module '[^']*node_modules[\\/](?:vitest|jest|mocha|typescript)/i

export type ProjectCheckRunner = (dir: string, command: string, signal: AbortSignal) => Promise<ProjectCheckResult>

const tail = (s: string): string => (s.length > OUTPUT_KEEP ? `…${s.slice(-OUTPUT_KEEP)}` : s)

const realRunner: ProjectCheckRunner = (dir, command, signal) =>
  new Promise((resolve) => {
    const start = Date.now()
    let out = ''
    let settled = false
    let timedOut = false
    const done = (r: Omit<ProjectCheckResult, 'command' | 'ms'>): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve({ ...r, command, ms: Date.now() - start })
    }
    // CI=1: los ejecutores de pruebas (vitest, jest…) terminan solos en vez de quedarse vigilando.
    const child = spawn(command, {
      shell: true,
      cwd: dir,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const add = (b: Buffer): void => {
      out = tail(out + b.toString('utf8'))
    }
    child.stdout?.on('data', add)
    child.stderr?.on('data', add)
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, PROJECT_CHECK_TIMEOUT_MS)
    const onAbort = (): void => killTree(child)
    signal.addEventListener('abort', onAbort)
    child.on('error', (e) => done({ status: 'unavailable', output: tail(out), reason: e.message }))
    child.on('close', (code) => {
      const output = tail(out.trim())
      if (signal.aborted) return done({ status: 'unavailable', output, reason: 'detenida' })
      if (timedOut) return done({ status: 'unavailable', output, reason: `tardó más de ${PROJECT_CHECK_TIMEOUT_MS / 60_000} minutos` })
      if (code === 0) return done({ status: 'passed', output })
      if (code === 127 || code === 9009 || MISSING.test(output)) return done({ status: 'unavailable', output, reason: 'falta el programa o las dependencias para ejecutarlas' })
      done({ status: 'failed', output: code == null ? output : `${output}\n(código de salida ${code})`.trim() })
    })
  })

let runner: ProjectCheckRunner = realRunner

/** Las comprobaciones del motor ponen un ejecutor falso (sin lanzar procesos). */
export function __setProjectCheckRunnerForChecks(fn: ProjectCheckRunner | null): void {
  runner = fn ?? realRunner
}

export function runProjectCheck(dir: string, command: string, signal: AbortSignal): Promise<ProjectCheckResult> {
  return runner(dir, command, signal)
}
