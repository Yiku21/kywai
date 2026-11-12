// «/miniatura»: tres portadas para un vídeo (el adjunto o el último que hizo kywai), para Reels, TikTok o YouTube.
//
//  1. kywai saca 8 fotogramas del vídeo a buena resolución.
//  2. Un agente los mira y elige, para cada portada, el fotograma, el texto (corto y que dé ganas de verlo), el diseño
//     (grande, lateral o caja) y el color. Responde en JSON.
//  3. kywai hace cada portada como una página HTML y la fotografía (htmlShot.htmlToPng): letras nítidas, del tamaño
//     justo (1080×1920 en vertical, 1280×720 en horizontal).
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { HtmlToPng } from './webDemo'

export type ThumbFormat = 'vertical' | 'horizontal'
export type ThumbLayout = 'grande' | 'lateral' | 'caja'
export const THUMB_LAYOUTS: readonly ThumbLayout[] = ['grande', 'lateral', 'caja']
export const THUMB_SIZE: Record<ThumbFormat, { w: number; h: number }> = { vertical: { w: 1080, h: 1920 }, horizontal: { w: 1280, h: 720 } }
export const THUMB_FRAMES = 8

export interface ThumbRequest {
  note: string
  /** Sin decir: el del vídeo. */
  format?: ThumbFormat
}

/** «/miniatura [vertical|horizontal] [lo que quieres]». null si no es la orden. */
export function parseThumbnailRequest(text: string): ThumbRequest | null {
  const m = /^\/(?:miniaturas?|portadas?|thumbnails?)(?=\s|$)([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  let rest = ` ${m[1].trim()} `
  let format: ThumbFormat | undefined
  const f = /\s(vertical|9:16|reel|tiktok|horizontal|16:9|youtube)(?=\s)/i.exec(rest)
  if (f) {
    format = /^(vertical|9:16|reel|tiktok)$/i.test(f[1]) ? 'vertical' : 'horizontal'
    rest = rest.replace(f[0], ' ')
  }
  return { note: rest.replace(/\s{2,}/g, ' ').trim(), ...(format ? { format } : {}) }
}

export interface ThumbCover {
  frame: number
  text: string
  sub?: string
  layout: ThumbLayout
  /** #rrggbb */
  accent: string
  /** Dónde está lo importante del fotograma (0-1), para encuadrarlo. */
  x: number
  y: number
}

export function thumbnailPrompt(input: { about: string; note: string; format: ThumbFormat; frames: string[]; lang: string }): string {
  const where = input.format === 'vertical' ? 'Reels y TikTok (vertical, 1080×1920; deja libre el tercio de abajo, donde la app pone sus botones y el texto)' : 'YouTube (horizontal, 1280×720; se ve pequeña en la lista: el texto tiene que leerse en un móvil)'
  return [
    `Eres diseñador de miniaturas para redes. Diseña TRES portadas distintas para este vídeo, para ${where}.`,
    `De qué va el vídeo: ${input.about}`,
    ...(input.note ? [`Lo que pide el usuario: ${input.note}`] : []),
    '',
    'Fotogramas del vídeo (ábrelos y mira cuál sirve: una cara con expresión, el momento más llamativo, nítido y sin texto encima):',
    ...input.frames.map((f, i) => `${i}: ${f}`),
    '',
    'Diseños:',
    '- "grande": el fotograma a sangre y el texto enorme encima, con contorno.',
    '- "lateral": el fotograma a un lado (arriba en vertical) y el texto en un bloque de color al otro.',
    '- "caja": el fotograma a sangre y el texto en franjas de color, un poco inclinadas.',
    '',
    'Reglas:',
    '- Cada portada con un diseño distinto y un texto distinto (prueba ángulos: curiosidad, resultado, número, reto).',
    `- El texto, de 2 a 5 palabras, en ${input.lang}: lo que gana quien lo ve o lo que no se espera. Nada de repetir el título del vídeo entero.`,
    '- "sub" es opcional: una línea corta debajo (como mucho 6 palabras).',
    '- "accent": un color que contraste con el fotograma (#rrggbb). "x" e "y": dónde está lo importante del fotograma (0-1).',
    '',
    'Responde SOLO con este JSON, sin nada más:',
    '{"covers": [{"frame": 2, "layout": "grande", "text": "…", "sub": "…", "accent": "#ffd400", "x": 0.5, "y": 0.4}, …]}',
    'No crees ni cambies archivos: kywai hace las imágenes con tu JSON.'
  ].join('\n')
}

const clamp = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def)
const ACCENTS = ['#ffd400', '#ff3b5c', '#22d3ee']

/** Las portadas del agente, válidas (fotograma que existe, diseño conocido, texto). Como mucho 3. */
export function parseThumbnailPlan(text: string, frames: number): ThumbCover[] {
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('La respuesta no trae el JSON')
  const j = JSON.parse(text.slice(a, b + 1)) as { covers?: Record<string, unknown>[] }
  const out: ThumbCover[] = []
  for (const c of Array.isArray(j.covers) ? j.covers : []) {
    const t = typeof c?.text === 'string' ? c.text.replace(/\s+/g, ' ').trim().slice(0, 48) : ''
    if (!t) continue
    const layout = THUMB_LAYOUTS.includes(c.layout as ThumbLayout) ? (c.layout as ThumbLayout) : THUMB_LAYOUTS[out.length % 3]
    const sub = typeof c.sub === 'string' && c.sub.trim() ? c.sub.trim().slice(0, 60) : undefined
    out.push({
      frame: Math.round(clamp(c.frame, 0, Math.max(0, frames - 1), 0)),
      text: t,
      ...(sub ? { sub } : {}),
      layout,
      accent: typeof c.accent === 'string' && /^#[0-9a-f]{6}$/i.test(c.accent) ? c.accent.toLowerCase() : ACCENTS[out.length % 3],
      x: clamp(c.x, 0, 1, 0.5),
      y: clamp(c.y, 0, 1, 0.4)
    })
    if (out.length >= 3) break
  }
  if (!out.length) throw new Error('no trae ninguna portada con texto')
  return out
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const FONT = `'Anton', 'Impact', 'Haettenschweiler', 'Arial Narrow Bold', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`
const BODY = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Arial, sans-serif`

function ink(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? '#0b0b0f' : '#ffffff'
}

/** El tamaño de letra para que el texto quepa en `lines` líneas de `width` px (aprox. para letra condensada). */
export function fitFont(text: string, width: number, lines: number, max: number): number {
  const words = text.split(' ')
  const longest = Math.max(...words.map((w) => w.length))
  const perLine = Math.max(longest, Math.ceil(text.length / lines))
  return Math.round(Math.min(max, width / (perLine * 0.5)))
}

/** La portada como página HTML del tamaño exacto, con el fotograma de fondo (ruta absoluta). */
export function coverHtml(c: ThumbCover, frame: string, size: { w: number; h: number }): string {
  const vertical = size.h > size.w
  const img = `url('file://${frame.replace(/\\/g, '/')}')`
  const pos = `${Math.round(c.x * 100)}% ${Math.round(c.y * 100)}%`
  const pad = Math.round(size.w * 0.06)
  const on = ink(c.accent)
  const head = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${size.w}px;height:${size.h}px;overflow:hidden;background:#000}
.bg{position:absolute;inset:0;background:${img} ${pos}/cover no-repeat;filter:saturate(1.18) contrast(1.06)}
h1{margin:0;font-family:${FONT};font-weight:900;text-transform:uppercase;line-height:.95;letter-spacing:.005em}
p{margin:0;font-family:${BODY};font-weight:750}
`
  const textW = size.w - pad * 2
  if (c.layout === 'lateral') {
    const side = vertical ? { w: size.w, h: Math.round(size.h * 0.42) } : { w: Math.round(size.w * 0.44), h: size.h }
    const fs = fitFont(c.text, side.w - pad * 2, vertical ? 3 : 4, vertical ? 150 : 96)
    return `${head}.bg{${vertical ? `bottom:${side.h}px` : `left:${side.w}px`}}
.panel{position:absolute;${vertical ? `left:0;right:0;bottom:0;height:${side.h}px` : `left:0;top:0;bottom:0;width:${side.w}px`};background:${c.accent};color:${on};display:flex;flex-direction:column;justify-content:${vertical ? 'flex-start' : 'center'};overflow:hidden;padding:${vertical ? pad * 0.8 : pad}px ${pad}px;box-sizing:border-box;box-shadow:0 0 60px rgba(0,0,0,.45)}
h1{font-size:${fs}px}
p{font-size:${Math.round(fs * 0.3)}px;margin-top:${Math.round(fs * 0.25)}px;opacity:.85}
</style></head><body><div class="bg"></div><div class="panel"><h1>${esc(c.text)}</h1>${c.sub ? `<p>${esc(c.sub)}</p>` : ''}</div>${fitScript('.panel', side.h)}</body></html>`
  }
  if (c.layout === 'caja') {
    const fs = fitFont(c.text, textW * 0.9, vertical ? 4 : 3, vertical ? 130 : 92)
    const top = vertical ? Math.round(size.h * 0.12) : pad
    return `${head}.shade{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%, rgba(0,0,0,0) 40%, rgba(0,0,0,.45) 100%)}
.t{position:absolute;left:${pad}px;right:${pad}px;top:${top}px;transform:rotate(-2.5deg);transform-origin:left top}
h1{display:inline;font-size:${fs}px;line-height:1.28;background:${c.accent};color:${on};padding:.02em .22em;box-decoration-break:clone;-webkit-box-decoration-break:clone;box-shadow:0 10px 30px rgba(0,0,0,.35)}
p{display:inline-block;margin-top:${Math.round(fs * 0.4)}px;font-size:${Math.round(fs * 0.34)}px;background:#0b0b0f;color:#fff;padding:.25em .55em}
</style></head><body><div class="bg"></div><div class="shade"></div><div class="t"><h1>${esc(c.text)}</h1>${c.sub ? `<br><p>${esc(c.sub)}</p>` : ''}</div>${fitScript('.t', size.h * (vertical ? 0.5 : 0.8))}</body></html>`
  }
  // «grande»: en vertical arriba (abajo están los botones de la app); en horizontal abajo a la izquierda.
  const fs = fitFont(c.text, textW, vertical ? 4 : 2, vertical ? 170 : 120)
  const stroke = Math.max(4, Math.round(fs * 0.06))
  return `${head}.shade{position:absolute;inset:0;background:linear-gradient(${vertical ? 'to bottom' : 'to top'}, rgba(0,0,0,.72) 0%, rgba(0,0,0,.25) 45%, rgba(0,0,0,0) 70%)}
.t{position:absolute;left:${pad}px;right:${pad}px;${vertical ? `top:${Math.round(size.h * 0.1)}px` : `bottom:${pad}px`}}
h1{font-size:${fs}px;color:#fff;-webkit-text-stroke:${stroke}px #000;paint-order:stroke fill;text-shadow:0 ${stroke}px ${stroke * 3}px rgba(0,0,0,.6)}
h1 em{font-style:normal;color:${c.accent}}
p{font-size:${Math.round(fs * 0.28)}px;color:#fff;margin-top:${Math.round(fs * 0.2)}px;text-shadow:0 2px 12px rgba(0,0,0,.8)}
</style></head><body><div class="bg"></div><div class="shade"></div><div class="t"><h1>${highlightLast(c.text)}</h1>${c.sub ? `<p>${esc(c.sub)}</p>` : ''}</div>${fitScript('.t', size.h * (vertical ? 0.5 : 0.62))}</body></html>`
}

/**
 * Encoge el titular hasta que quepa en su caja (ni más ancho ni más alto que `maxH`): la estimación de fitFont es
 * aproximada y la letra depende del equipo.
 */
function fitScript(box: string, maxH: number): string {
  return `<script>(() => { const b = document.querySelector('${box}'); const h = b.querySelector('h1'); let fs = parseFloat(getComputedStyle(h).fontSize); for (let i = 0; i < 40 && (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > ${Math.round(maxH)} || h.scrollWidth > h.clientWidth + 1); i++) { fs *= 0.95; h.style.fontSize = fs + 'px'; const p = b.querySelector('p'); if (p) p.style.fontSize = Math.max(18, fs * 0.3) + 'px' } })()</script>`
}

/** La última palabra del texto, en el color de la portada. */
function highlightLast(text: string): string {
  const words = text.split(' ')
  if (words.length < 2) return `<em>${esc(text)}</em>`
  const last = words.pop()!
  return `${esc(words.join(' '))} <em>${esc(last)}</em>`
}

function ffmpeg(args: string[], signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-y', '-v', 'error', ...args], { timeout: 60_000, windowsHide: true, signal }, (err) => resolve(!err))
  })
}

/** `n` fotogramas repartidos por el vídeo (sin el principio ni el final), en JPG de 1920 px como mucho. */
export async function thumbFrames(video: string, seconds: number, dir: string, n = THUMB_FRAMES, signal?: AbortSignal): Promise<string[]> {
  mkdirSync(dir, { recursive: true })
  const out: string[] = []
  for (let i = 0; i < n && !signal?.aborted; i++) {
    const at = seconds * (0.06 + (0.88 * i) / Math.max(1, n - 1))
    const file = join(dir, `fotograma-${i}.jpg`)
    if (await ffmpeg(['-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-vf', "scale='min(1920,iw)':-2", '-q:v', '2', file], signal)) {
      if (existsSync(file)) out.push(file)
    }
  }
  return out
}

/** Hace las portadas en `outDir` (1-<texto>.png…). Devuelve las rutas. */
export async function renderThumbnails(covers: ThumbCover[], frames: string[], format: ThumbFormat, outDir: string, htmlToPng: HtmlToPng, slug: (s: string) => string): Promise<string[]> {
  mkdirSync(outDir, { recursive: true })
  const size = THUMB_SIZE[format]
  const out: string[] = []
  for (const [k, c] of covers.entries()) {
    const file = join(outDir, `${k + 1}-${slug(c.text) || 'portada'}.png`)
    if (await htmlToPng(coverHtml(c, frames[c.frame] ?? frames[0], size), size, file)) out.push(file)
  }
  if (!out.length) throw new Error('No se pudieron hacer las portadas (hace falta la app de escritorio)')
  return out
}
