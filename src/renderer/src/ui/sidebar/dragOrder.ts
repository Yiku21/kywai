/**
 * Orden manual de la barra lateral al arrastrar. Funciones puras (sin React) para poder probarlas.
 */

/** Clave de un favorito: proyecto `p:<id>` o chat `c:<proyecto>:<chat>`. */
export const projectKey = (id: string): string => `p:${id}`
export const chatKey = (projectId: string, id: string): string => `c:${projectId}:${id}`

/**
 * Ordena según la lista guardada. Lo que no está en ella (proyectos o chats nuevos) va primero, en el orden en que
 * llega (por fecha, lo más reciente arriba); lo demás, en el orden que dejó el usuario.
 */
export function applyOrder<T>(items: T[], keyOf: (x: T) => string, order: string[] | undefined): T[] {
  if (!order?.length) return items
  const pos = new Map(order.map((k, i) => [k, i]))
  const fresh = items.filter((x) => !pos.has(keyOf(x)))
  const known = items.filter((x) => pos.has(keyOf(x))).sort((a, b) => pos.get(keyOf(a))! - pos.get(keyOf(b))!)
  return [...fresh, ...known]
}

/**
 * Lista nueva tras soltar `key` antes o después de `target` (o al final si no hay `target`). `current` es la lista
 * tal y como se ve ahora; si `key` no estaba, se añade.
 */
export function placeKey(current: string[], key: string, target: string | null, after: boolean): string[] {
  const rest = current.filter((k) => k !== key)
  if (target === null || target === key) {
    if (target === key) return current.includes(key) ? current : [...rest, key]
    return [...rest, key]
  }
  const i = rest.indexOf(target)
  if (i < 0) return [...rest, key]
  rest.splice(after ? i + 1 : i, 0, key)
  return rest
}

/** Lo que se está arrastrando ahora. */
export type Dragged = { kind: 'project'; id: string } | { kind: 'chat'; projectId: string; id: string; title?: string; busy?: boolean }

/** Dónde caería: antes o después de la fila (mitades) o, en un proyecto, dentro (franja del medio). */
export type DropPlace = 'before' | 'after' | 'into'

export function dropPlace(offsetY: number, height: number, allowInto: boolean): DropPlace {
  const f = height > 0 ? offsetY / height : 0.5
  if (allowInto) return f < 0.25 ? 'before' : f > 0.75 ? 'after' : 'into'
  return f < 0.5 ? 'before' : 'after'
}
