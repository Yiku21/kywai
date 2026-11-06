/**
 * Reproductor oficial de YouTube aislado: un iframe del reproductor embebido que se maneja con mensajes
 * (postMessage), el mismo protocolo que usa la API oficial por dentro. Así no se carga ningún script de YouTube en
 * la ventana de AI Cowork, que tiene acceso a todo (agentes, actualizaciones, proyectos): el reproductor vive en
 * su propio origen y solo puede hablar con la app mediante estos mensajes, que aquí se validan.
 */
import { YT_STATE, type YtPlayer, type YtVideoData } from './youtube'
import { t } from '@/lib/i18n'

export interface EmbedEvents {
  onReady?: () => void
  onStateChange?: (state: number) => void
  onPlaybackRateChange?: (rate: number) => void
  onError?: (code: number) => void
}

export interface EmbedOptions {
  videoId: string
  start?: number
  /** Empezar a sonar al cargar (solo tras un gesto del usuario). */
  autoplay?: boolean
  events: EmbedEvents
}

const HOST = 'https://www.youtube-nocookie.com'
const ORIGINS = /^https:\/\/www\.youtube(-nocookie)?\.com$/
/** Las apps de escritorio se identifican ante YouTube con su id (la ventana es un archivo local, sin origen web). */
const APP_REFERRER = 'https://com.aicowork.app/'
let nextId = 1

interface Info {
  currentTime: number
  duration: number
  playerState: number
  playbackRate: number
  videoData: YtVideoData
  /** Cuándo llegó currentTime (para estimar la posición entre mensajes). */
  at: number
}

/** Dirección del reproductor embebido para un vídeo. */
export function embedUrl(id: number, opts: Pick<EmbedOptions, 'videoId' | 'start' | 'autoplay'>, origin: string | null): string {
  const params = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', widgetid: String(id) })
  if (opts.start) params.set('start', String(Math.max(0, Math.floor(opts.start))))
  if (opts.autoplay) params.set('autoplay', '1')
  if (origin) params.set('origin', origin)
  else params.set('widget_referrer', APP_REFERRER)
  return `${HOST}/embed/${encodeURIComponent(opts.videoId)}?${params}`
}

/** Crea el reproductor dentro de `container` y devuelve su control (la misma interfaz que la API oficial). */
export function createEmbedPlayer(container: HTMLElement, opts: EmbedOptions): YtPlayer {
  const id = nextId++
  const web = location.protocol === 'http:' || location.protocol === 'https:'
  const iframe = document.createElement('iframe')
  iframe.src = embedUrl(id, opts, web ? location.origin : null)
  iframe.title = t('Reproductor de YouTube')
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
  iframe.referrerPolicy = 'strict-origin-when-cross-origin'
  iframe.style.cssText = 'width:100%;height:100%;border:0;display:block'
  container.replaceChildren(iframe)

  const info: Info = { currentTime: opts.start ?? 0, duration: 0, playerState: YT_STATE.UNSTARTED, playbackRate: 1, videoData: {}, at: performance.now() }
  let ready = false
  let destroyed = false
  let listening: number | undefined
  let giveUp: number | undefined
  let lastState: number | null = null

  const post = (msg: Record<string, unknown>): void => {
    if (destroyed) return
    try {
      iframe.contentWindow?.postMessage(JSON.stringify({ ...msg, id, channel: 'widget' }), HOST)
    } catch {
      /* el iframe aún no tiene ventana */
    }
  }
  const command = (func: string, args: unknown[] = []): void => post({ event: 'command', func, args })

  const state = (s: number): void => {
    if (!Number.isFinite(s) || s === lastState) return
    lastState = s
    info.playerState = s
    opts.events.onStateChange?.(s)
  }

  const merge = (raw: unknown): void => {
    if (!raw || typeof raw !== 'object') return
    const i = raw as Record<string, unknown>
    if (typeof i.currentTime === 'number') {
      info.currentTime = i.currentTime
      info.at = performance.now()
    }
    if (typeof i.duration === 'number') info.duration = i.duration
    if (typeof i.playbackRate === 'number') {
      const changed = info.playbackRate !== i.playbackRate
      info.playbackRate = i.playbackRate
      if (changed && ready) opts.events.onPlaybackRateChange?.(i.playbackRate)
    }
    if (i.videoData && typeof i.videoData === 'object') info.videoData = { ...info.videoData, ...(i.videoData as YtVideoData) }
    if (typeof i.playerState === 'number') state(i.playerState)
  }

  const onMessage = (e: MessageEvent): void => {
    if (e.source !== iframe.contentWindow || !ORIGINS.test(e.origin)) return
    let data: Record<string, unknown>
    try {
      data = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as Record<string, unknown>
    } catch {
      return
    }
    if (!data || typeof data !== 'object') return
    switch (data.event) {
      case 'initialDelivery':
      case 'infoDelivery':
        merge(data.info)
        break
      case 'onReady':
        if (ready) break
        ready = true
        window.clearInterval(listening)
        window.clearTimeout(giveUp)
        for (const ev of ['onStateChange', 'onPlaybackRateChange', 'onError']) command('addEventListener', [ev])
        opts.events.onReady?.()
        break
      case 'onStateChange':
        state(Number(data.info))
        break
      case 'onPlaybackRateChange':
        merge({ playbackRate: Number(data.info) })
        break
      case 'onError':
        opts.events.onError?.(Number(data.info))
        break
    }
  }
  window.addEventListener('message', onMessage)

  // Como la API oficial: se saluda al reproductor hasta que conteste que está listo.
  iframe.addEventListener('load', () => {
    if (ready || destroyed) return
    post({ event: 'listening' })
    window.clearInterval(listening)
    listening = window.setInterval(() => post({ event: 'listening' }), 250)
    giveUp = window.setTimeout(() => window.clearInterval(listening), 30_000)
  })

  const position = (): number => {
    if (info.playerState !== YT_STATE.PLAYING) return info.currentTime
    return info.currentTime + ((performance.now() - info.at) / 1000) * (info.playbackRate || 1)
  }

  return {
    cueVideoById: (videoId, startSeconds = 0) => {
      info.videoData = {}
      command('cueVideoById', [{ videoId, startSeconds }])
    },
    loadVideoById: (videoId, startSeconds = 0) => {
      info.videoData = {}
      info.currentTime = startSeconds
      info.at = performance.now()
      command('loadVideoById', [{ videoId, startSeconds }])
    },
    playVideo: () => command('playVideo'),
    pauseVideo: () => command('pauseVideo'),
    seekTo: (seconds, allowSeekAhead) => {
      info.currentTime = seconds
      info.at = performance.now()
      command('seekTo', [seconds, allowSeekAhead])
    },
    getCurrentTime: () => position(),
    getDuration: () => info.duration,
    getPlayerState: () => info.playerState,
    getPlaybackRate: () => info.playbackRate,
    setVolume: (volume) => command('setVolume', [Math.max(0, Math.min(100, Math.round(volume)))]),
    mute: () => command('mute'),
    unMute: () => command('unMute'),
    getVideoData: () => ({ ...info.videoData }),
    destroy: () => {
      destroyed = true
      window.clearInterval(listening)
      window.clearTimeout(giveUp)
      window.removeEventListener('message', onMessage)
      iframe.remove()
    }
  }
}
