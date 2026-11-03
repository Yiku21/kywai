// Buscar canciones para el reproductor de música del espacio digital, como en YouTube Music: primero en las
// canciones de YouTube Music y, si no responde, en los vídeos de YouTube. Usa la misma búsqueda que esas webs
// (sin clave de API ni cuenta). Solo devuelve identificadores y nombres: se reproducen con el reproductor
// oficial de YouTube, a la vista y con su publicidad.
import type { MusicResult } from '@shared/types'

const TIMEOUT_MS = 10_000
const MAX_RESULTS = 20
const ID = /^[A-Za-z0-9_-]{11}$/
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

type Json = Record<string, unknown>
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const runsText = (v: unknown): string =>
  arr(obj(v)?.runs)
    .map((r) => str(obj(r)?.text))
    .join('')

/** «3:51» o «1:02:03» → segundos. */
export function durationSeconds(text: string): number | undefined {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!m) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/** Recorre la respuesta buscando cada «renderer» de resultado (la estructura cambia según la página). */
function collect(root: unknown, key: string, out: Json[] = []): Json[] {
  const o = obj(root)
  if (o) {
    const hit = obj(o[key])
    if (hit) {
      out.push(hit)
      return out
    }
    for (const v of Object.values(o)) collect(v, key, out)
  } else if (Array.isArray(root)) for (const v of root) collect(v, key, out)
  return out
}

const thumb = (videoId: string): string => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`

/** Canciones de una respuesta de YouTube Music (título; «artista • álbum • duración»). */
export function parseMusicResults(json: unknown): MusicResult[] {
  const out: MusicResult[] = []
  for (const r of collect(json, 'musicResponsiveListItemRenderer')) {
    const videoId = str(obj(r.playlistItemData)?.videoId)
    if (!ID.test(videoId)) continue
    const cols = arr(r.flexColumns).map((c) => runsText(obj(obj(c)?.musicResponsiveListItemFlexColumnRenderer)?.text))
    const title = (cols[0] ?? '').trim()
    const parts = (cols[1] ?? '').split(' • ').map((p) => p.trim()).filter(Boolean)
    const last = parts[parts.length - 1] ?? ''
    const durationSec = durationSeconds(last)
    if (durationSec != null) parts.pop()
    // La sección «Canciones» pone delante «Canción» en algunos idiomas: no es el artista.
    if (parts.length > 1 && /^(canción|song|vídeo|video)$/i.test(parts[0])) parts.shift()
    if (!title) continue
    out.push({ videoId, title, artist: parts[0] ?? '', album: parts[1], durationSec, thumbnail: thumb(videoId) })
  }
  return out
}

/** Vídeos de una respuesta de búsqueda de YouTube. */
export function parseVideoResults(json: unknown): MusicResult[] {
  const out: MusicResult[] = []
  for (const v of collect(json, 'videoRenderer')) {
    const videoId = str(v.videoId)
    const title = runsText(v.title).trim()
    if (!ID.test(videoId) || !title) continue
    out.push({
      videoId,
      title,
      artist: runsText(v.ownerText).trim() || runsText(v.longBylineText).trim(),
      durationSec: durationSeconds(str(obj(v.lengthText)?.simpleText)),
      thumbnail: thumb(videoId)
    })
  }
  return out
}

async function post(url: string, body: Json, origin: string): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Origin: origin, Referer: `${origin}/` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`YouTube respondió ${res.status}`)
  return res.json()
}

const CONTEXT = { hl: 'es', gl: 'ES' }

async function searchSongs(query: string): Promise<MusicResult[]> {
  const json = await post(
    'https://music.youtube.com/youtubei/v1/search?prettyPrint=false',
    // params: solo la sección «Canciones».
    { context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.01.00', ...CONTEXT } }, query, params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D' },
    'https://music.youtube.com'
  )
  return parseMusicResults(json)
}

async function searchVideos(query: string): Promise<MusicResult[]> {
  const json = await post(
    'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
    // params: solo vídeos.
    { context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', ...CONTEXT } }, query, params: 'EgIQAQ%3D%3D' },
    'https://www.youtube.com'
  )
  return parseVideoResults(json)
}

/**
 * Busca canciones (YouTube Music) y, si no hay o falla, vídeos de YouTube. Con kind 'videos', solo vídeos (otras
 * subidas de una canción que su discográfica no deja oír fuera de YouTube).
 */
export async function searchMusic(query: unknown, kind: 'songs' | 'videos' = 'songs'): Promise<MusicResult[]> {
  const q = typeof query === 'string' ? query.replace(/\s+/g, ' ').trim() : ''
  if (!q) return []
  if (q.length > 200) throw new Error('La búsqueda es demasiado larga')
  if (kind === 'videos') return (await searchVideos(q)).slice(0, MAX_RESULTS)
  let songs: MusicResult[] = []
  let problem = ''
  try {
    songs = await searchSongs(q)
  } catch (e) {
    problem = (e as Error).message
  }
  if (songs.length) return songs.slice(0, MAX_RESULTS)
  try {
    return (await searchVideos(q)).slice(0, MAX_RESULTS)
  } catch (e) {
    throw new Error(`No se pudo buscar en YouTube: ${(e as Error).message || problem || 'sin conexión'}`)
  }
}
