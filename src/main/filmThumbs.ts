/// <reference types="vite/client" />
// Las muestras de los estilos de película (las mismas que ve el selector de «/video» del escritorio), para Órbita:
// «?asset» da la ruta del archivo en disco (electron-vite lo copia junto al motor al compilar).
import { readFileSync } from 'node:fs'

const PATHS: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../renderer/src/assets/estilos/*.webp', { eager: true, query: '?asset', import: 'default' }) as Record<string, string>).map(
    ([path, file]) => [path.replace(/^.*\/([^/]+)\.webp$/, '$1'), file]
  )
)

/** La muestra (WebP) de un estilo, o null si no tiene. */
export function filmThumb(slug: string): Buffer | null {
  const file = Object.hasOwn(PATHS, slug) ? PATHS[slug] : undefined
  if (!file) return null
  try {
    return readFileSync(file)
  } catch {
    return null
  }
}

/** Los estilos que tienen muestra. */
export const filmThumbSlugs = (): string[] => Object.keys(PATHS)
