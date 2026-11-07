import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { t } from '@/lib/i18n'
import { CHAT_MIN, clampChatWidth } from './chatWidth'
import s from './ChatResizer.module.css'

interface Props {
  /** El panel del chat: su ancho actual. El sitio disponible es el del contenedor de chat + espacio (su abuelo). */
  panel: RefObject<HTMLElement | null>
  /** Ancho elegido a mano, o null si es el automático. */
  width: number | null
  /** Mientras se arrastra (para quitar la animación del reparto) y al soltar (para guardarlo). */
  onResize: (width: number | null, done: boolean) => void
}

/**
 * Borde derecho del chat: se arrastra para darle más o menos ancho. Doble clic (o Inicio) vuelve al ancho automático.
 * Con el teclado: flechas izquierda/derecha.
 */
export function ChatResizer({ panel, width, onResize }: Props) {
  const drag = useRef<{ x: number; w: number; avail: number } | null>(null)

  const measure = (): { w: number; avail: number } | null => {
    const el = panel.current
    const box = el?.parentElement?.parentElement
    if (!el || !box) return null
    const cs = getComputedStyle(box)
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - parseFloat(cs.columnGap || '0')
    if (!Number.isFinite(avail)) return null
    return { w: el.getBoundingClientRect().width, avail }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    const m = measure()
    if (!m) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, ...m }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    onResize(clampChatWidth(d.w + e.clientX - d.x, d.avail), false)
  }

  const end = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    // Un clic sin mover no cambia nada (si no, un clic fijaría el ancho automático como manual).
    if (Math.abs(e.clientX - d.x) < 3) return
    onResize(clampChatWidth(d.w + e.clientX - d.x, d.avail), true)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Home') {
      e.preventDefault()
      onResize(null, true)
      return
    }
    const step = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0
    if (!step) return
    const m = measure()
    if (!m) return
    e.preventDefault()
    onResize(clampChatWidth(m.w + step, m.avail), true)
  }

  return (
    <div
      className={s.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Ancho del chat')}
      aria-valuemin={CHAT_MIN}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title={t('Arrastra para cambiar el ancho del chat · doble clic: ancho automático')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onResize(null, true)}
      onKeyDown={onKeyDown}
    />
  )
}
