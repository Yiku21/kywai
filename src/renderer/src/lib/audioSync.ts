/**
 * Luces con el sonido real, sin micrófono: AI Cowork escucha lo que suena en su propia ventana (en la app de
 * escritorio) o, desde el navegador del PC, en su pestaña si se comparte, y detecta los golpes (bombo y bajo) para
 * que las luces caigan en cada uno. No se graba ni se guarda nada: solo se mide la energía de los graves en cada
 * momento.
 */
import { create } from 'zustand'
import { isWeb } from './api'

export type AudioSyncState = 'off' | 'starting' | 'on' | 'error'

interface AudioSyncStore {
  state: AudioSyncState
  error: string | null
  /** El usuario quiere usarlo (en la app de escritorio se activa solo al poner música). */
  wanted: boolean
}

const PREF_KEY = 'aicowork.music.liveSync.v1'

function readPref(): boolean {
  try {
    const v = localStorage.getItem(PREF_KEY)
    return v === null ? !isWeb : v === '1'
  } catch {
    return !isWeb
  }
}

function savePref(wanted: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, wanted ? '1' : '0')
  } catch {
    /* almacenamiento no disponible */
  }
}

export const useAudioSync = create<AudioSyncStore>(() => ({ state: 'off', error: null, wanted: readPref() }))

/** El navegador (o la app) puede compartir su sonido. En el móvil no. */
export function canSyncWithAudio(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
}

// ---------- Detector de golpes (puro: se prueba sin audio) ----------

/** Muestras de historia para el umbral (≈1 s a 60 por segundo). */
const HISTORY = 60
/** Como mucho un golpe cada 220 ms (≈270 golpes por minuto). */
const MIN_GAP_MS = 220

/** Golpes recordados para encontrar el pulso (los últimos 8 s). */
const ONSET_WINDOW_MS = 8000
/** Pulsos posibles: de 60 a 200 por minuto. */
const MIN_PERIOD_MS = 300
const MAX_PERIOD_MS = 1000

/**
 * Pulso principal de una lista de golpes: la separación que más se repite entre ellos (entre 60 y 200 por
 * minuto), con preferencia por los tempos habituales (≈120). Devuelve los milisegundos entre pulsos, o 0.
 */
export function estimatePeriod(onsets: number[]): number {
  if (onsets.length < 6) return 0
  const bins = new Map<number, number[]>()
  for (let i = 0; i < onsets.length; i++) {
    for (let j = i + 1; j < onsets.length; j++) {
      const d = onsets[j] - onsets[i]
      if (d > MAX_PERIOD_MS * 1.05) break
      if (d < MIN_PERIOD_MS * 0.95) continue
      const bin = Math.round(d / 20)
      const list = bins.get(bin) ?? []
      list.push(d)
      bins.set(bin, list)
    }
  }
  let best = 0
  let bestScore = 0
  for (const [bin, list] of bins) {
    const d = bin * 20
    const near = list.length + 0.5 * ((bins.get(bin - 1)?.length ?? 0) + (bins.get(bin + 1)?.length ?? 0))
    const prior = Math.exp(-0.5 * (Math.log2(d / 500) / 0.6) ** 2)
    if (near * prior > bestScore) {
      bestScore = near * prior
      best = bin
    }
  }
  if (!best || bestScore < 3) return 0
  const around = [best - 1, best, best + 1].flatMap((b) => bins.get(b) ?? [])
  return around.reduce((a, b) => a + b, 0) / around.length
}

/**
 * Energía de los graves en cada momento → golpes. Un golpe es una subida brusca de energía (mucho más que las
 * subidas del último segundo). Con los golpes de los últimos segundos se saca el pulso de la canción: los que caen
 * en el pulso encienden la luz entera y los de en medio (notas del bajo) solo un destello. La luz se apaga en unas
 * décimas y además «respira» con los graves.
 */
export class BeatDetector {
  private prev = 0
  private readonly flux: number[] = []
  private readonly onsets: number[] = []
  private lastBeat = -Infinity
  /** Último golpe que cayó en el pulso. */
  private lastStrong = -Infinity
  private peak = 0
  private energy = 0
  /** Máximo reciente (baja despacio): normaliza el volumen de cada canción. */
  private loudest = 1e-6
  /** Milisegundos entre pulsos (0 mientras no se sabe). */
  period = 0

  /** Añade una medida (energía 0..1) y dice si hay un golpe (en el pulso o no). */
  push(energy: number, now: number): boolean {
    this.loudest = Math.max(energy, this.loudest * 0.997, 1e-6)
    this.energy = energy
    const rise = Math.max(0, energy - this.prev)
    this.prev = energy
    this.flux.push(rise)
    if (this.flux.length > HISTORY) this.flux.shift()
    if (this.flux.length < 10) return false
    const mean = this.flux.reduce((a, b) => a + b, 0) / this.flux.length
    const sd = Math.sqrt(this.flux.reduce((a, b) => a + (b - mean) ** 2, 0) / this.flux.length)
    const onset = rise > mean + 1.4 * sd && rise > this.loudest * 0.06 && now - this.lastBeat >= MIN_GAP_MS
    if (!onset) return false
    this.lastBeat = now
    this.onsets.push(now)
    while (this.onsets.length && now - this.onsets[0] > ONSET_WINDOW_MS) this.onsets.shift()
    this.period = estimatePeriod(this.onsets)
    const strength = Math.min(1, energy / this.loudest)
    if (this.strongBeat(now)) {
      this.lastStrong = now
      this.peak = Math.min(1, 0.55 + 0.45 * strength)
    } else {
      this.peak = 0.25 + 0.15 * strength
    }
    return true
  }

  /** El golpe cae en el pulso (o aún no se conoce el pulso, o hace mucho del último: se vuelve a enganchar). */
  private strongBeat(now: number): boolean {
    const p = this.period
    if (!p) return true
    const since = now - this.lastStrong
    if (since > p * 2.5) return true
    const phase = since % p
    return Math.min(phase, p - phase) <= Math.max(60, p * 0.15)
  }

  /** Intensidad de las luces 0..1 en este instante. */
  level(now: number, soft: boolean): number {
    const since = now - this.lastBeat
    const hit = since >= 0 ? this.peak * Math.exp(-since / (soft ? 260 : 170)) : 0
    const body = 0.25 * Math.min(1, this.energy / this.loudest)
    const v = Math.min(1, hit + body)
    return soft ? v * 0.6 : v
  }
}

// ---------- Captura del sonido ----------

let ctx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let stream: MediaStream | null = null
let detector: BeatDetector | null = null
let data: Uint8Array<ArrayBuffer> = new Uint8Array(0)
let bass: [number, number] = [1, 6]
let lastSample = 0

function cleanup(): void {
  for (const t of stream?.getTracks() ?? []) t.stop()
  stream = null
  void ctx?.close().catch(() => undefined)
  ctx = null
  analyser = null
  detector = null
}

function explain(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError') return isWeb ? 'No se dio permiso para compartir la pestaña.' : 'La app no pudo escuchar su propio sonido.'
  if (name === 'NotSupportedError' || name === 'TypeError') return 'Este navegador no puede compartir el sonido de la pestaña.'
  return (e as Error)?.message || 'No se pudo escuchar el sonido.'
}

/** Empieza a escuchar (en el navegador pide compartir esta pestaña con su audio). Necesita un clic del usuario. */
export async function startAudioSync(): Promise<void> {
  const st = useAudioSync.getState()
  if (st.state === 'on' || st.state === 'starting') return
  if (!canSyncWithAudio()) {
    useAudioSync.setState({ state: 'error', error: 'Este navegador no puede compartir el sonido de la pestaña.' })
    return
  }
  useAudioSync.setState({ state: 'starting', error: null, wanted: true })
  savePref(true)
  try {
    // En el navegador: esta pestaña con su audio, sin el resto del sistema. En la app, la propia ventana.
    const options = isWeb
      ? { video: true, audio: { suppressLocalAudioPlayback: false }, preferCurrentTab: true, selfBrowserSurface: 'include', systemAudio: 'exclude', surfaceSwitching: 'exclude' }
      : { video: true, audio: true }
    stream = await navigator.mediaDevices.getDisplayMedia(options as DisplayMediaStreamOptions)
    // La imagen no hace falta: solo el sonido.
    for (const t of stream.getVideoTracks()) t.stop()
    const track = stream.getAudioTracks()[0]
    if (!track) {
      throw new Error(isWeb ? 'No se compartió el audio: al elegir la pestaña, deja marcado «Compartir también el audio de la pestaña».' : 'No llegó el sonido de la app.')
    }
    track.addEventListener('ended', () => stopAudioSync())
    ctx = new AudioContext()
    await ctx.resume().catch(() => undefined)
    analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.2
    // No se conecta a los altavoces: el sonido ya sale por el reproductor.
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser)
    data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
    const hz = ctx.sampleRate / analyser.fftSize
    bass = [Math.max(1, Math.floor(40 / hz)), Math.max(2, Math.ceil(160 / hz))]
    detector = new BeatDetector()
    useAudioSync.setState({ state: 'on', error: null })
  } catch (e) {
    cleanup()
    useAudioSync.setState({ state: 'error', error: explain(e) })
  }
}

/** Deja de escuchar. `byUser`: no volver a activarlo solo. */
export function stopAudioSync(byUser = false): void {
  cleanup()
  useAudioSync.setState(byUser ? { state: 'off', error: null, wanted: false } : { state: 'off' })
  if (byUser) savePref(false)
}

/** En la app de escritorio se activa solo al poner música (llamar desde un clic del usuario). */
export function ensureAudioSync(): void {
  const st = useAudioSync.getState()
  if (isWeb || !st.wanted || st.state === 'on' || st.state === 'starting') return
  void startAudioSync()
}

/** Intensidad de las luces según el sonido real (null si no se está escuchando: entonces se usa el tempo estimado). */
export function audioLightLevel(now: number, soft: boolean): number | null {
  if (!analyser || !detector) return null
  if (now - lastSample >= 12) {
    analyser.getByteFrequencyData(data)
    let sum = 0
    for (let i = bass[0]; i <= bass[1]; i++) sum += data[i] ?? 0
    const v = sum / ((bass[1] - bass[0] + 1) * 255)
    detector.push(v * v, now)
    lastSample = now
  }
  return detector.level(now, soft)
}
