// Mientras una tarea trabaja: qué archivos nuevos ha creado o abierto que merezca la pena enseñar en el chat para
// saber por dónde va (capturas y documentos). Sin disco ni red: recibe las listas y decide.
import type { WorkFile } from '@shared/types'
import type { TraceUpdate } from './agents/types'

/** Cada cuánto se mira. */
export const PROGRESS_EVERY_MS = 12_000

const IMAGE = /\.(png|jpe?g|webp|gif)$/i
const DOC = /\.(md|html?|pdf)$/i

export const PROGRESS_LIMITS = {
  /** Por vuelta, para no llenar el chat de golpe. */
  imagesPerTick: 6,
  docsPerTick: 3,
  /** Por tarea. */
  imagesPerTask: 24,
  docsPerTask: 8,
  /** Más pequeñas que esto son iconos o restos, no avances. */
  minImageBytes: 4_000,
  minDocBytes: 300,
  /** Las que superan esto no se pueden enseñar como vista previa. */
  maxImageBytes: 25 * 1024 * 1024,
  /** Un archivo recién escrito puede estar a medias: se espera a que lleve este tiempo sin cambiar. */
  settleMs: 2_500
}

export interface Stamp {
  mtime: number
  size: number
}

/**
 * Los archivos de `now` que no estaban antes de la tarea (o cambiaron desde que empezó), ya terminados de escribir
 * y que no se han contado todavía. Marca los que devuelve en `reported` y suma a `counts`.
 */
export function findNewFiles(
  now: Map<string, Stamp>,
  baseline: Map<string, Stamp> | undefined,
  since: number,
  nowMs: number,
  reported: Set<string>,
  counts: { images: number; docs: number },
  limits = PROGRESS_LIMITS
): WorkFile[] {
  const images: WorkFile[] = []
  const docs: WorkFile[] = []
  const entries = [...now.entries()].sort((a, b) => a[1].mtime - b[1].mtime)
  for (const [rel, stamp] of entries) {
    if (reported.has(rel)) continue
    const before = baseline?.get(rel)
    const isNew = !before || stamp.mtime > before.mtime + 1
    if (!isNew || stamp.mtime < since - 1000) continue
    if (nowMs - stamp.mtime < limits.settleMs) continue
    // Lo que son datos de la propia app (adjuntos del usuario, encargos a los agentes) no es un avance.
    if (/(^|\/)(attachments|\.ai-cowork\/adjuntos|\.ai-cowork\/encargos|avances)\//.test(rel)) continue
    const name = rel.slice(rel.lastIndexOf('/') + 1)
    if (IMAGE.test(name)) {
      if (stamp.size < limits.minImageBytes || stamp.size > limits.maxImageBytes) continue
      if (images.length >= limits.imagesPerTick || counts.images + images.length >= limits.imagesPerTask) continue
      images.push({ relPath: rel, name, image: true, size: stamp.size })
    } else if (DOC.test(name)) {
      if (stamp.size < limits.minDocBytes) continue
      if (docs.length >= limits.docsPerTick || counts.docs + docs.length >= limits.docsPerTask) continue
      docs.push({ relPath: rel, name, image: false, size: stamp.size })
    }
  }
  for (const f of [...images, ...docs]) reported.add(f.relPath)
  counts.images += images.length
  counts.docs += docs.length
  return [...images, ...docs]
}

/**
 * La ruta de una imagen que el agente acaba de abrir o crear (su herramienta de leer o de escribir), donde esté:
 * primera línea del detalle, absoluta y con extensión de imagen. Null si no lo es.
 */
export function imagePathFromTrace(u: TraceUpdate): string | null {
  if (u.type !== 'tool' || (u.tool !== 'read' && u.tool !== 'write') || !u.body) return null
  const first = u.body
    .split('\n')[0]
    .replace(/\s+\((?:líneas?|desde la línea) .*\)$/, '')
    .trim()
  if (!IMAGE.test(first)) return null
  // Absoluta de Windows (C:\… o C:/…) o de Mac y Linux (/…).
  return /^[A-Za-z]:[\\/]/.test(first) || first.startsWith('/') ? first : null
}
