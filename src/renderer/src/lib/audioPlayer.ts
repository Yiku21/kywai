/**
 * Reproductor de audio propio para las fuentes sin anuncios (Audius y las radios de SomaFM): un elemento <audio>
 * con la misma interfaz que el reproductor de YouTube (YtPlayer), para que la cola, los controles y las luces al
 * ritmo funcionen igual con cualquier fuente.
 */
import { streamUrlOf } from '@shared/musicSources'
import { YT_STATE, type YtPlayer } from './youtube'

export interface AudioEvents {
  onStateChange?: (state: number) => void
  onPlaybackRateChange?: (rate: number) => void
  onError?: (code: number) => void
}

/** Errores del reproductor de audio (MediaError + 1000, para no confundirlos con los de YouTube). */
export const AUDIO_ERROR = { ABORTED: 1001, NETWORK: 1002, DECODE: 1003, UNSUPPORTED: 1004 } as const

/** Crea el reproductor (sin interfaz: los controles son los de AI Cowork). */
export function createAudioPlayer(events: AudioEvents): YtPlayer & { readonly element: HTMLAudioElement } {
  const audio = document.createElement('audio')
  audio.preload = 'auto'
  // Audius y SomaFM responden con CORS abierto: así el audio se puede analizar sin compartir la pantalla.
  audio.crossOrigin = 'anonymous'
  let state: number = YT_STATE.UNSTARTED
  let destroyed = false
  const set = (s: number): void => {
    if (destroyed || s === state) return
    state = s
    events.onStateChange?.(s)
  }
  audio.addEventListener('playing', () => set(YT_STATE.PLAYING))
  audio.addEventListener('pause', () => {
    // Al fallar la carga también llega «pause»: el error ya se avisó.
    if (!audio.ended && !audio.error) set(YT_STATE.PAUSED)
  })
  audio.addEventListener('waiting', () => {
    if (!audio.paused) set(YT_STATE.BUFFERING)
  })
  audio.addEventListener('ended', () => set(YT_STATE.ENDED))
  audio.addEventListener('ratechange', () => events.onPlaybackRateChange?.(audio.playbackRate))
  audio.addEventListener('error', () => {
    // Al cambiar de canción, vaciar la dirección da un error sin importancia.
    if (destroyed || !audio.getAttribute('src')) return
    events.onError?.(1000 + (audio.error?.code ?? 2))
  })

  /** play() devuelve una promesa que falla si el navegador no deja sonar aún: se queda en pausa. */
  const play = (): void => {
    // Si falla porque el audio no llega, ya se avisó del error: no se tapa con «en pausa».
    const blocked = (): void => {
      if (!audio.error) set(YT_STATE.PAUSED)
    }
    try {
      Promise.resolve(audio.play()).catch(blocked)
    } catch {
      blocked()
    }
  }

  const load = (id: string, start: number, autoplay: boolean): void => {
    const url = streamUrlOf(id)
    state = YT_STATE.UNSTARTED
    if (!url) {
      events.onError?.(AUDIO_ERROR.UNSUPPORTED)
      return
    }
    audio.src = url
    if (start > 0) {
      audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = start } catch { /* radio */ } }, { once: true })
    }
    if (autoplay) play()
    else set(YT_STATE.CUED)
  }

  return {
    element: audio,
    cueVideoById: (id, start = 0) => load(id, start, false),
    loadVideoById: (id, start = 0) => load(id, start, true),
    playVideo: play,
    pauseVideo: () => audio.pause(),
    seekTo: (seconds) => {
      if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, seconds)
    },
    getCurrentTime: () => audio.currentTime || 0,
    // Una radio no tiene duración (Infinity): 0, como un vídeo en directo.
    getDuration: () => (Number.isFinite(audio.duration) ? audio.duration : 0),
    getPlayerState: () => state,
    getPlaybackRate: () => audio.playbackRate || 1,
    setVolume: (volume) => {
      audio.volume = Math.max(0, Math.min(1, volume / 100))
    },
    mute: () => {
      audio.muted = true
    },
    unMute: () => {
      audio.muted = false
    },
    getVideoData: () => ({}),
    destroy: () => {
      destroyed = true
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.remove()
    }
  }
}
