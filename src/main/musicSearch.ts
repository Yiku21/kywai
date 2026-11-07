// Buscar canciones para el reproductor de música del espacio digital, como en YouTube Music: primero en las
// canciones de YouTube Music y, si no responde, en los vídeos de YouTube. Usa la misma búsqueda que esas webs
// (sin clave de API ni cuenta). Solo devuelve identificadores y nombres: se reproducen con el reproductor
// oficial de YouTube, a la vista y con su publicidad.
// Sin anuncios: Audius (su API pública) y las radios de SomaFM (su lista pública de emisoras). Esas suenan con
// el reproductor de audio de AI Cowork, directamente desde sus servidores (ver @shared/musicSources).
import { AUDIUS_API, AUDIUS_APP_NAME, audiusKey, radioKey } from '@shared/musicSources'
import type { MusicResult, MusicSearchKind } from '@shared/types'

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

// ---------- Audius ----------

/** Canciones de una respuesta de búsqueda de Audius: solo las que se pueden escuchar enteras y gratis. */
export function parseAudiusResults(json: unknown): MusicResult[] {
  const out: MusicResult[] = []
  for (const raw of arr(obj(json)?.data)) {
    const tr = obj(raw)
    if (!tr) continue
    const id = str(tr.id)
    const title = str(tr.title).trim()
    // Las de pago, las reservadas a seguidores y las borradas no suenan sin cuenta.
    const access = obj(tr.access)
    if (!/^[A-Za-z0-9]{1,24}$/.test(id) || !title || tr.is_streamable === false || tr.is_delete === true) continue
    if (tr.is_stream_gated === true || (access && access.stream === false)) continue
    const user = obj(tr.user)
    const art = obj(tr.artwork)
    const thumbnail = str(art?.['150x150']) || str(art?.['480x480'])
    const duration = Number(tr.duration)
    out.push({
      videoId: audiusKey(id),
      title,
      artist: str(user?.name).trim() || str(user?.handle).trim(),
      album: str(tr.genre).trim() || undefined,
      durationSec: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined,
      thumbnail: /^https:\/\//.test(thumbnail) ? thumbnail : undefined,
      permalink: str(tr.permalink) || undefined
    })
  }
  return out
}

async function getJson(url: string, what: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${what} respondió ${res.status}`)
  return res.json()
}

async function searchAudius(query: string): Promise<MusicResult[]> {
  const params = new URLSearchParams({ query, app_name: AUDIUS_APP_NAME, limit: '40' })
  return parseAudiusResults(await getJson(`${AUDIUS_API}/tracks/search?${params}`, 'Audius'))
}

// ---------- Radios de SomaFM ----------

/** Emisoras de la lista pública de SomaFM (más escuchadas primero). */
export function parseSomaChannels(json: unknown): MusicResult[] {
  const out: Array<MusicResult & { listeners: number }> = []
  for (const raw of arr(obj(json)?.channels)) {
    const ch = obj(raw)
    const id = str(ch?.id)
    const title = str(ch?.title).trim()
    if (!ch || !/^[a-z0-9]{1,40}$/.test(id) || !title) continue
    const image = str(ch.largeimage) || str(ch.image)
    out.push({
      videoId: radioKey(id),
      title,
      artist: 'SomaFM',
      album: str(ch.description).trim() || str(ch.genre).replace(/\|/g, ', ') || undefined,
      thumbnail: /^https:\/\//.test(image) ? image : undefined,
      listeners: Number(ch.listeners) || 0
    })
  }
  return out.sort((a, b) => b.listeners - a.listeners).map(({ listeners: _l, ...r }) => r)
}

let somaCache: { at: number; list: MusicResult[] } | null = null
const SOMA_TTL_MS = 60 * 60 * 1000

async function listRadios(query: string): Promise<MusicResult[]> {
  if (!somaCache || Date.now() - somaCache.at > SOMA_TTL_MS) {
    somaCache = { at: Date.now(), list: parseSomaChannels(await getJson('https://somafm.com/channels.json', 'SomaFM')) }
  }
  return filterRadios(somaCache.list, query)
}

const fold = (t: string): string => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Emisoras cuyo nombre o descripción contienen todas las palabras buscadas (sin búsqueda, todas). */
export function filterRadios(list: MusicResult[], query: string): MusicResult[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return list
  return list.filter((r) => {
    const text = fold(`${r.title} ${r.album ?? ''}`)
    return words.every((w) => text.includes(w))
  })
}

/**
 * Busca canciones (YouTube Music) y, si no hay o falla, vídeos de YouTube. Con kind 'videos', solo vídeos (otras
 * subidas de una canción que su discográfica no deja oír fuera de YouTube). Con 'audius', en Audius; con 'radio',
 * las radios de SomaFM (sin búsqueda, todas).
 */
export async function searchMusic(query: unknown, kind: MusicSearchKind = 'songs'): Promise<MusicResult[]> {
  const q = typeof query === 'string' ? query.replace(/\s+/g, ' ').trim() : ''
  if (q.length > 200) throw new Error('La búsqueda es demasiado larga')
  if (kind === 'radio') {
    try {
      return await listRadios(q)
    } catch (e) {
      throw new Error(`No se pudo cargar la lista de radios: ${(e as Error).message || 'sin conexión'}`)
    }
  }
  if (!q) return []
  if (kind === 'audius') {
    try {
      return (await searchAudius(q)).slice(0, MAX_RESULTS)
    } catch (e) {
      throw new Error(`No se pudo buscar en Audius: ${(e as Error).message || 'sin conexión'}`)
    }
  }
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
