import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
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
          {pinned.length > 0 && (
            <Section title={t('Fijados')} open={sections.pinned} onToggle={() => setSections((x) => ({ ...x, pinned: !x.pinned }))}>
              {pinned.map((p) => (
                <ProjectRow key={p.id} p={p} current={project?.id === p.id} icon={<Pin size={15} />} onOpen={() => void openProject(p)} onPin={() => void togglePin(p)} />
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
                    onPin={() => void togglePin(p)}
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
                            onChanged={(list) => setConvs((x) => ({ ...x, [p.id]: list }))}
                            onError={setError}
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
                <button
                  key={`${c.projectId}:${c.id}`}
                  type="button"
                  className={cx(s.item, project?.id === c.projectId && conversation?.id === c.id && s.active)}
                  onClick={() => void openConversation(c)}
                  title={`${c.title} · ${projects.find((p) => p.id === c.projectId)?.name ?? ''}`}
                >
                  <MessageSquare size={15} aria-hidden="true" className={s.icon} />
                  <span className={s.label}>{c.title}</span>
                  <span className={s.meta}>{projects.find((p) => p.id === c.projectId)?.name ?? ''}</span>
                </button>
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

function ProjectRow({
  p,
  current,
  icon,
  expanded,
  onExpand,
  onOpen,
  onPin
}: {
  p: ProjectSummary
  current: boolean
  icon: ReactNode
  expanded?: boolean
  onExpand?: () => void
  onOpen: () => void
  onPin: () => void
}) {
  return (
    <div className={cx(s.row, current && s.rowCurrent)}>
      <button type="button" className={s.item} onClick={onOpen} title={p.name}>
        <span className={s.icon} aria-hidden="true">
          {icon}
        </span>
        <span className={s.label}>{p.name}</span>
        {p.busy && <span className={s.busy} title={t('El equipo está trabajando aquí')} />}
      </button>
      <span className={s.rowActions}>
        <button type="button" className={s.mini} onClick={onPin} aria-label={p.pinned ? t('Soltar de Fijados') : t('Fijar arriba')} title={p.pinned ? t('Soltar de Fijados') : t('Fijar arriba')}>
          {p.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
        </button>
        {onExpand && (
          <button type="button" className={s.mini} onClick={onExpand} aria-expanded={expanded} aria-label={expanded ? t('Ocultar sus conversaciones') : t('Ver sus conversaciones')}>
            {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          </button>
        )}
      </span>
    </div>
  )
}

function ConversationRow({
  c,
  active,
  onOpen,
  onChanged,
  onError
}: {
  c: ConversationSummary
  active: boolean
  onOpen: () => void
  onChanged: (list: ConversationSummary[]) => void
  onError: (msg: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(c.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const done = useRef(false)

  useEffect(() => {
    if (!confirmDelete) return
    const id = window.setTimeout(() => setConfirmDelete(false), 4000)
    return () => window.clearTimeout(id)
  }, [confirmDelete])

  async function rename(): Promise<void> {
    if (done.current) return
    done.current = true
    setEditing(false)
    const title = draft.replace(/\s+/g, ' ').trim()
    if (!api || !title || title === c.title) return
    try {
      onChanged(await api.renameConversation(c.projectId, c.id, title))
    } catch (e) {
      onError(errorText(e))
    }
  }

  async function remove(): Promise<void> {
    if (!api) return
    if (!confirmDelete) return setConfirmDelete(true)
    try {
      onChanged(await api.deleteConversation(c.projectId, c.id))
    } catch (e) {
      onError(errorText(e))
    }
  }

  if (editing) {
    return (
      <div className={s.row}>
        <input
          autoFocus
          className={s.input}
          value={draft}
          maxLength={80}
          aria-label={t('Nombre de la conversación')}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void rename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void rename()
            if (e.key === 'Escape') {
              done.current = true
              setEditing(false)
            }
          }}
        />
      </div>
    )
  }

  const title = c.messageCount === 0 ? t('Conversación nueva') : c.title
  return (
    <div className={cx(s.row, active && s.rowCurrent)}>
      <button type="button" className={cx(s.item, s.convItem, active && s.active)} onClick={onOpen} title={title} aria-current={active ? 'true' : undefined}>
        <MessageSquare size={14} aria-hidden="true" className={s.icon} />
        <span className={s.label}>{title}</span>
        <span className={s.meta}>{shortDate(c.updatedAt)}</span>
      </button>
      {c.messageCount > 0 && (
        <span className={s.rowActions}>
          <button
            type="button"
            className={s.mini}
            aria-label={t('Cambiar el nombre')}
            title={t('Cambiar el nombre')}
            onClick={() => {
              done.current = false
              setDraft(c.title)
              setEditing(true)
            }}
          >
            <Pencil size={13} aria-hidden="true" />
          </button>
          {!c.current && (
            <button
              type="button"
              className={cx(s.mini, confirmDelete && s.miniDanger)}
              aria-label={confirmDelete ? t('Pulsa otra vez para borrarla') : t('Borrar la conversación')}
              title={confirmDelete ? t('Pulsa otra vez para borrarla') : t('Borrar la conversación')}
              onClick={() => void remove()}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          )}
        </span>
      )}
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
