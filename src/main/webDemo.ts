// «/demo <web>»: un vídeo de presentación de una web hecho con fotos reales de la página (como un anuncio de producto),
// no un vídeo generado por IA: cada imagen es la web de verdad, nítida y con su marca.
//
//  1. kywai fotografía la web entera en ordenador y en móvil (htmlShot.ts) y lee sus secciones y su color.
//  2. Un agente hace el guion de planos eligiendo de las FICHAS DE PLANOS (DEMO_SHOTS): portada, recorrido, acercamiento,
//     detalle, móvil, pareja, rótulo y cierre, con sus textos. Responde en JSON.
//  3. kywai monta cada plano con ffmpeg (movimientos de cámara suaves sobre las fotos, el móvil dentro de un teléfono,
//     rótulos que aparecen), los une con fundidos y les pone música.
// Idea de las fichas de planos de Vincentwei1021/video-shotcraft (Apache-2.0), reimplementada sin Remotion.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PageCapture } from './htmlShot'

export type DemoFormat = 'horizontal' | 'vertical'

export interface DemoRequest {
  url: string
  format: DemoFormat
  note: string
}

/** «/demo <web> [vertical] [lo que quieres destacar]». null si no es la orden; url vacía si falta la dirección. */
export function parseDemoRequest(text: string): DemoRequest | null {
  const m = /^\/(?:demo)(?=\s|$)([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  let rest = ` ${m[1].trim()} `
  let format: DemoFormat = 'horizontal'
  const v = /\s(?:vertical|9:16|reel|tiktok)(?=\s)/i.exec(rest)
  if (v) {
    format = 'vertical'
    rest = rest.replace(v[0], ' ')
  }
  const u = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>"'`]*)?/i.exec(rest)
  let url = ''
  if (u) {
    url = u[0].replace(/[).,;:!?»]+$/, '')
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    rest = rest.replace(u[0], ' ')
  }
  return { url, format, note: rest.replace(/\s{2,}/g, ' ').trim().replace(/^[,;:.\-–—]+\s*/, '') }
}

export const OUT: Record<DemoFormat, { w: number; h: number }> = { horizontal: { w: 1920, h: 1080 }, vertical: { w: 1080, h: 1920 } }

// ---------- las fichas de planos ----------

export type ShotKind = 'portada' | 'recorrido' | 'acercamiento' | 'detalle' | 'movil' | 'pareja' | 'rotulo' | 'cierre'

export interface ShotCard {
  id: ShotKind
  secs: number
  /** Cuándo usarla y qué se ve. */
  use: string
  /** Lo que hay que darle. */
  params: string
}

export const DEMO_SHOTS: readonly ShotCard[] = [
  { id: 'portada', secs: 2.6, use: 'Abre el vídeo: el gancho en letras grandes sobre el color de la marca (lo que la web hace por quien la mira, no su nombre).', params: '"text" (gancho de 3 a 8 palabras), "sub" (opcional, una línea)' },
  { id: 'recorrido', secs: 4.5, use: 'La web a pantalla completa bajando despacio de una sección a otra: enseña que hay mucho y bien hecho.', params: '"from" y "to" (números de sección)' },
  { id: 'acercamiento', secs: 3.4, use: 'Empieza viendo una sección entera y la cámara se acerca a un detalle (un titular, un botón, un precio, una captura).', params: '"section", "x" e "y" del detalle dentro de la sección (0-1), "zoom" (1.5 a 3), "text" opcional' },
  { id: 'detalle', secs: 3, use: 'Plano cerrado y casi quieto de una zona, con un rótulo que dice el beneficio.', params: '"section", "x", "y", "zoom" (2 a 3), "text" (obligatorio)' },
  { id: 'movil', secs: 4, use: 'La web en un teléfono, bajando, sobre la web de fondo desenfocada: se ve que va bien en el móvil.', params: '"text" opcional' },
  { id: 'pareja', secs: 3.5, use: 'Ordenador y móvil a la vez con la misma sección.', params: '"section", "text" opcional' },
  { id: 'rotulo', secs: 2.2, use: 'Una frase sola a pantalla completa entre planos: un beneficio o una cifra. Como mucho dos en el vídeo.', params: '"text"' },
  { id: 'cierre', secs: 3, use: 'Cierra el vídeo: la llamada a la acción y la dirección de la web.', params: '"text" (p. ej. «Pruébalo gratis»)' }
]

const SHOT_IDS = DEMO_SHOTS.map((s) => s.id)

/** Lo que dura un plano según su ficha. */
export const shotSeconds = (kind: ShotKind): number => DEMO_SHOTS.find((c) => c.id === kind)?.secs ?? 3

export interface DemoShot {
  ficha: ShotKind
  text?: string
  sub?: string
  from?: number
  to?: number
  section?: number
  x?: number
  y?: number
  zoom?: number
}

export interface DemoPlan {
  title: string
  shots: DemoShot[]
}

export function demoPrompt(input: { url: string; note: string; format: DemoFormat; page: Pick<PageCapture, 'title' | 'description' | 'sections'>; desktop: string; mobile?: string; lang: string }): string {
  return [
    `Eres el director de anuncios de producto de kywai. Haz el guion de planos de un vídeo de presentación de esta web: ${input.url} (${input.format === 'vertical' ? 'vertical, para Reels y TikTok' : 'horizontal'}).`,
    ...(input.note ? [`Lo que quiere destacar el usuario: ${input.note}`] : []),
    '',
    `Título de la página: ${input.page.title || '(sin título)'}`,
    ...(input.page.description ? [`Descripción: ${input.page.description}`] : []),
    '',
    'Fotos de la web (ábrelas para ver qué hay y dónde):',
    `- Ordenador, entera: ${input.desktop}`,
    ...(input.mobile ? [`- Móvil, entera: ${input.mobile}`] : []),
    '',
    'Secciones de la página (número: título):',
    ...input.page.sections.map((s, i) => `${i}: ${s.label || '(sin título)'}`),
    '',
    'Fichas de planos (cada plano usa una):',
    ...DEMO_SHOTS.map((s) => `- "${s.id}" (${s.secs} s): ${s.use} Necesita: ${s.params}.`),
    '',
    'Reglas:',
    '- De 6 a 9 planos, entre 18 y 35 segundos en total. Empieza con "portada" y acaba con "cierre".',
    '- Cuenta una historia: el problema o la promesa, lo que hace la web (enseñándolo de verdad con acercamientos a lo importante), por qué fiarse y la llamada a la acción.',
    '- Varía los planos: no pongas dos iguales seguidos.' + (input.mobile ? '' : ' No uses "movil" ni "pareja": no hay foto del móvil.'),
    `- Los textos, cortos (de 2 a 8 palabras), concretos y en ${input.lang}. Nada de «la mejor solución» ni frases vacías: lo que gana quien la usa.`,
    '',
    'Responde SOLO con este JSON, sin nada más:',
    '{"title": "título corto del vídeo", "shots": [{"ficha": "portada", "text": "…", "sub": "…"}, {"ficha": "acercamiento", "section": 1, "x": 0.3, "y": 0.4, "zoom": 2, "text": "…"}, …]}',
    'No crees ni cambies archivos: kywai monta el vídeo con tu JSON.'
  ].join('\n')
}

function jsonOf(text: string): Record<string, unknown> {
  const a = text.indexOf('{')
  const b = text.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('La respuesta no trae el JSON')
  return JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>
}

const num = (v: unknown, lo: number, hi: number, def: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def)
const str = (v: unknown, max = 80): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

/** El guion del agente, válido: fichas conocidas, secciones que existen, sin móvil si no hay foto. Como mucho 10. */
export function parseDemoPlan(text: string, sections: number, hasMobile: boolean): DemoPlan {
  const j = jsonOf(text)
  const shots: DemoShot[] = []
  const last = Math.max(0, sections - 1)
  for (const s of Array.isArray(j.shots) ? (j.shots as Record<string, unknown>[]) : []) {
    const ficha = String(s?.ficha ?? '') as ShotKind
    if (!SHOT_IDS.includes(ficha)) continue
    if ((ficha === 'movil' || ficha === 'pareja') && !hasMobile) continue
    const shot: DemoShot = { ficha }
    const t = str(s.text)
    if (t) shot.text = t
    const sub = str(s.sub, 120)
    if (sub && ficha === 'portada') shot.sub = sub
    if ((ficha === 'portada' || ficha === 'rotulo' || ficha === 'detalle') && !shot.text) continue
    if (ficha === 'recorrido') {
      shot.from = Math.round(num(s.from, 0, last, 0))
      shot.to = Math.round(num(s.to, 0, last, Math.min(last, shot.from + 2)))
      if (shot.to === shot.from) shot.to = Math.min(last, shot.from + 1)
    }
    if (ficha === 'acercamiento' || ficha === 'detalle' || ficha === 'pareja') shot.section = Math.round(num(s.section, 0, last, 0))
    if (ficha === 'acercamiento' || ficha === 'detalle') {
      shot.x = num(s.x, 0, 1, 0.5)
      shot.y = num(s.y, 0, 1, 0.4)
      shot.zoom = num(s.zoom, 1.2, 3.5, ficha === 'detalle' ? 2.4 : 2)
    }
    shots.push(shot)
    if (shots.length >= 10) break
  }
  if (shots.length < 3) throw new Error('el guion tiene menos de 3 planos válidos')
  return { title: str(j.title) ?? 'Presentación', shots }
}

// ---------- el montaje ----------

/** Un encuadre sobre una foto: esquina de arriba a la izquierda y ancho (el alto sale del formato del vídeo). */
export interface Rect {
  x: number
  y: number
  w: number
}

/** Ajusta el encuadre para que quepa en la foto con el formato del vídeo. */
export function fitRect(r: Rect, img: { w: number; h: number }, out: { w: number; h: number }): Rect {
  const ar = out.h / out.w
  const w = Math.max(16, Math.min(r.w, img.w, img.h / ar))
  const h = w * ar
  return { x: Math.round(Math.max(0, Math.min(img.w - w, r.x))), y: Math.round(Math.max(0, Math.min(img.h - h, r.y))), w: Math.round(w) }
}

/**
 * El filtro de ffmpeg de un movimiento de cámara de `from` a `to` (suave al empezar y al acabar) sobre una foto: se
 * recorta primero lo que abarcan los dos encuadres y, en cada fotograma, se escala y se recorta al tamaño del vídeo.
 */
export function moveFilter(img: { w: number; h: number }, from: Rect, to: Rect, secs: number, out: { w: number; h: number }): string {
  const ar = out.h / out.w
  const a = fitRect(from, img, out)
  const b = fitRect(to, img, out)
  const bx = Math.min(a.x, b.x)
  const by = Math.min(a.y, b.y)
  const bw = Math.min(img.w - bx, Math.ceil(Math.max(a.x + a.w, b.x + b.w) - bx))
  const bh = Math.min(img.h - by, Math.ceil(Math.max(a.y + a.w * ar, b.y + b.w * ar) - by))
  const p = `min(t/${secs.toFixed(3)},1)`
  const e = `(${p}*${p}*(3-2*${p}))`
  const w = `(${a.w}+(${b.w - a.w})*${e})`
  const k = `(${out.w}/${w})`
  const x = `((${a.x - bx}+(${b.x - a.x})*${e})*${k})`
  const y = `((${a.y - by}+(${b.y - a.y})*${e})*${k})`
  return [
    `crop=${bw}:${bh}:${bx}:${by}`,
    // Un poco más grande que lo justo: el redondeo nunca deja el recorte fuera de la imagen.
    `scale=w='trunc(${bw}*${k}/2)*2+4':h='trunc(${bh}*${k}/2)*2+4':eval=frame:flags=bicubic`,
    `crop=${out.w}:${out.h}:x='${x}':y='${y}'`,
    'setsar=1',
    'format=yuv420p'
  ].join(',')
}

/** La sección `i` de la foto de ordenador (o toda la página si no hay). */
function section(page: Pick<PageCapture, 'sections' | 'h'>, i = 0): { y: number; h: number } {
  const s = page.sections[Math.max(0, Math.min(page.sections.length - 1, i))]
  return s ? { y: s.y, h: Math.max(200, s.h) } : { y: 0, h: page.h }
}

/** Encuadre de inicio y de final de los planos que se mueven sobre la foto de ordenador. */
export function shotRects(shot: DemoShot, page: Pick<PageCapture, 'sections' | 'w' | 'h'>, out: { w: number; h: number }): { from: Rect; to: Rect } {
  const ar = out.h / out.w
  // En vertical no cabe el ancho entero de la web: se ve la parte central (el contenido suele ir ahí).
  const fullW = out.h > out.w ? Math.min(page.w, Math.round(page.w * 0.62)) : page.w
  const left = Math.round((page.w - fullW) / 2)
  if (shot.ficha === 'recorrido') {
    const a = section(page, shot.from)
    const b = section(page, shot.to)
    return { from: { x: left, y: a.y, w: fullW }, to: { x: left, y: Math.max(a.y, b.y + b.h - fullW * ar), w: fullW } }
  }
  const s = section(page, shot.section)
  const zoom = shot.zoom ?? 2
  const cx = (shot.x ?? 0.5) * page.w
  const cy = s.y + (shot.y ?? 0.4) * s.h
  const close = (z: number): Rect => {
    const w = fullW / z
    return { x: cx - w / 2, y: cy - (w * ar) / 2, w }
  }
  if (shot.ficha === 'acercamiento') return { from: { x: left, y: Math.max(0, s.y - 40), w: fullW }, to: close(zoom) }
  if (shot.ficha === 'detalle') return { from: close(zoom), to: close(zoom * 1.08) }
  return { from: { x: left, y: s.y, w: fullW }, to: { x: left, y: s.y, w: fullW } }
}

/** Empuje lento hacia dentro (las tarjetas y las composiciones): del 100 % al 94 %. */
export function pushIn(out: { w: number; h: number }): { from: Rect; to: Rect } {
  return { from: { x: 0, y: 0, w: out.w }, to: { x: out.w * 0.03, y: out.h * 0.03, w: out.w * 0.94 } }
}

/** Geometría del teléfono en el plano «movil»: la pantalla (x, y, ancho, alto). */
export function phoneScreen(out: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const h = Math.round(out.h * (out.h > out.w ? 0.76 : 0.82))
  const w = Math.round((h * 390) / 844 / 2) * 2
  return { x: Math.round((out.w - w) / 2), y: Math.round((out.h - h) / 2), w, h: Math.round(h / 2) * 2 }
}

// ---------- las páginas de kywai (tarjetas, rótulos, teléfono) ----------

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, sans-serif`
const fileUrl = (p: string): string => `file://${p.replace(/\\/g, '/')}`

/** ¿Va mejor texto oscuro sobre este color? */
export function lightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return false
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62
}

/** Tarjeta a pantalla completa (portada, rótulo, cierre) con el color de la marca. */
export function cardHtml(kind: 'portada' | 'rotulo' | 'cierre', text: string, sub: string, color: string, out: { w: number; h: number }): string {
  const ink = lightColor(color) ? '#111111' : '#ffffff'
  const big = Math.round(Math.min(out.w, out.h) * (kind === 'rotulo' ? 0.085 : 0.1))
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${out.w}px;height:${out.h}px;overflow:hidden}
body{background:radial-gradient(120% 90% at 20% 10%, color-mix(in srgb, ${color} 70%, white) 0%, ${color} 45%, color-mix(in srgb, ${color} 60%, black) 100%);color:${ink};font-family:${FONT};display:flex;flex-direction:column;justify-content:center;padding:0 ${Math.round(out.w * 0.09)}px;box-sizing:border-box}
h1{font-size:${big}px;line-height:1.02;font-weight:850;letter-spacing:-0.035em;margin:0;max-width:92%}
p{font-size:${Math.round(big * 0.36)}px;font-weight:550;opacity:.85;margin:${Math.round(big * 0.35)}px 0 0}
.pill{display:inline-block;margin-top:${Math.round(big * 0.45)}px;padding:${Math.round(big * 0.16)}px ${Math.round(big * 0.34)}px;border-radius:999px;background:${ink};color:${color};font-size:${Math.round(big * 0.34)}px;font-weight:750;align-self:flex-start}
</style></head><body><h1>${esc(text)}</h1>${kind === 'cierre' ? `<div class="pill">${esc(sub)}</div>` : sub ? `<p>${esc(sub)}</p>` : ''}</body></html>`
}

/** Rótulo transparente para encima de un plano: el texto abajo, sobre un degradado oscuro. */
export function captionHtml(text: string, color: string, out: { w: number; h: number }): string {
  const fs = Math.round(Math.min(out.w, out.h) * 0.07)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${out.w}px;height:${out.h}px;overflow:hidden;background:transparent}
.g{position:absolute;left:0;right:0;bottom:0;height:52%;background:linear-gradient(to top, rgba(0,0,0,.86) 0%, rgba(0,0,0,.6) 45%, rgba(0,0,0,0) 100%)}
.t{position:absolute;left:${Math.round(out.w * 0.07)}px;right:${Math.round(out.w * 0.07)}px;bottom:${Math.round(out.h * (out.h > out.w ? 0.14 : 0.1))}px;font-family:${FONT};font-size:${fs}px;line-height:1.05;font-weight:850;letter-spacing:-0.025em;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.5)}
.t:before{content:'';display:block;width:${Math.round(fs * 1.2)}px;height:${Math.round(fs * 0.16)}px;border-radius:9px;background:${color};margin-bottom:${Math.round(fs * 0.35)}px}
</style></head><body><div class="g"></div><div class="t">${esc(text)}</div></body></html>`
}

/** El teléfono (marco con la pantalla transparente) para el plano «movil». */
export function phoneHtml(out: { w: number; h: number }): string {
  const s = phoneScreen(out)
  const border = Math.round(s.w * 0.045)
  const radius = Math.round(s.w * 0.13)
  return `<!doctype html><html><head><style>
html,body{margin:0;width:${out.w}px;height:${out.h}px;overflow:hidden;background:transparent}
.s{position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;border-radius:${radius}px;box-shadow:0 0 0 ${border}px #0c0c10, 0 0 0 ${border + 2}px #2a2a33, 0 ${Math.round(s.h * 0.03)}px ${Math.round(s.h * 0.08)}px ${border}px rgba(0,0,0,.45)}
.n{position:absolute;left:${s.x + s.w / 2 - s.w * 0.15}px;top:${s.y + border * 0.6}px;width:${s.w * 0.3}px;height:${Math.round(border * 1.3)}px;border-radius:99px;background:#0c0c10}
</style></head><body><div class="s"></div><div class="n"></div></body></html>`
}

/** Ordenador y móvil a la vez (plano «pareja»), con la misma sección en los dos. */
export function pairHtml(desktop: { file: string; w: number; y: number }, mobile: { file: string; w: number }, color: string, background: string, out: { w: number; h: number }): string {
  const vertical = out.h > out.w
  const lw = Math.round(out.w * (vertical ? 0.86 : 0.62))
  const lh = Math.round((lw * 10) / 16)
  const pw = Math.round(out.w * (vertical ? 0.36 : 0.17))
  const ph = Math.round((pw * 844) / 390)
  const lx = Math.round(vertical ? (out.w - lw) / 2 : out.w * 0.08)
  const ly = Math.round(vertical ? out.h * 0.14 : (out.h - lh) / 2 - out.h * 0.02)
  const px = Math.round(vertical ? out.w - pw - out.w * 0.1 : lx + lw - pw * 0.45)
  const py = Math.round(vertical ? ly + lh - ph * 0.25 : (out.h - ph) / 2 + out.h * 0.06)
  const scaleD = lw / desktop.w
  return `<!doctype html><html><head><style>
html,body{margin:0;width:${out.w}px;height:${out.h}px;overflow:hidden}
body{background:radial-gradient(100% 80% at 30% 20%, color-mix(in srgb, ${color} 30%, ${background}) 0%, ${background} 70%)}
.l{position:absolute;left:${lx}px;top:${ly}px;width:${lw}px;height:${lh}px;border-radius:${Math.round(lw * 0.015)}px;overflow:hidden;box-shadow:0 0 0 ${Math.round(lw * 0.012)}px #16161c, 0 30px 90px rgba(0,0,0,.35);background:url('${fileUrl(desktop.file)}') 0 ${-Math.round(desktop.y * scaleD)}px / ${lw}px auto no-repeat}
.p{position:absolute;left:${px}px;top:${py}px;width:${pw}px;height:${ph}px;border-radius:${Math.round(pw * 0.13)}px;overflow:hidden;box-shadow:0 0 0 ${Math.round(pw * 0.045)}px #0c0c10, 0 30px 80px rgba(0,0,0,.45);background:url('${fileUrl(mobile.file)}') 0 0 / ${pw}px auto no-repeat}
</style></head><body><div class="l"></div><div class="p"></div></body></html>`
}

// ---------- programas ----------

interface Out {
  code: number | null
  out: string
}

function exec(cmd: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<Out> {
  return new Promise((resolve) => {
    let out = ''
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(cmd, args, { windowsHide: true })
    } catch (e) {
      resolve({ code: -1, out: (e as Error).message })
      return
    }
    const take = (b: Buffer): void => {
      out = (out + b.toString('utf8')).slice(-12000)
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
    const timer = setTimeout(kill, timeoutMs)
    signal?.addEventListener('abort', kill, { once: true })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', kill)
      resolve({ code, out })
    })
  })
}

const lastLine = (out: string): string => out.split('\n').filter((l) => l.trim()).pop()?.slice(0, 200) ?? ''

/** Lo que el montaje necesita de fuera: hacer una imagen de una página HTML (htmlShot.htmlToPng). */
export type HtmlToPng = (html: string, size: { w: number; h: number }, out: string, opts?: { transparent?: boolean }) => Promise<boolean>

export interface RenderDemoInput {
  plan: DemoPlan
  desktop: PageCapture
  mobile?: { file: string; w: number; h: number } | null
  format: DemoFormat
  url: string
  /** WAV de la música (o nada). */
  music?: Buffer
  out: string
  dir: string
  htmlToPng: HtmlToPng
  signal?: AbortSignal
  onStep?: (text: string, p: number) => void
}

const FPS = 30
const XFADE = 0.4

/** Lo que dura el vídeo montado (los fundidos solapan los planos). */
export function planSeconds(plan: DemoPlan): number {
  return plan.shots.reduce((n, s) => n + shotSeconds(s.ficha), 0) - XFADE * Math.max(0, plan.shots.length - 1)
}

/** Monta el vídeo plano a plano y lo une con fundidos y música. Devuelve la duración en segundos. */
export async function renderDemo(input: RenderDemoInput): Promise<number> {
  const { plan, desktop, dir, signal } = input
  const out = OUT[input.format]
  const color = desktop.color || '#6d28d9'
  const host = (() => {
    try {
      return new URL(input.url).host.replace(/^www\./, '')
    } catch {
      return input.url
    }
  })()
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const ff = async (args: string[], what: string): Promise<void> => {
    const r = await exec('ffmpeg', ['-y', '-v', 'error', ...args], 10 * 60_000, signal)
    if (r.code !== 0) throw new Error(`No se pudo montar ${what}${lastLine(r.out) ? `: ${lastLine(r.out)}` : ''}`)
  }
  const png = async (html: string, file: string, transparent = false): Promise<string> => {
    if (!(await input.htmlToPng(html, out, file, { transparent }))) throw new Error('No se pudieron hacer las imágenes del vídeo (hace falta la app de escritorio)')
    return file
  }
  const encode = ['-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-an']
  const parts: { file: string; secs: number }[] = []
  for (const [k, shot] of plan.shots.entries()) {
    if (signal?.aborted) throw new Error('Cancelada')
    input.onStep?.('Montando los planos', 0.1 + (0.75 * k) / plan.shots.length)
    const secs = shotSeconds(shot.ficha)
    const file = join(dir, `plano-${k}.mp4`)
    const caption = shot.text && !['portada', 'rotulo', 'cierre'].includes(shot.ficha) ? await png(captionHtml(shot.text, color, out), join(dir, `rotulo-${k}.png`), true) : null
    // El rótulo aparece a los 0,4 s.
    const withCaption = (base: string): string[] =>
      caption
        ? ['-loop', '1', '-framerate', String(FPS), '-t', secs.toFixed(2), '-i', caption, '-filter_complex', `[0:v]${base}[b];[1:v]format=rgba,fade=t=in:st=0.4:d=0.45:alpha=1[o];[b][o]overlay=0:0,format=yuv420p[v]`, '-map', '[v]']
        : ['-vf', base]
    if (shot.ficha === 'portada' || shot.ficha === 'rotulo' || shot.ficha === 'cierre') {
      const sub = shot.ficha === 'cierre' ? host : (shot.sub ?? '')
      const img = await png(cardHtml(shot.ficha, shot.text ?? plan.title, sub, color, out), join(dir, `tarjeta-${k}.png`))
      const m = pushIn(out)
      await ff(['-loop', '1', '-framerate', String(FPS), '-t', secs.toFixed(2), '-i', img, '-vf', moveFilter(out, m.from, m.to, secs, out), ...encode, file], `el plano ${k + 1}`)
    } else if (shot.ficha === 'movil' && input.mobile) {
      const frame = await png(phoneHtml(out), join(dir, `telefono-${k}.png`), true)
      const s = phoneScreen(out)
      const mob = input.mobile
      const scaledH = Math.round((mob.h * s.w) / mob.w)
      const travel = Math.max(0, Math.min(scaledH - s.h, s.h * 1.4))
      const p = `min(t/${secs.toFixed(2)},1)`
      const y = `${travel.toFixed(0)}*(${p}*${p}*(3-2*${p}))`
      const graph = [
        `[0:v]scale=${out.w}:${out.h}:force_original_aspect_ratio=increase,crop=${out.w}:${out.h},gblur=sigma=28,eq=brightness=-0.06[bg]`,
        `[1:v]scale=${s.w}:-2,crop=${s.w}:${s.h}:0:'${y}'[scr]`,
        `[bg][scr]overlay=${s.x}:${s.y}[a]`,
        `[a][2:v]overlay=0:0,format=yuv420p${caption ? '[c];[3:v]format=rgba,fade=t=in:st=0.4:d=0.45:alpha=1[o];[c][o]overlay=0:0,format=yuv420p' : ''}[v]`
      ].join(';')
      await ff(
        ['-loop', '1', '-framerate', String(FPS), '-t', secs.toFixed(2), '-i', desktop.file, '-loop', '1', '-framerate', String(FPS), '-t', secs.toFixed(2), '-i', mob.file,
          '-loop', '1', '-framerate', String(FPS), '-t', secs.toFixed(2), '-i', frame, ...(caption ? ['-loop', '1', '-framerate', String(FPS), '-t', secs.toFixed(2), '-i', caption] : []),
          '-filter_complex', graph, '-map', '[v]', '-t', secs.toFixed(2), ...encode, file],
        `el plano ${k + 1}`
      )
    } else if (shot.ficha === 'pareja' && input.mobile) {
      const sec = section(desktop, shot.section)
      const img = await png(pairHtml({ file: desktop.file, w: desktop.w, y: sec.y }, { file: input.mobile.file, w: input.mobile.w }, color, desktop.background, out), join(dir, `pareja-${k}.png`))
      const m = pushIn(out)
      await ff(['-loop', '1', '-framerate', String(FPS), '-t', secs.toFixed(2), '-i', img, ...withCaption(moveFilter(out, m.from, m.to, secs, out)), '-t', secs.toFixed(2), ...encode, file], `el plano ${k + 1}`)
    } else {
      const r = shotRects(shot, desktop, out)
      await ff(['-loop', '1', '-framerate', String(FPS), '-t', secs.toFixed(2), '-i', desktop.file, ...withCaption(moveFilter(desktop, r.from, r.to, secs, out)), '-t', secs.toFixed(2), ...encode, file], `el plano ${k + 1}`)
    }
    parts.push({ file, secs })
  }
  input.onStep?.('Uniendo los planos y poniendo la música', 0.9)
  const total = parts.reduce((n, p) => n + p.secs, 0) - XFADE * (parts.length - 1)
  const graph: string[] = []
  let prev = '0:v'
  let offset = 0
  const kinds = ['fade', 'smoothleft', 'fade', 'slideup']
  for (let k = 1; k < parts.length; k++) {
    offset += parts[k - 1].secs - XFADE
    const label = k === parts.length - 1 ? 'vx' : `x${k}`
    graph.push(`[${prev}][${k}:v]xfade=transition=${kinds[k % kinds.length]}:duration=${XFADE}:offset=${offset.toFixed(3)}[${label}]`)
    prev = label
  }
  if (parts.length === 1) graph.push('[0:v]null[vx]')
  graph.push(`[vx]fade=t=out:st=${Math.max(0, total - 0.5).toFixed(2)}:d=0.5[v]`)
  const music = input.music ? join(dir, 'musica.wav') : null
  if (music) writeFileSync(music, input.music!)
  if (music) graph.push(`[${parts.length}:a]volume=0.55,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2,atrim=0:${total.toFixed(2)}[a]`)
  mkdirSync(join(input.out, '..'), { recursive: true })
  await ff(
    [...parts.flatMap((p) => ['-i', p.file]), ...(music ? ['-i', music] : []), '-filter_complex', graph.join(';'), '-map', '[v]', ...(music ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '160k'] : []),
      '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', total.toFixed(2), input.out],
    'el vídeo'
  )
  if (!existsSync(input.out)) throw new Error('No se pudo montar el vídeo')
  rmSync(dir, { recursive: true, force: true })
  return total
}
