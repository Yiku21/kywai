import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { gzipSync } from 'node:zlib'

/** Tipos de texto que merece la pena comprimir (las imágenes y fuentes ya van comprimidas). */
const COMPRESSIBLE = new Set(['.js', '.mjs', '.css', '.html', '.json', '.svg', '.map', '.txt'])
const MIN_BYTES = 1024

const cache = new Map<string, { mtimeMs: number; size: number; gz: Buffer }>()

/** ¿Acepta el navegador gzip? (`Accept-Encoding: gzip, br` o `*`; `gzip;q=0` lo rechaza). */
export function acceptsGzip(header: string | string[] | undefined): boolean {
  const value = Array.isArray(header) ? header.join(',') : (header ?? '')
  return value
    .toLowerCase()
    .split(',')
    .some((part) => {
      const [name, ...params] = part.trim().split(';')
      if (name !== 'gzip' && name !== '*') return false
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
      return !q || Number(q.slice(2)) > 0
    })
}

/**
 * Versión comprimida de un archivo de la interfaz, o null si no compensa. Se comprime una sola vez por versión del
 * archivo (se guarda en memoria mientras no cambie): la interfaz llega al navegador y al cliente en menos de un
 * tercio de lo que pesa.
 */
export function gzipStatic(abs: string, st: { mtimeMs: number; size: number }): Buffer | null {
  if (st.size < MIN_BYTES || !COMPRESSIBLE.has(extname(abs).toLowerCase())) return null
  const hit = cache.get(abs)
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.gz
  const gz = gzipSync(readFileSync(abs), { level: 9 })
  if (gz.length >= st.size) return null
  cache.set(abs, { mtimeMs: st.mtimeMs, size: st.size, gz })
  return gz
}
