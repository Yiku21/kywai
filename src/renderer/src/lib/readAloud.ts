import { create } from 'zustand'
import type { ChatMessage } from '@shared/types'
import { finalAnswerOf, speechChunks, spokenText } from '@shared/readAloud'
import { api } from './api'
import { getVoiceVolume, isVoiceMuted, setVoiceMuted, subscribeAudio } from './audio'

/**
 * «Leer las respuestas en voz alta»: el altavoz junto al micrófono del chat. Activado, cuando el equipo termina una
 * petición se lee sola su respuesta final (no los pasos intermedios ni los bloques de código) con una voz de las de
 * los vídeos; la voz se elige en Ajustes. Suena por el canal de «Voces de los agentes» (su volumen y su silencio).
 * Se recuerda por dispositivo.
 */
const ON_KEY = 'aicowork.lectura.activa'
const VOICE_KEY = 'aicowork.lectura.voz'
/** La última respuesta leída: con el chat de al lado o una ventana suelta abiertos, no se lee dos veces. */
const LAST_KEY = 'aicowork.lectura.ultima'
/** Una respuesta más vieja que esto (llega al reconectar) ya no se lee. */
const FRESH_MS = 10 * 60_000
/** Así empieza el id de lo que suena cuando es la muestra de una voz en Ajustes (no una respuesta). */
export const SAMPLE = 'muestra:'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* sin almacenamiento: vale para esta sesión */
  }
}

interface ReadAloudState {
  /** El altavoz está activado: las respuestas finales se leen solas. */
  on: boolean
  /** La voz elegida («edge-…», «kokoro-…», «mac-carmen»…); null: la del idioma de la app. */
  voice: string | null
  /** El mensaje que suena ahora (o se está preparando). */
  speaking: string | null
  /** Aún no ha empezado a sonar: se está generando el primer trozo. */
  loading: boolean
  /** Por qué no se pudo leer la última respuesta. */
  error: string | null
  setOn(on: boolean): void
  setVoice(voice: string | null): void
}

export const useReadAloud = create<ReadAloudState>((set) => ({
  on: read(ON_KEY) === '1',
  voice: read(VOICE_KEY) || null,
  speaking: null,
  loading: false,
  error: null,
  setOn(on) {
    write(ON_KEY, on ? '1' : '0')
    set({ on, error: null })
    if (!on) stopReading()
    // Encender el altavoz es querer oírlo: si las voces estaban silenciadas, vuelven.
    else if (isVoiceMuted()) setVoiceMuted(false)
  },
  setVoice(voice) {
    write(VOICE_KEY, voice)
    set({ voice })
  }
}))

/** Se puede leer en voz alta aquí (hay motor y sabe hacerlo; en el modo demo sin motor, no). */
export function canReadAloud(): boolean {
  return !!api?.readAloud
}

/** El audio llega como data: URL y la página solo deja reproducir «blob:». */
export function dataToBlobUrl(url: string): string {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url)
  if (!m) return url
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: m[1] }))
}

const cleanError = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

let audio: HTMLAudioElement | null = null
/** Cada lectura tiene su número: una nueva (o parar) deja sin efecto lo que quedaba de la anterior. */
let session = 0

/** Calla lo que se esté leyendo (el altavoz sigue como esté). */
export function stopReading(): void {
  session++
  audio?.pause()
  audio = null
  if (useReadAloud.getState().speaking) useReadAloud.setState({ speaking: null, loading: false })
}

function clip(text: string, voice: string | null): Promise<string> {
  const a = api
  if (!a?.readAloud) return Promise.reject(new Error('readAloud'))
  return a.readAloud(text, voice).then(dataToBlobUrl)
}

function playUrl(url: string, mine: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mine !== session) return resolve()
    const a = new Audio(url)
    a.volume = isVoiceMuted() ? 0.7 : Math.min(1, Math.max(0, getVoiceVolume()))
    audio = a
    const done = (): void => {
      URL.revokeObjectURL(url)
      resolve()
    }
    a.onended = done
    a.onpause = () => {
      if (mine !== session) done()
    }
    a.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('audio'))
    }
    a.play().catch(reject)
  })
}

/** Lee un texto (Markdown de una respuesta) trozo a trozo; el siguiente se prepara mientras suena el de ahora. */
export async function readText(id: string, markdown: string, voice: string | null = useReadAloud.getState().voice, opts: { sample?: boolean } = {}): Promise<void> {
  const chunks = speechChunks(spokenText(markdown))
  stopReading()
  // La muestra de una voz en Ajustes suena aunque las voces estén silenciadas: se ha pedido oírla.
  if (!chunks.length || !canReadAloud() || (isVoiceMuted() && !opts.sample)) return
  const mine = session
  useReadAloud.setState({ speaking: id, loading: true, error: null })
  try {
    let next: Promise<string> | null = clip(chunks[0], voice)
    for (let i = 0; i < chunks.length && next; i++) {
      const url: string = await next
      if (mine !== session) {
        URL.revokeObjectURL(url)
        return
      }
      next = i + 1 < chunks.length ? clip(chunks[i + 1], voice) : null
      // Si el siguiente falla, se sabrá al esperarlo; que no quede como un rechazo sin atender mientras suena este.
      next?.catch(() => undefined)
      useReadAloud.setState({ loading: false })
      await playUrl(url, mine)
      if (mine !== session) return
    }
  } catch (e) {
    if (mine === session) useReadAloud.setState({ error: cleanError(e) })
  } finally {
    if (mine === session) {
      audio = null
      useReadAloud.setState({ speaking: null, loading: false })
    }
  }
}

/**
 * Ha terminado una petición: si el altavoz está activado, lee su respuesta final. `messages` son los del chat que se
 * ve en esta ventana (si la petición era de otra conversación, aquí no está su respuesta y no se lee).
 */
export function readFinalAnswer(messages: ChatMessage[], runId: string, now = Date.now()): void {
  if (!useReadAloud.getState().on || !canReadAloud() || isVoiceMuted()) return
  const m = finalAnswerOf(messages, runId)
  if (!m || now - m.createdAt > FRESH_MS) return
  if (read(LAST_KEY) === m.id) return
  write(LAST_KEY, m.id)
  void readText(m.id, m.text)
}

/** Sigue el volumen y el silencio de «Voces de los agentes», y el altavoz que se cambie en otra ventana de kywai. */
export function initReadAloud(): () => void {
  const off = subscribeAudio(() => {
    if (isVoiceMuted()) {
      if (!useReadAloud.getState().speaking?.startsWith(SAMPLE)) stopReading()
    } else if (audio) audio.volume = Math.min(1, Math.max(0, getVoiceVolume()))
  })
  const onStorage = (e: StorageEvent): void => {
    if (e.key === ON_KEY) {
      const on = e.newValue === '1'
      useReadAloud.setState({ on })
      if (!on) stopReading()
    } else if (e.key === VOICE_KEY) useReadAloud.setState({ voice: e.newValue || null })
  }
  window.addEventListener('storage', onStorage)
  return () => {
    off()
    window.removeEventListener('storage', onStorage)
  }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') initReadAloud()
