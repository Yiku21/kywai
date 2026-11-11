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

/** Lo que da de sí el equipo (núcleos y memoria; el navegador nunca dice más de 8 GB). */
function deviceLevel(): QualityLevel {
  const cores = navigator.hardwareConcurrency ?? 4
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8
  if (cores >= 8 && mem >= 8) return 'high'
  if (cores >= 4) return 'medium'
  return 'low'
}

/**
 * Calidad del 3D elegida en Ajustes → General, por dispositivo. «auto» va como mucho a media: antes casi cualquier
 * equipo arrancaba en alta (resolución ×1,75, suavizado ×4, sombreado de contacto) y la tarjeta gráfica iba a tope.
 * La alta queda para quien la elige («Máxima»). Las fijas no se ajustan solas.
 */
export type QualityChoice = 'auto' | QualityLevel

const CHOICE_KEY = 'ai-cowork.sceneQuality'

function readChoice(): QualityChoice {
  try {
    const v = localStorage.getItem(CHOICE_KEY)
    if (v === 'low' || v === 'medium' || v === 'high') return v
  } catch {
    /* sin almacenamiento: automática */
  }
  return 'auto'
}

/** Nivel de partida y techo para una elección. */
export function qualityRange(choice: QualityChoice, device: QualityLevel): { level: QualityLevel; max: QualityLevel } {
  if (choice !== 'auto') return { level: choice, max: choice }
  const max = device === 'high' ? 'medium' : device
  return { level: max, max }
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
  choice: QualityChoice
  level: QualityLevel
  max: QualityLevel
  /** ¿Se ajusta solo según los fotogramas? (solo en «auto») */
  adaptive: boolean
  setChoice(choice: QualityChoice): void
  lower(): void
  raise(): void
}

export const useQuality = create<QualityState>((set, get) => {
  const choice = readChoice()
  return {
    choice,
    ...qualityRange(choice, deviceLevel()),
    adaptive: choice === 'auto',
    setChoice(next) {
      try {
        if (next === 'auto') localStorage.removeItem(CHOICE_KEY)
        else localStorage.setItem(CHOICE_KEY, next)
      } catch {
        /* sin almacenamiento: vale para esta sesión */
      }
      set({ choice: next, adaptive: next === 'auto', ...qualityRange(next, deviceLevel()) })
    },
    lower() {
      const i = ORDER.indexOf(get().level)
      if (get().adaptive && i > 0) set({ level: ORDER[i - 1] })
    },
    raise() {
      const { level, max, adaptive } = get()
      const i = ORDER.indexOf(level)
      if (adaptive && i < ORDER.indexOf(max)) set({ level: ORDER[i + 1] })
    }
  }
})
