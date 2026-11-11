// Lo que se elige al escribir «/video»: el tipo de vídeo, el personaje, el estilo de animación y la voz. El selector lo
// pone en el texto como marcas («tipo:mixto personaje:robots-kywai estilo:watercolor voz:gemini-puck»), así vale igual
// escribiéndolo a mano, desde la web, desde Órbita o en una rutina. Sin marca: rápido, sin personaje, con el estilo de
// kywai y la mejor voz que haya.
// Órbita las lee y escribe con su propia copia (VideoTags en android/.../ui/orbita/VideoPicker.kt): si cambian aquí, allí también.
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
  /** Diálogo: dos personajes que se contestan, cada uno con su voz («dialogo:si»). */
  dialogue?: boolean
}

/** Una voz elegida: el motor y la voz de ese motor. */
export type VoiceEngine = 'gemini' | 'kokoro' | 'voicebox' | 'sistema' | 'edge' | 'mac' | 'eleven'

/** «gemini-puck» → { engine: 'gemini', id: 'Puck' }. null si no se entiende. */
export function parseVoiceId(v: string | null | undefined): { engine: VoiceEngine; id: string } | null {
  if (!v) return null
  if (v === 'sistema') return { engine: 'sistema', id: '' }
  // ElevenLabs: el id de la voz de la cuenta, tal cual (distingue mayúsculas).
  const el = /^eleven-([A-Za-z0-9]{8,64})$/i.exec(v)
  if (el) return { engine: 'eleven', id: el[1] }
  const m = /^(gemini|kokoro|voicebox|edge|mac)-(.+)$/i.exec(v)
  if (!m) return null
  m[1] = m[1].toLowerCase()
  if (m[1] === 'edge') {
    const e = EDGE_VOICES.find((x) => x.id.toLowerCase() === m[2].toLowerCase())
    return e ? { engine: 'edge', id: e.id } : null
  }
  if (m[1] === 'mac') {
    const c = MAC_VOICES.find((x) => x.key === m[2].toLowerCase())
    return c ? { engine: 'mac', id: c.key } : null
  }
  if (m[1] === 'gemini') {
    const g = GEMINI_VOICES.find((x) => x.id.toLowerCase() === m[2].toLowerCase())
    return g ? { engine: 'gemini', id: g.id } : null
  }
  if (m[1] === 'kokoro') return KOKORO_VOICE_LIST.some((x) => x.id === m[2]) ? { engine: 'kokoro', id: m[2] } : null
  return { engine: 'voicebox', id: m[2] }
}

/** Voces neuronales de Microsoft Edge (edge-tts: gratis, con internet). */
export const EDGE_VOICES: { id: string; name: string; lang: string; region: string; gender: 'f' | 'm' }[] = [
  { id: 'es-ES-AlvaroNeural', name: 'Álvaro', lang: 'es', region: 'España', gender: 'm' },
  { id: 'es-MX-JorgeNeural', name: 'Jorge', lang: 'es', region: 'México', gender: 'm' },
  { id: 'en-US-AriaNeural', name: 'Aria', lang: 'en', region: 'Estados Unidos', gender: 'f' },
  { id: 'en-US-GuyNeural', name: 'Guy', lang: 'en', region: 'Estados Unidos', gender: 'm' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia', lang: 'en', region: 'Reino Unido', gender: 'f' },
  { id: 'en-GB-RyanNeural', name: 'Ryan', lang: 'en', region: 'Reino Unido', gender: 'm' }
]

/** Voces de macOS (AVSpeechSynthesizer): la de Siri hay que tenerla descargada en Ajustes del sistema. */
export const MAC_VOICES: { key: string; identifier: string; name: string; lang: string; region: string; gender: 'f' | 'm' }[] = [
  { key: 'carmen', identifier: 'com.apple.siri.natural.Carmen', name: 'Carmen', lang: 'es-MX', region: 'México', gender: 'f' }
]

/**
 * Las voces que se ofrecen en los vídeos de estos idiomas (las eligió el usuario de kywai escuchando muestras: 28 en
 * español, 60 en inglés). La primera va por defecto: sin marca «voz:», un vídeo en español sale con Álvaro y uno en
 * inglés con Bella. En los demás idiomas, todas las que haya y la automática.
 */
export const LANG_VOICES: Record<string, readonly string[]> = {
  es: ['edge-es-ES-AlvaroNeural', 'edge-es-MX-JorgeNeural', 'mac-carmen'],
  en: [
    'kokoro-af_bella',
    'kokoro-af_heart',
    'kokoro-af_nicole',
    'kokoro-af_sarah',
    'kokoro-am_adam',
    'kokoro-bf_isabella',
    'kokoro-bm_george',
    'edge-en-US-AriaNeural',
    'edge-en-US-GuyNeural',
    'edge-en-GB-SoniaNeural',
    'edge-en-GB-RyanNeural'
  ]
}

/** El idioma de una voz: el de su lista en LANG_VOICES o el de la propia voz (Kokoro, Edge, Siri). null si no se sabe. */
export function voiceLang(voice: string | null | undefined): string | null {
  if (!voice) return null
  for (const [l, ids] of Object.entries(LANG_VOICES)) if (ids.some((id) => id.toLowerCase() === voice.toLowerCase())) return l
  const v = parseVoiceId(voice)
  if (v?.engine === 'kokoro') return KOKORO_VOICE_LIST.find((x) => x.id === v.id)?.lang ?? null
  if (v?.engine === 'edge') return EDGE_VOICES.find((x) => x.id === v.id)?.lang ?? null
  if (v?.engine === 'mac') return MAC_VOICES.find((x) => x.key === v.id)?.lang.split('-')[0] ?? null
  return null
}

/**
 * En qué idioma sale un vídeo: el de la voz elegida (una voz inglesa → en inglés, una española → en español); sin ella,
 * el que diga el texto («en inglés», «in English»…); si no, el de la app.
 */
export function videoLang(voice: string | null | undefined, text: string, appLang: string): string {
  const fromVoice = voiceLang(voice)
  if (fromVoice) return fromVoice
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\b(en|in)\s+ingles\b|\bin english\b|\benglish (version|video)\b/.test(t)) return 'en'
  if (/\b(en|in)\s+espanol\b|\bin spanish\b|\bspanish (version|video)\b/.test(t)) return 'es'
  return appLang
}

/** La voz por defecto de un idioma con voces elegidas (null: la automática). */
export const defaultVoiceFor = (lang: string): string | null => LANG_VOICES[lang]?.[0] ?? null

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
  { id: 'af_nicole', name: 'Nicole', lang: 'en', gender: 'f' },
  { id: 'af_sarah', name: 'Sarah', lang: 'en', gender: 'f' },
  { id: 'am_adam', name: 'Adam', lang: 'en', gender: 'm' },
  { id: 'am_michael', name: 'Michael', lang: 'en', gender: 'm' },
  { id: 'bf_emma', name: 'Emma', lang: 'en', gender: 'f' },
  { id: 'bf_isabella', name: 'Isabella', lang: 'en', gender: 'f' },
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
const DIALOGUE_TAG = /(^|\s)di[aá]logo:(si|sí|yes)(?=\s|$)/i

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
  return { kind, character, style, voice, ...(DIALOGUE_TAG.test(text) ? { dialogue: true } : {}) }
}

/** Quita las marcas del texto, cada una con su espacio de delante (así no quedan espacios de más). */
export function stripVideoTags(text: string): string {
  let out = text
  for (const re of [KIND_TAG, CHAR_TAG, STYLE_TAG, VOICE_TAG, DIALOGUE_TAG]) {
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
    choice.voice ? `voz:${choice.voice}` : '',
    choice.dialogue ? 'dialogo:si' : ''
  ].filter(Boolean)
  return `${m[1]} ${tags.map((t) => `${t} `).join('')}${rest}`
}

/** Género de una voz (para darle a cada personaje de un diálogo una que le pegue). null si no se sabe. */
export function voiceGender(voice: string | null | undefined): 'f' | 'm' | null {
  const v = parseVoiceId(voice)
  if (!v) return null
  if (v.engine === 'edge') return EDGE_VOICES.find((x) => x.id === v.id)?.gender ?? null
  if (v.engine === 'mac') return MAC_VOICES.find((x) => x.key === v.id)?.gender ?? null
  if (v.engine === 'kokoro') return KOKORO_VOICE_LIST.find((x) => x.id === v.id)?.gender ?? null
  if (v.engine === 'gemini') return GEMINI_VOICES.find((x) => x.id === v.id)?.gender ?? null
  return null
}

/**
 * Las voces de los personajes de un diálogo. La elegida (o la de por defecto del idioma) es para el primer personaje de
 * su mismo género; el otro lleva otra voz del idioma, de su género si la hay (de las elegidas del idioma; si no, de
 * Kokoro). Las de macOS solo cuentan en un Mac. null: la voz que salga (la misma para los dos).
 */
export function speakerVoices(lang: string, chosen: string | null, speakers: { name: string; gender?: 'f' | 'm' }[], opts: { mac: boolean }): Record<string, string | null> {
  const first = chosen ?? defaultVoiceFor(lang)
  const out: Record<string, string | null> = {}
  if (!speakers.length) return out
  const g = voiceGender(first)
  const lead = speakers.find((s) => !g || !s.gender || s.gender === g) ?? speakers[0]
  out[lead.name] = first
  const usable = (id: string): boolean => parseVoiceId(id)?.engine !== 'mac' || opts.mac
  const pool = (LANG_VOICES[lang] ?? KOKORO_VOICE_LIST.filter((k) => k.lang === lang).map((k) => `kokoro-${k.id}`)).filter(usable)
  const taken = new Set([first])
  for (const s of speakers) {
    if (s.name === lead.name) continue
    const pick = pool.find((id) => !taken.has(id) && (!s.gender || voiceGender(id) === s.gender)) ?? pool.find((id) => !taken.has(id)) ?? first
    out[s.name] = pick
    if (pick) taken.add(pick)
  }
  return out
}
