// Lectura de un .zip (solo su lista de contenidos) y de un cuaderno de Jupyter, para MoreViews.tsx.
import { unzipSync } from 'fflate'

export interface ZipEntry {
  path: string
  name: string
  depth: number
  dir: boolean
  size: number
}

/** Más elementos no se listan. */
export const MAX_ENTRIES = 3000

/** La lista de un .zip, en forma de árbol (carpetas antes que archivos). No descomprime nada. */
export function listZip(bytes: ArrayBuffer | Uint8Array): { entries: ZipEntry[]; files: number; total: number; cut: boolean } {
  const raw: { name: string; size: number }[] = []
  unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
    filter: (f) => {
      raw.push({ name: f.name, size: f.originalSize })
      return false
    }
  })
  // Las carpetas, también las que el zip no lista aparte.
  const dirs = new Set<string>()
  const files = raw.filter((r) => !r.name.endsWith('/'))
  for (const r of raw) {
    const parts = r.name.replace(/\/$/, '').split('/')
    for (let i = 1; i < parts.length + (r.name.endsWith('/') ? 1 : 0); i++) dirs.add(parts.slice(0, i).join('/'))
  }
  const all: ZipEntry[] = [
    ...[...dirs].map((d) => ({ path: `${d}/`, name: d.split('/').pop() ?? d, depth: d.split('/').length - 1, dir: true, size: 0 })),
    ...files.map((f) => ({ path: f.name, name: f.name.split('/').pop() ?? f.name, depth: f.name.split('/').length - 1, dir: false, size: f.size }))
  ]
  // Orden de árbol: por ruta, con cada carpeta justo antes de lo suyo y las carpetas antes que los archivos.
  const key = (e: ZipEntry): string =>
    e.path
      .replace(/\/$/, '')
      .split('/')
      .map((seg, i, arr) => (i < arr.length - 1 || e.dir ? `0${seg.toLowerCase()}` : `1${seg.toLowerCase()}`))
      .join('/')
  all.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
  return {
    entries: all.slice(0, MAX_ENTRIES),
    files: files.length,
    total: files.reduce((n, f) => n + f.size, 0),
    cut: all.length > MAX_ENTRIES
  }
}

export interface NotebookOutput {
  text?: string
  /** Imagen como data: (PNG, JPEG o SVG). */
  image?: string
  error?: boolean
}

export type NotebookCell = { kind: 'markdown'; source: string } | { kind: 'code'; source: string; count?: number; outputs: NotebookOutput[] }

const join = (v: unknown): string => (Array.isArray(v) ? v.join('') : typeof v === 'string' ? v : '')
/** Quita los códigos de color de la terminal (los errores de Python vienen con ellos). */
const stripAnsi = (s: string): string => s.replace(/\u001b\[[0-9;]*m/g, '')

export function readNotebook(text: string): NotebookCell[] {
  const nb = JSON.parse(text) as { cells?: unknown[]; worksheets?: { cells?: unknown[] }[] }
  const cells = nb.cells ?? nb.worksheets?.[0]?.cells
  if (!Array.isArray(cells)) throw new Error('no tiene celdas')
  return cells.map((raw): NotebookCell => {
    const c = raw as { cell_type?: string; source?: unknown; input?: unknown; execution_count?: number; prompt_number?: number; outputs?: unknown[] }
    const source = join(c.source ?? c.input)
    if (c.cell_type !== 'code') return { kind: 'markdown', source: c.cell_type === 'raw' ? `\`\`\`\n${source}\n\`\`\`` : source }
    const outputs: NotebookOutput[] = []
    for (const o of (c.outputs ?? []) as Record<string, unknown>[]) {
      const type = o.output_type
      if (type === 'stream') outputs.push({ text: stripAnsi(join(o.text)), error: o.name === 'stderr' })
      else if (type === 'error' || type === 'pyerr') outputs.push({ text: stripAnsi(join(o.traceback) || `${String(o.ename)}: ${String(o.evalue)}`), error: true })
      else {
        const data = (o.data ?? o) as Record<string, unknown>
        const png = join(data['image/png'] ?? data.png)
        const jpeg = join(data['image/jpeg'] ?? data.jpeg)
        const svg = join(data['image/svg+xml'] ?? data.svg)
        if (png) outputs.push({ image: `data:image/png;base64,${png.replace(/\s/g, '')}` })
        else if (jpeg) outputs.push({ image: `data:image/jpeg;base64,${jpeg.replace(/\s/g, '')}` })
        else if (svg) outputs.push({ image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` })
        else {
          const plain = join(data['text/plain'] ?? data.text)
          if (plain) outputs.push({ text: stripAnsi(plain) })
        }
      }
    }
    return { kind: 'code', source, count: c.execution_count ?? c.prompt_number ?? undefined, outputs }
  })
}
