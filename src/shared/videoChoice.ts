// Lo que se elige al escribir «/video»: el tipo de vídeo, el personaje, el estilo de animación y la voz. El selector lo
// pone en el texto como marcas («tipo:mixto personaje:robots-kywai estilo:watercolor voz:gemini-puck»), así vale igual
// escribiéndolo a mano, desde la web, desde Órbita o en una rutina. Sin marca: rápido, sin personaje, con el estilo de
// kywai y la mejor voz que haya.
import { filmStyle, KYWAI_FILM } from './filmStyles'

/** rapido: texto animado con ritmo. presentador: un personaje dibujado lo explica. mixto: las dos cosas alternadas. */
export const VIDEO_KINDS = ['rapido', 'presentador', 'mixto'] as const
export type VideoKind = (typeof VIDEO_KINDS)[number]

/** El personaje de fábrica: Hermes, Claude y Codex. */
export const ROBOTS_CHARACTER = 'robots-kywai'
/** Sin personaje concreto (solo hace falta escribirlo con el estilo pintado a mano, que sin marca lleva los robots). */
export const NO_CHARACTER = 'ninguno'

export interface VideoChoice {
  kind: VideoKind
  /** Id del personaje (ROBOTS_CHARACTER o uno creado por el usuario); null: ninguno. */
  character: string | null
  /** Estilo de la biblioteca de películas; null: el estilo de kywai (el rápido). */
  style: string | null
  /** Voz («gemini-puck», «kokoro-ef_dora», «voicebox-<perfil>», «sistema»); null: la mejor que haya (automática). */
  voice?: string | null
}

/** Una voz elegida: el motor y la voz de ese motor. */
export type VoiceEngine = 'gemini' | 'kokoro' | 'voicebox' | 'sistema'

/** «gemini-puck» → { engine: 'gemini', id: 'Puck' }. null si no se entiende. */
export function parseVoiceId(v: string | null | undefined): { engine: VoiceEngine; id: string } | null {
  if (!v) return null
  if (v === 'sistema') return { engine: 'sistema', id: '' }
  const m = /^(gemini|kokoro|voicebox)-(.+)$/.exec(v)
  if (!m) return null
  if (m[1] === 'gemini') {
    const g = GEMINI_VOICES.find((x) => x.id.toLowerCase() === m[2].toLowerCase())
    return g ? { engine: 'gemini', id: g.id } : null
  }
  if (m[1] === 'kokoro') return KOKORO_VOICE_LIST.some((x) => x.id === m[2]) ? { engine: 'kokoro', id: m[2] } : null
  return { engine: 'voicebox', id: m[2] }
}

/** Voces de Gemini que ofrece el selector (de las 30 que tiene, las más claras para narrar), con su carácter. */
export const GEMINI_VOICES: { id: string; line: string; gender: 'f' | 'm' }[] = [
  { id: 'Puck', line: 'Alegre y cercana', gender: 'm' },
  { id: 'Fenrir', line: 'Con energía', gender: 'm' },
  { id: 'Charon', line: 'Informativa, de documental', gender: 'm' },
  { id: 'Orus', line: 'Firme y segura', gender: 'm' },
  { id: 'Enceladus', line: 'Suave, casi susurrada', gender: 'm' },
  { id: 'Achird', line: 'Amable', gender: 'm' },
  { id: 'Kore', line: 'Firme y clara', gender: 'f' },
  { id: 'Aoede', line: 'Fresca y natural', gender: 'f' },
  { id: 'Leda', line: 'Juvenil', gender: 'f' },
  { id: 'Zephyr', line: 'Brillante', gender: 'f' },
  { id: 'Sulafat', line: 'Cálida', gender: 'f' },
  { id: 'Gacrux', line: 'Madura y serena', gender: 'f' }
]

/** Voces de Kokoro (gratis, en el equipo) por idioma: las que mejor suenan de cada uno. */
export const KOKORO_VOICE_LIST: { id: string; name: string; lang: string; gender: 'f' | 'm' }[] = [
  { id: 'ef_dora', name: 'Dora', lang: 'es', gender: 'f' },
  { id: 'em_alex', name: 'Álex', lang: 'es', gender: 'm' },
  { id: 'em_santa', name: 'Santa', lang: 'es', gender: 'm' },
  { id: 'af_heart', name: 'Heart', lang: 'en', gender: 'f' },
  { id: 'af_bella', name: 'Bella', lang: 'en', gender: 'f' },
  { id: 'am_michael', name: 'Michael', lang: 'en', gender: 'm' },
  { id: 'bf_emma', name: 'Emma', lang: 'en', gender: 'f' },
  { id: 'bm_george', name: 'George', lang: 'en', gender: 'm' },
  { id: 'ff_siwis', name: 'Siwis', lang: 'fr', gender: 'f' },
  { id: 'if_sara', name: 'Sara', lang: 'it', gender: 'f' },
  { id: 'im_nicola', name: 'Nicola', lang: 'it', gender: 'm' },
  { id: 'pf_dora', name: 'Dora', lang: 'pt', gender: 'f' },
  { id: 'pm_alex', name: 'Alex', lang: 'pt', gender: 'm' },
  { id: 'jf_alpha', name: 'Alpha', lang: 'ja', gender: 'f' },
  { id: 'zf_xiaobei', name: 'Xiaobei', lang: 'zh', gender: 'f' },
  { id: 'hf_alpha', name: 'Alpha', lang: 'hi', gender: 'f' }
]

const TAG = (name: string): RegExp => new RegExp(`(^|\\s)${name}:([a-z0-9-]+)(?=\\s|$)`, 'i')
const KIND_TAG = TAG('tipo')
const CHAR_TAG = TAG('personaje')
const STYLE_TAG = TAG('estilo')
// Las voces de Kokoro llevan guion bajo («kokoro-ef_dora»).
const VOICE_TAG = /(^|\s)voz:([a-z0-9_-]+)(?=\s|$)/i

/** Id válido de personaje: minúsculas, números y guiones (lo genera kywai al guardarlo). */
export const CHARACTER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Lo marcado en el texto. «estilo:cartoon» y «estilo:dinamico» (las marcas de antes) valen como tipo. */
export function videoChoiceOf(text: string): VideoChoice {
  const k = KIND_TAG.exec(text)?.[2].toLowerCase()
  const s = STYLE_TAG.exec(text)?.[2].toLowerCase()
  const c = CHAR_TAG.exec(text)?.[2].toLowerCase()
  const kind: VideoKind = VIDEO_KINDS.includes(k as VideoKind) ? (k as VideoKind) : s === 'cartoon' ? 'presentador' : 'rapido'
  const style = s && filmStyle(s) ? s : null
  // El estilo pintado a mano lleva los robots salvo que se diga otro personaje (o «ninguno»).
  const character = c && c !== NO_CHARACTER && CHARACTER_ID.test(c) ? c : !c && style === KYWAI_FILM ? ROBOTS_CHARACTER : null
  const v = VOICE_TAG.exec(text)?.[2]
  const voice = v && parseVoiceId(v) ? v : null
  return { kind, character, style, voice }
}

/** Quita las marcas del texto, cada una con su espacio de delante (así no quedan espacios de más). */
export function stripVideoTags(text: string): string {
  let out = text
  for (const re of [KIND_TAG, CHAR_TAG, STYLE_TAG, VOICE_TAG]) {
    for (let i = 0; i < 3 && re.test(out); i++) out = out.replace(re, '')
  }
  return out
}

/** Pone (o cambia) las marcas justo detrás de «/video». Lo de por defecto no lleva marca. */
export function withVideoChoice(text: string, choice: VideoChoice): string {
  const m = /^(\s*\/v[ií]deo)(\s*)([\s\S]*)$/i.exec(stripVideoTags(text))
  if (!m) return text
  const rest = m[3].replace(/^\s+/, '')
  const tags = [
    choice.kind !== 'rapido' ? `tipo:${choice.kind}` : '',
    choice.character ? `personaje:${choice.character}` : choice.style === KYWAI_FILM ? `personaje:${NO_CHARACTER}` : '',
    choice.style ? `estilo:${choice.style}` : '',
    choice.voice ? `voz:${choice.voice}` : ''
  ].filter(Boolean)
  return `${m[1]} ${tags.map((t) => `${t} `).join('')}${rest}`
}
