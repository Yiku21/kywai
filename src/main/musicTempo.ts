import {
  confidenceFor,
  matchScore,
  MIN_TEMPO_SCORE,
  plausibleBpm,
  type TempoLookupResult,
  type TempoMatch,
  type TempoQuery
} from '../shared/music'

/**
 * Tempo publicado de una canción, desde la API pública de Deezer (sin clave ni cuenta). Se consulta aquí y no
 * en la interfaz porque Deezer no permite peticiones desde otras webs (CORS). No se descarga ni analiza audio.
 */
const API = 'https://api.deezer.com'
const TIMEOUT_MS = 7000
const CACHE_MS = 24 * 60 * 60 * 1000
const MAX_CANDIDATES = 4

interface DeezerTrack {
  id: number
  title: string
  title_short?: string
  duration?: number
  bpm?: number
  link?: string
  artist?: { name?: string }
}

type Fetcher = (url: string) => Promise<unknown>

const cache = new Map<string, { at: number; result: TempoLookupResult }>()

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Deezer respondió ${res.status}`)
  return res.json()
}

function clean(s: unknown, max = 200): string {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f"]/g, ' ').trim().slice(0, max) : ''
}

function tracksOf(data: unknown): DeezerTrack[] {
  const list = (data as { data?: unknown })?.data
  return Array.isArray(list) ? (list.filter((t) => t && typeof (t as DeezerTrack).id === 'number') as DeezerTrack[]) : []
}

/** Busca la canción y devuelve su BPM con una puntuación de coincidencia. */
export async function lookupTempo(raw: unknown, fetcher: Fetcher = getJson): Promise<TempoLookupResult> {
  const input = (raw ?? {}) as Partial<TempoQuery>
  const query: TempoQuery = {
    artist: clean(input.artist),
    title: clean(input.title),
    durationSec: typeof input.durationSec === 'number' && input.durationSec > 0 ? Math.round(input.durationSec) : undefined
  }
  if (!query.title) return { match: null, note: 'Falta el nombre de la canción' }
  const key = `${query.artist}\u0000${query.title}\u0000${query.durationSec ?? ''}`.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result

  const searches = [
    query.artist ? `artist:"${query.artist}" track:"${query.title}"` : `track:"${query.title}"`,
    `${query.artist} ${query.title}`.trim()
  ]
  const seen = new Set<number>()
  const candidates: { track: DeezerTrack; score: number }[] = []
  for (const q of searches) {
    const found = tracksOf(await fetcher(`${API}/search?limit=8&q=${encodeURIComponent(q)}`))
    for (const track of found) {
      if (seen.has(track.id)) continue
      seen.add(track.id)
      const score = matchScore(query, {
        artist: track.artist?.name ?? '',
        title: track.title_short || track.title,
        durationSec: track.duration
      })
      candidates.push({ track, score })
    }
    if (candidates.some((c) => c.score >= 0.85)) break
  }
  candidates.sort((a, b) => b.score - a.score)

  let result: TempoLookupResult = { match: null, note: 'No se encontró la canción en Deezer' }
  for (const { track, score } of candidates.slice(0, MAX_CANDIDATES)) {
    if (score < MIN_TEMPO_SCORE) break
    // La búsqueda no trae el BPM: hay que pedir la ficha de la canción.
    const full = (await fetcher(`${API}/track/${track.id}`)) as DeezerTrack
    const bpm = Math.round(Number(full?.bpm) * 10) / 10
    if (!plausibleBpm(bpm)) {
      result = { match: null, note: 'La canción está en Deezer, pero sin BPM publicado' }
      continue
    }
    const match: TempoMatch = {
      bpm,
      score,
      confidence: confidenceFor(score),
      source: 'deezer',
      artist: clean(full.artist?.name ?? track.artist?.name),
      title: clean(full.title || track.title),
      durationSec: full.duration ?? track.duration,
      url: typeof full.link === 'string' && full.link.startsWith('https://') ? full.link : undefined
    }
    result = { match }
    break
  }
  if (!result.match && candidates.length && candidates[0].score < MIN_TEMPO_SCORE) {
    result = { match: null, note: 'No hay una coincidencia fiable con esa canción' }
  }
  cache.set(key, { at: Date.now(), result })
  if (cache.size > 300) cache.delete(cache.keys().next().value as string)
  return result
}

/** Petición desde la interfaz de escritorio: cowork://music/tempo?artist=…&title=…&duration=… */
export async function tempoResponse(url: URL): Promise<Response> {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }
  try {
    const result = await lookupTempo({
      artist: url.searchParams.get('artist') ?? '',
      title: url.searchParams.get('title') ?? '',
      durationSec: Number(url.searchParams.get('duration')) || undefined
    })
    return new Response(JSON.stringify(result), { headers })
  } catch (e) {
    const note = `No se pudo consultar el BPM (${(e as Error).message || 'sin conexión'})`
    return new Response(JSON.stringify({ match: null, note } satisfies TempoLookupResult), { status: 200, headers })
  }
}

export function clearTempoCache(): void {
  cache.clear()
}
