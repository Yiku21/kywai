// Estudio de vídeo (parte sin efectos): el guion que escribe el agente, cómo se lee y se valida, y la composición
// HTML de HyperFrames que sale de él (escenas, rótulos, subtítulos, transiciones). El agente solo escribe el guion;
// voz, imágenes, música y montaje los hace kywai siempre igual (videoStudio.ts), para que el resultado no dependa de
// que el agente improvise.
import { takeFilmStyle } from '../shared/filmStyles'

export type VideoFormat = 'horizontal' | 'vertical'

export const VIDEO_THEMES = ['noche', 'amanecer', 'oceano', 'bosque', 'neon', 'papel'] as const
export type VideoTheme = (typeof VIDEO_THEMES)[number]

/** «dinamico»: texto grande al estilo TikTok. «cartoon»: un personaje dibujado que lo explica (tutoriales con humor). */
export const VIDEO_STYLES = ['dinamico', 'cartoon'] as const
export type VideoStyle = (typeof VIDEO_STYLES)[number]

/** Lo que hace el personaje del estilo cartoon en cada escena. */
export const CHARACTER_POSES = ['explain', 'point', 'surprised', 'laugh', 'shrug', 'thumbs', 'think', 'wave'] as const
export type CharacterPose = (typeof CHARACTER_POSES)[number]

export interface VideoScene {
  /** Rótulo grande en pantalla (pocas palabras). */
  heading: string
  /** Lo que dice la voz en esta escena. */
  narration: string
  /** Descripción de la imagen de fondo (para generarla). Vacía: fondo de diseño sin imagen. */
  image: string
  /** Estilo cartoon: gesto del personaje. */
  pose?: CharacterPose
  /** Estilo cartoon: número de paso del tutorial (0 o sin él: escena sin paso). */
  step?: number
  /** Estilo cartoon: escena de broma (el personaje se ríe y suena un «boing»). */
  joke?: boolean
  /** Estilo cartoon: de 1 a 3 planos de la ilustración del paso (general, de cerca, detalle). El primero es `image`. */
  shots?: string[]
  /** Animación de Manim (código Python con la clase `Escena`) que ocupa la escena en vez de la imagen. */
  manim?: string
}

/** Escenas con Manim como mucho (cada una tarda en renderizarse). */
export const MAX_MANIM = 3

export const MAX_SHOTS = 3

export interface VideoScript {
  title: string
  /** Código de idioma de la voz y los textos (es, en, pt, fr…). */
  lang: string
  theme: VideoTheme
  style: VideoStyle
  scenes: VideoScene[]
  /** Frase del cierre. */
  outro: string
}

export const MIN_SCENES = 3
export const MAX_SCENES = 10

const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''

/** El primer objeto JSON del texto (suelto o en un bloque ```json). */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidates = [fenced?.[1], text]
  for (const c of candidates) {
    if (!c) continue
    const start = c.indexOf('{')
    const end = c.lastIndexOf('}')
    if (start < 0 || end <= start) continue
    try {
      return JSON.parse(c.slice(start, end + 1))
    } catch {
      /* el siguiente */
    }
  }
  return null
}

/** Lee y valida el guion que devolvió el agente. Lanza un error con lo que falla (se le pide otra vez). */
export function parseVideoScript(text: string): VideoScript {
  const raw = extractJson(text) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') throw new Error('La respuesta no trae el guion en JSON.')
  const title = clean(raw.title, 90)
  if (!title) throw new Error('Al guion le falta «title».')
  const list = Array.isArray(raw.scenes) ? raw.scenes : []
  const scenes: VideoScene[] = []
  for (const s of list) {
    if (!s || typeof s !== 'object') continue
    const o = s as Record<string, unknown>
    const narration = clean(o.narration, 400)
    const heading = clean(o.heading, 60) || narration.split(' ').slice(0, 5).join(' ')
    if (!narration) continue
    const shots = (Array.isArray(o.shots) ? o.shots : []).map((x) => clean(x, 400)).filter(Boolean).slice(0, MAX_SHOTS)
    const scene: VideoScene = { heading, narration, image: shots[0] ?? clean(o.image, 400) }
    if (shots.length) scene.shots = shots
    if (CHARACTER_POSES.includes(o.pose as CharacterPose)) scene.pose = o.pose as CharacterPose
    const step = Number(o.step)
    if (Number.isInteger(step) && step > 0 && step < 100) scene.step = step
    if (o.joke === true) scene.joke = true
    const manim = typeof o.manim === 'string' ? o.manim.trim() : ''
    if (manim && manim.length <= 8000 && /class\s+Escena\s*\(/.test(manim) && scenes.filter((x) => x.manim).length < MAX_MANIM) scene.manim = manim
    scenes.push(scene)
  }
  if (scenes.length < MIN_SCENES) throw new Error(`El guion necesita al menos ${MIN_SCENES} escenas con «narration» (tiene ${scenes.length}).`)
  const theme = VIDEO_THEMES.includes(raw.theme as VideoTheme) ? (raw.theme as VideoTheme) : 'noche'
  const lang = (clean(raw.lang, 8).toLowerCase().match(/^[a-z]{2}/)?.[0] ?? 'es')
  const style = VIDEO_STYLES.includes(raw.style as VideoStyle) ? (raw.style as VideoStyle) : 'dinamico'
  return { title, lang, theme, style, scenes: scenes.slice(0, MAX_SCENES), outro: clean(raw.outro, 90) || title }
}

/** Encargo para el agente: solo el guion, en JSON. */
type PromptInput = { topic: string; source?: string; format: VideoFormat; lang: string; style?: VideoStyle; retry?: string; manim?: { latex: boolean } | null }

/** Reglas de Manim para el guion (solo si está instalado en el estudio). */
function manimRules(format: VideoFormat, manim: { latex: boolean }, cartoon = false): string[] {
  const frame = format === 'vertical' ? '4,5 de ancho × 8 de alto' : '14,2 de ancho × 8 de alto'
  return [
    `- "manim" (opcional, como mucho en ${MAX_MANIM} escenas): SOLO cuando una fórmula, una gráfica, un diagrama, una geometría o un proceso se entiende mejor animado. Es código Python de Manim Community con \`from manim import *\` y una clase \`class Escena(Scene)\`; kywai lo renderiza a pantalla completa en esa escena, con el fondo del tema, en lugar de la imagen. Que dure lo que la narración (de 3 a 8 s: usa run_time y self.wait). El cuadro mide ${frame} unidades: que ocupe casi todo el ancho, centrado y en la mitad de arriba (abajo van los subtítulos${cartoon ? '; arriba a la izquierda va el número de paso y abajo a la izquierda el personaje' : ''}). Colores claros y vivos (YELLOW, TEAL, WHITE…). ${manim.latex ? 'Para fórmulas, MathTex.' : 'Usa Text para todo el texto y las fórmulas (sin MathTex ni Tex: no hay LaTeX en este equipo).'} Sin leer ni escribir archivos, sin red y sin imágenes externas. Pon también la imagen de la escena por si la animación falla.`
  ]
}

export function videoScriptPrompt(input: PromptInput): string {
  if (input.style === 'cartoon') return cartoonScriptPrompt(input)
  const seconds = input.format === 'vertical' ? '30 a 45' : '40 a 70'
  return [
    'Escribe el guion de un vídeo corto. kywai pondrá la voz, las imágenes, la música, las animaciones y el montaje: tú solo escribes el guion.',
    '',
    `Tema: ${input.topic}`,
    ...(input.source ? ['', 'El vídeo trata de este mensaje (resúmelo y cuéntalo bien, sin copiarlo entero):', '"""', input.source.slice(0, 6000), '"""'] : []),
    '',
    `Formato: ${input.format === 'vertical' ? 'vertical 9:16 (TikTok, Reels, Shorts)' : 'horizontal 16:9 (YouTube)'}; duración total de ${seconds} segundos.`,
    `Idioma de la voz y los textos: ${input.lang}.`,
    '',
    'Reglas:',
    `- Entre ${MIN_SCENES + 2} y ${MAX_SCENES - 1} escenas cortas y con ritmo, para gente con poca paciencia. La primera es un gancho que obliga a seguir mirando (una pregunta, un dato sorprendente o una promesa) en menos de 3 segundos; cada escena aporta algo nuevo; la última cierra con una idea clara.`,
    '- "narration": lo que dice la voz, UNA frase corta y directa por escena (de 8 a 20 palabras), como habla un buen creador de TikTok. Sin emojis, sin listas, sin siglas raras: se lee en voz alta. Marca con *asteriscos* la palabra o las dos palabras clave de cada frase (salen resaltadas en pantalla).',
    '- "heading": la etiqueta de la escena, de 1 a 3 palabras.',
    '- "image": la imagen de fondo de la escena, descrita en inglés en una frase concreta (sujeto, ambiente, luz). Sin texto, letras ni logotipos en la imagen.',
    `- "theme": uno de ${VIDEO_THEMES.map((t) => `"${t}"`).join(', ')}, el que mejor le vaya al tema.`,
    '- "outro": frase final corta para la última pantalla.',
    ...(input.manim ? manimRules(input.format, input.manim) : []),
    '- Si el tema necesita datos actuales, compruébalos antes; no inventes cifras.',
    '- No crees ni cambies archivos: responde solo con el JSON.',
    ...(input.retry ? ['', `Tu respuesta anterior no valía: ${input.retry}`] : []),
    '',
    'Responde SOLO con este JSON, sin nada antes ni después:',
    '{"title": "…", "lang": "' + input.lang + '", "theme": "noche", "scenes": [{"heading": "…", "narration": "…", "image": "…"}], "outro": "…"}'
  ].join('\n')
}

/** Encargo del estilo cartoon: un tutorial que explica un personaje, con pasos claros y alguna broma. */
function cartoonScriptPrompt(input: PromptInput): string {
  const seconds = input.format === 'vertical' ? '40 a 70' : '50 a 100'
  return [
    'Escribe el guion de un vídeo de dibujos animados en el que un personaje cartoon (un presentador simpático con gafas) lo explica todo hablando a cámara. kywai dibuja y anima al personaje, pone la voz, las ilustraciones, la música y el montaje: tú solo escribes el guion.',
    '',
    `Tema: ${input.topic}`,
    ...(input.source ? ['', 'El vídeo trata de este mensaje (explícalo bien, sin copiarlo entero):', ', input.source.slice(0, 6000), '] : []),
    '',
    `Formato: ${input.format === 'vertical' ? 'vertical 9:16 (TikTok, Reels, Shorts)' : 'horizontal 16:9 (YouTube)'}; duración total de ${seconds} segundos.`,
    `Idioma de la voz y los textos: ${input.lang}.`,
    '',
    'Reglas:',
    `- Entre ${MIN_SCENES + 3} y ${MAX_SCENES} escenas. La primera es un gancho con gracia (el personaje saluda y promete algo en menos de 4 segundos). Si es un tutorial, después van los pasos EN ORDEN, completos y correctos (con los avisos de seguridad que hagan falta), y al final un resumen corto.`,
    '- "narration": lo que dice el personaje en primera persona, como un youtuber cercano: una o dos frases cortas (como mucho 30 palabras). Sin emojis ni listas: se lee en voz alta. Marca con *asteriscos* la palabra clave de cada frase.',
    '- Humor: en 2 o 3 escenas mete una broma corta y blanca (una exageración, una comparación absurda, un despiste del personaje) y marca esas escenas con "joke": true. Las bromas nunca sustituyen a la instrucción: el paso tiene que quedar claro igual.',
    '- "step": el número del paso (1, 2, 3…) en las escenas que son un paso; 0 en el gancho, las bromas sueltas y el resumen.',
    '- "heading": lo que se ve escrito en la ilustración: la instrucción en 2 a 5 palabras («Desenchufa el PC», «Abre las pestañas»).',
    `- "pose": el gesto del personaje, uno de ${CHARACTER_POSES.map((p) => `"${p}"`).join(', ')} (explain: explica; point: señala la ilustración; surprised: se sorprende; laugh: se ríe; shrug: se encoge de hombros; thumbs: pulgar arriba; think: piensa; wave: saluda). Varíalos y que encajen con lo que dice; "point" cuando hay que mirar algo concreto.`,
    '- Es un tutorial VISUAL: lo importante es lo que se ve. "shots": de 1 a 3 ilustraciones de la escena, descritas en inglés, cada una en una frase concreta: en un paso, primero el plano general (dónde estamos) y después el primer plano de la acción exacta (manos, piezas, la pestaña, la muesca…) y, si ayuda, el detalle o el resultado. Lo importante de cada plano, en el CENTRO de la imagen (ahí se pone el círculo de «mira aquí»). Sin personas de cuerpo entero ni caras, sin texto, letras ni logotipos. En el gancho, las bromas y el resumen basta con 1.',
    `- "theme": uno de ${VIDEO_THEMES.map((t) => `"${t}"`).join(', ')}; para dibujos van mejor "papel", "amanecer" u "oceano".`,
    '- "outro": frase final corta y con gracia.',
    ...(input.manim ? manimRules(input.format, input.manim, true) : []),
    '- Si el tema necesita datos actuales o técnicos, compruébalos antes; no inventes.',
    '- No crees ni cambies archivos: responde solo con el JSON.',
    ...(input.retry ? ['', `Tu respuesta anterior no valía: ${input.retry}`] : []),
    '',
    'Responde SOLO con este JSON, sin nada antes ni después:',
    '{"title": "…", "lang": "' + input.lang + '", "style": "cartoon", "theme": "papel", "scenes": [{"heading": "…", "narration": "…", "shots": ["…", "…"], "pose": "point", "step": 1, "joke": false}], "outro": "…"}'
  ].join('\n')
}

// ---------- petición del usuario ----------

export interface VideoRequest {
  topic: string
  format: VideoFormat
  /** «de esto», «de este mensaje»: el vídeo es del mensaje anterior del chat. */
  fromPrevious: boolean
  style: VideoStyle
  /** Estilo de película de la biblioteca (src/shared/filmStyles.ts): lo dirige y renderiza un agente con herramientas. */
  film?: string
}

/** Piden dibujos con personaje: «estilo cartoon», «dibujos animados», «un personaje que lo explique», «tutorial»… */
const CARTOON_RE = /\b(cartoons?|caricaturas?|dibujos?(?:\s+animados?)?|animaci[oó]n\s+2d|personajes?|mu[ñn]ecos?|presentador(?:a)?|tutorial(?:es)?|una persona explicando|alguien explicando|animated character|explainer)\b/i

const VERTICAL_RE = /\b(vertical|tiktok|reels?|shorts?|9:16|historia de instagram)\b/i
const HORIZONTAL_RE = /\b(horizontal|youtube|16:9|apaisado)\b/i
const PREVIOUS_RE = /^(de |sobre )?(esto|eso|este mensaje|ese mensaje|el mensaje anterior|lo anterior|lo de arriba|this|that|this message)[\s.!]*$/i

function formatOf(text: string): VideoFormat {
  if (VERTICAL_RE.test(text)) return 'vertical'
  if (HORIZONTAL_RE.test(text)) return 'horizontal'
  return 'horizontal'
}

/**
 * ¿Es una petición de vídeo? «/video tema», «/video vertical tema», «créame un vídeo de X», «hazme un vídeo sobre X»,
 * «make a video about X». Devuelve null si no lo es.
 */
export function parseVideoRequest(text: string): VideoRequest | null {
  const t = text.trim()
  const cmd = /^\/(?:video|vídeo)(?:\s+([\s\S]*))?$/i.exec(t)
  let topic: string | null = null
  if (cmd) topic = (cmd[1] ?? '').trim()
  else {
    const m =
      /^(?:por favor,?\s*)?(?:cr[eé]a(?:me)?|hazme|haz(?:me)?|gen[eé]ra(?:me)?|prep[aá]ra(?:me)?|m[oó]nta(?:me)?|quiero|me haces|puedes hacerme|puedes crearme)\s+(?:un|otro)\s+v[ií]deo\b(?:\s+(?:corto|breve|nuevo))?\s*(?:(?:de|sobre|acerca de|con|para explicar|que explique)\s+)?([\s\S]*)$/i.exec(t) ||
      /^(?:please\s+)?(?:make|create|generate)(?:\s+me)?\s+an?\s+(?:short\s+)?video\s*(?:(?:about|of|on|for)\s+)?([\s\S]*)$/i.exec(t)
    if (!m) return null
    topic = m[1].trim()
  }
  const format = formatOf(t)
  // «estilo:cartoon» / «estilo:dinamico»: lo pone el selector de estilos para los dos rápidos.
  const quick = /(^|\s)estilo:(cartoon|dinamico)(?=\s|$)/i.exec(topic)
  if (quick) topic = (topic.slice(0, quick.index) + quick[1] + topic.slice(quick.index + quick[0].length)).replace(/\s{2,}/g, ' ').trim()
  // «estilo acuarela sobre…», «estilo:pixel-rpg …»: un estilo de la biblioteca de películas.
  const film = takeFilmStyle(topic)
  if (film) topic = film.rest
  // Quita del tema lo que solo dice el formato («vertical para TikTok de…»).
  const stripped = topic
    .replace(/^(?:(?:en\s+)?(?:formato\s+)?(?:vertical|horizontal)|para\s+(?:tiktok|reels?|shorts?|youtube))[\s,:]*(?:(?:de|sobre)\s+)?/i, '')
    .replace(/[\s,]+(?:en\s+)?(?:formato\s+)?(?:vertical|horizontal)\s*$/i, '')
    .replace(/[\s,]+para\s+(?:tiktok|reels?|shorts?|youtube)\s*$/i, '')
    .trim()
  if (film) {
    const rest = stripped.replace(/^(?:(?:de|sobre|con|para|acerca de)\s+)/i, '').trim()
    const prev = !rest || PREVIOUS_RE.test(rest)
    return { topic: prev ? '' : rest, format, fromPrevious: prev, style: 'dinamico', film: film.style.slug }
  }
  // «estilo cartoon de…», «de dibujos animados sobre…»: el estilo no es parte del tema.
  const style: VideoStyle = quick ? (quick[2].toLowerCase() as VideoStyle) : CARTOON_RE.test(t) ? 'cartoon' : 'dinamico'
  const bare = stripped
    .replace(/^(?:(?:al?|en|con|de)\s+)?(?:estilo|tipo|formato)?\s*(?:cartoon|caricatura|dibujos?(?:\s+animados?)?|animado|tutorial)\s*(?:(?:de|sobre|con|para)\s+)?/i, '')
    .trim()
  const fromPrevious = !bare || PREVIOUS_RE.test(bare)
  return { topic: fromPrevious ? '' : bare, format, fromPrevious, style }
}

// ---------- composición ----------

export interface SceneTiming {
  start: number
  duration: number
  /** Duración de su voz. */
  voice: number
}

export interface VideoTimeline {
  intro: number
  scenes: SceneTiming[]
  outroStart: number
  outro: number
  total: number
}

export const INTRO_S = 2.2
export const OUTRO_S = 2.8
const SCENE_PAD_S = 0.45
/** La voz de cada escena empieza este rato después del corte. */
export const VOICE_LEAD_S = 0.3

export function buildTimeline(voiceDurations: number[]): VideoTimeline {
  let at = INTRO_S
  const scenes = voiceDurations.map((v) => {
    const duration = Math.max(2.2, VOICE_LEAD_S + v + SCENE_PAD_S)
    const s = { start: round(at), duration: round(duration), voice: round(v) }
    at += duration
    return s
  })
  return { intro: INTRO_S, scenes, outroStart: round(at), outro: OUTRO_S, total: round(at + OUTRO_S) }
}

export const round = (n: number): number => Math.round(n * 100) / 100

/** Lo que lee la voz: sin los asteriscos que marcan las palabras clave. */
export function spokenText(narration: string): string {
  return narration.replace(/\*+([^*]+)\*+/g, '$1').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
}

export interface TimedWord {
  text: string
  start: number
  /** Palabra clave (*así* en el guion): sale resaltada. */
  key: boolean
}

/**
 * Cada palabra con su momento dentro de la voz, repartidas por longitud y con más pausa tras comas y puntos (Kokoro
 * habla a ritmo constante, así que el reparto cae muy cerca de lo que se oye).
 */
export function timedWords(narration: string, start: number, voice: number): TimedWord[] {
  const raw = narration.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  let open = false
  const words = raw.map((w) => {
    const opens = w.startsWith('*')
    const closes = /\*[.,;:!?…»"')]*$/.test(w)
    const key = open || opens
    if (opens && !closes) open = true
    if (closes) open = false
    return { text: w.replace(/\*/g, ''), key }
  }).filter((w) => w.text)
  const weight = (w: string): number => w.length + 2 + (/[.!?…]$/.test(w) ? 6 : /[,;:]$/.test(w) ? 3 : 0)
  const total = words.reduce((a, w) => a + weight(w.text), 0) || 1
  let at = start
  return words.map((w) => {
    const out = { text: w.text, start: round(at), key: w.key }
    at += (voice * weight(w.text)) / total
    return out
  })
}

/** Golpes de pantalla: grupos de hasta 4 palabras que cortan en cada pausa (una sola palabra también golpea). */
export function beatsOf(words: TimedWord[]): TimedWord[][] {
  const beats: TimedWord[][] = []
  let cur: TimedWord[] = []
  for (const w of words) {
    cur.push(w)
    const pause = /[.,;:!?…]$/.test(w.text)
    const long = cur.map((x) => x.text).join(' ').length
    if (cur.length >= 4 || long >= 22 || pause) {
      beats.push(cur)
      cur = []
    }
  }
  if (cur.length) {
    if (cur.length === 1 && beats.length && beats[beats.length - 1].length < 4) beats[beats.length - 1].push(...cur)
    else beats.push(cur)
  }
  return beats
}

/** Compatibilidad: trozos de subtítulo (texto, inicio, duración). */
export function captionChunks(text: string, start: number, voice: number): { text: string; start: number; duration: number }[] {
  const beats = beatsOf(timedWords(text, start, voice))
  const end = start + voice
  return beats.map((b, i) => {
    const s = b[0].start
    const e = i + 1 < beats.length ? beats[i + 1][0].start : end
    return { text: b.map((w) => w.text).join(' '), start: s, duration: round(e - s) }
  })
}

export const THEMES: Record<VideoTheme, { bg: string; bg2: string; ink: string; accent: string; accent2: string; onAccent: string; font: string }> = {
  noche: { bg: '#0b1020', bg2: '#1f2a66', ink: '#ffffff', accent: '#ffd23f', accent2: '#5b8cff', onAccent: '#111111', font: 'sans' },
  amanecer: { bg: '#2a0f2e', bg2: '#ff6b4a', ink: '#ffffff', accent: '#ffd166', accent2: '#ff4d8d', onAccent: '#1a0b12', font: 'sans' },
  oceano: { bg: '#03263f', bg2: '#0a7fa8', ink: '#ffffff', accent: '#3dffd0', accent2: '#ffd166', onAccent: '#032030', font: 'sans' },
  bosque: { bg: '#0d1f15', bg2: '#2f6b3f', ink: '#fbfff4', accent: '#c6ff5e', accent2: '#ffb84d', onAccent: '#0d1f15', font: 'sans' },
  neon: { bg: '#07060f', bg2: '#2a0f57', ink: '#ffffff', accent: '#00f0ff', accent2: '#ff2bd6', onAccent: '#07060f', font: 'sans' },
  papel: { bg: '#f6f0e4', bg2: '#ffd9b8', ink: '#141210', accent: '#ff5a1f', accent2: '#1c7ed6', onAccent: '#ffffff', font: 'sans' }
}

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Números pseudoaleatorios deterministas (el render salta de fotograma en fotograma: nada de Math.random). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export interface CompositionInput {
  script: VideoScript
  format: VideoFormat
  timeline: VideoTimeline
  /** Imagen de cada escena (ruta relativa a la carpeta del vídeo) o null. */
  images: (string | null)[]
  /** Estilo cartoon: las imágenes de cada plano de cada escena (si no, una por escena: `images`). */
  shots?: (string | null)[][]
  /** Animación de Manim de cada escena (MP4 relativo, ya con la duración de la escena) o null. */
  clips?: (string | null)[]
  /** Pista de audio ya mezclada (relativa). */
  audio: string
  /** Ruta relativa de gsap.min.js. */
  gsap: string
}

export type SfxKind = 'whoosh' | 'pop' | 'impact' | 'riser' | 'boing'

export interface Composition {
  html: string
  /** Efectos de sonido en su momento (se mezclan con la música). */
  sfx: { at: number; kind: SfxKind }[]
}

const TRANSITIONS = ['zoom', 'stripes', 'iris', 'glitch'] as const
const BEAT_IN = ['pop', 'up', 'tilt', 'side', 'drop'] as const

/**
 * La composición entera en un HTML (HyperFrames), pensada para enganchar: portada que golpea palabra a palabra, la
 * narración a pantalla grande en golpes de 2 a 4 palabras que entran saltando (cada uno distinto) con la palabra que
 * suena resaltada, golpes de cámara en cada cambio, sacudidas, fondo siempre en movimiento (imagen con zoom rápido o
 * formas, anillos y partículas), etiqueta de escena que rebota, cuatro tipos de transición y cierre. Todo determinista.
 */
export function buildComposition(input: CompositionInput): Composition {
  const { script, format, timeline: tl, images } = input
  const vertical = format === 'vertical'
  const W = vertical ? 1080 : 1920
  const H = vertical ? 1920 : 1080
  const th = THEMES[script.theme]
  const font = "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif"
  const html: string[] = []
  const a: string[] = []
  const sfx: Composition['sfx'] = []
  const clipHtml: string[] = []
  const r = rng(script.title.length * 7919 + script.scenes.length)
  const R = (n: number): number => round(n)

  // Fondo vivo durante todo el vídeo: manchas de color que se mueven, un anillo que gira y partículas que suben.
  const parts: string[] = []
  for (let i = 0; i < 18; i++) {
    const size = 6 + Math.round(r() * 16)
    parts.push(`<i class="pt" id="pt${i}" style="left:${Math.round(r() * W)}px;top:${Math.round(r() * H)}px;width:${size}px;height:${size}px;opacity:${(0.25 + r() * 0.5).toFixed(2)}"></i>`)
    a.push(`tl.fromTo('#pt${i}', {y: 0, x: 0}, {y: -${Math.round(H * (0.4 + r() * 0.6))}, x: ${Math.round((r() - 0.5) * 300)}, duration: ${tl.total}, ease: 'none'}, 0)`)
  }
  html.push(`<div id="bglife"><div class="blob b1"></div><div class="blob b2"></div><div class="ring"></div>${parts.join('')}</div>`)
  a.push(
    `tl.fromTo('#bglife .b1', {x: -200, y: -100, scale: 1}, {x: 260, y: 160, scale: 1.3, duration: ${tl.total}, ease: 'sine.inOut'}, 0)`,
    `tl.fromTo('#bglife .b2', {x: 200, y: 120, scale: 1.2}, {x: -240, y: -140, scale: 0.9, duration: ${tl.total}, ease: 'sine.inOut'}, 0)`,
    `tl.fromTo('#bglife .ring', {rotation: 0}, {rotation: ${Math.round(tl.total * 18)}, duration: ${tl.total}, ease: 'none'}, 0)`
  )

  // Portada: el título golpea palabra a palabra con sacudida.
  const titleWords = script.title.split(/\s+/).filter(Boolean)
  const slam = Math.min(0.28, 1.3 / Math.max(1, titleWords.length))
  html.push(`<section id="intro" class="clip scene" data-start="0" data-duration="${R(tl.intro + 0.3)}">
  <div class="burst"></div><div class="burst bb"></div>
  <h1 class="title">${titleWords.map((w, i) => `<span class="tw" id="tw${i}">${esc(w)}</span>`).join(' ')}</h1>
</section>`)
  titleWords.forEach((_, i) => {
    const at = R(0.15 + i * slam)
    a.push(`tl.fromTo('#tw${i}', {scale: 3.2, opacity: 0, rotation: ${i % 2 ? 8 : -8}}, {scale: 1, opacity: 1, rotation: 0, duration: 0.22, ease: 'power4.in'}, ${at})`)
    a.push(`tl.fromTo('#shake', {x: ${i % 2 ? 14 : -14}, y: ${i % 2 ? -8 : 8}}, {x: 0, y: 0, duration: 0.25, ease: 'elastic.out(1.2, 0.3)', immediateRender: false}, ${R(at + 0.22)})`)
    sfx.push({ at: R(at + 0.2), kind: 'impact' })
  })
  a.push(
    `tl.fromTo('#intro .burst', {scale: 0.2, opacity: 0.9}, {scale: 3, opacity: 0, duration: 1.1, ease: 'power2.out'}, 0.35)`,
    `tl.fromTo('#intro .bb', {scale: 0.2, opacity: 0.8}, {scale: 3.6, opacity: 0, duration: 1.3, ease: 'power2.out'}, ${R(0.15 + titleWords.length * slam)})`,
    `tl.to('#intro .title', {scale: 1.08, duration: ${R(tl.intro)}, ease: 'none'}, ${R(0.15 + titleWords.length * slam)})`
  )

  script.scenes.forEach((sc, i) => {
    const t = tl.scenes[i]
    const id = `s${i + 1}`
    const clip = input.clips?.[i] ?? null
    const img = clip ? null : images[i]
    const words = timedWords(sc.narration, t.start + VOICE_LEAD_S, t.voice)
    const beats = beatsOf(words)
    // La animación de Manim va debajo de la escena (un <video> no puede ir dentro de algo con tiempo), que se queda
    // transparente y con los subtítulos abajo.
    if (clip) clipHtml.push(`<video id="${id}m" class="clip manimv" src="${esc(clip)}" muted playsinline data-start="${t.start}" data-duration="${t.duration}"></video>`)
    const bgHtml = clip
      ? ''
      : img
        ? `<div class="photo"><img src="${esc(img)}" alt=""></div><div class="tint"></div>`
        : `<div class="bignum">${String(i + 1).padStart(2, '0')}</div><div class="stripes"></div>`
    const beatHtml = beats
      .map((b, k) => {
        const s = b[0].start
        const e = k + 1 < beats.length ? beats[k + 1][0].start : t.start + t.duration
        const wordsHtml = b
          .map((w, j) => `<span class="w${w.key ? ' key' : ''}" id="${id}b${k}w${j}">${esc(w.text)}</span>`)
          .join(' ')
        return `<div class="clip beat" id="${id}b${k}" data-start="${R(s - 0.05)}" data-duration="${R(e - s + 0.05)}"><div class="bt">${wordsHtml}</div></div>`
      })
      .join('\n  ')
    html.push(`<section id="${id}" class="clip scene${img ? ' has-img' : ''}${clip ? ' has-manim' : ''}" data-start="${t.start}" data-duration="${t.duration}">
  ${bgHtml}
  <div class="tag" id="${id}tag"><span>${esc(sc.heading)}</span></div>
  ${beatHtml}
</section>`)

    // Fondo de la escena.
    if (clip) {
      // La animación ya se mueve sola.
    } else if (img) {
      const dir = i % 2 ? 1 : -1
      a.push(`tl.fromTo('#${id} .photo img', {scale: 1.32, x: ${dir * 60}, rotation: ${dir * 1.5}}, {scale: 1.05, x: ${-dir * 40}, rotation: 0, duration: ${t.duration}, ease: 'power1.out'}, ${t.start})`)
    } else {
      a.push(
        `tl.fromTo('#${id} .bignum', {x: ${vertical ? 300 : 700}, opacity: 0}, {x: ${vertical ? -200 : -500}, opacity: 1, duration: ${t.duration}, ease: 'power1.inOut'}, ${t.start})`,
        `tl.fromTo('#${id} .stripes', {backgroundPositionX: '0px'}, {backgroundPositionX: '${vertical ? 600 : 900}px', duration: ${t.duration}, ease: 'none'}, ${t.start})`
      )
    }
    // Etiqueta que rebota y se balancea.
    a.push(
      `tl.fromTo('#${id}tag', {scale: 0, rotation: -14}, {scale: 1, rotation: -3, duration: 0.5, ease: 'back.out(3)'}, ${R(t.start + 0.12)})`,
      `tl.to('#${id}tag', {rotation: 2, duration: ${R(Math.max(0.5, t.duration - 0.8))}, ease: 'sine.inOut'}, ${R(t.start + 0.62)})`
    )
    sfx.push({ at: R(t.start + 0.14), kind: 'pop' })

    // Golpes de narración.
    beats.forEach((b, k) => {
      const bid = `#${id}b${k}`
      const s = b[0].start
      const style = BEAT_IN[(i * 3 + k) % BEAT_IN.length]
      const from =
        style === 'pop' ? '{scale: 1.6, opacity: 0}' :
        style === 'up' ? '{y: 140, skewY: 8, opacity: 0}' :
        style === 'tilt' ? '{rotation: -10, scale: 0.7, opacity: 0}' :
        style === 'side' ? `{x: ${k % 2 ? 260 : -260}, opacity: 0}` :
        '{y: -160, scale: 1.2, opacity: 0}'
      a.push(`tl.fromTo('${bid} .bt', ${from}, {x: 0, y: 0, scale: 1, rotation: 0, skewY: 0, opacity: 1, duration: 0.28, ease: 'back.out(2.2)'}, ${R(s - 0.05)})`)
      // Golpe de cámara en cada cambio.
      a.push(`tl.fromTo('#punch', {scale: ${k % 2 ? 1.05 : 1.08}}, {scale: 1, duration: 0.35, ease: 'power3.out', immediateRender: false}, ${R(s - 0.05)})`)
      b.forEach((w, j) => {
        const wid = `#${id}b${k}w${j}`
        const next = j + 1 < b.length ? b[j + 1].start : k + 1 < beats.length ? beats[k + 1][0].start : t.start + t.duration
        a.push(`tl.fromTo('${wid}', {scale: 0.3, y: 50, opacity: 0}, {scale: 1, y: 0, opacity: 1, duration: 0.2, ease: 'back.out(3)'}, ${R(w.start - 0.04)})`)
        // La palabra que suena: resaltada mientras se dice (GSAP 3 no anima clases: colores directos).
        const rest = w.key ? th.accent : img ? '#ffffff' : th.ink
        const on = w.key ? `{backgroundColor: '${th.accent2}', color: '#ffffff', textShadow: 'none'}` : `{backgroundColor: '${th.accent}', color: '${th.onAccent}', textShadow: 'none'}`
        a.push(`tl.set('${wid}', ${on}, ${R(w.start)})`)
        a.push(`tl.set('${wid}', {backgroundColor: 'rgba(0,0,0,0)', color: '${rest}', textShadow: '0 8px 0 rgba(0,0,0,0.28)'}, ${R(Math.max(w.start + 0.12, next - 0.02))})`)
        if (w.key) {
          a.push(`tl.fromTo('${wid}', {rotation: -6}, {rotation: 0, duration: 0.35, ease: 'elastic.out(1.4, 0.35)', immediateRender: false}, ${R(w.start + 0.1)})`)
          a.push(`tl.fromTo('#shake', {x: 10, y: -6}, {x: 0, y: 0, duration: 0.3, ease: 'elastic.out(1.2, 0.3)', immediateRender: false}, ${R(w.start)})`)
        }
      })
    })

    // Transición de entrada a la escena.
    const kind = TRANSITIONS[i % TRANSITIONS.length]
    const at = R(Math.max(0, t.start - 0.22))
    html.push(transitionHtml(`tr${i}`, kind, at, vertical))
    a.push(...transitionAnims(`tr${i}`, kind, at, vertical))
    sfx.push({ at: R(at - 0.05), kind: 'whoosh' })
  })

  // Cierre.
  const outWords = script.outro.split(/\s+/).filter(Boolean)
  html.push(`<section id="outro" class="clip scene" data-start="${tl.outroStart}" data-duration="${tl.outro}">
  <div class="burst"></div>
  <h2 class="title outro">${outWords.map((w, i) => `<span class="tw" id="ow${i}">${esc(w)}</span>`).join(' ')}</h2>
  <div class="underline"></div>
</section>`)
  html.push(transitionHtml('trout', 'zoom', R(tl.outroStart - 0.22), vertical))
  a.push(...transitionAnims('trout', 'zoom', R(tl.outroStart - 0.22), vertical))
  sfx.push({ at: R(tl.outroStart - 0.27), kind: 'whoosh' })
  outWords.forEach((_, i) => {
    const at = R(tl.outroStart + 0.1 + i * 0.12)
    a.push(`tl.fromTo('#ow${i}', {y: 120, opacity: 0, rotation: ${i % 2 ? 6 : -6}}, {y: 0, opacity: 1, rotation: 0, duration: 0.35, ease: 'back.out(2.5)'}, ${at})`)
  })
  sfx.push({ at: R(tl.outroStart + 0.1 + outWords.length * 0.12), kind: 'impact' })
  a.push(
    `tl.fromTo('#outro .burst', {scale: 0.2, opacity: 0.9}, {scale: 3.2, opacity: 0, duration: 1.2, ease: 'power2.out'}, ${R(tl.outroStart + 0.1 + outWords.length * 0.12)})`,
    `tl.fromTo('#outro .underline', {scaleX: 0}, {scaleX: 1, duration: 0.5, ease: 'power3.out'}, ${R(tl.outroStart + 0.3 + outWords.length * 0.12)})`,
    `tl.to('#outro .title, #outro .underline', {opacity: 0, scale: 0.94, duration: 0.45, ease: 'power2.in'}, ${R(tl.total - 0.5)})`,
    `tl.fromTo('#bar', {scaleX: 0}, {scaleX: 1, duration: ${tl.total}, ease: 'none'}, 0)`
  )
  sfx.push({ at: R(Math.max(0, tl.intro - 0.9)), kind: 'riser' })

  const big = vertical ? 142 : 150
  const doc = `<!doctype html>
<html lang="${esc(script.lang)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="${esc(input.gsap)}"></script>
<style>
:root { --bg: ${th.bg}; --bg2: ${th.bg2}; --ink: ${th.ink}; --accent: ${th.accent}; --accent2: ${th.accent2}; --on: ${th.onAccent}; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--bg); }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: ${font}; color: var(--ink);
  background: radial-gradient(130% 100% at 30% 0%, var(--bg2) 0%, var(--bg) 62%); }
.clip { position: absolute; inset: 0; }
#bglife { position: absolute; inset: 0; overflow: hidden; }
.blob { position: absolute; width: ${vertical ? 900 : 1000}px; height: ${vertical ? 900 : 1000}px; border-radius: 50%; filter: blur(90px); opacity: 0.55; }
.b1 { background: var(--accent2); left: -15%; top: -20%; }
.b2 { background: var(--accent); right: -25%; bottom: -25%; opacity: 0.35; }
.ring { position: absolute; left: 50%; top: 50%; width: ${vertical ? 1300 : 1400}px; height: ${vertical ? 1300 : 1400}px; margin: -${vertical ? 650 : 700}px 0 0 -${vertical ? 650 : 700}px;
  border-radius: 50%; border: 3px dashed var(--ink); opacity: 0.12; }
.pt { position: absolute; border-radius: 50%; background: var(--ink); }
#shake, #punch { position: absolute; inset: 0; transform-origin: 50% 50%; }
.scene { overflow: hidden; }
.photo { position: absolute; inset: 0; }
.photo img { width: 100%; height: 100%; object-fit: cover; transform-origin: 50% 50%; }
.tint { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.75) 100%); }
.has-img .w { color: #fff; }
.bignum { position: absolute; top: ${vertical ? 180 : 40}px; left: 0; font-size: ${vertical ? 620 : 760}px; font-weight: 900; line-height: 1; letter-spacing: -0.06em;
  color: transparent; -webkit-text-stroke: 4px var(--ink); opacity: 0.12; white-space: nowrap; }
.stripes { position: absolute; left: 0; right: 0; bottom: 0; height: ${vertical ? 160 : 120}px; opacity: 0.18;
  background-image: repeating-linear-gradient(-45deg, var(--accent) 0 28px, transparent 28px 64px); }
.tag { position: absolute; z-index: 4; ${vertical ? 'left: 0; right: 0; top: 230px; display: flex; justify-content: center;' : 'left: 110px; top: 90px;'} transform-origin: 0% 50%; }
.tag span { display: inline-block; padding: 14px 30px; border-radius: 16px; background: var(--accent); color: var(--on); font-size: ${vertical ? 52 : 46}px;
  font-weight: 900; letter-spacing: -0.01em; text-transform: uppercase; box-shadow: 0 14px 0 rgba(0,0,0,0.25); }
.beat { display: flex; align-items: center; justify-content: center; z-index: 5; padding: 0 ${vertical ? 70 : 160}px; }
.bt { text-align: center; font-size: ${big}px; line-height: 1.08; font-weight: 900; letter-spacing: -0.035em; max-width: ${vertical ? 940 : 1600}px; }
.w { display: inline-block; padding: 0 0.08em; border-radius: 0.14em; text-shadow: 0 8px 0 rgba(0,0,0,0.28); }
.w.key { color: var(--accent); }
.manimv { width: 100%; height: 100%; object-fit: cover; background: var(--bg); }
.has-manim .beat { align-items: flex-end; padding-bottom: ${vertical ? 260 : 90}px; }
.has-manim .bt { font-size: ${vertical ? 72 : 64}px; padding: 14px 28px; border-radius: 22px; background: rgba(0,0,0,0.6); color: #fff; }
.has-img .w.key { color: var(--accent); }
#intro, #outro { display: flex; align-items: center; justify-content: center; flex-direction: column; }
.title { position: relative; z-index: 3; text-align: center; padding: 0 ${vertical ? 70 : 180}px; font-size: ${vertical ? 136 : 150}px; line-height: 1.02; font-weight: 900;
  letter-spacing: -0.045em; text-transform: uppercase; }
.title .tw { display: inline-block; text-shadow: 0 10px 0 rgba(0,0,0,0.3); }
.title .tw:nth-child(3n+2) { color: var(--accent); }
.outro { font-size: ${vertical ? 112 : 120}px; text-transform: none; }
.underline { width: 340px; height: 18px; margin-top: 40px; border-radius: 10px; background: linear-gradient(90deg, var(--accent), var(--accent2)); transform-origin: 50% 50%; z-index: 3; }
.burst { position: absolute; left: 50%; top: 50%; width: 600px; height: 600px; margin: -300px 0 0 -300px; border-radius: 50%; border: 24px solid var(--accent); z-index: 2; }
.bb { border-color: var(--accent2); }
.tr { z-index: 8; overflow: hidden; pointer-events: none; }
.tr .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
.tr .sb { position: absolute; top: -20%; bottom: -20%; width: 24%; background: var(--accent); transform: skewX(-18deg); }
.tr .sb:nth-child(2n) { background: var(--accent2); }
.tr .iris { position: absolute; left: 50%; top: 50%; width: ${vertical ? 2400 : 2400}px; height: ${vertical ? 2400 : 2400}px; margin: -1200px 0 0 -1200px; border-radius: 50%; background: var(--accent); }
.tr .slab { position: absolute; left: -10%; right: -10%; height: 34%; background: var(--accent2); mix-blend-mode: normal; }
#barwrap { position: absolute; left: 0; right: 0; ${vertical ? 'top: 0;' : 'bottom: 0;'} height: 12px; z-index: 9; background: rgba(255,255,255,0.15); }
#bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); transform-origin: left center; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${tl.total}" data-width="${W}" data-height="${H}">
${html[0]}
<div id="shake"><div id="punch">
${clipHtml.join('\n')}
${html.slice(1).join('\n')}
</div></div>
<div id="barwrap"><div id="bar"></div></div>
<audio id="mix" src="${esc(input.audio)}" data-start="0" data-duration="${tl.total}" data-volume="1"></audio>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${a.join(';\n')};
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`
  return { html: doc, sfx: sfx.filter((s) => s.at >= 0).sort((x, y) => x.at - y.at) }
}

function transitionHtml(id: string, kind: (typeof TRANSITIONS)[number], at: number, vertical: boolean): string {
  const inner =
    kind === 'zoom' ? '<div class="flash"></div>' :
    kind === 'stripes' ? '<div class="sb"></div><div class="sb"></div><div class="sb"></div><div class="sb"></div><div class="sb"></div>' :
    kind === 'iris' ? '<div class="iris"></div>' :
    `<div class="slab" style="top:0"></div><div class="slab" style="top:33%"></div><div class="slab" style="top:66%"></div>`
  void vertical
  return `<div id="${id}" class="clip tr" data-start="${at}" data-duration="0.5">${inner}</div>`
}

function transitionAnims(id: string, kind: (typeof TRANSITIONS)[number], at: number, vertical: boolean): string[] {
  const s = `#${id}`
  if (kind === 'zoom') {
    return [
      `tl.fromTo('${s} .flash', {opacity: 0}, {opacity: 0.85, duration: 0.12, ease: 'power2.in', yoyo: true, repeat: 1}, ${at})`,
      `tl.fromTo('#punch', {scale: 1.35, rotation: -2}, {scale: 1, rotation: 0, duration: 0.45, ease: 'expo.out', immediateRender: false}, ${round(at + 0.2)})`
    ]
  }
  if (kind === 'stripes') {
    const W = vertical ? 1080 : 1920
    return [`tl.fromTo('${s} .sb', {x: ${-W * 0.5}}, {x: ${W * 1.4}, duration: 0.5, ease: 'power3.inOut', stagger: 0.03}, ${at})`]
  }
  if (kind === 'iris') {
    return [
      `tl.fromTo('${s} .iris', {scale: 0}, {scale: 1, duration: 0.22, ease: 'power3.in'}, ${at})`,
      `tl.to('${s} .iris', {scale: 0, duration: 0.26, ease: 'power3.out'}, ${round(at + 0.22)})`
    ]
  }
  return [
    `tl.fromTo('${s} .slab', {x: -2200}, {x: 0, duration: 0.12, ease: 'steps(3)', stagger: 0.04}, ${at})`,
    `tl.to('${s} .slab', {x: 2200, duration: 0.14, ease: 'steps(3)', stagger: 0.04}, ${round(at + 0.24)})`,
    `tl.fromTo('#shake', {x: -24, y: 6}, {x: 0, y: 0, duration: 0.3, ease: 'steps(6)', immediateRender: false}, ${round(at + 0.2)})`
  ]
}

// ---------- música ----------

/**
 * Música de fondo propia (sin derechos de nadie): acordes suaves con un pulso ligero, en WAV de 16 bits mono.
 * Determinista: el mismo título da la misma pieza. `seed` elige tonalidad y progresión.
 */
export function synthMusic(seconds: number, seed: string, sampleRate = 44100): Buffer {
  let h = 0
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const roots = [57, 60, 62, 55, 53] // La, Do, Re, Sol, Fa (MIDI)
  const progs = [
    [0, -4, 3, -2], // i–VI–III–VII
    [0, 5, -3, 7],
    [0, -5, -3, 2]
  ]
  const root = roots[h % roots.length]
  const prog = progs[(h >>> 3) % progs.length]
  const minor = (h >>> 5) % 2 === 0
  const bpm = 112
  const beat = 60 / bpm
  const bar = beat * 4
  const n = Math.max(1, Math.floor(seconds * sampleRate))
  const out = new Float32Array(n)
  const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    const barIdx = Math.floor(t / bar) % prog.length
    const inBar = (t % bar) / bar
    const base = root + prog[barIdx]
    const third = minor && barIdx % 2 === 0 ? 3 : 4
    const chord = [base - 12, base, base + third, base + 7, base + 12]
    // Envolvente del acorde: entra y sale suave en cada compás.
    const env = Math.min(1, inBar * 6) * (1 - Math.max(0, inBar - 0.85) * 4)
    let v = 0
    for (let k = 0; k < chord.length; k++) {
      const f = hz(chord[k])
      const amp = k === 0 ? 0.22 : 0.12
      // Triangular suave + leve vibrato.
      const ph = (t * f + 0.002 * Math.sin(2 * Math.PI * 4.5 * t + k)) % 1
      v += amp * (4 * Math.abs(ph - 0.5) - 1)
    }
    v *= env
    // Arpegio ligero en corcheas.
    const eighth = beat / 2
    const step = Math.floor(t / eighth)
    const inStep = (t % eighth) / eighth
    const note = chord[1 + (step % 4)] + 12
    v += 0.08 * Math.sin(2 * Math.PI * hz(note) * t) * Math.exp(-inStep * 5)
    // Pulso grave en cada tiempo (bombo suave) y hi-hat de ruido determinista a contratiempo.
    const inBeat = (t % beat) / beat
    const kickT = inBeat * beat
    v += 0.28 * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-kickT * 30)) * kickT) * Math.exp(-kickT * 9)
    if (inBeat > 0.5) {
      const ht = (inBeat - 0.5) * beat
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1
      v += 0.025 * noise * Math.exp(-ht * 60)
    }
    out[i] = v
  }
  // Fundidos de entrada y salida (wav16 normaliza).
  const fade = Math.min(n / 2, sampleRate * 1.5)
  for (let i = 0; i < n; i++) out[i] *= Math.min(1, i / fade, (n - 1 - i) / fade)
  return wav16(out, sampleRate, 0.8)
}

/**
 * Efectos de sonido sintetizados (sin derechos de nadie) en su momento: «whoosh» en cada transición, «pop» al entrar la
 * etiqueta, «impact» en los golpes de la portada y el cierre, «riser» antes de la primera escena. WAV mono de 16 bits.
 */
export function synthSfx(events: { at: number; kind: SfxKind }[], seconds: number, sampleRate = 44100): Buffer {
  const n = Math.max(1, Math.floor(seconds * sampleRate))
  const out = new Float32Array(n)
  let seed = 12345
  const noise = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2147483648 - 1
  }
  for (const ev of events) {
    const i0 = Math.floor(ev.at * sampleRate)
    const len = Math.floor(sampleRate * (ev.kind === 'whoosh' ? 0.45 : ev.kind === 'pop' ? 0.09 : ev.kind === 'riser' ? 0.9 : ev.kind === 'boing' ? 0.55 : 0.5))
    let lp = 0
    let ph = 0
    for (let k = 0; k < len && i0 + k < n; k++) {
      if (i0 + k < 0) continue
      const t = k / sampleRate
      const x = k / len
      let v = 0
      if (ev.kind === 'whoosh') {
        // Ruido filtrado que sube y baja (filtro paso bajo con corte que barre).
        const cut = 0.02 + 0.5 * Math.sin(Math.PI * x)
        lp += cut * (noise() - lp)
        v = lp * Math.sin(Math.PI * x) * 1.4
      } else if (ev.kind === 'pop') {
        v = Math.sin(2 * Math.PI * (900 - 500 * x) * t) * Math.exp(-x * 6) * 0.6
      } else if (ev.kind === 'boing') {
        // Muelle de dibujos animados: tono que oscila y cae.
        const f = 180 + 140 * Math.sin(2 * Math.PI * 9 * t) * Math.exp(-t * 4) + 120 * (1 - x)
        ph += f / sampleRate
        v = Math.sin(2 * Math.PI * ph) * Math.exp(-x * 3.5) * 0.7
      } else if (ev.kind === 'impact') {
        const f = 40 + 120 * Math.exp(-t * 25)
        lp += 0.08 * (noise() - lp)
        v = (Math.sin(2 * Math.PI * f * t) * 0.9 + lp * 1.5) * Math.exp(-t * 7)
      } else {
        const f = 200 + 900 * x * x
        lp += (0.01 + 0.2 * x) * (noise() - lp)
        v = (Math.sin(2 * Math.PI * f * t) * 0.15 + lp) * x * x
      }
      out[i0 + k] += v
    }
  }
  return wav16(out, sampleRate, 0.9)
}

function wav16(samples: Float32Array, sampleRate: number, peakTarget: number): Buffer {
  let peak = 0
  for (const v of samples) peak = Math.max(peak, Math.abs(v))
  const norm = peak > 0 ? peakTarget / peak : 1
  const data = Buffer.alloc(samples.length * 2)
  for (let i = 0; i < samples.length; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * norm * 32767))), i * 2)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

/** Nombre de archivo a partir del título. */
export function videoSlug(title: string): string {
  const s = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
  return s || 'video'
}
