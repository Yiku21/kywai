// «/editar» y «/recortes»: kywai edita las grabaciones del usuario (no solo crea vídeos desde cero).
//
//  · «/editar» con un vídeo adjunto: quita las muletillas («eh», «mmm»), los silencios largos, las tomas repetidas y
//    los arranques en falso; pone un fundido de 30 ms en cada corte (no se oyen chasquidos), corrige el color, limpia
//    y nivela la voz y quema subtítulos palabra a palabra.
//  · «/recortes» con un vídeo largo: saca los mejores momentos como clips cortos (verticales por defecto, para Reels y
//    TikTok), con el encuadre siguiendo a quien habla, subtítulos y el título del clip arriba los primeros segundos.
//
// Cómo: Whisper (en el propio equipo, como el dictado) transcribe con el tiempo de cada palabra; un agente lee la
// transcripción numerada y decide qué sobra (o qué momentos valen la pena) en JSON; kywai corta y monta con ffmpeg y
// repasa el resultado (filmCheck). Ideas de browser-use/video-use y louisedesadeleer/clipify (las dos MIT),
// reimplementadas aquí: sin claves de pago y sin Remotion.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureUv } from './voice'

// ---------- la orden ----------

export type FootageMode = 'editar' | 'recortes'
/** Cómo queda la imagen: la de la grabación tal cual, o recortada a otro formato. */
export type FootageFrame = 'original' | 'vertical' | 'cuadrado' | 'horizontal'
/** El retoque de color. */
export type FootageLook = 'natural' | 'calido' | 'frio' | 'contraste' | 'ninguno'

export interface FootageRequest {
  mode: FootageMode
  /** Lo que pide el usuario («quita la parte del café», «los momentos más graciosos»…). */
  note: string
  frame: FootageFrame
  look: FootageLook
  subtitles: boolean
  /** «/recortes»: cuántos clips (por defecto 3). */
  count?: number
}

export const MAX_CLIPS = 8
const LOOKS: readonly FootageLook[] = ['natural', 'calido', 'frio', 'contraste', 'ninguno']

const fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/**
 * «/editar [lo que quieres]» o «/recortes [n] [lo que buscas]», con marcas opcionales en cualquier sitio: «vertical»,
 * «cuadrado», «horizontal», «sin subtítulos», «color:cálido|frío|contraste|natural|ninguno». null si no es la orden.
 */
export function parseFootageRequest(text: string): FootageRequest | null {
  const m = /^\/(editar|edita|edit|recortes|recorta|recortar|clips|clipify)(?=\s|$)([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  const mode: FootageMode = /^(editar|edita|edit)$/i.test(m[1]) ? 'editar' : 'recortes'
  let rest = ` ${m[2].trim()} `
  let frame: FootageFrame = mode === 'recortes' ? 'vertical' : 'original'
  let look: FootageLook = 'natural'
  let subtitles = true
  let count: number | undefined
  const take = (re: RegExp, on: (x: RegExpExecArray) => void): void => {
    const x = re.exec(rest)
    if (!x) return
    on(x)
    rest = rest.replace(x[0], ' ')
  }
  take(/\scolor\s*:\s*(\S+)/i, (x) => {
    const v = fold(x[1]) as FootageLook
    if (LOOKS.includes(v)) look = v
  })
  take(/\ssin\s+subt[ií]tulos\b/i, () => (subtitles = false))
  take(/\s(?:vertical|9:16)(?=\s)/i, () => (frame = 'vertical'))
  take(/\s(?:cuadrado|1:1)(?=\s)/i, () => (frame = 'cuadrado'))
  take(/\s(?:horizontal|16:9)(?=\s)/i, () => (frame = 'horizontal'))
  if (mode === 'recortes') {
    take(/\s(\d{1,2})(?:\s+(?:clips?|recortes?|momentos?))?(?=\s)/i, (x) => (count = Math.max(1, Math.min(MAX_CLIPS, parseInt(x[1], 10)))))
  }
  return { mode, note: rest.replace(/\s{2,}/g, ' ').trim(), frame, look, subtitles, ...(mode === 'recortes' ? { count: count ?? 3 } : {}) }
}

// ---------- la transcripción ----------

/** Una palabra dicha, con su número (el que usa el agente) y cuándo empieza y acaba (s). */
export interface Word {
  i: number
  s: number
  e: number
  w: string
}

/** Las palabras del JSON de whisper-ctranslate2 (--word_timestamps True --output_format json). */
export function parseWhisperWords(json: string): Word[] {
  const data = JSON.parse(json) as { segments?: { words?: { start: number; end: number; word: string }[] }[] }
  const out: Word[] = []
  for (const seg of data.segments ?? [])
    for (const w of seg.words ?? []) {
      const text = String(w.word ?? '').trim()
      if (!text || !Number.isFinite(w.start) || !Number.isFinite(w.end)) continue
      out.push({ i: out.length, s: Math.max(0, w.start), e: Math.max(w.start, w.end), w: text })
    }
  return out
}

/** Muletillas que se quitan siempre («eh», «em», «mmm», «um»…). Palabras de verdad como «este» o «pues», no. */
export function isFiller(word: string): boolean {
  const w = fold(word).replace(/[^a-z]/g, '')
  return /^(e+h+|e+m+|e+h+m+|m+h*|h+m+|u+m+|u+h+|a+h+|e+r+m+|uhm+)$/.test(w)
}

const clock = (s: number): string => {
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

/** Las palabras en líneas (por pausas y finales de frase), para leerlas de corrido. */
export function wordLines(words: Word[], maxWords = 16): Word[][] {
  const lines: Word[][] = []
  let cur: Word[] = []
  for (const w of words) {
    const prev = cur[cur.length - 1]
    if (prev && (w.s - prev.e > 0.7 || cur.length >= maxWords || /[.?!…]$/.test(prev.w))) {
      lines.push(cur)
      cur = []
    }
    cur.push(w)
  }
  if (cur.length) lines.push(cur)
  return lines
}

/** Para «/editar»: cada palabra con su número delante («{12}hola»), una línea por frase con su minuto. */
export function numberedTranscript(words: Word[]): string {
  return wordLines(words)
    .map((l) => `[${clock(l[0].s)}] ${l.map((w) => `{${w.i}}${w.w}`).join(' ')}`)
    .join('\n')
}

/** Para «/recortes»: una línea por frase con el número de su primera y última palabra («#120-#135»). */
export function rangedTranscript(words: Word[]): string {
  return wordLines(words, 24)
    .map((l) => `#${l[0].i}-#${l[l.length - 1].i} [${clock(l[0].s)}] ${l.map((w) => w.w).join(' ')}`)
    .join('\n')
}

// ---------- los encargos ----------

const MAX_INLINE = 90_000

export function editPrompt(input: { note: string; name: string; seconds: number; transcript: string; frames: string[]; reframe: boolean }): string {
  const clipped = input.transcript.length > MAX_INLINE
  return [
    `Eres el montador de kywai. Hay que editar esta grabación del usuario: «${input.name}» (${Math.round(input.seconds)} s).`,
    ...(input.note ? [`Lo que pide el usuario: ${input.note}`] : []),
    '',
    'Abajo está la transcripción hecha con Whisper: cada palabra lleva su número delante ({12}hola) y cada línea, su minuto.',
    'Decide qué partes SOBRAN. Quita:',
    '- Las tomas repetidas: si dice lo mismo dos o más veces, deja solo la última buena y quita las anteriores enteras.',
    '- Los arranques en falso y las frases que deja a medias para empezar otra vez («hoy os enseño, perdón, hoy os enseño…»: fuera la primera).',
    '- Lo que no es para el público: «¿se oye?», «espera que empiezo», «corta esto», contar hasta tres, hablar con alguien de fuera.',
    '- Lo que el usuario pida quitar.',
    'NO quites contenido bueno ni cambies el orden. Las muletillas sueltas («eh», «mmm») y los silencios largos los quita kywai solo: no hace falta que las listes.',
    '',
    'Responde SOLO con este JSON, sin nada más:',
    '{"title": "título corto del vídeo (para el nombre del archivo)", "cut": [[desde, hasta], …]' + (input.reframe ? ', "x": 0.5' : '') + '}',
    '- "cut": tramos de números de palabra que se quitan, los dos incluidos ([40, 52] quita de la 40 a la 52). [] si no sobra nada.',
    ...(input.reframe
      ? ['- "x": dónde está la persona que habla, de izquierda (0) a derecha (1), mirando los fotogramas: kywai recorta la imagen a vertical o cuadrado alrededor de ella cuando no la encuentra solo.']
      : []),
    ...(input.frames.length ? ['', 'Fotogramas de la grabación (ábrelos para ver qué se ve):', ...input.frames.map((f) => `- ${f}`)] : []),
    '',
    `Transcripción${clipped ? ' (recortada: es muy larga; edita lo que ves y deja el resto)' : ''}:`,
    '"""',
    clipped ? input.transcript.slice(0, MAX_INLINE) : input.transcript,
    '"""',
    '',
    'No crees ni cambies archivos: kywai monta el vídeo con tu JSON.'
  ].join('\n')
}

export function clipsPrompt(input: { note: string; name: string; seconds: number; count: number; transcript: string; frames: string[]; reframe: boolean }): string {
  const clipped = input.transcript.length > MAX_INLINE
  return [
    `Eres el editor de redes de kywai. Saca los ${input.count} mejores momentos de esta grabación del usuario como clips cortos para Reels, TikTok y Shorts: «${input.name}» (${Math.round(input.seconds / 60)} min).`,
    ...(input.note ? [`Lo que busca el usuario: ${input.note}`] : []),
    '',
    'Abajo está la transcripción hecha con Whisper: cada línea lleva el número de su primera y última palabra (#120-#135) y su minuto.',
    'Un buen clip:',
    '- Dura entre 15 y 60 segundos y se entiende solo, sin haber visto el resto.',
    '- Empieza con un gancho en la primera frase (una afirmación fuerte, una pregunta, algo gracioso o sorprendente), nunca con «bueno», «entonces» o a media idea.',
    '- Acaba cuando termina la idea o justo en el remate. Mejor corto y redondo que largo.',
    '- No se pisa con otro clip. Los clips van ordenados del mejor al peor.',
    '',
    'Responde SOLO con este JSON, sin nada más:',
    '{"clips": [{"title": "título del clip, gancho de 3 a 7 palabras", "from": 120, "to": 190, "why": "por qué engancha, en una frase"' + (input.reframe ? ', "x": 0.5' : '') + '}]}',
    '- "from" y "to": número de la primera y la última palabra del clip.',
    ...(input.reframe
      ? ['- "x": dónde está la persona que habla en ese momento, de izquierda (0) a derecha (1), mirando los fotogramas. kywai sigue a quien habla él solo; esto vale cuando no lo encuentra.']
      : []),
    ...(input.frames.length ? ['', 'Fotogramas de la grabación (ábrelos para ver dónde está cada persona):', ...input.frames.map((f) => `- ${f}`)] : []),
    '',
    `Transcripción${clipped ? ' (recortada: es muy larga; elige entre lo que ves)' : ''}:`,
    '"""',
    clipped ? input.transcript.slice(0, MAX_INLINE) : input.transcript,
    '"""',
    '',
    'No crees ni cambies archivos: kywai monta los clips con tu JSON.'
  ].join('\n')
}

/** El primer objeto JSON de la respuesta del agente (aunque venga entre ``` o con una frase delante). */
function jsonOf(text: string): Record<string, unknown> {
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('La respuesta no trae el JSON')
  return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>
}

const clamp01 = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined)

export interface EditPlan {
  title: string
  /** Números de palabra que se quitan. */
  cut: Set<number>
  x?: number
}

export function parseEditPlan(text: string, nWords: number): EditPlan {
  const j = jsonOf(text)
  const cut = new Set<number>()
  for (const r of Array.isArray(j.cut) ? j.cut : []) {
    if (!Array.isArray(r) || r.length < 1) continue
    let a = Math.round(Number(r[0]))
    let b = Math.round(Number(r[r.length - 1]))
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    if (a > b) [a, b] = [b, a]
    for (let i = Math.max(0, a); i <= Math.min(nWords - 1, b); i++) cut.add(i)
  }
  if (nWords > 0 && cut.size > nWords * 0.7) throw new Error('quitaba casi todo el vídeo')
  const title = typeof j.title === 'string' && j.title.trim() ? j.title.trim().slice(0, 80) : 'vídeo editado'
  const x = clamp01(j.x)
  return { title, cut, ...(x !== undefined ? { x } : {}) }
}

export interface ClipPlan {
  title: string
  from: number
  to: number
  why: string
  x?: number
}

/** Los clips del agente, válidos (dentro del vídeo, de 5 a 120 s y sin pisarse), como mucho `count`. */
export function parseClipsPlan(text: string, words: Word[], count: number): ClipPlan[] {
  const j = jsonOf(text)
  const out: ClipPlan[] = []
  for (const c of Array.isArray(j.clips) ? (j.clips as Record<string, unknown>[]) : []) {
    let from = Math.round(Number(c?.from))
    let to = Math.round(Number(c?.to))
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue
    if (from > to) [from, to] = [to, from]
    from = Math.max(0, from)
    to = Math.min(words.length - 1, to)
    if (from > to) continue
    const secs = words[to].e - words[from].s
    if (secs < 5 || secs > 120) continue
    if (out.some((o) => from <= o.to && to >= o.from)) continue
    const x = clamp01(c.x)
    out.push({
      title: typeof c.title === 'string' && c.title.trim() ? c.title.trim().slice(0, 80) : `Clip ${out.length + 1}`,
      from,
      to,
      why: typeof c.why === 'string' ? c.why.trim().slice(0, 200) : '',
      ...(x !== undefined ? { x } : {})
    })
    if (out.length >= count) break
  }
  if (!out.length) throw new Error('no trae ningún clip válido (de 5 a 120 s)')
  return out
}

// ---------- los cortes ----------

/** Un tramo de la grabación que se queda (s), con sus palabras. */
export interface Segment {
  a: number
  b: number
  words: Word[]
}

/** Pausa a partir de la cual se corta (s): lo que sobra se quita y queda un respiro natural. */
export const MAX_GAP = 0.45
const PAD_IN = 0.1
const PAD_OUT = 0.16

/**
 * Los tramos que se quedan: las palabras de `words` (todas o las de un clip) menos las quitadas y las muletillas,
 * partidas donde se quitó algo o hay una pausa larga. Cada tramo lleva un poco de margen sin pisar lo quitado.
 */
export function keptSegments(words: Word[], cut: Set<number> = new Set(), all: Word[] = words): Segment[] {
  const byIndex = new Map(all.map((w) => [w.i, w]))
  const kept = words.filter((w) => !cut.has(w.i) && !isFiller(w.w))
  const groups: Word[][] = []
  for (const w of kept) {
    const g = groups[groups.length - 1]
    const prev = g?.[g.length - 1]
    if (prev && w.i === prev.i + 1 && w.s - prev.e <= MAX_GAP) g.push(w)
    else groups.push([w])
  }
  const segs: Segment[] = []
  for (const g of groups) {
    const first = g[0]
    const last = g[g.length - 1]
    const before = byIndex.get(first.i - 1)
    const after = byIndex.get(last.i + 1)
    // El margen no entra en la palabra quitada de al lado (ni más de media pausa si es otro tramo que se queda).
    const minA = before ? (cut.has(before.i) || isFiller(before.w) ? before.e : (before.e + first.s) / 2) : 0
    const maxB = after ? (cut.has(after.i) || isFiller(after.w) ? after.s : (last.e + after.s) / 2) : last.e + PAD_OUT
    const a = Math.max(0, Math.max(minA, first.s - PAD_IN))
    const b = Math.max(a + 0.05, Math.min(maxB, last.e + PAD_OUT))
    const prev = segs[segs.length - 1]
    if (prev && a <= prev.b + 0.02) {
      prev.b = Math.max(prev.b, b)
      prev.words.push(...g)
    } else segs.push({ a: round3(a), b: round3(b), words: [...g] })
  }
  for (const s of segs) s.b = round3(s.b)
  return segs
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

/** Las palabras con el tiempo que tendrán en el vídeo montado (los tramos uno detrás de otro). */
export function remapWords(segs: Segment[]): Word[] {
  const out: Word[] = []
  let off = 0
  for (const s of segs) {
    for (const w of s.words) out.push({ ...w, s: round3(off + Math.max(0, w.s - s.a)), e: round3(off + Math.min(s.b, w.e) - s.a) })
    off += s.b - s.a
  }
  return out
}

export const totalSeconds = (segs: Segment[]): number => segs.reduce((n, s) => n + (s.b - s.a), 0)

// ---------- los subtítulos ----------

/** Grupos de como mucho 3 palabras (se corta en los signos y en las pausas): lo que sale a la vez en pantalla. */
export function captionChunks(words: Word[], maxWords = 3, maxChars = 22): Word[][] {
  const out: Word[][] = []
  let cur: Word[] = []
  for (const w of words) {
    const prev = cur[cur.length - 1]
    const len = cur.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length
    if (prev && (cur.length >= maxWords || len > maxChars || /[.,;:?!…]$/.test(prev.w) || w.s - prev.e > 0.35)) {
      out.push(cur)
      cur = []
    }
    cur.push(w)
  }
  if (cur.length) out.push(cur)
  return out
}

const assTime = (s: number): string => {
  const cs = Math.max(0, Math.round(s * 100))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const sec = Math.floor((cs % 6000) / 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}

const assText = (s: string): string => s.replace(/\\/g, '').replace(/[{}]/g, '').toUpperCase()

/**
 * Subtítulos ASS: el grupo de palabras en blanco con borde negro, la que suena en amarillo. Con `title`, el título
 * del clip arriba los primeros 3 s (como en los Reels).
 */
export function buildAss(words: Word[], size: { w: number; h: number }, title?: string): string {
  const vertical = size.h > size.w
  const fs = Math.round(Math.min(size.w, size.h) * (vertical ? 0.075 : 0.07))
  const outline = Math.max(2, Math.round(fs * 0.09))
  const marginV = Math.round(size.h * (vertical ? 0.22 : 0.08))
  const lines = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${size.w}`,
    `PlayResY: ${size.h}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Sub,Arial,${fs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${outline},${Math.round(outline / 2)},2,40,40,${marginV},1`,
    `Style: Title,Arial,${Math.round(fs * 0.9)},&H00FFFFFF,&H00FFFFFF,&H00000000,&HB4000000,-1,0,0,0,100,100,0,0,3,${Math.round(fs * 0.3)},0,8,60,60,${Math.round(size.h * 0.1)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ]
  if (title) lines.push(`Dialogue: 1,${assTime(0)},${assTime(3)},Title,,0,0,0,,{\\fad(150,250)}${assText(title)}`)
  for (const chunk of captionChunks(words)) {
    chunk.forEach((w, k) => {
      const end = k < chunk.length - 1 ? chunk[k + 1].s : Math.max(w.e, w.s + 0.25)
      if (end <= w.s) return
      const text = chunk.map((x, j) => (j === k ? `{\\c&H0000D7FF&}${assText(x.w)}{\\c&H00FFFFFF&}` : assText(x.w))).join(' ')
      lines.push(`Dialogue: 0,${assTime(w.s)},${assTime(end)},Sub,,0,0,0,,${text}`)
    })
  }
  return lines.join('\n') + '\n'
}

// ---------- el encuadre ----------

/** Medidas de salida de cada formato. */
export function targetSize(frame: FootageFrame, src: { w: number; h: number }): { w: number; h: number } {
  if (frame === 'vertical') return { w: 1080, h: 1920 }
  if (frame === 'cuadrado') return { w: 1080, h: 1080 }
  if (frame === 'horizontal') return { w: 1920, h: 1080 }
  // Tal cual, como mucho 1920 de lado largo y en medidas pares.
  const k = Math.min(1, 1920 / Math.max(src.w, src.h))
  return { w: Math.round((src.w * k) / 2) * 2, h: Math.round((src.h * k) / 2) * 2 }
}

/** Ancho de imagen pequeña y alto con que se busca a quien habla (gris, 4 por segundo). */
export const MOTION_W = 96
export const MOTION_H = 54
export const MOTION_FPS = 4

/**
 * Dónde está quien habla a lo largo del vídeo, sin reconocer caras (como Clipify): se compara cada fotograma con el
 * anterior y, cada segundo, se busca la franja (del ancho del recorte) con más movimiento; quien habla mueve la boca
 * y la cabeza. El encuadre solo salta (corte seco) si otra franja gana claramente durante 2 s seguidos.
 * Devuelve los tramos [{t, x}] (x = centro, de 0 a 1), o [] si casi no hay movimiento (pantalla, plano fijo).
 */
export function speakerTrack(raw: Uint8Array, cropFrac: number, w = MOTION_W, h = MOTION_H, fps = MOTION_FPS): { t: number; x: number }[] {
  const size = w * h
  const n = Math.floor(raw.length / size)
  if (n < 3 || cropFrac >= 0.98) return []
  const cw = Math.max(1, Math.round(cropFrac * w))
  // Movimiento de cada columna en cada segundo.
  const secs: number[][] = []
  for (let k = 1; k < n; k++) {
    const sec = Math.floor((k - 1) / fps)
    const col = (secs[sec] ??= new Array(w).fill(0))
    const a = (k - 1) * size
    const b = k * size
    for (let r = 0; r < h; r++)
      for (let c = 0; c < w; c++) {
        const i = r * w + c
        col[c] += Math.abs(raw[b + i] - raw[a + i])
      }
  }
  const best = (col: number[]): { x: number; share: number; sum: number } => {
    const sums: number[] = []
    let run = 0
    for (let c = 0; c < cw; c++) run += col[c]
    sums.push(run)
    for (let c = cw; c < w; c++) {
      run += col[c] - col[c - cw]
      sums.push(run)
    }
    const top = Math.max(...sums)
    // Dentro de la mejor franja, el centro del movimiento: quien habla queda centrado, no en el borde.
    const at = sums.indexOf(top)
    let mass = 0
    for (let c = at; c < at + cw; c++) mass += col[c] * (c + 0.5)
    const sum = col.reduce((s, v) => s + v, 0)
    return { x: top ? mass / top / w : 0.5, share: sum ? top / sum : 0, sum }
  }
  const total = new Array(w).fill(0)
  for (const col of secs) for (let c = 0; c < w; c++) total[c] += col[c]
  const overall = best(total)
  // Casi nada se mueve (de media menos de 1 nivel de gris por píxel y fotograma): no hay a quien seguir.
  if (overall.sum / ((n - 1) * size) < 1) return []
  const track = [{ t: 0, x: round3(overall.x) }]
  let current = overall.x
  let lastSwitch = 0
  for (let s = 0; s < secs.length - 1; s++) {
    const here = best(secs[s])
    const next = best(secs[s + 1])
    const moved = Math.abs(here.x - current) > 0.18 && Math.abs(next.x - here.x) < 0.1
    const clear = here.share > 0.45 && next.share > 0.45
    if (moved && clear && s - lastSwitch >= 2) {
      current = (here.x + next.x) / 2
      lastSwitch = s
      track.push({ t: s, x: round3(current) })
    }
  }
  // Si empieza en otra franja, el primer tramo arranca ya ahí.
  if (track.length > 1 && track[1].t === 0) track.shift()
  return track
}

/**
 * El filtro de imagen de ffmpeg que deja el vídeo en su formato: recorte siguiendo a quien habla (cortes secos según
 * `track`, o centrado en `x`), o, si la grabación es más estrecha que el formato, encajada sobre su propia imagen
 * desenfocada. Termina en las medidas de `targetSize`.
 */
export function frameFilter(frame: FootageFrame, src: { w: number; h: number }, track: { t: number; x: number }[], x = 0.5): string {
  const out = targetSize(frame, src)
  const even = (n: number): number => Math.max(2, Math.floor(n / 2) * 2)
  if (frame === 'original') return `scale=${out.w}:${out.h}`
  const srcAr = src.w / src.h
  const outAr = out.w / out.h
  if (Math.abs(srcAr - outAr) < 0.02) return `scale=${out.w}:${out.h},setsar=1`
  if (srcAr > outAr) {
    const cw = even(src.h * outAr)
    const px = (cx: number): number => Math.round(Math.max(0, Math.min(src.w - cw, cx * src.w - cw / 2)))
    const pts = track.length ? track : [{ t: 0, x }]
    let expr = String(px(pts[pts.length - 1].x))
    for (let k = pts.length - 2; k >= 0; k--) expr = `if(lt(t,${pts[k + 1].t}),${px(pts[k].x)},${expr})`
    return `crop=w=${cw}:h=${even(src.h)}:x='${expr}':y=0,scale=${out.w}:${out.h},setsar=1`
  }
  return (
    `split=2[bg][fg];[bg]scale=${out.w}:${out.h}:force_original_aspect_ratio=increase,crop=${out.w}:${out.h},gblur=sigma=40,eq=brightness=-0.08[bgb];` +
    `[fg]scale=${out.w}:${out.h}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1`
  )
}

/** El retoque de color de cada aspecto (suave: que mejore sin que se note el filtro). */
export function lookFilter(look: FootageLook): string {
  switch (look) {
    case 'calido':
      return 'colorbalance=rs=0.05:gs=0.01:bs=-0.05:rm=0.03:bm=-0.03,eq=contrast=1.05:saturation=1.12'
    case 'frio':
      return 'colorbalance=rs=-0.04:bs=0.05:bm=0.03,eq=contrast=1.05:saturation=1.05'
    case 'contraste':
      return 'eq=contrast=1.12:saturation=1.18:gamma=0.97'
    case 'ninguno':
      return ''
    default:
      return 'eq=contrast=1.04:saturation=1.10'
  }
}

/** La voz: sin zumbidos graves, sin ruido de fondo y al volumen de las redes (−14 LUFS). */
export const VOICE_FILTER = 'highpass=f=80,afftdn=nf=-25,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000'

/** Fundido de 30 ms al principio y al final de cada tramo: los cortes no suenan a chasquido. */
export const FADE_S = 0.03

/** Los argumentos de ffmpeg de un tramo (imagen y sonido, a fotogramas fijos y audio sin comprimir para unirlos). */
export function segmentArgs(src: string, seg: { a: number; b: number }, fps: number, out: string): string[] {
  const len = Math.max(0.05, seg.b - seg.a)
  return [
    '-y', '-v', 'error',
    '-ss', seg.a.toFixed(3), '-i', src, '-t', len.toFixed(3),
    '-map', '0:v:0', '-map', '0:a:0',
    '-vf', `scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=${fps}`,
    '-af', `afade=t=in:st=0:d=${FADE_S},afade=t=out:st=${Math.max(0, len - FADE_S).toFixed(3)}:d=${FADE_S}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2',
    out
  ]
}

// ---------- programas ----------

interface Out {
  code: number | null
  out: string
}

/** Un programa con sus argumentos tal cual (sin shell). */
function exec(cmd: string, args: string[], opts: { timeoutMs: number; signal?: AbortSignal; cwd?: string }): Promise<Out> {
  return new Promise((resolve) => {
    let out = ''
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } })
    } catch (e) {
      resolve({ code: -1, out: (e as Error).message })
      return
    }
    const take = (b: Buffer): void => {
      out = (out + b.toString('utf8')).slice(-20000)
    }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)
    const kill = (): void => {
      try {
        child.kill()
      } catch {
        /* ya terminó */
      }
    }
    const timer = setTimeout(kill, opts.timeoutMs)
    opts.signal?.addEventListener('abort', kill, { once: true })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', kill)
      resolve({ code, out })
    })
  })
}

const lastLine = (out: string): string =>
  out
    .split('\n')
    .filter((l) => l.trim() && !/symlink|developer mode|^warn/i.test(l))
    .pop()
    ?.slice(0, 200) ?? ''

export interface MediaInfo {
  seconds: number
  w: number
  h: number
  fps: number
  audio: boolean
}

/** Medidas, duración, fotogramas por segundo y si tiene sonido (con la rotación del móvil ya aplicada). */
export async function probeMedia(file: string): Promise<MediaInfo> {
  const r = await exec('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,avg_frame_rate:stream_side_data=rotation:format=duration', '-of', 'json', file], { timeoutMs: 30_000 })
  if (r.code !== 0) throw new Error(`No se pudo leer el vídeo${lastLine(r.out) ? `: ${lastLine(r.out)}` : ''}`)
  const j = JSON.parse(r.out) as { streams?: { codec_type: string; width?: number; height?: number; avg_frame_rate?: string; side_data_list?: { rotation?: number }[] }[]; format?: { duration?: string } }
  const v = j.streams?.find((s) => s.codec_type === 'video')
  if (!v?.width || !v.height) throw new Error('Ese archivo no tiene imagen: adjunta un vídeo')
  const [num, den] = (v.avg_frame_rate ?? '30/1').split('/').map(Number)
  const raw = den ? num / den : 30
  const fps = Number.isFinite(raw) && raw > 1 && raw <= 60 ? Math.round(raw) : 30
  const rot = Math.abs(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0) % 180 === 90
  return {
    seconds: parseFloat(j.format?.duration ?? '0') || 0,
    w: rot ? v.height : v.width,
    h: rot ? v.width : v.height,
    fps,
    audio: !!j.streams?.some((s) => s.codec_type === 'audio')
  }
}

/**
 * Prepara la grabación para el agente: saca el audio y lo transcribe con Whisper (en el equipo) palabra a palabra.
 * Deja palabras.json en `dir`. Los fotogramas los saca quien llama (videoFrames).
 */
export async function transcribeWords(file: string, dir: string, signal?: AbortSignal, onStep?: (text: string) => void): Promise<Word[]> {
  mkdirSync(dir, { recursive: true })
  const saved = join(dir, 'palabras.json')
  if (existsSync(saved)) return JSON.parse(readFileSync(saved, 'utf8')) as Word[]
  await ensureUv()
  onStep?.('Sacando el audio de la grabación')
  const audio = join(dir, 'audio.wav')
  const a = await exec('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vn', '-ar', '16000', '-ac', '1', audio], { timeoutMs: 20 * 60_000, signal })
  if (!existsSync(audio)) throw new Error(`No se pudo leer el audio del vídeo${lastLine(a.out) ? `: ${lastLine(a.out)}` : ''}`)
  if (signal?.aborted) throw new Error('Cancelada')
  onStep?.('Transcribiendo palabra a palabra con Whisper en este equipo')
  const r = await exec(
    'uvx',
    ['--from', 'whisper-ctranslate2', 'whisper-ctranslate2', audio, '--model', 'small', '--word_timestamps', 'True', '--output_format', 'json', '--output_dir', dir, '--compute_type', 'int8', '--device', 'cpu'],
    { timeoutMs: 120 * 60_000, signal }
  )
  const json = readdirSync(dir).find((f) => f.startsWith('audio') && f.endsWith('.json'))
  if (!json) throw new Error(`No se pudo transcribir${lastLine(r.out) ? `: ${lastLine(r.out)}` : ''}`)
  const words = parseWhisperWords(readFileSync(join(dir, json), 'utf8'))
  if (words.length < 5) throw new Error('La grabación casi no tiene voz: no hay nada que editar por lo que se dice')
  writeFileSync(saved, JSON.stringify(words))
  rmSync(audio, { force: true })
  return words
}

/** Busca a quien habla en el vídeo ya cortado (ver speakerTrack). [] si no se pudo. */
async function trackSpeaker(file: string, dir: string, cropFrac: number, signal?: AbortSignal): Promise<{ t: number; x: number }[]> {
  const raw = join(dir, 'movimiento.gray')
  const r = await exec('ffmpeg', ['-y', '-v', 'error', '-i', file, '-vf', `fps=${MOTION_FPS},scale=${MOTION_W}:${MOTION_H},format=gray`, '-f', 'rawvideo', raw], { timeoutMs: 20 * 60_000, signal })
  if (r.code !== 0 || !existsSync(raw)) return []
  try {
    return speakerTrack(new Uint8Array(readFileSync(raw)), cropFrac)
  } finally {
    rmSync(raw, { force: true })
  }
}

export interface RenderFootageInput {
  src: string
  info: MediaInfo
  segs: Segment[]
  frame: FootageFrame
  look: FootageLook
  subtitles: boolean
  /** Título que sale arriba los primeros segundos (los clips). */
  title?: string
  /** Dónde está quien habla si no se encuentra solo (0-1). */
  x?: number
  out: string
  /** Carpeta de trabajo (se vacía al terminar). */
  dir: string
  signal?: AbortSignal
  onStep?: (text: string, p: number) => void
}

/**
 * Monta el vídeo: cada tramo con su fundido → unidos con la voz limpia → encuadre, color y subtítulos. Devuelve la
 * duración y si los subtítulos no se pudieron quemar (ffmpeg sin libass).
 */
export async function renderFootage(input: RenderFootageInput): Promise<{ seconds: number; subtitles: boolean }> {
  const { src, info, segs, dir, signal } = input
  if (!segs.length) throw new Error('No queda nada que montar')
  if (!info.audio) throw new Error('El vídeo no tiene sonido: no hay voz con la que editar')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  try {
    const list: string[] = []
    for (let k = 0; k < segs.length; k++) {
      if (signal?.aborted) throw new Error('Cancelada')
      input.onStep?.('Cortando los tramos', 0.1 + (0.5 * k) / segs.length)
      const part = join(dir, `t${String(k).padStart(4, '0')}.mkv`)
      const r = await exec('ffmpeg', segmentArgs(src, segs[k], info.fps, part), { timeoutMs: 10 * 60_000, signal })
      if (r.code !== 0 || !existsSync(part)) throw new Error(`No se pudo cortar el tramo ${k + 1}${lastLine(r.out) ? `: ${lastLine(r.out)}` : ''}`)
      list.push(`file '${part.replace(/'/g, "'\\''")}'`)
    }
    writeFileSync(join(dir, 'tramos.txt'), list.join('\n') + '\n')
    input.onStep?.('Uniendo los tramos y limpiando la voz', 0.65)
    const joined = join(dir, 'unido.mkv')
    const j = await exec('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', join(dir, 'tramos.txt'), '-c:v', 'copy', '-af', VOICE_FILTER, '-c:a', 'pcm_s16le', joined], { timeoutMs: 60 * 60_000, signal })
    if (j.code !== 0 || !existsSync(joined)) throw new Error(`No se pudieron unir los tramos${lastLine(j.out) ? `: ${lastLine(j.out)}` : ''}`)

    const size = targetSize(input.frame, info)
    let track: { t: number; x: number }[] = []
    if (input.frame !== 'original' && info.w / info.h > size.w / size.h + 0.02) {
      input.onStep?.('Buscando a quien habla para el encuadre', 0.75)
      track = await trackSpeaker(joined, dir, (info.h * (size.w / size.h)) / info.w, signal)
    }
    const words = remapWords(segs)
    const ass = join(dir, 'subtitulos.ass')
    const wantSubs = input.subtitles || !!input.title
    if (wantSubs) writeFileSync(ass, buildAss(input.subtitles ? words : [], size, input.title))
    const base = [frameFilter(input.frame, info, track, input.x), lookFilter(input.look)].filter(Boolean).join(',')
    const encode = (withSubs: boolean): Promise<Out> =>
      exec(
        'ffmpeg',
        ['-y', '-v', 'error', '-i', joined, '-filter_complex', `[0:v]${base}${withSubs ? ',ass=subtitulos.ass' : ''}[v]`, '-map', '[v]', '-map', '0:a:0',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', input.out],
        // El archivo de subtítulos se nombra sin ruta (desde su carpeta): las rutas de Windows rompen el filtro.
        { timeoutMs: 60 * 60_000, signal, cwd: dir }
      )
    input.onStep?.('Encuadre, color y subtítulos', 0.8)
    mkdirSync(join(input.out, '..'), { recursive: true })
    let subs = wantSubs
    let r = await encode(wantSubs)
    if (r.code !== 0 && wantSubs) {
      subs = false
      r = await encode(false)
    }
    if (r.code !== 0 || !existsSync(input.out)) throw new Error(`No se pudo montar el vídeo${lastLine(r.out) ? `: ${lastLine(r.out)}` : ''}`)
    return { seconds: totalSeconds(segs), subtitles: subs && input.subtitles }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
