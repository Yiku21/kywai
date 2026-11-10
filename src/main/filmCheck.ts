// Comprobación de una película con estilo antes de entregarla (ver completeFilm en orchestrator.ts):
//  1. kywai mira el MP4 con ffmpeg (pantallas negras, imagen congelada, silencios, sin sonido, demasiado corta y, en
//     los estilos 3D, si parece un dibujo plano de formas de colores lisos en vez de una escena 3D);
//  2. si está limpio, otro agente (de otra familia) mira una hoja de contacto contra beats.md y las reglas de animación.
// Con fallos, la película vuelve a quien la hizo con la lista (hasta MAX_FILM_FIXES veces).
import { ALIVE_3D, ALIVE_ACTION, BEATS_FILE, FILM_FILE } from './filmLibrary'

/** Correcciones que se piden por película (cada una seguida de otra comprobación). */
export const MAX_FILM_FIXES = 2

/** Cuántas imágenes lleva la hoja de contacto (4 columnas × 3 filas). */
export const SHEET_COLS = 4
export const SHEET_ROWS = 3

/** Los filtros de ffmpeg que buscan los fallos (una sola pasada por el vídeo, sin escribir nada). */
export function filmCheckArgs(file: string, hasAudio: boolean): string[] {
  return [
    '-hide_banner',
    '-nostats',
    '-i',
    file,
    '-vf',
    'blackdetect=d=0.8:pix_th=0.10,freezedetect=n=0.001:d=4',
    ...(hasAudio ? ['-af', 'silencedetect=n=-50dB:d=4'] : ['-an']),
    '-f',
    'null',
    '-'
  ]
}

/** Los fotogramas repartidos por la película en una sola imagen (hoja de contacto). */
export function contactSheetArgs(file: string, out: string, seconds: number, vertical: boolean): string[] {
  const n = SHEET_COLS * SHEET_ROWS
  const fps = (n / Math.max(seconds, 1)).toFixed(4)
  const w = vertical ? 270 : 480
  return ['-y', '-v', 'error', '-i', file, '-vf', `fps=${fps},scale=${w}:-2,tile=${SHEET_COLS}x${SHEET_ROWS}:padding=6:color=white`, '-frames:v', '1', '-q:v', '3', out]
}

const num = (s: string): number => Math.round(parseFloat(s) * 10) / 10

/**
 * Los fallos que se ven en la salida de ffmpeg, como frases para el agente. Se perdonan los fundidos a negro del
 * principio y del final, y que la última imagen se quede quieta unos segundos (el cierre).
 */
export function parseFilmCheck(log: string, seconds: number, hasAudio: boolean): string[] {
  const issues: string[] = []
  if (seconds > 0 && seconds < 5) issues.push(`Dura solo ${num(String(seconds))} s: la película está incompleta.`)
  if (!hasAudio) issues.push('No tiene pista de sonido: le faltan la música, los efectos y la voz.')
  for (const m of log.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/g)) {
    const a = parseFloat(m[1])
    const b = parseFloat(m[2])
    const fadeIn = a <= 0.3 && b - a < 1.5
    const fadeOut = seconds > 0 && b >= seconds - 0.3 && b - a < 2
    if (!fadeIn && !fadeOut) issues.push(`Pantalla negra de ${num(m[1])} s a ${num(m[2])} s.`)
  }
  const starts = [...log.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]))
  const ends = [...log.matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]))
  starts.forEach((a, i) => {
    const b = ends[i] ?? seconds
    const closing = seconds > 0 && b >= seconds - 0.3 && b - a <= 5
    if (!closing) issues.push(`Imagen congelada de ${num(String(a))} s a ${num(String(b))} s (nada se mueve).`)
  })
  if (hasAudio) {
    const sStarts = [...log.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Math.max(0, parseFloat(m[1])))
    const sEnds = [...log.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]))
    sStarts.forEach((a, i) => {
      const b = sEnds[i] ?? seconds
      const tail = seconds > 0 && a >= seconds - 1.5
      if (!tail) issues.push(`Silencio total de ${num(String(a))} s a ${num(String(b))} s (sin música ni sonido).`)
    })
  }
  return issues.slice(0, 8)
}

/** Fotogramas que se miran para saber si una película 3D parece un dibujo plano. */
export const FLAT_FRAMES = 6
/** Ancho (px) al que se reducen esos fotogramas: basta para ver si la imagen son unos pocos colores lisos. */
export const FLAT_WIDTH = 96
/** A partir de esta parte de la imagen en sus 12 colores más usados, el fotograma se ve plano (colores lisos). */
export const FLAT_SHARE = 0.65

/** Los fotogramas repartidos por la película, pequeños y en PPM (fácil de leer sin librerías). */
export function flatFramesArgs(file: string, outPattern: string, seconds: number): string[] {
  const fps = (FLAT_FRAMES / Math.max(seconds, 1)).toFixed(4)
  return ['-y', '-v', 'error', '-i', file, '-vf', `fps=${fps},scale=${FLAT_WIDTH}:-2`, '-frames:v', String(FLAT_FRAMES), outPattern]
}

/** Lee un PPM binario (P6, 8 bits): ancho, alto y los píxeles RGB. null si no lo es. */
export function parsePpm(buf: Uint8Array): { w: number; h: number; px: Uint8Array } | null {
  const fields: string[] = []
  let i = 0
  while (fields.length < 4 && i < buf.length) {
    while (i < buf.length && /\s/.test(String.fromCharCode(buf[i]))) i++
    if (buf[i] === 35) {
      while (i < buf.length && buf[i] !== 10) i++
      continue
    }
    let tok = ''
    while (i < buf.length && !/\s/.test(String.fromCharCode(buf[i]))) tok += String.fromCharCode(buf[i++])
    fields.push(tok)
  }
  i++
  const [magic, w, h, max] = [fields[0], Number(fields[1]), Number(fields[2]), Number(fields[3])]
  if (magic !== 'P6' || !(w > 0) || !(h > 0) || max !== 255 || buf.length < i + w * h * 3) return null
  return { w, h, px: buf.subarray(i, i + w * h * 3) }
}

/**
 * Qué parte de la imagen ocupan sus 12 colores más usados (de 0 a 1), con los colores agrupados de 4 en 4 niveles.
 * Un dibujo de formas lisas (cielo de un color, suelo de otro, casa roja…) pasa de 0,7; un render 3D con luz,
 * sombras y materiales se queda por debajo de 0,55. null en un fotograma casi negro (no dice nada).
 */
export function flatShare(px: Uint8Array): number | null {
  const n = Math.floor(px.length / 3)
  if (!n) return null
  const counts = new Map<number, number>()
  let luma = 0
  for (let k = 0; k < n * 3; k += 3) {
    const r = px[k]
    const g = px[k + 1]
    const b = px[k + 2]
    luma += 0.299 * r + 0.587 * g + 0.114 * b
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (luma / n < 40) return null
  const top = [...counts.values()].sort((a, b) => b - a).slice(0, 12)
  return top.reduce((a, b) => a + b, 0) / n
}

/**
 * El fallo «parece un dibujo plano» de una película 3D: la mitad o más de los fotogramas que se pueden juzgar son
 * colores lisos. Hacen falta al menos 3 fotogramas juzgables (los casi negros no cuentan).
 */
export function flatLookIssue(shares: (number | null)[]): string | null {
  const judged = shares.filter((x): x is number => x !== null)
  const flat = judged.filter((x) => x >= FLAT_SHARE).length
  if (judged.length < 3 || flat * 2 < judged.length) return null
  return `Parece un dibujo plano, no una escena 3D: en ${flat} de ${judged.length} fotogramas casi toda la imagen son unos pocos colores lisos (formas sueltas sin luz, sombras ni materiales). Rehazla en 3D de verdad: modelos con volumen, luz principal de lado con sombras, materiales con brillo y rugosidad, y profundidad (niebla o desenfoque al fondo).`
}

/** Lo que se le pide a quien hizo la película cuando hay que corregirla. */
export function filmFixRequest(by: string, issues: string, work: string, round: number): string {
  return [
    `${by} comprobó tu película (${FILM_FILE}) y vio esto (corrección ${round} de ${MAX_FILM_FIXES}):`,
    issues,
    '',
    `Corrígelo sobre lo que ya hay en ${work} (no empieces de cero), vuelve a renderizar ${FILM_FILE} con sonido, repasa los beats afectados y responde igual que la primera vez («Título: …» y una frase).`
  ].join('\n')
}

export interface FilmReviewInput {
  styleName: string
  topic: string
  work: string
  sheet: string
  seconds: number
  /** beats.md tal cual lo dejó el agente (vacío si no lo escribió). */
  beats: string
  author: string
  reply: string
  is3d: boolean
  vertical: boolean
}

/** El encargo de quien revisa la película: mirar la hoja de contacto contra los beats y las reglas, sin tocar nada. */
export function filmReviewPrompt(i: FilmReviewInput): string {
  const n = SHEET_COLS * SHEET_ROWS
  const every = Math.round((i.seconds / n) * 10) / 10
  return [
    `${i.author} acaba de hacer una película corta en estilo «${i.styleName}» sobre: ${i.topic}`,
    'Tú la revisas con ojos nuevos antes de entregarla. No cambies ningún archivo: solo mira y da tu veredicto.',
    '',
    `## La hoja de contacto (imagen adjunta: ${i.sheet})`,
    `${n} fotogramas de la película (${Math.round(i.seconds)} s, ${i.vertical ? 'vertical' : 'horizontal'}), uno cada ${every} s, de izquierda a derecha y de arriba abajo. La carpeta de la película es ${i.work}: puedes abrir poster.jpg, el código y las capturas que dejó.`,
    '',
    `## Lo que planeó (${BEATS_FILE})`,
    i.beats.trim() ? i.beats.trim().slice(0, 4000) : `No dejó ${BEATS_FILE}: compara con lo que cuenta abajo y con el tema.`,
    '',
    `## Lo que dijo ${i.author} al terminar`,
    i.reply.trim().slice(0, 1500) || '(sin texto)',
    '',
    '## Las reglas de animación que debía seguir',
    ...ALIVE_ACTION,
    ...(i.is3d ? ALIVE_3D : []),
    '',
    '## Qué debes comprobar',
    '- Que se cuenta lo planeado: cada beat se reconoce en algún fotograma y en orden.',
    '- Fallos que se ven: fotogramas vacíos o rotos, personajes que cambian de aspecto entre planos o salen cortados sin querer, texto cortado o ilegible, cosas fuera de cuadro, la misma imagen repetida en muchos fotogramas seguidos (plano muerto), acciones sin anticipación o impactos que se resuelven con un fundido.',
    ...(i.is3d
      ? ['- Que se vea 3D de verdad: volumen, luz con sombras y materiales. Si parece un dibujo plano de cuadrados y círculos de colores lisos (como un marcador de posición), es un fallo.']
      : ['- Que se vea acabada: formas geométricas sueltas de colores lisos que hacen de marcador de posición, en lugar de lo que pide el estilo, son un fallo.']),
    '- Solo fallos reales que se ven: nada de gustos ni ideas nuevas. Si cuenta lo planeado y no tiene esos fallos, CUMPLE.',
    '',
    '## Qué debes responder',
    'Primera línea exacta: «VEREDICTO: CUMPLE» o «VEREDICTO: FALLOS».',
    'Si hay fallos, debajo como mucho 5, cada uno con el segundo aproximado y qué hay que cambiar, en orden de importancia. Si cumple, debajo una frase con lo que comprobaste.'
  ].join('\n')
}
