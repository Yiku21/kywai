import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import {
  AppWindow,
  CalendarClock,
  Columns2,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  Folder,
  FolderInput,
  FolderOpen,
  GitBranch,
  History,
  ListChecks,
  ListFilter,
  MessageSquare,
  Package,
  PanelLeft,
  Pencil,
  Plus,
  Search,
  SquarePen,
  Star,
  SquareKanban,
  StarOff,
  Trash2,
  X
} from 'lucide-react'
import type { ConversationSummary, ProjectSummary, SidebarOrder } from '@shared/types'
import { useCowork, type LeftTab } from '@/store/cowork'
import { api } from '@/lib/api'
import { playSfx } from '@/lib/audio'
import { InboxButton } from '../header/InboxButton'
import { useFinished } from '../left/ResultsView'
import { HeaderMenu } from '../header/HeaderMenu'
import { ROLE_TITLE, useWhere } from '../header/useWhere'
import { useEscape, useMediaQuery } from '../common/hooks'
import { cx, errorText } from '../common/util'
import { TABS_QUERY } from '../left/chatWidth'
import { isSettingsKey, openSettings } from '../settings/SettingsDialog'
import { ContextMenu, menuPoint, type MenuAt, type MenuEntry } from './ContextMenu'
import { NEW_CHAT_KEYS, SEARCH_KEYS, SIDEBAR_DEFAULT, isNewChatKey, isSearchKey, readCollapsed, readSidebarWidth, saveCollapsed, saveSidebarWidth, shortDate } from './sidebarState'
import { SidebarResizer } from './SidebarResizer'
import { DragProvider, DragSlot, useDragged } from './DragSlot'
import { applyOrder, chatKey, placeKey, projectKey, type Dragged, type DropPlace } from './dragOrder'
import { groupByDate } from './historyGroups'
import {
  DEFAULT_FILTER,
  filterProjects,
  isDefaultFilter,
  previewChats,
  readProjectFilter,
  saveProjectFilter,
  sortItems,
  type ProjectFilter
} from './projectFilter'
import s from './Sidebar.module.css'
import { t } from '@/lib/i18n'
import { openChatWindow, type ChatRef } from '@/lib/chatPane'

const RECENT_LIMIT = 8

/**
 * Barra lateral (como la de Claude): conversación nueva, buscador, accesos (Te necesita, tareas, resultados,
 * rutinas), proyectos fijados, proyectos con sus conversaciones y las conversaciones recientes de todos; abajo,
 * dónde estás conectado y la rueda de Ajustes. Plegada queda en una columna de iconos. En ventanas estrechas (móvil,
 * tableta en vertical) esa columna de iconos se queda siempre a la izquierda, y la barra entera se abre por encima
 * del chat con su primer botón.
 */
export function Sidebar() {
  const narrow = useMediaQuery(TABS_QUERY)
  const drawerOpen = useCowork((st) => st.drawerOpen)
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed)
  // En ventana estrecha la barra siempre queda plegada en su columna de iconos; la entera sale como cajón.
  const rail = collapsed || narrow
  const [width, setWidth] = useState<number>(readSidebarWidth)
  const [resizing, setResizing] = useState(false)

  const onResize = useCallback((next: { width: number; rail: boolean }, done: boolean): void => {
    setResizing(!done)
    setWidth(next.width)
    setCollapsed(next.rail)
    if (!done) return
    saveCollapsed(next.rail)
    saveSidebarWidth(next.width === SIDEBAR_DEFAULT ? null : next.width)
  }, [])

  const closeDrawer = useCallback(() => useCowork.setState({ drawerOpen: false }), [])
  useEscape(narrow && drawerOpen, closeDrawer)

  // Atajos: Ctrl+K busca, Ctrl+Mayús+O empieza un chat nuevo y Ctrl+, abre los Ajustes (como en otras apps de chat).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isSearchKey(e)) {
        e.preventDefault()
        useCowork.setState((st) => ({ searchOpen: !st.searchOpen }))
      } else if (isNewChatKey(e)) {
        e.preventDefault()
        void startNewChat()
      } else if (isSettingsKey(e)) {
        e.preventDefault()
        openSettings(useCowork.getState().settingsTab ? null : 'general')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toggle(): void {
    if (narrow) return useCowork.setState({ drawerOpen: true })
    setCollapsed((c) => {
      saveCollapsed(!c)
      return !c
    })
  }

  const panel = (
    <nav
      className={cx(s.bar, rail && s.rail)}
      data-resizing={resizing || undefined}
      style={rail ? undefined : ({ '--side-w': `${width}px` } as CSSProperties)}
      aria-label={t('Barra lateral: conversaciones y proyectos')}
    >
      <div className={s.top}>
        <button
          type="button"
          className={s.iconBtn}
          onClick={toggle}
          aria-label={rail ? t('Abrir la barra lateral') : t('Plegar la barra lateral')}
          title={rail ? t('Abrir la barra lateral') : t('Plegar la barra lateral')}
        >
          <PanelLeft size={18} aria-hidden="true" />
        </button>
      </div>
      <DragProvider>
        <SidebarBody rail={rail} />
      </DragProvider>
      <Footer rail={rail} />
    </nav>
  )

  if (!narrow)
    return (
      <>
        {panel}
        <SidebarResizer width={width} rail={rail} onChange={onResize} />
      </>
    )
  if (!drawerOpen) return panel
  // Con la barra entera abierta encima, la columna de iconos se oculta (sin mover el chat) para no verse a través.
  return (
    <>
      <div style={{ display: 'contents', visibility: 'hidden' }}>{panel}</div>
      <div className={s.scrim} onPointerDown={(e) => e.target === e.currentTarget && closeDrawer()}>
        <nav className={cx(s.bar, s.drawer)} aria-label={t('Barra lateral: conversaciones y proyectos')}>
          <div className={s.top}>
            <button type="button" className={s.iconBtn} onClick={closeDrawer} aria-label={t('Cerrar la barra lateral')} title={t('Cerrar')}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <DragProvider>
            <SidebarBody rail={false} onNavigate={closeDrawer} />
          </DragProvider>
          <Footer rail={false} />
        </nav>
      </div>
    </>
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
  // «Terminado» sin ver: sale en Resultados como nuevo (no en «Te necesita»).
  const finished = useFinished()
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
  const [order, setOrder] = useState<SidebarOrder>({ projects: [], favorites: [], chats: {} })
  // Filtro de «Proyectos» (botón junto al título) y qué listas tienen abierto «Ver los X restantes».
  const [filter, setFilterState] = useState<ProjectFilter>(readProjectFilter)
  const [showMore, setShowMore] = useState<Record<string, boolean>>({})
  // Con «Agrupación: por fecha», los chats de todos los proyectos.
  const [allChats, setAllChats] = useState<ConversationSummary[]>([])
  const dragged = useDragged()
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
    // Servidor antiguo (cliente conectado a un kywai sin esto): sin orden guardado, todo por fecha.
    void a.getSidebarOrder?.().then((o) => alive && o && setOrder(o), () => undefined)
    if (filter.grouping === 'date') void a.allConversations().then((list) => alive && setAllChats(list), () => undefined)
    for (const id of openKey ? openKey.split(',') : []) {
      void a.listConversations(id).then(
        (list) => alive && setConvs((c) => ({ ...c, [id]: list })),
        () => undefined
      )
    }
    return () => {
      alive = false
    }
  }, [live, tick, openKey, conversation?.id, filter.grouping])

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

  // Clic en un proyecto: si es otro, lo abre y lo despliega. Si ya es el abierto, en la lista de Proyectos el clic
  // pliega o despliega sus conversaciones (como en Claude y en Órbita); en Favoritos solo lleva al chat.
  const openProject = (p: ProjectSummary, toggle = false): Promise<void> =>
    run(async () => {
      if (!api) return
      if (project?.id !== p.id) {
        useCowork.getState().loadProjectState(await api.loadProject(p.id))
        setExpanded((e) => ({ ...e, [p.id]: true }))
      } else if (toggle) setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))
      else setExpanded((e) => ({ ...e, [p.id]: true }))
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
    run,
    refresh: () => useCowork.setState((st) => ({ conversationsTick: st.conversationsTick + 1 })),
    go,
    togglePin: (p) => void togglePin(p)
  }

  const pinned = projects.filter((p) => p.pinned)
  const canNew = live && !!project

  // ---------- filtro de «Proyectos» ----------
  function setFilter(patch: Partial<ProjectFilter>): void {
    setFilterState((f) => {
      const next = { ...f, ...patch }
      saveProjectFilter(next)
      return next
    })
  }
  // Proyectos con algo terminado que aún no has visto (lo mismo que sale como nuevo en Resultados).
  const unseen = new Set(finished.map((i) => i.projectId).filter((id): id is string => !!id))
  const manualOrder = filter.sort === 'manual'

  // ---------- arrastrar (mantener el clic y mover) ----------
  // Proyectos y chats de cada proyecto en el orden que dejó el usuario (lo nuevo arriba, por fecha).
  const manualProjects = applyOrder(projects, (p) => p.id, order.projects)
  // Lo que se ve en «Proyectos»: con el orden y el estado del filtro.
  const orderedProjects = filterProjects(
    sortItems(projects, filter.sort, (p) => p.id, (p) => p.name, order.projects),
    filter.status,
    unseen
  )
  const chatsOf = (pid: string): ConversationSummary[] =>
    sortItems(
      // El chat vacío solo se enseña si es el que está abierto (si no, sale «Conversación nueva» de relleno).
      (convs[pid] ?? []).filter((c) => c.messageCount > 0 || (c.current && project?.id === pid && conversation?.id === c.id)),
      filter.sort,
      (c) => c.id,
      (c) => c.title,
      order.chats[pid]
    )
  const anyExpanded = orderedProjects.some((p) => expanded[p.id])

  /** Contraer todo (o, si ya está todo contraído, desplegar los proyectos que se ven). */
  function toggleAll(): void {
    if (anyExpanded) {
      setExpanded({})
      setShowMore({})
    } else setExpanded(Object.fromEntries(orderedProjects.map((p) => [p.id, true])))
  }

  /** Marca como visto todo lo terminado (lo que sale como nuevo en Resultados y con punto en los proyectos). */
  const markAllSeen = (): Promise<void> =>
    run(async () => {
      if (!api) return
      for (const i of finished) await api.actInbox(i.id, i.actions.find((a) => a.id === 'dismiss')?.id ?? i.actions[0]?.id ?? 'dismiss')
    })
  // Favoritos: proyectos y chats mezclados, en el orden que se dejaron al soltarlos.
  type Fav = { key: string; project?: ProjectSummary; conv?: ConversationSummary }
  const favs = applyOrder<Fav>(
    [...pinned.map((p) => ({ key: projectKey(p.id), project: p })), ...pinnedConvs.map((c) => ({ key: chatKey(c.projectId, c.id), conv: c }))],
    (f) => f.key,
    order.favorites
  )
  const keyOf = (d: Dragged): string => (d.kind === 'project' ? projectKey(d.id) : chatKey(d.projectId, d.id))

  function saveOrder(patch: Partial<SidebarOrder>): void {
    setOrder((o) => ({ ...o, ...patch, chats: { ...o.chats, ...(patch.chats ?? {}) } }))
    const a = api
    if (!a?.setSidebarOrder) return
    a.setSidebarOrder(patch).catch((e) => setError(errorText(e)))
  }

  /** Suelta en Favoritos (antes o después de `target`, o al final): si no estaba, se marca como favorito. */
  const dropOnFavorites = (d: Dragged, target: string | null, after: boolean): Promise<void> =>
    run(async () => {
      if (!api) return
      const key = keyOf(d)
      if (!favs.some((f) => f.key === key)) {
        if (d.kind === 'project') {
          await api.setProjectPinned(d.id, true)
          useCowork.getState().setProjects(await api.listProjects())
        } else {
          await api.setConversationPinned(d.projectId, d.id, true)
          actions.refresh()
        }
      }
      saveOrder({ favorites: placeKey(favs.map((f) => f.key), key, target, after) })
    })

  /** Pasa un chat a otro proyecto (y lo deja en el sitio donde se soltó, si fue entre sus chats). */
  const moveChat = (d: Extract<Dragged, { kind: 'chat' }>, toId: string, at?: { target: string; after: boolean }): Promise<void> =>
    run(async () => {
      if (!api) return
      const wasOpen = project?.id === d.projectId && conversation?.id === d.id
      const newId = await api.moveConversation(d.projectId, d.id, toId)
      const patch: Partial<SidebarOrder> = {}
      const oldKey = chatKey(d.projectId, d.id)
      if (order.favorites.includes(oldKey)) patch.favorites = order.favorites.map((k) => (k === oldKey ? chatKey(toId, newId) : k))
      if (at) patch.chats = { [toId]: placeKey(chatsOf(toId).map((c) => c.id), newId, at.target, at.after) }
      if (patch.favorites || patch.chats) saveOrder(patch)
      setExpanded((e) => ({ ...e, [toId]: true }))
      // Si era el chat abierto, se sigue en él, ya en su proyecto nuevo.
      if (wasOpen) {
        useCowork.getState().loadProjectState(await api.openConversation(toId, newId))
        go('chat')
      }
      actions.refresh()
    })

  const asChat = (c: ConversationSummary): Dragged | undefined =>
    c.messageCount > 0 ? { kind: 'chat', projectId: c.projectId, id: c.id, title: c.title, busy: c.busy } : undefined

  /** Fila de un proyecto en Proyectos: otro proyecto se pone antes o después; un chat de otro proyecto entra en él. */
  const projectAccepts =
    (p: ProjectSummary) =>
    (d: Dragged): DropPlace[] => {
      if (d.kind === 'project') return d.id === p.id || !manualOrder ? [] : ['before', 'after']
      return d.projectId === p.id || d.busy ? [] : ['into']
    }
  const dropOnProject = (p: ProjectSummary, d: Dragged, place: DropPlace): void => {
    if (d.kind === 'project') saveOrder({ projects: placeKey(manualProjects.map((x) => x.id), d.id, p.id, place === 'after') })
    else void moveChat(d, p.id)
  }

  /** Fila de un chat dentro de su proyecto: los chats se reordenan; uno de otro proyecto se mueve aquí. */
  const chatAccepts =
    (c: ConversationSummary) =>
    (d: Dragged): DropPlace[] => {
      if (d.kind !== 'chat' || (d.projectId === c.projectId && d.id === c.id)) return []
      // Con otro orden que el tuyo (fecha, nombre) los chats no se recolocan a mano.
      if (d.projectId === c.projectId && !manualOrder) return []
      return d.projectId !== c.projectId && d.busy ? [] : ['before', 'after']
    }
  const dropOnChat = (c: ConversationSummary, d: Dragged, place: DropPlace): void => {
    if (d.kind !== 'chat') return
    const after = place === 'after'
    if (d.projectId === c.projectId) saveOrder({ chats: { [c.projectId]: placeKey(chatsOf(c.projectId).map((x) => x.id), d.id, c.id, after) } })
    else void moveChat(d, c.projectId, { target: c.id, after })
  }

  const favAccepts = (key: string) => (d: Dragged): DropPlace[] => (keyOf(d) === key ? [] : ['before', 'after'])

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
      <NavItem
        icon={<History size={17} />}
        label={t('Historial')}
        rail={rail}
        disabled={!live}
        onClick={() => {
          useCowork.setState({ historyOpen: true })
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
      <NavItem icon={<SquareKanban size={17} />} label={t('Tablero')} rail={rail} active={leftTab === 'board'} onClick={() => go('board')} />
      <NavItem
        icon={<Package size={17} />}
        label={t('Resultados')}
        rail={rail}
        active={leftTab === 'results'}
        badge={finished.length || undefined}
        badgeTitle={finished.length === 1 ? t('1 terminado sin ver') : t('{n} terminados sin ver', { n: finished.length })}
        onClick={() => go('results')}
      />
      <NavItem icon={<CalendarClock size={17} />} label={t('Rutinas')} rail={rail} active={leftTab === 'routines'} onClick={() => go('routines')} />

      {error && !rail && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      {live && !rail && (
        <>
          {/* Favoritos: siempre a la vista (entre Rutinas y Proyectos); se llena arrastrando o con el clic derecho. */}
          <DragSlot slot="fav" accepts={(d) => (favs.some((f) => f.key === keyOf(d)) ? [] : ['into'])} onDrop={(d) => void dropOnFavorites(d, null, false)}>
            <Section title={t('Favoritos')} open={sections.pinned} onToggle={() => setSections((x) => ({ ...x, pinned: !x.pinned }))}>
              {favs.map((f) =>
                f.project ? (
                  <DragSlot
                    key={f.key}
                    slot={`fav:${f.key}`}
                    item={{ kind: 'project', id: f.project.id }}
                    accepts={favAccepts(f.key)}
                    onDrop={(d, place) => void dropOnFavorites(d, f.key, place === 'after')}
                  >
                    <ProjectRow p={f.project} current={project?.id === f.project.id} icon={<Folder size={15} />} onOpen={() => void openProject(f.project!)} actions={actions} />
                  </DragSlot>
                ) : f.conv ? (
                  <DragSlot
                    key={f.key}
                    slot={`fav:${f.key}`}
                    item={asChat(f.conv)}
                    accepts={favAccepts(f.key)}
                    onDrop={(d, place) => void dropOnFavorites(d, f.key, place === 'after')}
                  >
                    <ConversationRow
                      c={f.conv}
                      flat
                      meta={projects.find((p) => p.id === f.conv!.projectId)?.name ?? ''}
                      active={project?.id === f.conv.projectId && conversation?.id === f.conv.id}
                      onOpen={() => void openConversation(f.conv!)}
                      actions={actions}
                    />
                  </DragSlot>
                ) : null
              )}
              {favs.length === 0 && (
                <p className={cx(s.favEmpty, dragged && s.favEmptyActive)}>
                  <Star size={14} aria-hidden="true" />
                  {t('Arrastra aquí un chat o un proyecto (o clic derecho → Añadir a Favoritos)')}
                </p>
              )}
            </Section>
          </DragSlot>

          <Section
            title={t('Proyectos')}
            open={sections.projects}
            onToggle={() => setSections((x) => ({ ...x, projects: !x.projects }))}
            action={
              <>
                <ProjectFilterButton
                  filter={filter}
                  onChange={setFilter}
                  anyExpanded={anyExpanded}
                  onToggleAll={toggleAll}
                  unseenCount={finished.length}
                  onMarkAllSeen={() => void markAllSeen()}
                />
                <button type="button" className={s.sectionAction} onClick={() => setCreating((v) => !v)} aria-label={t('Nuevo proyecto')} title={t('Nuevo proyecto')}>
                  <Plus size={15} aria-hidden="true" />
                </button>
              </>
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
            {filter.grouping === 'date'
              ? groupByDate(
                  allChats.filter((c) => c.messageCount > 0 && orderedProjects.some((p) => p.id === c.projectId)),
                  Date.now()
                ).map((g) => {
                  const key = `d:${g.key}`
                  const { shown, hidden } = previewChats(g.items, filter.showAll || !!showMore[key], conversation?.id)
                  return (
                    <div key={key} className={s.dateGroup}>
                      <p className={s.dateLabel}>{g.label}</p>
                      {shown.map((c) => (
                        <DragSlot key={`${c.projectId}:${c.id}`} slot={`g:${c.projectId}:${c.id}`} item={asChat(c)}>
                          <ConversationRow
                            c={c}
                            flat
                            meta={projects.find((p) => p.id === c.projectId)?.name ?? ''}
                            active={project?.id === c.projectId && conversation?.id === c.id}
                            onOpen={() => void openConversation(c)}
                            actions={actions}
                          />
                        </DragSlot>
                      ))}
                      <MoreChats hidden={hidden} open={!!showMore[key]} all={filter.showAll} onToggle={() => setShowMore((m) => ({ ...m, [key]: !m[key] }))} />
                    </div>
                  )
                })
              : orderedProjects.map((p) => {
                  const isOpen = !!expanded[p.id]
                  const { shown, hidden } = previewChats(chatsOf(p.id), filter.showAll || !!showMore[p.id], project?.id === p.id ? conversation?.id : null)
                  return (
                    <div key={p.id}>
                      <DragSlot slot={`p:${p.id}`} item={{ kind: 'project', id: p.id }} accepts={projectAccepts(p)} onDrop={(d, place) => dropOnProject(p, d, place)}>
                        <ProjectRow
                          p={p}
                          current={project?.id === p.id}
                          icon={isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
                          unseen={unseen.has(p.id)}
                          expanded={isOpen}
                          onExpand={() => setExpanded((e) => ({ ...e, [p.id]: !isOpen }))}
                          onOpen={() => void openProject(p, true)}
                          actions={actions}
                        />
                      </DragSlot>
                      {isOpen && (
                        <div className={s.sub}>
                          {shown.map((c) => (
                            <DragSlot key={c.id} slot={`c:${p.id}:${c.id}`} item={asChat(c)} accepts={chatAccepts(c)} onDrop={(d, place) => dropOnChat(c, d, place)}>
                              <ConversationRow c={c} active={project?.id === p.id && conversation?.id === c.id} onOpen={() => void openConversation(c)} actions={actions} />
                            </DragSlot>
                          ))}
                          <MoreChats hidden={hidden} open={!!showMore[p.id]} all={filter.showAll} onToggle={() => setShowMore((m) => ({ ...m, [p.id]: !m[p.id] }))} />
                        </div>
                      )}
                    </div>
                  )
                })}
            {orderedProjects.length === 0 && projects.length > 0 && (
              <p className={s.filterEmpty}>
                {t('Ningún proyecto con este filtro.')}{' '}
                <button type="button" className={s.linkBtn} onClick={() => setFilter({ status: DEFAULT_FILTER.status })}>
                  {t('Quitar el filtro')}
                </button>
              </p>
            )}
          </Section>

          {recent.length > 0 && (
            <Section title={t('Recientes')} open={sections.recent} onToggle={() => setSections((x) => ({ ...x, recent: !x.recent }))}>
              {/* Recientes va siempre por fecha: desde aquí se arrastra, pero no se suelta. */}
              {recent.map((c) => (
                <DragSlot key={`${c.projectId}:${c.id}`} slot={`r:${c.projectId}:${c.id}`} item={asChat(c)}>
                  <ConversationRow
                    c={c}
                    flat
                    meta={projects.find((p) => p.id === c.projectId)?.name ?? ''}
                    active={project?.id === c.projectId && conversation?.id === c.id}
                    onOpen={() => void openConversation(c)}
                    actions={actions}
                  />
                </DragSlot>
              ))}
            </Section>
          )}
          {recent.length < 3 && (
            <button type="button" className={s.seeAll} onClick={() => useCowork.setState({ importOpen: true })}>
              {t('Traer conversaciones de otras apps…')}
            </button>
          )}
        </>
      )}
      {mode === 'demo' && !rail && <p className={s.hint}>{t('Modo demo: tus proyectos y conversaciones salen al volver a los datos reales.')}</p>}
    </div>
  )
}

/**
 * Fila bajo los 3 chats más recientes de un proyecto: «Ver los X restantes» los despliega y, abierta, «Ver menos»
 * los vuelve a esconder. Con «Mostrar todos los chats» en el filtro no sale.
 */
function MoreChats({ hidden, open, all, onToggle }: { hidden: number; open: boolean; all: boolean; onToggle: () => void }) {
  if (all || (!open && hidden === 0)) return null
  return (
    <button type="button" className={cx(s.item, s.convItem, s.moreChats)} onClick={onToggle} aria-expanded={open}>
      <Ellipsis size={14} aria-hidden="true" className={s.icon} />
      <span className={s.label}>{open ? t('Ver menos') : t('Ver los {n} restantes', { n: hidden })}</span>
    </button>
  )
}

/**
 * Botón de filtro junto a «Proyectos»: agrupación (por proyecto o por fecha), orden (el tuyo, lo más reciente o por
 * nombre), estado (trabajando, con resultados sin ver, de esta semana), mostrar todos los chats, restablecer,
 * contraer todo y marcar todo como visto. Con algo distinto de lo de siempre lleva un punto.
 */
function ProjectFilterButton({
  filter,
  onChange,
  anyExpanded,
  onToggleAll,
  unseenCount,
  onMarkAllSeen
}: {
  filter: ProjectFilter
  onChange: (patch: Partial<ProjectFilter>) => void
  anyExpanded: boolean
  onToggleAll: () => void
  unseenCount: number
  onMarkAllSeen: () => void
}) {
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const grouping = { project: t('Proyecto'), date: t('Fecha') }
  const sorts = { manual: t('Tu orden'), recent: t('Más recientes'), name: t('Nombre') }
  const statuses = { all: t('Todos'), busy: t('Trabajando ahora'), unseen: t('Con resultados sin ver'), week: t('Activos esta semana') }
  const items: MenuEntry[] = [
    {
      id: 'grouping',
      label: t('Agrupación'),
      value: grouping[filter.grouping],
      submenu: [
        { id: 'project', label: t('Por proyecto'), checked: filter.grouping === 'project', onSelect: () => onChange({ grouping: 'project' }) },
        { id: 'date', label: t('Por fecha (Hoy, Ayer…)'), checked: filter.grouping === 'date', onSelect: () => onChange({ grouping: 'date' }) }
      ]
    },
    {
      id: 'sort',
      label: t('Orden'),
      value: sorts[filter.sort],
      disabled: filter.grouping === 'date',
      title: filter.grouping === 'date' ? t('Por fecha ya va de lo más reciente a lo más antiguo') : undefined,
      submenu: [
        { id: 'manual', label: t('Tu orden (arrastrando)'), checked: filter.sort === 'manual', onSelect: () => onChange({ sort: 'manual' }) },
        { id: 'recent', label: t('Lo más reciente primero'), checked: filter.sort === 'recent', onSelect: () => onChange({ sort: 'recent' }) },
        { id: 'name', label: t('Por nombre (A-Z)'), checked: filter.sort === 'name', onSelect: () => onChange({ sort: 'name' }) }
      ]
    },
    {
      id: 'status',
      label: t('Estado'),
      value: statuses[filter.status],
      submenu: (Object.keys(statuses) as Array<ProjectFilter['status']>).map((k) => ({ id: k, label: statuses[k], checked: filter.status === k, onSelect: () => onChange({ status: k }) }))
    },
    {
      id: 'showAll',
      label: t('Mostrar todos los chats'),
      checked: filter.showAll,
      title: t('Sin «Ver los X restantes»: todos los chats de cada proyecto a la vista'),
      onSelect: () => onChange({ showAll: !filter.showAll })
    },
    {
      id: 'reset',
      label: t('Restablecer el filtro'),
      disabled: isDefaultFilter(filter),
      onSelect: () => onChange({ ...DEFAULT_FILTER })
    },
    'sep',
    {
      id: 'collapse',
      label: anyExpanded ? t('Contraer todo') : t('Desplegar todo'),
      icon: anyExpanded ? <ChevronRight size={15} /> : <ChevronDown size={15} />,
      disabled: filter.grouping === 'date',
      onSelect: onToggleAll
    },
    {
      id: 'seen',
      label: t('Marcar todo como visto'),
      icon: <Package size={15} />,
      disabled: unseenCount === 0,
      title: unseenCount ? t('Quita el aviso de nuevo a los {n} resultados terminados sin ver', { n: unseenCount }) : t('No hay nada terminado sin ver'),
      onSelect: onMarkAllSeen
    }
  ]
  const active = !isDefaultFilter(filter)
  return (
    <>
      <button
        type="button"
        className={cx(s.sectionAction, s.filterBtn, menu && s.filterBtnOpen)}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        aria-label={active ? t('Filtrar y ordenar los proyectos (hay un filtro puesto)') : t('Filtrar y ordenar los proyectos')}
        title={t('Filtrar y ordenar')}
        onClick={(e) => setMenu(menu ? null : belowButton(e))}
      >
        <ListFilter size={15} aria-hidden="true" />
        {active && <span className={s.filterDot} aria-hidden="true" />}
      </button>
      {menu && <ContextMenu at={menu} items={items} label={t('Filtrar y ordenar los proyectos')} onClose={() => setMenu(null)} />}
    </>
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
  unseen,
  expanded,
  onExpand,
  onOpen,
  actions
}: {
  p: ProjectSummary
  current: boolean
  icon: ReactNode
  /** Tiene resultados terminados que aún no has visto. */
  unseen?: boolean
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
      // Se puede aunque el equipo trabaje: la conversación que deja sigue en segundo plano.
      onSelect: () =>
        void run(async () => {
          if (!api) return
          useCowork.getState().loadProjectState(await api.newConversation(p.id))
          go('chat')
          window.dispatchEvent(new Event('cowork:focus-composer'))
        })
    },
    {
      id: 'pin',
      label: p.pinned ? t('Quitar de Favoritos') : t('Añadir a Favoritos'),
      icon: p.pinned ? <StarOff size={15} /> : <Star size={15} />,
      shortcut: 'P',
      onSelect: () => actions.togglePin(p)
    },
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
        {unseen && !p.busy && <span className={s.unseen} title={t('Tiene resultados sin ver')} />}
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
  /** En Favoritos y Recientes: fila normal con el nombre del proyecto a la derecha (no sangrada bajo su proyecto). */
  flat?: boolean
  meta?: string
  onOpen: () => void
  actions: RowActions
}) {
  const [menu, setMenu] = useState<MenuAt | null>(null)
  const [editing, setEditing] = useState(false)
  const narrow = useMediaQuery(TABS_QUERY)
  const { run, refresh, go } = actions
  // El equipo trabaja en esta conversación (abierta o en segundo plano): no se borra ni se mueve hasta que acabe.
  const busyHere = !!c.busy

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
  // Al lado o en otra ventana: una conversación guardada (con mensajes) o la abierta de su proyecto.
  const openable = !empty || !!c.current
  const chatRef: ChatRef = { projectId: c.projectId, conversationId: c.id, title }
  const items: MenuEntry[] = [
    {
      id: 'pin',
      label: c.pinned ? t('Quitar de Favoritos') : t('Añadir a Favoritos'),
      icon: c.pinned ? <StarOff size={15} /> : <Star size={15} />,
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
      id: 'side',
      label: t('Abrir al lado'),
      icon: <Columns2 size={15} />,
      shortcut: 'L',
      disabled: !openable || narrow,
      title: narrow ? t('Haz la ventana más ancha para tener dos chats a la vez') : t('También arrastrándolo a la derecha de la ventana'),
      onSelect: () => useCowork.getState().setSplitChat(chatRef)
    },
    {
      id: 'window',
      label: t('Abrir en ventana aparte'),
      icon: <AppWindow size={15} />,
      shortcut: 'V',
      disabled: !openable,
      title: t('También con clic con la rueda del ratón'),
      onSelect: () => openChatWindow(chatRef)
    },
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
          // Se abre la copia (si el equipo trabajaba en la que estaba abierta, sigue en segundo plano).
          useCowork.getState().loadProjectState(await api.openConversation(c.projectId, id))
          go('chat')
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
        // Clic con la rueda: el chat en una ventana aparte (sin el cursor de desplazamiento de la rueda).
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault()
        }}
        onAuxClick={(e) => {
          if (e.button !== 1 || !openable) return
          e.preventDefault()
          openChatWindow(chatRef)
        }}
        title={[title, meta, c.importedFrom ? t('Importada de {app}', { app: c.importedFrom }) : ''].filter(Boolean).join(' · ')}
        aria-current={active ? 'true' : undefined}
      >
        <MessageSquare size={flat ? 15 : 14} aria-hidden="true" className={s.icon} />
        <span className={s.label}>{title}</span>
        {c.busy && <span className={s.busy} title={t('El equipo está trabajando aquí')} />}
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
  // El nombre que le puso el usuario al ordenador manda sobre el de la red (y se ve al momento al cambiarlo).
  const custom = useCowork((st) => (st.mode === 'live' ? st.config.serverName : undefined))
  const host = custom || where?.host || ''
  const label = !api ? t('Sin motor de agentes') : where ? (host ? host : ROLE_TITLE[where.role]) : ''
  const hint = !api ? t('Demo') : mode === 'demo' ? t('Modo demo') : where ? ROLE_TITLE[where.role] : ''
  const canRename = !!api?.setServerName && mode === 'live' && !!where
  const [editing, setEditing] = useState(false)
  return (
    <div className={s.footer}>
      {!rail && (
        <div className={s.where} title={editing ? undefined : hint}>
          <span className={cx(s.dot, api && mode === 'live' && s.dotLive)} aria-hidden="true" />
          <span className={s.whereText}>
            {editing ? (
              <ServerNameField initial={custom || where?.host || ''} onDone={() => setEditing(false)} />
            ) : canRename ? (
              <button
                type="button"
                className={cx(s.whereName, s.whereRename)}
                onClick={() => setEditing(true)}
                title={t('Cambiar el nombre de este ordenador')}
                aria-label={t('Cambiar el nombre de este ordenador ({name})', { name: label || 'kywai' })}
              >
                {label || 'kywai'}
                <Pencil size={11} aria-hidden="true" className={s.whereEdit} />
              </button>
            ) : (
              <span className={s.whereName}>{label || 'kywai'}</span>
            )}
            {hint && !editing && <span className={s.whereHint}>{hint}</span>}
          </span>
        </div>
      )}
      <HeaderMenu sidebar={{ button: s.iconBtn }} />
    </div>
  )
}

/**
 * Campo para ponerle nombre al ordenador (abajo en la barra lateral): Intro guarda, Esc cancela y vacío vuelve al
 * nombre del equipo en la red. Se guarda en el servidor, así que se ve igual en el escritorio, la web y Órbita.
 */
function ServerNameField({ initial, onDone }: { initial: string; onDone: () => void }) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(e?: FormEvent): Promise<void> {
    e?.preventDefault()
    if (busy) return
    if (value.trim() === initial.trim()) return onDone()
    setBusy(true)
    try {
      await api?.setServerName?.(value)
      onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }
  return (
    <form onSubmit={(e) => void save(e)} className={s.whereForm}>
      <input
        className={s.whereInput}
        value={value}
        maxLength={40}
        autoFocus
        disabled={busy}
        placeholder={t('Nombre del ordenador')}
        aria-label={t('Nombre de este ordenador')}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onDone()
          }
        }}
      />
      {error && <span className={s.whereHint} role="alert">{error}</span>}
    </form>
  )
}
