import { create } from 'zustand'

/**
 * Medidor de rendimiento (Ajustes → General → «Medidor de rendimiento»): enseña sobre la app lo que gasta de verdad
 * el 3D en este equipo. Solo mide mientras está encendido; apagado no cuesta nada.
 */
export interface PerfStats {
  /** Fotogramas dibujados en el último segundo. */
  fps: number
  /** Tiempo medio y máximo de cada fotograma en el procesador (animar + mandar el dibujo a la gráfica), en ms. */
  frameMs: number
  frameMaxMs: number
  /** Órdenes de dibujo y triángulos por fotograma (todas las pasadas: sombras, escena y efectos). */
  calls: number
  triangles: number
  /** Píxeles que se dibujan (ancho × alto reales, ya con la resolución aplicada). */
  width: number
  height: number
  dpr: number
  /** Porcentaje del último segundo con el hilo principal bloqueado por tareas largas (>50 ms), de toda la app. */
  busyPct: number
  /** Memoria de JavaScript usada, en MB (si el navegador lo dice). */
  heapMb: number | null
}

interface MeterState {
  on: boolean
  stats: PerfStats | null
  /** Ritmo que toca ahora (30, 20 o 10) y si la escena está en reposo. */
  target: number
  resting: boolean
  paused: boolean
  /** Nombre de la tarjeta gráfica, si el navegador lo da. */
  gpu: string | null
  setOn(on: boolean): void
}

const KEY = 'ai-cowork.perfMeter'

function readOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export const useMeter = create<MeterState>((set) => ({
  on: readOn(),
  stats: null,
  target: 30,
  resting: false,
  paused: false,
  gpu: null,
  setOn(on) {
    try {
      if (on) localStorage.setItem(KEY, '1')
      else localStorage.removeItem(KEY)
    } catch {
      /* sin almacenamiento: vale para esta sesión */
    }
    set({ on, stats: null })
  }
}))

/** Acumulador de un segundo de fotogramas. Puro para poder probarlo. */
export class FrameWindow {
  frames = 0
  total = 0
  max = 0
  calls = 0
  triangles = 0

  add(ms: number, calls: number, triangles: number): void {
    this.frames++
    this.total += ms
    if (ms > this.max) this.max = ms
    this.calls = calls
    this.triangles = triangles
  }

  /** Resultado del intervalo de [elapsedMs] y vuelta a empezar. */
  take(elapsedMs: number): Pick<PerfStats, 'fps' | 'frameMs' | 'frameMaxMs' | 'calls' | 'triangles'> {
    const out = {
      fps: elapsedMs > 0 ? Math.round((this.frames * 1000) / elapsedMs) : 0,
      frameMs: this.frames ? this.total / this.frames : 0,
      frameMaxMs: this.max,
      calls: this.calls,
      triangles: this.triangles
    }
    this.frames = 0
    this.total = 0
    this.max = 0
    return out
  }
}
