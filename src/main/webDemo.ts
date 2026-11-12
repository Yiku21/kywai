// «/demo <web>»: un vídeo de presentación de una web hecho con fotos reales de la página (como un anuncio de producto),
// no un vídeo generado por IA: cada imagen es la web de verdad, nítida y con su marca.
//
//  1. kywai fotografía la web entera en ordenador y en móvil (htmlShot.ts) y lee sus secciones y su color.
//  2. Un agente hace el guion de planos eligiendo de las FICHAS DE PLANOS (DEMO_SHOTS): portada, recorrido, acercamiento,
//     detalle, móvil, pareja, rótulo y cierre, con sus textos. Responde en JSON.
//  3. kywai monta cada plano con ffmpeg (movimientos de cámara suaves sobre las fotos, el móvil dentro de un teléfono,
//     rótulos que aparecen), los une con fundidos y les pone música.
// Idea de las fichas de planos de Vincentwei1021/video-shotcraft (Apache-2.0), reimplementada sin Remotion.
//
// Con presentador («/demo <web> presentador», y siempre con un enlace de GitHub salvo «sin presentador»), el vídeo es
// como los reels de «mira esta herramienta»: un robot de kywai (o tu personaje) en la esquina habla sobre la web real,
// con un rótulo fijo arriba y subtítulos palabra a palabra. Con un enlace de GitHub, kywai lee además los datos del
// repositorio (estrellas, licencia, lenguaje…) y el guion los usa en una ficha «repo».
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PageCapture } from './htmlShot'
import { buildAss, type Word } from './footage'

export type DemoFormat = 'horizontal' | 'vertical'

export interface DemoRequest {
  url: string
  format: DemoFormat
  note: string
  /** Quién presenta: «hermes», «claude», «codex» o el id de un personaje tuyo. Sin él, no hay presentador. */
  presenter?: string
  /** Voz del presentador («voz:<id>», la del selector de «/video»); sin ella, la del idioma. */
  voice?: string
}

/** Los robots que pueden presentar (el primero, por defecto). */
export const PRESENTER_ROBOTS = ['hermes', 'claude', 'codex'] as const

/** «owner/repo» de un enlace de GitHub (la portada del repositorio o cualquier página suya), o null. */
export function githubRepo(url: string): { owner: string; repo: string } | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null
  const [owner, repo] = u.pathname.split('/').filter(Boolean)
  const skip = /^(features|topics|trending|orgs|settings|marketplace|explore|login|signup|about|pricing|sponsors|collections|search)$/i
  if (!owner || !repo || skip.test(owner) || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null
  return { owner, repo: repo.replace(/\.git$/i, '') }
}

/**
 * «/demo <web> [vertical] [presentador[:quién]] [voz:<id>] [lo que quieres destacar]». null si no es la orden; url
 * vacía si falta la dirección. Un enlace de GitHub lleva presentador salvo «sin presentador».
 */
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
  let presenter: string | undefined
  let noPresenter = false
  const off = /\s(?:sin|without|no)\s+presentador(?=\s)/i.exec(rest)
  if (off) {
    noPresenter = true
    rest = rest.replace(off[0], ' ')
  }
  const on = /\s(?:con\s+)?(?:presentador|presenter)(?::([\w-]{1,40}))?(?=\s)/i.exec(rest)
  if (on && !noPresenter) {
    presenter = (on[1] ?? PRESENTER_ROBOTS[0]).toLowerCase()
    rest = rest.replace(on[0], ' ')
  }
  let voice: string | undefined
  const vz = /\svoz:([\w.-]{2,80})(?=\s)/i.exec(rest)
  if (vz) {
    voice = vz[1]
    rest = rest.replace(vz[0], ' ')
  }
  const u = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:\/[^\s<>"'`]*)?/i.exec(rest)
  let url = ''
  if (u) {
    url = u[0].replace(/[).,;:!?»]+$/, '')
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    rest = rest.replace(u[0], ' ')
  }
  if (!presenter && !noPresenter && url && githubRepo(url)) presenter = PRESENTER_ROBOTS[0]
  return { url, format, note: rest.replace(/\s{2,}/g, ' ').trim().replace(/^[,;:.\-–—]+\s*/, ''), ...(presenter ? { presenter } : {}), ...(voice ? { voice } : {}) }
}

// ---------- los datos de un repositorio de GitHub ----------

export interface RepoFacts {
  /** «owner/repo». */
  name: string
  description: string
  stars: number
  forks: number
  license: string
  language: string
  topics: string[]
  /** Último cambio (ISO). */
  pushedAt: string
  homepage: string
}

/** Los datos de la API pública de GitHub (repos/:owner/:repo), limpios. null si la respuesta no vale. */
export function parseRepoFacts(json: unknown): RepoFacts | null {
  const j = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  const name = typeof j?.full_name === 'string' ? j.full_name : ''
  if (!j || !/^[\w.-]+\/[\w.-]+$/.test(name)) return null
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0)
  const t = (v: unknown, max = 300): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
  const lic = j.license && typeof j.license === 'object' ? (j.license as Record<string, unknown>) : null
  const spdx = t(lic?.spdx_id, 40)
  return {
    name,
    description: t(j.description),
    stars: n(j.stargazers_count),
    forks: n(j.forks_count),
    license: spdx && spdx !== 'NOASSERTION' ? spdx : t(lic?.name, 60),
    language: t(j.language, 40),
    topics: Array.isArray(j.topics) ? j.topics.filter((x): x is string => typeof x === 'string').slice(0, 8).map((x) => x.slice(0, 30)) : [],
    pushedAt: t(j.pushed_at, 40),
    homepage: /^https?:\/\//i.test(t(j.homepage)) ? t(j.homepage, 200) : ''
  }
}

/** Pide los datos del repositorio a la API pública de GitHub (sin cuenta). null si no responde. */
export async function fetchRepoFacts(repo: { owner: string; repo: string }, fetcher: typeof fetch = fetch): Promise<RepoFacts | null> {
  try {
    const res = await fetcher(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'kywai' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return null
    return parseRepoFacts(await res.json())
  } catch {
    return null
  }
}

/** 3800 → «3,8 k»; 950 → «950». */
export function shortCount(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '').replace('.', ',')} k`
}

export const OUT: Record<DemoFormat, { w: number; h: number }> = { horizontal: { w: 1920, h: 1080 }, vertical: { w: 1080, h: 1920 } }

// ---------- las fichas de planos ----------

export type ShotKind = 'portada' | 'recorrido' | 'acercamiento' | 'detalle' | 'movil' | 'pareja' | 'rotulo' | 'repo' | 'cierre'

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
  { id: 'repo', secs: 3.2, use: 'Solo con un repositorio de GitHub: la ficha del repositorio (nombre, descripción, estrellas, licencia y lenguaje) en grande. Una vez, después del gancho.', params: '"text" opcional (una línea encima, p. ej. «Gratis y de código abierto»)' },
  { id: 'cierre', secs: 3, use: 'Cierra el vídeo: la llamada a la acción y la dirección de la web.', params: '"text" (p. ej. «Pruébalo gratis»)' }
]

const SHOT_IDS = DEMO_SHOTS.map((s) => s.id)

/** Lo que dura un plano según su ficha. */
export const shotSeconds = (kind: ShotKind): number => DEMO_SHOTS.find((c) => c.id === kind)?.secs ?? 3

/** Lo que dura un plano en el vídeo: el de la voz si kywai ya lo midió, si no el de su ficha. */
export const shotLength = (shot: DemoShot): number => shot.secs ?? shotSeconds(shot.ficha)

/** Lo que debe durar un plano para que quepa la frase del presentador (con un respiro antes y después). */
export const fitToVoice = (shot: DemoShot, voiceSecs: number): number => Math.max(shotSeconds(shot.ficha), Math.round((voiceSecs + VOICE_LEAD + 0.45) * 100) / 100)

/** La voz de cada plano empieza un poco después del corte. */
export const VOICE_LEAD = 0.25

export interface DemoShot {
  ficha: ShotKind
  text?: string
  /** Con presentador: lo que dice durante el plano. */
  say?: string
  /** Lo que dura de verdad (lo pone kywai con la voz ya hecha; sin él, el de la ficha). */
  secs?: number
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
  /** Con presentador: el rótulo fijo de arriba (2 a 4 palabras, p. ej. «REPO DE GITHUB»). */
  label?: string
  shots: DemoShot[]
}

export function demoPrompt(input: {
  url: string
  note: string
  format: DemoFormat
  page: Pick<PageCapture, 'title' | 'description' | 'sections'>
  desktop: string
  mobile?: string
  lang: string
  /** Nombre de quien presenta (con presentador). */
  presenter?: string
  repo?: RepoFacts | null
}): string {
  const shots = DEMO_SHOTS.filter((s) => s.id !== 'repo' || input.repo)
  const repo = input.repo
  return [
    `Eres el director de anuncios de producto de kywai. Haz el guion de planos de un vídeo de presentación de esta web: ${input.url} (${input.format === 'vertical' ? 'vertical, para Reels y TikTok' : 'horizontal'}).`,
    ...(input.note ? [`Lo que quiere destacar el usuario: ${input.note}`] : []),
    '',
    `Título de la página: ${input.page.title || '(sin título)'}`,
    ...(input.page.description ? [`Descripción: ${input.page.description}`] : []),
    ...(repo
      ? [
          '',
          `Es un repositorio de GitHub. Datos reales (de la API de GitHub; no inventes otros): ${repo.name} · ${repo.stars} estrellas · ${repo.forks} forks` +
            `${repo.license ? ` · licencia ${repo.license}` : ''}${repo.language ? ` · ${repo.language}` : ''}${repo.pushedAt ? ` · último cambio ${repo.pushedAt.slice(0, 10)}` : ''}` +
            `${repo.topics.length ? ` · temas: ${repo.topics.join(', ')}` : ''}${repo.homepage ? ` · web: ${repo.homepage}` : ''}`,
          ...(repo.description ? [`Descripción del repositorio: ${repo.description}`] : []),
          'La foto es la portada del repositorio: arriba los datos y debajo el README (lo que hace, cómo se instala).'
        ]
      : []),
    '',
    'Fotos de la web (ábrelas para ver qué hay y dónde):',
    `- Ordenador, entera: ${input.desktop}`,
    ...(input.mobile ? [`- Móvil, entera: ${input.mobile}`] : []),
    '',
    'Secciones de la página (número: título):',
    ...input.page.sections.map((s, i) => `${i}: ${s.label || '(sin título)'}`),
    '',
    'Fichas de planos (cada plano usa una):',
    ...shots.map((s) => `- "${s.id}" (${s.secs} s): ${s.use} Necesita: ${s.params}.`),
    '',
    'Reglas:',
    input.presenter
      ? '- De 6 a 9 planos. Empieza con "portada" y acaba con "cierre".'
      : '- De 6 a 9 planos, entre 18 y 35 segundos en total. Empieza con "portada" y acaba con "cierre".',
    '- Cuenta una historia: el problema o la promesa, lo que hace la web (enseñándolo de verdad con acercamientos a lo importante), por qué fiarse y la llamada a la acción.',
    '- Varía los planos: no pongas dos iguales seguidos.' + (input.mobile ? '' : ' No uses "movil" ni "pareja": no hay foto del móvil.'),
    `- Los textos, cortos (de 2 a 8 palabras), concretos y en ${input.lang}. Nada de «la mejor solución» ni frases vacías: lo que gana quien la usa.`,
    ...(repo ? ['- Usa "repo" una vez, justo después de la portada. Las cifras, solo las de arriba.'] : []),
    ...(input.presenter
      ? [
          '',
          `Presentador: ${input.presenter} sale en una esquina y habla sobre las imágenes, como en los reels de «mira esta herramienta». Cada plano lleva "say": lo que dice mientras se ve (de 6 a 18 palabras, en ${input.lang}, hablado y natural, en primera persona, como quien se lo cuenta a un amigo; sin emojis ni enlaces).`,
          '- Lo que dice va con lo que se ve en ese plano. La primera frase engancha (qué es y por qué te importa); la última, la llamada a la acción (probarlo, guardarlo o seguir la cuenta).',
          '- El vídeo entero, de 20 a 40 segundos hablados. Los "text" de los planos no repiten la frase: la resumen en 2 a 5 palabras.',
          '- "label": el rótulo fijo de arriba, de 2 a 4 palabras en mayúsculas (p. ej. «REPO DE GITHUB», «HERRAMIENTA GRATIS»).'
        ]
      : []),
    '',
    'Responde SOLO con este JSON, sin nada más:',
    input.presenter
      ? '{"title": "título corto del vídeo", "label": "…", "shots": [{"ficha": "portada", "text": "…", "say": "…"}, {"ficha": "acercamiento", "section": 1, "x": 0.3, "y": 0.4, "zoom": 2, "text": "…", "say": "…"}, …]}'
      : '{"title": "título corto del vídeo", "shots": [{"ficha": "portada", "text": "…", "sub": "…"}, {"ficha": "acercamiento", "section": 1, "x": 0.3, "y": 0.4, "zoom": 2, "text": "…"}, …]}',
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

/**
 * El guion del agente, válido: fichas conocidas, secciones que existen, sin móvil si no hay foto y sin ficha del
 * repositorio si no lo es. Como mucho 10. Con presentador, cada plano con su frase (si faltan casi todas, no vale).
 */
export function parseDemoPlan(text: string, sections: number, hasMobile: boolean, opts: { presenter?: boolean; repo?: boolean } = {}): DemoPlan {
  const j = jsonOf(text)
  const shots: DemoShot[] = []
  const last = Math.max(0, sections - 1)
  for (const s of Array.isArray(j.shots) ? (j.shots as Record<string, unknown>[]) : []) {
    const ficha = String(s?.ficha ?? '') as ShotKind
    if (!SHOT_IDS.includes(ficha)) continue
    if ((ficha === 'movil' || ficha === 'pareja') && !hasMobile) continue
    if (ficha === 'repo' && (!opts.repo || shots.some((x) => x.ficha === 'repo'))) continue
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
    if (opts.presenter) {
      const say = str(s.say, 220)?.replace(/https?:\/\/\S+/g, '').replace(/\s{2,}/g, ' ').trim()
      if (say) shot.say = say
    }
    shots.push(shot)
    if (shots.length >= 10) break
  }
  if (shots.length < 3) throw new Error('el guion tiene menos de 3 planos válidos')
  if (opts.presenter && shots.filter((x) => x.say).length < Math.ceil(shots.length / 2)) throw new Error('faltan las frases del presentador ("say")')
  const label = opts.presenter ? str(j.label, 32)?.toUpperCase() : undefined
  return { title: str(j.title) ?? 'Presentación', ...(label ? { label } : {}), shots }
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

/** Con presentador, el texto del plano va arriba (debajo del rótulo fijo) en una caja del color de la marca. */
export function headlineHtml(text: string, color: string, out: { w: number; h: number }): string {
  const vertical = out.h > out.w
  const fs = Math.round(Math.min(out.w, out.h) * (vertical ? 0.062 : 0.052))
  const ink = lightColor(color) ? '#111111' : '#ffffff'
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${out.w}px;height:${out.h}px;overflow:hidden;background:transparent}
.w{position:absolute;left:0;right:0;top:${Math.round(out.h * (vertical ? 0.135 : 0.16))}px;display:flex;justify-content:center}
.t{max-width:${Math.round(out.w * 0.84)}px;padding:${Math.round(fs * 0.22)}px ${Math.round(fs * 0.42)}px;border-radius:${Math.round(fs * 0.22)}px;background:${color};color:${ink};font-family:${FONT};font-size:${fs}px;line-height:1.08;font-weight:850;letter-spacing:-0.01em;text-transform:uppercase;text-align:center;box-shadow:0 10px 34px rgba(0,0,0,.35)}
</style></head><body><div class="w"><div class="t">${esc(text)}</div></div></body></html>`
}

/** La ficha de un repositorio de GitHub: nombre, descripción y sus datos en pastillas. */
export function repoCardHtml(repo: RepoFacts, text: string, color: string, out: { w: number; h: number }): string {
  const vertical = out.h > out.w
  const u = Math.min(out.w, out.h)
  const [owner, name] = repo.name.split('/')
  const pills = [
    `★ ${shortCount(repo.stars)}`,
    repo.forks ? `⑂ ${shortCount(repo.forks)}` : '',
    repo.license,
    repo.language
  ].filter(Boolean)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${out.w}px;height:${out.h}px;overflow:hidden}
body{background:radial-gradient(110% 80% at 25% 10%, color-mix(in srgb, ${color} 32%, #0d1117) 0%, #0d1117 62%);color:#e6edf3;font-family:${FONT};display:flex;align-items:center;justify-content:center}
.c{width:${Math.round(out.w * (vertical ? 0.84 : 0.62))}px;padding:${Math.round(u * 0.055)}px;border-radius:${Math.round(u * 0.03)}px;background:#161b22;border:2px solid #30363d;box-shadow:0 30px 90px rgba(0,0,0,.5);box-sizing:border-box}
.k{font-size:${Math.round(u * 0.034)}px;font-weight:700;color:${lightColor(color) ? color : 'color-mix(in srgb, ' + color + ' 55%, white)'};margin:0 0 ${Math.round(u * 0.025)}px;text-transform:uppercase;letter-spacing:.04em}
.n{font-size:${Math.round(u * (vertical ? 0.06 : 0.055))}px;line-height:1.1;margin:0;word-break:break-word}
.n span{color:#8b949e;font-weight:500}.n b{font-weight:800}
.d{font-size:${Math.round(u * 0.034)}px;line-height:1.35;color:#c9d1d9;margin:${Math.round(u * 0.03)}px 0 0}
.p{display:flex;flex-wrap:wrap;gap:${Math.round(u * 0.016)}px;margin-top:${Math.round(u * 0.04)}px}
.p i{font-style:normal;font-size:${Math.round(u * 0.032)}px;font-weight:700;padding:${Math.round(u * 0.01)}px ${Math.round(u * 0.022)}px;border-radius:999px;background:#21262d;border:1px solid #30363d}
.p i:first-child{background:#e3b341;color:#0d1117;border-color:#e3b341}
</style></head><body><div class="c">${text ? `<p class="k">${esc(text)}</p>` : ''}<h1 class="n"><span>${esc(owner)} /</span> <b>${esc(name)}</b></h1>${repo.description ? `<p class="d">${esc(repo.description)}</p>` : ''}<div class="p">${pills.map((x) => `<i>${esc(x)}</i>`).join('')}</div></div></body></html>`
}

/** Dónde va quien presenta: abajo a la derecha (x, y de la esquina y lado del recuadro). */
export function presenterBox(out: { w: number; h: number }): { x: number; y: number; size: number } {
  const vertical = out.h > out.w
  const size = Math.round((vertical ? out.w * 0.36 : out.h * 0.36) / 2) * 2
  return { x: Math.round(out.w - size - out.w * (vertical ? 0.035 : 0.03)), y: Math.round(out.h - size - out.h * (vertical ? 0.045 : 0.05)), size }
}

/**
 * Quien presenta, en su recuadro con fondo transparente: un robot de kywai (recortado, con sombra) o tu personaje en
 * un círculo con el borde del color de la marca (como la cámara de quien habla en un directo).
 */
export function presenterHtml(image: string, cutout: boolean, color: string, size: number): string {
  const ring = Math.max(4, Math.round(size * 0.025))
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
img{position:absolute;display:block}
${cutout
    ? `img{left:4%;top:2%;width:92%;height:94%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.05)}px rgba(0,0,0,.5))}`
    : `img{left:${ring * 2}px;top:${ring * 2}px;width:${size - ring * 4}px;height:${size - ring * 4}px;object-fit:cover;border-radius:50%;box-shadow:0 0 0 ${ring}px ${color}, 0 ${Math.round(size * 0.03)}px ${Math.round(size * 0.05)}px ${ring}px rgba(0,0,0,.45)}`}
</style></head><body><img src="${fileUrl(image)}" alt=""></body></html>`
}

/**
 * Las palabras de una frase con su momento (para los subtítulos palabra a palabra): la frase suena de `start` a
 * `start + secs` y cada palabra dura según sus letras, con una pausa tras la puntuación.
 */
export function spokenWords(text: string, start: number, secs: number, first = 0): Word[] {
  const parts = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (!parts.length || secs <= 0) return []
  const weight = (w: string): number => w.length + 2 + (/[.,;:?!…]$/.test(w) ? 3 : 0)
  const total = parts.reduce((n, w) => n + weight(w), 0)
  const out: Word[] = []
  let t = start
  for (const [k, w] of parts.entries()) {
    const d = (secs * weight(w)) / total
    out.push({ i: first + k, s: Math.round(t * 1000) / 1000, e: Math.round((t + d * 0.92) * 1000) / 1000, w })
    t += d
  }
  return out
}

/** Dónde empieza cada plano en el vídeo montado (los fundidos solapan). */
export function shotStarts(plan: DemoPlan): number[] {
  const out: number[] = []
  let t = 0
  for (const s of plan.shots) {
    out.push(Math.round(t * 1000) / 1000)
    t += shotLength(s) - XFADE
  }
  return out
}

/** El rótulo de arriba en rojo, como en los reels (color de ASS: &HAABBGGRR). */
const LABEL_BOX = '&H002A20E5'

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

function exec(cmd: string, args: string[], timeoutMs: number, signal?: AbortSignal, cwd?: string): Promise<Out> {
  return new Promise((resolve) => {
    let out = ''
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(cmd, args, { windowsHide: true, ...(cwd ? { cwd } : {}) })
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

export interface DemoPresenter {
  /** La imagen de quien presenta (un PNG con fondo transparente si `cutout`). */
  image: string
  cutout: boolean
  /** La voz de cada plano, en el orden de los planos (null si ese plano no habla). Su duración ya está en el plano. */
  voices: ({ file: string; secs: number } | null)[]
}

export interface RenderDemoInput {
  plan: DemoPlan
  presenter?: DemoPresenter | null
  repo?: RepoFacts | null
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
  return plan.shots.reduce((n, s) => n + shotLength(s), 0) - XFADE * Math.max(0, plan.shots.length - 1)
}

/**
 * La altura de quien presenta en cada momento (expresión de ffmpeg): entra desde abajo, flota despacio y da saltitos
 * mientras habla (los robots no tienen boca: hablan con el cuerpo).
 */
export function presenterY(y: number, size: number, talking: { s: number; e: number }[]): string {
  const talk = talking.map((r) => `between(t,${r.s.toFixed(2)},${r.e.toFixed(2)})`).join('+')
  return [
    `${y}`,
    `${Math.round(size * 1.15)}*pow(max(0,1-t/0.5),2)`,
    `${Math.max(3, Math.round(size * 0.018))}*sin(2*PI*t*0.6)`,
    ...(talk ? [`-${Math.max(6, Math.round(size * 0.04))}*abs(sin(2*PI*t*2.4))*min(1,${talk})`] : [])
  ].join('+').replace(/\+-/g, '-')
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
    const secs = shotLength(shot)
    const file = join(dir, `plano-${k}.mp4`)
    const caption =
      shot.text && !['portada', 'rotulo', 'repo', 'cierre'].includes(shot.ficha)
        ? await png(input.presenter ? headlineHtml(shot.text, color, out) : captionHtml(shot.text, color, out), join(dir, `rotulo-${k}.png`), true)
        : null
    // El rótulo aparece a los 0,4 s.
    const withCaption = (base: string): string[] =>
      caption
        ? ['-loop', '1', '-framerate', String(FPS), '-t', secs.toFixed(2), '-i', caption, '-filter_complex', `[0:v]${base}[b];[1:v]format=rgba,fade=t=in:st=0.4:d=0.45:alpha=1[o];[b][o]overlay=0:0,format=yuv420p[v]`, '-map', '[v]']
        : ['-vf', base]
    if (shot.ficha === 'portada' || shot.ficha === 'rotulo' || shot.ficha === 'cierre' || (shot.ficha === 'repo' && input.repo)) {
      const sub = shot.ficha === 'cierre' ? host : (shot.sub ?? '')
      const html = shot.ficha === 'repo' && input.repo ? repoCardHtml(input.repo, shot.text ?? '', color, out) : cardHtml(shot.ficha as 'portada' | 'rotulo' | 'cierre', shot.text ?? plan.title, sub, color, out)
      const img = await png(html, join(dir, `tarjeta-${k}.png`))
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
  input.onStep?.(input.presenter ? 'Uniendo los planos' : 'Uniendo los planos y poniendo la música', input.presenter ? 0.86 : 0.9)
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
  // Con presentador, la música va por debajo de la voz (se mezcla en el último paso).
  const musicNow = music && !input.presenter
  if (musicNow) graph.push(`[${parts.length}:a]volume=0.55,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2,atrim=0:${total.toFixed(2)}[a]`)
  mkdirSync(join(input.out, '..'), { recursive: true })
  const joined = input.presenter ? join(dir, 'planos.mp4') : input.out
  await ff(
    [...parts.flatMap((p) => ['-i', p.file]), ...(musicNow ? ['-i', music] : []), '-filter_complex', graph.join(';'), '-map', '[v]', ...(musicNow ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '160k'] : []),
      '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', input.presenter ? '16' : '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', total.toFixed(2), joined],
    'el vídeo'
  )
  if (input.presenter) await finishWithPresenter({ ...input, presenter: input.presenter, joined, total, musicFile: music, color, ff })
  if (!existsSync(input.out)) throw new Error('No se pudo montar el vídeo')
  rmSync(dir, { recursive: true, force: true })
  return total
}

/**
 * El último paso con presentador: quien presenta en la esquina (entra, flota y da saltitos al hablar), el rótulo fijo
 * de arriba y los subtítulos palabra a palabra (ASS), y el sonido: su voz en cada plano y la música baja por debajo.
 * Si ffmpeg no tiene libass, sale sin subtítulos ni rótulo (mejor eso que nada).
 */
async function finishWithPresenter(a: RenderDemoInput & { presenter: DemoPresenter; joined: string; total: number; musicFile: string | null; color: string; ff: (args: string[], what: string) => Promise<void> }): Promise<void> {
  const { plan, presenter, dir, total } = a
  const out = OUT[a.format]
  a.onStep?.('Poniendo al presentador, su voz y los subtítulos', 0.93)
  const box = presenterBox(out)
  const face = join(dir, 'presentador.png')
  if (!(await a.htmlToPng(presenterHtml(presenter.image, presenter.cutout, a.color, box.size), { w: box.size, h: box.size }, face, { transparent: true })))
    throw new Error('No se pudo preparar al presentador (hace falta la app de escritorio)')
  const starts = shotStarts(plan)
  const lines = plan.shots
    .map((s, k) => ({ say: s.say ?? '', voice: presenter.voices[k] ?? null, at: starts[k] + VOICE_LEAD }))
    .filter((l): l is { say: string; voice: { file: string; secs: number }; at: number } => !!l.voice && !!l.say && existsSync(l.voice.file))
  let n = 0
  const words: Word[] = []
  for (const l of lines) {
    const w = spokenWords(l.say, l.at, l.voice.secs, n)
    n += w.length
    words.push(...w)
  }
  const vertical = out.h > out.w
  writeFileSync(
    join(dir, 'subtitulos.ass'),
    buildAss(words, out, plan.label, { titleUntil: total, titleBox: LABEL_BOX, titleTop: Math.round(out.h * (vertical ? 0.055 : 0.05)), subBottom: Math.round(out.h * (vertical ? 0.285 : 0.08)) })
  )
  const inputs = ['-i', a.joined, '-loop', '1', '-framerate', String(FPS), '-t', total.toFixed(2), '-i', face, ...lines.flatMap((l) => ['-i', l.voice.file]), ...(a.musicFile ? ['-i', a.musicFile] : [])]
  const talking = lines.map((l) => ({ s: l.at, e: l.at + l.voice.secs }))
  const audio: string[] = []
  lines.forEach((l, k) => audio.push(`[${k + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(l.at * 1000)}:all=1[v${k}]`))
  const mixIn = lines.map((_, k) => `[v${k}]`)
  if (a.musicFile) {
    audio.push(`[${lines.length + 2}:a]aresample=48000,aformat=channel_layouts=stereo,volume=0.16,afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2[mu]`)
    mixIn.push('[mu]')
  }
  if (mixIn.length) audio.push(`${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0:dropout_transition=0:duration=longest,apad,atrim=0:${total.toFixed(2)}[a]`)
  const video = (subs: boolean): string =>
    `[1:v]format=rgba,fade=t=in:st=0.05:d=0.3:alpha=1[p];[0:v][p]overlay=x=${box.x}:y='${presenterY(box.y, box.size, talking)}':eval=frame${subs ? '[o];[o]ass=subtitulos.ass' : ''},format=yuv420p[v]`
  const args = (subs: boolean): string[] => [
    ...inputs, '-filter_complex', [video(subs), ...audio].join(';'), '-map', '[v]', ...(mixIn.length ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '192k'] : []),
    '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', total.toFixed(2), a.out
  ]
  // El archivo de subtítulos se nombra sin ruta (desde su carpeta): las rutas de Windows rompen el filtro.
  const r = await exec('ffmpeg', ['-y', '-v', 'error', ...args(true)], 10 * 60_000, a.signal, dir)
  if (r.code === 0 && existsSync(a.out)) return
  await a.ff(args(false), 'el vídeo con el presentador')
}
