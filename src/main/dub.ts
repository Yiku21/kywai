// «/doblar <idioma>»: el último vídeo hecho con «/video» (o el que adjuntes, si salió de aquí) en otro idioma.
// Un agente traduce el guion (la voz, los rótulos, el cierre y los textos de las animaciones), con las mismas marcas de
// emoción y de quién habla, y kywai lo vuelve a montar con las MISMAS imágenes (renderVideo con `reuseFrom`): solo
// cambian la voz, los subtítulos y los rótulos. Las películas con estilo y los vídeos de fuera no se pueden doblar.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parseVideoScript, videoSlug, type VideoFormat, type VideoScene, type VideoScript } from './videoScript'

export interface DubLanguage {
  code: string
  /** En español, para el encargo y los mensajes. */
  name: string
}

const LANGS: [string, string, RegExp][] = [
  ['es', 'español', /^(es|espa[ñn]ol|castellano|spanish)$/],
  ['en', 'inglés', /^(en|ingl[eé]s|english)$/],
  ['pt', 'portugués', /^(pt|portugu[eé]s|brasile[ñn]o|portuguese)$/],
  ['fr', 'francés', /^(fr|franc[eé]s|french)$/],
  ['it', 'italiano', /^(it|italiano|italian)$/],
  ['de', 'alemán', /^(de|alem[aá]n|german)$/],
  ['ca', 'catalán', /^(ca|catal[aá]n|catal[aà]|catalan)$/],
  ['nl', 'neerlandés', /^(nl|neerland[eé]s|holand[eé]s|dutch)$/],
  ['pl', 'polaco', /^(pl|polaco|polish)$/],
  ['ru', 'ruso', /^(ru|ruso|russian)$/],
  ['tr', 'turco', /^(tr|turco|turkish)$/],
  ['ar', 'árabe', /^(ar|[aá]rabe|arabic)$/],
  ['hi', 'hindi', /^(hi|hindi)$/],
  ['zh', 'chino', /^(zh|chino|mandar[ií]n|chinese)$/],
  ['ja', 'japonés', /^(ja|japon[eé]s|japanese)$/],
  ['ko', 'coreano', /^(ko|coreano|korean)$/]
]

export const DUB_LANGUAGES: readonly DubLanguage[] = LANGS.map(([code, name]) => ({ code, name }))

export interface DubRequest {
  /** null: no dijo el idioma (o no se conoce). */
  lang: DubLanguage | null
  note: string
}

/** «/doblar inglés [lo que sea]» (también «al inglés», «a inglés»). null si no es la orden. */
export function parseDubRequest(text: string): DubRequest | null {
  const m = /^\/(?:doblar|dobla|doblaje|dub|traducir-video)(?=\s|$)([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  const words = m[1].trim().split(/\s+/).filter(Boolean)
  if (/^(al?|en)$/i.test(words[0] ?? '')) words.shift()
  const first = (words[0] ?? '').toLowerCase().replace(/[.,;:!?]+$/, '')
  const found = LANGS.find(([, , re]) => re.test(first))
  if (found) words.shift()
  return { lang: found ? { code: found[0], name: found[1] } : null, note: words.join(' ') }
}

/** La narración con sus marcas («[Hermes, alegre] …»), como la escribió el agente. */
export function markedNarration(sc: Pick<VideoScene, 'narration' | 'lines'>): string {
  if (!sc.lines?.length) return sc.narration
  return sc.lines.map((l) => `[${l.who ? `${l.who}, ` : ''}${l.emotion}] ${l.text}`).join(' ')
}

/** El guion guardado (guion.json) en la forma en que lo escribe el agente, para volver a pasarlo por parseVideoScript. */
export function rawScript(s: VideoScript): Record<string, unknown> {
  return {
    title: s.title,
    lang: s.lang,
    theme: s.theme,
    style: s.style,
    outro: s.outro,
    ...(s.look ? { look: s.look } : {}),
    ...(s.cast ? { cast: s.cast } : {}),
    ...(s.episode ? { episode: s.episode } : {}),
    ...(s.speakers ? { speakers: s.speakers } : {}),
    scenes: s.scenes.map((sc) => ({
      heading: sc.heading,
      narration: markedNarration(sc),
      image: sc.image,
      ...(sc.shots ? { shots: sc.shots } : {}),
      ...(sc.pose ? { pose: sc.pose } : {}),
      ...(sc.step ? { step: sc.step } : {}),
      ...(sc.joke ? { joke: true } : {}),
      ...(sc.manim ? { manim: sc.manim } : {}),
      ...(sc.motion ? { motion: sc.motion } : {}),
      ...(sc.text ? { mode: 'texto' } : {})
    }))
  }
}

export function dubPrompt(input: { script: VideoScript; lang: DubLanguage; note: string }): string {
  const s = input.script
  const toTranslate = {
    title: s.title,
    outro: s.outro,
    scenes: s.scenes.map((sc) => ({ heading: sc.heading, narration: markedNarration(sc), ...(sc.manim ? { manim: sc.manim } : {}) }))
  }
  return [
    `Traduce el guion de este vídeo al ${input.lang.name} para doblarlo. kywai lo vuelve a montar con las mismas imágenes: solo cambian la voz, los subtítulos y los rótulos.`,
    ...(input.note ? [`Lo que pide el usuario: ${input.note}`] : []),
    '',
    'Reglas:',
    '- Traduce como lo diría alguien nativo en un vídeo corto de redes, no palabra por palabra: mismo tono, mismo gancho, misma energía. Cada escena debe durar más o menos lo mismo dicha en voz alta.',
    '- Deja EXACTAMENTE igual lo que va entre corchetes («[alegre]», «[Hermes, sorprendido]»): son marcas de emoción y de quién habla, no se dicen.',
    '- Mantén los *asteriscos* de las palabras clave (en la palabra traducida que corresponda).',
    '- "heading" son rótulos de pocas palabras: que sigan siendo cortos.',
    '- En "manim" (código Python de animaciones) traduce SOLO el texto entre comillas que sale en pantalla; no toques nada más del código.',
    `- El mismo número de escenas y en el mismo orden (${s.scenes.length}).`,
    '',
    'El guion:',
    JSON.stringify(toTranslate, null, 2),
    '',
    'Responde SOLO con el mismo JSON traducido (las mismas claves), sin nada más. No crees ni cambies archivos.'
  ].join('\n')
}

/** El guion traducido: los textos del agente sobre el guion original (imágenes, poses, movimiento… iguales). */
export function applyDub(original: VideoScript, reply: string, lang: DubLanguage): VideoScript {
  const a = reply.indexOf('{')
  const b = reply.lastIndexOf('}')
  if (a < 0 || b <= a) throw new Error('La respuesta no trae el JSON')
  const t = JSON.parse(reply.slice(a, b + 1)) as { title?: unknown; outro?: unknown; scenes?: { heading?: unknown; narration?: unknown; manim?: unknown }[] }
  const scenes = Array.isArray(t.scenes) ? t.scenes : []
  if (scenes.length !== original.scenes.length) throw new Error(`trae ${scenes.length} escenas y el vídeo tiene ${original.scenes.length}`)
  const raw = rawScript(original)
  const str = (v: unknown, def: string): string => (typeof v === 'string' && v.trim() ? v.trim() : def)
  raw.title = str(t.title, original.title)
  raw.outro = str(t.outro, original.outro)
  raw.lang = lang.code
  raw.scenes = (raw.scenes as Record<string, unknown>[]).map((sc, i) => {
    const tr = scenes[i] ?? {}
    const narration = str(tr.narration, '')
    if (!narration) throw new Error(`la escena ${i + 1} no trae la narración`)
    // El código de Manim traducido solo si sigue siendo la misma animación; si no, el original.
    const manim = typeof tr.manim === 'string' && /class\s+Escena\s*\(/.test(tr.manim) ? tr.manim : sc.manim
    return { ...sc, heading: str(tr.heading, String(sc.heading)), narration, ...(manim ? { manim } : {}) }
  })
  const out = parseVideoScript(JSON.stringify(raw))
  if (out.scenes.length !== original.scenes.length) throw new Error('alguna escena quedó vacía al traducir')
  return out
}

/** Lo que kywai apunta de cada vídeo de «/video» al entregarlo, en su carpeta de trabajo. */
export const DELIVERED = 'entregado.json'

export function markDelivered(workDir: string, video: string): void {
  try {
    writeFileSync(join(workDir, DELIVERED), JSON.stringify({ video }, null, 2))
  } catch {
    /* sin la marca, se busca por el nombre */
  }
}

/** El guion y el formato de un vídeo de «/video» a partir de su carpeta de trabajo. null si no está o está roto. */
export function loadDubSource(dir: string): DubSource | null {
  try {
    const j = JSON.parse(readFileSync(join(dir, 'guion.json'), 'utf8')) as Record<string, unknown>
    const script = parseVideoScript(JSON.stringify(rawScript(j as unknown as VideoScript)))
    return { dir, script, format: j.format === 'horizontal' ? 'horizontal' : 'vertical' }
  } catch {
    return null
  }
}

export interface DubSource {
  /** La carpeta de trabajo del vídeo original (absoluta). */
  dir: string
  script: VideoScript
  format: VideoFormat
}

/**
 * La carpeta de trabajo de un vídeo de «/video» (en .ai-cowork/videos): la que lo apuntó al entregarlo o, en los
 * hechos antes de apuntarlo, la más reciente cuyo guion da ese nombre de archivo. null si no salió de aquí.
 */
export function findDubSource(root: string, video: string): DubSource | null {
  const base = join(root, '.ai-cowork', 'videos')
  let dirs: string[]
  try {
    dirs = readdirSync(base)
      .map((d) => join(base, d))
      .filter((d) => existsSync(join(d, 'guion.json')))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  } catch {
    return null
  }
  const want = video.replace(/\\/g, '/')
  const name = basename(want).replace(/\.mp4$/i, '').replace(/-\d+$/, '')
  for (const dir of dirs) {
    try {
      const d = JSON.parse(readFileSync(join(dir, DELIVERED), 'utf8')) as { video?: string }
      if (d.video?.replace(/\\/g, '/') === want || (d.video && basename(d.video) === basename(want))) return loadDubSource(dir)
    } catch {
      /* sin marca */
    }
  }
  for (const dir of dirs) {
    if (existsSync(join(dir, DELIVERED))) continue
    try {
      const j = JSON.parse(readFileSync(join(dir, 'guion.json'), 'utf8')) as { title?: string; format?: string }
      if (`${videoSlug(j.title ?? '')}${j.format === 'vertical' ? '-vertical' : ''}` === name) return loadDubSource(dir)
    } catch {
      /* guion roto */
    }
  }
  return null
}
