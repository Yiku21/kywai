/** Música del espacio digital: identificación de la canción y búsqueda de su tempo (sin analizar el audio). */

export interface TempoQuery {
  artist: string
  title: string
  /** Duración del vídeo en segundos (ayuda a elegir la versión correcta). */
  durationSec?: number
}

/** Nivel de confianza mostrado en la interfaz. */
export type TempoConfidence = 'alta' | 'media' | 'baja'

export interface TempoMatch {
  bpm: number
  /** 0..1: parecido de artista, título y duración con la canción encontrada. */
  score: number
  confidence: TempoConfidence
  source: 'deezer'
  artist: string
  title: string
  durationSec?: number
  url?: string
}

export interface TempoLookupResult {
  /** null si no hay coincidencia o la canción no tiene BPM publicado. */
  match: TempoMatch | null
  /** Motivo legible cuando no hay coincidencia fiable. */
  note?: string
}

/** Coletillas de los títulos de YouTube que no forman parte del nombre de la canción. */
const NOISE = [
  /\((?:[^)]*?\b(?:official|oficial|video|vídeo|videoclip|clip|audio|lyrics?|letra|visualizer|hd|hq|4k|remaster(?:ed)?|mv|m\/v|live|en vivo|en directo)\b[^)]*)\)/gi,
  /\[(?:[^\]]*?\b(?:official|oficial|video|vídeo|videoclip|clip|audio|lyrics?|letra|visualizer|hd|hq|4k|remaster(?:ed)?|mv|m\/v|live|en vivo|en directo)\b[^\]]*)\]/gi,
  /\b(?:official\s+(?:music\s+)?video|video\s+oficial|videoclip\s+oficial|official\s+audio|audio\s+oficial|lyric\s+video|con\s+letra)\b/gi,
  /\|.*$/g,
  /#\S+/g
]

const FEAT = /\s*[([]?\s*\b(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?/gi

function tidy(s: string): string {
  return s.replace(/\s{2,}/g, ' ').replace(/^[\s\-–—:·|]+|[\s\-–—:·|]+$/g, '').trim()
}

/**
 * Deduce artista y canción de un título de YouTube («Artista - Canción (Official Video)») y del canal
 * («Artista - Topic», «ArtistaVEVO»). Si el título no lleva guion, el artista es el canal.
 */
export function parseVideoTitle(rawTitle: string, channel = ''): { artist: string; title: string } {
  let title = rawTitle
  for (const re of NOISE) title = title.replace(re, ' ')
  title = tidy(title)
  const author = tidy(channel.replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').replace(/\s*official$/i, ''))
  const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash) {
    return { artist: tidy(dash[1].replace(FEAT, ' ')), title: tidy(dash[2].replace(FEAT, ' ').replace(/["“”]/g, '')) }
  }
  return { artist: author, title: tidy(title.replace(FEAT, ' ').replace(/["“”]/g, '')) }
}

/** Minúsculas, sin acentos, sin «feat.» ni paréntesis: para comparar nombres. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(FEAT, ' ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Parecido 0..1 entre dos nombres (palabras en común; contención cuenta como coincidencia). */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  const ta = new Set(na.split(' '))
  const tb = new Set(nb.split(' '))
  let common = 0
  ta.forEach((t) => { if (tb.has(t)) common++ })
  const jaccard = common / (ta.size + tb.size - common)
  const contained = na.includes(nb) || nb.includes(na) ? 0.85 : 0
  return Math.max(jaccard, contained)
}

/**
 * Puntuación de una canción encontrada frente a lo que se buscaba. La duración pesa poco: los vídeos
 * suelen llevar introducciones o finales que no están en la grabación.
 */
export function matchScore(query: TempoQuery, found: { artist: string; title: string; durationSec?: number }): number {
  const title = nameSimilarity(query.title, found.title)
  const artist = query.artist ? nameSimilarity(query.artist, found.artist) : 0.5
  let duration = 0.5
  if (query.durationSec && found.durationSec) {
    const diff = Math.abs(query.durationSec - found.durationSec)
    duration = diff <= 4 ? 1 : diff <= 20 ? 0.75 : diff <= 60 ? 0.4 : 0.1
  }
  return Math.round((title * 0.5 + artist * 0.35 + duration * 0.15) * 100) / 100
}

export function confidenceFor(score: number): TempoConfidence {
  return score >= 0.85 ? 'alta' : score >= 0.65 ? 'media' : 'baja'
}

/** Por debajo de esta puntuación no se usa la coincidencia (se propone el modo manual). */
export const MIN_TEMPO_SCORE = 0.5

/** BPM razonable para luces: fuera de este rango se considera un dato erróneo. */
export function plausibleBpm(bpm: number): boolean {
  return Number.isFinite(bpm) && bpm >= 40 && bpm <= 250
}
