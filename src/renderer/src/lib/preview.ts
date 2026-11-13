// Panel de vista previa: qué archivo se abre al pulsarlo en el chat y cómo se muestra (como el de Claude).

import type { Artifact, Attachment, WorkFile } from '@shared/types'

/** Un archivo del proyecto que se puede ver en el panel. */
export interface PreviewItem {
  projectId: string
  relPath: string
  name: string
  mime?: string
  size?: number
  /** Si es un entregable de un agente: quién lo creó y cuándo. */
  artifactId?: string
  agentId?: string
  createdAt?: number
}

/** El panel abierto: los archivos entre los que se pasa con ‹ › y el que se ve. */
export interface PreviewState {
  items: PreviewItem[]
  index: number
}

export type PreviewKind =
  | 'markdown'
  | 'html'
  | 'svg'
  | 'image'
  | 'pdf'
  | 'video'
  | 'audio'
  | 'code'
  | 'text'
  /** Documento de Word (.docx): lo pinta docx-preview. */
  | 'word'
  /** Libro de Excel, OpenDocument o Numbers: tablas con SheetJS. */
  | 'sheet'
  /** CSV o TSV: se ve como tabla y, con el interruptor, como texto. */
  | 'table'
  /** Presentación de PowerPoint (.pptx): diapositivas que lee pptx.ts. */
  | 'slides'
  /** Texto o presentación de LibreOffice (.odt, .odp): se pasa a HTML. */
  | 'odf'
  /** Texto enriquecido (.rtf). */
  | 'rtf'
  /** Libro electrónico (.epub). */
  | 'epub'
  /** Pages o Keynote de Mac: la vista previa que guardan dentro. */
  | 'iwork'
  /** Modelo 3D (.glb, .obj, .stl…): se gira con el ratón. */
  | 'model'
  /** Archivo comprimido (.zip): la lista de lo que lleva. */
  | 'archive'
  /** Letra (.ttf, .otf, .woff): texto de muestra. */
  | 'font'
  /** Cuaderno de Jupyter (.ipynb): celdas y resultados, o su JSON con el interruptor. */
  | 'notebook'
  | 'other'

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif'])
const VIDEO = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])
const AUDIO = new Set(['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'])
const CODE = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'py', 'css', 'scss', 'json', 'yml', 'yaml', 'toml', 'xml', 'sh', 'ps1', 'bat',
  'cmd', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'sql', 'lua', 'gd', 'vue',
  'svelte', 'ini', 'gradle', 'jsonl', 'ndjson', 'graphql', 'gql', 'proto', 'tf', 'hcl', 'nix', 'astro', 'scala', 'clj',
  'ex', 'exs', 'erl', 'hs', 'ml', 'fs', 'pl', 'pm', 'zig', 'nim', 'cmake', 'm', 'mm', 'asm', 'less', 'bash', 'zsh', 'fish',
  'diff', 'patch', 'properties', 'tex', 'bib', 'dart', 'r', 'env', 'conf', 'dockerfile', 'makefile'
])
const TEXT = new Set(['txt', 'log', 'text', 'rst', 'srt', 'vtt', 'nfo', 'adoc'])
const WORD = new Set(['docx', 'docm', 'dotx', 'dotm'])
const SLIDES = new Set(['pptx', 'pptm', 'ppsx', 'ppsm', 'potx', 'potm'])
const ODF = new Set(['odt', 'ott', 'odp', 'otp', 'odg', 'otg'])
const MODEL = new Set(['glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', '3mf'])
const ARCHIVE = new Set(['zip', 'jar', 'apk', 'aab', 'whl', 'xpi', 'nupkg', 'vsix', 'cbz', 'aar'])
const FONT = new Set(['ttf', 'otf', 'woff', 'woff2'])
const SHEET = new Set(['xlsx', 'xlsm', 'xlsb', 'xls', 'xltx', 'xltm', 'ods', 'fods', 'numbers'])

function ext(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? name).toLowerCase()
  const i = base.lastIndexOf('.')
  if (i > 0) return base.slice(i + 1)
  // Sin extensión: Dockerfile y Makefile se leen como código; el resto, como texto.
  return base === 'dockerfile' || base === 'makefile' ? base : ''
}

/** Cómo se muestra un archivo, por su extensión (y su tipo MIME si la extensión no lo dice). */
export function previewKind(name: string, mime?: string): PreviewKind {
  const e = ext(name)
  if (e === 'md' || e === 'markdown' || e === 'mdx') return 'markdown'
  if (e === 'html' || e === 'htm') return 'html'
  if (e === 'svg') return 'svg'
  if (IMAGE.has(e)) return 'image'
  if (e === 'pdf') return 'pdf'
  if (WORD.has(e)) return 'word'
  if (SHEET.has(e)) return 'sheet'
  if (SLIDES.has(e)) return 'slides'
  if (ODF.has(e)) return 'odf'
  if (e === 'rtf') return 'rtf'
  if (e === 'epub') return 'epub'
  if (e === 'pages' || e === 'key') return 'iwork'
  if (MODEL.has(e)) return 'model'
  if (ARCHIVE.has(e)) return 'archive'
  if (FONT.has(e)) return 'font'
  if (e === 'ipynb') return 'notebook'
  if (e === 'csv' || e === 'tsv') return 'table'
  if (VIDEO.has(e)) return 'video'
  if (AUDIO.has(e)) return 'audio'
  if (CODE.has(e)) return 'code'
  if (e && TEXT.has(e)) return 'text'
  const m = (mime ?? '').toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf') return 'pdf'
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'word'
  if (m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || m === 'application/vnd.ms-excel') return 'sheet'
  if (m === 'text/csv') return 'table'
  if (m === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'slides'
  if (m.startsWith('text/') || (!e && !m)) return 'text'
  return 'other'
}

/** Se ve como imagen (miniatura en el chat). */
export function isImageFile(name: string, mime?: string): boolean {
  const k = previewKind(name, mime)
  return k === 'image' || k === 'svg'
}

/** Tiene vista renderizada y vista de código (el interruptor 👁 / </>). */
export function hasSourceView(kind: PreviewKind): boolean {
  return kind === 'markdown' || kind === 'html' || kind === 'svg' || kind === 'table' || kind === 'notebook'
}

/** Se lee como texto (para mostrarlo, copiarlo o ver su código). */
export function isTextual(kind: PreviewKind): boolean {
  return kind === 'markdown' || kind === 'html' || kind === 'svg' || kind === 'table' || kind === 'notebook' || kind === 'code' || kind === 'text'
}

/** Etiqueta corta del tipo, como en Claude: «MD», «PNG», «PDF»… */
export function typeLabel(name: string): string {
  const e = ext(name)
  return e ? e.toUpperCase() : ''
}

/** El lenguaje para el nombre del bloque de código (solo informativo). */
export function codeLanguage(name: string): string {
  return ext(name)
}

export function fromAttachment(a: Attachment, projectId: string): PreviewItem {
  return { projectId, relPath: a.relPath, name: a.name, mime: a.mime, size: a.size }
}

export function fromWorkFile(f: WorkFile, projectId: string): PreviewItem {
  return { projectId, relPath: f.relPath, name: f.name, size: f.size }
}

export function fromArtifact(a: Artifact): PreviewItem {
  return { projectId: a.projectId, relPath: a.relPath, name: a.name, size: a.size, artifactId: a.id, agentId: a.agentId, createdAt: a.createdAt }
}

/** Nombre del archivo a partir de su ruta. */
export function nameOf(relPath: string): string {
  return relPath.split(/[\\/]/).filter(Boolean).pop() ?? relPath
}
