import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  FolderInput,
  FolderOpen,
  GitBranch,
  ListChecks,
  MessageSquare,
  Package,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  SquarePen,
  Trash2,
  X
} from 'lucide-react'
import type { ConversationSummary, ProjectSummary } from '@shared/types'
import { useCowork, type LeftTab } from '@/store/cowork'
import { api } from '@/lib/api'
import { playSfx } from '@/lib/audio'
import { InboxButton } from '../header/InboxButton'
import { HeaderMenu } from '../header/HeaderMenu'
import { ROLE_TITLE, useWhere } from '../header/useWhere'
import { useEscape, useMediaQuery } from '../common/hooks'
import { cx, errorText } from '../common/util'
import { TABS_QUERY } from '../left/chatWidth'
import { ContextMenu, menuPoint, type MenuAt, type MenuEntry } from './ContextMenu'
import { NEW_CHAT_KEYS, SEARCH_KEYS, isNewChatKey, isSearchKey, readCollapsed, saveCollapsed, shortDate } from './sidebarState'
import s from './Sidebar.module.css'
import { t } from '@/lib/i18n'

const RECENT_LIMIT = 8

/**
 * Barra lateral (como la de Claude): conversación nueva, buscador, accesos (Te necesita, tareas, resultados,
 * rutinas), proyectos fijados, proyectos con sus conversaciones y las conversaciones recientes de todos; abajo,
 * dónde estás conectado y la rueda de Ajustes. Plegada queda en una columna de iconos. En ventanas estrechas se abre
 * por encima del chat con el botón de la cabecera.
 */
export function Sidebar() {
  const narrow = useMediaQuery(TABS_QUERY)
  const drawerOpen = useCowork((st) => st.drawerOpen)
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)
  const rail = collapsed && !narrow

  const closeDrawer = useCallback(() => useCowork.setState({ drawerOpen: false }), [])
  useEscape(narrow && drawerOpen, closeDrawer)

  // Atajos: Ctrl+K busca, Ctrl+Mayús+O empieza un chat nuevo (como en otras apps de chat).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isSearchKey(e)) {
        e.preventDefault()
        useCowork.setState((st) => ({ searchOpen: !st.searchOpen }))
      } else if (isNewChatKey(e)) {
        e.preventDefault()
        void startNewChat()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toggle(): void {
    if (narrow) return closeDrawer()
    setCollapsed((c) => {
      saveCollapsed(!c)
      return !c
    })
  }

  if (narrow && !drawerOpen) return null

  const panel = (
    <nav className={cx(s.bar, rail && s.rail, narrow && s.drawer)} aria-label={t('Barra lateral: conversaciones y proyectos')}>
      <div className={s.top}>
        <button
          type="button"
          className={s.iconBtn}
          onClick={toggle}
          aria-label={narrow ? t('Cerrar la barra lateral') : rail ? t('Abrir la barra lateral') : t('Plegar la barra lateral')}
          title={narrow ? t('Cerrar') : rail ? t('Abrir la barra lateral') : t('Plegar la barra lateral')}
        >
          {narrow ? <X size={18} aria-hidden="true" /> : <PanelLeft size={18} aria-hidden="true" />}
        </button>
      </div>
      <SidebarBody rail={rail} onNavigate={narrow ? closeDrawer : undefined} />
      <Footer rail={rail} />
    </nav>
  )

  if (!narrow) return panel
  return (
    <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && closeDrawer()}>
      {panel}
    </div>
  )
}

/** Conversación nueva en el proyecto abierto (lo mismo desde el botón, el atajo o «/nuevo» en el chat). */
async function startNewChat(): Promise<string | null> {
  const st = useCowork.getState()
  const a = api
  const project = st.live.project
  if (!a || st.mode !== 'live' || !project) return null
  try {
    st.loadProjectState(await a.newConversation(project.id))
    useCowork.setState({ leftTab: 'chat', drawerOpen: false })
    window.dispatchEvent(new Event('cowork:focus-composer'))
    return null
  } catch (e) {
    return errorText(e)
  }
}

function SidebarBody({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const mode = useCowork((st) => st.mode)
  const live = mode === 'live' && !!api
  const project = useCowork((st) => st.live.project)
  const conversation = useCowork((st) => st.live.conversation)
  const projects = useCowork((st) => st.projects)
  const tick = useCowork((st) => st.conversationsTick)
  const leftTab = useCowork((st) => st.leftTab)
  const running = useCowork((st) => {
    let n = 0
    for (const id in st.live.tasks) if (st.live.tasks[id].status === 'running') n++
    return n
  })
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<ConversationSummary[]>([])
  const [pinnedConvs, setPinnedConvs] = useState<ConversationSummary[]>([])
  const [convs, setConvs] = useState<Record<string, ConversationSummary[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [sections, setSections] = useState({ pinned: true, projects: true, recent: true })
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  // El proyecto abierto se despliega solo.
  useEffect(() => {
    if (project?.id) setExpanded((e) => (e[project.id] === undefined ? { ...e, [project.id]: true } : e))
  }, [project?.id])

  // Listas: proyectos, conversaciones de los desplegados y recientes. Se piden otra vez cuando algo cambia.
  const openIds = Object.keys(expanded).filter((id) => expanded[id])
  const openKey = openIds.join(',')
  useEffect(() => {
    const a = api
    if (!a || !live) return
    let alive = true
    void a.listProjects().then((list) => alive && useCowork.getState().setProjects(list), () => undefined)
    void a.recentConversations(RECENT_LIMIT).then((list) => alive && setRecent(list), () => undefined)
    void a.pinnedConversations().then((list) => alive && setPinnedConvs(list), () => undefined)
    for (const id of openKey ? openKey.split(',') : []) {
      void a.listConversations(id).then(
        (list) => alive && setConvs((c) => ({ ...c, [id]: list })),
        () => undefined
      )
    }
    return () => {
      alive = false
    }
  }, [live, tick, openKey, conversation?.id])

  const go = useCallback(
    (tab: LeftTab) => {
      useCowork.getState().setLeftTab(tab)
      onNavigate?.()
    },
    [onNavigate]
  )

  async function run(fn: () => Promise<void>): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const openProject = (p: ProjectSummary): Promise<void> =>
    run(async () => {
      if (!api) return
      if (project?.id !== p.id) useCowork.getState().loadProjectState(await api.loadProject(p.id))
      setExpanded((e) => ({ ...e, [p.id]: true }))
      go('chat')
    })

  const openConversation = (c: ConversationSummary): Promise<void> =>
    run(async () => {
      if (!api) return
      if (project?.id === c.projectId && conversation?.id === c.id) return go('chat')
      useCowork.getState().loadProjectState(await api.openConversation(c.projectId, c.id))
      go('chat')
    })

  async function newChat(): Promise<void> {
    setError(null)
    const err = await startNewChat()
    if (err) setError(err)
    else onNavigate?.()
  }

  async function createProject(e: FormEvent): Promise<void> {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    await run(async () => {
      if (!api) return
      const p = await api.createProject(name)
      playSfx('projectCreated')
      useCowork.getState().loadProjectState(await api.loadProject(p.id))
      useCowork.getState().setProjects(await api.listProjects())
      setCreating(false)
      setNewName('')
      go('chat')
    })
  }

  const togglePin = (p: ProjectSummary): Promise<void> =>
    run(async () => {
      if (!api) return
      await api.setProjectPinned(p.id, !p.pinned)
      useCowork.getState().setProjects(await api.listProjects())
    })

  /** Lo que se puede hacer con un proyecto o una conversación desde el clic derecho (o el botón ⋯). */
  const actions: RowActions = {
    projects,
    projectOpen: project?.id,
    run,
    refresh: () => useCowork.setState((st) => ({ conversationsTick: st.conversationsTick + 1 })),
    go,
    togglePin: (p) => void togglePin(p)
  }

  const pinned = projects.filter((p) => p.pinned)
  const canNew = live && !!project

  return (
    <div className={s.scroll}>
      <NavItem icon={<SquarePen size={17} />} label={t('Nuevo chat')} keys={NEW_CHAT_KEYS} rail={rail} disabled={!canNew} onClick={() => void newChat()} />
      <NavItem
        icon={<Search size={17} />}
        label={t('Buscar')}
        keys={SEARCH_KEYS}
        rail={rail}
        disabled={!live}
        onClick={() => {
          useCowork.setState({ searchOpen: true })
          onNavigate?.()
        }}
      />
      {live && <InboxButton sidebar={{ button: cx(s.item, s.inboxItem), label: s.label, badge: cx(s.badge, s.badgeWarn) }} />}
      <NavItem
        icon={<ListChecks size={17} />}
        label={t('Tareas')}
        rail={rail}
        active={leftTab === 'tasks'}
        badge={running || undefined}
        badgeTitle={running === 1 ? t('1 tarea en curso') : t('{n} tareas en curso', { n: running })}
        onClick={() => go('tasks')}
      />
      <NavItem icon={<Package size={17} />} label={t('Resultados')} rail={rail} active={leftTab === 'results'} onClick={() => go('results')} />
      <NavItem icon={<CalendarClock size={17} />} label={t('Rutinas')} rail={rail} active={leftTab === 'routines'} onClick={() => go('routines')} />

      {error && !rail && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      {live && !rail && (
        <>
          {(pinned.length > 0 || pinnedConvs.length > 0) && (
            <Section title={t('Fijados')} open={sections.pinned} onToggle={() => setSections((x) => ({ ...x, pinned: !x.pinned }))}>
              {pinned.map((p) => (
                <ProjectRow key={p.id} p={p} current={project?.id === p.id} icon={<Pin size={15} />} onOpen={() => void openProject(p)} actions={actions} />
              ))}
              {pinnedConvs.map((c) => (
                <ConversationRow
                  key={`${c.projectId}:${c.id}`}
                  c={c}
                  flat
                  meta={projects.find((p) => p.id === c.projectId)?.name ?? ''}
                  active={project?.id === c.projectId && conversation?.id === c.id}
                  onOpen={() => void openConversation(c)}
                  actions={actions}
                />
              ))}
            </Section>
          )}

          <Section
            title={t('Proyectos')}
            open={sections.projects}
            onToggle={() => setSections((x) => ({ ...x, projects: !x.projects }))}
            action={
              <button type="button" className={s.sectionAction} onClick={() => setCreating((v) => !v)} aria-label={t('Nuevo proyecto')} title={t('Nuevo proyecto')}>
                <Plus size={15} aria-hidden="true" />
              </button>
            }
          >
            {creating && (
              <form className={s.newProject} onSubmit={(e) => void createProject(e)}>
                <input
                  autoFocus
                  className={s.input}
                  value={newName}
                  placeholder={t('Nombre del proyecto')}
                  aria-label={t('Nombre del proyecto')}
                  maxLength={80}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                />
              </form>
            )}
            {projects.map((p) => {
              const isOpen = !!expanded[p.id]
              return (
                <div key={p.id}>
                  <ProjectRow
                    p={p}
                    current={project?.id === p.id}
                    icon={isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                    expanded={isOpen}
                    onExpand={() => setExpanded((e) => ({ ...e, [p.id]: !isOpen }))}
                    onOpen={() => void openProject(p)}
                    actions={actions}
                  />
                  {isOpen && (
                    <div className={s.sub}>
                      {(convs[p.id] ?? [])
                        .filter((c) => c.messageCount > 0 || c.current)
                        .map((c) => (
                          <ConversationRow
                            key={c.id}
                            c={c}
                            active={project?.id === p.id && conversation?.id === c.id}
                            onOpen={() => void openConversation(c)}
                            actions={actions}
                          />
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          </Section>

          {recent.length > 0 && (
            <Section title={t('Recientes')} open={sections.recent} onToggle={() => setSections((x) => ({ ...x, recent: !x.recent }))}>
              {recent.map((c) => (
                <ConversationRow
                  key={`${c.projectId}:${c.id}`}
                  c={c}
                  flat
                  meta={projects.find((p) => p.id === c.projectId)?.name ?? ''}
                  active={project?.id === c.projectId && conversation?.id === c.id}
                  onOpen={() => void openConversation(c)}
                  actions={actions}
                />
              ))}
            </Section>
          )}
        </>
      )}
      {mode === 'demo' && !rail && <p className={s.hint}>{t('Modo demo: tus proyectos y conversaciones salen al volver a los datos reales.')}</p>}
    </div>
  )
}

function NavItem({
  icon,
  label,
  keys,
  badge,
  badgeTitle,
  rail,
  active,
  disabled,
  onClick
}: {
  icon: ReactNode
  label: string
  keys?: string
  badge?: number
  badgeTitle?: string
  rail: boolean
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cx(s.item, active && s.active)}
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      title={rail ? (keys ? `${label} (${keys})` : label) : undefined}
      aria-label={rail ? label : undefined}
    >
      <span className={s.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={s.label}>{label}</span>
      {keys && <kbd className={s.kbd}>{keys}</kbd>}
      {badge ? (
        <span className={s.badge} title={badgeTitle}>
          {badge > 9 ? '9+' : badge}
        </span>
      ) : null}
    </button>
  )
}

function Section({ title, open, onToggle, action, children }: { title: string; open: boolean; onToggle: () => void; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <button type="button" className={s.sectionTitle} onClick={onToggle} aria-expanded={open}>
          {title}
          <ChevronDown size={13} aria-hidden="true" className={cx(s.chev, !open && s.chevClosed)} />
        </button>
        {action}
      </div>
      {open && children}
    </section>
  )
}

interface RowActions {
  projects: ProjectSummary[]
  /** Proyecto abierto ahora. */
  projectOpen?: string
  run: (fn: () => Promise<void>) => Promise<void>
  refresh: () => void
  go: (tab: LeftTab) => void
  togglePin: (p: ProjectSummary) => void
}

/** Punto donde abrir el menú desde el botón ⋯: bajo el botón, alineado a su izquierda. */
function belowButton(e: React.MouseEvent<HTMLElement>): MenuAt {
  const r = e.currentTarget.getBoundingClientRect()
  return { x: r.left, y: r.bottom + 4 }
}

/** Campo para cambiar un nombre en la propia fila: Intro o salir del campo guarda, Escape lo deja como estaba. */
function RenameField({ initial, label, onSave, onCancel }: { initial: string; label: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial)
  const done = useRef(false)
  const finish = (save: boolean): void => {
    if (done.current) return
    done.current = true
    const name = draft.replace(/\s+/g, ' ').trim()
    if (save && name && name !== initial) onSave(name)
    else onCancel()
  }
  return (
    <div className={s.row}>
      <input
        autoFocus
        className={s.input}
        value={draft}
        maxLength={80}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(true)
          if (e.key === 'Escape') {
            e.stopPropagation()
            finish(false)
          }
        }}
      />
    </div>
  )
}

function ProjectRow({
  p,
  current,
  icon,
  expanded,
  onExpand,
  onOpen,
  actions
}: {
  p: ProjectSummary
  current: boolean
  icon: ReactNode
  expanded?: boolean
  onExpand?: () => void
  onOpen: () => void
  actions: RowActions
}) {
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const [editing, setEditing] = useState(false)
  const { run, go } = actions

  if (editing) {
    return (
      <RenameField
        initial={p.name}
        label={t('Nombre del proyecto')}
        onCancel={() => setEditing(false)}
        onSave={(name) => {
          setEditing(false)
          void run(async () => {
            if (!api) return
            const updated = await api.renameProject(p.id, name)
            useCowork.getState().setProjects(useCowork.getState().projects.map((x) => (x.id === updated.id ? updated : x)))
            if (useCowork.getState().live.project?.id === updated.id) useCowork.setState((st) => ({ live: { ...st.live, project: updated } }))
          })
        }}
      />
    )
  }

  const items: MenuEntry[] = [
    {
      id: 'new',
      label: t('Nuevo chat en este proyecto'),
      icon: <SquarePen size={15} />,
      shortcut: 'N',
      disabled: p.busy && actions.projectOpen === p.id,
      title: p.busy ? t('El equipo está trabajando aquí: espera a que termine o detenlo') : undefined,
      onSelect: () =>
        void run(async () => {
          if (!api) return
          useCowork.getState().loadProjectState(await api.newConversation(p.id))
          go('chat')
          window.dispatchEvent(new Event('cowork:focus-composer'))
        })
    },
    { id: 'pin', label: p.pinned ? t('Soltar de Fijados') : t('Fijar'), icon: p.pinned ? <PinOff size={15} /> : <Pin size={15} />, shortcut: 'P', onSelect: () => actions.togglePin(p) },
    { id: 'rename', label: t('Cambiar nombre'), icon: <Pencil size={15} />, shortcut: 'R', onSelect: () => setEditing(true) },
    {
      id: 'folder',
      label: t('Abrir carpeta del proyecto'),
      icon: <FolderOpen size={15} />,
      shortcut: 'O',
      onSelect: () => void api?.openPath(p.id).catch(() => undefined)
    },
    'sep',
    {
      id: 'delete',
      label: t('Eliminar proyecto'),
      icon: <Trash2 size={15} />,
      shortcut: 'D',
      danger: true,
      disabled: p.busy,
      title: p.busy ? t('El equipo está trabajando aquí: espera a que termine o detenlo') : t('Todo lo suyo va a la Papelera'),
      confirm: t('Pulsa otra vez: va a la Papelera'),
      onSelect: () =>
        void run(async () => {
          if (!api) return
          useCowork.getState().setProjects(await api.deleteProject(p.id))
        })
    }
  ]

  return (
    <div className={cx(s.row, current && s.rowCurrent, menu && s.rowMenu)} onContextMenu={(e) => (e.preventDefault(), setMenu(menuPoint(e)))}>
      <button type="button" className={s.item} onClick={onOpen} title={p.name}>
        <span className={s.icon} aria-hidden="true">
          {icon}
        </span>
        <span className={s.label}>{p.name}</span>
        {p.busy && <span className={s.busy} title={t('El equipo está trabajando aquí')} />}
      </button>
      <span className={s.rowActions}>
        <button
          type="button"
          className={s.mini}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          aria-label={t('Más opciones')}
          title={t('Más opciones')}
          onClick={(e) => setMenu(belowButton(e))}
        >
          <Ellipsis size={14} aria-hidden="true" />
        </button>
        {onExpand && (
          <button type="button" className={s.mini} onClick={onExpand} aria-expanded={expanded} aria-label={expanded ? t('Ocultar sus conversaciones') : t('Ver sus conversaciones')}>
            {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          </button>
        )}
      </span>
      {menu && <ContextMenu at={menu} items={items} label={p.name} onClose={() => setMenu(null)} />}
    </div>
  )
}

function ConversationRow({
  c,
  active,
  flat,
  meta,
  onOpen,
  actions
}: {
  c: ConversationSummary
  active: boolean
  /** En Fijados y Recientes: fila normal con el nombre del proyecto a la derecha (no sangrada bajo su proyecto). */
  flat?: boolean
  meta?: string
  onOpen: () => void
  actions: RowActions
}) {
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const [editing, setEditing] = useState(false)
  const { run, refresh, go } = actions
  const project = actions.projects.find((p) => p.id === c.projectId)
  const busyHere = !!project?.busy && c.current

  if (editing) {
    return (
      <RenameField
        initial={c.title}
        label={t('Nombre de la conversación')}
        onCancel={() => setEditing(false)}
        onSave={(title) => {
          setEditing(false)
          void run(async () => {
            if (!api) return
            await api.renameConversation(c.projectId, c.id, title)
            refresh()
          })
        }}
      />
    )
  }

  const empty = c.messageCount === 0
  const title = empty ? t('Conversación nueva') : c.title
  const busyTitle = t('El equipo está trabajando en esta conversación: espera a que termine o detenlo')
  const items: MenuEntry[] = [
    {
      id: 'pin',
      label: c.pinned ? t('Soltar de Fijados') : t('Fijar'),
      icon: c.pinned ? <PinOff size={15} /> : <Pin size={15} />,
      shortcut: 'P',
      disabled: empty,
      onSelect: () =>
        void run(async () => {
          if (!api) return
          await api.setConversationPinned(c.projectId, c.id, !c.pinned)
          refresh()
        })
    },
    { id: 'rename', label: t('Cambiar nombre'), icon: <Pencil size={15} />, shortcut: 'R', disabled: empty, onSelect: () => setEditing(true) },
    {
      id: 'fork',
      label: t('Bifurcar'),
      icon: <GitBranch size={15} />,
      shortcut: 'F',
      disabled: empty,
      title: t('Copia aparte para seguir por otro camino sin tocar esta'),
      onSelect: () =>
        void run(async () => {
          if (!api) return
          const id = await api.forkConversation(c.projectId, c.id)
          refresh()
          // Se abre la copia si se puede (no mientras el equipo trabaja en ese proyecto: queda en la lista).
          if (!project?.busy) {
            useCowork.getState().loadProjectState(await api.openConversation(c.projectId, id))
            go('chat')
          }
        })
    },
    {
      id: 'move',
      label: t('Mover a otro proyecto'),
      icon: <FolderInput size={15} />,
      shortcut: 'M',
      disabled: empty || busyHere,
      title: busyHere ? busyTitle : undefined,
      emptySubmenu: t('No hay otros proyectos'),
      submenu: actions.projects
        .filter((p) => p.id !== c.projectId)
        .map((p) => ({
          id: p.id,
          label: p.name,
          icon: <Folder size={15} />,
          onSelect: () =>
            void run(async () => {
              if (!api) return
              await api.moveConversation(c.projectId, c.id, p.id)
              refresh()
            })
        }))
    },
    'sep',
    {
      id: 'delete',
      label: t('Eliminar'),
      icon: <Trash2 size={15} />,
      shortcut: 'D',
      danger: true,
      disabled: empty || busyHere,
      title: busyHere ? busyTitle : undefined,
      confirm: t('Pulsa otra vez para eliminarla'),
      onSelect: () =>
        void run(async () => {
          if (!api) return
          // La abierta no se borra directamente: antes se empieza una nueva en su proyecto.
          if (c.current) {
            const st = await api.newConversation(c.projectId)
            if (useCowork.getState().live.project?.id === c.projectId) useCowork.getState().loadProjectState(st)
          }
          await api.deleteConversation(c.projectId, c.id)
          refresh()
        })
    }
  ]

  return (
    <div className={cx(s.row, active && s.rowCurrent, menu && s.rowMenu)} onContextMenu={(e) => (e.preventDefault(), !empty && setMenu(menuPoint(e)))}>
      <button
        type="button"
        className={cx(s.item, !flat && s.convItem, active && s.active)}
        onClick={onOpen}
        title={meta ? `${title} · ${meta}` : title}
        aria-current={active ? 'true' : undefined}
      >
        <MessageSquare size={flat ? 15 : 14} aria-hidden="true" className={s.icon} />
        <span className={s.label}>{title}</span>
        <span className={s.meta}>{meta ?? shortDate(c.updatedAt)}</span>
      </button>
      {!empty && (
        <span className={s.rowActions}>
          <button
            type="button"
            className={s.mini}
            aria-haspopup="menu"
            aria-expanded={!!menu}
            aria-label={t('Más opciones')}
            title={t('Más opciones')}
            onClick={(e) => setMenu(belowButton(e))}
          >
            <Ellipsis size={14} aria-hidden="true" />
          </button>
        </span>
      )}
      {menu && <ContextMenu at={menu} items={items} label={title} onClose={() => setMenu(null)} />}
    </div>
  )
}

function Footer({ rail }: { rail: boolean }) {
  const where = useWhere()
  const mode = useCowork((st) => st.mode)
  const label = !api ? t('Sin motor de agentes') : where ? (where.host ? where.host : ROLE_TITLE[where.role]) : ''
  const hint = !api ? t('Demo') : mode === 'demo' ? t('Modo demo') : where ? ROLE_TITLE[where.role] : ''
  return (
    <div className={s.footer}>
      {!rail && (
        <div className={s.where} title={hint}>
          <span className={cx(s.dot, api && mode === 'live' && s.dotLive)} aria-hidden="true" />
          <span className={s.whereText}>
            <span className={s.whereName}>{label || 'AI Cowork'}</span>
            {hint && <span className={s.whereHint}>{hint}</span>}
          </span>
        </div>
      )}
      <HeaderMenu sidebar={{ button: s.iconBtn }} />
    </div>
  )
}
