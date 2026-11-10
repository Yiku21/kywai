// Estudio de vídeo: convierte el guion (videoScript.ts) en un MP4 terminado, siempre con los mismos pasos:
// voz de cada escena, imagen de cada escena, música, mezcla del audio, composición HyperFrames y render. Lo usa el
// motor cuando pides un vídeo («/video …», «créame un vídeo de …»): el agente solo escribe el guion.
//
// Programas: Node/npm (HyperFrames y GSAP, en la carpeta «estudio-video» de la carpeta de trabajo), ffmpeg/ffprobe
// (mezcla y comprobación) y, para la voz, Kokoro (Python, gratis y en el propio equipo) o la voz del sistema
// (say en macOS, la de Windows o espeak-ng en Linux). Las imágenes las genera Gemini si hay clave de API; sin clave, cada
// escena lleva un fondo de diseño animado.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import {
  buildComposition,
  THEMES,
  buildTimeline,
  spokenText,
  synthMusic,
  synthSfx,
  videoSlug,
  VOICE_LEAD_S,
  type VideoFormat,
  type VideoScript
} from './videoScript'
import { buildCartoonComposition } from './videoCartoon'
import { comfyImage, comfyStatus } from './comfyui'
import { voiceboxProfiles, voiceboxSpeak, voiceboxVoice } from './voicebox'
import type { VideoStudioStatus } from '@shared/types'
import {
  ANIMATION_BASE_COMMIT,
  ANIMATION_BASE_REPO,
  filmPaths,
  kitReady,
  KYWAI_KIT_GUIDE,
  KYWAI_ROBOTS_JS,
  LEMO_OPUSCAR_COMMIT,
  LEMO_OPUSCAR_REPO,
  LEMO_SPARSE,
  lemoReady
} from './filmLibrary'

const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'
const IS_LINUX = process.platform === 'linux'

/** Versiones fijas: el mismo guion se monta igual dentro de meses. */
export const HYPERFRAMES_VERSION = '0.9.26'
export const GSAP_VERSION = '3.13.0'
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image'
/** Voz de Gemini (la misma clave que las imágenes): se prueba en orden por si alguno deja de existir. */
const GEMINI_TTS_MODELS = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts']

let root = ''
let autoInstall = true

/** autoInstall=false: si falta algo, la tarea falla al momento en vez de instalarlo (lo usan las comprobaciones). */
export function initVideoStudio(workspaceRoot: string, opts: { autoInstall?: boolean } = {}): void {
  root = join(workspaceRoot, 'estudio-video')
  autoInstall = opts.autoInstall ?? true
  void has('latex', ['--version']).then((ok) => (latexKnown = ok))
}

export function videoStudioDir(): string {
  return root
}

const bin = (name: string): string => join(root, 'node_modules', '.bin', IS_WIN ? `${name}.cmd` : name)
const venvPython = (): string => join(root, '.venv', IS_WIN ? 'Scripts\\python.exe' : 'bin/python')

// ---------- Manim (animaciones de fórmulas, gráficas y diagramas) ----------

let latexKnown = false

/** ¿Está Manim en el entorno de Python del estudio? (Sin lanzar Python: se mira la carpeta del paquete.) */
export function manimInstalled(): boolean {
  if (!root) return false
  const venv = join(root, '.venv')
  if (IS_WIN) return existsSync(join(venv, 'Lib', 'site-packages', 'manim'))
  try {
    return readdirSync(join(venv, 'lib')).some((d) => d.startsWith('python') && existsSync(join(venv, 'lib', d, 'site-packages', 'manim')))
  } catch {
    return false
  }
}

/** Lo que el guion puede usar de Manim: null si no está; `latex` si hay LaTeX para fórmulas (MathTex). */
export function manimSupport(): { latex: boolean } | null {
  return manimInstalled() ? { latex: latexKnown } : null
}

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
  const [node, ffmpeg, ffprobe, python, kokoro, sys, comfy, vbox] = await Promise.all([
    has('npm', ['--version']),
    has('ffmpeg'),
    has('ffprobe'),
    has(pythonCmd(), ['--version']),
    kokoroReady(),
    systemVoice(),
    comfyStatus(),
    voiceboxProfiles()
  ])
  const engine = !!root && existsSync(bin('hyperframes')) && existsSync(join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'))
  const key = !!geminiApiKey()
  const voice = vbox?.length ? 'voicebox' : key ? 'gemini' : kokoro ? 'kokoro' : sys ? 'system' : null
  return { engine, ffmpeg: ffmpeg && ffprobe, voice, kokoro, images: comfy.info ? 'comfyui' : key ? 'gemini' : null,
    comfyui: { running: comfy.running, checkpoint: comfy.info?.checkpoint ?? null, models: comfy.models },
    voicebox: { running: !!vbox, voices: (vbox ?? []).map((p) => `${p.name} (${p.language})`) },
    manim: manimInstalled(),
    films: { library: lemoReady(filmPaths(root).lib), painted: kitReady(filmPaths(root).kit) },
    gemini: key,
    node, python, ready: engine && ffmpeg && ffprobe }
}

/**
 * «Instalar lo que falta»: HyperFrames y GSAP en la carpeta del estudio, ffmpeg (Homebrew en macOS, winget en Windows)
 * y la voz Kokoro en un entorno de Python propio. Cada paso dice cómo fue; un paso que falla no frena los demás.
 */
let installing: Promise<VideoStudioStatus> | null = null

/** Instala lo que falta una sola vez aunque lleguen varios vídeos a la vez (o se pulse el botón de Ajustes mientras). */
export function ensureVideoStudio(onLine: (l: string) => void = () => undefined): Promise<VideoStudioStatus> {
  installing ??= installVideoStudio(onLine).finally(() => {
    installing = null
  })
  return installing
}

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
  if (!manimInstalled() && existsSync(venvPython())) {
    onLine('Instalando Manim (animaciones de fórmulas y diagramas)…')
    const pip = await run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', 'manim'], { timeoutMs: 30 * 60_000, onLine })
    if (pip.code !== 0)
      onLine(
        IS_LINUX
          ? 'No se pudo instalar Manim: en Linux necesita «libpango1.0-dev», «libcairo2-dev» y «pkg-config» (sudo apt install …). Los vídeos salen igual, con imágenes.'
          : 'No se pudo instalar Manim: los vídeos salen igual, con imágenes.'
      )
  }
  await installFilms(onLine)
  // El navegador del render se descarga la primera vez: mejor aquí que en mitad del primer vídeo.
  if (existsSync(bin('hyperframes'))) {
    onLine('Preparando el navegador del render…')
    await run(bin('hyperframes'), ['browser', 'ensure'], { cwd: root, timeoutMs: 15 * 60_000, onLine })
  }
  return videoStudioStatus()
}

// ---------- estilos de película (src/shared/filmStyles.ts) ----------

/** `sh` para el instalador de Lemo-Opuscar: en Windows, el de Git (Git Bash). */
function shCmd(): string | null {
  if (!IS_WIN) return 'sh'
  const dirs = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs')]
  for (const d of dirs) if (d && existsSync(join(d, 'Git', 'bin', 'sh.exe'))) return join(d, 'Git', 'bin', 'sh.exe')
  return null
}

/**
 * Deja `dir` en una versión fija de un repositorio (sin historia y sin bajar más que lo que se usa). Si ya está en
 * esa versión no hace nada; lo que kywai añadió encima (los robots) se queda.
 */
async function gitAt(dir: string, repo: string, commit: string, sparse: string[] | null, onLine: (l: string) => void): Promise<boolean> {
  if (existsSync(join(dir, '.git'))) {
    if ((await run('git', ['-C', dir, 'rev-parse', 'HEAD'], { timeoutMs: 30_000 })).out.trim() === commit) return true
  } else {
    mkdirSync(dir, { recursive: true })
    if ((await run('git', ['init', '-q', dir], { timeoutMs: 30_000 })).code !== 0) return false
    await run('git', ['-C', dir, 'remote', 'add', 'origin', repo], { timeoutMs: 30_000 })
  }
  if (sparse) {
    // A mano y antes de sacar los archivos: «sparse-checkout set» no va bien en un repositorio aún vacío.
    mkdirSync(join(dir, '.git', 'info'), { recursive: true })
    writeFileSync(join(dir, '.git', 'info', 'sparse-checkout'), sparse.join('\n') + '\n')
    await run('git', ['-C', dir, 'config', 'core.sparseCheckout', 'true'], { timeoutMs: 30_000 })
  }
  const f = await run('git', ['-C', dir, 'fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', commit], { timeoutMs: 20 * 60_000, onLine })
  if (f.code !== 0) {
    onLine(`git: ${f.out.trim().split('\n').slice(-2).join(' ')}`)
    return false
  }
  return (await run('git', ['-C', dir, 'checkout', '-q', '--force', 'FETCH_HEAD'], { timeoutMs: 20 * 60_000, onLine })).code === 0
}

/**
 * Los estilos de película: la biblioteca Lemo-Opuscar con sus paquetes (Node, el navegador del render, Python y la
 * voz, con su propio instalador) y el kit de animación pintada con los robots de kywai. Cada parte que falla se
 * cuenta y no frena el resto: los vídeos normales salen igual.
 */
async function installFilms(onLine: (l: string) => void): Promise<void> {
  if (!(await has('git', ['--version']))) {
    onLine('Sin git: no se pueden descargar los estilos de película (instala git y vuelve a pulsar «Instalar lo que falta»).')
    return
  }
  const { lib, kit } = filmPaths(root)
  if (!lemoReady(lib)) {
    onLine('Descargando la biblioteca de estilos de película (Lemo-Opuscar)…')
    if (!(await gitAt(lib, LEMO_OPUSCAR_REPO, LEMO_OPUSCAR_COMMIT, LEMO_SPARSE, onLine))) onLine('No se pudo descargar la biblioteca de estilos.')
    else {
      const sh = shCmd()
      if (!sh) onLine('Para los estilos de película en Windows hace falta Git para Windows (trae «sh»).')
      else {
        onLine('Instalando lo que usan los estilos (Node, navegador del render, Python y voz)…')
        const env = { ...process.env, LEMO_OPUSCAR_HOME: lib }
        const r = await run(sh, [join(lib, 'plugin', 'skills', 'lemo-opuscar', 'scripts', 'setup.sh'), 'deps', 'voice'], { cwd: lib, env, timeoutMs: 45 * 60_000, onLine })
        if (r.code !== 0) onLine(`No se pudo terminar de instalar los estilos: ${r.out.trim().split('\n').slice(-2).join(' ')}`)
      }
    }
  }
  if (!kitReady(kit)) {
    onLine('Descargando el kit de animación pintada a mano…')
    if (!(await gitAt(kit, ANIMATION_BASE_REPO, ANIMATION_BASE_COMMIT, null, onLine))) onLine('No se pudo descargar el kit de animación pintada.')
    else {
      writeFileSync(join(kit, 'src', 'kywai-robots.js'), KYWAI_ROBOTS_JS)
      writeFileSync(join(kit, 'KYWAI.md'), KYWAI_KIT_GUIDE)
      const studio = join(kit, 'studio.html')
      const html = existsSync(studio) ? readFileSync(studio, 'utf8') : ''
      if (html && !html.includes('kywai-robots.js')) writeFileSync(studio, html.replace('<script src="src/clawd.js"></script>', '<script src="src/clawd.js"></script>\n<script src="src/kywai-robots.js"></script>'))
      const npm = await run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: kit, timeoutMs: 15 * 60_000, onLine })
      if (npm.code !== 0) onLine('No se pudieron instalar los paquetes del kit de animación pintada.')
    }
  }
}

/** Duración de un vídeo o audio en segundos (0 si no se puede leer). */
export async function mediaSeconds(file: string): Promise<number> {
  return duration(file).catch(() => 0)
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

/**
 * Voz de Gemini: mucho más humana que Kokoro y con el tono que se le pide (con humor, con energía). Devuelve false si no
 * sale (sin red, cuota, modelo retirado): entonces todo el vídeo va con Kokoro, para que no mezcle voces.
 */
async function geminiSpeak(text: string, tone: string, voiceName: string, out: string, key: string, signal?: AbortSignal): Promise<boolean> {
  for (const model of GEMINI_TTS_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) return false
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${tone}: ${text}` }] }],
            generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } }
          }),
          signal: signal ?? AbortSignal.timeout(120_000)
        })
        if (res.status === 404) break
        if (!res.ok) {
          // Cuota por minuto: espera un poco y reintenta.
          if (res.status === 429) await new Promise((r) => setTimeout(r, 8000))
          continue
        }
        const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] }
        const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
        if (!part?.inlineData?.data) continue
        const rate = /rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1] ?? '24000'
        const pcm = `${out}.pcm`
        writeFileSync(pcm, Buffer.from(part.inlineData.data, 'base64'))
        const c = await run('ffmpeg', ['-y', '-v', 'error', '-f', 's16le', '-ar', rate, '-ac', '1', '-i', pcm, '-ar', '48000', '-ac', '1', out], { timeoutMs: 60_000, signal })
        if (c.code === 0 && existsSync(out)) return true
      } catch {
        /* reintenta */
      }
    }
  }
  return false
}

/** Cómo debe sonar cada escena (instrucción para la voz de Gemini, en inglés: la entiende mejor). */
function voiceTone(style: VideoScript['style'], joke: boolean): string {
  if (joke) return 'Say this as a joke, playful and funny, with a little laugh, like a friendly YouTuber'
  if (style === 'cartoon') return 'Say this warmly and with energy, like a friendly, upbeat YouTuber explaining a tutorial to a friend, natural and smiling'
  return 'Say this fast and punchy, full of energy, like a viral short-video creator hooking the viewer'
}

/** Imagen de una escena con Gemini (o null si no hay clave o falla: la escena va con fondo de diseño). */
function imagePromptText(prompt: string, cartoon: boolean): string {
  // En cartoon todas las ilustraciones piden el mismo estilo, para que el vídeo se vea de una pieza.
  return cartoon
    ? `Flat 2D cartoon illustration in a friendly explainer-video style: bold dark outlines, bright cheerful colors, simple soft shading, clean uncluttered background, clear close-up of the action. ${prompt}. No text, no letters, no numbers, no logos, no watermark, no faces.`
    : `${prompt}. Cinematic, high detail, no text, no letters, no logos, no watermark.`
}

async function geminiImage(prompt: string, format: VideoFormat, out: string, key: string, cartoon: boolean, signal?: AbortSignal): Promise<boolean> {
  const text = imagePromptText(prompt, cartoon)
  const body = {
    contents: [{ parts: [{ text }] }],
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

/** Busca un archivo por nombre dentro de una carpeta (Manim lo deja en videos/<escena>/<resolución>/). */
function findFile(dir: string, name: string, depth = 4): string | null {
  if (!existsSync(dir) || depth < 0) return null
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isFile() && e.name === name) return p
    if (e.isDirectory() && e.name !== 'partial_movie_files') {
      const hit = findFile(p, name, depth - 1)
      if (hit) return hit
    }
  }
  return null
}

/**
 * Renderiza con Manim el código de una escena (clase `Escena`) a pantalla completa y con el fondo del tema. Devuelve
 * el MP4 o null si falla (la escena sigue con su imagen o con el fondo de diseño).
 */
async function renderManim(code: string, n: number, format: VideoFormat, bg: string, dir: string, signal?: AbortSignal): Promise<string | null> {
  const work = join(dir, 'manim')
  mkdirSync(work, { recursive: true })
  const name = `escena-${n}`
  // El fondo del tema va delante; el código del guion, tal cual (ya trae su «from manim import *»).
  writeFileSync(join(work, `${name}.py`), `from manim import *\nconfig.background_color = "${bg}"\n\n${code}\n`)
  const [w, h] = format === 'vertical' ? [1080, 1920] : [1920, 1080]
  const out = await run(
    venvPython(),
    ['-m', 'manim', 'render', '-qm', '--format', 'mp4', '--disable_caching', '-r', `${w},${h}`, '--fps', '30', '--media_dir', join(work, 'media'), '-o', name, `${name}.py`, 'Escena'],
    { cwd: work, timeoutMs: 4 * 60_000, signal }
  )
  if (out.code !== 0) {
    writeFileSync(join(work, `${name}.log`), out.out.slice(-4000))
    return null
  }
  return findFile(join(work, 'media'), `${name}.mp4`)
}

/** Ajusta el clip de Manim a lo que dura su escena: si es más corto, se queda en el último fotograma; si es más largo, se corta. */
async function fitClip(src: string, seconds: number, out: string, signal?: AbortSignal): Promise<boolean> {
  const d = seconds.toFixed(3)
  const r = await run(
    'ffmpeg',
    ['-y', '-v', 'error', '-i', src, '-vf', `tpad=stop_mode=clone:stop_duration=${d}`, '-t', d, '-an', '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', out],
    { timeoutMs: 3 * 60_000, signal }
  )
  return r.code === 0 && existsSync(out)
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
  voice: 'voicebox' | 'gemini' | 'kokoro' | 'system'
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
  let status = await videoStudioStatus()
  if (!status.ready || !status.voice) {
    // La primera vez que se pide un vídeo, kywai instala solo lo que falta (sin pasar por Ajustes).
    step('Instalando el estudio de vídeo (solo la primera vez; tarda unos minutos)', 0.01)
    const log: string[] = []
    if (autoInstall) status = await ensureVideoStudio((l) => log.push(l))
    if (!status.ready) {
      const missing = [!status.engine && 'HyperFrames', !status.ffmpeg && 'ffmpeg'].filter(Boolean).join(' y ')
      throw new Error(`No se pudo instalar ${missing}: ${log.slice(-3).join(' ').slice(0, 400)}. Prueba en Ajustes → Extensiones → Estudio de vídeo → «Instalar lo que falta».`)
    }
  }
  if (!status.voice) throw new Error('Este equipo no tiene voz: instala la voz Kokoro en Ajustes → Extensiones → Estudio de vídeo.')
  mkdirSync(join(dir, 'assets'), { recursive: true })
  copyFileSync(join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'), join(dir, 'assets', 'gsap.min.js'))
  writeFileSync(join(dir, 'guion.json'), JSON.stringify({ format, ...script }, null, 2))

  const cartoon = script.style === 'cartoon'
  const key = geminiApiKey()
  const n = script.scenes.length
  let spoken = 0
  const voiceStep = (): void => step('Poniendo la voz ({n} de {total})', 0.05 + (0.45 * spoken) / n, { n: Math.min(n, spoken + 1), total: n })

  // 1. Voz e imágenes a la vez (lo que más tarda).
  const voices = script.scenes.map((_, i) => join(dir, 'assets', `voz-${i + 1}.wav`))
  let voiceUsed: RenderedVideo['voice'] = 'kokoro'
  const doVoices = async (): Promise<void> => {
    // Voicebox abierto en el equipo, con una voz en el idioma del vídeo: va primero (local y gratis). De una en una
    // (usa la gráfica). Si una escena no sale, se pasa a Gemini o Kokoro para todo el vídeo.
    const vb = await voiceboxVoice(script.lang)
    if (vb) {
      let ok = true
      for (let i = 0; i < n && ok && !signal?.aborted; i++) {
        voiceStep()
        ok = await voiceboxSpeak(vb, spokenText(script.scenes[i].narration), voices[i], { instructions: voiceTone(script.style, !!script.scenes[i].joke), signal })
        if (ok) spoken++
      }
      if (ok && !signal?.aborted) {
        voiceUsed = 'voicebox'
        return
      }
      spoken = 0
    }
    // Gemini (dos a la vez); si una escena no sale, todo el vídeo con Kokoro o la del sistema, para no mezclar voces.
    if (key) {
      let next = 0
      let failed = false
      const worker = async (): Promise<void> => {
        while (next < n && !failed && !signal?.aborted) {
          const i = next++
          const sc = script.scenes[i]
          const voiceName = cartoon ? 'Puck' : 'Fenrir'
          if (await geminiSpeak(spokenText(sc.narration), voiceTone(script.style, !!sc.joke), voiceName, voices[i], key, signal)) {
            spoken++
            voiceStep()
          } else failed = true
        }
      }
      voiceStep()
      await Promise.all([worker(), worker()])
      if (!failed && !signal?.aborted) {
        voiceUsed = 'gemini'
        return
      }
      spoken = 0
    }
    voiceUsed = status.kokoro ? 'kokoro' : 'system'
    // De una en una: Kokoro ya usa todos los núcleos.
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw new Error('Cancelada')
      voiceStep()
      await speak(spokenText(script.scenes[i].narration), script.lang, voices[i], status.kokoro, signal)
      spoken++
    }
  }

  // Imágenes (tres a la vez). En cartoon, cada escena puede tener varios planos.
  // Con Manim, las escenas que traen su animación no necesitan imagen.
  const useManim = manimInstalled() && script.scenes.some((sc) => !!sc.manim)
  const shotPrompts = script.scenes.map((sc) =>
    useManim && sc.manim ? [] : cartoon ? (sc.shots?.length ? sc.shots : sc.image ? [sc.image] : []) : sc.image ? [sc.image] : []
  )
  const shots: (string | null)[][] = shotPrompts.map((list) => list.map(() => null))
  // ComfyUI en este equipo va primero (gratis y local); si una imagen falla, la pide Gemini (con clave).
  const comfy = (await comfyStatus()).info
  const doImages = async (): Promise<void> => {
    if (!key && !comfy) return
    const jobs = shotPrompts.flatMap((list, i) => list.map((prompt, k) => ({ i, k, prompt })))
    let next = 0
    let comfyFails = 0
    const worker = async (): Promise<void> => {
      while (next < jobs.length && !signal?.aborted) {
        const { i, k, prompt } = jobs[next++]
        const rel = `assets/escena-${i + 1}${k ? `-${k + 1}` : ''}.png`
        const out = join(dir, rel)
        // Tras dos fallos seguidos de ComfyUI, el resto va directo a Gemini.
        if (comfy && comfyFails < 2) {
          if (await comfyImage(comfy, imagePromptText(prompt, cartoon), format === 'vertical', out, { signal })) {
            shots[i][k] = rel
            comfyFails = 0
            continue
          }
          comfyFails++
        }
        if (key && (await geminiImage(prompt, format, out, key, cartoon, signal))) shots[i][k] = rel
      }
    }
    // ComfyUI hace una imagen detrás de otra (una sola gráfica); Gemini, tres a la vez.
    await Promise.all(comfy ? [worker()] : [worker(), worker(), worker()])
  }
  if (key || comfy) step('Creando las imágenes y la voz', 0.05)
  // Animaciones de Manim, una detrás de otra (cada una usa todos los núcleos), mientras se hacen la voz y las imágenes.
  const rawClips: (string | null)[] = script.scenes.map(() => null)
  const doManim = async (): Promise<void> => {
    if (!useManim) return
    for (let i = 0; i < n && !signal?.aborted; i++) {
      const code = script.scenes[i].manim
      if (code) rawClips[i] = await renderManim(code, i + 1, format, THEMES[script.theme].bg, dir, signal)
    }
  }
  await Promise.all([doVoices(), doImages(), doManim()])
  if (signal?.aborted) throw new Error('Cancelada')
  const durations: number[] = []
  for (const v of voices) durations.push(await duration(v))
  const tl = buildTimeline(durations)
  const images = shots.map((list) => list.find((x) => !!x) ?? null)
  const clips: (string | null)[] = script.scenes.map(() => null)
  for (let i = 0; i < n; i++) {
    const raw = rawClips[i]
    if (!raw || signal?.aborted) continue
    const rel = `assets/manim-${i + 1}.mp4`
    if (await fitClip(raw, tl.scenes[i].duration, join(dir, rel), signal)) clips[i] = rel
  }

  // 3. Música y mezcla.
  if (signal?.aborted) throw new Error('Cancelada')
  step('Componiendo la música y mezclando', 0.55)
  const compInput = { script, format, timeline: tl, images, shots, clips, audio: 'assets/mezcla.wav', gsap: 'assets/gsap.min.js' }
  const comp = cartoon ? buildCartoonComposition(compInput) : buildComposition(compInput)
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
  return { file, seconds, width: vs.width ?? 0, height: vs.height ?? 0, images: shots.flat().filter(Boolean).length, voice: voiceUsed }
}
