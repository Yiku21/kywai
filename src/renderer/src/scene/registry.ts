import type { RobotBrain } from './robotBrain'

export interface PulseTarget {
  /** Pulso breve en la estación o el núcleo. strength 0..1. */
  pulse(color: string, strength?: number): void
}

/**
 * Registro mutable de la escena: permite que las transferencias, las estaciones y el núcleo
 * se coordinen sin pasar por React en cada fotograma.
 */
export const registry = {
  /** Tiempo de la escena (segundos), actualizado cada fotograma. */
  time: 0,
  /** Pulso de la música 0..1 (reloj musical estimado, sin micrófono); 0 si no suena nada. */
  beat: 0,
  /** Cuánto trabaja el equipo 0..1 (agentes pensando o trabajando, suavizado): los mapas se animan con él. */
  work: 0,
  brains: new Map<string, RobotBrain>(),
  stations: new Map<string, PulseTarget>(),
  /** estación → agente que la ocupa */
  stationAgent: new Map<string, string>(),
  core: null as PulseTarget | null
}
