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
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  high: { dpr: [1, 1.75], particles: 700, fragments: 20, structures: 240, bloom: true, msaa: 4, stationLights: true },
  medium: { dpr: [1, 1.25], particles: 420, fragments: 14, structures: 170, bloom: true, msaa: 4, stationLights: true },
  low: { dpr: [1, 1], particles: 200, fragments: 8, structures: 100, bloom: false, msaa: 0, stationLights: false }
}

function initialLevel(): QualityLevel {
  const cores = navigator.hardwareConcurrency ?? 4
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8
  if (cores >= 8 && mem >= 8) return 'high'
  if (cores >= 4) return 'medium'
  return 'low'
}

const ORDER: QualityLevel[] = ['low', 'medium', 'high']

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
