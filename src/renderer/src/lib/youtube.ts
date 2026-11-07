/**
 * Reproductor oficial de YouTube: el vídeo se reproduce dentro del reproductor de YouTube, visible, con su
 * publicidad y sus controles (ver ytEmbed.ts). No se extrae ni se analiza el audio.
 */

/** Estados del reproductor (YT.PlayerState). */
export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const

export interface YtVideoData {
  video_id?: string
  title?: string
  author?: string
}

/** Parte de la API del reproductor que usa kywai. */
export interface YtPlayer {
  cueVideoById(videoId: string, startSeconds?: number): void
  loadVideoById(videoId: string, startSeconds?: number): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  getPlaybackRate(): number
  setVolume(volume: number): void
  mute(): void
  unMute(): void
  destroy(): void
  /** No está en la documentación pública, pero el reproductor la expone; se usa con cuidado. */
  getVideoData?(): YtVideoData
}

const ID = /^[A-Za-z0-9_-]{11}$/

/** Identificador de vídeo de un enlace de YouTube (watch, youtu.be, shorts, embed, music) o del propio id. */
export function parseVideoId(input: string): string | null {
  const text = input.trim()
  if (ID.test(text)) return text
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = url.searchParams.get('v')
    const parts = url.pathname.split('/').filter(Boolean)
    if (!id && ['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] ?? null
  }
  return id && ID.test(id) ? id : null
}

/** Segundo de inicio de un enlace (?t=90, ?t=1m30s, &start=90). */
export function parseStartSeconds(input: string): number {
  try {
    const url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`)
    const t = url.searchParams.get('t') ?? url.searchParams.get('start')
    if (!t) return 0
    if (/^\d+$/.test(t)) return Number(t)
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
    return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0
  } catch {
    return 0
  }
}
