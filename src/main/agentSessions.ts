import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProviderKind } from '@shared/types'

/**
 * Última sesión de CLI de cada agente en un proyecto, para retomarla en una continuación («sigue con…»,
 * «ahora añade…», «corrige…»): el agente vuelve con lo que leyó, hizo y decidió en su memoria de trabajo,
 * en vez de empezar de cero y redescubrir el proyecto. Claude Code la retoma con `--resume <session_id>`
 * y Codex con `exec resume <thread_id>`. Se guarda en workspace/agent-sessions/<proyecto>.json (fuera de la
 * carpeta donde trabajan los agentes, para que no cuente como un archivo suyo).
 */
export interface AgentSession {
  /** session_id (Claude) o thread_id (Codex). */
  sessionId: string
  provider: ProviderKind
  /** Carpeta donde trabajó: una sesión solo vale en la misma. */
  cwd: string
  taskTitle: string
  at: number
}

let dir = ''

/** Dónde se guardan (workspace/agent-sessions/). Se llama al arrancar, como initUsageLog. */
export function initAgentSessions(workspaceRoot: string): void {
  dir = join(workspaceRoot, 'agent-sessions')
  cache.clear()
}

const fileFor = (projectId: string): string => join(dir, `${projectId.replace(/[^\w.-]/g, '_')}.json`)
/** Pasado este tiempo la sesión ya no se retoma: el proyecto habrá cambiado demasiado y el CLI puede haberla limpiado. */
export const SESSION_MAX_AGE_MS = 14 * 86_400_000

/** Los CLIs que saben retomar una sesión anterior. */
export function supportsResume(provider: ProviderKind): boolean {
  return provider === 'claude' || provider === 'codex'
}

const cache = new Map<string, Record<string, AgentSession>>()

function load(projectId: string): Record<string, AgentSession> {
  const hit = cache.get(projectId)
  if (hit) return hit
  let data: Record<string, AgentSession> = {}
  try {
    const file = fileFor(projectId)
    if (dir && existsSync(file)) {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) data = raw as Record<string, AgentSession>
    }
  } catch {
    data = {}
  }
  cache.set(projectId, data)
  return data
}

function save(projectId: string, data: Record<string, AgentSession>): void {
  if (!dir) return
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(fileFor(projectId), JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.warn('[cowork] no se pudo guardar la sesión del agente', (e as Error).message)
  }
}

/** Guarda la sesión con la que un agente acaba de trabajar (sustituye a la anterior del mismo agente). */
export function rememberSession(projectId: string, agentId: string, s: AgentSession): void {
  if (!s.sessionId) return
  const data = load(projectId)
  data[agentId] = s
  save(projectId, data)
}

/**
 * La sesión que ese agente puede retomar: la última suya en este proyecto, si es del mismo CLI, de la misma
 * carpeta y no demasiado antigua. Si no, nada (empieza de cero).
 */
export function lastSession(projectId: string, agentId: string, want: { provider: ProviderKind; cwd: string }, now = Date.now()): AgentSession | undefined {
  const s = load(projectId)[agentId]
  if (!s || s.provider !== want.provider || s.cwd !== want.cwd) return undefined
  if (now - s.at > SESSION_MAX_AGE_MS) return undefined
  return s
}

/** Olvida las sesiones de un proyecto (al borrarlo, por ejemplo) o vacía la caché en pruebas. */
export function forgetSessions(projectId?: string): void {
  if (!projectId) {
    cache.clear()
    return
  }
  cache.delete(projectId)
  save(projectId, {})
}
