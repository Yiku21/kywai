import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Ban, Brain, CalendarClock, ClipboardList, MessageSquare, Package, Paperclip, type LucideIcon } from 'lucide-react'
import { useCowork, useData, type DataSlice, type LeftTab } from '@/store/cowork'
import { api } from '@/lib/api'
import { cx } from '../common/util'
import { ChatView } from './ChatView'
import { Composer } from './Composer'
import { FilesView } from './FilesView'
import { TasksView } from './TasksView'
import { ResultsView } from './ResultsView'
import { MemoryView } from './MemoryView'
import { RoutinesView } from './RoutinesView'
import { useComposer } from './composerStore'
import s from './LeftPanel.module.css'

const TABS: Array<{ id: LeftTab; label: string; Icon: LucideIcon }> = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'files', label: 'Archivos', Icon: Paperclip },
  { id: 'tasks', label: 'Tareas', Icon: ClipboardList },
  { id: 'results', label: 'Resultados', Icon: Package },
  { id: 'memory', label: 'Memoria', Icon: Brain },
  { id: 'routines', label: 'Rutinas', Icon: CalendarClock }
]

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

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

/** Panel izquierdo: Chat, Archivos, Tareas, Resultados, Memoria y Rutinas. Ocupa todo su contenedor. */
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

  const canAttach = !!api && mode === 'live'

  const badges: Partial<Record<LeftTab, { n: number; label: string }>> = {
    tasks: { n: running, label: running === 1 ? 'tarea en curso' : 'tareas en curso' },
    results: { n: artifactCount, label: artifactCount === 1 ? 'resultado' : 'resultados' },
    memory: { n: toReview, label: toReview === 1 ? 'nota por revisar' : 'notas por revisar' }
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
      aria-label="Conversación y trabajo del equipo"
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
        if (depth.current === 0) setDragging(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        const a = api
        if (!canAttach || !a) return
        const paths: string[] = []
        for (const f of Array.from(e.dataTransfer.files)) {
          try {
            const p = a.pathForFile(f)
            if (p) paths.push(p)
          } catch {
            /* archivo sin ruta (p. ej. arrastrado desde el navegador) */
          }
        }
        if (paths.length) {
          const c = useComposer.getState()
          c.addFiles(paths)
          c.requestFocus()
          setLeftTab('chat')
        }
      }}
    >
      <div className={s.tabs} role="tablist" aria-label="Secciones del panel" onKeyDown={onTabKey}>
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
                <span className={cx(s.badge, id === 'tasks' && s.badgeLive)} aria-hidden="true">
                  {badge.n}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div
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
        ) : tab === 'memory' ? (
          <MemoryView />
        ) : tab === 'routines' ? (
          <RoutinesView />
        ) : (
          <ResultsView />
        )}
      </div>

      {dragging && (
        <div className={cx(s.drop, !canAttach && s.dropDisabled)} aria-hidden="true">
          <div className={s.dropCard}>
            {canAttach ? <Paperclip size={22} /> : <Ban size={22} />}
            <span className={s.dropTitle}>{canAttach ? 'Suelta para adjuntar' : 'No se puede adjuntar aquí'}</span>
            <span className={s.dropText}>
              {canAttach
                ? 'Los archivos se añadirán a tu próximo mensaje'
                : mode === 'demo'
                  ? 'Adjuntar archivos está disponible en modo real'
                  : 'Sin motor de agentes: abre la app de escritorio'}
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
