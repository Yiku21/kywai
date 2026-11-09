// Estudio de vídeo (parte sin efectos): el guion que escribe el agente, cómo se lee y se valida, y la composición
// HTML de HyperFrames que sale de él (escenas, rótulos, subtítulos, transiciones). El agente solo escribe el guion;
// voz, imágenes, música y montaje los hace kywai siempre igual (videoStudio.ts), para que el resultado no dependa de
// que el agente improvise.

export type VideoFormat = 'horizontal' | 'vertical'

export const VIDEO_THEMES = ['noche', 'amanecer', 'oceano', 'bosque', 'neon', 'papel'] as const
export type VideoTheme = (typeof VIDEO_THEMES)[number]

export interface VideoScene {
  /** Rótulo grande en pantalla (pocas palabras). */
  heading: string
  /** Lo que dice la voz en esta escena. */
  narration: string
  /** Descripción de la imagen de fondo (para generarla). Vacía: fondo de diseño sin imagen. */
  image: string
}

export interface VideoScript {
  title: string
  /** Código de idioma de la voz y los textos (es, en, pt, fr…). */
  lang: string
  theme: VideoTheme
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
    scenes.push({ heading, narration, image: clean(o.image, 400) })
  }
  if (scenes.length < MIN_SCENES) throw new Error(`El guion necesita al menos ${MIN_SCENES} escenas con «narration» (tiene ${scenes.length}).`)
  const theme = VIDEO_THEMES.includes(raw.theme as VideoTheme) ? (raw.theme as VideoTheme) : 'noche'
  const lang = (clean(raw.lang, 8).toLowerCase().match(/^[a-z]{2}/)?.[0] ?? 'es')
  return { title, lang, theme, scenes: scenes.slice(0, MAX_SCENES), outro: clean(raw.outro, 90) || title }
}

/** Encargo para el agente: solo el guion, en JSON. */
export function videoScriptPrompt(input: { topic: string; source?: string; format: VideoFormat; lang: string; retry?: string }): string {
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
    `- Entre ${MIN_SCENES + 1} y ${MAX_SCENES - 2} escenas. La primera engancha en una frase; la última cierra con una idea clara.`,
    '- "narration": lo que dice la voz, 1 o 2 frases naturales por escena (unas 12 a 30 palabras). Sin emojis, sin listas, sin siglas raras: se lee en voz alta.',
    '- "heading": el rótulo grande de la escena, de 2 a 6 palabras.',
    '- "image": la imagen de fondo de la escena, descrita en inglés en una frase concreta (sujeto, ambiente, luz). Sin texto, letras ni logotipos en la imagen.',
    `- "theme": uno de ${VIDEO_THEMES.map((t) => `"${t}"`).join(', ')}, el que mejor le vaya al tema.`,
    '- "outro": frase final corta para la última pantalla.',
    '- Si el tema necesita datos actuales, compruébalos antes; no inventes cifras.',
    '- No crees ni cambies archivos: responde solo con el JSON.',
    ...(input.retry ? ['', `Tu respuesta anterior no valía: ${input.retry}`] : []),
    '',
    'Responde SOLO con este JSON, sin nada antes ni después:',
    '{"title": "…", "lang": "' + input.lang + '", "theme": "noche", "scenes": [{"heading": "…", "narration": "…", "image": "…"}], "outro": "…"}'
  ].join('\n')
}

// ---------- petición del usuario ----------

export interface VideoRequest {
  topic: string
  format: VideoFormat
  /** «de esto», «de este mensaje»: el vídeo es del mensaje anterior del chat. */
  fromPrevious: boolean
}

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
  // Quita del tema lo que solo dice el formato («vertical para TikTok de…»).
  const stripped = topic
    .replace(/^(?:(?:en\s+)?(?:formato\s+)?(?:vertical|horizontal)|para\s+(?:tiktok|reels?|shorts?|youtube))[\s,:]*(?:(?:de|sobre)\s+)?/i, '')
    .replace(/[\s,]+(?:en\s+)?(?:formato\s+)?(?:vertical|horizontal)\s*$/i, '')
    .replace(/[\s,]+para\s+(?:tiktok|reels?|shorts?|youtube)\s*$/i, '')
    .trim()
  const fromPrevious = !stripped || PREVIOUS_RE.test(stripped)
  return { topic: fromPrevious ? '' : stripped, format, fromPrevious }
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

export const INTRO_S = 2.4
export const OUTRO_S = 3.2
const SCENE_PAD_S = 0.7
/** La voz de cada escena empieza este rato después del corte. */
export const VOICE_LEAD_S = 0.35

export function buildTimeline(voiceDurations: number[]): VideoTimeline {
  let at = INTRO_S
  const scenes = voiceDurations.map((v) => {
    const duration = Math.max(2.5, VOICE_LEAD_S + v + SCENE_PAD_S)
    const s = { start: round(at), duration: round(duration), voice: round(v) }
    at += duration
    return s
  })
  return { intro: INTRO_S, scenes, outroStart: round(at), outro: OUTRO_S, total: round(at + OUTRO_S) }
}

const round = (n: number): number => Math.round(n * 100) / 100

/** Trozos del subtítulo (de 3 a 6 palabras) con su momento, repartidos por longitud dentro de la voz. */
export function captionChunks(text: string, start: number, voice: number): { text: string; start: number; duration: number }[] {
  const words = text.split(/\s+/).filter(Boolean)
  const chunks: string[][] = []
  let cur: string[] = []
  for (const w of words) {
    cur.push(w)
    const ends = /[.,;:!?…]$/.test(w)
    if (cur.length >= 6 || (ends && cur.length >= 3)) {
      chunks.push(cur)
      cur = []
    }
  }
  if (cur.length) {
    if (cur.length < 3 && chunks.length) chunks[chunks.length - 1].push(...cur)
    else chunks.push(cur)
  }
  const weight = (c: string[]): number => c.join(' ').length + 4
  const totalW = chunks.reduce((a, c) => a + weight(c), 0) || 1
  let at = start
  return chunks.map((c) => {
    const d = (voice * weight(c)) / totalW
    const out = { text: c.join(' '), start: round(at), duration: round(d) }
    at += d
    return out
  })
}

const THEMES: Record<VideoTheme, { bg: string; bg2: string; ink: string; accent: string; accent2: string; font: string }> = {
  noche: { bg: '#0b1020', bg2: '#1b2450', ink: '#f4f6ff', accent: '#7c9cff', accent2: '#ff7ab6', font: 'sans' },
  amanecer: { bg: '#2a0f2e', bg2: '#ff7a59', ink: '#fff7f0', accent: '#ffc36b', accent2: '#ff5d8f', font: 'sans' },
  oceano: { bg: '#04223a', bg2: '#0a6c8f', ink: '#effbff', accent: '#4fe3d2', accent2: '#ffd166', font: 'sans' },
  bosque: { bg: '#0f1f17', bg2: '#2f5d3a', ink: '#f3f7ea', accent: '#a7e06b', accent2: '#f2c14e', font: 'serif' },
  neon: { bg: '#07060f', bg2: '#251046', ink: '#ffffff', accent: '#00f0ff', accent2: '#ff2bd6', font: 'sans' },
  papel: { bg: '#f4efe6', bg2: '#e6dccb', ink: '#1d1b18', accent: '#d9480f', accent2: '#1c7ed6', font: 'serif' }
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface CompositionInput {
  script: VideoScript
  format: VideoFormat
  timeline: VideoTimeline
  /** Imagen de cada escena (ruta relativa a la carpeta del vídeo) o null. */
  images: (string | null)[]
  /** Pista de audio ya mezclada (relativa). */
  audio: string
  /** Ruta relativa de gsap.min.js. */
  gsap: string
}

/**
 * La composición entera en un HTML (HyperFrames): portada, una escena por bloque del guion con su rótulo animado,
 * imagen con movimiento lento, subtítulos al ritmo de la voz y barra de progreso, cortinillas entre escenas y cierre.
 * Todo determinista: nada de Math.random ni fechas (el render salta a cada fotograma).
 */
export function buildComposition(input: CompositionInput): string {
  const { script, format, timeline: tl, images } = input
  const vertical = format === 'vertical'
  const W = vertical ? 1080 : 1920
  const H = vertical ? 1920 : 1080
  const th = THEMES[script.theme]
  const fontStack = th.font === 'serif' ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif"
  const layouts = ['cover', 'split', 'kinetic'] as const
  const sceneHtml: string[] = []
  const anims: string[] = []

  // Portada.
  sceneHtml.push(`<section id="intro" class="clip scene intro" data-start="0" data-duration="${tl.intro + 0.4}">
  <div class="glow g1"></div><div class="glow g2"></div>
  <div class="intro-inner"><div class="kicker"></div><h1 class="intro-title">${esc(script.title)}</h1></div>
</section>`)
  anims.push(
    `tl.fromTo('#intro .kicker', {scaleX: 0}, {scaleX: 1, duration: 0.6, ease: 'power3.out'}, 0.15)`,
    `tl.fromTo('#intro .intro-title', {y: 60, opacity: 0, filter: 'blur(10px)'}, {y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.9, ease: 'power4.out'}, 0.3)`,
    `tl.fromTo('#intro .g1', {x: -120, y: -40}, {x: 120, y: 40, duration: ${tl.intro + 0.4}, ease: 'none'}, 0)`,
    `tl.fromTo('#intro .g2', {x: 100, y: 60}, {x: -100, y: -60, duration: ${tl.intro + 0.4}, ease: 'none'}, 0)`
  )

  script.scenes.forEach((sc, i) => {
    const t = tl.scenes[i]
    const id = `s${i + 1}`
    const layout = images[i] ? layouts[i % layouts.length] : 'kinetic'
    const img = images[i]
    const words = sc.heading.split(/\s+/).filter(Boolean)
    const heading = words.map((w) => `<span class="w"><span>${esc(w)}</span></span>`).join(' ')
    const caps = captionChunks(sc.narration, t.start + VOICE_LEAD_S, t.voice)
    const capsHtml = caps
      .map((c, k) => `<div class="cap clip" id="${id}c${k}" data-start="${c.start}" data-duration="${c.duration}"><span>${esc(c.text)}</span></div>`)
      .join('\n  ')
    const media = img
      ? layout === 'split'
        ? `<div class="card"><img src="${esc(img)}" alt=""></div>`
        : `<div class="bg"><img src="${esc(img)}" alt=""></div><div class="shade"></div>`
      : `<div class="glow g1"></div><div class="glow g2"></div><div class="grid"></div>`
    sceneHtml.push(`<section id="${id}" class="clip scene ${layout}${img ? ' has-img' : ''}" data-start="${t.start}" data-duration="${t.duration}">
  ${media}
  <div class="text"><div class="num">${String(i + 1).padStart(2, '0')}</div><h2 class="heading">${heading}</h2></div>
</section>
<div class="caps">
  ${capsHtml}
</div>`)
    const at = t.start
    if (img && layout !== 'split') {
      const from = i % 2 ? 'scale: 1.18, x: -40' : 'scale: 1.05, x: 40'
      const to = i % 2 ? 'scale: 1.04, x: 30' : 'scale: 1.2, x: -30'
      anims.push(`tl.fromTo('#${id} .bg img', {${from}}, {${to}, duration: ${t.duration}, ease: 'none'}, ${at})`)
    }
    if (layout === 'split') {
      anims.push(
        `tl.fromTo('#${id} .card', {x: ${vertical ? 0 : 260}, y: ${vertical ? 220 : 0}, rotate: ${i % 2 ? -4 : 4}, opacity: 0}, {x: 0, y: 0, rotate: ${i % 2 ? -2 : 2}, opacity: 1, duration: 0.9, ease: 'power3.out'}, ${at + 0.1})`,
        `tl.fromTo('#${id} .card img', {scale: 1.15}, {scale: 1, duration: ${t.duration}, ease: 'none'}, ${at})`
      )
    }
    if (!img) {
      anims.push(
        `tl.fromTo('#${id} .g1', {x: -160, y: 0}, {x: 160, y: -80, duration: ${t.duration}, ease: 'none'}, ${at})`,
        `tl.fromTo('#${id} .g2', {x: 140, y: 80}, {x: -140, y: -40, duration: ${t.duration}, ease: 'none'}, ${at})`,
        `tl.fromTo('#${id} .grid', {backgroundPosition: '0px 0px'}, {backgroundPosition: '0px 240px', duration: ${t.duration}, ease: 'none'}, ${at})`
      )
    }
    anims.push(
      `tl.fromTo('#${id} .num', {opacity: 0, x: -30}, {opacity: 1, x: 0, duration: 0.5, ease: 'power2.out'}, ${at + 0.15})`,
      `tl.fromTo('#${id} .heading .w > span', {yPercent: 110}, {yPercent: 0, duration: 0.7, ease: 'power4.out', stagger: 0.08}, ${at + 0.2})`
    )
    for (let k = 0; k < caps.length; k++) {
      anims.push(`tl.fromTo('#${id}c${k} span', {y: 18, opacity: 0, scale: 0.96}, {y: 0, opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out'}, ${caps[k].start})`)
    }
    // Cortinilla al entrar en la escena (tapa el corte).
    const wipeAt = Math.max(0, at - 0.3)
    sceneHtml.push(`<div id="w${id}" class="clip wipe" data-start="${round(wipeAt)}" data-duration="0.62"><div class="wipe-a"></div><div class="wipe-b"></div></div>`)
    const axis = vertical ? 'yPercent' : 'xPercent'
    anims.push(
      `tl.fromTo('#w${id} .wipe-a', {${axis}: -101}, {${axis}: 101, duration: 0.6, ease: 'power3.inOut'}, ${round(wipeAt)})`,
      `tl.fromTo('#w${id} .wipe-b', {${axis}: -101}, {${axis}: 101, duration: 0.6, ease: 'power3.inOut'}, ${round(wipeAt + 0.06)})`
    )
  })

  // Cierre.
  sceneHtml.push(`<section id="outro" class="clip scene intro" data-start="${tl.outroStart}" data-duration="${tl.outro}">
  <div class="glow g1"></div><div class="glow g2"></div>
  <div class="intro-inner"><h2 class="outro-text">${esc(script.outro)}</h2><div class="kicker"></div></div>
</section>`)
  sceneHtml.push(`<div id="wout" class="clip wipe" data-start="${round(tl.outroStart - 0.3)}" data-duration="0.62"><div class="wipe-a"></div><div class="wipe-b"></div></div>`)
  const axis = vertical ? 'yPercent' : 'xPercent'
  anims.push(
    `tl.fromTo('#wout .wipe-a', {${axis}: -101}, {${axis}: 101, duration: 0.6, ease: 'power3.inOut'}, ${round(tl.outroStart - 0.3)})`,
    `tl.fromTo('#wout .wipe-b', {${axis}: -101}, {${axis}: 101, duration: 0.6, ease: 'power3.inOut'}, ${round(tl.outroStart - 0.24)})`,
    `tl.fromTo('#outro .outro-text', {scale: 0.92, opacity: 0}, {scale: 1, opacity: 1, duration: 0.8, ease: 'power3.out'}, ${tl.outroStart + 0.2})`,
    `tl.fromTo('#outro .kicker', {scaleX: 0}, {scaleX: 1, duration: 0.6, ease: 'power3.out'}, ${tl.outroStart + 0.5})`,
    `tl.to('#outro .intro-inner', {opacity: 0, duration: 0.6, ease: 'power1.in'}, ${round(tl.total - 0.7)})`,
    `tl.fromTo('#bar', {scaleX: 0}, {scaleX: 1, duration: ${tl.total}, ease: 'none'}, 0)`
  )

  const big = vertical ? 112 : 104
  return `<!doctype html>
<html lang="${esc(script.lang)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<script src="${esc(input.gsap)}"></script>
<style>
:root { --bg: ${th.bg}; --bg2: ${th.bg2}; --ink: ${th.ink}; --accent: ${th.accent}; --accent2: ${th.accent2}; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: var(--bg); }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: ${fontStack}; color: var(--ink);
  background: radial-gradient(120% 90% at 20% 10%, var(--bg2) 0%, var(--bg) 60%); }
.clip { position: absolute; inset: 0; }
.scene { overflow: hidden; }
.glow { position: absolute; width: ${vertical ? 900 : 1100}px; height: ${vertical ? 900 : 1100}px; border-radius: 50%; filter: blur(120px); opacity: 0.55; }
.g1 { background: var(--accent); left: -20%; top: -25%; }
.g2 { background: var(--accent2); right: -25%; bottom: -30%; opacity: 0.4; }
.grid { position: absolute; inset: -240px 0 0 0; opacity: 0.12;
  background-image: linear-gradient(var(--ink) 1px, transparent 1px), linear-gradient(90deg, var(--ink) 1px, transparent 1px);
  background-size: 120px 120px; }
.intro-inner { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 36px; padding: 0 ${vertical ? 90 : 220}px; text-align: center; }
.kicker { width: 180px; height: 10px; border-radius: 6px; background: linear-gradient(90deg, var(--accent), var(--accent2)); transform-origin: left center; }
.intro-title { font-size: ${vertical ? 118 : 112}px; line-height: 1.02; font-weight: 800; letter-spacing: -0.035em; }
.outro-text { font-size: ${vertical ? 96 : 92}px; line-height: 1.06; font-weight: 800; letter-spacing: -0.03em; }
.bg { position: absolute; inset: 0; }
.bg img { width: 100%; height: 100%; object-fit: cover; transform-origin: center; }
.shade { position: absolute; inset: 0; background: linear-gradient(${vertical ? '180deg' : '90deg'}, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.1) 100%); }
.cover .shade { background: linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.15) 100%); }
.text { position: absolute; z-index: 2; }
.num { font-size: 40px; font-weight: 700; letter-spacing: 0.2em; color: var(--accent); margin-bottom: 18px; }
.heading { font-size: ${big}px; line-height: 1.02; font-weight: 800; letter-spacing: -0.035em; }
.heading .w { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: 0.08em; }
.heading .w > span { display: inline-block; }
.cover .text { left: ${vertical ? 80 : 140}px; right: ${vertical ? 80 : 140}px; bottom: ${vertical ? 620 : 300}px; color: #fff; }
.kinetic .text { left: ${vertical ? 80 : 160}px; right: ${vertical ? 80 : 160}px; top: 50%; transform: translateY(-${vertical ? 75 : 62}%); }
.kinetic .heading { font-size: ${vertical ? 132 : 150}px; }
.kinetic.has-img .text { color: #fff; }
.split .text { ${vertical ? 'left: 80px; right: 80px; top: 1060px;' : 'left: 140px; width: 760px; top: 300px;'} }
.split .card { position: absolute; ${vertical ? 'left: 90px; right: 90px; top: 200px; height: 780px;' : 'right: 120px; top: 150px; width: 860px; height: 780px;'}
  border-radius: 36px; overflow: hidden; box-shadow: 0 40px 120px rgba(0,0,0,0.45); border: 2px solid rgba(255,255,255,0.18); }
.split .card img { width: 100%; height: 100%; object-fit: cover; }
.caps { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.cap { display: flex; align-items: flex-end; justify-content: center; padding: 0 ${vertical ? 70 : 220}px ${vertical ? 330 : 90}px; }
.cap span { display: inline-block; max-width: 100%; text-align: center; font-family: 'Helvetica Neue', Helvetica, Arial, 'Segoe UI', sans-serif;
  font-size: ${vertical ? 62 : 52}px; line-height: 1.18; font-weight: 750; color: #fff; padding: 14px 28px; border-radius: 18px;
  background: rgba(8, 10, 20, 0.62); box-shadow: 0 10px 40px rgba(0,0,0,0.35); }
.wipe { z-index: 8; overflow: hidden; }
.wipe-a, .wipe-b { position: absolute; inset: 0; }
.wipe-a { background: var(--accent); }
.wipe-b { background: var(--bg); }
#barwrap { position: absolute; left: 0; right: 0; top: 0; height: 8px; z-index: 9; background: rgba(255,255,255,0.12); }
#bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent2)); transform-origin: left center; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${tl.total}" data-width="${W}" data-height="${H}">
${sceneHtml.join('\n')}
<div id="barwrap"><div id="bar"></div></div>
<audio id="mix" src="${esc(input.audio)}" data-start="0" data-duration="${tl.total}" data-volume="1"></audio>
</div>
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
${anims.join(';\n')};
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
`
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
  const prog = progs[(h >> 3) % progs.length]
  const minor = (h >> 5) % 2 === 0
  const bpm = 96
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
  // Fundidos de entrada y salida, y normalizado.
  const fade = Math.min(n / 2, sampleRate * 1.5)
  let peak = 0
  for (let i = 0; i < n; i++) {
    const g = Math.min(1, i / fade, (n - 1 - i) / fade)
    out[i] *= g
    peak = Math.max(peak, Math.abs(out[i]))
  }
  const norm = peak > 0 ? 0.8 / peak : 1
  const data = Buffer.alloc(n * 2)
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[i] * norm * 32767))), i * 2)
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
