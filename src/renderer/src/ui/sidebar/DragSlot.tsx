import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../common/util'
import { dropPlace, type DropPlace, type Dragged } from './dragOrder'
import s from './Sidebar.module.css'

/**
 * Arrastrar en la barra lateral (mantener el clic y mover): chats y proyectos se reordenan, un chat soltado sobre
 * un proyecto se mueve allí y lo que cae en Favoritos se queda fijado. Cada fila va dentro de un DragSlot: puede ser
 * lo que se arrastra (`item`), un sitio donde soltar (`accepts` + `onDrop`) o las dos cosas.
 */

/** Tipo propio en el portapapeles del arrastre: así el chat no lo toma por archivos ni por texto que pegar. */
export const DRAG_TYPE = 'application/x-kywai-sidebar'
/** Un chat arrastrado fuera de la barra: { projectId, conversationId, title } (lo lee la zona de soltar del Espacio). */
export const CHAT_DRAG_TYPE = 'application/x-kywai-chat'

interface DragState {
  dragged: Dragged | null
  over: { slot: string; place: DropPlace } | null
}

interface DragApi extends DragState {
  current: () => Dragged | null
  start: (d: Dragged) => void
  setOver: (o: DragState['over']) => void
  end: () => void
}

const Ctx = createContext<DragApi | null>(null)

export function DragProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DragState>({ dragged: null, over: null })
  const ref = useRef<Dragged | null>(null)
  const api = useMemo<DragApi>(
    () => ({
      ...state,
      current: () => ref.current,
      start: (d) => {
        ref.current = d
        setState({ dragged: d, over: null })
      },
      setOver: (over) => setState((st) => (st.over?.slot === over?.slot && st.over?.place === over?.place ? st : { ...st, over })),
      end: () => {
        ref.current = null
        setState({ dragged: null, over: null })
      }
    }),
    [state]
  )
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

/** Lo que se está arrastrando ahora (null si nada). */
export function useDragged(): Dragged | null {
  return useContext(Ctx)?.dragged ?? null
}

const sameItem = (a: Dragged | null, b: Dragged | undefined): boolean =>
  !!a && !!b && a.kind === b.kind && a.id === b.id && (a.kind === 'project' || (b.kind === 'chat' && a.projectId === b.projectId))

export function DragSlot({
  slot,
  item,
  accepts,
  onDrop,
  className,
  children
}: {
  /** Nombre único del sitio (para pintar la raya de dónde caerá). */
  slot: string
  /** Lo que se arrastra desde aquí (sin él la fila no se puede arrastrar). */
  item?: Dragged
  /** Dónde puede caer lo arrastrado: antes, después o dentro (vacío: aquí no). */
  accepts?: (d: Dragged) => DropPlace[]
  onDrop?: (d: Dragged, place: DropPlace) => void
  className?: string
  children: ReactNode
}) {
  const dnd = useContext(Ctx)
  if (!dnd) return <>{children}</>
  const here = dnd.over?.slot === slot ? dnd.over.place : null

  const placeFor = (e: React.DragEvent<HTMLDivElement>): DropPlace | null => {
    const d = dnd.current()
    if (!d || !accepts) return null
    const ok = accepts(d)
    if (!ok.length) return null
    if (ok.length === 1 && ok[0] === 'into') return 'into'
    const r = e.currentTarget.getBoundingClientRect()
    const place = dropPlace(e.clientY - r.top, r.height, ok.includes('into'))
    return ok.includes(place) ? place : null
  }

  // Al entrar y mientras se mueve por encima: dónde caería (raya antes/después o recuadro dentro).
  const over = (e: React.DragEvent<HTMLDivElement>): void => {
    const place = placeFor(e)
    if (!place) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    dnd.setOver({ slot, place })
  }

  return (
    <div
      className={cx(
        s.dragSlot,
        className,
        sameItem(dnd.dragged, item) && s.dragSource,
        here === 'before' && s.dropBefore,
        here === 'after' && s.dropAfter,
        here === 'into' && s.dropInto
      )}
      draggable={!!item}
      onDragStart={(e) => {
        if (!item) return
        // Dentro de un DragSlot que se arrastra puede haber otro: manda el de más dentro.
        e.stopPropagation()
        // copyMove: fuera de la barra (en el Espacio, a la derecha) un chat soltado se abre en vista dividida.
        e.dataTransfer.effectAllowed = 'copyMove'
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item))
        if (item.kind === 'chat') {
          e.dataTransfer.setData(CHAT_DRAG_TYPE, JSON.stringify({ projectId: item.projectId, conversationId: item.id, title: item.title ?? '' }))
        }
        dnd.start(item)
      }}
      onDragEnd={() => dnd.end()}
      onDragEnter={over}
      onDragOver={over}
      onDragLeave={(e) => {
        if (here && !e.currentTarget.contains(e.relatedTarget as Node | null)) dnd.setOver(null)
      }}
      onDrop={(e) => {
        const place = placeFor(e)
        const d = dnd.current()
        if (!place || !d) return
        e.preventDefault()
        e.stopPropagation()
        dnd.end()
        onDrop?.(d, place)
      }}
    >
      {children}
    </div>
  )
}
