/**
 * Spotifast (https://spotifast.rocks, código abierto con licencia MIT) es una app de escritorio para escuchar Spotify
 * con Premium. kywai no la lleva dentro ni reproduce nada de Spotify: solo la maneja desde fuera con las órdenes que
 * la propia Spotifast trae para eso («spotifast play-pause», «spotifast now-playing --raw»…), en el equipo donde
 * corre kywai. La instala y la configura cada persona.
 */

export const SPOTIFAST_DOWNLOAD = 'https://spotifast.rocks/download/'
export const SPOTIFAST_GUIDE = 'https://spotifast.rocks/getting-started/'

export type SpotifastSearchKind = 'track' | 'album' | 'artist' | 'playlist'

/** Lo que kywai le pide a Spotifast. */
export type SpotifastAction =
  | { kind: 'status' }
  | { kind: 'open' }
  | { kind: 'playpause' }
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'seekTo'; seconds: number }
  | { kind: 'volume'; percent: number }
  | { kind: 'search'; query: string; type?: SpotifastSearchKind }
  | { kind: 'link'; link: string }

/** Lo que está sonando en Spotifast (o por qué no). */
export interface SpotifastStatus {
  /** Está instalada en el equipo donde corre kywai. */
  installed: boolean
  /** Está abierta (responde a sus órdenes). */
  running: boolean
  state: 'playing' | 'paused' | 'stopped'
  title?: string
  artists?: string
  album?: string
  positionMs?: number
  durationMs?: number
  volume?: number
  art?: string
  /** Dónde suena (este equipo o un altavoz de Spotify Connect). */
  device?: string
}

const CONTROL = /[\u0000-\u001f\u007f]/

/**
 * Lo que devuelve «spotifast now-playing --raw»: campos separados por tabuladores (estado, título, artistas, álbum,
 * posición en ms, duración en ms, volumen, aleatorio, repetir, carátula, guardada, dispositivo), o «stopped».
 */
export function parseNowPlaying(raw: string): Omit<SpotifastStatus, 'installed' | 'running'> {
  const line = raw.split(/\r?\n/)[0]?.trim() ?? ''
  const f = line.split('\t')
  const state = f[0] === 'playing' || f[0] === 'paused' ? f[0] : 'stopped'
  if (state === 'stopped') return { state }
  const num = (v: string | undefined): number | undefined => {
    const n = Number(v)
    return v != null && v !== '' && Number.isFinite(n) && n >= 0 ? n : undefined
  }
  const text = (v: string | undefined): string | undefined => (v && v.trim() ? v.trim() : undefined)
  const art = text(f[9])
  return {
    state,
    title: text(f[1]),
    artists: text(f[2]),
    album: text(f[3]),
    positionMs: num(f[4]),
    durationMs: num(f[5]),
    volume: num(f[6]),
    art: art && /^https:\/\//i.test(art) ? art : undefined,
    device: text(f[11])
  }
}

/**
 * Un enlace de Spotify («https://open.spotify.com/intl-es/track/…?si=…») o una URI («spotify:playlist:…») → la URI
 * que entiende «spotifast play-uri». null si no es de Spotify.
 */
export function spotifyUriOf(link: string): string | null {
  const text = link.trim()
  const uri = /^spotify:(track|album|playlist|artist|show|episode):([A-Za-z0-9]{10,40})$/.exec(text)
  if (uri) return `spotify:${uri[1]}:${uri[2]}`
  const web = /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]{10,40})(?:[/?#].*)?$/i.exec(text)
  return web ? `spotify:${web[1].toLowerCase()}:${web[2]}` : null
}

/** Palabras para «spotifast play-search» (sin caracteres de control y como mucho 200 letras). */
export function cleanSearch(query: unknown): string | null {
  if (typeof query !== 'string') return null
  const text = query.replace(/\s+/g, ' ').trim()
  if (!text || text.length > 200 || CONTROL.test(text)) return null
  return text
}

/** La acción que llega por IPC o por la web, comprobada (null si no vale). */
export function checkAction(input: unknown): SpotifastAction | null {
  if (!input || typeof input !== 'object') return null
  const a = input as Record<string, unknown>
  switch (a.kind) {
    case 'status':
    case 'open':
    case 'playpause':
    case 'next':
    case 'previous':
      return { kind: a.kind }
    case 'seekTo': {
      const s = Number(a.seconds)
      return Number.isFinite(s) && s >= 0 && s < 24 * 3600 ? { kind: 'seekTo', seconds: Math.floor(s) } : null
    }
    case 'volume': {
      const p = Number(a.percent)
      return Number.isFinite(p) ? { kind: 'volume', percent: Math.min(100, Math.max(0, Math.round(p))) } : null
    }
    case 'search': {
      const query = cleanSearch(a.query)
      const type = a.type === 'album' || a.type === 'artist' || a.type === 'playlist' ? a.type : 'track'
      return query ? { kind: 'search', query, type } : null
    }
    case 'link': {
      const uri = typeof a.link === 'string' ? spotifyUriOf(a.link) : null
      return uri ? { kind: 'link', link: uri } : null
    }
    default:
      return null
  }
}

/** Los argumentos de la orden de Spotifast para cada acción (sin pasar por ninguna shell). */
export function spotifastArgs(action: SpotifastAction): string[] | null {
  switch (action.kind) {
    case 'status':
      return ['now-playing', '--raw']
    case 'playpause':
      return ['play-pause']
    case 'next':
      return ['next']
    case 'previous':
      return ['previous']
    case 'seekTo':
      return ['seek-to', String(action.seconds)]
    case 'volume':
      return ['volume', String(action.percent)]
    case 'search':
      return ['play-search', '--kind', action.type ?? 'track', '--', ...action.query.split(' ')]
    case 'link':
      return ['play-uri', action.link]
    case 'open':
      return null
  }
}
