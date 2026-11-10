// Estudio de vídeo: convierte el guion (videoScript.ts) en un MP4 terminado, siempre con los mismos pasos:
// voz de cada escena, imagen de cada escena, música, mezcla del audio, composición HyperFrames y render. Lo usa el
// motor cuando pides un vídeo («/video …», «créame un vídeo de …»): el agente solo escribe el guion.
//
// Programas: Node/npm (HyperFrames y GSAP, en la carpeta «estudio-video» de la carpeta de trabajo), ffmpeg/ffprobe
// (mezcla y comprobación) y, para la voz, Kokoro (Python, gratis y en el propio equipo) o la voz del sistema
// (say en macOS, la de Windows o espeak-ng en Linux). Las imágenes las genera Gemini si hay clave de API; sin clave, cada
// escena lleva un fondo de diseño animado.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import {
  buildComposition,
  THEMES,
  buildTimeline,
  hasPresenter,
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
import { voiceboxProfiles, voiceboxSpeak, voiceboxUrl, voiceboxVoice, type VoiceboxVoice } from './voicebox'
import { animateStill, findFreeVideo, freeVideoStatus, motionPrompt } from './freevideo'
import type { VideoStudioStatus, VideoVoiceInfo } from '@shared/types'
import { EDGE_VOICES, GEMINI_VOICES, KOKORO_VOICE_LIST, MAC_VOICES, LANG_VOICES, parseVoiceId, defaultVoiceFor, type VoiceEngine } from '@shared/videoChoice'
import { tr } from '@shared/i18n'
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

/** Kokoro y Manim piden Python 3.10 o más nuevo (el python3 que trae macOS es el 3.9). */
const MIN_PY: [number, number] = [3, 10]

async function pyVersion(cmd: string): Promise<[number, number] | null> {
  const r = await run(cmd, ['-c', 'import sys; print(sys.version_info[0], sys.version_info[1])'], { timeoutMs: 20_000 })
  const m = r.code === 0 ? r.out.trim().match(/^(\d+) (\d+)/) : null
  return m ? [Number(m[1]), Number(m[2])] : null
}

const newEnough = (v: [number, number] | null): boolean => !!v && (v[0] > MIN_PY[0] || (v[0] === MIN_PY[0] && v[1] >= MIN_PY[1]))

/** El Python más nuevo del equipo que sirva (3.10+): primero los de versión concreta y los de Homebrew. */
async function findPython(): Promise<string | null> {
  const minors = [13, 12, 11, 10]
  const cands = IS_WIN
    ? ['python', 'python3']
    : [
        ...minors.flatMap((m) => [`/opt/homebrew/bin/python3.${m}`, `/usr/local/bin/python3.${m}`]),
        ...minors.map((m) => `python3.${m}`),
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        'python3'
      ]
  for (const c of cands) {
    if (c.startsWith('/') && !existsSync(c)) continue
    if (newEnough(await pyVersion(c))) return c
  }
  return null
}

/** uv (de Astral): crea el entorno con un Python nuevo descargado aparte, sin administrador. */
async function findUv(): Promise<string | null> {
  const home = homedir()
  for (const c of ['uv', join(home, '.local', 'bin', IS_WIN ? 'uv.exe' : 'uv'), join(home, '.cargo', 'bin', IS_WIN ? 'uv.exe' : 'uv')]) {
    if ((c === 'uv' || existsSync(c)) && (await has(c, ['--version']))) return c
  }
  return null
}

/**
 * El entorno de Python del estudio con un Python 3.10 o más nuevo. Si había uno viejo (p. ej. con el 3.9 de macOS),
 * se rehace. Sin un Python que sirva, lo trae uv (se instala con el instalador oficial si no está).
 */
export async function ensureVenv(onLine: (l: string) => void = () => undefined): Promise<boolean> {
  const venv = join(root, '.venv')
  if (existsSync(venvPython())) {
    if (newEnough(await pyVersion(venvPython()))) return true
    onLine('El entorno de Python del estudio es de una versión vieja: se rehace con una nueva…')
    rmSync(venv, { recursive: true, force: true })
  }
  const py = await findPython()
  if (py) {
    await run(py, ['-m', 'venv', venv], { timeoutMs: 5 * 60_000, onLine })
    if (existsSync(venvPython())) return true
  }
  let uv = await findUv()
  if (!uv) {
    onLine('Instalando uv para tener un Python nuevo (sin tocar el del sistema)…')
    await (IS_WIN
      ? run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://astral.sh/uv/install.ps1 | iex'], { timeoutMs: 10 * 60_000, onLine })
      : run('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], { timeoutMs: 10 * 60_000, onLine }))
    uv = await findUv()
  }
  if (!uv) return false
  onLine('Creando el entorno de Python del estudio con Python 3.12…')
  await run(uv, ['venv', '--seed', '--python', '3.12', venv], { timeoutMs: 15 * 60_000, onLine })
  return existsSync(venvPython())
}

export async function kokoroReady(): Promise<boolean> {
  if (!existsSync(venvPython())) return false
  return (await run(venvPython(), ['-c', 'import kokoro_onnx, soundfile'], { timeoutMs: 30_000 })).code === 0
}

/** edge-tts (las voces neuronales de Microsoft Edge: gratis, con internet) en el entorno de Python del estudio. */
export async function edgeReady(): Promise<boolean> {
  if (!existsSync(venvPython())) return false
  return (await run(venvPython(), ['-c', 'import edge_tts'], { timeoutMs: 30_000 })).code === 0
}

/** Instala edge-tts si falta (pesa poco: se hace la primera vez que se usa). */
async function ensureEdge(onLine: (l: string) => void = () => undefined): Promise<boolean> {
  if (await edgeReady()) return true
  if (!(await ensureVenv(onLine))) return false
  await run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', 'edge-tts'], { timeoutMs: 10 * 60_000, onLine })
  return edgeReady()
}

/** Pasa un audio a WAV mono (lo que espera el montaje) y borra el de origen. */
async function toWav(src: string, out: string, signal?: AbortSignal): Promise<boolean> {
  const c = await run('ffmpeg', ['-y', '-v', 'error', '-i', src, '-ac', '1', '-ar', '24000', out], { timeoutMs: 120_000, signal })
  rmSync(src, { force: true })
  return c.code === 0 && existsSync(out) && statSync(out).size > 1000
}

/** Una frase con una voz de Edge. edge-tts deja un archivo vacío si falla (sin internet), así que se mira el tamaño. */
async function edgeSpeak(voice: string, text: string, out: string, signal?: AbortSignal): Promise<boolean> {
  const mp3 = `${out}.edge.mp3`
  const r = await run(venvPython(), ['-m', 'edge_tts', '--voice', voice, '--text', text, '--write-media', mp3], { timeoutMs: 3 * 60_000, signal })
  if (r.code !== 0 || !existsSync(mp3) || statSync(mp3).size < 1000) {
    rmSync(mp3, { force: true })
    return false
  }
  return toWav(mp3, out, signal)
}

// Las voces de Siri no salen con «say»: hace falta AVSpeechSynthesizer. Un programa pequeño en Swift (se compila una
// vez con swiftc, que viene con las herramientas de línea de órdenes de Xcode) escribe el audio en un archivo.
const MAC_SPEAK_SWIFT = `import AVFoundation
import Foundation
let a = CommandLine.arguments
// voz-mac <identificador> <nombre> <idioma> <archivo con el texto> <salida .caf>
guard a.count >= 6 else { exit(1) }
let ident = a[1], name = a[2], lang = a[3], out = a[5]
let text = (try? String(contentsOfFile: a[4], encoding: .utf8)) ?? ""
var voice = AVSpeechSynthesisVoice(identifier: ident)
if voice == nil { voice = AVSpeechSynthesisVoice.speechVoices().first { $0.name.contains(name) && $0.language == lang } }
guard let v = voice else { FileHandle.standardError.write("No está la voz \(ident)\n".data(using: .utf8)!); exit(2) }
let u = AVSpeechUtterance(string: text)
u.voice = v
let synth = AVSpeechSynthesizer()
var file: AVAudioFile?
var done = false
var failed = false
synth.write(u) { buffer in
  guard let pcm = buffer as? AVAudioPCMBuffer else { return }
  if pcm.frameLength == 0 { done = true; return }
  do {
    if file == nil { file = try AVAudioFile(forWriting: URL(fileURLWithPath: out), settings: pcm.format.settings, commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved) }
    try file?.write(from: pcm)
  } catch { failed = true; done = true }
}
let limit = Date().addingTimeInterval(300)
while !done && Date() < limit { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
file = nil
exit(done && !failed ? 0 : 3)
`

/** El programa de Swift ya compilado (o null si en este equipo no se puede). */
async function macSpeaker(): Promise<string[] | null> {
  if (!IS_MAC || !root) return null
  const dir = join(root, 'voz-mac')
  const src = join(dir, 'voz.swift')
  const exe = join(dir, 'voz-mac')
  let same = false
  try {
    same = readFileSync(src, 'utf8') === MAC_SPEAK_SWIFT
  } catch {
    /* primera vez */
  }
  if (same && existsSync(exe)) return [exe]
  mkdirSync(dir, { recursive: true })
  writeFileSync(src, MAC_SPEAK_SWIFT)
  rmSync(exe, { force: true })
  const c = await run('swiftc', ['-O', src, '-o', exe], { timeoutMs: 5 * 60_000 })
  if (c.code === 0 && existsSync(exe)) return [exe]
  return (await has('swift', ['--version'])) ? ['swift', src] : null
}

/** Una frase con una voz de macOS (p. ej. Carmen, de Siri). */
async function macSpeak(key: string, text: string, out: string, signal?: AbortSignal): Promise<boolean> {
  const v = MAC_VOICES.find((x) => x.key === key)
  const cmd = v ? await macSpeaker() : null
  if (!v || !cmd) return false
  const caf = `${out}.mac.caf`
  // El texto va en un archivo (los argumentos no llevan bien las comillas y los saltos de línea).
  writeFileSync(`${caf}.txt`, text)
  const r = await run(cmd[0], [...cmd.slice(1), v.identifier, v.name, v.lang, `${caf}.txt`, caf], { timeoutMs: 5 * 60_000, signal })
  rmSync(`${caf}.txt`, { force: true })
  if (r.code !== 0 || !existsSync(caf)) {
    rmSync(caf, { force: true })
    return false
  }
  return toWav(caf, out, signal)
}

/** Las voces elegidas a mano de Edge o de macOS: una frase. */
async function pickedSpeak(v: { engine: VoiceEngine; id: string }, text: string, out: string, signal?: AbortSignal): Promise<boolean> {
  if (v.engine === 'edge') return edgeSpeak(v.id, text, out, signal)
  if (v.engine === 'mac') return macSpeak(v.id, text, out, signal)
  return false
}

export async function videoStudioStatus(): Promise<VideoStudioStatus> {
  const [node, ffmpeg, ffprobe, python, kokoro, sys, comfy, vbox, fv] = await Promise.all([
    has('npm', ['--version']),
    has('ffmpeg'),
    has('ffprobe'),
    has(pythonCmd(), ['--version']),
    kokoroReady(),
    systemVoice(),
    comfyStatus(),
    voiceboxProfiles(),
    freeVideoStatus()
  ])
  const engine = !!root && existsSync(bin('hyperframes')) && existsSync(join(root, 'node_modules', 'gsap', 'dist', 'gsap.min.js'))
  const key = !!geminiApiKey()
  const voice = vbox?.length ? 'voicebox' : key ? 'gemini' : kokoro ? 'kokoro' : sys ? 'system' : null
  return { engine, ffmpeg: ffmpeg && ffprobe, voice, kokoro, images: comfy.info ? 'comfyui' : key ? 'gemini' : null,
    comfyui: { running: comfy.running, checkpoint: comfy.info?.checkpoint ?? null, models: comfy.models },
    voicebox: { running: !!vbox, voices: (vbox ?? []).map((p) => `${p.name} (${p.language})`) },
    manim: manimInstalled(),
    films: { library: lemoReady(filmPaths(root).lib), painted: kitReady(filmPaths(root).kit) },
    freevideo: fv,
    gemini: key,
    installing: !!installing,
    node, python, ready: engine && ffmpeg && ffprobe }
}

/** Lo que trae kywai por defecto ya está (FreeVideo, ComfyUI y Voicebox son aparte y opcionales). */
export function studioComplete(s: VideoStudioStatus): boolean {
  return s.ready && s.kokoro && !!s.manim && !!s.films?.library && !!s.films?.painted
}

/**
 * El estudio de vídeo viene de serie: al arrancar el servidor, si falta algo, kywai lo instala solo en segundo plano
 * (sin pulsar «Instalar lo que falta»). Si una vez no termina, lo vuelve a intentar al día siguiente, no en cada
 * arranque. KYWAI_NO_VIDEO_AUTOINSTALL=1 lo desactiva. El registro queda en estudio-video/instalacion.log.
 */
export async function autoInstallVideoStudio(now = Date.now()): Promise<'complete' | 'waiting' | 'installed' | 'incomplete' | 'off'> {
  if (!root || process.env.KYWAI_NO_VIDEO_AUTOINSTALL === '1') return 'off'
  if (studioComplete(await videoStudioStatus())) return 'complete'
  const marker = join(root, '.instalacion-automatica.json')
  try {
    const last = JSON.parse(readFileSync(marker, 'utf8')) as { at?: number }
    if (typeof last.at === 'number' && now - last.at < 24 * 3600_000) return 'waiting'
  } catch {
    // Primera vez.
  }
  mkdirSync(root, { recursive: true })
  writeFileSync(marker, JSON.stringify({ at: now }))
  const log: string[] = []
  const st = await ensureVideoStudio((l) => {
    if (log.length < 2000) log.push(l.slice(0, 400))
  })
  writeFileSync(join(root, 'instalacion.log'), log.join('\n'))
  return studioComplete(st) ? 'installed' : 'incomplete'
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
  const venvOk = await ensureVenv(onLine)
  if (!(await kokoroReady())) {
    if (venvOk) {
      onLine('Instalando la voz Kokoro…')
      const pip = await run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', 'kokoro-onnx', 'soundfile'], { timeoutMs: 30 * 60_000, onLine })
      if (pip.code !== 0) onLine('No se pudo instalar Kokoro: se usará la voz del sistema.')
    } else onLine('Sin un Python 3.10 o más nuevo: se usará la voz del sistema (instala Python en el asistente para tener la voz Kokoro).')
  }
  if (venvOk && !(await edgeReady())) {
    onLine('Instalando las voces de Edge (Álvaro y Jorge)…')
    await ensureEdge(onLine)
  }
  if (!manimInstalled() && existsSync(venvPython())) {
    onLine('Instalando Manim (animaciones de fórmulas y diagramas)…')
    let pip = await run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', 'manim'], { timeoutMs: 30 * 60_000, onLine })
    if (pip.code !== 0 && IS_MAC && (await has('brew', ['--version']))) {
      // En macOS, pycairo o manimpango a veces se compilan y piden las librerías de dibujo.
      onLine('Manim necesita las librerías de dibujo: instalándolas con Homebrew y probando otra vez…')
      await run('brew', ['install', 'cairo', 'pango', 'pkg-config'], { timeoutMs: 30 * 60_000, onLine })
      pip = await run(venvPython(), ['-m', 'pip', 'install', '--disable-pip-version-check', 'manim'], { timeoutMs: 30 * 60_000, onLine })
    }
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

/** Voz con Kokoro (la del idioma, o `kokoroVoice` si se eligió una) o, si no, la del sistema. */
async function speak(text: string, lang: string, out: string, useKokoro: boolean, signal?: AbortSignal, kokoroVoice?: string): Promise<void> {
  const kv = kokoroVoice ? KOKORO_VOICE_LIST.find((v) => v.id === kokoroVoice) : undefined
  const kVoice = kv?.id ?? KOKORO_VOICES[lang]
  const kLang = KOKORO_LANGS[kv?.lang ?? lang]
  if (useKokoro && kVoice && kLang) {
    const r = await run(bin('hyperframes'), ['tts', text, '-v', kVoice, '-l', kLang, '-o', out, '--json'], {
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
  if (style === 'cartoon' || style === 'mixto') return 'Say this warmly and with energy, like a friendly, upbeat YouTuber explaining a tutorial to a friend, natural and smiling'
  return 'Say this clearly and with a lively, upbeat tone, at a relaxed natural pace, like a friendly short-video creator talking to the viewer'
}

/** Imagen de una escena con Gemini (o null si no hay clave o falla: la escena va con fondo de diseño). */
/**
 * El texto de cada imagen. `look` es el bloque de estilo del guion: va al final de todas para que salgan iguales. En
 * cartoon manda el estilo de dibujo de siempre (el del presentador), salvo que el usuario diera imágenes de referencia.
 */
export function imagePromptText(prompt: string, cartoon: boolean, look?: string, fromRefs = false, cast?: string): string {
  // Con personajes fijos sí hay caras (las suyas); sin ellos, el estilo con presentador no pone caras en los planos.
  const tail = cartoon && !cast ? 'No text, no letters, no numbers, no logos, no watermark, no faces.' : 'No text, no letters, no logos, no watermark.'
  const who = cast ? ` Recurring characters, drawn exactly like this (same face, hair and clothes) whenever they appear: ${cast}.` : ''
  if (look && (!cartoon || fromRefs || cast)) return `${prompt}.${who} Visual style: ${look}. ${cartoon ? 'Clear close-up of the action. ' : ''}${tail}`
  return cartoon
    ? `Flat 2D cartoon illustration in a friendly explainer-video style: bold dark outlines, bright cheerful colors, simple soft shading, clean uncluttered background, clear close-up of the action. ${prompt}.${who} ${tail}`
    : `${prompt}.${who} Cinematic, high detail, ${tail.charAt(0).toLowerCase()}${tail.slice(1)}`
}

const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv|avi)$/i
export const isVideoFile = (name: string): boolean => VIDEO_EXT.test(name)

/**
 * Fotogramas de un vídeo del usuario para usarlos como referencia de estilo («hazlo como este reel»): `n` repartidos
 * por el vídeo (lejos del principio y del final, donde suele haber títulos), en JPG de 768 px de ancho.
 */
export async function videoFrames(video: string, outDir: string, n = 4, signal?: AbortSignal): Promise<string[]> {
  const secs = await duration(video).catch(() => 0)
  if (!secs) return []
  mkdirSync(outDir, { recursive: true })
  const out: string[] = []
  for (let i = 0; i < n && !signal?.aborted; i++) {
    const at = secs * (0.15 + (0.7 * i) / Math.max(1, n - 1))
    const file = join(outDir, `fotograma-${i + 1}.jpg`)
    const r = await run('ffmpeg', ['-y', '-v', 'error', '-ss', at.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=768:-2', '-q:v', '3', file], { timeoutMs: 60_000, signal }).catch(() => null)
    if (r && r.code === 0 && existsSync(file)) out.push(file)
  }
  return out
}

/** Carpeta de los personajes fijos de un proyecto: sus imágenes y su descripción (personajes.md). */
export const CAST_DIR = 'personajes'
export const CAST_NOTES = 'personajes.md'
const CAST_IMG = /\.(png|jpe?g|webp)$/i

/** Los personajes fijos de un proyecto (hasta 6 imágenes y su descripción), o null si no hay. */
export function projectCast(root: string): { images: string[]; notes?: string } | null {
  const dir = join(root, CAST_DIR)
  let names: string[] = []
  try {
    names = readdirSync(dir)
  } catch {
    return null
  }
  const images = names.filter((n) => CAST_IMG.test(n) && !n.startsWith('.')).sort().slice(0, 6).map((n) => join(dir, n))
  let notes: string | undefined
  try {
    // La descripción va en inglés, sin el encabezado ni las líneas de explicación (las que empiezan por «#» o «>»).
    notes = readFileSync(join(dir, CAST_NOTES), 'utf8').split('\n').filter((l) => l.trim() && !/^\s*[#>]/.test(l)).join(' ').replace(/\s+/g, ' ').trim().slice(0, 900) || undefined
  } catch {
    /* sin descripción todavía */
  }
  return images.length || notes ? { images, ...(notes ? { notes } : {}) } : null
}

/** Guarda la descripción de los personajes que escribió el guion (solo la primera vez: luego manda la guardada). */
export function saveCastNotes(root: string, cast: string): boolean {
  const file = join(root, CAST_DIR, CAST_NOTES)
  if (existsSync(file)) return false
  mkdirSync(join(root, CAST_DIR), { recursive: true })
  writeFileSync(file, `# Personajes fijos\n\n> kywai pone esta descripción en cada imagen de los vídeos de este proyecto. Puedes cambiarla; va en inglés.\n\n${cast}\n`)
  return true
}

/** Copia las imágenes adjuntas a la carpeta de personajes del proyecto. Devuelve cuántas copió. */
export function saveCastImages(root: string, files: string[]): number {
  const dir = join(root, CAST_DIR)
  mkdirSync(dir, { recursive: true })
  let n = 0
  for (const f of files) {
    if (!CAST_IMG.test(f) || !existsSync(f)) continue
    const name = f.replace(/^.*[\\/]/, '')
    const same = join(dir, name)
    // La misma imagen otra vez (mismo nombre y tamaño) no se duplica.
    if (existsSync(same) && statSync(same).size === statSync(f).size) continue
    copyFileSync(f, existsSync(same) ? join(dir, `${Date.now().toString(36)}-${name}`) : same)
    n++
  }
  return n
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

/** Imágenes para Gemini (como mucho `max` y de 7 MB cada una). */
function refParts(refs: string[], max = 3): { inlineData: { mimeType: string; data: string } }[] {
  const parts: { inlineData: { mimeType: string; data: string } }[] = []
  for (const f of refs) {
    const mimeType = MIME[f.split('.').pop()?.toLowerCase() ?? '']
    if (!mimeType || parts.length >= max) continue
    try {
      const buf = readFileSync(f)
      if (buf.length <= 7 * 1024 * 1024) parts.push({ inlineData: { mimeType, data: buf.toString('base64') } })
    } catch {
      /* la siguiente */
    }
  }
  return parts
}

async function geminiImage(
  prompt: string,
  format: VideoFormat,
  out: string,
  key: string,
  cartoon: boolean,
  signal?: AbortSignal,
  look?: string,
  refs: string[] = [],
  cast?: { images: string[]; text?: string }
): Promise<boolean> {
  const text = imagePromptText(prompt, cartoon, look, refs.length > 0, cast?.text)
  // Gemini ve primero a los personajes fijos (para que salgan iguales) y después las referencias de estilo (solo el
  // estilo, no lo que sale en ellas). Cuatro imágenes como mucho entre las dos.
  const who = cast?.images.length ? refParts(cast.images, 3) : []
  const ref = refs.length ? refParts(refs, Math.max(1, 4 - who.length)) : []
  const notes = [
    who.length ? `The first ${who.length === 1 ? 'image shows' : `${who.length} images show`} the recurring characters: when they appear, keep their faces, hair, body and clothes identical to these.` : '',
    ref.length ? `${who.length ? `The next ${ref.length === 1 ? 'image is a style reference' : `${ref.length} images are style references`}` : 'Use the attached images ONLY as style references'} (medium, line, palette, light, texture); do not copy their subjects or composition.` : ''
  ].filter(Boolean)
  const body = {
    contents: [
      {
        parts: [...who, ...ref, { text: notes.length ? `${notes.join(' ')} ${text}` : text }]
      }
    ],
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

/** Un perfil concreto de Voicebox (el elegido en el selector), si Voicebox está abierto y lo tiene. */
async function voiceboxById(id: string): Promise<VoiceboxVoice | null> {
  const url = voiceboxUrl()
  const p = (await voiceboxProfiles(url))?.find((x) => x.id === id)
  return p ? { url, profileId: p.id, profileName: p.name } : null
}

/**
 * Las voces que se pueden elegir en este equipo: las de Voicebox (si está abierto), las de Gemini (con clave), las de
 * Kokoro (si está instalado; primero las del idioma) y la del sistema. `missing` dice qué motores faltan.
 */
export async function listVideoVoices(lang: string): Promise<{ voices: VideoVoiceInfo[]; missing: VoiceEngine[] }> {
  // Con la app en español o en inglés, solo las elegidas de los dos idiomas (primero las del de la app): el vídeo
  // puede ser en el otro. Sin elegir, el vídeo va con la primera de su idioma.
  if (LANG_VOICES[lang]) {
    const picked = [...LANG_VOICES[lang], ...Object.entries(LANG_VOICES).flatMap(([l, ids]) => (l === lang ? [] : ids))]
    return {
      voices: picked.map((id): VideoVoiceInfo => {
        const v = parseVoiceId(id)!
        if (v.engine === 'edge') {
          const e = EDGE_VOICES.find((x) => x.id === v.id)!
          return { id, engine: 'edge', name: e.name, line: e.region, lang: e.lang, gender: e.gender }
        }
        if (v.engine === 'kokoro') {
          const k = KOKORO_VOICE_LIST.find((x) => x.id === v.id)!
          const region = k.lang !== 'en' ? 'Kokoro' : k.id.startsWith('b') ? 'Reino Unido' : 'Estados Unidos'
          return { id, engine: 'kokoro', name: k.name, line: region, lang: k.lang, gender: k.gender }
        }
        const m = MAC_VOICES.find((x) => x.key === v.id)!
        return { id, engine: 'mac', name: m.name, line: m.region, lang: m.lang.split('-')[0], gender: m.gender }
      }),
      missing: []
    }
  }
  const [vbox, kokoro, sys] = await Promise.all([voiceboxProfiles(), kokoroReady(), systemVoice()])
  const key = !!geminiApiKey()
  const base = (l: string): string => l.toLowerCase().split(/[-_]/)[0]
  const voices: VideoVoiceInfo[] = [
    ...(vbox ?? []).map((p) => ({ id: `voicebox-${p.id}`, engine: 'voicebox' as const, name: p.name, line: p.voice_type === 'cloned' ? 'Tu voz clonada' : 'Voicebox', lang: base(p.language) })),
    ...(key ? GEMINI_VOICES.map((g) => ({ id: `gemini-${g.id.toLowerCase()}`, engine: 'gemini' as const, name: g.id, line: g.line, gender: g.gender })) : []),
    ...(kokoro
      ? [...KOKORO_VOICE_LIST]
          .sort((a, b) => Number(b.lang === lang) - Number(a.lang === lang))
          .map((k) => ({ id: `kokoro-${k.id}`, engine: 'kokoro' as const, name: k.name, line: 'Kokoro', lang: k.lang, gender: k.gender }))
      : []),
    ...(sys ? [{ id: 'sistema', engine: 'sistema' as const, name: 'Voz del sistema', line: 'La del sistema operativo' }] : [])
  ]
  const missing: VoiceEngine[] = [...(vbox ? [] : ['voicebox' as const]), ...(key ? [] : ['gemini' as const]), ...(kokoro ? [] : ['kokoro' as const])]
  return { voices, missing }
}

/** La frase de muestra de una voz de Kokoro de otro idioma que el de la app (en el suyo). */
const VOICE_SAMPLES: Record<string, string> = {
  es: 'Hola, así sonará la voz de tu vídeo. ¿Te gusta cómo suena?',
  en: 'Hi, this is how your video will sound. Do you like it?',
  fr: 'Bonjour, voici comment sonnera votre vidéo. Elle vous plaît ?',
  pt: 'Olá, é assim que o seu vídeo vai soar. Gostou?',
  it: 'Ciao, ecco come suonerà il tuo video. Ti piace?',
  ja: 'こんにちは。動画の声はこんな感じです。いかがですか？',
  zh: '你好，这就是你视频的声音。喜欢吗？',
  hi: 'नमस्ते, आपके वीडियो की आवाज़ ऐसी होगी। आपको पसंद आई?'
}

/**
 * Una muestra corta de una voz (`sentence`, en el idioma de la app), en MP3 como data: URL. Se guarda en el estudio
 * (muestras-voz/) para no repetirla. Lanza un error si esa voz no está en este equipo.
 */
export async function previewVideoVoice(id: unknown, lang: string, sentence: string): Promise<string> {
  const v = typeof id === 'string' ? parseVoiceId(id) : null
  if (!v || !root) throw new Error(tr('Esa voz no existe'))
  const dir = join(root, 'muestras-voz')
  mkdirSync(dir, { recursive: true })
  const safe = `${id as string}-${lang}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  const mp3 = join(dir, `${safe}.mp3`)
  const wav = join(dir, `${safe}.wav`)
  if (!existsSync(mp3)) {
    let ok = false
    if (v.engine === 'voicebox') {
      const vb = await voiceboxById(v.id)
      if (!vb) throw new Error(tr('Voicebox no está abierto o ya no tiene esa voz'))
      ok = await voiceboxSpeak(vb, sentence, wav, { timeoutMs: 120_000 })
    } else if (v.engine === 'gemini') {
      const key = geminiApiKey()
      if (!key) throw new Error(tr('Falta la clave de API de Gemini'))
      ok = await geminiSpeak(sentence, 'Say this in a friendly, natural way', v.id, wav, key)
    } else if (v.engine === 'edge') {
      if (!(await ensureEdge())) throw new Error(tr('No se pudieron instalar las voces de Edge'))
      const e = EDGE_VOICES.find((x) => x.id === v.id)!
      ok = await edgeSpeak(v.id, e.lang === lang ? sentence : (VOICE_SAMPLES[e.lang] ?? VOICE_SAMPLES.en), wav)
      if (!ok) throw new Error(tr('La voz de Edge necesita internet: no se pudo conectar'))
    } else if (v.engine === 'mac') {
      if (!IS_MAC) throw new Error(tr('Carmen es una voz de Siri: solo está en macOS'))
      ok = await macSpeak(v.id, sentence, wav)
      if (!ok) throw new Error(tr('Descarga la voz Carmen en Ajustes del Sistema → Accesibilidad → Contenido leído → Voz del sistema'))
    } else if (v.engine === 'kokoro') {
      if (!(await kokoroReady())) throw new Error(tr('Kokoro no está instalado: pulsa «Instalar lo que falta» en Ajustes → Extensiones → Estudio de vídeo'))
      // Sin caer en la voz del sistema: la muestra tiene que ser de esa voz. Una voz de otro idioma lee una frase suya.
      const kv = KOKORO_VOICE_LIST.find((x) => x.id === v.id)!
      const text = kv.lang === lang ? sentence : (VOICE_SAMPLES[kv.lang] ?? VOICE_SAMPLES.en)
      const r = await run(bin('hyperframes'), ['tts', text, '-v', kv.id, '-l', KOKORO_LANGS[kv.lang] ?? 'en-us', '-o', wav, '--json'], {
        cwd: root,
        env: { ...process.env, HYPERFRAMES_PYTHON: venvPython(), HYPERFRAMES_NO_TELEMETRY: '1' },
        timeoutMs: 5 * 60_000
      })
      ok = r.code === 0 && existsSync(wav)
    } else {
      await speak(sentence, lang, wav, false)
      ok = existsSync(wav)
    }
    if (!ok || !existsSync(wav)) throw new Error(tr('No se pudo generar la muestra de esa voz'))
    const c = await run('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-ac', '1', '-b:a', '64k', mp3], { timeoutMs: 60_000 })
    if (c.code !== 0 || !existsSync(mp3)) return `data:audio/wav;base64,${readFileSync(wav).toString('base64')}`
  }
  return `data:audio/mpeg;base64,${readFileSync(mp3).toString('base64')}`
}

export interface RenderedVideo {
  /** Ruta absoluta del MP4 entregado. */
  file: string
  seconds: number
  width: number
  height: number
  /** Escenas con imagen generada. */
  images: number
  voice: 'voicebox' | 'gemini' | 'kokoro' | 'system' | 'edge' | 'mac'
  /** Escenas que FreeVideo convirtió en clips con movimiento. */
  moving?: number
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
  /** Imágenes de referencia del usuario (rutas absolutas): Gemini las ve para copiar el estilo. */
  refs?: string[]
  /** Voz elegida en el selector («gemini-puck», «kokoro-em_alex», «voicebox-<perfil>», «sistema»); sin ella, automática. */
  voice?: string
  /**
   * Personajes del vídeo (los fijos del proyecto o el elegido): sus imágenes (Gemini las ve) y su descripción si ya
   * existe (si no, la del guion). Con presentador, el elegido (con `name`) hace de presentador.
   */
  cast?: { images: string[]; notes?: string; name?: string }
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

  const cartoon = hasPresenter(script.style)
  const refs = (input.refs ?? []).filter((f) => existsSync(f))
  const castImages = (input.cast?.images ?? []).filter((f) => existsSync(f))
  const castText = script.cast || input.cast?.notes
  const cast = castImages.length || castText ? { images: castImages, text: castText } : undefined
  const key = geminiApiKey()
  const n = script.scenes.length
  let spoken = 0
  const voiceStep = (): void => step('Poniendo la voz ({n} de {total})', 0.05 + (0.45 * spoken) / n, { n: Math.min(n, spoken + 1), total: n })

  // 1. Voz e imágenes a la vez (lo que más tarda).
  const voices = script.scenes.map((_, i) => join(dir, 'assets', `voz-${i + 1}.wav`))
  let voiceUsed: RenderedVideo['voice'] = 'kokoro'
  // La voz elegida en el selector va primero; si no sale, el orden de siempre (para que el vídeo salga igual).
  // En español e inglés, sin elegir, va la primera de las voces elegidas (Álvaro de Edge, Bella de Kokoro).
  let chosen = parseVoiceId(input.voice) ?? parseVoiceId(defaultVoiceFor(script.lang))
  // La de Kokoro por defecto sin Kokoro instalado: mejor el orden de siempre (Voicebox, Gemini…) que la del sistema.
  if (!input.voice && chosen?.engine === 'kokoro' && !status.kokoro) chosen = null
  const doVoices = async (): Promise<void> => {
    // Edge o una voz de macOS (Siri): tres escenas a la vez. Si una no sale (sin internet, sin la voz), el orden de
    // siempre para todo el vídeo.
    if (chosen && (chosen.engine === 'edge' || chosen.engine === 'mac')) {
      const pick = chosen
      if (pick.engine === 'mac' || (await ensureEdge())) {
        let next = 0
        let failed = false
        const worker = async (): Promise<void> => {
          while (next < n && !failed && !signal?.aborted) {
            const i = next++
            if (await pickedSpeak(pick, spokenText(script.scenes[i].narration), voices[i], signal)) {
              spoken++
              voiceStep()
            } else failed = true
          }
        }
        voiceStep()
        await Promise.all(pick.engine === 'mac' ? [worker()] : [worker(), worker(), worker()])
        if (!failed && !signal?.aborted) {
          voiceUsed = pick.engine === 'mac' ? 'mac' : 'edge'
          return
        }
        spoken = 0
      }
      chosen = null
    }
    // Voicebox abierto en el equipo, con una voz en el idioma del vídeo: va primero (local y gratis). De una en una
    // (usa la gráfica). Si una escena no sale, se pasa a Gemini o Kokoro para todo el vídeo.
    const vb = chosen?.engine === 'voicebox' ? await voiceboxById(chosen.id) : chosen ? null : await voiceboxVoice(script.lang)
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
    if (key && chosen?.engine !== 'kokoro' && chosen?.engine !== 'sistema') {
      let next = 0
      let failed = false
      const worker = async (): Promise<void> => {
        while (next < n && !failed && !signal?.aborted) {
          const i = next++
          const sc = script.scenes[i]
          const voiceName = chosen?.engine === 'gemini' ? chosen.id : cartoon ? 'Puck' : 'Fenrir'
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
    const kokoro = status.kokoro && chosen?.engine !== 'sistema'
    voiceUsed = kokoro ? 'kokoro' : 'system'
    // De una en una: Kokoro ya usa todos los núcleos.
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw new Error('Cancelada')
      voiceStep()
      await speak(spokenText(script.scenes[i].narration), script.lang, voices[i], kokoro, signal, chosen?.engine === 'kokoro' ? chosen.id : undefined)
      spoken++
    }
  }

  // Imágenes (tres a la vez). En cartoon, cada escena puede tener varios planos.
  // Con Manim, las escenas que traen su animación no necesitan imagen.
  const useManim = manimInstalled() && script.scenes.some((sc) => !!sc.manim)
  const shotPrompts = script.scenes.map((sc) =>
    useManim && sc.manim ? [] : sc.text ? [] : cartoon ? (sc.shots?.length ? sc.shots : sc.image ? [sc.image] : []) : sc.image ? [sc.image] : []
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
          if (await comfyImage(comfy, imagePromptText(prompt, cartoon, script.look, refs.length > 0, castText), format === 'vertical', out, { signal })) {
            shots[i][k] = rel
            comfyFails = 0
            continue
          }
          comfyFails++
        }
        if (key && (await geminiImage(prompt, format, out, key, cartoon, signal, script.look, refs, cast))) shots[i][k] = rel
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
  // El presentador, si es un personaje elegido: su imagen en el estilo del vídeo (o, si no se puede generar, su
  // primera imagen de referencia). Sin ninguna de las dos, el presentador dibujado de siempre.
  let presenter: string | undefined
  const doPresenter = async (): Promise<void> => {
    if (!cartoon || !input.cast?.name || !cast) return
    const prompt = `${input.cast.name}, as the friendly host of a video, waist-up, facing the camera, smiling, one hand raised mid-gesture, centered, simple soft plain background`
    const out = join(dir, 'assets', 'presentador.png')
    if (comfy && (await comfyImage(comfy, imagePromptText(prompt, false, script.look, refs.length > 0, castText), true, out, { signal }))) presenter = 'assets/presentador.png'
    else if (key && (await geminiImage(prompt, 'vertical', out, key, false, signal, script.look, refs, cast))) presenter = 'assets/presentador.png'
    else if (castImages.length) {
      const ext = castImages[0].split('.').pop()!.toLowerCase()
      copyFileSync(castImages[0], join(dir, 'assets', `presentador.${ext}`))
      presenter = `assets/presentador.${ext}`
    }
  }
  await Promise.all([doVoices(), doImages(), doManim(), doPresenter()])
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
  const moving = await animateScenes({ script, format, dir, durations: tl.scenes.map((x) => x.duration), images, clips, step, signal })

  // 3. Música y mezcla.
  if (signal?.aborted) throw new Error('Cancelada')
  step('Componiendo la música y mezclando', 0.55)
  const compInput = { script, format, timeline: tl, images, shots, clips, audio: 'assets/mezcla.wav', gsap: 'assets/gsap.min.js', ...(presenter ? { presenter } : {}) }
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
  return { file, seconds, width: vs.width ?? 0, height: vs.height ?? 0, images: shots.flat().filter(Boolean).length, voice: voiceUsed, moving }
}

/**
 * Con FreeVideo abierto en el equipo, las escenas que el guion marcó con «motion» (como mucho 3) pasan de imagen fija
 * a clip con movimiento, empezando en su imagen. De una en una (una sola gráfica); la que falla se queda con su imagen.
 */
async function animateScenes(a: {
  script: VideoScript
  format: VideoFormat
  dir: string
  durations: number[]
  images: (string | null)[]
  clips: (string | null)[]
  step: (text: string, progress: number, vars?: Record<string, string | number>) => void
  signal?: AbortSignal
}): Promise<number> {
  const todo = a.script.scenes.map((sc, i) => ({ sc, i })).filter(({ sc, i }) => sc.motion && a.images[i] && !a.clips[i])
  if (!todo.length) return 0
  const srv = findFreeVideo()
  if (!srv || !(await freeVideoStatus(srv)).ready) return 0
  let done = 0
  for (let k = 0; k < todo.length && !a.signal?.aborted; k++) {
    const { sc, i } = todo[k]
    const base = 0.5 + (0.05 * k) / todo.length
    a.step('Dando movimiento a las escenas con FreeVideo ({n} de {total}; cada una tarda varios minutos)', base, { n: k + 1, total: todo.length })
    const raw = join(a.dir, 'assets', `freevideo-${i + 1}-original.mp4`)
    const ok = await animateStill(srv, {
      image: join(a.dir, a.images[i]!),
      prompt: motionPrompt(sc.motion!, sc.image, a.script.look),
      seconds: a.durations[i],
      vertical: a.format === 'vertical',
      out: raw,
      signal: a.signal,
      timeoutMs: 45 * 60_000
    })
    const rel = `assets/freevideo-${i + 1}.mp4`
    if (ok && (await fitClip(raw, a.durations[i], join(a.dir, rel), a.signal))) {
      a.clips[i] = rel
      done++
    }
  }
  return done
}
