import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Brain, ChevronDown, ChevronRight, CornerDownLeft, FolderOpen, History, ListChecks, MessageSquare, Package, Search } from 'lucide-react'
import type { SearchAuthor, SearchHit, SearchMatch } from '@shared/types'
import { useCowork, useData } from '@/store/cowork'
import { api } from '@/lib/api'
import { highlight, searchTerms } from '@/lib/searchText'
import { useEscape } from '../common/hooks'
import { useAgentLookup } from '../common/agents'
import { cx, errorText } from '../common/util'
import { openInHistory } from './openHit'
import { shortDate } from './sidebarState'
import s from './SearchDialog.module.css'
import { t } from '@/lib/i18n'

type Filter = 'all' | SearchHit['kind']
type When = 'all' | 'today' | 'week' | 'month'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: t('Todo') },
  { id: 'conversation', label: t('Conversaciones') },
  { id: 'task', label: t('Tareas') },
  { id: 'artifact', label: t('Resultados') },
  { id: 'memory', label: t('Memoria') }
]

const WHEN: { id: When; label: string }[] = [
  { id: 'all', label: t('Cualquier fecha') },
  { id: 'today', label: t('Hoy') },
  { id: 'week', label: t('Últimos 7 días') },
  { id: 'month', label: t('Últimos 30 días') }
]

const GROUPS: { kind: SearchHit['kind']; label: string }[] = [
  { kind: 'project', label: t('Proyectos') },
  { kind: 'conversation', label: t('Conversaciones') },
  { kind: 'task', label: t('Tareas') },
  { kind: 'artifact', label: t('Resultados') },
  { kind: 'memory', label: t('Memoria') }
]

const ICON = { project: FolderOpen, conversation: MessageSquare, task: ListChecks, artifact: Package, memory: Brain }

/** Resultados que se piden de cada vez («Ver más» pide otros tantos). */
export const PAGE = 40

/** Desde cuándo buscar (ms), según el filtro de fecha. */
export function sinceOf(when: When, now = Date.now()): number | undefined {
  if (when === 'all') return undefined
  if (when === 'today') {
    const d = new Date(now)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  return now - (when === 'week' ? 7 : 30) * 86_400_000
}

function Marked({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlight(text, terms).map((p, i) =>
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

/**
 * Buscador (Ctrl+K): conversaciones, tareas, resultados y memoria de todos los proyectos o solo del abierto.
 * Varias palabras (todas, en cualquier orden) o «frase exacta»; filtros de fecha y de quién lo escribió; en cada
 * conversación, cuántos mensajes coinciden y a cuál ir.
 */
export function SearchDialog({ onClose, initialQuery = '' }: { onClose: () => void; initialQuery?: string }) {
  const project = useCowork((st) => st.live.project)
  const agentOrder = useData((d) => d.agentOrder)
  const lookup = useAgentLookup()
  const [query, setQuery] = useState(initialQuery)
  const [filter, setFilter] = useState<Filter>('all')
  const [when, setWhen] = useState<When>('all')
  const [author, setAuthor] = useState<'' | SearchAuthor>('')
  const [onlyHere, setOnlyHere] = useState(false)
  const [limit, setLimit] = useState(PAGE)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEscape(true, onClose)

  const q = query.trim()
  const terms = useMemo(() => searchTerms(q), [q])

  // Otra búsqueda u otros filtros: se vuelve a la primera página.
  useEffect(() => setLimit(PAGE), [q, when, author, onlyHere])

  useEffect(() => {
    const a = api
    if (!a || terms.join('').length < 2) {
      setHits([])
      setTotal(0)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    const id = window.setTimeout(() => {
      a.searchHistory(q, { projectId: onlyHere && project ? project.id : undefined, since: sinceOf(when), author: author || undefined, limit }).then(
        (r) => {
          if (!alive) return
          setHits(r.hits)
          setTotal(r.total)
          setError(null)
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
  }, [q, terms, onlyHere, project, when, author, limit])

  useEffect(() => setSel(0), [q, filter, when, author, onlyHere])

  const shown = useMemo(() => {
    const list = filter === 'all' ? hits : hits.filter((h) => h.kind === filter)
    // En el orden de los grupos, para que ↑↓ sigan lo que se ve.
    return GROUPS.flatMap((g) => list.filter((h) => h.kind === g.kind))
  }, [hits, filter])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  async function open(h: SearchHit, match?: SearchMatch): Promise<void> {
    setError(null)
    try {
      await openInHistory({ ...h, messageId: match?.messageId ?? h.messageId }, terms)
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

  const byName = (by: string): string => (by === 'user' ? t('Tú') : by === 'system' ? t('Aviso') : lookup(by).name)
  const keyOf = (h: SearchHit): string => `${h.kind}:${h.projectId}:${h.conversationId ?? ''}:${h.ref ?? h.title}`

  let index = -1
  return (
    <div className={s.backdrop} data-instant onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
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
        <div className={s.filters}>
          <select className={s.select} value={when} onChange={(e) => setWhen(e.target.value as When)} aria-label={t('Fecha')}>
            {WHEN.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
          <select className={s.select} value={author} onChange={(e) => setAuthor(e.target.value)} aria-label={t('Quién lo escribió')}>
            <option value="">{t('Cualquiera')}</option>
            <option value="user">{t('Tú')}</option>
            <option value="agents">{t('Cualquier agente')}</option>
            {agentOrder.map((id) => (
              <option key={id} value={id}>
                {lookup(id).name}
              </option>
            ))}
          </select>
          <span className={s.tip}>{t('Varias palabras: todas. «Entre comillas»: la frase exacta.')}</span>
        </div>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.results} id="cowork-search-results" role="listbox" ref={listRef}>
          {terms.join('').length < 2 ? (
            <div className={s.empty}>
              <p>{t('Escribe al menos dos letras.')}</p>
              <button
                type="button"
                className={s.historyLink}
                onClick={() => {
                  onClose()
                  useCowork.setState({ historyOpen: true })
                }}
              >
                <History size={14} aria-hidden="true" />
                {t('Ver todo el historial')}
              </button>
            </div>
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
                    const k = keyOf(h)
                    const many = (h.matchCount ?? 0) > 1
                    const isOpen = expanded === k
                    return (
                      <div key={k}>
                        <div
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
                              <Marked text={h.title} terms={terms} />
                            </span>
                            {h.snippet && (
                              <span className={s.hitSnippet}>
                                <Marked text={h.snippet} terms={terms} />
                              </span>
                            )}
                          </span>
                          {many && (
                            <button
                              type="button"
                              className={s.count}
                              aria-expanded={isOpen}
                              title={t('Ver los mensajes que coinciden')}
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpanded(isOpen ? null : k)
                              }}
                            >
                              {isOpen ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
                              {t('{n} coincidencias', { n: h.matchCount ?? 0 })}
                            </button>
                          )}
                          <span className={s.hitWhere}>
                            {h.projectName}
                            {h.kind !== 'project' ? ` · ${shortDate(h.at)}` : ''}
                          </span>
                          {i === sel && <CornerDownLeft size={14} aria-hidden="true" className={s.enter} />}
                        </div>
                        {isOpen && (
                          <div className={s.matches}>
                            {(h.matches ?? []).map((m) => (
                              <button key={m.messageId} type="button" className={s.match} onClick={() => void open(h, m)}>
                                <span className={s.matchBy}>{byName(m.by)}</span>
                                <span className={s.matchText}>
                                  <Marked text={m.snippet} terms={terms} />
                                </span>
                                <span className={s.matchAt}>{shortDate(m.at)}</span>
                              </button>
                            ))}
                            {(h.matchCount ?? 0) > (h.matches?.length ?? 0) && (
                              <p className={s.matchMore}>{t('…y {n} más dentro de la conversación', { n: (h.matchCount ?? 0) - (h.matches?.length ?? 0) })}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
          {total > hits.length && shown.length > 0 && (
            <button type="button" className={s.more} onClick={() => setLimit((n) => n + PAGE)} disabled={loading}>
              {loading ? t('Cargando…') : t('Ver más ({n} de {total})', { n: hits.length, total })}
            </button>
          )}
        </div>
        <div className={s.foot}>
          <span>{t('↑↓ moverse')}</span>
          <span>{t('↵ abrir')}</span>
          <span>{t('Esc cerrar')}</span>
          {total > 0 && <span className={s.total}>{t('{n} resultados', { n: total })}</span>}
        </div>
      </div>
    </div>
  )
}
