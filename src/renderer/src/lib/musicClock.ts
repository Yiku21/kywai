/**
 * Reloj musical estimado: sabe en qué pulso va la canción sin escuchar el audio. Parte del BPM, del desfase
 * (instante de la pista en que cae un pulso) y de lo que dice el reproductor (posición, velocidad, pausa).
 * Entre lecturas del reproductor extrapola con el reloj del equipo; las lecturas corrigen la deriva poco a
 * poco y los saltos (pausa, búsqueda, cambio de velocidad) se aplican de golpe.
 */

/** Error a partir del cual una lectura se trata como un salto en la pista y no como deriva. */
export const SNAP_THRESHOLD_S = 0.3
/** Fracción del error que se corrige en cada lectura normal (evita tirones en las luces). */
export const SLEW_FACTOR = 0.25
/** Por debajo de este error no se toca nada (las lecturas de YouTube llegan con algo de ruido). */
export const DEADBAND_S = 0.012

export interface PlayerReading {
  /** Posición en la pista (segundos). */
  mediaTime: number
  playing: boolean
  /** Velocidad de reproducción (1 = normal). */
  rate: number
}

export interface BeatInfo {
  /** Pulsos transcurridos desde el desfase (continuo; negativo antes del primer pulso). */
  beats: number
  /** Número de pulso entero. */
  index: number
  /** 0 justo en el pulso, tiende a 1 antes del siguiente. */
  phase: number
  /** Posición en el compás de 4 (0 = primer tiempo). */
  inBar: number
}

export type CorrectionKind = 'none' | 'slew' | 'snap'

export class MusicClock {
  bpm = 0
  /** Segundos de la pista en los que cae un pulso (el resto se deduce del BPM). */
  offset = 0
  private anchorMedia = 0
  private anchorAt = 0
  private rate = 1
  private playing = false
  /** Última posición leída del reproductor: si se repite mientras suena, la lectura está atrasada. */
  private lastReading = Number.NaN

  setTempo(bpm: number, offset = this.offset): void {
    this.bpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 0
    this.offset = Number.isFinite(offset) ? offset : 0
  }

  get isPlaying(): boolean {
    return this.playing
  }

  get playbackRate(): number {
    return this.rate
  }

  /** Sincronización inmediata: al reproducir, pausar, saltar o cambiar la velocidad. `at` en milisegundos. */
  sync(reading: PlayerReading, at: number): void {
    this.anchorMedia = Math.max(0, reading.mediaTime)
    this.anchorAt = at
    this.playing = reading.playing
    this.rate = reading.rate > 0 && Number.isFinite(reading.rate) ? reading.rate : 1
    this.lastReading = reading.mediaTime
  }

  /** Posición estimada de la pista en el instante `at` (milisegundos del mismo reloj que sync). */
  mediaTimeAt(at: number): number {
    if (!this.playing) return this.anchorMedia
    return this.anchorMedia + ((at - this.anchorAt) / 1000) * this.rate
  }

  /**
   * Lectura periódica del reproductor. Un cambio de estado o de velocidad, o un error grande, resincroniza de
   * golpe; un error pequeño se reparte entre varias lecturas para que el pulso no dé saltos.
   */
  correct(reading: PlayerReading, at: number): CorrectionKind {
    const rate = reading.rate > 0 && Number.isFinite(reading.rate) ? reading.rate : 1
    if (reading.playing !== this.playing || Math.abs(rate - this.rate) > 1e-6) {
      this.sync(reading, at)
      return 'snap'
    }
    // El reproductor de YouTube actualiza la posición a saltos: una lectura repetida no aporta nada.
    const stale = this.playing && reading.mediaTime === this.lastReading
    this.lastReading = reading.mediaTime
    if (stale) return 'none'
    const predicted = this.mediaTimeAt(at)
    const error = reading.mediaTime - predicted
    if (Math.abs(error) > SNAP_THRESHOLD_S) {
      this.sync(reading, at)
      return 'snap'
    }
    if (!this.playing) {
      // En pausa la posición no avanza: cualquier diferencia es un salto pequeño.
      if (Math.abs(error) > 1e-3) {
        this.sync(reading, at)
        return 'snap'
      }
      return 'none'
    }
    if (Math.abs(error) < DEADBAND_S) return 'none'
    this.anchorMedia = predicted + error * SLEW_FACTOR
    this.anchorAt = at
    return 'slew'
  }

  /** Pulso en el instante `at`, o null si no hay tempo. */
  beatAt(at: number): BeatInfo | null {
    return beatAtMedia(this.mediaTimeAt(at), this.bpm, this.offset)
  }
}

/** Pulso que corresponde a una posición de la pista. */
export function beatAtMedia(mediaTime: number, bpm: number, offset: number): BeatInfo | null {
  if (!(bpm > 0)) return null
  const beats = ((mediaTime - offset) * bpm) / 60
  const index = Math.floor(beats)
  const phase = beats - index
  const inBar = ((index % 4) + 4) % 4
  return { beats, index, phase, inBar }
}

/**
 * Intensidad 0..1 de las luces para un pulso: destello al principio que se apaga rápido, más fuerte en el
 * primer tiempo del compás. Con `soft` (efectos reducidos) el destello es más suave y largo.
 */
export function pulseEnvelope(beat: BeatInfo, soft = false): number {
  const decay = soft ? 3.2 : 6
  const accent = beat.inBar === 0 ? 1 : 0.62
  // Pequeña subida (35 ms aprox. a 120 BPM) para que el destello no parezca un parpadeo.
  const attack = Math.min(1, beat.phase / 0.07)
  return accent * attack * Math.exp(-beat.phase * decay)
}

/** Lleva un desfase al intervalo [0, periodo) para guardarlo de forma estable. */
export function wrapOffset(offset: number, bpm: number): number {
  if (!(bpm > 0)) return offset
  const period = 60 / bpm
  return ((offset % period) + period) % period
}

/**
 * Marcar el pulso a mano (tap tempo): con los toques (posición de la pista en cada uno) calcula el BPM con la
 * mediana de los intervalos y el desfase con la media circular de las fases, robusta a un toque fuera de sitio.
 */
export const TAP_RESET_S = 2.5
export const MAX_TAPS = 12

export function bpmFromTaps(taps: number[]): number | null {
  if (taps.length < 4) return null
  const intervals: number[] = []
  for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1])
  const valid = intervals.filter((d) => d > 0.2 && d < 1.5).sort((a, b) => a - b)
  if (valid.length < 3) return null
  const median = valid[Math.floor(valid.length / 2)]
  return Math.round((60 / median) * 10) / 10
}

export function offsetFromTaps(taps: number[], bpm: number): number | null {
  if (!taps.length || !(bpm > 0)) return null
  const period = 60 / bpm
  let x = 0
  let y = 0
  for (const t of taps) {
    const angle = ((t % period) / period) * Math.PI * 2
    x += Math.cos(angle)
    y += Math.sin(angle)
  }
  const angle = Math.atan2(y, x)
  return wrapOffset((angle / (Math.PI * 2)) * period, bpm)
}

/** Añade un toque; empieza de nuevo si ha pasado mucho tiempo o la pista ha saltado hacia atrás. */
export function addTap(taps: number[], mediaTime: number): number[] {
  const last = taps[taps.length - 1]
  if (last === undefined || mediaTime - last > TAP_RESET_S || mediaTime <= last) return [mediaTime]
  return [...taps, mediaTime].slice(-MAX_TAPS)
}

/**
 * Qué hacer con los toques: si ya hay un BPM y los toques lo confirman (o marcan la mitad o el doble), solo se
 * ajusta el desfase; si no, los toques fijan también el BPM. Con un BPM conocido bastan dos toques.
 */
export function tempoFromTaps(taps: number[], currentBpm: number): { bpm: number; offset: number; bpmChanged: boolean } | null {
  const tapped = bpmFromTaps(taps)
  if (currentBpm > 0 && taps.length >= 2) {
    const agrees = tapped === null || [0.5, 1, 2].some((k) => Math.abs(tapped / (currentBpm * k) - 1) < 0.06)
    if (agrees) return { bpm: currentBpm, offset: offsetFromTaps(taps, currentBpm)!, bpmChanged: false }
  }
  if (tapped === null) return null
  return { bpm: tapped, offset: offsetFromTaps(taps, tapped)!, bpmChanged: true }
}
