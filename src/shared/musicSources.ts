/**
 * Fuentes de la música del espacio digital. YouTube suena en su reproductor oficial (con su publicidad). Audius
 * (música que los propios artistas suben para que se escuche gratis) y las radios de SomaFM (sin anuncios, las
 * mantienen sus oyentes) suenan en un reproductor de audio propio, directamente desde sus servidores públicos.
 *
 * En la cola todo se identifica con un texto: el id de 11 caracteres de YouTube, «audius:<id>» o «radio:<id>».
 */

export type MusicSource = 'youtube' | 'audius' | 'radio'

/** Nombre con el que AI Cowork se identifica ante la API pública de Audius (lo pide su documentación). */
export const AUDIUS_APP_NAME = 'AICowork'
export const AUDIUS_API = 'https://api.audius.co/v1'

const AUDIUS_ID = /^[A-Za-z0-9]{1,24}$/
const RADIO_ID = /^[a-z0-9]{1,40}$/

/** De qué fuente es una canción de la cola. */
export function musicSourceOf(id: string | null | undefined): MusicSource {
  if (id?.startsWith('audius:')) return 'audius'
  if (id?.startsWith('radio:')) return 'radio'
  return 'youtube'
}

export const audiusKey = (trackId: string): string => `audius:${trackId}`
export const radioKey = (channelId: string): string => `radio:${channelId}`

/** Dirección del audio de una canción de Audius o de una radio de SomaFM (null si no es de esas fuentes o no es válida). */
export function streamUrlOf(id: string): string | null {
  const source = musicSourceOf(id)
  const raw = id.slice(id.indexOf(':') + 1)
  if (source === 'audius' && AUDIUS_ID.test(raw)) {
    return `${AUDIUS_API}/tracks/${encodeURIComponent(raw)}/stream?app_name=${AUDIUS_APP_NAME}`
  }
  if (source === 'radio' && RADIO_ID.test(raw)) return `https://ice2.somafm.com/${raw}-128-mp3`
  return null
}

/** Página para abrir la canción o la radio fuera de AI Cowork. */
export function webPageOf(id: string, permalink?: string): string {
  const source = musicSourceOf(id)
  if (source === 'audius') return permalink && /^\/[^/]/.test(permalink) ? `https://audius.co${permalink}` : 'https://audius.co'
  if (source === 'radio') return `https://somafm.com/${encodeURIComponent(id.slice('radio:'.length))}/`
  return `https://music.youtube.com/watch?v=${encodeURIComponent(id)}`
}

/** Una radio no tiene duración ni final: no se puede saltar dentro ni buscar su BPM (cambia de canción sola). */
export const isLive = (id: string | null | undefined): boolean => musicSourceOf(id) === 'radio'
