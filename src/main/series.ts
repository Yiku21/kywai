import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { VideoStyle } from './videoScript'
import type { VideoKind } from '../shared/videoChoice'

/**
 * «/serie»: una historia contada en episodios cortos con los mismos personajes. Cada episodio es un vídeo normal
 * («/video» o una película con estilo) que acaba en suspense con una pregunta para votar en los comentarios; el
 * siguiente («/serie siguiente ganó …») sigue la historia por donde la dejó el anterior y por lo que votó la gente.
 * Lo que va pasando se guarda en `.ai-cowork/serie.json` del proyecto (una serie a la vez; la anterior se aparta).
 */

export const SERIES_FILE = join('.ai-cowork', 'serie.json')
export const DEFAULT_EPISODES = 5
export const MAX_EPISODES = 10

export interface SeriesEpisode {
  n: number
  title: string
  /** Qué pasa en el episodio, en una o dos frases (lo lee el siguiente). */
  summary: string
  /** Cómo quedó en suspense. */
  cliffhanger?: string
  /** La pregunta para votar en los comentarios. */
  question?: string
  /** Lo que votó la gente en el episodio anterior y se usó en este. */
  vote?: string
  /** El vídeo (ruta relativa al proyecto). */
  video?: string
}

export interface SeriesState {
  idea: string
  total: number
  format: 'horizontal' | 'vertical'
  style: VideoStyle
  film?: string
  /** Lo elegido en el selector de «/video» (personaje, tipo y voz): igual en todos los episodios. */
  character?: string
  kind?: VideoKind
  voice?: string
  /** Los protagonistas (en inglés, «Nombre: cómo es»): se repiten iguales en todos los episodios. */
  characters?: string
  episodes: SeriesEpisode[]
  createdAt: number
}

export type SeriesRequest =
  | { kind: 'new'; idea: string; episodes: number; /** El resto como orden «/video …» (formato, estilo, personajes). */ video: string }
  | { kind: 'next'; vote?: string }
  | { kind: 'status' }

const SERIES_CMD = /^\/(?:serie|series|episodios?)(?:\s+([\s\S]*))?$/i
const EPISODES_RE = /(?:^|[\s,])(?:en|de|con|in|of|with)?\s*(\d{1,2})\s+(?:episodios?|cap[ií]tulos?|partes|episodes?|parts?)\b[\s,.]*/i
const NEXT_RE = /^(?:siguiente|sigue|contin[uú]a|continuar|pr[oó]ximo|next|otro episodio|el siguiente)\b[\s,.:;-]*([\s\S]*)$/i
const VOTE_RE = /^(?:(?:y\s+)?(?:gan[oó]|ganaron|votaron|vot[oó]|eligieron|la gente (?:eligi[oó]|vot[oó]|quiere)|won|winner)\s*:?\s*)/i

/** «/serie <idea> [en 5 episodios]», «/serie siguiente [ganó: …]», «/serie» (cómo va). Null si no es una orden de serie. */
export function parseSeriesRequest(text: string): SeriesRequest | null {
  const m = SERIES_CMD.exec(text.trim())
  if (!m) return null
  let rest = (m[1] ?? '').trim()
  if (!rest || /^(?:estado|c[oó]mo va|status)$/i.test(rest)) return { kind: 'status' }
  const next = NEXT_RE.exec(rest)
  if (next) {
    const vote = next[1].replace(VOTE_RE, '').trim()
    return { kind: 'next', ...(vote ? { vote: vote.slice(0, 400) } : {}) }
  }
  let episodes = DEFAULT_EPISODES
  const em = EPISODES_RE.exec(rest)
  if (em) {
    episodes = Math.min(MAX_EPISODES, Math.max(2, Number(em[1])))
    rest = (rest.slice(0, em.index) + ' ' + rest.slice(em.index + em[0].length)).replace(/\s{2,}/g, ' ').replace(/^[\s,:;]+|[\s,:;]+$/g, '').trim()
  }
  if (!rest) return { kind: 'status' }
  return { kind: 'new', idea: rest.slice(0, 2000), episodes, video: `/video ${rest}` }
}

export function seriesPath(root: string): string {
  return join(root, SERIES_FILE)
}

export function loadSeries(root: string): SeriesState | null {
  try {
    const s = JSON.parse(readFileSync(seriesPath(root), 'utf8')) as SeriesState
    return s && typeof s.idea === 'string' && Array.isArray(s.episodes) && Number.isInteger(s.total) ? s : null
  } catch {
    return null
  }
}

export function saveSeries(root: string, s: SeriesState): void {
  const file = seriesPath(root)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(s, null, 2))
}

/** Empieza una serie nueva; la que hubiera se guarda aparte (serie-<fecha>.json) para no perderla. */
export function startSeries(root: string, s: Omit<SeriesState, 'episodes' | 'createdAt'>, now = Date.now()): SeriesState {
  const file = seriesPath(root)
  if (existsSync(file)) {
    try {
      renameSync(file, join(dirname(file), `serie-${now.toString(36)}.json`))
    } catch {
      /* se sobrescribe */
    }
  }
  const state: SeriesState = { ...s, episodes: [], createdAt: now }
  saveSeries(root, state)
  return state
}

/** El episodio que toca hacer ahora (1, 2…), o null si la serie ya está completa. */
export function nextEpisode(s: SeriesState): number | null {
  const n = s.episodes.length + 1
  return n > s.total ? null : n
}

/** Guarda lo que pasó en un episodio (si se repite el número, lo sustituye) y, la primera vez, los protagonistas. */
export function recordEpisode(root: string, ep: SeriesEpisode, characters?: string): SeriesState | null {
  const s = loadSeries(root)
  if (!s) return null
  s.episodes = [...s.episodes.filter((e) => e.n !== ep.n), ep].sort((a, b) => a.n - b.n)
  if (characters && !s.characters) s.characters = characters
  saveSeries(root, s)
  return s
}

export interface EpisodeBrief {
  n: number
  total: number
  idea: string
  previous: SeriesEpisode[]
  vote?: string
  /** Ya hay protagonistas descritos (de la carpeta «personajes» o del primer episodio). */
  hasCast: boolean
}

export function episodeBrief(s: SeriesState, n: number, vote: string | undefined, hasCast: boolean): EpisodeBrief {
  return { n, total: s.total, idea: s.idea, previous: s.episodes.filter((e) => e.n < n), ...(vote ? { vote } : {}), hasCast }
}

/** Reglas del episodio para el encargo del guion (o de la película). */
export function episodeRules(b: EpisodeBrief, film = false): string[] {
  const last = b.n >= b.total
  const prev = b.previous.slice(-4)
  return [
    '',
    `## Serie: episodio ${b.n} de ${b.total}`,
    `Este vídeo es el episodio ${b.n} de una serie de ${b.total} sobre: ${b.idea}`,
    ...(prev.length
      ? [
          'Lo que pasó en los episodios anteriores (sigue la historia desde aquí, sin contradecirla):',
          ...prev.map((e) => `- Episodio ${e.n} «${e.title}»: ${e.summary}${e.cliffhanger ? ` Acabó así: ${e.cliffhanger}` : ''}${e.question ? ` Se preguntó: ${e.question}` : ''}`)
        ]
      : ['Es el primero: presenta a los protagonistas y el conflicto en pocos segundos y engancha.']),
    ...(b.vote ? [`La gente votó en los comentarios del episodio anterior: «${b.vote}». La historia sigue por ahí, y que se note en los primeros segundos.`] : []),
    b.n > 1 ? '- Empieza con un «previamente» de UNA frase (lo justo para quien llega nuevo) y entra enseguida en la acción.' : '',
    b.hasCast
      ? '- Los protagonistas son los personajes fijos: los mismos, con la misma ropa, en todos los episodios.'
      : film
        ? '- Inventa de 1 a 3 protagonistas con un aspecto muy reconocible (ropa, colores, rasgos) y que salgan iguales en todo el episodio: serán los mismos en los siguientes.'
        : '- "cast": inventa de 1 a 3 protagonistas y descríbelos en inglés («Nombre: edad aparente, cara, pelo, ropa exacta y colores, rasgos que lo distinguen», de 15 a 40 palabras cada uno). Se guarda y se repite igual en todos los episodios.',
    last
      ? '- Es el ÚLTIMO episodio: cierra la historia con un final que se recuerde y que responda a lo que quedó abierto. Sin pregunta para votar.'
      : '- Acaba en SUSPENSE: en el momento más tenso, sin resolverlo. La última frase de la voz es una pregunta para votar en los comentarios con dos opciones claras («¿Abre la puerta o huye? Comenta A o B»).',
    ...(film
      ? [
          '- Además de «Título: …» y la frase final, responde con tres líneas más: «Resumen: …» (qué pasa, en una o dos frases), «Suspense: …» (cómo queda) y «Pregunta: …» (la pregunta para votar, o vacía en el último).'
        ]
      : [
          `- "episode": {"summary": "qué pasa en este episodio, en una o dos frases", "cliffhanger": "cómo queda en suspense"${last ? '' : ', "question": "la pregunta para votar, con sus dos opciones"'}}. En "outro", ${last ? 'el cierre de la serie' : 'la pregunta corta para votar («Comenta A o B»)'}.`
        ])
  ].filter((l) => l !== '')
}

/** El resumen del episodio que el agente de película pone en su respuesta («Resumen: …», «Suspense: …», «Pregunta: …»). */
export function episodeFromFilmReply(text: string): { summary: string; cliffhanger?: string; question?: string } {
  const line = (re: RegExp): string => (re.exec(text)?.[1] ?? '').trim().slice(0, 500)
  const summary = line(/^\s*(?:resumen|summary)\s*:\s*(.+)$/im)
  const cliffhanger = line(/^\s*(?:suspense|cliffhanger|gancho final)\s*:\s*(.+)$/im)
  const question = line(/^\s*(?:pregunta|question)\s*:\s*(.+)$/im)
  return { summary, ...(cliffhanger ? { cliffhanger } : {}), ...(question ? { question } : {}) }
}
