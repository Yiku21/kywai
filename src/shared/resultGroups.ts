// Pestaña Resultados agrupada en carpetas: una por tarea, con el resultado principal delante y los archivos de
// trabajo (escenas, voces, json, código…) aparte. La usan el escritorio y la web; Órbita lleva la misma regla en Kotlin
// (ResultGroups.kt). Si cambias una, cambia la otra.
import type { Artifact } from './types'
import { folderName } from './deliverables'

export interface ResultGroup {
  /** Clave estable para recordar si está abierta: «task:<id>» o «dir:<carpeta>». */
  key: string
  title: string
  taskId?: string
  /** Lo que se enseña al abrir la carpeta: el vídeo, la página o el documento final (lo más nuevo primero). */
  main: Artifact[]
  /** Archivos de trabajo, plegados aparte (por nombre: escena-1, escena-2…). Vacío si todo es principal. */
  work: Artifact[]
  /** Hora del archivo más nuevo: las carpetas van de la más reciente a la más antigua. */
  newest: number
}

const VIDEO = /\.(mp4|mov|webm|mkv|m4v|avi)$/i
const PAGE = /\.(html?|pdf|docx?|pptx?|xlsx?|odt|key|pages|epub)$/i
const MEDIA = /\.(png|jpe?g|webp|gif|svg|avif|mp3|wav|m4a|ogg|flac|md|markdown)$/i

/**
 * Peso del archivo como resultado: 3 vídeo, 2 página o documento final, 1 imagen, audio o Markdown, 0 lo demás
 * (código, json, textos). En cada carpeta es principal lo que tiene el peso más alto que haya.
 */
export function resultWeight(a: Pick<Artifact, 'name' | 'relPath' | 'kind'>): number {
  const name = a.name || a.relPath
  if (VIDEO.test(name)) return 3
  if (a.kind === 'html' || PAGE.test(name)) return 2
  if (a.kind === 'image' || a.kind === 'markdown' || MEDIA.test(name)) return 1
  return 0
}

function dirOf(relPath: string): string {
  const parts = relPath.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.slice(0, -1).join('/')
}

const byName = (a: Artifact, b: Artifact): number => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

/** Separa los archivos de una carpeta en principales y de trabajo. */
export function splitMain(list: Artifact[]): { main: Artifact[]; work: Artifact[] } {
  const top = Math.max(0, ...list.map(resultWeight))
  // Sin nada que destaque (solo código o textos), todo es principal: no hay qué esconder.
  if (top === 0) return { main: [...list].sort(byName), work: [] }
  const main = list.filter((a) => resultWeight(a) === top).sort((a, b) => b.createdAt - a.createdAt || byName(a, b))
  const work = list.filter((a) => resultWeight(a) !== top).sort(byName)
  return { main, work }
}

/**
 * Agrupa los resultados: una carpeta por tarea (con su título) y, lo que no viene de una tarea, por la carpeta del
 * disco donde está. `taskTitle` da el título de una tarea (o nada si ya no se conoce).
 */
export function groupResults(artifacts: Artifact[], taskTitle: (id: string) => string | undefined): ResultGroup[] {
  const groups = new Map<string, { title: string; taskId?: string; list: Artifact[] }>()
  for (const a of artifacts) {
    const dir = dirOf(a.relPath)
    const key = a.taskId ? `task:${a.taskId}` : `dir:${dir}`
    let g = groups.get(key)
    if (!g) {
      const title = (a.taskId && taskTitle(a.taskId)?.trim()) || (dir && dir !== 'artifacts' ? folderName(dir) : 'Otros archivos')
      g = { title, taskId: a.taskId, list: [] }
      groups.set(key, g)
    }
    g.list.push(a)
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, title: g.title, taskId: g.taskId, ...splitMain(g.list), newest: Math.max(...g.list.map((a) => a.createdAt)) }))
    .sort((a, b) => b.newest - a.newest)
}
