// «/aprende»: kywai mira un vídeo (un enlace de YouTube u otra web, o un vídeo o audio adjunto), lo transcribe en el
// propio equipo con Whisper y un agente convierte lo que enseña en una habilidad (SKILL.md) que todo el equipo usa
// desde entonces. El audio no sale del equipo; los enlaces se bajan con yt-dlp (con uv, como el dictado).
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureUv } from './voice'

export interface LearnRequest {
  /** Enlace del vídeo o del pódcast (http/https). */
  url?: string
  /** Lo que el usuario quiere sacar de él («para escribir ofertas», «solo la parte de luces»…). */
  note: string
}

const URL_RE = /https?:\/\/[^\s<>"'`]+/i

/** «/aprende <enlace> [para qué]» o «/aprende [para qué]» con un vídeo adjunto. Devuelve null si no es esa orden. */
export function parseLearnRequest(text: string): LearnRequest | null {
  const m = /^\/(?:aprende|aprender|learn)(?=\s|$)([\s\S]*)$/i.exec(text.trim())
  if (!m) return null
  const rest = m[1].trim()
  const u = URL_RE.exec(rest)
  const url = u ? u[0].replace(/[).,;:!?»]+$/, '') : undefined
  const note = (u ? rest.replace(u[0], ' ') : rest).replace(/\s{2,}/g, ' ').trim()
  return { ...(url ? { url } : {}), note }
}

export const isMediaFile = (name: string): boolean => /\.(mp4|mov|m4v|webm|mkv|avi|mp3|m4a|wav|ogg|opus|aac|flac)$/i.test(name)

interface Out {
  code: number | null
  out: string
}

/** Un programa con sus argumentos tal cual (sin shell: el enlace del usuario nunca se interpreta como orden). */
function exec(cmd: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<Out> {
  return new Promise((resolve) => {
    let out = ''
    const child = spawn(cmd, args, { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' } })
    const take = (b: Buffer): void => {
      out = (out + b.toString('utf8')).slice(-20000)
    }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    const kill = (): void => {
      child.kill()
    }
    const timer = setTimeout(kill, timeoutMs)
    signal?.addEventListener('abort', kill, { once: true })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out: String(e) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', kill)
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

export interface LearnSource {
  /** La transcripción completa (también en transcripcion.txt de la carpeta). */
  transcript: string
  /** Título del vídeo, si se sabe. */
  title?: string
  /** Fotogramas del vídeo adjunto (para ver lo que se enseña en pantalla). */
  frames: string[]
}

/**
 * Prepara lo que el agente va a leer: baja el audio del enlace (o convierte el adjunto), lo transcribe con Whisper y
 * guarda la transcripción en `dir`. Los fotogramas de un vídeo adjunto los saca quien llama (videoFrames).
 */
export async function prepareLearnSource(
  input: { url?: string; file?: string; dir: string; signal?: AbortSignal; onStep?: (text: string) => void }
): Promise<LearnSource> {
  const { dir, signal } = input
  mkdirSync(dir, { recursive: true })
  await ensureUv()
  const audio = join(dir, 'audio.wav')
  let title: string | undefined
  if (input.url) {
    input.onStep?.('Bajando el audio del enlace')
    const r = await exec(
      'uvx',
      // YouTube pide un motor de JavaScript: el Node del equipo (lo usa también el estudio de vídeo).
      ['yt-dlp', '--no-playlist', '--no-progress', '--js-runtimes', 'node', '-f', 'bestaudio/best', '-x', '--audio-format', 'wav', '--postprocessor-args', 'ffmpeg:-ar 16000 -ac 1', '--print-to-file', 'title', join(dir, 'titulo.txt'), '-o', join(dir, 'audio.%(ext)s'), '--', input.url],
      30 * 60_000,
      signal
    )
    if (!existsSync(audio)) {
      // YouTube a veces pide iniciar sesión («no eres un robot»): con el vídeo adjunto siempre funciona.
      if (/sign in|not a bot|login required|private/i.test(r.out)) throw new Error('Esa web no deja bajar el vídeo sin iniciar sesión: descárgalo y adjúntalo a «/aprende»')
      throw new Error(`No se pudo bajar el audio de ese enlace${lastLine(r.out) ? `: ${lastLine(r.out)}` : ''}`)
    }
    try {
      title = readFileSync(join(dir, 'titulo.txt'), 'utf8').trim().split('\n')[0] || undefined
    } catch {
      /* sin título */
    }
  } else if (input.file) {
    input.onStep?.('Sacando el audio del archivo')
    const r = await exec('ffmpeg', ['-y', '-v', 'error', '-i', input.file, '-vn', '-ar', '16000', '-ac', '1', audio], 10 * 60_000, signal)
    if (!existsSync(audio)) throw new Error(`No se pudo leer el audio del archivo${lastLine(r.out) ? `: ${lastLine(r.out)}` : ''}`)
  } else throw new Error('Pon un enlace o adjunta un vídeo o un audio')
  if (signal?.aborted) throw new Error('Cancelada')
  input.onStep?.('Transcribiendo con Whisper en este equipo')
  // Sin --language: Whisper reconoce el idioma solo (muchos vídeos están en inglés).
  const r = await exec('uvx', ['--from', 'whisper-ctranslate2', 'whisper-ctranslate2', audio, '--model', 'small', '--output_format', 'txt', '--output_dir', dir, '--compute_type', 'int8', '--device', 'cpu'], 90 * 60_000, signal)
  const txt = readdirSync(dir).find((f) => f.startsWith('audio') && f.endsWith('.txt'))
  if (!txt) throw new Error(`No se pudo transcribir${lastLine(r.out) ? `: ${lastLine(r.out)}` : ''}`)
  const transcript = readFileSync(join(dir, txt), 'utf8').replace(/\s+/g, ' ').trim()
  if (transcript.length < 40) throw new Error('El vídeo casi no tiene voz: no hay nada que aprender de lo que se dice')
  writeFileSync(join(dir, 'transcripcion.txt'), transcript)
  return { transcript, ...(title ? { title } : {}), frames: [] }
}

/** Lo que cabe de la transcripción en el encargo (el resto queda en el archivo). */
const MAX_INLINE = 60_000

/** El encargo: convertir lo que enseña el vídeo en una habilidad. La respuesta es el SKILL.md entero. */
export function learnPrompt(input: { source: string; title?: string; note: string; transcript: string; transcriptFile: string; frames: string[]; existing: string[] }): string {
  const clipped = input.transcript.length > MAX_INLINE
  return [
    `Convierte lo que enseña este vídeo en una habilidad para el equipo de kywai: ${input.source}${input.title ? ` («${input.title}»)` : ''}.`,
    ...(input.note ? [`Lo que el usuario quiere sacar de él: ${input.note}`] : []),
    '',
    'Una habilidad es un archivo SKILL.md que los agentes leen cuando les sirve. Escríbela así:',
    '- Arriba, el encabezado: «---», «name: nombre-corto-en-minusculas-con-guiones», «description: cuándo usarla, en una línea (lo que la hace útil y en qué tareas)», «---».',
    '- Después, en español, el MÉTODO que enseña el vídeo, para aplicarlo sin haberlo visto: los pasos en orden, las reglas y los criterios concretos (números, plantillas, fórmulas, ejemplos de frases), qué evitar y cómo comprobar que salió bien. Nada de resumen del vídeo, ni de quién lo cuenta, ni de anuncios, ni de «comenta X».',
    '- Solo lo que dice el vídeo (y lo que haga falta para que se entienda). Si algo es dudoso o peligroso, dilo. Si el vídeo no enseña ningún método aprovechable, responde solo «BLOQUEADA:» y el motivo en una frase.',
    '- Entre 300 y 1.500 palabras. Que se entienda leído en frío por otro agente.',
    ...(input.existing.length ? [`- Ya hay habilidades con estos nombres; no repitas ninguno: ${input.existing.join(', ')}.`] : []),
    ...(input.frames.length ? ['', 'Fotogramas del vídeo (ábrelos si lo que se enseña se ve en pantalla):', ...input.frames.map((f) => `- ${f}`)] : []),
    '',
    `Transcripción (hecha con Whisper; puede tener nombres mal escritos: corrígelos si se deduce cuál es)${clipped ? `, recortada; la entera está en ${input.transcriptFile}` : ''}:`,
    '"""',
    clipped ? input.transcript.slice(0, MAX_INLINE) : input.transcript,
    '"""',
    '',
    'Responde SOLO con el contenido del SKILL.md, empezando por «---». Sin crear ni cambiar archivos: kywai la guarda.'
  ].join('\n')
}

/** Saca el SKILL.md de la respuesta del agente y lo valida. */
export function parseLearnedSkill(text: string): { name: string; description: string; body: string } {
  let t = text.trim()
  const fence = /```(?:markdown|md)?\s*\n([\s\S]*?)\n```/.exec(t)
  if (fence && !t.startsWith('---')) t = fence[1].trim()
  const at = t.indexOf('---')
  if (at > 0) t = t.slice(at)
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(t)
  if (!m) throw new Error('La respuesta no empieza por el encabezado «---» de una habilidad')
  const field = (k: string): string => (new RegExp(`^${k}\\s*:\\s*(.+)$`, 'mi').exec(m[1])?.[1] ?? '').trim().replace(/^["']|["']$/g, '')
  const name = field('name')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const description = field('description').slice(0, 400)
  const body = m[2].trim()
  if (!name) throw new Error('La habilidad no tiene «name»')
  if (!description) throw new Error('La habilidad no tiene «description»')
  if (body.length < 200) throw new Error('La habilidad está casi vacía')
  return { name, description, body }
}

/** Guarda la habilidad en la carpeta de habilidades (si el nombre ya existe, con un número). Devuelve su carpeta. */
export function saveLearnedSkill(skillsDir: string, skill: { name: string; description: string; body: string }, source: string): { name: string; file: string } {
  let name = skill.name
  for (let n = 2; existsSync(join(skillsDir, name)); n++) name = `${skill.name}-${n}`
  const dir = join(skillsDir, name)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'SKILL.md')
  const desc = skill.description.replace(/\n/g, ' ')
  writeFileSync(file, `---\nname: ${name}\ndescription: ${desc}\n---\n\n${skill.body}\n\n---\nAprendida por kywai de: ${source}\n`)
  return { name, file }
}
