// Un error que se nota (habilidad principios-ux-animacion, n.º 10): el campo tiembla 3 veces (±6 px en 300 ms) y se
// pone en rojo con aria-invalid (styles/motion.css). Se puede repetir en cada intento fallido. Con «reducir
// movimiento» no tiembla: solo se queda en rojo y recibe el foco.

export const SHAKE_FRAMES: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px)' },
  { transform: 'translateX(6px)' },
  { transform: 'translateX(-5px)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(-3px)' },
  { transform: 'translateX(0)' }
]

/** Hace temblar el campo (si se puede) y le pone el foco para corregirlo. */
export function shake(el: HTMLElement | null | undefined, focus = true): void {
  if (!el) return
  if (focus) el.focus({ preventScroll: false })
  const reduced = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (reduced || typeof el.animate !== 'function') return
  el.animate(SHAKE_FRAMES, { duration: 300, easing: 'ease-out' })
}
