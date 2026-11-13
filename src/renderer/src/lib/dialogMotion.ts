// Ventanas que se van con suavidad. Al entrar, el CSS (styles/motion.css) las hace subir y asentarse; al cerrarse,
// React las quita del DOM de golpe, así que aquí dejamos un «fantasma» (copia inerte) que se desvanece en 140 ms y
// luego desaparece. Vale para cualquier ventana con role="dialog" y aria-modal="true", sin tocar cada una.
// Las que llevan data-instant (Buscar: se usa a diario) no se animan; con «reducir movimiento» tampoco.

export const EXIT_MS = 140

function reducedMotion(): boolean {
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Lo que hay que copiar al cerrarse: el fondo oscuro que envuelve la ventana, o null si no es una ventana animable. */
export function exitTarget(removed: Node): HTMLElement | null {
  if (!(removed instanceof HTMLElement) || removed.dataset.ghost !== undefined) return null
  // Menús y globos (data-exit-motion): se copia el propio menú.
  if (removed.dataset.exitMotion !== undefined) return removed
  const sel = '[role="dialog"][aria-modal="true"]'
  const dialog = removed.matches(sel) ? removed : removed.querySelector<HTMLElement>(sel)
  if (!dialog || dialog.closest('[data-instant]')) return null
  // El fondo es el padre directo cuando también se ha quitado.
  const parent = dialog.parentElement
  return parent && removed.contains(parent) ? parent : dialog
}

/** Deja una copia inerte que hace la animación de salida (solo si es una capa fija: fondo a pantalla completa). */
export function playExit(source: HTMLElement): HTMLElement | null {
  const ghost = source.cloneNode(true) as HTMLElement
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('inert', '')
  ghost.dataset.ghost = ''
  ghost.style.pointerEvents = 'none'
  document.body.appendChild(ghost)
  if (getComputedStyle(ghost).position !== 'fixed') {
    ghost.remove()
    return null
  }
  window.setTimeout(() => ghost.remove(), EXIT_MS + 40)
  return ghost
}

let started = false

/** Empieza a vigilar el DOM (una sola vez, al arrancar la interfaz). */
export function startDialogMotion(): void {
  if (started || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return
  started = true
  new MutationObserver((records) => {
    if (reducedMotion()) return
    for (const rec of records) {
      for (const node of rec.removedNodes) {
        const target = exitTarget(node)
        if (target) playExit(target)
      }
    }
  }).observe(document.body, { childList: true, subtree: true })
}
