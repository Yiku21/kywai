// Dictado: convierte notas de voz en texto en el propio equipo con Whisper (faster-whisper, ejecutado con
// uv). Sin APIs ni servicios externos: el audio no sale del equipo y se borra al terminar. La primera vez se
// instala lo que falte (uv con su instalador oficial y el modelo de voz, ~480 MB).
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { refreshPath, sh } from './setup'

/** «small»: buen español con poca espera (≈6 s para una nota de 8 s en CPU). */
const MODEL = 'small'
const PASTE_ROOT = resolve(join(tmpdir(), 'ai-cowork-pegados'))
const IS_WIN = process.platform === 'win32'

async function hasUv(): Promise<boolean> {
  return (await sh('uvx --version', 15_000)).code === 0
}

/** Instala uv (sin permisos de administrador) si no está; lo usa también Hermes. */
async function ensureUv(): Promise<void> {
  if (await hasUv()) return
  await refreshPath()
  if (await hasUv()) return
  const cmd = IS_WIN
    ? 'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"'
    : 'curl -LsSf https://astral.sh/uv/install.sh | sh'
  const r = await sh(cmd, 10 * 60_000)
  await refreshPath()
  if (!(await hasUv())) throw new Error(`No se pudo preparar el dictado (instalación de uv): ${r.out.split('\n').filter(Boolean).pop() ?? ''}`)
}

/** Transcribe un audio guardado con savePastedFile (WAV 16 kHz que prepara la interfaz). */
export async function transcribeAudio(path: unknown, language: unknown = 'es'): Promise<string> {
  if (typeof path !== 'string') throw new Error('Audio no válido')
  const abs = resolve(path)
  // Solo audios que la propia app acaba de guardar (nunca una ruta cualquiera del equipo).
  if (!abs.startsWith(PASTE_ROOT + sep) || !/\.(wav|webm|ogg|mp3|m4a)$/i.test(abs) || !existsSync(abs)) {
    throw new Error('Audio no válido')
  }
  const lang = typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : 'es'
  await ensureUv()
  // Python con UTF-8: los acentos y la ñ llegan bien también en Windows.
  process.env.PYTHONUTF8 = '1'
  process.env.PYTHONIOENCODING = 'utf-8'
  const dir = dirname(abs)
  const cmd =
    `uvx --from whisper-ctranslate2 whisper-ctranslate2 "${abs}" --model ${MODEL} --language ${lang}` +
    ` --output_format txt --output_dir "${dir}" --compute_type int8 --device cpu`
  try {
    const r = await sh(cmd, 15 * 60_000)
    const txt = join(dir, `${basename(abs, extname(abs))}.txt`)
    if (!existsSync(txt)) {
      const why = r.out.split('\n').filter((l) => l.trim() && !/symlink|developer mode|warn/i.test(l)).pop()
      throw new Error(`No se pudo transcribir la nota de voz${why ? `: ${why.slice(0, 200)}` : ''}`)
    }
    return readFileSync(txt, 'utf8').replace(/\s+/g, ' ').trim()
  } finally {
    // El audio y su texto no se quedan en el disco.
    rmSync(dir, { recursive: true, force: true })
  }
}
