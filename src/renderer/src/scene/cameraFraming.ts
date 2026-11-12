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

/** Hasta dónde se deja mover la cámara: acercarse sin meterse en los puestos, alejarse sin salir del escenario. */
export interface CameraLimits {
  minDistance: number
  maxDistance: number
  /** Ángulo desde la vertical (radianes): el mínimo es lo más «desde arriba», el máximo lo más rasante. */
  minPolar: number
  maxPolar: number
  /** Giro a cada lado de la vista frontal (radianes). */
  azimuth: number
  /** Caja por la que puede pasear el punto al que mira la cámara (arrastrar con el botón derecho o la rueda). */
  boundary: [[number, number, number], [number, number, number]]
}

/**
 * Límites de la cámara de cada escenario. Se miden desde la vista general ([overview], la de frontalOverview), que ya
 * enseña el escenario entero: alejarse un poco más deja aire, pero no tanto como para ver solo el vacío de los bordes.
 * El giro y la inclinación se quedan en lo que el escenario tiene construido (por detrás y por los lados no hay nada).
 */
export function cameraLimits(world: WorldStyle | undefined, overview: ReturnType<typeof frontalOverview>, stations: StationConfig[] = []): CameraLimits {
  const { eye, target } = overview
  const distance = Math.hypot(eye[0] - target[0], eye[1] - target[1], eye[2] - target[2])
  const large = world === 'kywai' || world === 'relicario' || world === 'telar' || world === 'submarino'
  // Cuánto puede alejarse más allá de la vista general y cuánto girar a cada lado, según lo que haya alrededor.
  const tune: Partial<Record<WorldStyle | 'ciudad', { out?: number; azimuth?: number; min?: number }>> = {
    ciudad: { out: 1.1, azimuth: .5 },
    kywai: { out: 1.06, azimuth: .4, min: 20 },
    relicario: { out: 1.06, azimuth: .45, min: 20 },
    telar: { out: 1.06, azimuth: .45, min: 20 },
    submarino: { out: 1.05, azimuth: .4, min: 20 },
    orbita: { out: 1.08, azimuth: .45 },
    eva: { out: 1.05, azimuth: .4, min: 17 },
    oficina: { out: 1.05, azimuth: .4 },
    sede: { out: 1.05, azimuth: .4 },
    halloween: { out: 1.06, azimuth: .4 },
    navidad: { out: 1.06, azimuth: .4 }
  }
  // Lo más cerca: un plano medio del equipo (se ven varios puestos), nunca dentro del núcleo ni entre las plataformas.
  const t = { out: 1.08, azimuth: .45, min: 15, ...tune[world ?? 'ciudad'] }
  // El paseo del punto de mira: lo que ocupan los puestos más un margen, nunca más allá del escenario.
  const reachX = Math.max(large ? 12 : 8, ...stations.map(s => Math.abs(s.position[0]) + 1))
  const back = Math.min(target[2] - (large ? 10 : 6), ...stations.map(s => s.position[1] - 1))
  const front = Math.max(target[2] + (large ? 6 : 4), ...stations.map(s => s.position[1] + 1))
  return {
    minDistance: t.min,
    maxDistance: distance * t.out,
    minPolar: Math.PI / 2 - 34 * Math.PI / 180,
    maxPolar: Math.PI / 2 - 10 * Math.PI / 180,
    azimuth: t.azimuth,
    boundary: [[-reachX, .4, back], [reachX, target[1] + (large ? 4 : 2.5), front]]
  }
}
