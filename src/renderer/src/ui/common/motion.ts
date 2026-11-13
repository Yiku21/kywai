import { useLayoutEffect, useRef, type RefObject } from 'react'
import { enter, SPRING_BOUNCY } from '@/lib/motion'

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
