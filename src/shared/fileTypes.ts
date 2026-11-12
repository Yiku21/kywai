// Tipo de archivo para filtrar las pestañas Archivos y Resultados (Fotos, Vídeos, Audio, Documentos, Código, Otros).
// La usan el escritorio y la web; Órbita lleva la misma regla en Kotlin (FileTypes.kt). Si cambias una, cambia la otra.
import type { ArtifactKind } from './types'

export type FileType = 'image' | 'video' | 'audio' | 'document' | 'code' | 'other'

/** Orden de los botones del filtro. */
export const FILE_TYPES: FileType[] = ['image', 'video', 'audio', 'document', 'code', 'other']

const EXT: Record<Exclude<FileType, 'other'>, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico', 'heic', 'heif', 'tif', 'tiff'],
  video: ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi', 'mpg', 'mpeg', 'wmv', '3gp'],
  audio: ['mp3', 'wav', 'm4a', 'ogg', 'oga', 'opus', 'flac', 'aac', 'aiff', 'aif', 'wma', 'mid', 'midi'],
  document: [
    'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'markdown', 'ppt', 'pptx', 'odp', 'key', 'xls', 'xlsx', 'ods',
    'csv', 'tsv', 'epub', 'pages', 'numbers', 'html', 'htm', 'srt', 'vtt'
  ],
  code: [
    'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cpp', 'hpp',
    'cs', 'php', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'sql', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'xml', 'css', 'scss',
    'less', 'vue', 'svelte', 'lua', 'r', 'dart', 'ini', 'env', 'gradle', 'ipynb'
  ]
}
const BY_EXT = new Map<string, FileType>(
  (Object.entries(EXT) as [FileType, string[]][]).flatMap(([type, list]) => list.map((e) => [e, type] as const))
)

function extOf(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop() ?? ''
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(i + 1).toLowerCase() : ''
}

/**
 * Tipo de un archivo. Un MIME de imagen, vídeo o audio manda (una nota de voz .webm es audio, no vídeo); si no, la
 * extensión; y si tampoco la conoce, la clase que le dio el equipo.
 */
export function fileTypeOf(name: string, mime?: string, kind?: ArtifactKind): FileType {
  if (mime?.startsWith('image/')) return 'image'
  if (mime?.startsWith('video/')) return 'video'
  if (mime?.startsWith('audio/')) return 'audio'
  const byExt = BY_EXT.get(extOf(name))
  if (byExt) return byExt
  if (mime === 'application/pdf' || mime?.startsWith('text/')) return 'document'
  if (kind === 'image') return 'image'
  if (kind === 'html' || kind === 'markdown' || kind === 'text') return 'document'
  if (kind === 'code') return 'code'
  return 'other'
}

/** Cuántos archivos hay de cada tipo (solo los tipos que aparecen). */
export function countTypes(types: FileType[]): Partial<Record<FileType, number>> {
  const out: Partial<Record<FileType, number>> = {}
  for (const t of types) out[t] = (out[t] ?? 0) + 1
  return out
}
