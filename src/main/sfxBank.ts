import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { SfxKind } from './videoScript'

/**
 * Banco de efectos de sonido del estudio de vídeo: grabaciones y efectos de verdad en vez de los 5 sintetizados.
 *
 * 1. earshot (github.com/Leonxlnx/earshot, MIT): 252 efectos hechos con código, sin red ni modelos. Se instala en el
 *    entorno de Python del estudio solo con lo que usa «earshot sfx» (sin torch ni los modelos de análisis).
 * 2. Openverse (api.openverse.org, sin clave): sonidos reales de Freesound con licencia CC0 (dominio público, no hace
 *    falta citar a nadie). Solo para lo que earshot no tiene (el «boing») o si earshot no está.
 * 3. Los sintetizados de siempre (synthSfx), si no hay nada de lo anterior.
 *
 * El banco se prepara una vez en <estudio>/efectos/ (un WAV mono de 16 bits a 44,1 kHz por sonido) y los vídeos
 * lo reutilizan; fuentes.json dice de dónde salió cada uno.
 */

/** Versión fija de earshot: el mismo sonido dentro de meses. Se baja como .tar.gz (no hace falta git). */
export const EARSHOT_COMMIT = '4ac3d2ac2b151e1c23376f9ce7f3047a17050013'
export const EARSHOT_PIP = `earshot @ https://github.com/Leonxlnx/earshot/archive/${EARSHOT_COMMIT}.tar.gz`
/** Lo único que necesita «earshot sfx» (sus otras órdenes usan torch y 1 GB de modelos: no hacen falta aquí). */
export const EARSHOT_DEPS = ['numpy', 'scipy', 'soundfile', 'soxr']

/** Cambia si cambia la lista de sonidos: el banco se rehace. */
export const SFX_BANK_VERSION = 1
const RETRY_MS = 24 * 3600_000

interface EarshotSound {
  id: string
  /** Duración exacta en segundos. */
  dur?: number
  /** Segundos hasta lo más fuerte (familia whoosh): coincide con el corte de la transición, como el sintetizado. */
  apex?: number
}

/** Varios por tipo para que no suene siempre igual; el vídeo los va turnando. */
export const EARSHOT_SOUNDS: Record<SfxKind, EarshotSound[]> = {
  whoosh: [
    { id: 'whoosh_fast/crisp', dur: 0.6, apex: 0.22 },
    { id: 'whoosh_fast/tight', dur: 0.6, apex: 0.22 },
    { id: 'swish/soft', dur: 0.6, apex: 0.22 },
    { id: 'whoosh_fast/whip', dur: 0.6, apex: 0.22 }
  ],
  pop: [{ id: 'ui_pop/boop' }, { id: 'ui_pop/soft' }, { id: 'pro_pop_in/round' }, { id: 'drip/bloop' }],
  impact: [{ id: 'impact/punch', dur: 1.2 }, { id: 'cut_hit/punch' }, { id: 'impact/classic', dur: 1.2 }],
  riser: [{ id: 'riser/dark', dur: 0.9 }, { id: 'riser/build', dur: 0.9 }],
  // earshot no tiene muelles de dibujos animados: el boing viene de Openverse o es el sintetizado.
  boing: []
}

/** Búsqueda en Openverse por tipo (Freesound, CC0) y lo más largo que se acepta (ms). El riser se queda sintetizado. */
export const OPENVERSE_QUERIES: Partial<Record<SfxKind, { q: string; maxMs: number; keep: number }>> = {
  boing: { q: 'cartoon boing', maxMs: 2500, keep: 2 },
  whoosh: { q: 'whoosh', maxMs: 2000, keep: 3 },
  pop: { q: 'pop', maxMs: 800, keep: 3 },
  impact: { q: 'impact hit', maxMs: 3000, keep: 2 }
}
/** Lo que se deja de cada sonido de Openverse (s): un efecto, no la grabación entera. */
const OPENVERSE_KEEP_S: Record<SfxKind, number> = { whoosh: 0.8, pop: 0.35, impact: 1.2, riser: 0.9, boing: 0.7 }

export interface SfxSource {
  kind: SfxKind
  file: string
  source: 'earshot' | 'openverse'
  id: string
  title?: string
  creator?: string
  license?: string
  url?: string
}

interface BankIndex {
  version: number
  sounds: SfxSource[]
  /** Último intento por tipo que no dio nada (para no repetirlo en cada vídeo). */
  tried: Partial<Record<SfxKind, number>>
}

export interface SfxBankDeps {
  run: (cmd: string, args: string[], opts?: { timeoutMs?: number; signal?: AbortSignal }) => Promise<{ code: number | null; out: string }>
  /** El programa earshot del entorno de Python del estudio, o null si no está. */
  earshot: string | null
  fetch?: typeof fetch
  now?: number
  signal?: AbortSignal
  onLine?: (l: string) => void
}

const KINDS: SfxKind[] = ['whoosh', 'pop', 'impact', 'riser', 'boing']
const INDEX = 'fuentes.json'

function readIndex(dir: string): BankIndex {
  try {
    const j = JSON.parse(readFileSync(join(dir, INDEX), 'utf8')) as BankIndex
    if (j.version === SFX_BANK_VERSION && Array.isArray(j.sounds)) return { version: j.version, sounds: j.sounds, tried: j.tried ?? {} }
  } catch {
    // Sin banco todavía.
  }
  return { version: SFX_BANK_VERSION, sounds: [], tried: {} }
}

const usable = (dir: string, file: string): boolean => {
  try {
    return statSync(join(dir, file)).size > 200
  } catch {
    return false
  }
}

/** Pasa cualquier audio al formato del banco (WAV mono de 16 bits a 44,1 kHz, sin metadatos). */
async function toBankWav(deps: SfxBankDeps, src: string, out: string, extra: string[] = []): Promise<boolean> {
  const r = await deps.run(
    'ffmpeg',
    ['-y', '-v', 'error', '-i', src, ...extra, '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-bitexact', out],
    { timeoutMs: 60_000, signal: deps.signal }
  )
  return r.code === 0 && existsSync(out) && statSync(out).size > 200
}

async function fromEarshot(dir: string, kind: SfxKind, deps: SfxBankDeps): Promise<SfxSource[]> {
  const list = EARSHOT_SOUNDS[kind]
  if (!deps.earshot || !list.length) return []
  // Cada sonido tarda unos segundos (arranca Python): de dos en dos.
  const got: (SfxSource | null)[] = []
  for (let i = 0; i < list.length; i += 2) {
    const pair = list.slice(i, i + 2).map(async (s, k): Promise<SfxSource | null> => {
      const n = i + k + 1
      const raw = join(dir, `.${kind}-${n}.earshot.wav`)
      const file = `${kind}-${n}.wav`
      const args = ['sfx', 'render', s.id, '-o', raw, '--sr', '44100', '--peak', '-1']
      if (s.dur) args.push('--dur', String(s.dur))
      if (s.apex) args.push('--apex', String(s.apex))
      const r = await deps.run(deps.earshot as string, args, { timeoutMs: 3 * 60_000, signal: deps.signal })
      const ok = r.code === 0 && existsSync(raw) && (await toBankWav(deps, raw, join(dir, file)))
      rmSync(raw, { force: true })
      if (!ok) deps.onLine?.(`earshot no pudo hacer «${s.id}»: ${r.out.trim().split('\n').slice(-1)[0] ?? ''}`)
      return ok ? { kind, file, source: 'earshot', id: s.id, license: 'MIT (earshot)' } : null
    })
    got.push(...(await Promise.all(pair)))
  }
  return got.filter((x): x is SfxSource => !!x)
}

interface OpenverseAudio {
  id?: string
  title?: string
  url?: string
  creator?: string
  license?: string
  foreign_landing_url?: string
  duration?: number | null
}

/** Sonidos CC0 de Openverse (sin clave). Se recortan al principio (silencio) y al final, con un fundido. */
async function fromOpenverse(dir: string, kind: SfxKind, deps: SfxBankDeps): Promise<SfxSource[]> {
  const q = OPENVERSE_QUERIES[kind]
  if (!q) return []
  const f = deps.fetch ?? fetch
  const url = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q.q)}&license=cc0&source=freesound&page_size=20`
  let results: OpenverseAudio[] = []
  try {
    const r = await f(url, { headers: { Accept: 'application/json' }, signal: deps.signal ?? AbortSignal.timeout(20_000) })
    if (!r.ok) return []
    results = ((await r.json()) as { results?: OpenverseAudio[] }).results ?? []
  } catch {
    return []
  }
  const picks = results.filter((x) => x.url && x.license === 'cc0' && typeof x.duration === 'number' && x.duration >= 100 && x.duration <= q.maxMs)
  const keep = OPENVERSE_KEEP_S[kind]
  const out: SfxSource[] = []
  for (const p of picks) {
    if (out.length >= q.keep || deps.signal?.aborted) break
    const n = out.length + 1
    const ext = /\.(\w{2,4})(?:\?|$)/.exec(p.url as string)?.[1] ?? 'mp3'
    const raw = join(dir, `.${kind}-ov${n}.${ext}`)
    try {
      const r = await f(p.url as string, { signal: deps.signal ?? AbortSignal.timeout(30_000) })
      if (!r.ok) continue
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length > 5_000_000) continue
      writeFileSync(raw, buf)
    } catch {
      continue
    }
    const file = `${kind}-ov${n}.wav`
    const fadeAt = Math.max(0, keep - 0.12).toFixed(2)
    const ok = await toBankWav(deps, raw, join(dir, file), [
      '-af',
      `silenceremove=start_periods=1:start_threshold=-45dB,atrim=0:${keep},afade=t=out:st=${fadeAt}:d=0.12`
    ])
    rmSync(raw, { force: true })
    if (ok) out.push({ kind, file, source: 'openverse', id: p.id ?? '', title: p.title, creator: p.creator, license: 'CC0', url: p.foreign_landing_url })
  }
  return out
}

/**
 * Prepara lo que falte del banco: por cada tipo sin sonidos, primero earshot y luego Openverse. Un tipo que no da
 * nada no se vuelve a intentar hasta el día siguiente (sin internet, cada vídeo esperaría a que falle).
 */
export async function ensureSfxBank(dir: string, deps: SfxBankDeps): Promise<SfxSource[]> {
  mkdirSync(dir, { recursive: true })
  const idx = readIndex(dir)
  const now = deps.now ?? Date.now()
  idx.sounds = idx.sounds.filter((s) => usable(dir, s.file))
  for (const kind of KINDS) {
    if (deps.signal?.aborted) break
    const have = idx.sounds.filter((s) => s.kind === kind)
    // Con earshot recién instalado, lo de Openverse se cambia por lo suyo (menos el boing, que earshot no tiene).
    const upgrade = !!deps.earshot && EARSHOT_SOUNDS[kind].length > 0 && have.length > 0 && have.every((s) => s.source === 'openverse')
    if (have.length && !upgrade) continue
    const last = idx.tried[kind]
    if (typeof last === 'number' && now - last < RETRY_MS) continue
    let got = await fromEarshot(dir, kind, deps)
    if (!got.length && !upgrade) got = await fromOpenverse(dir, kind, deps)
    if (got.length) {
      if (upgrade) for (const s of have) rmSync(join(dir, s.file), { force: true })
      idx.sounds = idx.sounds.filter((s) => s.kind !== kind || !upgrade).concat(got)
      delete idx.tried[kind]
    } else idx.tried[kind] = now
    // Después de cada tipo: un vídeo que no puede esperar ya usa lo que esté listo.
    writeFileSync(join(dir, INDEX), JSON.stringify(idx, null, 2))
  }
  if (!existsSync(join(dir, INDEX))) writeFileSync(join(dir, INDEX), JSON.stringify(idx, null, 2))
  return idx.sounds
}

/** Lee un WAV PCM de 16 bits (mono o la media de sus canales) a muestras de -1 a 1 normalizadas a pico 1. */
export function readWav16(buf: Buffer): { samples: Float32Array; sampleRate: number } | null {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null
  let pos = 12
  let channels = 1
  let rate = 0
  let bits = 0
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const size = buf.readUInt32LE(pos + 4)
    const body = pos + 8
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(body + 2)
      rate = buf.readUInt32LE(body + 4)
      bits = buf.readUInt16LE(body + 14)
    } else if (id === 'data') {
      if (bits !== 16 || !rate || channels < 1) return null
      const frames = Math.floor(Math.min(size, buf.length - body) / (2 * channels))
      const out = new Float32Array(frames)
      let peak = 0
      for (let i = 0; i < frames; i++) {
        let v = 0
        for (let c = 0; c < channels; c++) v += buf.readInt16LE(body + (i * channels + c) * 2)
        out[i] = v / channels / 32768
        peak = Math.max(peak, Math.abs(out[i]))
      }
      if (peak > 0) for (let i = 0; i < frames; i++) out[i] /= peak
      return { samples: out, sampleRate: rate }
    }
    pos = body + size + (size % 2)
  }
  return null
}

/** Los sonidos del banco por tipo, listos para mezclar (solo los que están a `sampleRate`). */
export function loadSfxBank(dir: string, sampleRate = 44100): Partial<Record<SfxKind, Float32Array[]>> {
  const bank: Partial<Record<SfxKind, Float32Array[]>> = {}
  for (const s of readIndex(dir).sounds) {
    try {
      const w = readWav16(readFileSync(join(dir, s.file)))
      if (w && w.sampleRate === sampleRate && w.samples.length) (bank[s.kind] ??= []).push(w.samples)
    } catch {
      // Un archivo roto no frena el vídeo: ese tipo sale sintetizado.
    }
  }
  return bank
}

/** De dónde salen los efectos ahora mismo (para Ajustes). */
export function sfxBankSummary(dir: string): { earshot: number; openverse: number } {
  const sounds = existsSync(dir) ? readIndex(dir).sounds.filter((s) => usable(dir, s.file)) : []
  return { earshot: sounds.filter((s) => s.source === 'earshot').length, openverse: sounds.filter((s) => s.source === 'openverse').length }
}

/** ¿Está earshot en el entorno de Python del estudio? (Sin lanzar Python: se mira la carpeta del paquete.) */
export function earshotInstalledIn(venv: string, isWin = process.platform === 'win32'): boolean {
  if (isWin) return existsSync(join(venv, 'Lib', 'site-packages', 'earshot'))
  try {
    return readdirSync(join(venv, 'lib')).some((d) => d.startsWith('python') && existsSync(join(venv, 'lib', d, 'site-packages', 'earshot')))
  } catch {
    return false
  }
}
