/**
 * Tareas casi repetidas: una tarea nueva cuyo título se parece mucho al de otra que sigue en marcha o en cola en el
 * mismo proyecto (por ejemplo «Guía de la carpeta del equipo en el NAS» y «Guía: carpeta compartida del equipo»).
 * Hermes ya ve el trabajo en marcha y se le pide no repetirlo; esto es la red por si aun así lo hace: el chat avisa
 * para que el usuario detenga una de las dos si son lo mismo. No se borra nada solo: puede ser trabajo distinto.
 */

const STOP = new Set([
  'para', 'como', 'con', 'del', 'las', 'los', 'una', 'uno', 'unos', 'unas', 'que', 'por', 'sobre', 'desde', 'entre', 'hasta',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'sus', 'mis', 'tus', 'and', 'the', 'for', 'with', 'from', 'into', 'pour',
  'avec', 'dans', 'des', 'les', 'une', 'com', 'uma', 'nos', 'nas', 'pelo', 'pela'
])

/** Palabras con contenido de un título, sin tildes ni mayúsculas. */
export function titleWords(title: string): Set<string> {
  const plain = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  return new Set(plain.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))
}

/** 0..1: cuánto del título más corto está en el otro. */
export function titleOverlap(a: string, b: string): number {
  const x = titleWords(a)
  const y = titleWords(b)
  const small = x.size <= y.size ? x : y
  const big = small === x ? y : x
  if (small.size < 3) return 0 // con tan pocas palabras cualquier coincidencia es casualidad
  let common = 0
  for (const w of small) if (big.has(w)) common++
  return common / small.size
}

export const DUPLICATE_OVERLAP = 0.7

/** Pares (nueva, existente) que parecen la misma tarea. */
export function lookalikes(fresh: string[], existing: string[]): Array<{ fresh: string; existing: string }> {
  const out: Array<{ fresh: string; existing: string }> = []
  for (const f of fresh) {
    const hit = existing.find((e) => titleOverlap(f, e) >= DUPLICATE_OVERLAP)
    if (hit) out.push({ fresh: f, existing: hit })
  }
  return out
}
