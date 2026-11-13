/**
 * ComfyUI (comfy.org) como motor de imágenes por defecto del estudio de vídeo.
 *
 * Si hay un ComfyUI encendido en el equipo (por defecto en http://127.0.0.1:8188, el de la app de escritorio y el
 * de `python main.py`), kywai le pide las ilustraciones por su API HTTP: gratis, sin clave y sin salir del equipo.
 * Si no está encendido, no tiene modelos o una imagen falla, se usa Gemini (con clave) y si no, fondos de diseño.
 *
 * Se habla con él como un programa aparte (HTTP), sin copiar ni enlazar su código (ComfyUI es GPL-3.0).
 */
import { spawn } from 'node:child_process'
import { existsSync, openSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const COMFYUI_DEFAULT_URL = 'http://127.0.0.1:8188'
/** La app de escritorio de ComfyUI escucha aquí por defecto. */
export const COMFYUI_DESKTOP_URL = 'http://127.0.0.1:8000'

export interface ComfyInfo {
  url: string
  /** Modelo (checkpoint) con el que se generan las imágenes. */
  checkpoint: string
  /** SDXL y familia (1024 px) o SD 1.5 (512 px): cambia el tamaño y los pasos. */
  xl: boolean
}

/** Dirección de ComfyUI: KYWAI_COMFYUI_URL o COMFYUI_URL, o la de siempre. */
export function comfyUrl(): string {
  const raw = (process.env.KYWAI_COMFYUI_URL || process.env.COMFYUI_URL || '').trim()
  return (raw || COMFYUI_DEFAULT_URL).replace(/\/+$/, '')
}

const XL_RE = /(xl|pony|illustrious|noob|juggernaut|dreamshaper.?xl|playground)/i
// Estos necesitan otro flujo (codificadores de texto aparte): con el flujo sencillo de un checkpoint no van.
const NEEDS_OTHER_FLOW = /(flux|sd3|stable.?diffusion.?3|hidream|wan|hunyuan|ltx|cosmos|lumina|qwen)/i

/** Elige el modelo: KYWAI_COMFYUI_CHECKPOINT si está, si no el primero SDXL, si no el primero que sirva. */
export function pickCheckpoint(names: string[], wanted = process.env.KYWAI_COMFYUI_CHECKPOINT?.trim()): string | null {
  if (wanted) {
    const exact = names.find((n) => n === wanted || n.replace(/\.[^.]+$/, '') === wanted)
    if (exact) return exact
  }
  const usable = names.filter((n) => !NEEDS_OTHER_FLOW.test(n))
  return usable.find((n) => XL_RE.test(n)) ?? usable[0] ?? null
}

async function getJson<T>(url: string, ms: number, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/**
 * ¿Hay un ComfyUI encendido y con algún modelo? null si no responde (en 2 s) o no tiene modelos que sirvan.
 * `models` dice cuántos tiene, para explicar por qué no se usa.
 */
export async function comfyStatus(url?: string): Promise<{ running: boolean; info: ComfyInfo | null; models: number }> {
  // Sin dirección fija se prueba la de siempre (8188, la de `python main.py`) y la de la app de escritorio (8000).
  if (!url) {
    const fixed = !!(process.env.KYWAI_COMFYUI_URL || process.env.COMFYUI_URL || '').trim()
    const first = await comfyStatus(comfyUrl())
    if (first.running || fixed) return first
    return comfyStatus(COMFYUI_DESKTOP_URL)
  }
  try {
    const obj = await getJson<Record<string, { input?: { required?: { ckpt_name?: unknown[] } } }>>(
      `${url}/object_info/CheckpointLoaderSimple`,
      2500
    )
    const list = obj.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]
    const names = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
    const checkpoint = pickCheckpoint(names)
    return { running: true, models: names.length, info: checkpoint ? { url, checkpoint, xl: XL_RE.test(checkpoint) } : null }
  } catch {
    return { running: false, info: null, models: 0 }
  }
}

/** Tamaño de la imagen: múltiplos de 64 cerca de lo que el modelo sabe hacer. */
export function comfySize(vertical: boolean, xl: boolean): { width: number; height: number } {
  const [long, short] = xl ? [1344, 768] : [896, 512]
  return vertical ? { width: short, height: long } : { width: long, height: short }
}

/** El flujo txt2img más sencillo, en el formato de la API de ComfyUI. */
export function txt2imgWorkflow(o: { checkpoint: string; xl: boolean; prompt: string; negative: string; width: number; height: number; seed: number }): Record<string, unknown> {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: o.checkpoint } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: o.prompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: o.negative, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: o.width, height: o.height, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        seed: o.seed,
        steps: o.xl ? 28 : 25,
        cfg: o.xl ? 6 : 7,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        denoise: 1
      }
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'kywai-video' } }
  }
}

const NEGATIVE = 'text, letters, words, numbers, watermark, logo, signature, blurry, lowres, jpeg artifacts, deformed, extra fingers, bad anatomy, frame, border'

/** Semilla estable por texto: el mismo guion da las mismas imágenes. */
function seedFor(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

type History = Record<string, { status?: { status_str?: string; completed?: boolean }; outputs?: Record<string, { images?: { filename: string; subfolder?: string; type?: string }[] }> }>

/**
 * Genera una imagen y la guarda en `out`. false si algo falla (la escena pasa a Gemini o a fondo de diseño).
 * Espera hasta `timeoutMs` (por defecto 5 min: en un equipo sin gráfica buena tarda).
 */
export async function comfyImage(
  info: ComfyInfo,
  prompt: string,
  vertical: boolean,
  out: string,
  opts: { signal?: AbortSignal; timeoutMs?: number; pollMs?: number } = {}
): Promise<boolean> {
  const { signal } = opts
  const size = comfySize(vertical, info.xl)
  const workflow = txt2imgWorkflow({ checkpoint: info.checkpoint, xl: info.xl, prompt, negative: NEGATIVE, ...size, seed: seedFor(prompt) })
  try {
    const res = await fetch(`${info.url}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: 'kywai' }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000)
    })
    if (!res.ok) return false
    const { prompt_id: id } = (await res.json()) as { prompt_id?: string }
    if (!id) return false
    const deadline = Date.now() + (opts.timeoutMs ?? 300_000)
    while (Date.now() < deadline) {
      if (signal?.aborted) return false
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000))
      let hist: History
      try {
        hist = await getJson<History>(`${info.url}/history/${encodeURIComponent(id)}`, 10_000, signal)
      } catch {
        continue
      }
      const entry = hist[id]
      if (!entry) continue
      if (entry.status?.status_str === 'error') return false
      const img = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? [])[0]
      if (!img) {
        if (entry.status?.completed) return false
        continue
      }
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' })
      const view = await fetch(`${info.url}/view?${q}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) })
      if (!view.ok) return false
      const buf = Buffer.from(await view.arrayBuffer())
      if (buf.length < 100) return false
      writeFileSync(out, buf)
      return true
    }
    return false
  } catch {
    return false
  }
}

// ---------- encenderlo solo al pedir un vídeo ----------

/** Marca que deja el instalador de kywai cuando el equipo no tiene gráfica que sirva: ComfyUI arranca con --cpu. */
export const COMFY_CPU_MARK = 'kywai-cpu'

export type ComfyInstall = { kind: 'app'; path: string } | { kind: 'dir'; dir: string; python: string }

/**
 * Dónde está ComfyUI instalado en este equipo: la app de escritorio (macOS y Windows) o una carpeta con `main.py`
 * (KYWAI_COMFYUI_DIR, o ComfyUI en la carpeta personal, Documentos, Escritorio o Descargas; también la versión
 * portable de Windows). null si no hay ninguno.
 */
export function findComfyInstall(home = homedir(), platform: NodeJS.Platform = process.platform, env = process.env): ComfyInstall | null {
  const dirEnv = env.KYWAI_COMFYUI_DIR?.trim()
  const roots = [home, join(home, 'Documents'), join(home, 'Desktop'), join(home, 'Downloads')]
  const dirs = [
    ...(dirEnv ? [dirEnv] : []),
    ...roots.flatMap((r) => ['ComfyUI', 'comfyui', 'ComfyUI_windows_portable/ComfyUI', 'ComfyUI_windows_portable_nvidia/ComfyUI'].map((n) => join(r, n)))
  ]
  for (const dir of dirs) {
    if (!existsSync(join(dir, 'main.py'))) continue
    const win = platform === 'win32'
    const pys = [
      join(dir, '..', 'python_embeded', 'python.exe'),
      ...['venv', '.venv'].map((v) => join(dir, v, win ? 'Scripts/python.exe' : 'bin/python'))
    ]
    const python = pys.find((f) => existsSync(f)) ?? (win ? 'python' : 'python3')
    return { kind: 'dir', dir, python }
  }
  if (platform === 'darwin') {
    for (const app of ['/Applications/ComfyUI.app', join(home, 'Applications', 'ComfyUI.app')]) if (existsSync(app)) return { kind: 'app', path: app }
  }
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    const exe = join(local, 'Programs', 'ComfyUI', 'ComfyUI.exe')
    if (existsSync(exe)) return { kind: 'app', path: exe }
    // instalaciones de usuario con otro nombre de carpeta
    try {
      const progs = join(local, 'Programs')
      for (const n of readdirSync(progs)) if (/comfy/i.test(n) && existsSync(join(progs, n, 'ComfyUI.exe'))) return { kind: 'app', path: join(progs, n, 'ComfyUI.exe') }
    } catch {
      /* no hay carpeta */
    }
  }
  return null
}

let starting: Promise<boolean> | null = null
let startedAt = 0

/** Lo arranca (sin esperar a que esté listo). false si no hay ComfyUI instalado o se apagó con KYWAI_NO_COMFY_AUTOSTART=1. */
export function startComfy(): boolean {
  if (process.env.KYWAI_NO_COMFY_AUTOSTART === '1') return false
  if (Date.now() - startedAt < 5 * 60_000) return true
  const inst = findComfyInstall()
  if (!inst) return false
  try {
    if (inst.kind === 'app') {
      const child =
        process.platform === 'darwin'
          ? spawn('open', ['-g', '-a', inst.path], { detached: true, stdio: 'ignore' })
          : spawn(inst.path, [], { detached: true, stdio: 'ignore' })
      child.on('error', () => undefined)
      child.unref()
    } else {
      const log = openSync(join(inst.dir, 'kywai-comfyui.log'), 'a')
      const cpu = existsSync(join(inst.dir, COMFY_CPU_MARK)) ? ['--cpu'] : []
      const child = spawn(inst.python, ['main.py', '--listen', '127.0.0.1', '--port', '8188', ...cpu], { cwd: inst.dir, detached: true, stdio: ['ignore', log, log], windowsHide: true })
      child.on('error', () => undefined)
      child.unref()
    }
    startedAt = Date.now()
    return true
  } catch {
    return false
  }
}

/**
 * ComfyUI listo para dibujar: si ya está encendido, al momento; si no, lo enciende (si está instalado) y espera a
 * que responda con un modelo (como mucho `timeoutMs`; la primera vez carga el modelo y tarda). null si no hay.
 */
export async function ensureComfy(opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<ComfyInfo | null> {
  const now = await comfyStatus()
  if (now.info || now.running) return now.info
  if (!starting) {
    starting = (async () => {
      if (!startComfy()) return false
      const until = Date.now() + (opts.timeoutMs ?? 180_000)
      while (Date.now() < until && !opts.signal?.aborted) {
        await new Promise((ok) => setTimeout(ok, 3000))
        if ((await comfyStatus()).running) return true
      }
      return false
    })().finally(() => {
      starting = null
    })
  }
  await starting
  return (await comfyStatus()).info
}
