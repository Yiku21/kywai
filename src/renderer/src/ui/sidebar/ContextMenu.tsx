import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import { cx } from '../common/util'
import s from './ContextMenu.module.css'

export interface MenuAction {
  id: string
  label: string
  icon?: ReactNode
  /** Letra que lo elige con el menú abierto (se muestra a la derecha, como en Claude). */
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  /** Por qué está desactivado, o una ayuda corta. */
  title?: string
  /** Pide pulsarlo otra vez antes de hacerlo (borrar). Es el texto que se muestra entonces. */
  confirm?: string
  onSelect?: () => void
  /** Submenú (p. ej. a qué proyecto mover). */
  submenu?: Array<{ id: string; label: string; icon?: ReactNode; onSelect: () => void }>
  /** Texto si el submenú está vacío. */
  emptySubmenu?: string
}

export type MenuEntry = MenuAction | 'sep'

/** Dónde abrir el menú: el punto del clic derecho, o un botón (⋯) a cuya derecha se abre. */
export type MenuAt = { x: number; y: number }

/** Punto donde abrir el menú desde un evento de clic derecho o de un botón (teclado: junto al elemento). */
export function menuPoint(e: ReactMouseEvent<HTMLElement>): MenuAt {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY }
  const r = e.currentTarget.getBoundingClientRect()
  return { x: r.left + Math.min(40, r.width / 2), y: r.bottom }
}

/**
 * Menú propio del clic derecho (en vez del del navegador): elementos con icono y letra de atajo, separadores,
 * un submenú y confirmación para lo que borra. Se cierra con clic fuera, Escape, al desplazar o al cambiar el tamaño.
 */
export function ContextMenu({ at, items, label, onClose }: { at: MenuAt; items: MenuEntry[]; label: string; onClose: () => void }) {
  return createPortal(<Surface at={at} items={items} label={label} onClose={onClose} />, document.body)
}

function Surface({ at, items, label, onClose }: { at: MenuAt; items: MenuEntry[]; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ left: at.x, top: at.y, opacity: 0 })
  const [confirming, setConfirming] = useState<string | null>(null)
  const [sub, setSub] = useState<string | null>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  // Dentro de la ventana: si no cabe a la derecha o abajo, se abre hacia el otro lado.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = at.x + w + 8 > window.innerWidth ? Math.max(8, at.x - w) : at.x
    const top = at.y + h + 8 > window.innerHeight ? Math.max(8, window.innerHeight - h - 8) : at.y
    setStyle({ left, top })
    // Con el foco dentro, las flechas y las letras funcionan sin tocar el ratón (opacity 0 no impide enfocar).
    el.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus({ preventScroll: true })
  }, [at.x, at.y])

  useEffect(() => {
    const close = (): void => closeRef.current()
    const onDown = (e: PointerEvent): void => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      close()
    }
    const onScroll = (e: Event): void => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      close()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [])

  // La confirmación caduca si no se pulsa otra vez enseguida.
  useEffect(() => {
    if (!confirming) return
    const id = window.setTimeout(() => setConfirming(null), 4000)
    return () => window.clearTimeout(id)
  }, [confirming])

  function choose(a: MenuAction): void {
    if (a.disabled) return
    if (a.submenu) {
      setSub(a.id)
      return
    }
    if (a.confirm && confirming !== a.id) {
      setConfirming(a.id)
      return
    }
    onClose()
    a.onSelect?.()
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>): void {
    const el = ref.current
    if (!el) return
    const list = Array.from(el.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]:not([disabled])'))
    const i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (sub) setSub(null)
      else onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const subItems = sub ? Array.from(el.querySelectorAll<HTMLElement>('[data-sub] [role="menuitem"]')) : []
      const j = subItems.indexOf(document.activeElement as HTMLElement)
      if (j >= 0) {
        subItems[(j + (e.key === 'ArrowDown' ? 1 : subItems.length - 1)) % subItems.length]?.focus()
        return
      }
      list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1 + (i < 0 ? 1 : 0))) % list.length]?.focus()
    } else if (e.key === 'ArrowRight') {
      const a = items.find((x): x is MenuAction => x !== 'sep' && x.id === (document.activeElement as HTMLElement)?.dataset.id)
      if (a?.submenu) {
        e.preventDefault()
        setSub(a.id)
        window.setTimeout(() => el.querySelector<HTMLElement>('[data-sub] [role="menuitem"]')?.focus(), 0)
      }
    } else if (e.key === 'ArrowLeft' && sub) {
      e.preventDefault()
      el.querySelector<HTMLElement>(`[data-id="${sub}"]`)?.focus()
      setSub(null)
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const a = items.find((x): x is MenuAction => x !== 'sep' && !!x.shortcut && x.shortcut.toLowerCase() === e.key.toLowerCase())
      if (a) {
        e.preventDefault()
        choose(a)
        if (a.submenu) window.setTimeout(() => el.querySelector<HTMLElement>('[data-sub] [role="menuitem"]')?.focus(), 0)
      }
    }
  }

  return (
    <div
      ref={ref}
      className={s.menu}
      style={style}
      role="menu"
      aria-label={label}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if (it === 'sep') return <div key={`sep${i}`} className={s.sep} role="separator" />
        const confirmingThis = confirming === it.id
        return (
          <MenuButton key={it.id} it={it} confirming={confirmingThis} subOpen={sub === it.id} onChoose={() => choose(it)} onHover={() => setSub(it.submenu ? it.id : null)} />
        )
      })}
      {sub &&
        (() => {
          const a = items.find((x): x is MenuAction => x !== 'sep' && x.id === sub)
          if (!a?.submenu) return null
          return <Submenu parentId={a.id} menuRef={ref} items={a.submenu} empty={a.emptySubmenu} onClose={onClose} />
        })()}
    </div>
  )
}

function MenuButton({ it, confirming, subOpen, onChoose, onHover }: { it: MenuAction; confirming: boolean; subOpen: boolean; onChoose: () => void; onHover: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-id={it.id}
      className={cx(s.item, (it.danger || confirming) && s.danger, confirming && s.confirming)}
      disabled={it.disabled}
      title={it.title}
      aria-haspopup={it.submenu ? 'menu' : undefined}
      aria-expanded={it.submenu ? subOpen : undefined}
      onClick={onChoose}
      onPointerEnter={onHover}
    >
      <span className={s.icon} aria-hidden="true">
        {it.icon}
      </span>
      <span className={s.label}>{confirming && it.confirm ? it.confirm : it.label}</span>
      {it.submenu ? <ChevronRight size={14} aria-hidden="true" className={s.chev} /> : it.shortcut && <kbd className={s.key}>{it.shortcut.toUpperCase()}</kbd>}
    </button>
  )
}

function Submenu({
  parentId,
  menuRef,
  items,
  empty,
  onClose
}: {
  parentId: string
  menuRef: RefObject<HTMLDivElement | null>
  items: NonNullable<MenuAction['submenu']>
  empty?: string
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const menu = menuRef.current
    const parent = menu?.querySelector<HTMLElement>(`[data-id="${parentId}"]`)
    const el = ref.current
    if (!menu || !parent || !el) return
    const m = menu.getBoundingClientRect()
    const p = parent.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = m.right + w + 4 > window.innerWidth ? -w - 4 : m.width + 4
    const top = Math.min(p.top - m.top - 6, window.innerHeight - m.top - h - 8)
    setStyle({ left, top })
  }, [parentId, menuRef])
  return (
    <div ref={ref} className={cx(s.menu, s.sub)} style={style} role="menu" data-sub>
      {items.length === 0 ? (
        <p className={s.empty}>{empty}</p>
      ) : (
        items.map((x) => (
          <button
            key={x.id}
            type="button"
            role="menuitem"
            className={s.item}
            onClick={() => {
              onClose()
              x.onSelect()
            }}
          >
            <span className={s.icon} aria-hidden="true">
              {x.icon}
            </span>
            <span className={s.label}>{x.label}</span>
          </button>
        ))
      )}
    </div>
  )
}
