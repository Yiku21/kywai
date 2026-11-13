// Estudio de vídeo (parte sin efectos): el guion que escribe el agente, cómo se lee y se valida, y la composición
// HTML de HyperFrames que sale de él (escenas, rótulos, subtítulos, transiciones). El agente solo escribe el guion;
// voz, imágenes, música y montaje los hace kywai siempre igual (videoStudio.ts), para que el resultado no dependa de
// que el agente improvise.
import { KYWAI_FILM, takeFilmStyle } from '../shared/filmStyles'
import { takeImageLook } from '../shared/imageLooks'
import { ROBOTS_CHARACTER, stripVideoTags, videoChoiceOf, type VideoKind, type VideoStructure } from '../shared/videoChoice'
import { narrationLines, voiceEmotion, VOICE_EMOTIONS, type VoiceLine } from '../shared/voiceEmotion'
import { episodeRules, type EpisodeBrief } from './series'

export type VideoFormat = 'horizontal' | 'vertical'

export const VIDEO_THEMES = ['noche', 'amanecer', 'oceano', 'bosque', 'neon', 'papel'] as const
export type VideoTheme = (typeof VIDEO_THEMES)[number]

/**
 * «dinamico»: texto grande al estilo TikTok. «cartoon»: un personaje dibujado que lo explica (tutoriales con humor).
 * «mixto»: el presentador y golpes de texto grande alternados.
 */
export const VIDEO_STYLES = ['dinamico', 'cartoon', 'mixto', 'charla'] as const
export type VideoStyle = (typeof VIDEO_STYLES)[number]

/** Lo que hace el personaje del estilo cartoon en cada escena. */
export const CHARACTER_POSES = ['explain', 'point', 'surprised', 'laugh', 'shrug', 'thumbs', 'think', 'wave'] as const
export type CharacterPose = (typeof CHARACTER_POSES)[number]

export interface VideoScene {
  /** Rótulo grande en pantalla (pocas palabras). */
  heading: string
  /** Lo que dice la voz en esta escena (sin las marcas de emoción: es lo que sale en los subtítulos). */
  narration: string
  /** La narración frase a frase, cada una con su emoción (de las marcas «[triste] …» del guion). */
  lines?: VoiceLine[]
  /** Dónde empieza y cuánto dura cada frase en la voz ya generada (en segundos): así los subtítulos van a su ritmo. */
  lineTimes?: { at: number; dur: number }[]
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
  /** Con FreeVideo: qué se mueve en la imagen (en inglés). La escena pasa a ser un clip con movimiento. */
  motion?: string
  /** Estilo mixto: escena de golpe de texto grande (sin planos; el presentador se aparta). */
  text?: boolean
  /** Charla y tutorial: lo que hay que hacer en este paso, en la tarjeta de arriba (de 1 a 4 puntos cortos). */
  items?: string[]
  /** Charla y tutorial, primera escena: preguntas típicas del público que salen como burbujas de comentario. */
  comments?: string[]
}

/** Charla y tutorial: como mucho, puntos por tarjeta y burbujas de comentario del gancho. */
export const MAX_ITEMS = 4
export const MAX_COMMENTS = 3

/**
 * El aspecto por defecto de «Charla y tutorial»: una maqueta 3D de juguete, cálida y con luz de cine (en inglés: va al
 * final de cada imagen). Las maquetas, los platós y los personajes de los reels que lo inspiraron no se copian.
 */
export const CHARLA_LOOK =
  'Cozy low-poly 3D toy diorama, miniature tabletop set with tilt-shift depth of field, soft rounded shapes, matte clay and painted-wood materials, warm cinematic key light with soft shadows and a cool rim light, gentle haze, rich but soft palette of warm oranges, teal and cream, vertical framing with the characters in the lower half and open space above them'

/** Escenas a las que FreeVideo da movimiento como mucho (cada clip tarda minutos). */
export const MAX_MOTION = 3

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
  /**
   * El «bloque de estilo» de las imágenes (en inglés): técnica, línea, paleta, luz y textura, sin el tema. Va al
   * final de cada imagen para que todas salgan iguales; con imágenes de referencia, sale de ellas.
   */
  look?: string
  /** Los personajes fijos de la serie (en inglés, «Nombre: cómo es»): van en cada imagen para que salgan iguales. */
  cast?: string
  /** Episodio de una serie («/serie»): qué pasó, cómo quedó y la pregunta para votar. */
  episode?: { summary: string; cliffhanger?: string; question?: string }
  /** Diálogo: los dos personajes que hablan (el nombre, como en las marcas «[Hermes, alegre]», y su género para la voz). */
  speakers?: VideoSpeaker[]
  /** Charla y tutorial: el cierre pide comentar una palabra («Comenta GUÍA»), con una frase corta de por qué. */
  cta?: { word: string; line?: string }
}

export interface VideoSpeaker {
  name: string
  gender?: 'f' | 'm'
}

/** Los personajes de un diálogo del guion: como mucho 2, con nombre. */
function speakersOf(v: unknown): VideoSpeaker[] {
  const list = Array.isArray(v) ? v : []
  const out: VideoSpeaker[] = []
  for (const x of list) {
    const o = typeof x === 'string' ? { name: x } : x && typeof x === 'object' ? (x as Record<string, unknown>) : null
    const name = o ? clean(o.name, 30).replace(/[[\],|/;:]/g, '') : ''
    if (!name || out.some((s) => s.name.toLowerCase() === name.toLowerCase())) continue
    const g = o && typeof o.gender === 'string' ? o.gender.toLowerCase()[0] : ''
    out.push({ name, ...(g === 'f' || g === 'm' ? { gender: g } : {}) })
    if (out.length === 2) break
  }
  return out
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
  const speakers = speakersOf(raw.speakers)
  const names = speakers.map((x) => x.name)
  const scenes: VideoScene[] = []
  for (const s of list) {
    if (!s || typeof s !== 'object') continue
    const o = s as Record<string, unknown>
    // Las marcas «[emocionado] …» se quitan de la narración y se guardan frase a frase.
    // En un diálogo, la marca dice también quién habla («[Claude, alegre] …»).
    const parts = narrationLines(clean(o.narration, 600), o.joke === true ? 'gracioso' : voiceEmotion(clean(o.emotion, 30)) ?? 'neutral', names)
    const narration = parts.narration.slice(0, 400)
    const heading = clean(o.heading, 60) || narration.split(' ').slice(0, 5).join(' ')
    if (!narration) continue
    const shots = (Array.isArray(o.shots) ? o.shots : []).map((x) => clean(x, 400)).filter(Boolean).slice(0, MAX_SHOTS)
    const scene: VideoScene = { heading, narration, image: shots[0] ?? clean(o.image, 400) }
    if (parts.lines.length) scene.lines = parts.lines
    if (shots.length) scene.shots = shots
    if (CHARACTER_POSES.includes(o.pose as CharacterPose)) scene.pose = o.pose as CharacterPose
    const step = Number(o.step)
    if (Number.isInteger(step) && step > 0 && step < 100) scene.step = step
    if (o.joke === true) scene.joke = true
    const manim = typeof o.manim === 'string' ? o.manim.trim() : ''
    if (manim && manim.length <= 8000 && /class\s+Escena\s*\(/.test(manim) && scenes.filter((x) => x.manim).length < MAX_MANIM) scene.manim = manim
    const motion = clean(o.motion, 300)
    if (motion && !scene.manim && scenes.filter((x) => x.motion).length < MAX_MOTION) scene.motion = motion
    if (o.mode === 'texto' || o.mode === 'text') scene.text = true
    const items = (Array.isArray(o.items) ? o.items : []).map((x) => clean(x, 48)).filter(Boolean).slice(0, MAX_ITEMS)
    if (items.length) scene.items = items
    // Las burbujas de comentario solo van en el gancho.
    const comments = scenes.length ? [] : (Array.isArray(o.comments) ? o.comments : []).map((x) => clean(x, 80)).filter(Boolean).slice(0, MAX_COMMENTS)
    if (comments.length) scene.comments = comments
    scenes.push(scene)
  }
  if (scenes.length < MIN_SCENES) throw new Error(`El guion necesita al menos ${MIN_SCENES} escenas con «narration» (tiene ${scenes.length}).`)
  const theme = VIDEO_THEMES.includes(raw.theme as VideoTheme) ? (raw.theme as VideoTheme) : 'noche'
  const lang = (clean(raw.lang, 8).toLowerCase().match(/^[a-z]{2}/)?.[0] ?? 'es')
  const style = VIDEO_STYLES.includes(raw.style as VideoStyle) ? (raw.style as VideoStyle) : 'dinamico'
  const look = clean(raw.look, 700)
  const cast = clean(raw.cast, 900)
  const ep = raw.episode && typeof raw.episode === 'object' ? (raw.episode as Record<string, unknown>) : null
  const summary = ep ? clean(ep.summary, 500) : ''
  const c = raw.cta && typeof raw.cta === 'object' ? (raw.cta as Record<string, unknown>) : null
  const word = c ? clean(c.word, 20).replace(/[«»"'*]/g, '').trim() : ''
  const cta = word ? { word: word.toUpperCase(), ...(clean(c!.line, 80) ? { line: clean(c!.line, 80) } : {}) } : undefined
  const episode = summary ? { summary, ...(clean(ep!.cliffhanger, 300) ? { cliffhanger: clean(ep!.cliffhanger, 300) } : {}), ...(clean(ep!.question, 300) ? { question: clean(ep!.question, 300) } : {}) } : undefined
  return { title, lang, theme, style, scenes: scenes.slice(0, MAX_SCENES), outro: clean(raw.outro, 90) || title, ...(look ? { look } : {}), ...(cast ? { cast } : {}), ...(episode ? { episode } : {}), ...(speakers.length === 2 ? { speakers } : {}), ...(cta ? { cta } : {}) }
}

/**
 * El gancho: lo que decide si alguien sigue mirando. Va en los encargos de guion y de película (en español, como el
 * resto del encargo).
 */
export const HOOK_RULE =
  'Gancho en los 2 primeros segundos (voz y lo que se ve a la vez, sin saludos ni presentaciones ni «hoy vamos a ver»), con una de estas formas: una pregunta que el espectador se hace («¿por qué…?»); un dato o una cifra que sorprende; lo contrario de lo que todo el mundo cree («deja de…», «no es…»); el resultado final primero y luego cómo se llega; un error común («si haces esto, lo estás haciendo mal»); una promesa concreta con número («3 pasos», «en 30 segundos»). Después, cada escena abre una pregunta pequeña que la siguiente cierra, para que se vea hasta el final.'

/**
 * La voz con vida: cada frase con su emoción. Va en los encargos de guion (y la parte de cómo aplicarla, en el de
 * película).
 */
export const EMOTION_RULE =
  `- Voz con vida: delante de CADA frase de "narration" pon su emoción entre corchetes, una de ${VOICE_EMOTIONS.map((e) => `[${e}]`).join(', ')} («[sorprendido] ¿Diez minutos? [emocionado] ¡Y con música!»). La voz cambia de tono con ella, así que varíala como lo haría una persona contándolo: que no vayan más de dos frases seguidas con la misma, el gancho con fuerza, los problemas [triste] o [firme], las soluciones [alegre] o [emocionado], un secreto [susurro]. Los «…» hacen una pausa dramática. Las marcas no salen en pantalla ni se leen.`

/**
 * La estructura «Reel en 3 pasos» (marca «estructura:pasos»), sacada del ritmo de un reel de 56 s que gustó: tramos con
 * sus segundos para que el guion los siga, con cualquier estilo. Manda sobre el orden normal del encargo.
 */
export const STEPS_STRUCTURE = [
  '- ESTRUCTURA «Reel en 3 pasos» (la eligió el usuario; manda sobre el orden y la duración de arriba): de 45 a 60 segundos, la voz seguida y sin silencios largos, en estos tramos y en este orden:',
  '  1. Gancho (0–2 s): una orden en negativo con lo que el espectador hace mal («Deja de…», «No vuelvas a…»).',
  '  2. Autoridad (2–9 s): quién lo dice o de dónde sale, con una fuente real que hayas comprobado (si no la hay, salta este tramo; nunca la inventes). Funciona bien una frase que todos repiten tachada y lo que de verdad se dijo.',
  '  3. «¿Te suena?» (9–16 s): el error contado como una escena del espectador que se va amontonando cosa a cosa («uno para el correo, otro para las facturas…») hasta un mal resultado con un número.',
  '  4. Giro (16–25 s): «no es culpa tuya» y el porqué en una frase; luego la idea nueva en otra, y la palabra clave definida con algo que se ve («X = una carpeta»).',
  '  5. Tres pasos numerados (25–48 s, unos 7 s cada uno): «1 · …», «2 · …», «3 · …», cada uno con un ejemplo concreto y un remate corto que se recuerde. Que se vea cuántos quedan (1/3, 2/3, 3/3).',
  '  6. Si sale mal (opcional, 2–3 s): qué hacer cuando falla («no le riñas: corrige…»).',
  '  7. Cierre (los últimos 6–8 s): «Comenta PALABRA» (una palabra corta en mayúsculas, sin prometer nada que no se pueda dar) y una frase final que recoge el número del principio (otros arreglan quince, tú arreglas uno).',
  '  Frases de 2 a 6 palabras, una idea por frase. Cada cosa importante que se nombra sale en pantalla en ese momento: algo nuevo cada 1–1,5 s y el titular cambia cada 3–4 s, con la palabra clave en color (problema, pregunta, solución).'
]

/** Cómo encajan los tramos en las escenas de un guion de kywai (como mucho MAX_SCENES). */
const STEPS_SCENES = `- Con esta estructura, una escena por tramo y una por paso (de 8 a ${MAX_SCENES} escenas): en "heading" va el titular del tramo («¿Te suena?», «1 · Que te entreviste»).`

/** El personaje elegido son los robots de kywai (por su id o por su nombre en la biblioteca). */
const isRobots = (name: string | undefined): boolean => name === ROBOTS_CHARACTER || /robots? de kywai/i.test(name ?? '')

/** El diálogo: dos personajes que se contestan (como en los reels que más enganchan). */
export function dialogueRules(cast?: { name?: string }): string[] {
  const who =
    isRobots(cast?.name)
      ? 'Hermes y Claude, los robots de kywai'
      : cast?.name
        ? `${cast.name} y otro personaje que le dé la réplica (inventa uno que encaje)`
        : 'dos personajes que inventes y que encajen con el tema (con un nombre corto cada uno)'
  return [
    `- Es un DIÁLOGO entre ${who}: se contestan el uno al otro, como dos amigos charlando delante de la cámara. Nada de narrador.`,
    '- "speakers": los dos personajes, [{"name": "…", "gender": "f" o "m"}]. Cada uno habla con su voz.',
    '- En "narration", cada frase lleva delante quién la dice y cómo: [Nombre, emoción] («[Claude, sorprendido] ¿Diez minutos? [Hermes, alegre] Ni uno más.»). Frases cortas que van y vienen: una pregunta, una reacción («¿Yo?», «Vale.», «¿En serio?»), un chiste pequeño, una pulla. En cada escena hablan los dos, y las réplicas cortas son las que dan vida.'
  ]
}

/** Encargo para el agente: solo el guion, en JSON. */
type PromptInput = {
  topic: string
  source?: string
  format: VideoFormat
  lang: string
  style?: VideoStyle
  retry?: string
  manim?: { latex: boolean } | null
  /** El usuario adjuntó imágenes: son referencias del estilo (rutas para leerlas). */
  refs?: string[]
  /** FreeVideo está en el equipo: el guion puede pedir movimiento en las escenas clave. */
  motion?: boolean
  /**
   * Personajes del vídeo: los fijos del proyecto (carpeta «personajes») o el elegido en el selector. Sus imágenes, su
   * aspecto si ya se escribió y, en el elegido, su nombre y lo que contó el usuario de él.
   */
  cast?: { images: string[]; notes?: string; name?: string; about?: string }
  /** Episodio de una serie («/serie»). */
  episode?: EpisodeBrief
  /** Diálogo entre dos personajes, cada uno con su voz. */
  dialogue?: boolean
  /** Estructura fija del guion (STEPS_STRUCTURE). */
  structure?: VideoStructure
  /** Aspecto de las imágenes ya elegido por el usuario (su nombre): el guion no escribe «look», kywai pone el suyo. */
  lookName?: string
  /** «Sketch de humor» (tipo:sketch): la charla de los dos personajes como escena cómica, sin pasos ni tarjetas. */
  sketch?: boolean
  /**
   * Los robots de kywai se dibujan con IA en el aspecto elegido en cada plano (hay motor de imágenes), en vez de salir
   * animados en el plató 3D.
   */
  drawCast?: boolean
}

/** El vídeo lleva presentador (dibujos con presentador o mixto). */
export const hasPresenter = (style: VideoStyle | undefined): boolean => style === 'cartoon' || style === 'mixto'

/** Reglas del bloque de estilo y del movimiento (comunes a los dos estilos rápidos). */
function lookRules(input: PromptInput): string[] {
  // En el estilo con presentador el dibujo es siempre el mismo, salvo que el usuario dé referencias.
  if (input.lookName)
    return [
      `- El aspecto de las imágenes ya lo eligió el usuario («${input.lookName}»): no escribas "look"; kywai le añade a cada imagen el suyo. En "image" (y "shots") describe solo lo que se ve, pensado para lucir en ese aspecto.`,
      ...motionRules(input)
    ]
  const look = !hasPresenter(input.style) || !!input.refs?.length || !!input.cast
  return [
    !look
      ? ''
      : input.refs?.length
      ? `- "look": el bloque de estilo de las imágenes, sacado de las imágenes de referencia del usuario (${input.refs.join(', ')}): ábrelas y míralas antes de escribir. En inglés, de 40 a 90 palabras, SOLO cómo está hecho (técnica o medio, tipo de línea, paleta de colores concreta, luz, textura, encuadre habitual), nunca lo que sale en ellas (ni personas, ni objetos, ni lugares). Ponle al principio un nombre corto del estilo. Ese texto se añade al final de cada imagen, así todas salen iguales y en ese estilo.`
        : '- "look": el bloque de estilo de las imágenes, uno solo para todo el vídeo, en inglés y de 30 a 70 palabras: técnica o medio, tipo de línea, paleta de colores concreta, luz y textura (nunca el tema). Se añade al final de cada imagen para que todas salgan iguales.',
    look ? '- En "image" (y "shots") describe solo lo que se ve; el estilo ya va en "look".' : '',
    ...motionRules(input)
  ].filter(Boolean)
}

/** La regla del movimiento (FreeVideo), si está en el equipo. */
function motionRules(input: PromptInput): string[] {
  return input.motion
    ? [
        `- "motion" (opcional, como mucho en ${MAX_MOTION} escenas, las que más ganan moviéndose: el gancho y los momentos fuertes): qué se mueve en la imagen de esa escena, en inglés y en una frase (la acción y el movimiento de cámara). kywai convierte esa imagen en un clip con movimiento. Que sea una acción sencilla que quepa en la duración de la escena.`
      ]
    : []
}

/** Reglas de los personajes fijos (los de la carpeta «personajes» del proyecto): salen iguales en todos los vídeos. */
function castRules(input: PromptInput): string[] {
  const c = input.cast
  if (!c || (!c.images.length && !c.notes && !c.about)) return []
  const who = c.name ? `el personaje elegido para este vídeo, ${c.name}` : 'los personajes fijos de esta serie'
  const from = [
    c.images.length ? `sus imágenes (${c.images.join(', ')}): ábrelas y míralas` : '',
    c.about ? `lo que cuenta el usuario de él: «${c.about}»` : ''
  ].filter(Boolean).join(', y ')
  return [
    c.notes
      ? `- "cast": ${who}. Copia EXACTAMENTE esta descripción (no la cambies; sale igual en todos los vídeos): ${c.notes}`
      : `- "cast": ${who}, sacado de ${from}. Para cada personaje, en inglés: «Nombre: edad aparente o tipo (persona, animal, robot…), cara, pelo, cuerpo, ropa exacta y colores, rasgos que lo distinguen» (de 15 a 40 palabras cada uno, SIN el estilo de dibujo: el estilo lo pone el vídeo). Esa descripción se guarda y se repite igual en todos los vídeos, así que sé concreto.`,
    '- Son los protagonistas: salen en la mayoría de las escenas. En "image" (y "shots") nómbralos por su nombre y di qué hacen y dónde; no vuelvas a describir cómo son (ya va en "cast"). Siempre con la misma ropa.'
  ]
}

/** Reglas de Manim para el guion (solo si está instalado en el estudio). */
function manimRules(format: VideoFormat, manim: { latex: boolean }, cartoon = false): string[] {
  const frame = format === 'vertical' ? '4,5 de ancho × 8 de alto' : '14,2 de ancho × 8 de alto'
  return [
    `- "manim" (opcional, como mucho en ${MAX_MANIM} escenas): SOLO cuando una fórmula, una gráfica, un diagrama, una geometría o un proceso se entiende mejor animado. Es código Python de Manim Community con \`from manim import *\` y una clase \`class Escena(Scene)\`; kywai lo renderiza a pantalla completa en esa escena, con el fondo del tema, en lugar de la imagen. Que dure lo que la narración (de 3 a 8 s: usa run_time y self.wait). El cuadro mide ${frame} unidades: que ocupe casi todo el ancho, centrado y en la mitad de arriba (abajo van los subtítulos${cartoon ? '; arriba a la izquierda va el número de paso y abajo a la izquierda el personaje' : ''}). Colores claros y vivos (YELLOW, TEAL, WHITE…). ${manim.latex ? 'Para fórmulas, MathTex.' : 'Usa Text para todo el texto y las fórmulas (sin MathTex ni Tex: no hay LaTeX en este equipo).'} Sin leer ni escribir archivos, sin red y sin imágenes externas. Pon también la imagen de la escena por si la animación falla.`
  ]
}

export function videoScriptPrompt(input: PromptInput): string {
  if (input.style === 'charla') return charlaScriptPrompt(input)
  if (hasPresenter(input.style)) return cartoonScriptPrompt(input)
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
    `- Entre ${MIN_SCENES + 2} y ${MAX_SCENES - 1} escenas cortas y con ritmo, para gente con poca paciencia. Cada escena aporta algo nuevo; la última cierra con una idea clara.`,
    `- ${HOOK_RULE}`,
    '- "narration": lo que dice la voz, UNA frase corta y directa por escena (de 8 a 20 palabras), como habla un buen creador de TikTok. Sin emojis, sin listas, sin siglas raras: se lee en voz alta. Marca con *asteriscos* la palabra o las dos palabras clave de cada frase (salen resaltadas en pantalla).',
    EMOTION_RULE,
    ...(input.dialogue ? dialogueRules(input.cast) : []),
    '- "heading": la etiqueta de la escena, de 1 a 3 palabras.',
    '- "image": la imagen de fondo de la escena, descrita en inglés en una frase concreta (sujeto, ambiente, luz). Sin texto, letras ni logotipos en la imagen.',
    `- "theme": uno de ${VIDEO_THEMES.map((t) => `"${t}"`).join(', ')}, el que mejor le vaya al tema.`,
    '- "outro": frase final corta para la última pantalla.',
    ...(input.structure === 'pasos' ? [...STEPS_STRUCTURE, STEPS_SCENES] : []),
    ...lookRules(input),
    ...castRules(input),
    ...(input.episode ? episodeRules(input.episode) : []),
    ...(input.manim ? manimRules(input.format, input.manim) : []),
    '- Si el tema necesita datos actuales, compruébalos antes; no inventes cifras.',
    '- No crees ni cambies archivos: responde solo con el JSON.',
    ...(input.retry ? ['', `Tu respuesta anterior no valía: ${input.retry}`] : []),
    '',
    'Responde SOLO con este JSON, sin nada antes ni después:',
    '{"title": "…", "lang": "' + input.lang + '", "theme": "noche", ' + (input.lookName ? '' : '"look": "…", ') + (input.cast || input.episode ? '"cast": "…", ' : '') + (input.episode ? '"episode": {"summary": "…", "cliffhanger": "…", "question": "…"}, ' : '') + (input.dialogue ? '"speakers": [{"name": "…", "gender": "f"}, {"name": "…", "gender": "m"}], ' : '') + '"scenes": [{"heading": "…", "narration": "' + (input.dialogue ? '[Nombre1, sorprendido] … [Nombre2, alegre] …' : '[sorprendido] …') + '", "image": "…"' + (input.motion ? ', "motion": "…"' : '') + '}], "outro": "…"}'
  ].join('\n')
}

/** Encargo del estilo cartoon: un tutorial que explica un personaje, con pasos claros y alguna broma. */
function cartoonScriptPrompt(input: PromptInput): string {
  const seconds = input.format === 'vertical' ? '40 a 70' : '50 a 100'
  const mixed = input.style === 'mixto'
  const host = input.cast?.name ? `${input.cast.name} (el personaje elegido)` : input.cast ? 'el personaje fijo de la serie' : 'un personaje cartoon (un presentador simpático con gafas)'
  return [
    `Escribe el guion de un vídeo de dibujos animados en el que ${host} lo explica todo hablando a cámara${mixed ? ', alternando con golpes de texto grande con ritmo, como en TikTok' : ''}. kywai dibuja y anima al personaje, pone la voz, las ilustraciones, la música y el montaje: tú solo escribes el guion.`,
    '',
    `Tema: ${input.topic}`,
    ...(input.source ? ['', 'El vídeo trata de este mensaje (explícalo bien, sin copiarlo entero):', '"""', input.source.slice(0, 6000), '"""'] : []),
    '',
    `Formato: ${input.format === 'vertical' ? 'vertical 9:16 (TikTok, Reels, Shorts)' : 'horizontal 16:9 (YouTube)'}; duración total de ${seconds} segundos.`,
    `Idioma de la voz y los textos: ${input.lang}.`,
    '',
    'Reglas:',
    `- Entre ${MIN_SCENES + 3} y ${MAX_SCENES} escenas. La primera es el gancho, con gracia (el personaje lo dice). Si es un tutorial, después van los pasos EN ORDEN, completos y correctos (con los avisos de seguridad que hagan falta), y al final un resumen corto.`,
    '- "narration": lo que dice el personaje en primera persona, como un youtuber cercano: una o dos frases cortas (como mucho 30 palabras). Sin emojis ni listas: se lee en voz alta. Marca con *asteriscos* la palabra clave de cada frase.',
    EMOTION_RULE,
    ...(input.dialogue ? dialogueRules(input.cast) : []),
    '- Humor: en 2 o 3 escenas mete una broma corta y blanca (una exageración, una comparación absurda, un despiste del personaje) y marca esas escenas con "joke": true. Las bromas nunca sustituyen a la instrucción: el paso tiene que quedar claro igual.',
    `- ${HOOK_RULE}`,
    '- "step": el número del paso (1, 2, 3…) en las escenas que son un paso; 0 en el gancho, las bromas sueltas y el resumen.',
    '- "heading": lo que se ve escrito en la ilustración: la instrucción en 2 a 5 palabras («Desenchufa el PC», «Abre las pestañas»).',
    `- "pose": el gesto del personaje, uno de ${CHARACTER_POSES.map((p) => `"${p}"`).join(', ')} (explain: explica; point: señala la ilustración; surprised: se sorprende; laugh: se ríe; shrug: se encoge de hombros; thumbs: pulgar arriba; think: piensa; wave: saluda). Varíalos y que encajen con lo que dice; "point" cuando hay que mirar algo concreto.`,
    '- Es un tutorial VISUAL: lo importante es lo que se ve. "shots": de 1 a 3 ilustraciones de la escena, descritas en inglés, cada una en una frase concreta: en un paso, primero el plano general (dónde estamos) y después el primer plano de la acción exacta (manos, piezas, la pestaña, la muesca…) y, si ayuda, el detalle o el resultado. Lo importante de cada plano, en el CENTRO de la imagen (ahí se pone el círculo de «mira aquí»). Sin personas de cuerpo entero ni caras, sin texto, letras ni logotipos. En el gancho, las bromas y el resumen basta con 1.',
    ...(mixed
      ? [
          '- Es un vídeo MIXTO: alterna escenas del presentador con escenas de golpe de texto ("mode": "texto"), más o menos una de cada tres, nunca dos de texto seguidas. El gancho puede ser de texto. En una escena de texto el presentador se aparta y en pantalla salen, una a una, las palabras de "heading" en grande (de 2 a 5 palabras con fuerza, sin "shots"); la voz sigue hablando ("narration", una frase corta y rotunda). Las demás escenas llevan "mode": "presentador".'
        ]
      : []),
    `- "theme": uno de ${VIDEO_THEMES.map((t) => `"${t}"`).join(', ')}; para dibujos van mejor "papel", "amanecer" u "oceano".`,
    '- "outro": frase final corta y con gracia.',
    ...(input.structure === 'pasos' ? [...STEPS_STRUCTURE, STEPS_SCENES, '- Los tres pasos llevan "step": 1, 2 y 3; los demás tramos, "step": 0.'] : []),
    ...lookRules(input),
    ...castRules(input),
    ...(input.episode ? episodeRules(input.episode) : []),
    ...(input.manim ? manimRules(input.format, input.manim, true) : []),
    '- Si el tema necesita datos actuales o técnicos, compruébalos antes; no inventes.',
    '- No crees ni cambies archivos: responde solo con el JSON.',
    ...(input.retry ? ['', `Tu respuesta anterior no valía: ${input.retry}`] : []),
    '',
    'Responde SOLO con este JSON, sin nada antes ni después:',
    '{"title": "…", "lang": "' + input.lang + '", "style": "' + (mixed ? 'mixto' : 'cartoon') + '", "theme": "papel", ' + (!input.lookName && (input.refs?.length || input.cast) ? '"look": "…", ' : '') + (input.cast || input.episode ? '"cast": "…", ' : '') + (input.episode ? '"episode": {"summary": "…", "cliffhanger": "…", "question": "…"}, ' : '') + (input.dialogue ? '"speakers": [{"name": "…", "gender": "f"}, {"name": "…", "gender": "m"}], ' : '') + '"scenes": [{' + (mixed ? '"mode": "presentador", ' : '') + '"heading": "…", "narration": "' + (input.dialogue ? '[Nombre1, alegre] … [Nombre2, emocionado] …' : '[alegre] … [emocionado] …') + '", "shots": ["…", "…"], "pose": "point", "step": 1, "joke": false' + (input.motion ? ', "motion": "…"' : '') + '}], "outro": "…"}'
  ].join('\n')
}

/**
 * Encargo de «Charla y tutorial»: dos personajes charlan en una maqueta 3D de juguete mientras arriba salen los pasos
 * («PASO 2/4» y lo que hay que hacer). Empieza con las preguntas del público en burbujas y acaba pidiendo comentar una
 * palabra. Siempre es un diálogo.
 */
function charlaScriptPrompt(input: PromptInput): string {
  const seconds = input.format === 'vertical' ? '35 a 60' : '45 a 80'
  const sketch = !!input.sketch
  // Con los robots de kywai, kywai los anima en 3D en un plató (se mueven, hablan y la cámara cambia de plano): las
  // imágenes son solo lo que sale en la pantalla gigante de detrás. Con un aspecto elegido y motor de imágenes, en
  // cambio, los robots se dibujan en ese aspecto en cada plano (como cualquier otro personaje).
  const robots = isRobots(input.cast?.name) && !input.drawCast
  const lookLine = (example: string): string =>
    input.lookName
      ? `- El aspecto de las imágenes ya lo eligió el usuario («${input.lookName}»): no escribas "look"; kywai le añade a cada imagen el suyo.`
      : example
  const shotRules = robots
    ? [
        '- Los robots de kywai salen animados en 3D en un plató de juguete (kywai los mueve, les pone voz y mueve la cámara): NO los describas en ninguna imagen.',
        sketch
          ? '- "image": lo que se ve en la PANTALLA GIGANTE de detrás en esa escena, en inglés y en una frase: lo que remata el chiste o la situación (un objeto absurdo, una pantalla con el resultado, un dibujo sencillo). Sin personas ni robots, sin texto, letras ni logotipos.'
          : '- "image": lo que se ve en la PANTALLA GIGANTE de detrás en esa escena, en inglés y en una frase: lo que explica el paso (la pantalla o el botón de la app, el resultado, un objeto, un esquema sencillo). Sin personas ni robots, sin texto, letras ni logotipos.',
        lookLine('- "look": el estilo de esas imágenes de la pantalla, en inglés y de 20 a 50 palabras (por ejemplo, una ilustración limpia y luminosa de colores cálidos).')
      ]
    : [
        `- "shots": de 1 a 3 planos de la escena, en inglés, uno por cada cambio de quién habla y en ese orden: un plano general con los dos («wide two-shot of A and B…») y primeros planos de quien habla en cada momento («close-up of A reacting…»). Varía el ángulo de un plano a otro (por encima del hombro, contrapicado, plano medio, detalle de las manos o del objeto), como en una serie, nunca dos iguales seguidos. Di qué hacen, qué gesto ponen y qué objeto de la maqueta tiene que ver con ${sketch ? 'el chiste' : 'el paso'} (una pantalla gigante, una herramienta de juguete…). Los personajes, en la mitad de abajo de la imagen: arriba va ${sketch ? 'el titular de la escena' : 'la tarjeta del paso'}. Sin texto, letras ni logotipos en la imagen.`,
        lookLine('- "look": el bloque de estilo de las imágenes, en inglés y de 30 a 70 palabras. Si no hay otro motivo, usa este (o uno muy parecido): ' + CHARLA_LOOK + '.'),
        '- Inventa tu propia maqueta para el tema (un taller, una cocina, un escritorio gigante…), nunca la de otro vídeo que hayas visto.',
        ...(isRobots(input.cast?.name)
          ? ['- Los personajes son Hermes y Claude, los robots de kywai: en cada plano nómbralos y di qué hacen; su aspecto ya lo pone kywai (no lo describas).']
          : [])
      ]
  const intro = sketch
    ? 'Escribe el guion de un reel «sketch de humor»: dos personajes viven una situación cómica sobre el tema delante de la cámara. NO es un tutorial: primero entretiene. Hay un conflicto (uno quiere algo y el otro lo complica, o algo sale fatal), giros, réplicas rápidas, alguna exageración y un remate. Lo útil del tema sale de pasada, dentro de la escena y de los chistes, nunca como lista de pasos. kywai pone las voces, las imágenes, la música y el montaje: tú solo escribes el guion.'
    : 'Escribe el guion de un reel «charla y tutorial»: dos personajes charlan delante de la cámara en una maqueta 3D de juguete y, mientras hablan, arriba de la pantalla salen los pasos que hay que seguir, uno a uno. Uno pregunta o se queja como lo haría el espectador; el otro le explica cómo se hace, con gracia. kywai pone las voces, las imágenes, las tarjetas de los pasos, la música y el montaje: tú solo escribes el guion.'
  const structureRules = sketch
    ? [
        `- Entre ${MIN_SCENES} y ${MAX_SCENES - 2} escenas: la primera es el gancho (una frase o una situación que sorprende en el primer segundo), en cada escena siguiente la cosa se complica con un chiste o un giro nuevo, y la última es el remate (la sorpresa final o el chiste que lo cierra todo) y la llamada a comentar.`,
        `- ${HOOK_RULE}`,
        ...dialogueRules(input.cast),
        '- "narration": de 2 a 4 frases por escena, cortas (como mucho 35 palabras en total). Marca con *asteriscos* la palabra clave de cada frase.',
        EMOTION_RULE,
        '- Que se note la personalidad de cada uno (uno exagerado y el otro seco, uno optimista y el otro desastre…) y que las emociones cambien: sorpresa, pánico, orgullo, vergüenza, risa.',
        '- "comments" (SOLO en la primera escena): de 2 a 3 comentarios típicos de la gente sobre este tema («A mí me pasa siempre», «¿Esto es real?»), de 3 a 9 palabras, sin nombres de usuario. Salen como burbujas de comentario mientras habla el gancho.',
        '- Nada de pasos: no escribas "step" ni "items".',
        '- "heading": el titular corto de la escena, de 2 a 4 palabras, que suma algo a la broma («Plan perfecto», «Error 404 emocional»).'
      ]
    : [
        `- Entre ${MIN_SCENES + 2} y ${MAX_SCENES - 2} escenas: la primera es el gancho, después un paso por escena EN ORDEN (completos y correctos, de 3 a 5 pasos) y la última, el resumen y la llamada a comentar.`,
        `- ${HOOK_RULE}`,
        ...dialogueRules(input.cast),
        '- "narration": de 2 a 4 frases por escena, cortas (como mucho 35 palabras en total). Marca con *asteriscos* la palabra clave de cada frase.',
        EMOTION_RULE,
        '- "comments" (SOLO en la primera escena): de 2 a 3 preguntas o quejas típicas que la gente escribe en los comentarios sobre este tema («¿Y eso cómo se hace?», «A mí no me funciona»), de 3 a 9 palabras, sin nombres de usuario. Salen como burbujas de comentario mientras habla el gancho, y el diálogo les responde.',
        '- "step": el número del paso (1, 2, 3…) en las escenas que son un paso; 0 en el gancho y en el cierre.',
        '- "heading": el título del paso en la tarjeta de arriba, de 2 a 5 palabras («Abre los ajustes», «Elige la voz»). En el gancho y el cierre, una idea de 2 a 4 palabras.',
        `- "items" (en los pasos): de 1 a ${MAX_ITEMS} puntos cortos de lo que hay que hacer exactamente (de 2 a 6 palabras cada uno, sin punto final: «Pulsa Ajustes», «Activa Modo calidad»). Se marcan uno a uno mientras hablan.`
      ]
  const pic = robots ? '"image": "…"' : '"shots": ["…", "…"]'
  const lookField = input.lookName ? '' : '"look": "…", '
  const scenesJson = sketch
    ? '"scenes": [{"heading": "…", "narration": "[Nombre1, sorprendido] … [Nombre2, alegre] …", "comments": ["…", "…"], ' + pic + '}, {"heading": "…", "narration": "…", ' + pic + '}]'
    : '"scenes": [{"heading": "…", "narration": "[Nombre1, sorprendido] … [Nombre2, alegre] …", "comments": ["…", "…"], ' + pic + ', "step": 0}, {"heading": "…", "narration": "…", "items": ["…", "…"], ' + pic + ', "step": 1}]'
  return [
    intro,
    '',
    `Tema: ${input.topic}`,
    ...(input.source ? ['', 'El vídeo trata de este mensaje (explícalo bien, sin copiarlo entero):', '"""', input.source.slice(0, 6000), '"""'] : []),
    '',
    `Formato: ${input.format === 'vertical' ? 'vertical 9:16 (Reels, TikTok, Shorts)' : 'horizontal 16:9 (YouTube)'}; duración total de ${seconds} segundos.`,
    `Idioma de la voz y los textos: ${input.lang}.`,
    '',
    'Reglas:',
    ...structureRules,
    ...shotRules,
    '- "cta": la llamada a comentar del final: {"word": una palabra corta en mayúsculas que la gente escribirá en los comentarios, "line": por qué comentarla, en 3 a 8 palabras (sin prometer nada que no se pueda cumplir)}. En la última escena, uno de los dos lo dice en voz alta.',
    `- "theme": uno de ${VIDEO_THEMES.map((t) => `"${t}"`).join(', ')} (el color de las tarjetas); para una maqueta cálida van bien "amanecer" o "papel".`,
    '- "outro": frase final corta para la última pantalla.',
    ...(robots ? [] : castRules(input)),
    ...(input.episode ? episodeRules(input.episode) : []),
    '- Si el tema necesita datos actuales o técnicos, compruébalos antes; no inventes.',
    '- No crees ni cambies archivos: responde solo con el JSON.',
    ...(input.retry ? ['', `Tu respuesta anterior no valía: ${input.retry}`] : []),
    '',
    'Responde SOLO con este JSON, sin nada antes ni después:',
    '{"title": "…", "lang": "' + input.lang + '", "style": "charla", "theme": "amanecer", ' + lookField + (input.cast || input.episode ? '"cast": "…", ' : '') + (input.episode ? '"episode": {"summary": "…", "cliffhanger": "…", "question": "…"}, ' : '') + '"speakers": [{"name": "…", "gender": "f"}, {"name": "…", "gender": "m"}], ' + scenesJson + ', "cta": {"word": "…", "line": "…"}, "outro": "…"}'
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
  /** «personajes fijos», «guarda estos personajes»: las imágenes adjuntas pasan a ser los personajes del proyecto. */
  saveCast?: boolean
  /** Personaje elegido en el selector («personaje:…»): los robots o uno creado por el usuario. */
  character?: string
  /** Tipo elegido en el selector («tipo:…»); sin él, en una película el agente decide cómo contarla. */
  kind?: VideoKind
  /** Voz elegida en el selector («voz:…»); sin ella, la mejor que haya. */
  voice?: string
  /** Diálogo entre dos personajes («dialogo:si», «un diálogo entre…», «charlando»). */
  dialogue?: boolean
  /** «guion:repasar»: el guion sale en el chat para repasarlo y se graba con «Grabar». */
  review?: boolean
  /** «estructura:pasos» o «estructura en 3 pasos»: el guion sigue STEPS_STRUCTURE (no en «Charla y tutorial»). */
  structure?: VideoStructure
  /** Aspecto de las imágenes con IA elegido en el selector («aspecto:…», src/shared/imageLooks.ts); no en películas. */
  look?: string
}

/** Piden dos personajes hablando: «un diálogo», «una conversación entre…», «charlando», «a dialogue between…». */
const DIALOGUE_RE = /\b(di[aá]logos?|conversaci[oó]n entre|charla(?:ndo)? entre|dos personajes (?:que )?(?:hablan|hablando|charlan|charlando|conversan)|charlando|conversando|a dialogue|a conversation between|two characters talking)\b/i

/** «con estos personajes fijos», «guarda los personajes», «estos son mis personajes», «same characters». */
const CAST_RE = /(?:^|[\s,])(?:con\s+)?(?:(?:estos|mis|los)\s+)?(?:personajes?\s+fijos?|guarda(?:r|me)?\s+(?:(?:a\s+)?(?:los|estos|mis)\s+)?personajes?|estos\s+son\s+(?:los|mis)\s+personajes?|recurring\s+characters?|same\s+characters?)(?=[\s,.:;]|$)/i

/** Piden dibujos con personaje: «estilo cartoon», «dibujos animados», «un personaje que lo explique», «tutorial»… */
const CARTOON_RE = /\b(cartoons?|caricaturas?|dibujos?(?:\s+animados?)?|animaci[oó]n\s+2d|personajes?|mu[ñn]ecos?|presentador(?:a)?|tutorial(?:es)?|una persona explicando|alguien explicando|animated character|explainer)\b/i

/** Piden el estilo «Charla y tutorial» con palabras: «estilo charla», «charla y tutorial», «talk and tutorial». */
const CHARLA_RE = /(?:^|[\s,])(?:(?:al?|en|con|de)\s+)?(?:(?:estilo|tipo|formato)\s+)?(?:charla\s+y\s+tutorial|estilo\s+charla|talk\s+(?:and|&)\s+tutorial)(?=[\s,.:;]|$)/i
/** Piden el «Sketch de humor» con palabras: «un sketch de humor», «tipo sketch», «comedy sketch». */
const SKETCH_RE = /(?:^|[\s,])(?:(?:al?|en|con|de|un|una)\s+)?(?:(?:estilo|tipo|formato)\s+)?(?:sketch(?:\s+de\s+humor)?|comedy\s+sketch)(?=[\s,.:;]|$)/i

/** Piden varios vídeos sin decir cuáles en el mismo mensaje: «cada uno de esos guiones», «uno por idea»… */
const SEVERAL_RE = /(?:^|[\s,])(?:cada\s+un[oa]|por\s+cada|(?:(?:un[oa]?|v[ií]deo)\s+)?por\s+(?:cada\s+)?(?:gui[oó]n|idea|tema|archivo|punto|cap[ií]tulo|episodio)|(?:de|con|usando)\s+(?:esos|esas|estos|estas|todos\s+(?:esos|estos)|todas\s+(?:esas|estas))\s+(?!personajes?\b)\p{L}+)/iu

/** Piden la estructura con palabras: «estructura en 3 pasos», «con la estructura de reel en tres pasos». */
const STRUCTURE_RE = /(?:^|[\s,])(?:con\s+)?(?:la\s+)?estructura\s+(?:de\s+)?(?:reel\s+)?(?:en|de)\s+(?:3|tres)\s+pasos(?=[\s,.:;]|$)/i

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
    // «créame un vídeo con cada uno de esos guiones», «un vídeo por idea»: son varios y hay que saber cuáles. Lo
    // entiende Hermes, que mira la conversación y lanza la orden «/video …» con una línea por vídeo.
    if (SEVERAL_RE.test(topic)) return null
  }
  const format = formatOf(t)
  // Lo elegido en el selector: «tipo:…» y «personaje:…» (y «estilo:cartoon|dinamico», las marcas de antes). «estilo:…»
  // de la biblioteca se queda en el texto: lo lee takeFilmStyle.
  const choice = videoChoiceOf(topic)
  const kindTag = /(^|\s)(?:tipo:[a-z0-9-]+|estilo:(?:cartoon|dinamico))(?=\s|$)/i.test(topic)
  const charTag = /(^|\s)personaje:[a-z0-9-]+(?=\s|$)/i.test(topic)
  const voice = choice.voice ?? undefined
  const dialogue = !!choice.dialogue || DIALOGUE_RE.test(topic)
  const review = !!choice.review
  let structure = choice.structure
  let look = choice.look ?? undefined
  if (kindTag || charTag || choice.dialogue || review || structure || look || /(^|\s)(?:voz|aspecto):[a-z0-9_-]+(?=\s|$)/i.test(topic)) {
    const film = /(^|\s)estilo:([a-z0-9-]+)(?=\s|$)/i.exec(topic)
    topic = stripVideoTags(topic).replace(/\s{2,}/g, ' ').trim()
    if (film && choice.style) topic = `estilo:${choice.style} ${topic}`.trim()
  }
  // «estructura en 3 pasos» escrito con palabras vale como «estructura:pasos» (y no es parte del tema).
  const structM = STRUCTURE_RE.exec(topic)
  if (structM) {
    structure = 'pasos'
    topic = (topic.slice(0, structM.index) + ' ' + topic.slice(structM.index + structM[0].length)).replace(/\s{2,}/g, ' ').replace(/^[\s,:;]+|[\s,:;]+$/g, '').trim()
    if (structM.index < 2) topic = topic.replace(/^(?:de|sobre|con|para|acerca de|about|on)\s+/i, '')
  }
  // «charla y tutorial» escrito con palabras vale como «tipo:charla» (y no es parte del tema).
  const charlaM = kindTag ? null : CHARLA_RE.exec(topic)
  if (charlaM) topic = (topic.slice(0, charlaM.index) + ' ' + topic.slice(charlaM.index + charlaM[0].length)).replace(/\s{2,}/g, ' ').replace(/^[\s,:;]+|[\s,:;]+$/g, '').trim()
  if (charlaM && charlaM.index < 2) topic = topic.replace(/^(?:de|sobre|con|para|acerca de|about|on)\s+/i, '')
  // «un sketch de humor sobre…» vale como «tipo:sketch».
  const sketchM = kindTag || charlaM ? null : SKETCH_RE.exec(topic)
  if (sketchM) topic = (topic.slice(0, sketchM.index) + ' ' + topic.slice(sketchM.index + sketchM[0].length)).replace(/\s{2,}/g, ' ').replace(/^[\s,:;]+|[\s,:;]+$/g, '').trim()
  if (sketchM && sketchM.index < 2) topic = topic.replace(/^(?:de|sobre|con|para|acerca de|about|on)\s+/i, '')
  const kind: VideoKind | undefined = kindTag ? choice.kind : charlaM ? 'charla' : sketchM ? 'sketch' : undefined
  const kindStyle: VideoStyle | undefined = kind ? (kind === 'presentador' ? 'cartoon' : kind === 'mixto' ? 'mixto' : kind === 'charla' || kind === 'sketch' ? 'charla' : 'dinamico') : undefined
  // Charla y tutorial: siempre un diálogo, con los robots si no se eligió otro personaje y en vertical (es para Reels)
  // salvo que se pida horizontal. La biblioteca de películas no se usa: tiene su propio aspecto de maqueta 3D.
  // El sketch de humor es la misma charla (plató, diálogo, vertical) sin pasos ni tarjetas.
  const charla = kind === 'charla' || kind === 'sketch'
  // «personajes fijos»: no es parte del tema ni pide el estilo de dibujos (que también se activa con «personajes»).
  const castM = CAST_RE.exec(topic)
  const saveCast = !!castM
  if (castM) topic = (topic.slice(0, castM.index) + ' ' + topic.slice(castM.index + castM[0].length)).replace(/\s{2,}/g, ' ').replace(/^[\s,:;]+|[\s,:;]+$/g, '').trim()
  const tNoCast = castM ? t.replace(castM[0], ' ') : t
  // «estilo acuarela sobre…», «estilo:pixel-rpg …»: un estilo de la biblioteca de películas.
  const takenFilm = takeFilmStyle(topic)
  if (takenFilm) topic = takenFilm.rest
  const film = charla ? null : takenFilm
  // «estilo plastilina sobre…», «aspecto cómic de…»: un aspecto de las imágenes con IA (si no es una película).
  const takenLook = takenFilm || look ? null : takeImageLook(topic)
  if (takenLook) {
    topic = takenLook.rest.replace(/^(?:de|sobre|con|para|acerca de|about|on)\s+/i, '')
    look = takenLook.look.id
  }
  // Quita del tema lo que solo dice el formato («vertical para TikTok de…»).
  const stripped = topic
    .replace(/^(?:(?:en\s+)?(?:formato\s+)?(?:vertical|horizontal)|para\s+(?:tiktok|reels?|shorts?|youtube))[\s,:]*(?:(?:de|sobre)\s+)?/i, '')
    .replace(/[\s,]+(?:en\s+)?(?:formato\s+)?(?:vertical|horizontal)\s*$/i, '')
    .replace(/[\s,]+para\s+(?:tiktok|reels?|shorts?|youtube)\s*$/i, '')
    .trim()
  if (film) {
    const rest = stripped.replace(/^(?:(?:de|sobre|con|para|acerca de)\s+)/i, '').trim()
    const prev = !rest || PREVIOUS_RE.test(rest)
    // El estilo pintado a mano, sin otro personaje, lleva los robots.
    const fc = charTag ? choice.character : film.style.slug === KYWAI_FILM ? ROBOTS_CHARACTER : null
    return { topic: prev ? '' : rest, format, fromPrevious: prev, style: kindStyle ?? 'dinamico', film: film.style.slug, ...(kind ? { kind } : {}), ...(saveCast ? { saveCast } : {}), ...(fc ? { character: fc } : {}), ...(voice ? { voice } : {}), ...(dialogue ? { dialogue } : {}), ...(structure ? { structure } : {}) }
  }
  // «estilo cartoon de…», «de dibujos animados sobre…»: el estilo no es parte del tema.
  const style: VideoStyle = kindStyle ?? (CARTOON_RE.test(tNoCast) ? 'cartoon' : 'dinamico')
  const bare = stripped
    .replace(/^(?:(?:al?|en|con|de)\s+)?(?:estilo|tipo|formato)?\s*(?:cartoon|caricatura|dibujos?(?:\s+animados?)?|animado|tutorial)\s*(?:(?:de|sobre|con|para)\s+)?/i, '')
    .trim()
  const fromPrevious = !bare || PREVIOUS_RE.test(bare)
  const character = charTag ? choice.character : charla ? ROBOTS_CHARACTER : null
  if (charla) return { topic: fromPrevious ? '' : bare, format: HORIZONTAL_RE.test(t) ? 'horizontal' : 'vertical', fromPrevious, style, kind, ...(saveCast ? { saveCast } : {}), ...(character ? { character } : {}), ...(voice ? { voice } : {}), dialogue: true, ...(review ? { review } : {}), ...(look ? { look } : {}) }
  return { topic: fromPrevious ? '' : bare, format, fromPrevious, style, ...(kind ? { kind } : {}), ...(saveCast ? { saveCast } : {}), ...(character ? { character } : {}), ...(voice ? { voice } : {}), ...(dialogue ? { dialogue } : {}), ...(review ? { review } : {}), ...(structure ? { structure } : {}), ...(look ? { look } : {}) }
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

/** En un diálogo, la etiqueta con el nombre de quien habla (cada uno con su color) encima de su subtítulo. */
export function speakerChip(script: Pick<VideoScript, 'speakers'>, who: string | undefined, th: { accent: string; accent2: string; onAccent: string }): string {
  const i = who ? (script.speakers ?? []).findIndex((x) => x.name === who) : -1
  if (i < 0) return ''
  return `<span class="who" style="background:${i ? th.accent2 : th.accent};color:${i ? '#ffffff' : th.onAccent}">${esc(who!)}</span>`
}

/** Lo que lee la voz: sin los asteriscos que marcan las palabras clave. */
export function spokenText(narration: string): string {
  return narration.replace(/\*+([^*]+)\*+/g, '$1').replace(/\*/g, '').replace(/\s+/g, ' ').trim()
}

export interface TimedWord {
  text: string
  start: number
  /** Palabra clave (*así* en el guion): sale resaltada. */
  key: boolean
  /** En un diálogo, quién la dice. */
  who?: string
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

/**
 * Las palabras de una escena con su momento. Si la voz se hizo frase a frase, cada frase reparte sus palabras en el
 * rato que suena (las pausas entre frases no se comen el ritmo de los subtítulos).
 */
export function sceneWords(sc: Pick<VideoScene, 'narration' | 'lines' | 'lineTimes'>, start: number, voice: number): TimedWord[] {
  const L = sc.lines
  const T = sc.lineTimes
  if (!L || !T || L.length < 2 || L.length !== T.length) {
    // Sin tiempos por frase (Gemini dice la escena entera): cada frase se lleva su parte de las palabras.
    const words = timedWords(sc.narration, start, voice)
    if (!L?.some((l) => l.who)) return words
    let i = 0
    return L.flatMap((l) => {
      const n = timedWords(l.text, 0, 1).length
      const part = words.slice(i, i + n)
      i += n
      return part.map((w) => (l.who ? { ...w, who: l.who } : w))
    })
  }
  const end = T[T.length - 1].at + T[T.length - 1].dur
  const k = end > 0 ? Math.min(1.05, voice / end) : 1
  return L.flatMap((l, i) => timedWords(l.text, start + T[i].at * k, T[i].dur * k).map((w) => (l.who ? { ...w, who: l.who } : w)))
}

/** Golpes de pantalla: grupos de hasta 4 palabras que cortan en cada pausa (una sola palabra también golpea). */
export function beatsOf(words: TimedWord[]): TimedWord[][] {
  const beats: TimedWord[][] = []
  let cur: TimedWord[] = []
  for (const w of words) {
    // En un diálogo, cada personaje con sus propios golpes.
    if (cur.length && cur[cur.length - 1].who !== w.who) {
      beats.push(cur)
      cur = []
    }
    cur.push(w)
    const pause = /[.,;:!?…]$/.test(w.text)
    const long = cur.map((x) => x.text).join(' ').length
    if (cur.length >= 4 || long >= 22 || pause) {
      beats.push(cur)
      cur = []
    }
  }
  if (cur.length) {
    const last = beats[beats.length - 1]
    if (cur.length === 1 && last && last.length < 4 && last[0].who === cur[0].who) last.push(...cur)
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
  /** Con presentador: la imagen del personaje elegido (relativa). Sin ella, el presentador dibujado de siempre. */
  presenter?: string
}

export type SfxKind = 'whoosh' | 'pop' | 'impact' | 'riser' | 'boing'

export interface Composition {
  html: string
  /** Efectos de sonido en su momento (se mezclan con la música). */
  sfx: { at: number; kind: SfxKind }[]
}

// Sin la de «glitch» (sacudida y cortes): el modo rápido se hacía demasiado intenso.
const TRANSITIONS = ['zoom', 'stripes', 'iris'] as const
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
    `tl.fromTo('#bglife .ring', {rotation: 0}, {rotation: ${Math.round(tl.total * 6)}, duration: ${tl.total}, ease: 'none'}, 0)`
  )

  // Portada: el título entra palabra a palabra, firme pero sin sacudidas.
  const titleWords = script.title.split(/\s+/).filter(Boolean)
  const slam = Math.min(0.28, 1.3 / Math.max(1, titleWords.length))
  html.push(`<section id="intro" class="clip scene" data-start="0" data-duration="${R(tl.intro + 0.3)}">
  <div class="burst"></div>
  <h1 class="title">${titleWords.map((w, i) => `<span class="tw" id="tw${i}">${esc(w)}</span>`).join(' ')}</h1>
</section>`)
  titleWords.forEach((_, i) => {
    const at = R(0.15 + i * slam)
    a.push(`tl.fromTo('#tw${i}', {scale: 1.5, opacity: 0, y: 30}, {scale: 1, opacity: 1, y: 0, duration: 0.35, ease: 'power3.out'}, ${at})`)
    sfx.push({ at: R(at + 0.05), kind: i === titleWords.length - 1 ? 'impact' : 'pop' })
  })
  a.push(
    `tl.fromTo('#intro .burst', {scale: 0.4, opacity: 0.5}, {scale: 2.4, opacity: 0, duration: 1.4, ease: 'power2.out'}, 0.35)`,
    `tl.to('#intro .title', {scale: 1.04, duration: ${R(tl.intro)}, ease: 'none'}, ${R(0.15 + titleWords.length * slam)})`
  )

  script.scenes.forEach((sc, i) => {
    const t = tl.scenes[i]
    const id = `s${i + 1}`
    const clip = input.clips?.[i] ?? null
    const img = clip ? null : images[i]
    const words = sceneWords(sc, t.start + VOICE_LEAD_S, t.voice)
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
        return `<div class="clip beat" id="${id}b${k}" data-start="${R(s - 0.05)}" data-duration="${R(e - s + 0.05)}"><div class="bt">${speakerChip(script, b[0].who, th)}${wordsHtml}</div></div>`
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
      a.push(`tl.fromTo('#${id} .photo img', {scale: 1.16, x: ${dir * 40}}, {scale: 1.04, x: ${-dir * 30}, duration: ${t.duration}, ease: 'power1.out'}, ${t.start})`)
    } else {
      a.push(
        `tl.fromTo('#${id} .bignum', {x: ${vertical ? 300 : 700}, opacity: 0}, {x: ${vertical ? -200 : -500}, opacity: 1, duration: ${t.duration}, ease: 'power1.inOut'}, ${t.start})`,
        `tl.fromTo('#${id} .stripes', {backgroundPositionX: '0px'}, {backgroundPositionX: '${vertical ? 600 : 900}px', duration: ${t.duration}, ease: 'none'}, ${t.start})`
      )
    }
    // Etiqueta que rebota y se balancea.
    a.push(
      `tl.fromTo('#${id}tag', {scale: 0.6, opacity: 0, rotation: -6}, {scale: 1, opacity: 1, rotation: -3, duration: 0.45, ease: 'back.out(1.5)'}, ${R(t.start + 0.12)})`,
      `tl.to('#${id}tag', {rotation: -1, duration: ${R(Math.max(0.5, t.duration - 0.8))}, ease: 'sine.inOut'}, ${R(t.start + 0.62)})`
    )
    sfx.push({ at: R(t.start + 0.14), kind: 'pop' })

    // Golpes de narración.
    beats.forEach((b, k) => {
      const bid = `#${id}b${k}`
      const s = b[0].start
      const style = BEAT_IN[(i * 3 + k) % BEAT_IN.length]
      const from =
        style === 'pop' ? '{scale: 1.18, opacity: 0}' :
        style === 'up' ? '{y: 60, opacity: 0}' :
        style === 'tilt' ? '{rotation: -4, scale: 0.9, opacity: 0}' :
        style === 'side' ? `{x: ${k % 2 ? 110 : -110}, opacity: 0}` :
        '{y: -60, scale: 1.06, opacity: 0}'
      a.push(`tl.fromTo('${bid} .bt', ${from}, {x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, duration: 0.35, ease: 'power3.out'}, ${R(s - 0.05)})`)
      // Un acercamiento suave al empezar la escena (antes era un golpe de cámara en cada frase: demasiado intenso).
      if (k === 0) a.push(`tl.fromTo('#punch', {scale: 1.02}, {scale: 1, duration: 0.6, ease: 'power2.out', immediateRender: false}, ${R(s - 0.05)})`)
      b.forEach((w, j) => {
        const wid = `#${id}b${k}w${j}`
        const next = j + 1 < b.length ? b[j + 1].start : k + 1 < beats.length ? beats[k + 1][0].start : t.start + t.duration
        a.push(`tl.fromTo('${wid}', {scale: 0.85, y: 16, opacity: 0}, {scale: 1, y: 0, opacity: 1, duration: 0.22, ease: 'power2.out'}, ${R(w.start - 0.04)})`)
        // La palabra que suena: resaltada mientras se dice (GSAP 3 no anima clases: colores directos).
        const rest = w.key ? th.accent : img ? '#ffffff' : th.ink
        const on = w.key ? `{backgroundColor: '${th.accent2}', color: '#ffffff', textShadow: 'none'}` : `{backgroundColor: '${th.accent}', color: '${th.onAccent}', textShadow: 'none'}`
        a.push(`tl.set('${wid}', ${on}, ${R(w.start)})`)
        a.push(`tl.set('${wid}', {backgroundColor: 'rgba(0,0,0,0)', color: '${rest}', textShadow: '0 8px 0 rgba(0,0,0,0.28)'}, ${R(Math.max(w.start + 0.12, next - 0.02))})`)
        if (w.key) {
          a.push(`tl.fromTo('${wid}', {scale: 1.1}, {scale: 1, duration: 0.3, ease: 'power2.out', immediateRender: false}, ${R(w.start + 0.05)})`)
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
    `tl.fromTo('#outro .burst', {scale: 0.4, opacity: 0.5}, {scale: 2.4, opacity: 0, duration: 1.4, ease: 'power2.out'}, ${R(tl.outroStart + 0.1 + outWords.length * 0.12)})`,
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
.who { display: block; width: fit-content; margin: 0 auto 0.35em; padding: 0.12em 0.6em; border-radius: 999px; font-size: 0.4em; letter-spacing: 0.04em; text-transform: uppercase; }
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
.tr { z-index: 8; overflow: hidden; pointer-events: none; }
.tr .flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
.tr .sb { position: absolute; top: -20%; bottom: -20%; width: 24%; background: var(--accent); transform: skewX(-18deg); }
.tr .sb:nth-child(2n) { background: var(--accent2); }
.tr .iris { position: absolute; left: 50%; top: 50%; width: ${vertical ? 2400 : 2400}px; height: ${vertical ? 2400 : 2400}px; margin: -1200px 0 0 -1200px; border-radius: 50%; background: var(--accent); }
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
    '<div class="iris"></div>'
  void vertical
  return `<div id="${id}" class="clip tr" data-start="${at}" data-duration="0.5">${inner}</div>`
}

function transitionAnims(id: string, kind: (typeof TRANSITIONS)[number], at: number, vertical: boolean): string[] {
  const s = `#${id}`
  if (kind === 'zoom') {
    return [
      `tl.fromTo('${s} .flash', {opacity: 0}, {opacity: 0.35, duration: 0.15, ease: 'power2.in', yoyo: true, repeat: 1}, ${at})`,
      `tl.fromTo('#punch', {scale: 1.08}, {scale: 1, duration: 0.5, ease: 'power2.out', immediateRender: false}, ${round(at + 0.2)})`
    ]
  }
  if (kind === 'stripes') {
    const W = vertical ? 1080 : 1920
    return [`tl.fromTo('${s} .sb', {x: ${-W * 0.5}}, {x: ${W * 1.4}, duration: 0.5, ease: 'power3.inOut', stagger: 0.03}, ${at})`]
  }
  return [
    `tl.fromTo('${s} .iris', {scale: 0}, {scale: 1, duration: 0.22, ease: 'power3.in'}, ${at})`,
    `tl.to('${s} .iris', {scale: 0, duration: 0.26, ease: 'power3.out'}, ${round(at + 0.22)})`
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

/** Lo fuerte que entra cada tipo cuando es un sonido del banco (los del banco llegan normalizados a pico 1). */
const SFX_GAIN: Record<SfxKind, number> = { whoosh: 0.75, pop: 0.5, impact: 1, riser: 0.7, boing: 0.6 }

/**
 * Efectos de sonido en su momento: «whoosh» en cada transición, «pop» al entrar la etiqueta, «impact» en los golpes de
 * la portada y el cierre, «riser» antes de la primera escena. Con `bank` (src/main/sfxBank.ts: earshot u Openverse CC0)
 * cada efecto es un sonido de verdad, turnando los del mismo tipo; lo que no esté en el banco sale sintetizado (sin
 * derechos de nadie). WAV mono de 16 bits.
 */
export function mixSfx(
  events: { at: number; kind: SfxKind }[],
  seconds: number,
  bank: Partial<Record<SfxKind, Float32Array[]>> = {},
  sampleRate = 44100
): Buffer {
  const n = Math.max(1, Math.floor(seconds * sampleRate))
  const out = new Float32Array(n)
  let seed = 12345
  const noise = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2147483648 - 1
  }
  const turn: Partial<Record<SfxKind, number>> = {}
  for (const ev of events) {
    const i0 = Math.floor(ev.at * sampleRate)
    const takes = bank[ev.kind]
    if (takes?.length) {
      const k = turn[ev.kind] ?? 0
      turn[ev.kind] = k + 1
      const take = takes[k % takes.length]
      const g = SFX_GAIN[ev.kind]
      for (let j = 0; j < take.length && i0 + j < n; j++) if (i0 + j >= 0) out[i0 + j] += take[j] * g
      continue
    }
    synthOne(ev.kind, out, i0, sampleRate, noise)
  }
  return wav16(out, sampleRate, 0.9)
}

/** Solo los efectos sintetizados (sin banco). */
export function synthSfx(events: { at: number; kind: SfxKind }[], seconds: number, sampleRate = 44100): Buffer {
  return mixSfx(events, seconds, {}, sampleRate)
}

function synthOne(kind: SfxKind, out: Float32Array, i0: number, sampleRate: number, noise: () => number): void {
  const n = out.length
  const len = Math.floor(sampleRate * (kind === 'whoosh' ? 0.45 : kind === 'pop' ? 0.09 : kind === 'riser' ? 0.9 : kind === 'boing' ? 0.55 : 0.5))
  let lp = 0
  let ph = 0
  for (let k = 0; k < len && i0 + k < n; k++) {
    if (i0 + k < 0) continue
    const t = k / sampleRate
    const x = k / len
    let v = 0
    if (kind === 'whoosh') {
      // Ruido filtrado que sube y baja (filtro paso bajo con corte que barre).
      const cut = 0.02 + 0.5 * Math.sin(Math.PI * x)
      lp += cut * (noise() - lp)
      v = lp * Math.sin(Math.PI * x) * 1.4
    } else if (kind === 'pop') {
      v = Math.sin(2 * Math.PI * (900 - 500 * x) * t) * Math.exp(-x * 6) * 0.6
    } else if (kind === 'boing') {
      // Muelle de dibujos animados: tono que oscila y cae.
      const f = 180 + 140 * Math.sin(2 * Math.PI * 9 * t) * Math.exp(-t * 4) + 120 * (1 - x)
      ph += f / sampleRate
      v = Math.sin(2 * Math.PI * ph) * Math.exp(-x * 3.5) * 0.7
    } else if (kind === 'impact') {
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
