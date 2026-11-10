// Pestaña Archivos ordenada por petición: una carpeta por cada mensaje tuyo, con lo que adjuntaste y lo que el equipo
// generó para él. A diferencia de Resultados (una carpeta por tarea), aquí una petición que se reparte en varias tareas
// (por ejemplo /video) queda junta en una sola carpeta.
import type { Artifact, Attachment, ChatMessage, Task } from './types'
import { folderName } from './deliverables'
import { resultWeight } from './resultGroups'

export interface RequestGroup {
  /** Clave estable para recordar si está abierta: «run:<id>», «dir:<carpeta>» o «adjuntos». */
  key: string
  /** Tu mensaje (primera línea), el título de la tarea si el mensaje ya no está, o la carpeta del disco. */
  title: string
  /** Lo que adjuntaste con esa petición. */
  attachments: Attachment[]
  /** Lo que generó el equipo: el resultado principal delante, luego lo más nuevo. */
  generated: Artifact[]
  /** Hora de lo más nuevo (o de tu mensaje): las carpetas van de la más reciente a la más antigua. */
  newest: number
}

/** Título de las carpetas sin petición conocida (el escritorio y la web lo traducen). */
export const LOOSE_ATTACHMENTS = 'Otros adjuntos'
export const OTHER_FILES = 'Otros archivos'
export const ONLY_ATTACHMENTS = 'Solo archivos adjuntos'

/** Primera línea del mensaje, recortada para que quepa en la cabecera. */
export function requestTitle(text: string, max = 90): string {
  const line = text.split('\n').map((l) => l.trim()).find(Boolean) ?? ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

function dirOf(relPath: string): string {
  return relPath.replace(/\\/g, '/').split('/').filter(Boolean).slice(0, -1).join('/')
}

const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

/** Lo generado: primero el resultado principal (vídeo > página o documento > imagen…), y dentro, lo más nuevo. */
function sortGenerated(list: Artifact[]): Artifact[] {
  return [...list].sort((a, b) => resultWeight(b) - resultWeight(a) || b.createdAt - a.createdAt || byName(a, b))
}

interface Draft {
  title: string
  at: number
  attachments: Attachment[]
  generated: Artifact[]
}

/**
 * Agrupa adjuntos y archivos generados por la petición que los originó. Un archivo generado llega a su petición por su
 * tarea (tarea → ejecución → tu mensaje); sin tarea, va por la carpeta del disco, como en Resultados. Los adjuntos que
 * no están en ningún mensaje cargado (aún sin enviar o de otra conversación) van juntos al final.
 */
export function groupByRequest(input: {
  messages: ChatMessage[]
  tasks: Record<string, Pick<Task, 'runId' | 'title'>>
  artifacts: Artifact[]
  attachments: Attachment[]
}): RequestGroup[] {
  // Tu primer mensaje de cada ejecución es la petición (un «sí» a un plan reutiliza la misma ejecución).
  const asked = new Map<string, ChatMessage>()
  for (const m of input.messages) {
    if (m.author.type !== 'user' || !m.runId) continue
    const prev = asked.get(m.runId)
    if (!prev || m.createdAt < prev.createdAt) asked.set(m.runId, m)
  }
  const groups = new Map<string, Draft>()
  const ensure = (key: string, title: () => string, at = 0): Draft => {
    let g = groups.get(key)
    if (!g) {
      g = { title: title(), at, attachments: [], generated: [] }
      groups.set(key, g)
    }
    return g
  }
  const runTitle = (m: ChatMessage | undefined, fallback?: string): string =>
    (m && (requestTitle(m.text) || (m.attachments?.length ? ONLY_ATTACHMENTS : ''))) || fallback?.trim() || OTHER_FILES

  // Adjuntos: van con el mensaje que los llevó (se usa la versión de la lista del proyecto si está, por si cambió).
  const known = new Map(input.attachments.map((a) => [a.id, a]))
  const placed = new Set<string>()
  for (const m of input.messages) {
    if (m.author.type !== 'user' || !m.attachments?.length) continue
    const key = m.runId ? `run:${m.runId}` : `msg:${m.id}`
    const g = ensure(key, () => runTitle(m), m.createdAt)
    for (const a of m.attachments) {
      if (placed.has(a.id)) continue
      placed.add(a.id)
      g.attachments.push(known.get(a.id) ?? a)
    }
  }

  for (const a of input.artifacts) {
    const task = a.taskId ? input.tasks[a.taskId] : undefined
    if (task?.runId) {
      const m = asked.get(task.runId)
      ensure(`run:${task.runId}`, () => runTitle(m, task.title), m?.createdAt ?? 0).generated.push(a)
    } else {
      const dir = dirOf(a.relPath)
      ensure(`dir:${dir}`, () => (dir && dir !== 'artifacts' ? folderName(dir) : OTHER_FILES)).generated.push(a)
    }
  }

  const result: RequestGroup[] = [...groups.entries()].map(([key, g]) => ({
    key,
    title: g.title,
    attachments: g.attachments,
    generated: sortGenerated(g.generated),
    newest: Math.max(g.at, ...g.generated.map((a) => a.createdAt))
  }))
  result.sort((a, b) => b.newest - a.newest)

  const loose = input.attachments.filter((a) => !placed.has(a.id))
  if (loose.length) result.push({ key: 'adjuntos', title: LOOSE_ATTACHMENTS, attachments: loose, generated: [], newest: 0 })
  return result
}
