import type { StationConfig } from '@shared/types'
import type { WorldStyle } from './worlds/models'

/** Frontal, con la elevación justa para distinguir las filas sin mirar las cabezas desde arriba. */
export const OVERVIEW_ELEVATION = 18 * Math.PI / 180
export const OVERVIEW_FOV = 36

export function frontalOverview(world: WorldStyle | undefined, stations: StationConfig[], aspect: number, room = 1) {
  const large = world === 'kywai' || world === 'relicario' || world === 'telar'
  const target: [number, number, number] = [0, large ? 3.4 : 2.2, world === 'submarino' ? -4 : -2.4]
  const halfWidth = Math.max(large ? 18 : 14, ...stations.map(s => Math.abs(s.position[0]) + 3))
  const front = Math.max(8, ...stations.map(s => s.position[1] - target[2] + 2))
  // El ancho se resuelve alejando la cámara, nunca convirtiendo la vista en cenital.
  const distance = Math.max(large ? 43 : 35, front + halfWidth / (Math.tan(OVERVIEW_FOV * Math.PI / 360) * Math.max(.25, aspect))) * Math.max(1, room)
  const eye: [number, number, number] = [0, target[1] + distance * Math.tan(OVERVIEW_ELEVATION), target[2] + distance]
  return { eye, target }
}

/** La niebla empieza detrás del equipo aunque el panel obligue a alejar la cámara. */
export function framedFog(near: number, far: number, distance: number) {
  const visibleNear = Math.max(near, distance + 12)
  return { near: visibleNear, far: Math.max(far, visibleNear + 80) }
}
