import { useLayoutEffect, useRef, type RefObject } from 'react'
import { calm, enter, reducedMotion, SPRING_BOUNCY } from '@/lib/motion'

/**
 * Al cambiar `current` (una pestaña, una sección…), el contenido de `ref` llega desde el lado de lo elegido: desde la
 * derecha si está más a la derecha en `order` (o más abajo, con `axis: 'y'`) y se asienta con muelle. Si se pasa
 * `iconOf`, el icono de lo elegido da un saltito. La primera vez no se mueve nada.
 */
export function useSwitchMotion(
  ref: RefObject<HTMLElement | null>,
  current: string,
  order: readonly string[],
  opts: { axis?: 'x' | 'y'; distance?: number; iconOf?: (id: string) => Element | null | undefined } = {}
): void {
  const prev = useRef(current)
  const key = order.join('\u0000')
  const { axis = 'x', distance = 18, iconOf } = opts
  const iconRef = useRef(iconOf)
  iconRef.current = iconOf
  useLayoutEffect(() => {
    const before = prev.current
    prev.current = current
    // Sin nada antes (se acaba de abrir) no se mueve: ya entra la ventana entera.
    if (before === current || !before || !current) return
    const ids = key.split('\u0000')
    const dir = Math.sign(ids.indexOf(current) - ids.indexOf(before)) || 1
    enter(ref.current, axis === 'x' ? { x: dir * distance } : { y: dir * distance })
    enter(iconRef.current?.(current), { scale: 0.6, fade: false, spring: SPRING_BOUNCY })
  }, [current, key, ref, axis, distance])
}

/** Cuánto dura la salida de un panel (lo que se va tarda menos que lo que llega). */
export const PANEL_EXIT_MS = 180

/**
 * Al desmontarse, el panel no desaparece de golpe: deja una copia inerte en su mismo sitio que se va deslizando
 * (`x`, `y`) y encogiendo (`scale`) mientras funde. Los iframes, vídeos y lienzos de la copia se cambian por su
 * fondo (no se vuelven a cargar). `skip` decide en el momento si no hace falta (p. ej. solo cambia el archivo).
 */
export function useExitGhost(
  ref: RefObject<HTMLElement | null>,
  opts: { x?: number; y?: number; scale?: number; skip?: () => boolean } = {}
): void {
  const optsRef = useRef(opts)
  optsRef.current = opts
  useLayoutEffect(() => {
    const el = ref.current
    return () => {
      const o = optsRef.current
      if (!el || !el.isConnected || reducedMotion() || o.skip?.()) return
      playGhost(el, calm() ? {} : o)
    }
  }, [ref])
}

/** La copia que se va (exportada para las pruebas). */
export function playGhost(el: HTMLElement, o: { x?: number; y?: number; scale?: number }): HTMLElement | null {
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2 || typeof el.animate !== 'function') return null
  const ghost = el.cloneNode(true) as HTMLElement
  for (const heavy of ghost.querySelectorAll('iframe, video, canvas, webview')) {
    const stand = document.createElement('div')
    stand.style.cssText = 'width:100%;height:100%;flex:1;background:var(--bg-panel)'
    heavy.replaceWith(stand)
  }
  ghost.removeAttribute('id')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('inert', '')
  ghost.dataset.ghost = ''
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: '0',
    zIndex: '50',
    pointerEvents: 'none',
    animation: 'none',
    gridColumn: 'auto',
    gridRow: 'auto'
  })
  document.body.appendChild(ghost)
  const to = `translate(${o.x ?? 0}px, ${o.y ?? 0}px) scale(${o.scale ?? 1})`
  const anim = ghost.animate(
    [
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: to }
    ],
    { duration: PANEL_EXIT_MS, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
  )
  const done = (): void => ghost.remove()
  anim.onfinish = done
  anim.oncancel = done
  window.setTimeout(done, PANEL_EXIT_MS + 120)
  return ghost
}
