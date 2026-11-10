// Lo que se elige al escribir «/video»: el tipo de vídeo, el personaje y el estilo de animación. El selector lo pone
// en el texto como marcas («tipo:mixto personaje:robots-kywai estilo:watercolor»), así vale igual escribiéndolo a mano,
// desde la web, desde Órbita o en una rutina. Sin marca: rápido, sin personaje y con el estilo de kywai.
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
}

const TAG = (name: string): RegExp => new RegExp(`(^|\\s)${name}:([a-z0-9-]+)(?=\\s|$)`, 'i')
const KIND_TAG = TAG('tipo')
const CHAR_TAG = TAG('personaje')
const STYLE_TAG = TAG('estilo')

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
  return { kind, character, style }
}

/** Quita las marcas del texto, cada una con su espacio de delante (así no quedan espacios de más). */
export function stripVideoTags(text: string): string {
  let out = text
  for (const re of [KIND_TAG, CHAR_TAG, STYLE_TAG]) {
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
    choice.style ? `estilo:${choice.style}` : ''
  ].filter(Boolean)
  return `${m[1]} ${tags.map((t) => `${t} `).join('')}${rest}`
}
