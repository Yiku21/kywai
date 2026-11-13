import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { t } from '@/lib/i18n'
import { SIDEBAR_DEFAULT, SIDEBAR_FOLD_BELOW, SIDEBAR_MAX, SIDEBAR_MIN, clampSidebarWidth } from './sidebarState'
import s from './Sidebar.module.css'
import { followGrip } from '../left/ChatResizer'

interface Props {
  /** Ancho de la barra abierta. */
  width: number
  /** Plegada en su columna de iconos. */
  rail: boolean
  /** Mientras se arrastra (done = false) y al soltar (done = true, para guardarlo). */
  onChange: (next: { width: number; rail: boolean }, done: boolean) => void
}

/** Ancho de la columna de iconos (como .rail en el CSS). */
const RAIL_W = 58

/**
 * Borde derecho de la barra lateral: se arrastra para darle más o menos ancho. Llevado casi del todo a la izquierda
 * la pliega en su columna de iconos; desde la columna, arrastrar a la derecha la vuelve a abrir. Doble clic: el
 * ancho de siempre. Con el teclado: flechas izquierda/derecha, Inicio = ancho de siempre.
 */
export function SidebarResizer({ width, rail, onChange }: Props) {
  const drag = useRef<{ x: number; start: number; moved: boolean; width: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  // Plegada arrastrando, recuerda el ancho que tenía antes de empezar (para cuando se vuelva a abrir).
  const outcome = (raw: number): { width: number; rail: boolean } =>
    raw < SIDEBAR_FOLD_BELOW ? { width: drag.current?.width ?? width, rail: true } : { width: clampSidebarWidth(raw), rail: false }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, start: rail ? RAIL_W : width, moved: false, width }
    setDragging(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    followGrip(e)
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.x) >= 3) d.moved = true
    if (!d.moved) return
    onChange(outcome(d.start + e.clientX - d.x), false)
  }

  const end = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    // Un clic sin mover no cambia nada.
    if (d.moved) onChange(e.type === 'pointercancel' ? { width: d.width, rail } : outcome(d.start + e.clientX - d.x), true)
    drag.current = null
    setDragging(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Home') {
      e.preventDefault()
      onChange({ width: SIDEBAR_DEFAULT, rail: false }, true)
      return
    }
    const step = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0
    if (!step) return
    e.preventDefault()
    if (rail) {
      if (step > 0) onChange({ width, rail: false }, true)
      return
    }
    if (step < 0 && width <= SIDEBAR_MIN) onChange({ width, rail: true }, true)
    else onChange({ width: clampSidebarWidth(width + step), rail: false }, true)
  }

  return (
    <div
      className={s.resizer}
      data-grip=""
      data-dragging={dragging || undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Ancho de la barra lateral')}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={rail ? RAIL_W : width}
      tabIndex={0}
      title={t('Arrastra para cambiar el ancho de la barra (hasta la izquierda: la pliega) · doble clic: ancho de siempre')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onChange({ width: SIDEBAR_DEFAULT, rail: false }, true)}
      onKeyDown={onKeyDown}
    />
  )
}
