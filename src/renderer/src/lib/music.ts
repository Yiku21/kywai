import { create } from 'zustand'
import { MIN_TEMPO_SCORE, parseVideoTitle, plausibleBpm, type TempoConfidence, type TempoLookupResult, type TempoMatch, type TempoQuery } from '@shared/music'
import type { MusicResult } from '@shared/types'
import { api, isWeb } from './api'
import { getVolume, isMuted, setAmbientMusicSuppressed, subscribeAudio } from './audio'
import { audioLightLevel } from './audioSync'
import { addTap, MusicClock, pulseEnvelope, tempoFromTaps, wrapOffset } from './musicClock'
import { YT_STATE, type YtPlayer } from './youtube'

/**
 * Música del espacio digital: un vídeo de YouTube en su reproductor oficial y un reloj musical estimado que
 * mueve las luces sin micrófono (BPM publicado + desfase + posición del reproductor).
 */

export type PlayerStatus = 'idle' | 'loading' | 'cued' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'
export type TempoMode = 'auto' | 'manual' | 'none'

/** Lo que se recuerda de cada vídeo (caché local de metadatos y ajustes). */
export interface TrackMemory {
  artist: string
  title: string
  /** El usuario corrigió artista o canción: no se sobrescriben con los del vídeo. */
  edited?: boolean
  durationSec?: number
  /** Resultado de la última búsqueda de BPM (con la fecha, para caducarla). */
  match?: TempoMatch | null
  note?: string
  lookedUpAt?: number
  /** BPM puesto a mano (sustituye al encontrado). */
  manualBpm?: number
  /** Segundos de la pista en los que cae un pulso. */
  offset: number
  usedAt: number
}

interface MusicState {
  open: boolean
  /** Reproductor minimizado: pequeño en una esquina, sigue sonando (con el vídeo a la vista, como exige YouTube). */
  mini: boolean
  /** Minimizado como una barra con solo atrás / pausa / adelante (y una carátula, que es el vídeo en pequeño). Se recuerda. */
  bar: boolean
  videoId: string | null
  status: PlayerStatus
  error: string | null
  lookup: 'idle' | 'searching'
  lightsOn: boolean
  tracks: Record<string, TrackMemory>
  taps: number[]
  /** Cola de reproducción (como en YouTube Music) y la que suena ahora. */
  queue: QueueItem[]
  index: number
  /** Aviso que no es un error (por ejemplo, que suena otra versión de la canción). */
  notice: string | null
}

/** Una canción de la cola; si suena otra subida de ella, origId es la original. */
export type QueueItem = MusicResult & { origId?: string }

const STORAGE_KEY = 'aicowork.music.v1'
const MAX_TRACKS = 150
const LOOKUP_TTL_MS = 30 * 24 * 60 * 60 * 1000
const POLL_MS = 250
const MAX_QUEUE = 100

interface Persisted {
  lightsOn: boolean
  bar: boolean
  videoId: string | null
  tracks: Record<string, TrackMemory>
  queue: QueueItem[]
  index: number
}

function readPersisted(): Persisted {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Persisted>
    return {
      lightsOn: raw.lightsOn !== false,
      bar: raw.bar === true,
      videoId: typeof raw.videoId === 'string' ? raw.videoId : null,
      tracks: raw.tracks && typeof raw.tracks === 'object' ? raw.tracks : {},
      queue: Array.isArray(raw.queue) ? raw.queue.filter((q) => q && typeof q.videoId === 'string').slice(0, MAX_QUEUE) : [],
      index: typeof raw.index === 'number' ? raw.index : -1
    }
  } catch {
    return { lightsOn: true, bar: false, videoId: null, tracks: {}, queue: [], index: -1 }
  }
}

function persist(st: MusicState): void {
  try {
    const entries = Object.entries(st.tracks).sort((a, b) => b[1].usedAt - a[1].usedAt).slice(0, MAX_TRACKS)
    const data: Persisted = { lightsOn: st.lightsOn, bar: st.bar, videoId: st.videoId, tracks: Object.fromEntries(entries), queue: st.queue, index: st.index }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* almacenamiento no disponible */ }
}

const saved = readPersisted()

export const useMusic = create<MusicState>(() => ({
  open: false,
  mini: false,
  bar: saved.bar,
  videoId: saved.videoId,
  status: 'idle',
  error: null,
  lookup: 'idle',
  lightsOn: saved.lightsOn,
  tracks: saved.tracks,
  taps: [],
  queue: saved.queue,
  index: saved.index,
  notice: null
}))

useMusic.subscribe((st, prev) => {
  if (st.tracks !== prev.tracks || st.lightsOn !== prev.lightsOn || st.bar !== prev.bar || st.videoId !== prev.videoId || st.queue !== prev.queue || st.index !== prev.index) persist(st)
})

/** Reloj del pulso que leen las luces de la escena. */
export const musicClock = new MusicClock()

export interface TempoView {
  mode: TempoMode
  bpm: number
  offset: number
  confidence: TempoConfidence | 'manual' | null
  match: TempoMatch | null
}

/** Tempo efectivo de un vídeo: el BPM manual manda; si no, la coincidencia encontrada si es suficientemente fiable. */
export function tempoOf(track: TrackMemory | undefined): TempoView {
  if (!track) return { mode: 'none', bpm: 0, offset: 0, confidence: null, match: null }
  const match = track.match ?? null
  if (track.manualBpm && plausibleBpm(track.manualBpm)) {
    return { mode: 'manual', bpm: track.manualBpm, offset: track.offset, confidence: 'manual', match }
  }
  if (match && match.score >= MIN_TEMPO_SCORE && plausibleBpm(match.bpm)) {
    return { mode: 'auto', bpm: match.bpm, offset: track.offset, confidence: match.confidence, match }
  }
  return { mode: 'none', bpm: 0, offset: track.offset, confidence: null, match }
}

export function currentTrack(st: MusicState = useMusic.getState()): TrackMemory | undefined {
  return st.videoId ? st.tracks[st.videoId] : undefined
}

function patchTrack(videoId: string, patch: Partial<TrackMemory>): void {
  useMusic.setState((st) => {
    const prev = st.tracks[videoId] ?? { artist: '', title: '', offset: 0, usedAt: Date.now() }
    return { tracks: { ...st.tracks, [videoId]: { ...prev, ...patch, usedAt: Date.now() } } }
  })
}

// El reloj sigue al tempo del vídeo actual.
function applyTempo(): void {
  const t = tempoOf(currentTrack())
  musicClock.setTempo(t.bpm, t.offset)
}
useMusic.subscribe((st, prev) => {
  if (st.tracks !== prev.tracks || st.videoId !== prev.videoId) applyTempo()
})
applyTempo()

// ---------- Reproductor ----------

let player: YtPlayer | null = null
let pollTimer: number | undefined
let offAudio: (() => void) | undefined

function reading(p: YtPlayer): { mediaTime: number; playing: boolean; rate: number } {
  const state = p.getPlayerState()
  return {
    mediaTime: Number(p.getCurrentTime()) || 0,
    // Mientras carga (buffering) la pista no avanza: las luces se detienen con ella.
    playing: state === YT_STATE.PLAYING,
    rate: Number(p.getPlaybackRate()) || 1
  }
}

function syncVolume(): void {
  if (!player) return
  try {
    player.setVolume(Math.round(getVolume() * 100))
    if (isMuted()) player.mute()
    else player.unMute()
  } catch { /* el reproductor aún no está listo */ }
}

/** Resincroniza ya (pausa, reproducción, salto o cambio de velocidad notificados por YouTube). */
export function resyncNow(): void {
  if (!player) return
  try { musicClock.sync(reading(player), performance.now()) } catch { /* reproductor destruido */ }
}

/** El componente del reproductor entrega aquí el reproductor ya creado. */
export function bindPlayer(p: YtPlayer): void {
  unbindPlayer()
  player = p
  syncVolume()
  offAudio = subscribeAudio(syncVolume)
  resyncNow()
  pollTimer = window.setInterval(() => {
    if (!player) return
    try { musicClock.correct(reading(player), performance.now()) } catch { /* reproductor destruido */ }
  }, POLL_MS)
}

export function unbindPlayer(): void {
  window.clearInterval(pollTimer)
  pollTimer = undefined
  offAudio?.()
  offAudio = undefined
  player = null
  musicClock.sync({ mediaTime: 0, playing: false, rate: 1 }, performance.now())
  setAmbientMusicSuppressed(false)
}

export function getPlayer(): YtPlayer | null {
  return player
}

const STATUS: Record<number, PlayerStatus> = {
  [YT_STATE.UNSTARTED]: 'cued',
  [YT_STATE.ENDED]: 'ended',
  [YT_STATE.PLAYING]: 'playing',
  [YT_STATE.PAUSED]: 'paused',
  [YT_STATE.BUFFERING]: 'buffering',
  [YT_STATE.CUED]: 'cued'
}

/** Cambio de estado del reproductor: resincroniza el reloj y lee artista/canción del vídeo. */
export function onPlayerState(state: number): void {
  resyncNow()
  const status = STATUS[state] ?? 'cued'
  useMusic.setState({ status, error: null })
  setAmbientMusicSuppressed(status === 'playing' || status === 'buffering')
  // Al acabar una canción suena la siguiente de la cola.
  if (state === YT_STATE.ENDED) next()
  if (state === YT_STATE.PLAYING) {
    failedInARow = 0
    rememberAlternative()
  }
  if (state === YT_STATE.PLAYING || state === YT_STATE.CUED || state === YT_STATE.UNSTARTED) readVideoInfo()
}

/** Lee título, canal y duración del vídeo y, si hace falta, busca el BPM. */
export function readVideoInfo(): void {
  const { videoId } = useMusic.getState()
  if (!player || !videoId) return
  let data: { title?: string; author?: string; video_id?: string } = {}
  try { data = player.getVideoData?.() ?? {} } catch { /* sin datos */ }
  if (data.video_id && data.video_id !== videoId) return
  const duration = Number(player.getDuration()) || undefined
  const prev = useMusic.getState().tracks[videoId]
  if (!data.title && !prev) return
  const parsed = data.title ? parseVideoTitle(data.title, data.author ?? '') : { artist: prev?.artist ?? '', title: prev?.title ?? '' }
  const keep = prev?.edited
  patchTrack(videoId, {
    artist: keep ? prev!.artist : parsed.artist,
    title: keep ? prev!.title : parsed.title,
    durationSec: duration ?? prev?.durationSec
  })
  const track = useMusic.getState().tracks[videoId]
  const fresh = track.lookedUpAt && Date.now() - track.lookedUpAt < LOOKUP_TTL_MS
  if (!fresh && track.title && useMusic.getState().lookup === 'idle') void lookupTempo()
}

// ---------- BPM ----------

async function requestTempo(query: TempoQuery): Promise<TempoLookupResult> {
  if (isWeb) {
    const res = await fetch('/api/call/lookupTrackTempo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ args: [query] })
    })
    const data = (await res.json().catch(() => ({}))) as { result?: TempoLookupResult; error?: string }
    if (!res.ok || !data.result) throw new Error(data.error ?? `Error ${res.status}`)
    return data.result
  }
  if (api) {
    const params = new URLSearchParams({ artist: query.artist, title: query.title })
    if (query.durationSec) params.set('duration', String(Math.round(query.durationSec)))
    const res = await fetch(`cowork://music/tempo?${params}`)
    return (await res.json()) as TempoLookupResult
  }
  return { match: null, note: 'Sin la app de escritorio no se puede consultar el BPM' }
}

/** Busca el BPM publicado de la canción actual (Deezer, a través de AI Cowork). */
export async function lookupTempo(): Promise<void> {
  const { videoId } = useMusic.getState()
  const track = currentTrack()
  if (!videoId || !track?.title) return
  useMusic.setState({ lookup: 'searching' })
  try {
    const result = await requestTempo({ artist: track.artist, title: track.title, durationSec: track.durationSec })
    patchTrack(videoId, { match: result.match, note: result.note, lookedUpAt: Date.now() })
  } catch (e) {
    patchTrack(videoId, { note: `No se pudo consultar el BPM: ${(e as Error).message || 'sin conexión'}` })
  } finally {
    useMusic.setState({ lookup: 'idle' })
  }
}

// ---------- Acciones de la interfaz ----------

export function setMusicOpen(open: boolean): void {
  useMusic.setState({ open, mini: false })
  // YouTube no permite reproducir con el reproductor oculto: al cerrar el panel se pausa.
  if (!open) {
    try { player?.pauseVideo() } catch { /* sin reproductor */ }
  }
}

/** Minimiza (sigue sonando en pequeño, como se dejó la última vez) o vuelve a abrir el reproductor entero. */
export function setMusicMini(mini: boolean): void {
  useMusic.setState({ open: true, mini })
}

/** Minimizado: solo los botones (barra) o la tarjeta con el vídeo y la canción. */
export function setMusicBar(bar: boolean): void {
  useMusic.setState({ open: true, mini: true, bar })
}

/**
 * Botón «Música»: lo abre; abierto y con una canción, lo minimiza (sigue sonando); minimizado, lo vuelve a abrir.
 * Sin canción, abrir y cerrar.
 */
export function toggleMusicPanel(): void {
  const { open, mini, videoId } = useMusic.getState()
  if (!open) return setMusicOpen(true)
  if (mini) return setMusicMini(false)
  if (videoId) return setMusicMini(true)
  setMusicOpen(false)
}

export function setLightsOn(lightsOn: boolean): void {
  useMusic.setState({ lightsOn })
}

/** Elige un vídeo; `autoplay` solo tras un gesto del usuario con el reproductor visible. */
export function chooseVideo(videoId: string, startSeconds = 0, autoplay = true): void {
  useMusic.setState((st) => ({
    videoId,
    status: 'loading',
    error: null,
    notice: null,
    taps: [],
    tracks: st.tracks[videoId]
      ? { ...st.tracks, [videoId]: { ...st.tracks[videoId], usedAt: Date.now() } }
      : { ...st.tracks, [videoId]: { artist: '', title: '', offset: 0, usedAt: Date.now() } }
  }))
  if (!player) {
    // El reproductor aún se está creando: al estar listo, empieza (o no) con esto.
    pending = { autoplay, start: startSeconds }
    return
  }
  if (autoplay) player.loadVideoById(videoId, startSeconds)
  else player.cueVideoById(videoId, startSeconds)
}

let pending: { autoplay: boolean; start: number } = { autoplay: false, start: 0 }

/** Lo pedido mientras se creaba el reproductor (se consume al leerlo). */
export function takePending(): { autoplay: boolean; start: number } {
  const p = pending
  pending = { autoplay: false, start: 0 }
  return p
}

export function setTrackNames(artist: string, title: string): void {
  const { videoId } = useMusic.getState()
  if (!videoId) return
  patchTrack(videoId, { artist: artist.trim(), title: title.trim(), edited: true, lookedUpAt: undefined })
}

/** BPM a mano (null vuelve al encontrado). */
export function setManualBpm(bpm: number | null): void {
  const { videoId } = useMusic.getState()
  if (!videoId) return
  if (bpm === null) return patchTrack(videoId, { manualBpm: undefined })
  if (!plausibleBpm(bpm)) return
  const offset = currentTrack()?.offset ?? 0
  patchTrack(videoId, { manualBpm: Math.round(bpm * 10) / 10, offset: wrapOffset(offset, bpm) })
}

/** Duplica o divide a la mitad el BPM (las fuentes a veces dan el doble o la mitad del pulso que se siente). */
export function scaleBpm(factor: 0.5 | 2): void {
  const t = tempoOf(currentTrack())
  if (t.bpm) setManualBpm(t.bpm * factor)
}

/** Mueve el desfase (segundos; positivo = las luces llegan más tarde). */
export function nudgeOffset(deltaSec: number): void {
  const { videoId } = useMusic.getState()
  const track = currentTrack()
  if (!videoId || !track) return
  const bpm = tempoOf(track).bpm
  patchTrack(videoId, { offset: wrapOffset(track.offset + deltaSec, bpm) })
}

export function setOffset(offsetSec: number): void {
  const { videoId } = useMusic.getState()
  if (!videoId || !Number.isFinite(offsetSec)) return
  patchTrack(videoId, { offset: wrapOffset(offsetSec, tempoOf(currentTrack()).bpm) })
}

/** Toque al ritmo: alinea el desfase (y el BPM si no hay uno fiable o no cuadra). Devuelve cuántos toques lleva. */
export function tapBeat(now = performance.now()): number {
  const { videoId } = useMusic.getState()
  const track = currentTrack()
  if (!videoId || !track || !musicClock.isPlaying) return 0
  const taps = addTap(useMusic.getState().taps, musicClock.mediaTimeAt(now))
  useMusic.setState({ taps })
  const t = tempoOf(track)
  const result = tempoFromTaps(taps, t.bpm)
  if (result) {
    patchTrack(videoId, result.bpmChanged
      ? { manualBpm: result.bpm, offset: result.offset }
      : { offset: result.offset })
  }
  return taps.length
}

/** Intensidad 0..1 de las luces de la escena al ritmo de la música (0 si no suena o no hay tempo). */
export function musicLightLevel(now: number, soft: boolean): number {
  const st = useMusic.getState()
  if (!st.lightsOn) return 0
  // Con el sonido real, cada golpe de verdad (mientras suena la canción); si no, el tempo estimado.
  const live = audioLightLevel(now, soft)
  if (live !== null) return musicClock.isPlaying ? live : 0
  if (!musicClock.isPlaying || !musicClock.bpm) return 0
  const beat = musicClock.beatAt(now)
  if (!beat) return 0
  const confidence = tempoOf(currentTrack(st)).confidence
  const strength = confidence === 'baja' ? 0.6 : confidence === 'media' ? 0.85 : 1
  return pulseEnvelope(beat, soft) * strength
}

// ---------- Cola de reproducción (como YouTube Music) ----------

/** Nombres conocidos (de la búsqueda): mejores que los del título del vídeo para encontrar el BPM. */
function nameTrack(item: MusicResult): void {
  const prev = useMusic.getState().tracks[item.videoId]
  if (prev?.edited || !item.title) return
  patchTrack(item.videoId, { artist: item.artist, title: item.title, durationSec: item.durationSec ?? prev?.durationSec, edited: true })
}

/** Reproduce la canción `index` de esta lista; el resto queda en la cola (atrás / adelante). */
export function playFrom(items: MusicResult[], index: number, startSeconds = 0): void {
  if (!items[index]) return
  // Una canción elegida a mano vuelve a contar desde cero los fallos seguidos.
  failedInARow = 0
  const from = Math.max(0, index - 20)
  const queue = items.slice(from, from + MAX_QUEUE).map(withKnownAlternative)
  const item = queue[index - from]
  useMusic.setState({ queue, index: index - from })
  nameTrack(item)
  chooseVideo(item.videoId, startSeconds, true)
}

/** Salta a una canción de la cola. */
export function playIndex(index: number): void {
  const { queue } = useMusic.getState()
  const item = queue[index]
  if (!item) return
  useMusic.setState({ index })
  nameTrack(item)
  chooseVideo(item.videoId, 0, true)
}

/** Añade al final de la cola (si no suena nada, empieza a sonar). */
export function enqueue(item: MusicResult): void {
  const { queue, index, videoId } = useMusic.getState()
  if (!queue.length || index < 0 || !videoId) return playFrom([item], 0)
  useMusic.setState({ queue: [...queue, withKnownAlternative(item)].slice(-MAX_QUEUE) })
}

export function removeFromQueue(i: number): void {
  const { queue, index } = useMusic.getState()
  if (i === index || !queue[i]) return
  useMusic.setState({ queue: queue.filter((_, j) => j !== i), index: i < index ? index - 1 : index })
}

export function clearQueue(): void {
  const { queue, index } = useMusic.getState()
  const current = queue[index]
  useMusic.setState(current ? { queue: [current], index: 0 } : { queue: [], index: -1 })
}

export function hasNext(): boolean {
  const { queue, index } = useMusic.getState()
  return index + 1 < queue.length
}

/** Siguiente de la cola (si no hay, se queda en la que está). */
export function next(): void {
  const { index } = useMusic.getState()
  if (hasNext()) playIndex(index + 1)
}

/** Atrás: al principio de la canción si ya lleva unos segundos; si no, la anterior. */
export function previous(): void {
  const { index } = useMusic.getState()
  let time = 0
  try { time = player?.getCurrentTime() ?? 0 } catch { /* sin reproductor */ }
  if (time > 3 || index <= 0) return seek(0)
  playIndex(index - 1)
}

export function togglePlay(): void {
  if (!player) return
  try {
    const playing = player.getPlayerState() === YT_STATE.PLAYING || player.getPlayerState() === YT_STATE.BUFFERING
    if (playing) player.pauseVideo()
    else player.playVideo()
  } catch { /* reproductor destruido */ }
}

export function seek(seconds: number): void {
  if (!player || !Number.isFinite(seconds)) return
  try {
    player.seekTo(Math.max(0, seconds), true)
    resyncNow()
  } catch { /* reproductor destruido */ }
}

// ---------- Canciones que su discográfica no deja oír fuera de YouTube ----------

/** Errores de YouTube: el dueño no permite el vídeo en reproductores de otras webs o apps. */
export const EMBED_BLOCKED = new Set([101, 150])
/** Con estos errores la canción no se puede oír aquí. */
const UNPLAYABLE = new Set([2, 5, 100, 101, 150])
const BLOCKED_KEY = 'aicowork.music.blocked.v1'
const MAX_ATTEMPTS = 4

interface BlockedMemory {
  /** Vídeos que no se pueden oír aquí. */
  ids: string[]
  /** Canción original → otra subida que sí suena. */
  alt: Record<string, { id: string; via: string }>
}

function readBlocked(): BlockedMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(BLOCKED_KEY) ?? '{}') as Partial<BlockedMemory>
    return {
      ids: Array.isArray(raw.ids) ? raw.ids.filter((x) => typeof x === 'string') : [],
      alt: raw.alt && typeof raw.alt === 'object' ? raw.alt : {}
    }
  } catch {
    return { ids: [], alt: {} }
  }
}

const blockedMemory = readBlocked()
const blocked = new Set(blockedMemory.ids)

function saveBlocked(): void {
  try {
    const alt = Object.entries(blockedMemory.alt).slice(-300)
    localStorage.setItem(BLOCKED_KEY, JSON.stringify({ ids: [...blocked].slice(-300), alt: Object.fromEntries(alt) }))
  } catch {
    /* almacenamiento no disponible */
  }
}

export function isBlocked(videoId: string): boolean {
  return blocked.has(videoId)
}

/** Si ya se sabe que una canción no suena aquí pero otra subida sí, se usa directamente esa. */
function withKnownAlternative(item: QueueItem): QueueItem {
  const alt = item.origId ? undefined : blockedMemory.alt[item.videoId]
  return alt ? { ...item, videoId: alt.id, via: alt.via, origId: item.videoId } : item
}

/** Suena bien otra versión: se recuerda para la próxima vez. */
function rememberAlternative(): void {
  const { queue, index, videoId } = useMusic.getState()
  const item = queue[index]
  if (!item?.origId || item.videoId !== videoId || !item.via) return
  blockedMemory.alt[item.origId] = { id: item.videoId, via: item.via }
  saveBlocked()
}

const fold = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Primer artista de «Grupo Frontera y Bad Bunny», «A, B», «A & B», «A x B». */
const mainArtist = (artist: string): string => fold(artist.split(/,|&| y | x | feat.? | ft.? /i)[0] ?? '')

/**
 * Otra subida de esta canción: contiene su título y el nombre del artista (para no coger versiones de otros
 * grupos) y dura parecido (para no coger bucles de una hora ni recopilatorios).
 */
export function sameSong(candidate: MusicResult, song: QueueItem): boolean {
  const title = fold(song.title)
  if (!title || !fold(candidate.title).includes(title)) return false
  const artist = mainArtist(song.artist)
  if (artist && !fold(`${candidate.title} ${candidate.artist}`).includes(artist)) return false
  const want = song.durationSec
  if (!want || !candidate.durationSec) return true
  return Math.abs(candidate.durationSec - want) <= Math.max(20, want * 0.2)
}

/** Subida del propio artista o de su discográfica: si la original está bloqueada, esta suele estarlo también. */
export function officialUpload(candidate: MusicResult, song: QueueItem): boolean {
  const channel = fold(candidate.artist)
  const artist = mainArtist(song.artist)
  const flat = (t: string): string => t.replace(/ /g, '')
  // «BadBunnyVEVO»: el canal escribe el nombre sin espacios.
  return !!channel && ((artist.length > 2 && flat(channel).includes(flat(artist))) || /vevo|(topic|records|oficial|official)/.test(channel))
}

const tried = new Map<string, string[]>()
let recovering = 0
/** Canciones seguidas que no se han podido oír (desde el navegador puede ser casi todo): a las 3 se para. */
let failedInARow = 0
const MAX_FAILED_IN_A_ROW = 3

/**
 * La canción que suena no se puede oír aquí. Si es porque su discográfica no lo permite fuera de YouTube, se prueba
 * otra subida de la misma canción (como mucho 3); si no hay, se pasa a la siguiente de la cola.
 */
export async function recoverFromError(code: number, message: string): Promise<void> {
  const st = useMusic.getState()
  const failedId = st.videoId
  if (!failedId) return
  const token = ++recovering
  const item = st.queue[st.index]
  const stillHere = (): boolean => recovering === token && useMusic.getState().videoId === failedId
  const giveUp = (text: string): void => {
    failedInARow++
    const tooMany = failedInARow >= MAX_FAILED_IN_A_ROW
    const skipping = UNPLAYABLE.has(code) && hasNext() && !tooMany
    const why = tooMany
      ? isWeb
        ? ' Desde el navegador, YouTube no deja oír estas canciones fuera de su web; en la app de escritorio del Mac sí suenan.'
        : ' Varias seguidas no se pueden oír aquí: elige otra canción.'
      : ''
    useMusic.setState({ status: 'error', error: `${text}${skipping ? ' Pasando a la siguiente…' : ''}${why}`, notice: null })
    if (skipping) window.setTimeout(() => stillHere() && next(), 2000)
  }
  if (!EMBED_BLOCKED.has(code) || !item || item.videoId !== failedId || !item.title) return giveUp(message)

  blocked.add(failedId)
  const key = item.origId ?? item.videoId
  if (item.origId) delete blockedMemory.alt[item.origId]
  saveBlocked()
  const attempts = [...(tried.get(key) ?? []), failedId]
  tried.set(key, attempts)
  const blockedText = `«${item.title}» no se puede oír fuera de YouTube (no lo permite su discográfica).`
  if (attempts.length > MAX_ATTEMPTS || !api) return giveUp(blockedText)

  useMusic.setState({ status: 'loading', error: null, notice: `${blockedText} Buscando otra versión…` })
  let candidates: MusicResult[] = []
  try {
    candidates = await api.searchMusic(`${item.artist} ${item.title}`.trim(), 'videos')
  } catch {
    /* sin conexión: se pasa a la siguiente */
  }
  if (!stillHere()) return
  // Primero las de otros canales: las del artista o su discográfica suelen estar bloqueadas igual.
  const usable = candidates.filter((c) => !attempts.includes(c.videoId) && !blocked.has(c.videoId) && sameSong(c, item))
  const pick = usable.find((c) => !officialUpload(c, item)) ?? usable[0]
  if (!pick) return giveUp(`${blockedText} No encontré otra versión que se pueda oír aquí.`)
  const alt: QueueItem = { ...item, videoId: pick.videoId, via: pick.artist || 'YouTube', origId: key, thumbnail: pick.thumbnail ?? item.thumbnail }
  useMusic.setState((s) => ({ queue: s.queue.map((q, i) => (i === s.index ? alt : q)) }))
  nameTrack(alt)
  chooseVideo(alt.videoId, 0, true)
  useMusic.setState({ notice: `Suena otra versión de «${item.title}» (subida por ${alt.via}): la original no se puede oír fuera de YouTube.` })
}
