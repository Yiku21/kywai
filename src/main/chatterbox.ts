// Voz con emoción: Chatterbox Multilingual (Resemble AI, licencia MIT), en el propio equipo y gratis. A diferencia de
// Edge o Kokoro, interpreta cada frase: se le dice cuánta emoción poner (exaggeration) y con qué calma (cfg_weight), y
// suena alegre, triste o emocionada sin retocar la velocidad ni el tono (eso suena robótico). Copia el timbre de una
// muestra corta: kywai le da una muestra de la voz elegida (Álvaro, Jorge, Carmen, Bella…), así la voz sigue siendo
// la misma pero actuando. Va en su propio entorno de Python (lleva torch), dentro de la carpeta del estudio.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { VoiceEmotion } from '@shared/voiceEmotion'

const IS_WIN = process.platform === 'win32'

/**
 * Versión fijada (la probada con kywai). Su marca de agua (resemble-perth) usa pkg_resources, que setuptools quitó en la
 * 81: sin ella no arranca.
 */
export const CHATTERBOX_PIP = ['chatterbox-tts==0.1.7', 'setuptools<81']

/** Idiomas que habla (los de su modelo multilingüe). */
export const CHATTERBOX_LANGS = ['ar', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'he', 'hi', 'it', 'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ru', 'sv', 'sw', 'tr', 'zh'] as const

/** Cuánta emoción pone en cada frase: exaggeration (0,25 a 2; 0,5 normal) y cfg_weight (más bajo, más pausado y dramático). */
export const CHATTERBOX_EMOTION: Record<VoiceEmotion, { exaggeration: number; cfg: number }> = {
  neutral: { exaggeration: 0.5, cfg: 0.5 },
  alegre: { exaggeration: 0.7, cfg: 0.45 },
  emocionado: { exaggeration: 1, cfg: 0.3 },
  sorprendido: { exaggeration: 0.85, cfg: 0.4 },
  triste: { exaggeration: 0.45, cfg: 0.6 },
  susurro: { exaggeration: 0.4, cfg: 0.6 },
  firme: { exaggeration: 0.75, cfg: 0.4 },
  calma: { exaggeration: 0.35, cfg: 0.55 },
  gracioso: { exaggeration: 0.8, cfg: 0.4 }
}

export interface RunOut {
  code: number | null
  out: string
}
export type Runner = (cmd: string, args: string[], opts?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; signal?: AbortSignal; onLine?: (l: string) => void }) => Promise<RunOut>

export const chatterboxDir = (studio: string): string => join(studio, 'chatterbox')
export const chatterboxPython = (studio: string): string => join(chatterboxDir(studio), '.venv', IS_WIN ? 'Scripts\\python.exe' : 'bin/python')
/** Lo deja kywai cuando el entorno y el modelo están descargados y probados (sin lanzar Python para saberlo). */
const marker = (studio: string): string => join(chatterboxDir(studio), 'instalado.json')

/** Los modelos van dentro de la carpeta del estudio (no en la caché general), para saber qué ocupa y poder borrarlo. */
const env = (studio: string): NodeJS.ProcessEnv => ({ ...process.env, HF_HOME: join(chatterboxDir(studio), 'modelos'), HF_HUB_DISABLE_TELEMETRY: '1', PYTHONIOENCODING: 'utf-8' })

export function chatterboxReady(studio: string): boolean {
  return !!studio && existsSync(marker(studio)) && existsSync(chatterboxPython(studio))
}

/**
 * El programa que habla: carga el modelo una vez (en la gráfica de Apple o NVIDIA si la hay) y dice todas las frases
 * del vídeo, cada una con su emoción. Escribe «ok N» al terminar cada una, para ir contando.
 */
export const CHATTERBOX_PY = `import json, sys
import torch, soundfile as sf
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

job = json.load(open(sys.argv[1], encoding="utf-8"))
dev = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
try:
    model = ChatterboxMultilingualTTS.from_pretrained(device=dev)
except Exception:
    dev = "cpu"
    model = ChatterboxMultilingualTTS.from_pretrained(device=dev)
if job.get("check"):
    print("ok", dev, flush=True)
    sys.exit(0)
for n, line in enumerate(job["lines"]):
    kw = dict(language_id=job["lang"], exaggeration=line["exaggeration"], cfg_weight=line["cfg"])
    if line.get("ref"):
        kw["audio_prompt_path"] = line["ref"]
    wav = model.generate(line["text"], **kw)
    sf.write(line["out"], wav.squeeze(0).cpu().numpy(), model.sr)
    print("ok", n + 1, flush=True)
`

/**
 * Instala Chatterbox en su entorno (Python 3.11 con uv: torch 2.6 tiene ruedas para él en Mac, Windows y Linux) y
 * descarga el modelo (unos 3,5 GB) probándolo. Devuelve si quedó listo.
 */
export async function installChatterbox(studio: string, deps: { run: Runner; uv: string | null; onLine?: (l: string) => void }): Promise<boolean> {
  const { run, uv } = deps
  const onLine = deps.onLine ?? (() => undefined)
  if (chatterboxReady(studio)) return true
  if (!uv) {
    onLine('Sin uv no se puede preparar la voz con emoción (Chatterbox).')
    return false
  }
  const dir = chatterboxDir(studio)
  mkdirSync(dir, { recursive: true })
  const py = chatterboxPython(studio)
  if (!existsSync(py)) {
    onLine('Preparando la voz con emoción (Chatterbox): entorno de Python 3.11…')
    await run(uv, ['venv', '--seed', '--python', '3.11', join(dir, '.venv')], { timeoutMs: 15 * 60_000, onLine })
    if (!existsSync(py)) return false
  }
  onLine('Instalando Chatterbox (lleva torch: tarda unos minutos)…')
  // En Linux y Windows, «auto» elige torch para la gráfica que haya (o solo CPU, mucho más ligero). Los uv viejos no
  // conocen la opción: entonces, sin ella.
  let pip = await run(uv, ['pip', 'install', '--python', py, ...CHATTERBOX_PIP, '--torch-backend', 'auto'], { timeoutMs: 45 * 60_000, onLine, env: env(studio) })
  if (pip.code !== 0) pip = await run(uv, ['pip', 'install', '--python', py, ...CHATTERBOX_PIP], { timeoutMs: 45 * 60_000, onLine, env: env(studio) })
  if (pip.code !== 0) {
    onLine(`No se pudo instalar Chatterbox: ${pip.out.trim().split('\n').slice(-2).join(' ')}`)
    return false
  }
  onLine('Descargando el modelo de la voz con emoción (unos 3,5 GB, una sola vez)…')
  writeFileSync(join(dir, 'voz.py'), CHATTERBOX_PY)
  const job = join(dir, 'prueba.json')
  writeFileSync(job, JSON.stringify({ check: true }))
  const r = await run(py, [join(dir, 'voz.py'), job], { cwd: dir, env: env(studio), timeoutMs: 60 * 60_000, onLine })
  rmSync(job, { force: true })
  if (r.code !== 0 || !/^ok /m.test(r.out)) {
    onLine(`No se pudo descargar el modelo de Chatterbox: ${r.out.trim().split('\n').slice(-2).join(' ')}`)
    return false
  }
  writeFileSync(marker(studio), JSON.stringify({ version: CHATTERBOX_PIP[0], at: Date.now(), device: /^ok (\S+)/m.exec(r.out)?.[1] ?? 'cpu' }))
  return true
}

export interface ChatterboxLine {
  text: string
  emotion: VoiceEmotion
  /** Muestra de la voz que copia (WAV de 10 a 20 s); sin ella, la voz de fábrica del modelo. */
  ref?: string
  out: string
}

/**
 * Dice todas las frases de un vídeo de una vez (el modelo tarda en cargarse: mejor una sola vez). `onDone` cuenta las
 * que van saliendo. Devuelve false si no salen todas.
 */
export async function chatterboxSpeak(studio: string, lang: string, lines: ChatterboxLine[], deps: { run: Runner; signal?: AbortSignal; onDone?: (n: number) => void }): Promise<boolean> {
  if (!chatterboxReady(studio) || !lines.length || !(CHATTERBOX_LANGS as readonly string[]).includes(lang)) return false
  const dir = chatterboxDir(studio)
  const script = join(dir, 'voz.py')
  let same = false
  try {
    same = readFileSync(script, 'utf8') === CHATTERBOX_PY
  } catch {
    /* no está */
  }
  if (!same) writeFileSync(script, CHATTERBOX_PY)
  const job = join(dir, `encargo-${process.pid}-${Date.now()}.json`)
  writeFileSync(job, JSON.stringify({ lang, lines: lines.map((l) => ({ text: l.text, out: l.out, ref: l.ref, ...CHATTERBOX_EMOTION[l.emotion] })) }))
  // Más o menos 20 s por frase en un procesador normal; con margen.
  const r = await deps.run(chatterboxPython(studio), [script, job], {
    cwd: dir,
    env: env(studio),
    timeoutMs: (5 + lines.length * 1.5) * 60_000,
    signal: deps.signal,
    onLine: (l) => {
      const m = /^ok (\d+)$/.exec(l.trim())
      if (m) deps.onDone?.(Number(m[1]))
    }
  })
  rmSync(job, { force: true })
  return r.code === 0 && lines.every((l) => existsSync(l.out))
}
