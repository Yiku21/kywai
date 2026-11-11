/**
 * Tope de fotogramas del espacio 3D. Sin tope, la escena se dibujaba a la frecuencia de la pantalla (120 o 144 veces
 * por segundo en un Mac o un monitor rápido) aunque nadie trabajara: la luz viva y la cámara que respira nunca la
 * dejan quieta, así que la GPU iba a tope todo el rato.
 */

/** Fotogramas por segundo con la ventana enfocada. */
export const MAX_FPS = 30

/** Fotogramas por segundo con la ventana a la vista pero sin foco. */
export const IDLE_FPS = 20

/**
 * ¿Toca dibujar en este refresco de pantalla? Devuelve la nueva hora del último fotograma, o null si aún no toca.
 * Se mira en cada refresco (requestAnimationFrame), así que los fotogramas caen siempre en un refresco y no hay tirones.
 * Se deja un margen de 2 ms para que una pantalla de 60 Hz dé 30 exactos (uno sí y otro no) y no 20.
 */
export function frameDue(now: number, last: number, fps: number): number | null {
  const interval = 1000 / fps
  const since = now - last
  if (since < interval - 2) return null
  // Si se ha quedado muy atrás (pestaña dormida, equipo atascado), se vuelve a contar desde ahora.
  if (since > interval * 3) return now
  return last + interval
}
