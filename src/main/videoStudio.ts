// Estudio de vídeo: convierte el guion (videoScript.ts) en un MP4 terminado, siempre con los mismos pasos:
// voz de cada escena, imagen de cada escena, música, mezcla del audio, composición HyperFrames y render. Lo usa el
// motor cuando pides un vídeo («/video …», «créame un vídeo de …»): el agente solo escribe el guion.
//
// Programas: Node/npm (HyperFrames y GSAP, en la carpeta «estudio-video» de la carpeta de trabajo), ffmpeg/ffprobe
// (mezcla y comprobación) y, para la voz, Kokoro (Python, gratis y en el propio equipo) o la voz del sistema
// (say en macOS, la de Windows o espeak-ng en Linux). Las imágenes las genera Gemini si hay clave de API; sin clave, cada
// escena lleva un fondo de diseño animado.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import {
  buildComposition,
  buildTimeline,
  spokenText,
  synthMusic,
  synthSfx,
  videoSlug,
  VOICE_LEAD_S,
  type VideoFormat,
  type VideoScript
} from './videoScript'
import type { VideoStudioStatus } from '@shared/types'

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'

/** Versiones fijas: el mismo guion se monta igual dentro de meses. */
export const HYPERFRAMES_VERSION = '0.9.26'
export const GSAP_VERSION = '3.13.0'
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'

let root = ''

export function initVideoStudio(workspaceRoot: string): void {
  root = join(workspaceRoot, 'estudio-video')
}

export function videoStudioDir(): string {
  return root
}

const bin = (name: string): string => join(root, 'node_modules', '.bin', IS_WIN ? `${name}.cmd` : name)
const venvPython = (): string => join(root, '.venv', IS_WIN ? 'Scripts\\python.exe' : 'bin/python')

interface RunOut {
  code: number | null
  out: string
}

/** Ejecuta un programa (sin consola) y junta su salida; «Detener» lo corta. */
function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; signal?: AbortSignal; onLine?: (l: string) => void } = {}): Promise<RunOut> {
  return new Promise((resolve) => {
    let out = ''
    let buf = ''
    let child: ReturnType<typeof spawn>
    try {
      // En Windows los .cmd (npm, npx, hyperframes) necesitan la consola.
      child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, windowsHide: true, shell: IS_WIN && /\.cmd$|^npm$|^npx$/i.test(cmd) })
    } catch (e) {
      resolve({ code: -1, out: (e as Error).message })
      return
    }
    const take = (chunk: Buffer): void => {
      const text = chunk.toString('utf8')
      out = (out + text).slice(-30000)
      if (!opts.onLine) return
      buf += text
      const lines = buf.split(/\r?\n|\r/)
      buf = lines.pop() ?? ''
      for (const l of lines) if (l.trim()) opts.onLine(l)
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
    const timer = setTimeout(kill, opts.timeoutMs ?? 10 * 60_000)
    opts.signal?.addEventListener('abort', kill, { once: true })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, out })
    })
  })
}

async function has(cmd: string, args: string[] = ['-version']): Promise<boolean> {
  return (await run(cmd, args, { timeoutMs: 15_000 })).code === 0
}

/** Clave de API de Gemini: la del entorno o la que guarda Gemini CLI (~/.gemini/.env), donde la escribe el asistente. */
export function geminiApiKey(): string | null {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim()
  for (const f of [join(homedir(), '.gemini', '.env'), join(homedir(), '.env')]) {
    try {
      const m = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*["']?([^"'\r\n]+)/m.exec(readFileSync(f, 'utf8'))
      if (m?.[1]?.trim()) return m[1].trim()
    } catch {
      /* no está */
    }
  }
  return null
}


async function systemVoice(): Promise<boolean> {
  if (IS_MAC) return has('say', ['-v', '?'])
  if (IS_WIN) return true // System.Speech viene con Windows.
  return has('espeak-ng', ['--version'])
}

const pythonCmd = (): string => (IS_WIN ? 'python' : 'python3')

async function kokoroReady(): Promise<boolean> {
  if (!existsSync(venvPython())) return false
  return (await run(venvPython(), ['-c', 'import kokoro_onnx, soundfile'], { timeoutMs: 30_000 })).code === 0
}

export async function videoStudioStatus(): Promise<VideoStudioStatus> {
  const [node, ffmpeg, ffprobe, python, kokoro, sys] = await Promise.all([
    has('npm', ['--version']),
    has('ffmpeg'),
    has('ffprobe'),
    has(pythonCmd(), ['--version']),
    kokoroReady(),
    systemVoice()
  ])
  const engine = !!root && existsSync(bin('hyperframes')) && existsSync(join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'))
  const voice = kokoro ? 'kokoro' : sys ? 'system' : null
  return { engine, ffmpeg: ffmpeg && ffprobe, voice, images: geminiApiKey() ? 'gemini' : null, node, python, ready: engine && ffmpeg && ffprobe }
}

/**
 * «Instalar lo que falta»: HyperFrames y GSAP en la carpeta del estudio, ffmpeg (Homebrew en macOS, winget en Windows)
 * y la voz Kokoro en un entorno de Python propio. Cada paso dice cómo fue; un paso que falla no frena los demás.
 */
export async function installVideoStudio(onLine: (l: string) => void = () => undefined): Promise<VideoStudioStatus> {
  if (!root) throw new Error('El estudio de vídeo no está preparado')
  mkdirSync(root, { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'kywai-estudio-video', private: true, type: 'module', dependencies: { hyperframes: HYPERFRAMES_VERSION, gsap: GSAP_VERSION } }, null, 2)
  )
  onLine('Instalando HyperFrames y GSAP…')
  const npm = await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: root, timeoutMs: 15 * 60_000, onLine })
  if (npm.code !== 0) onLine(`No se pudo instalar HyperFrames: ${npm.out.trim().split('\n').slice(-3).join(' ')}`)
  if (!(await has('ffmpeg')) || !(await has('ffprobe'))) {
    onLine('Instalando ffmpeg…')
    const r = IS_MAC
      ? await run('brew', ['install', 'ffmpeg'], { timeoutMs: 30 * 60_000, onLine })
      : IS_WIN
        ? await run('winget', ['install', '-e', '--id', 'Gyan.FFmpeg', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], { timeoutMs: 30 * 60_000, onLine })
        : { code: 1, out: 'Instálalo con el gestor de paquetes (por ejemplo «sudo apt install ffmpeg»).' }
    if (r.code !== 0) onLine(`No se pudo instalar ffmpeg: ${r.out.trim().split('\n').slice(-2).join(' ')}`)
  }
  if (!(await kokoroReady())) {
    if (await has(pythonCmd(), ['--version'])) {
      onLine('Instalando la voz Kokoro…')
      if (!existsSync(venvPython())) await run(pythonCmd(), ['-m', 'venv', join(root, '.venv')], { timeoutMs: 5 * 60_000, onLine })
      const pip = await run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', 'kokoro-onnx', 'soundfile'], { timeoutMs: 30 * 60_000, onLine })
      if (pip.code !== 0) onLine('No se pudo instalar Kokoro: se usará la voz del sistema.')
    } else onLine('Sin Python: se usará la voz del sistema (instala Python en el asistente para tener la voz Kokoro).')
  }
  // El navegador del render se descarga la primera vez: mejor aquí que en mitad del primer vídeo.
  if (existsSync(bin('hyperframes'))) {
    onLine('Preparando el navegador del render…')
    await run(bin('hyperframes'), ['browser', 'ensure'], { cwd: root, timeoutMs: 15 * 60_000, onLine })
  }
  return videoStudioStatus()
}

// ---------- pasos del montaje ----------

async function duration(file: string): Promise<number> {
  const r = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { timeoutMs: 30_000 })
  const d = parseFloat(r.out.trim())
  if (!Number.isFinite(d) || d <= 0) throw new Error(`No se pudo medir ${file}`)
  return d
}

const KOKORO_VOICES: Record<string, string> = { es: 'ef_dora', en: 'af_heart', fr: 'ff_siwis', it: 'if_sara', pt: 'pf_dora', ja: 'jf_alpha', zh: 'zf_xiaobei', hi: 'hf_alpha' }
const KOKORO_LANGS: Record<string, string> = { es: 'es', en: 'en-us', fr: 'fr-fr', it: 'it', pt: 'pt-br', ja: 'ja', zh: 'zh', hi: 'hi' }

/** Voz del sistema que habla ese idioma (macOS: «say -v ?» lista «Nombre  es_ES  # …»). */
async function macVoice(lang: string): Promise<string | null> {
  const r = await run('say', ['-v', '?'], { timeoutMs: 15_000 })
  const lines = r.out.split('\n').filter((l) => new RegExp(`\\s${lang}[_-]`, 'i').test(l))
  const prefer = ['Mónica', 'Monica', 'Paulina', 'Marisol', 'Jorge', 'Samantha', 'Thomas', 'Luciana']
  for (const p of prefer) {
    const l = lines.find((x) => x.startsWith(p))
    if (l) return p
  }
  const first = lines[0]?.match(/^(.+?)\s{2,}/)?.[1]
  return first?.trim() || null
}

async function speak(text: string, lang: string, out: string, useKokoro: boolean, signal?: AbortSignal): Promise<void> {
  if (useKokoro && KOKORO_VOICES[lang]) {
    const r = await run(bin('hyperframes'), ['tts', text, '-v', KOKORO_VOICES[lang], '-l', KOKORO_LANGS[lang], '-o', out, '--json'], {
      cwd: root,
      env: { ...process.env, HYPERFRAMES_PYTHON: venvPython(), HYPERFRAMES_NO_TELEMETRY: '1' },
      timeoutMs: 10 * 60_000,
      signal
    })
    if (r.code === 0 && existsSync(out)) return
  }
  const tmp = `${out}.sys${IS_MAC ? '.aiff' : '.wav'}`
  let r: RunOut
  if (IS_MAC) {
    const v = await macVoice(lang)
    r = await run('say', [...(v ? ['-v', v] : []), '-o', tmp, text], { timeoutMs: 5 * 60_000, signal })
  } else if (IS_WIN) {
    const ps = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      `$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like '${lang}*' } | Select-Object -First 1`,
      'if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }',
      `$s.SetOutputToWaveFile('${tmp.replace(/'/g, "''")}')`,
      `$s.Speak([Console]::In.ReadToEnd())`,
      '$s.Dispose()'
    ].join('; ')
    r = await new Promise<RunOut>((resolve) => {
      const child = spawn('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true })
      let o = ''
      child.stdout.on('data', (c: Buffer) => (o += c.toString()))
      child.stderr.on('data', (c: Buffer) => (o += c.toString()))
      child.on('error', (e) => resolve({ code: -1, out: e.message }))
      child.on('close', (code) => resolve({ code, out: o }))
      child.stdin.end(text, 'utf8')
    })
  } else {
    r = await run('espeak-ng', ['-v', lang, '-w', tmp, text], { timeoutMs: 5 * 60_000, signal })
  }
  if (r.code !== 0 || !existsSync(tmp)) throw new Error(`No se pudo generar la voz: ${r.out.trim().slice(-300) || 'sin voz en este equipo'}`)
  const c = await run('ffmpeg', ['-y', '-v', 'error', '-i', tmp, '-ar', '48000', '-ac', '1', out], { timeoutMs: 60_000, signal })
  if (c.code !== 0) throw new Error(`No se pudo convertir la voz: ${c.out.trim().slice(-300)}`)
}

/** Imagen de una escena con Gemini (o null si no hay clave o falla: la escena va con fondo de diseño). */
async function geminiImage(prompt: string, format: VideoFormat, out: string, key: string, signal?: AbortSignal): Promise<boolean> {
  const body = {
    contents: [{ parts: [{ text: `${prompt}. Cinematic, high detail, no text, no letters, no logos, no watermark.` }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: format === 'vertical' ? '9:16' : '16:9' } }
  }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(120_000)
    })
    if (!res.ok) return false
    const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] }
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
    if (!part?.inlineData?.data) return false
    writeFileSync(out, Buffer.from(part.inlineData.data, 'base64'))
    return true
  } catch {
    return false
  }
}

/** Voz de cada escena en su sitio + música que baja cuando habla la voz, normalizado a -16 LUFS (lo que piden YouTube y TikTok). */
async function mixAudio(dir: string, voices: string[], starts: number[], total: number, signal?: AbortSignal): Promise<string> {
  const args = ['-y', '-v', 'error', '-i', join(dir, 'musica.wav'), '-i', join(dir, 'efectos.wav')]
  for (const v of voices) args.push('-i', v)
  const parts: string[] = []
  voices.forEach((_, i) => {
    const ms = Math.round(starts[i] * 1000)
    parts.push(`[${i + 2}:a]aresample=48000,aformat=channel_layouts=mono,adelay=${ms}:all=1,apad[v${i}]`)
  })
  parts.push(`${voices.map((_, i) => `[v${i}]`).join('')}amix=inputs=${voices.length}:normalize=0:duration=longest,atrim=0:${total}[voice]`)
  parts.push('[voice]asplit=2[va][vsc]')
  parts.push(`[0:a]aresample=48000,aformat=channel_layouts=mono,apad,atrim=0:${total},volume=0.32[m]`)
  parts.push('[m][vsc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450[md]')
  parts.push(`[1:a]aresample=48000,aformat=channel_layouts=mono,apad,atrim=0:${total},volume=0.45[fx]`)
  parts.push(`[md][fx][va]amix=inputs=3:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11,aformat=channel_layouts=stereo,atrim=0:${total}[out]`)
  const out = join(dir, 'mezcla.wav')
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', out)
  const r = await run('ffmpeg', args, { timeoutMs: 5 * 60_000, signal })
  if (r.code !== 0) throw new Error(`No se pudo mezclar el audio: ${r.out.trim().slice(-400)}`)
  return out
}

export interface RenderedVideo {
  /** Ruta absoluta del MP4 entregado. */
  file: string
  seconds: number
  width: number
  height: number
  /** Escenas con imagen generada. */
  images: number
  voice: 'kokoro' | 'system'
}

/**
 * Monta el vídeo entero. El material de trabajo va a `workDir` (oculto en el proyecto); el MP4 final se copia a
 * `outDir` con el nombre del título (si ya hay uno, añade -2, -3…).
 */
export async function renderVideo(input: {
  script: VideoScript
  format: VideoFormat
  workDir: string
  outDir: string
  signal?: AbortSignal
  /** Paso en marcha (texto en español con {huecos}, para traducirlo con tr) y avance de 0 a 1. */
  onStep?: (text: string, progress: number, vars?: Record<string, string | number>) => void
}): Promise<RenderedVideo> {
  const { script, format, workDir: dir, signal } = input
  const step = input.onStep ?? (() => undefined)
  const status = await videoStudioStatus()
  if (!status.ready) {
    const missing = [!status.engine && 'HyperFrames', !status.ffmpeg && 'ffmpeg'].filter(Boolean).join(' y ')
    throw new Error(`Falta ${missing} para montar vídeos: instálalo en Ajustes → Extensiones → Estudio de vídeo → «Instalar lo que falta».`)
  }
  if (!status.voice) throw new Error('Este equipo no tiene voz: instala la voz Kokoro en Ajustes → Extensiones → Estudio de vídeo.')
  mkdirSync(join(dir, 'assets'), { recursive: true })
  copyFileSync(join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), join(dir, 'assets', 'gsap.min.js'))
  writeFileSync(join(dir, 'guion.json'), JSON.stringify({ format, ...script }, null, 2))

  // 1. Voz (de una en una: Kokoro ya usa todos los núcleos).
  const voices: string[] = []
  const durations: number[] = []
  for (let i = 0; i < script.scenes.length; i++) {
    if (signal?.aborted) throw new Error('Cancelada')
    step('Poniendo la voz ({n} de {total})', 0.05 + (0.3 * i) / script.scenes.length, { n: i + 1, total: script.scenes.length })
    const out = join(dir, 'assets', `voz-${i + 1}.wav`)
    await speak(spokenText(script.scenes[i].narration), script.lang, out, status.voice === 'kokoro', signal)
    voices.push(out)
    durations.push(await duration(out))
  }
  const tl = buildTimeline(durations)

  // 2. Imágenes (tres a la vez).
  const images: (string | null)[] = script.scenes.map(() => null)
  const key = geminiApiKey()
  if (key) {
    step('Creando las imágenes', 0.38)
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < script.scenes.length && !signal?.aborted) {
        const i = next++
        const prompt = script.scenes[i].image
        if (!prompt) continue
        const rel = `assets/escena-${i + 1}.png`
        if (await geminiImage(prompt, format, join(dir, rel), key, signal)) images[i] = rel
      }
    }
    await Promise.all([worker(), worker(), worker()])
  }

  // 3. Música y mezcla.
  if (signal?.aborted) throw new Error('Cancelada')
  step('Componiendo la música y mezclando', 0.55)
  const comp = buildComposition({ script, format, timeline: tl, images, audio: 'assets/mezcla.wav', gsap: 'assets/gsap.min.js' })
  writeFileSync(join(dir, 'musica.wav'), synthMusic(tl.total, script.title))
  writeFileSync(join(dir, 'efectos.wav'), synthSfx(comp.sfx, tl.total))
  const mix = await mixAudio(dir, voices, tl.scenes.map((s) => s.start + VOICE_LEAD_S), tl.total, signal)
  renameSync(mix, join(dir, 'assets', 'mezcla.wav'))

  // 4. Composición y render.
  writeFileSync(join(dir, 'index.html'), comp.html)
  writeFileSync(join(dir, 'hyperframes.json'), JSON.stringify({ paths: { assets: 'assets' } }, null, 2))
  step('Animando y montando el vídeo', 0.62)
  const rendered = join(dir, 'video.mp4')
  const r = await run(bin('hyperframes'), ['render', '-o', rendered, '-q', 'delivery', '--quiet'], {
    cwd: dir,
    env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', PATH: `${join(root, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}` },
    timeoutMs: 40 * 60_000,
    signal,
    onLine: (l) => {
      const m = /"pct":(\d+)/.exec(l)
      if (m) step('Animando y montando el vídeo', 0.62 + (0.33 * Number(m[1])) / 100)
    }
  })
  if (signal?.aborted) throw new Error('Cancelada')
  if (r.code !== 0 || !existsSync(rendered)) throw new Error(`El render falló: ${r.out.trim().split('\n').slice(-4).join(' ').slice(0, 600)}`)

  // 5. Comprobación: duración, imagen y sonido.
  step('Comprobando el resultado', 0.97)
  const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-show_entries', 'format=duration', '-of', 'json', rendered], { timeoutMs: 30_000 })
  const info = JSON.parse(probe.out || '{}') as { streams?: { codec_type?: string; width?: number; height?: number }[]; format?: { duration?: string } }
  const vs = info.streams?.find((s) => s.codec_type === 'video')
  const hasAudio = info.streams?.some((s) => s.codec_type === 'audio')
  const seconds = parseFloat(info.format?.duration ?? '0')
  if (!vs || !hasAudio || Math.abs(seconds - tl.total) > 1.5) {
    throw new Error(`El vídeo salió mal (${!vs ? 'sin imagen' : !hasAudio ? 'sin sonido' : `dura ${seconds.toFixed(1)} s en vez de ${tl.total.toFixed(1)} s`}).`)
  }

  mkdirSync(input.outDir, { recursive: true })
  const base = `${videoSlug(script.title)}${format === 'vertical' ? '-vertical' : ''}`
  let file = join(input.outDir, `${base}.mp4`)
  for (let n = 2; existsSync(file); n++) file = join(input.outDir, `${base}-${n}.mp4`)
  copyFileSync(rendered, file)
  return { file, seconds, width: vs.width ?? 0, height: vs.height ?? 0, images: images.filter(Boolean).length, voice: status.voice }
}
