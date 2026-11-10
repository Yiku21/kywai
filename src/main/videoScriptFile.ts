// «/video 1) usa el guion de artifacts/guiones/01-intro.md 2) …»: si un vídeo nombra un archivo de texto del proyecto,
// kywai lo lee y se lo da al que escribe o dirige el vídeo como el guion a seguir. El guionista no abre archivos: sin
// esto solo vería el nombre y se inventaría el contenido.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

/** Hasta este tamaño se lee (un guion es corto; más sería otra cosa). */
const MAX_BYTES = 200_000
const PATH_RE = /(?:^|[\s«"'(`])((?:\.{0,2}[\\/])?(?:[\w.\-]*[\\/])*[\w.\-]+\.(?:md|markdown|txt))(?=$|[\s»"'),;:`]|\.(?:\s|$))/i

/** ¿Está `p` dentro de `root`? */
function inside(root: string, p: string): boolean {
  const r = relative(root, p)
  return !!r && !r.startsWith('..') && !isAbsolute(r)
}

/**
 * El primer archivo de texto (.md, .markdown, .txt) que nombra `text` y existe dentro de alguna de las carpetas
 * `roots` del proyecto. Los entregables («artifacts/…») también se buscan en `.ai-cowork/entregables/`, donde quedan
 * cuando el proyecto trabaja en una carpeta del usuario. Nada fuera de esas carpetas.
 */
export function scriptFileOf(text: string, roots: string[]): { path: string; text: string } | null {
  const m = PATH_RE.exec(text)
  if (!m) return null
  const rel = m[1].trim().replace(/^\.[\\/]/, '')
  for (const root of roots.filter(Boolean).map((r) => resolve(r))) {
    const tries = [isAbsolute(rel) ? rel : join(root, rel)]
    const art = /^artifacts[\\/](.+)$/.exec(rel)
    if (art) tries.push(join(root, '.ai-cowork', 'entregables', art[1]))
    for (const p of tries.map((x) => resolve(x))) {
      if (!inside(root, p) || !existsSync(p)) continue
      const st = statSync(p)
      if (!st.isFile() || st.size > MAX_BYTES) continue
      const body = readFileSync(p, 'utf8').trim()
      if (body) return { path: rel, text: body }
    }
  }
  return null
}

/** Lo que recibe el guionista: el guion del usuario, para seguirlo (no para resumirlo a su manera). */
export function scriptSource(file: { path: string; text: string }): string {
  return `GUION DEL USUARIO (archivo ${file.path}). Este vídeo es este guion: síguelo con su gancho, su orden y sus frases; solo adáptalo al formato (escenas, duración) sin cambiar su mensaje.\n\n${file.text}`
}
