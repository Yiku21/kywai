/**
 * Motor de imágenes gratis por internet (Pollinations, pollinations.ai): la reserva cuando no hay ComfyUI en el equipo
 * y Gemini no dibuja (sin clave, o clave del plan gratis). Sin clave ni cuenta, pero con límite: una imagen cada
 * 45 s por conexión, así que kywai las pide de una en una y espera lo que diga el servidor. Puede llevar una marca
 * pequeña en una esquina. KYWAI_NO_FREE_IMAGES=1 lo apaga (entonces, sin ComfyUI ni Gemini, fondos de diseño).
 */
import { writeFileSync } from 'node:fs'

export const FREE_IMAGES_URL = 'https://image.pollinations.ai/prompt/'
/** Lo que pide el plan gratis entre una imagen y la siguiente (con un poco de margen). */
const GAP_MS = 46_000

export function freeImagesOn(env = process.env): boolean {
  return env.KYWAI_NO_FREE_IMAGES !== '1'
}

/** Tamaño de la imagen: 9:16 o 16:9 en múltiplos de 64. */
export function freeImageSize(vertical: boolean): { width: number; height: number } {
  return vertical ? { width: 576, height: 1024 } : { width: 1024, height: 576 }
}

/** Semilla estable por texto: el mismo guion da las mismas imágenes. */
function seedFor(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) % 1_000_000_000
}

/** La dirección de la imagen (el texto va en la ruta; se recorta para no pasar del largo que admite). */
export function freeImageUrl(prompt: string, vertical: boolean): string {
  const text = prompt.replace(/\s+/g, ' ').trim().slice(0, 900)
  const q = new URLSearchParams({ ...Object.fromEntries(Object.entries(freeImageSize(vertical)).map(([k, v]) => [k, String(v)])), seed: String(seedFor(text)), nologo: 'true', referrer: 'kywai' })
  return `${FREE_IMAGES_URL}${encodeURIComponent(text)}?${q}`
}

/** Cuántos segundos pide esperar el servidor cuando se llega al límite («Retry after 36s»). */
export function retryAfterSeconds(body: string): number | null {
  const m = /retry after (\d+)\s*s/i.exec(body)
  return m ? Number(m[1]) : null
}

/** Por qué falló la última imagen gratis (para decírselo al usuario). */
export let lastFreeImageError = ''

let queue: Promise<unknown> = Promise.resolve()
let lastAt = 0

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((ok) => {
    if (ms <= 0 || signal?.aborted) return ok()
    const t = setTimeout(ok, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), ok()), { once: true })
  })

async function fetchOne(prompt: string, vertical: boolean, out: string, signal?: AbortSignal): Promise<boolean> {
  for (let attempt = 0; attempt < 3 && !signal?.aborted; attempt++) {
    await sleep(lastAt + GAP_MS - Date.now(), signal)
    if (signal?.aborted) return false
    lastAt = Date.now()
    try {
      const res = await fetch(freeImageUrl(prompt, vertical), {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(150_000)]) : AbortSignal.timeout(150_000)
      })
      const type = res.headers.get('content-type') ?? ''
      if (res.ok && type.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > 1000) {
          writeFileSync(out, buf)
          lastFreeImageError = ''
          return true
        }
      }
      const body = res.ok ? '' : await res.text().catch(() => '')
      const wait = retryAfterSeconds(body)
      // En el límite: espera lo que dice y lo intenta otra vez.
      if (wait !== null) {
        lastAt = Date.now() + wait * 1000 - GAP_MS + 1000
        continue
      }
      lastFreeImageError = `HTTP ${res.status}`
    } catch (e) {
      lastFreeImageError = e instanceof Error ? e.message : String(e)
    }
  }
  return false
}

/**
 * Pide una imagen al motor gratis y la guarda en `out` (JPEG). De una en una para todo kywai (el límite es por
 * conexión): si hay otra pidiéndose, espera su turno. false si no salió.
 */
export function freeImage(prompt: string, vertical: boolean, out: string, opts: { signal?: AbortSignal } = {}): Promise<boolean> {
  if (!freeImagesOn()) return Promise.resolve(false)
  const job = queue.then(() => fetchOne(prompt, vertical, out, opts.signal))
  queue = job.catch(() => false)
  return job
}
