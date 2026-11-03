import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { useEscape } from './hooks'
import { cx } from './util'
import s from './Popover.module.css'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  /** Elemento bajo el que se ancla (sus clics no cuentan como "fuera"). */
  anchorRef: RefObject<HTMLElement | null>
  align?: 'start' | 'end'
  role?: 'dialog' | 'menu'
  ariaLabel?: string
  id?: string
  className?: string
  /** 'container' enfoca el popover; 'first' el primer control; 'none' no mueve el foco. */
  initialFocus?: 'container' | 'first' | 'none'
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void
  children: ReactNode
}

/** Popover flotante en un portal (no lo recortan overflow ni contextos de apilamiento).
 *  Se cierra con clic fuera o Escape. Admite popovers anidados. */
export function Popover(props: PopoverProps) {
  if (!props.open) return null
  return createPortal(<PopoverSurface {...props} />, document.body)
}

const FOCUSABLE =
  '[role^="menuitem"]:not([disabled]), button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

function PopoverSurface({
  onClose,
  anchorRef,
  align = 'start',
  role = 'dialog',
  ariaLabel,
  id,
  className,
  initialFocus = 'container',
  onKeyDown,
  children
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inside = useRef(false)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  const [style, setStyle] = useState<CSSProperties>({ top: 0, left: 0, visibility: 'hidden' })

  // Posición fija bajo el ancla, ajustada al viewport.
  useLayoutEffect(() => {
    const place = (e?: Event): void => {
      const el = ref.current
      const a = anchorRef.current
      if (!el || !a) return
      if (e?.type === 'scroll' && e.target instanceof Node && el.contains(e.target)) return
      const r = a.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = el.offsetWidth
      const top = Math.round(r.bottom + 8)
      const maxHeight = Math.max(200, vh - top - 12)
      const next: CSSProperties =
        align === 'end'
          ? { top, right: Math.round(Math.min(Math.max(8, vw - r.right), Math.max(8, vw - w - 8))), maxHeight }
          : { top, left: Math.round(Math.min(Math.max(8, r.left), Math.max(8, vw - w - 8))), maxHeight }
      setStyle((prev) =>
        prev.top === next.top && prev.left === next.left && prev.right === next.right && prev.maxHeight === next.maxHeight
          ? prev
          : next
      )
    }
    place()
    const ro = new ResizeObserver(() => place())
    if (ref.current) ro.observe(ref.current)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef, align])

  // Clic fuera. Los eventos de React atraviesan portales, así que un pointerdown dentro de un
  // popover anidado también marca `inside` en este.
  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      if (inside.current) {
        inside.current = false
        return
      }
      const t = e.target as Node | null
      if (t && anchorRef.current?.contains(t)) return
      if (t && ref.current?.contains(t)) return
      closeRef.current()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [anchorRef])

  // Foco inicial y devolución del foco al ancla al cerrar.
  useEffect(() => {
    const node = ref.current
    if (node && initialFocus !== 'none') {
      const target = initialFocus === 'first' ? node.querySelector<HTMLElement>(FOCUSABLE) : null
      ;(target ?? node).focus({ preventScroll: true })
    }
    const anchor = anchorRef.current
    return () => {
      const active = document.activeElement
      if (!active || active === document.body || (node && node.contains(active))) {
        anchor?.focus({ preventScroll: true })
      }
    }
  }, [])

  useEscape(true, () => closeRef.current())

  return (
    <div
      ref={ref}
      id={id}
      role={role}
      aria-label={ariaLabel}
      tabIndex={-1}
      className={cx(s.popover, className)}
      style={style}
      onPointerDown={() => {
        inside.current = true
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  )
}

/** Navegación con flechas entre elementos de menú. */
export function menuKeyNav(e: ReactKeyboardEvent<HTMLElement>): void {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])'))
  if (items.length === 0) return
  e.preventDefault()
  const i = items.indexOf(document.activeElement as HTMLElement)
  let next = 0
  if (e.key === 'ArrowDown') next = i < 0 ? 0 : (i + 1) % items.length
  else if (e.key === 'ArrowUp') next = i < 0 ? items.length - 1 : (i - 1 + items.length) % items.length
  else if (e.key === 'End') next = items.length - 1
  items[next].focus()
}
