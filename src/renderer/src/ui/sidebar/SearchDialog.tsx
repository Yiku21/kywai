import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Brain, CornerDownLeft, FolderOpen, ListChecks, MessageSquare, Package, Search } from 'lucide-react'
import type { SearchHit } from '@shared/types'
import { useCowork, type LeftTab } from '@/store/cowork'
import { api } from '@/lib/api'
import { useEscape } from '../common/hooks'
import { cx, errorText } from '../common/util'
import { shortDate } from './sidebarState'
import s from './SearchDialog.module.css'
import { t } from '@/lib/i18n'

type Filter = 'all' | SearchHit['kind']

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: t('Todo') },
  { id: 'conversation', label: t('Conversaciones') },
  { id: 'task', label: t('Tareas') },
  { id: 'artifact', label: t('Resultados') },
  { id: 'memory', label: t('Memoria') }
]

const GROUPS: { kind: SearchHit['kind']; label: string }[] = [
  { kind: 'project', label: t('Proyectos') },
  { kind: 'conversation', label: t('Conversaciones') },
  { kind: 'task', label: t('Tareas') },
  { kind: 'artifact', label: t('Resultados') },
  { kind: 'memory', label: t('Memoria') }
]

const ICON = { project: FolderOpen, conversation: MessageSquare, task: ListChecks, artifact: Package, memory: Brain }

/** Resalta lo buscado (sin distinguir mayúsculas ni tildes) dentro de un texto. */
export function highlight(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const q = fold(query.trim())
  if (!q) return [{ text, hit: false }]
  const folded = fold(text)
  const out: Array<{ text: string; hit: boolean }> = []
  let from = 0
  for (let i = folded.indexOf(q); i >= 0; i = folded.indexOf(q, i + q.length)) {
    if (i > from) out.push({ text: text.slice(from, i), hit: false })
    out.push({ text: text.slice(i, i + q.length), hit: true })
    from = i + q.length
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false })
  return out
}

/** Quita tildes y pasa a minúsculas sin cambiar la longitud (cada letra sigue en su sitio). */
function fold(s: string): string {
  return Array.from(s, (c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || c).join('')
}

function Marked({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className={s.mark}>
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  )
}

/** Buscador (Ctrl+K): conversaciones, tareas, resultados y memoria de todos los proyectos o solo del abierto. */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const project = useCowork((st) => st.live.project)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [onlyHere, setOnlyHere] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEscape(true, onClose)

  useEffect(() => {
    const a = api
    const q = query.trim()
    if (!a || q.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    const id = window.setTimeout(() => {
      a.search(q, onlyHere && project ? project.id : undefined).then(
        (list) => {
          if (!alive) return
          setHits(list)
          setSel(0)
          setLoading(false)
        },
        (e) => {
          if (!alive) return
          setError(errorText(e))
          setLoading(false)
        }
      )
    }, 160)
    return () => {
      alive = false
      window.clearTimeout(id)
    }
  }, [query, onlyHere, project])

  const shown = useMemo(() => {
    const list = filter === 'all' ? hits : hits.filter((h) => h.kind === filter)
    // En el orden de los grupos, para que ↑↓ sigan lo que se ve.
    return GROUPS.flatMap((g) => list.filter((h) => h.kind === g.kind))
  }, [hits, filter])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  async function open(h: SearchHit): Promise<void> {
    const a = api
    if (!a) return
    setError(null)
    const st = useCowork.getState()
    try {
      const sameProject = st.live.project?.id === h.projectId
      const needsConversation = !!h.conversationId && (!sameProject || st.live.conversation?.id !== h.conversationId)
      if (needsConversation) st.loadProjectState(await a.openConversation(h.projectId, h.conversationId!))
      else if (!sameProject) st.loadProjectState(await a.loadProject(h.projectId))
      const tab: LeftTab = h.kind === 'task' ? 'tasks' : h.kind === 'memory' ? 'memory' : h.kind === 'artifact' ? 'results' : 'chat'
      useCowork.setState({ leftTab: tab, drawerOpen: false })
      if (h.kind === 'artifact' && h.ref) st.openViewer(h.ref)
      onClose()
    } catch (e) {
      setError(errorText(e))
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((i) => Math.min(shown.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && shown[sel]) {
      e.preventDefault()
      void open(shown[sel])
    }
  }

  let index = -1
  const q = query.trim()
  return (
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.box} role="dialog" aria-modal="true" aria-label={t('Buscar')}>
        <div className={s.inputRow}>
          <Search size={18} aria-hidden="true" className={s.inputIcon} />
          <input
            autoFocus
            className={s.input}
            value={query}
            placeholder={t('Buscar en conversaciones, tareas, resultados y memoria…')}
            aria-label={t('Buscar')}
            aria-controls="cowork-search-results"
            aria-activedescendant={shown[sel] ? `cowork-hit-${sel}` : undefined}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <kbd className={s.kbd}>Esc</kbd>
        </div>
        <div className={s.chips} role="group" aria-label={t('Qué buscar')}>
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={cx(s.chip, filter === f.id && s.chipOn)} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
          {project && (
            <button type="button" className={cx(s.chip, onlyHere && s.chipOn)} aria-pressed={onlyHere} onClick={() => setOnlyHere((v) => !v)} title={project.name}>
              {t('Solo este proyecto')}
            </button>
          )}
        </div>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.results} id="cowork-search-results" role="listbox" ref={listRef}>
          {q.length < 2 ? (
            <p className={s.empty}>{t('Escribe al menos dos letras.')}</p>
          ) : !loading && shown.length === 0 ? (
            <p className={s.empty}>{t('No hay nada con «{q}».', { q })}</p>
          ) : (
            GROUPS.map((g) => {
              const group = shown.filter((h) => h.kind === g.kind)
              if (!group.length) return null
              return (
                <div key={g.kind} className={s.group} role="group" aria-label={g.label}>
                  <div className={s.groupHead}>{g.label}</div>
                  {group.map((h) => {
                    index++
                    const i = index
                    const Icon = ICON[h.kind]
                    return (
                      <div
                        key={`${h.kind}:${h.projectId}:${h.conversationId ?? ''}:${h.ref ?? h.title}`}
                        id={`cowork-hit-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={i === sel}
                        className={cx(s.hit, i === sel && s.hitOn)}
                        onPointerMove={() => setSel(i)}
                        onClick={() => void open(h)}
                      >
                        <Icon size={16} aria-hidden="true" className={s.hitIcon} />
                        <span className={s.hitText}>
                          <span className={s.hitTitle}>
                            <Marked text={h.title} query={q} />
                          </span>
                          {h.snippet && (
                            <span className={s.hitSnippet}>
                              <Marked text={h.snippet} query={q} />
                            </span>
                          )}
                        </span>
                        <span className={s.hitWhere}>
                          {h.projectName}
                          {h.kind !== 'project' ? ` · ${shortDate(h.at)}` : ''}
                        </span>
                        {i === sel && <CornerDownLeft size={14} aria-hidden="true" className={s.enter} />}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
        <div className={s.foot}>
          <span>{t('↑↓ moverse')}</span>
          <span>{t('↵ abrir')}</span>
          <span>{t('Esc cerrar')}</span>
        </div>
      </div>
    </div>
  )
}
