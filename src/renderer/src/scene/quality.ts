import { create } from 'zustand'

export type QualityLevel = 'high' | 'medium' | 'low'

export interface QualitySettings {
  dpr: [number, number]
  particles: number
  fragments: number
  structures: number
  bloom: boolean
  /** Suavizado de bordes con el bloom activo (sin él, las líneas finas parpadean al moverse). */
  msaa: number
  stationLights: boolean
  /** Sombras de la luz principal en los mapas: en calidad alta y media (sin ellas todo se ve plano). */
  shadows: boolean
  /** Lado del mapa de sombras: más pequeño en calidad media para que pese menos. */
  shadowMap: number
  /** Sombreado de contacto (N8AO): solo en equipos que aguantan la calidad alta. */
  ao: boolean
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: { dpr: [1, 1.75], particles: 700, fragments: 20, structures: 240, bloom: true, msaa: 4, stationLights: true, shadows: true, shadowMap: 2048, ao: true },
  medium: { dpr: [1, 1.25], particles: 420, fragments: 14, structures: 170, bloom: true, msaa: 4, stationLights: true, shadows: true, shadowMap: 1024, ao: false },
  low: { dpr: [1, 1], particles: 200, fragments: 8, structures: 100, bloom: false, msaa: 0, stationLights: false, shadows: false, shadowMap: 1024, ao: false }
}

function initialLevel(): QualityLevel {
  const cores = navigator.hardwareConcurrency ?? 4
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8
  if (cores >= 8 && mem >= 8) return 'high'
  if (cores >= 4) return 'medium'
  return 'low'
}

const ORDER: QualityLevel[] = ['low', 'medium', 'high']

/**
 * Ajustes que usa la escena en cada momento. El bloom y las luces de los puestos dependen del equipo ([max]) y no
 * cambian con el ajuste automático: quitarlos o ponerlos cambia las luces o el destino del dibujo y obliga a
 * recompilar todos los materiales de golpe (un tirón visible justo cuando el equipo ya iba justo). El ajuste automático
 * (las sombras igual) mueve lo que sale barato de cambiar: resolución, partículas, estructuras y suavizado.
 */
export function sceneQuality(level: QualityLevel, max: QualityLevel): QualitySettings {
  const now = QUALITY[level]
  const device = QUALITY[max]
  return { ...now, bloom: device.bloom, stationLights: device.stationLights, shadows: device.shadows, shadowMap: device.shadowMap, ao: device.ao }
}

interface QualityState {
  level: QualityLevel
  max: QualityLevel
  lower(): void
  raise(): void
}

export const useQuality = create<QualityState>((set, get) => {
  const start = initialLevel()
  return {
    level: start,
    max: start,
    lower() {
      const i = ORDER.indexOf(get().level)
      if (i > 0) set({ level: ORDER[i - 1] })
    },
    raise() {
      const { level, max } = get()
      const i = ORDER.indexOf(level)
      if (i < ORDER.indexOf(max)) set({ level: ORDER[i + 1] })
    }
  }
})
