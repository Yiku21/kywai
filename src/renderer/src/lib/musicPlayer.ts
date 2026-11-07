/**
 * El reproductor del panel de Música: el oficial de YouTube (aislado en su marco) para las canciones de YouTube y
 * el reproductor de audio propio para Audius y las radios. Por fuera es uno solo, con la interfaz de YouTube
 * (YtPlayer): al cambiar de canción se usa el que toque y el otro se para.
 */
import { musicSourceOf } from '@shared/musicSources'
import { createAudioPlayer } from './audioPlayer'
import { setAudioElementActive, tapAudioElement } from './audioSync'
import { YT_STATE, type YtPlayer } from './youtube'
import { createEmbedPlayer, type EmbedEvents } from './ytEmbed'

export interface MusicPlayerOptions {
  videoId: string
  start?: number
  events: EmbedEvents
}

export function createMusicPlayer(container: HTMLElement, opts: MusicPlayerOptions): YtPlayer {
  const ytBox = document.createElement('div')
  ytBox.style.cssText = 'width:100%;height:100%'
  container.replaceChildren(ytBox)

  let usingAudio = musicSourceOf(opts.videoId) !== 'youtube'
  // Solo se avisa del reproductor que suena: el otro está parado.
  const audio = createAudioPlayer({
    onStateChange: (s) => usingAudio && opts.events.onStateChange?.(s),
    onPlaybackRateChange: (r) => usingAudio && opts.events.onPlaybackRateChange?.(r),
    onError: (c) => usingAudio && opts.events.onError?.(c)
  })
  container.append(audio.element)
  tapAudioElement(audio.element)

  let yt: YtPlayer | null = null
  let ytReady = false
  /** Lo pedido a YouTube mientras su reproductor se creaba. */
  let ytPending: { id: string; start: number; play: boolean } | null = null

  /** `first`: es el reproductor del arranque, y su «listo» es el del reproductor entero (lo gestiona el panel). */
  const ensureYt = (id: string, start: number, play: boolean, first = false): void => {
    if (yt) {
      if (!ytReady) ytPending = { id, start, play }
      else if (play) yt.loadVideoById(id, start)
      else yt.cueVideoById(id, start)
      return
    }
    ytPending = null
    const player = createEmbedPlayer(ytBox, {
      videoId: id,
      start,
      autoplay: play,
      events: {
        onReady: () => {
          ytReady = true
          if (first) {
            ytPending = null
            opts.events.onReady?.()
            return
          }
          const later = ytPending
          ytPending = null
          if (later && usingAudio) return
          if (later) {
            if (later.play) player.loadVideoById(later.id, later.start)
            else player.cueVideoById(later.id, later.start)
          } else if (play && !usingAudio) player.playVideo()
          if (!usingAudio) opts.events.onStateChange?.(player.getPlayerState())
        },
        onStateChange: (s) => !usingAudio && opts.events.onStateChange?.(s),
        onPlaybackRateChange: (r) => !usingAudio && opts.events.onPlaybackRateChange?.(r),
        onError: (c) => !usingAudio && opts.events.onError?.(c)
      }
    })
    yt = player
  }

  const use = (id: string): void => {
    usingAudio = musicSourceOf(id) !== 'youtube'
    ytBox.style.display = usingAudio ? 'none' : ''
    setAudioElementActive(usingAudio)
    if (usingAudio) {
      try { yt?.pauseVideo() } catch { /* aún no listo */ }
    } else audio.pauseVideo()
  }

  const load = (id: string, start: number, play: boolean): void => {
    use(id)
    if (usingAudio) {
      if (play) audio.loadVideoById(id, start)
      else audio.cueVideoById(id, start)
    } else ensureYt(id, start, play)
  }

  const active = (): YtPlayer | null => (usingAudio ? audio : yt)

  // Arranque: el reproductor de la primera canción. Como con YouTube, avisa de que está listo al poder usarse.
  use(opts.videoId)
  if (usingAudio) {
    audio.cueVideoById(opts.videoId, opts.start ?? 0)
    queueMicrotask(() => opts.events.onReady?.())
  } else ensureYt(opts.videoId, opts.start ?? 0, false, true)

  return {
    cueVideoById: (id, start = 0) => load(id, start, false),
    loadVideoById: (id, start = 0) => load(id, start, true),
    playVideo: () => active()?.playVideo(),
    pauseVideo: () => active()?.pauseVideo(),
    seekTo: (s, ahead) => active()?.seekTo(s, ahead),
    getCurrentTime: () => active()?.getCurrentTime() ?? 0,
    getDuration: () => active()?.getDuration() ?? 0,
    getPlayerState: () => active()?.getPlayerState() ?? YT_STATE.UNSTARTED,
    getPlaybackRate: () => active()?.getPlaybackRate() ?? 1,
    // El volumen se aplica a los dos: así al cambiar de fuente suena igual.
    setVolume: (v) => {
      audio.setVolume(v)
      try { yt?.setVolume(v) } catch { /* aún no listo */ }
    },
    mute: () => {
      audio.mute()
      try { yt?.mute() } catch { /* aún no listo */ }
    },
    unMute: () => {
      audio.unMute()
      try { yt?.unMute() } catch { /* aún no listo */ }
    },
    getVideoData: () => active()?.getVideoData?.() ?? {},
    destroy: () => {
      setAudioElementActive(false)
      audio.destroy()
      try { yt?.destroy() } catch { /* ya destruido */ }
      yt = null
    }
  }
}
