import type { AgentConfig } from './types'
import { isLocalEngine } from './localEngines'

/**
 * Tareas a la vez de cada agente. Si un agente ya está ocupado y le llega otra tarea, la hace una copia suya
 * («Claude 2», mismo modelo y nivel) en una copia aparte de la carpeta, hasta su tope (Ajustes › Agentes).
 */
export const MAX_INSTANCES = 4
export const DEFAULT_INSTANCES = 2
/** Tope de tareas a la vez de todo el equipo. */
export const MAX_TEAM_PARALLEL = 8

export function cleanInstances(n: unknown): number | undefined {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.min(MAX_INSTANCES, Math.floor(n)) : undefined
}

/** Cuántas tareas a la vez puede llevar un agente: él y sus copias. Los motores locales, una (saturan el equipo). */
export function instancesFor(a: Pick<AgentConfig, 'provider' | 'maxInstances' | 'plannerOnly'>): number {
  if (isLocalEngine(a.provider) || a.plannerOnly) return 1
  return cleanInstances(a.maxInstances) ?? DEFAULT_INSTANCES
}
