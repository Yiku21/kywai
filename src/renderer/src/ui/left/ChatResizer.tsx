import { useRef, useState } from 'react'
import { PanelRightOpen } from 'lucide-react'
import type { KeyboardEvent, PointerEvent, RefObject } from 'react'
import { t } from '@/lib/i18n'
import { CHAT_MIN, clampChatWidth, dragOutcome, type DragOutcome } from './chatWidth'
import s from './ChatResizer.module.css'

interface Props {
  /** El panel del chat: su ancho actual. El sitio disponible es el del contenedor de chat + espacio (su abuelo). */
  panel: RefObject<HTMLElement | null>
  /** Ancho elegido a mano, o null si es el automático. */
  width: number | null
  /** Mientras se arrastra (para quitar la animación del reparto) y al soltar (para guardarlo). */
  onResize: (width: number | null, done: boolean) => void
  /** Al soltar el borde casi en un extremo: cerrar el espacio 3D o el chat del todo. */
  onClose: (side: 'space' | 'chat') => void
}

/**
 * Borde derecho del chat: se arrastra para darle más o menos ancho. Doble clic (o Inicio) vuelve al ancho automático.
 * Llevado casi hasta la derecha cierra el espacio 3D (y lo para); casi hasta la izquierda deja solo el 3D.
 * Con el teclado: flechas izquierda/derecha, Fin cierra el espacio 3D.
 */
export function ChatResizer({ panel, width, onResize, onClose }: Props) {
  const drag = useRef<{ x: number; w: number; avail: number; before: number | null } | null>(null)
  // Mientras se arrastra hasta un extremo: aviso de lo que pasará al soltar.
  const [snap, setSnap] = useState<DragOutcome>(null)

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
    drag.current = { x: e.clientX, ...m, before: width }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    const raw = d.w + e.clientX - d.x
    setSnap(dragOutcome(raw, d.avail))
    onResize(clampChatWidth(raw, d.avail), false)
  }

  const end = (e: PointerEvent<HTMLDivElement>): void => {
    const d = drag.current
    if (!d) return
    drag.current = null
    setSnap(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    // Un clic sin mover no cambia nada (si no, un clic fijaría el ancho automático como manual).
    if (Math.abs(e.clientX - d.x) < 3) {
      onResize(d.before, true)
      return
    }
    const raw = d.w + e.clientX - d.x
    const outcome = e.type === 'pointercancel' ? null : dragOutcome(raw, d.avail)
    if (outcome) {
      // El ancho que tenía antes de arrastrar se conserva para cuando vuelva a abrirse.
      onResize(d.before, true)
      onClose(outcome === 'hide-space' ? 'space' : 'chat')
      return
    }
    onResize(clampChatWidth(raw, d.avail), true)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Home') {
      e.preventDefault()
      onResize(null, true)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      onClose('space')
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
      data-snap={snap ?? undefined}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('Ancho del chat')}
      aria-valuemin={CHAT_MIN}
      aria-valuenow={width ?? undefined}
      tabIndex={0}
      title={t('Arrastra para cambiar el ancho del chat (hasta el borde: cierra ese lado) · doble clic: ancho automático')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onResize(null, true)}
      onKeyDown={onKeyDown}
    >
      {snap && (
        <span className={s.snap} role="status">
          {snap === 'hide-space' ? t('Suelta para ocultar el espacio 3D (se para)') : t('Suelta para dejar solo el espacio 3D')}
        </span>
      )}
    </div>
  )
}

/** Con el espacio 3D cerrado: pestaña en el borde derecho del chat para volver a abrirlo. */
export function SpaceReopen({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      className={s.reopen}
      onClick={onOpen}
      title={t('Mostrar el espacio 3D (está parado mientras no se ve)')}
      aria-label={t('Mostrar el espacio 3D')}
    >
      <PanelRightOpen size={15} aria-hidden="true" />
      <span className={s.reopenLabel}>{t('Espacio digital')}</span>
    </button>
  )
}
