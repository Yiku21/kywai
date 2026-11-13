import { useEffect, useId, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type RefObject } from 'react'
import { Ban, Brain, CalendarClock, ChevronLeft, ChevronRight, ClipboardList, KeyRound, MessageSquare, Package, Paperclip, Puzzle, SquareKanban, type LucideIcon } from 'lucide-react'
import { useCowork, useData, type DataSlice, type LeftTab } from '@/store/cowork'
import { api } from '@/lib/api'
import { cx } from '../common/util'
import { ChatView } from './ChatView'
import { Composer } from './Composer'
import { FilesView } from './FilesView'
import { TasksView } from './TasksView'
import { BoardView } from './BoardView'
import { ResultsView } from './ResultsView'
import { MemoryView } from './MemoryView'
import { RoutinesView } from './RoutinesView'
import { SecretsView } from './SecretsView'
import { ModsView, modPanels, useMods } from './ModsView'
import { useComposer } from './composerStore'
import { droppedPaths } from './dropFiles'
import s from './LeftPanel.module.css'
import { t } from '@/lib/i18n'
import { playGhost, useSwitchMotion } from '../common/motion'
import { calm, reducedMotion } from '@/lib/motion'

const BASE_TABS: Array<{ id: LeftTab; label: string; Icon: LucideIcon }> = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'files', label: t('Archivos'), Icon: Paperclip },
  { id: 'tasks', label: t('Tareas'), Icon: ClipboardList },
  { id: 'board', label: t('Tablero'), Icon: SquareKanban },
  { id: 'results', label: t('Resultados'), Icon: Package },
  { id: 'memory', label: t('Memoria'), Icon: Brain },
  { id: 'routines', label: t('Rutinas'), Icon: CalendarClock },
  { id: 'secrets', label: t('Secretos'), Icon: KeyRound }
]
/** Solo si algún mod encendido trae paneles. */
const MODS_TAB = { id: 'mods' as LeftTab, label: t('Mods'), Icon: Puzzle }

function countRunning(d: DataSlice): number {
  let n = 0
  for (const id in d.tasks) if (d.tasks[id].status === 'running') n++
  return n
}

/** Lo que anotaron los agentes y falta que confirmes. */
function countToReview(d: DataSlice): number {
  return d.memory.filter((e) => e.status === 'provisional').length
}

function countArtifacts(d: DataSlice): number {
  return Object.keys(d.artifacts).length
}

/**
 * Fila de pestañas que se ajusta al ancho del panel: si los nombres no caben, solo iconos (la pestaña abierta
 * conserva su nombre); si aun así no caben, se desplaza con la rueda (también la vertical) o con las flechas ‹ ›
 * que salen en los bordes, y la pestaña abierta siempre queda a la vista.
 */
/**
 * La rayita de la pestaña abierta se desliza de una a otra en vez de saltar (inercia y arco, habilidad
 * principios-ux-animacion). Es una sola pieza que se mueve con transform (sin animar el ancho): la primera vez se
 * coloca sin moverse; con «reducir movimiento» salta.
 */
function TabIndicator({ listRef, tab, compact }: { listRef: RefObject<HTMLDivElement | null>; tab: string; compact: boolean }) {
  const [box, setBox] = useState<{ x: number; w: number } | null>(null)
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const measure = (): void => {
      const active = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (!active) return setBox(null)
      setBox((prev) => (prev && prev.x === active.offsetLeft && prev.w === active.offsetWidth ? prev : { x: active.offsetLeft, w: active.offsetWidth }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    for (const el of list.querySelectorAll('[role="tab"]')) ro.observe(el)
    return () => ro.disconnect()
  }, [listRef, tab, compact])
  // Tras colocarse la primera vez, ya puede deslizarse.
  useEffect(() => {
    if (!box || ready) return
    const id = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(id)
  }, [box, ready])
  if (!box) return null
  const inner = Math.max(0, box.w - 16)
  return <span className={cx(s.indicator, ready && s.indicatorReady)} style={{ transform: `translateX(${box.x + 8}px) scaleX(${inner / 100})` }} aria-hidden="true" />
}

function useTabStrip(tab: string, count: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)
  const [edges, setEdges] = useState({ left: false, right: false })
  // Ancho que necesitan las pestañas con nombre, medido la última vez que se vieron enteras.
  const fullWidth = useRef(0)
  const compactRef = useRef(compact)
  compactRef.current = compact

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (): void => {
      const avail = el.clientWidth
      if (!compactRef.current) {
        fullWidth.current = el.scrollWidth
        if (el.scrollWidth > avail + 1) setCompact(true)
      } else if (fullWidth.current && fullWidth.current <= avail) {
        setCompact(false)
      }
      const max = el.scrollWidth - el.clientWidth
      setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    el.addEventListener('scroll', update, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener('scroll', update)
    }
  }, [compact, count])

  // Con los nombres cambiados (idioma, mods…) se vuelve a medir con ellos.
  useEffect(() => setCompact(false), [count])

  // La pestaña abierta, siempre a la vista.
  useEffect(() => {
    const el = ref.current
    const active = el?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!el || !active) return
    const a = active.offsetLeft - el.offsetLeft
    if (a < el.scrollLeft) el.scrollTo({ left: a - 8, behavior: 'smooth' })
    else if (a + active.offsetWidth > el.scrollLeft + el.clientWidth)
      el.scrollTo({ left: a + active.offsetWidth - el.clientWidth + 8, behavior: 'smooth' })
  }, [tab, compact])

  // La rueda vertical del ratón también la mueve de izquierda a derecha (si hay algo que mover).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const nudge = (dir: -1 | 1): void => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * Math.max(80, el.clientWidth * 0.6), behavior: 'smooth' })
  }

  return { ref, compact, edges, nudge }
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/** Panel izquierdo: Chat, Archivos, Tareas, Tablero, Resultados, Memoria, Rutinas y Secretos. Ocupa todo su contenedor. */
export function LeftPanel() {
  const tab = useCowork((st) => st.leftTab)
  const setLeftTab = useCowork((st) => st.setLeftTab)
  const mode = useCowork((st) => st.mode)
  const running = useData(countRunning)
  const artifactCount = useData(countArtifacts)
  const toReview = useData(countToReview)
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)
  const baseId = useId()
  const mods = useMods()
  const TABS = modPanels(mods).length ? [...BASE_TABS, MODS_TAB] : BASE_TABS
  const strip = useTabStrip(tab, TABS.length)
  const body = useRef<HTMLDivElement>(null)
  // La zona de soltar archivos no desaparece de golpe: si sueltas, se encoge hacia la caja de escribir (ahí van los
  // adjuntos); si te vas sin soltar, solo funde.
  const dropZone = useRef<HTMLDivElement>(null)
  const leaveDrop = (dropped: boolean): void => {
    const el = dropZone.current
    if (el && !reducedMotion()) playGhost(el, dropped && !calm() ? { y: Math.round(el.offsetHeight * 0.3), scale: 0.82 } : {})
    setDragging(false)
  }
  // Al cambiar de pestaña, el contenido nuevo llega desde el lado de la pestaña elegida (derecha si está más a la
  // derecha) y se asienta con muelle; el icono de la pestaña da un saltito. Al abrir la app no se mueve nada.
  useSwitchMotion(
    body,
    tab,
    TABS.map((x) => x.id),
    { iconOf: (id) => document.getElementById(`${baseId}-tab-${id}`)?.querySelector('svg') }
  )

  const canAttach = !!api && mode === 'live'

  const badges: Partial<Record<LeftTab, { n: number; label: string }>> = {
    tasks: { n: running, label: running === 1 ? t('tarea en curso') : t('tareas en curso') },
    results: { n: artifactCount, label: artifactCount === 1 ? t('resultado') : t('resultados') },
    memory: { n: toReview, label: toReview === 1 ? t('nota por revisar') : t('notas por revisar') }
  }

  function onTabKey(e: KeyboardEvent<HTMLDivElement>): void {
    const i = TABS.findIndex((t) => t.id === tab)
    let next = -1
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next < 0) return
    e.preventDefault()
    setLeftTab(TABS[next].id)
    document.getElementById(`${baseId}-tab-${TABS[next].id}`)?.focus()
  }

  return (
    <section
      className={s.panel}
      aria-label={t('Conversación y trabajo del equipo')}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current++
        setDragging(true)
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = canAttach ? 'copy' : 'none'
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) leaveDrop(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current = 0
        leaveDrop(canAttach)
        const a = api
        if (!canAttach || !a) return
        const dropped = Array.from(e.dataTransfer.files)
        if (!dropped.length) return
        void droppedPaths(a, dropped).then(({ paths, error }) => {
          const c = useComposer.getState()
          if (paths.length) c.addFiles(paths)
          c.setError(error)
          c.requestFocus()
          setLeftTab('chat')
        })
      }}
    >
      <div className={s.tabBar}>
      {strip.edges.left && (
        <button type="button" className={cx(s.tabScroll, s.tabScrollLeft)} tabIndex={-1} aria-hidden="true" onClick={() => strip.nudge(-1)}>
          <ChevronLeft size={16} />
        </button>
      )}
      <div ref={strip.ref} className={cx(s.tabs, s.tabsSliding, strip.compact && s.tabsCompact)} role="tablist" aria-label={t('Secciones del panel')} onKeyDown={onTabKey}>
        <TabIndicator listRef={strip.ref} tab={tab} compact={strip.compact} />
        {TABS.map(({ id, label, Icon }) => {
          const active = id === tab
          const badge = badges[id]
          const showBadge = !!badge && badge.n > 0
          return (
            <button
              key={id}
              id={`${baseId}-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${baseId}-panel`}
              aria-label={showBadge ? `${label}, ${badge.n} ${badge.label}` : label}
              title={label}
              tabIndex={active ? 0 : -1}
              className={cx(s.tab, active && s.tabActive)}
              onClick={() => setLeftTab(id)}
            >
              <Icon size={16} aria-hidden="true" className={s.tabIcon} />
              <span className={s.tabLabel}>{label}</span>
              {showBadge && (
                // Con otra cifra, la insignia da un saltito (key la vuelve a montar y su animación se repite).
                <span key={badge.n} className={cx(s.badge, id === 'tasks' && s.badgeLive)} aria-hidden="true">
                  {badge.n}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {strip.edges.right && (
        <button type="button" className={cx(s.tabScroll, s.tabScrollRight)} tabIndex={-1} aria-hidden="true" onClick={() => strip.nudge(1)}>
          <ChevronRight size={16} />
        </button>
      )}
      </div>

      <div
        ref={body}
        className={s.body}
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${tab}`}
      >
        {tab === 'chat' ? (
          <>
            <ChatView />
            <Composer />
          </>
        ) : tab === 'files' ? (
          <FilesView />
        ) : tab === 'tasks' ? (
          <TasksView />
        ) : tab === 'board' ? (
          <BoardView />
        ) : tab === 'memory' ? (
          <MemoryView />
        ) : tab === 'routines' ? (
          <RoutinesView />
        ) : tab === 'secrets' ? (
          <SecretsView />
        ) : tab === 'mods' ? (
          <ModsView />
        ) : (
          <ResultsView />
        )}
      </div>

      {dragging && (
        <div ref={dropZone} className={cx(s.drop, !canAttach && s.dropDisabled)} aria-hidden="true">
          <div className={s.dropCard}>
            {canAttach ? <Paperclip size={22} /> : <Ban size={22} />}
            <span className={s.dropTitle}>{canAttach ? t('Suelta para adjuntar') : t('No se puede adjuntar aquí')}</span>
            <span className={s.dropText}>
              {canAttach
                ? t('Los archivos se añadirán a tu próximo mensaje')
                : mode === 'demo'
                  ? t('Adjuntar archivos está disponible en modo real')
                  : t('Sin motor de agentes: abre la app de escritorio')}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
