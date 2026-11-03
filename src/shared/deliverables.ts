// Entregables de una tarea agrupados en una carpeta del chat (escritorio, web y app del móvil).
import type { ArtifactKind } from './types'

/** Carpeta común de unos archivos («artifacts/conceptos»), o '' si no comparten ninguna. */
export function commonFolder(paths: string[]): string {
  const dirs = paths.map((p) => p.replace(/\\/g, '/').split('/').filter(Boolean).slice(0, -1))
  if (!dirs.length) return ''
  const first = dirs[0]
  let n = 0
  while (n < first.length && dirs.every((d) => d[n] === first[n])) n++
  return first.slice(0, n).join('/')
}

/** Nombre de la carpeta en el chat: la última parte de la común, o «Entregables». */
export function folderName(folder: string): string {
  return folder.split('/').filter(Boolean).pop() || 'Entregables'
}

const KIND_WORDS: Record<ArtifactKind, [string, string]> = {
  image: ['imagen', 'imágenes'],
  html: ['página', 'páginas'],
  markdown: ['documento', 'documentos'],
  code: ['archivo de código', 'archivos de código'],
  text: ['texto', 'textos'],
  other: ['archivo', 'archivos']
}

/**
 * «5 imágenes y 2 páginas»: qué hay dentro, de lo más a lo menos abundante. Vacío si no añade nada al número de
 * archivos (más de tres tipos, o todos sin tipo conocido).
 */
export function kindsSummary(kinds: ArtifactKind[]): string {
  const counts = new Map<ArtifactKind, number>()
  for (const k of kinds) counts.set(KIND_WORDS[k] ? k : 'other', (counts.get(KIND_WORDS[k] ? k : 'other') ?? 0) + 1)
  if (counts.size > 3 || (counts.size === 1 && counts.has('other'))) return ''
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${KIND_WORDS[k][n === 1 ? 0 : 1]}`)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}` : (parts[0] ?? '')
}

/** «7 archivos · 5 imágenes y 2 páginas · por Codex»: lo que se ve de una carpeta plegada. */
export function folderSummary(kinds: ArtifactKind[], authors: string[]): string {
  const n = kinds.length
  return [`${n} ${n === 1 ? 'archivo' : 'archivos'}`, kindsSummary(kinds), authors.length ? `por ${authors.join(' y ')}` : '']
    .filter(Boolean)
    .join(' · ')
}
