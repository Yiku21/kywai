import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CornerDownLeft, History, MessageSquare, Pin, Search, X } from 'lucide-react'
import type { ConversationSummary } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { fold, highlight, searchTerms } from '@/lib/searchText'
import { useEscape } from '../common/hooks'
import { cx, errorText } from '../common/util'
import { groupByDate } from './historyGroups'
import { openInHistory } from './openHit'
import { shortDate } from './sidebarState'
import s from './SearchDialog.module.css'
import h from './HistoryDialog.module.css'
import { t } from '@/lib/i18n'

/**
 * Historial: todas las conversaciones de todos los proyectos, agrupadas por fecha, con filtro por proyecto y por
 * nombre. Para buscar dentro de los mensajes, el botón lleva al buscador con lo escrito.
 */
export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const projects = useCowork((st) => st.projects)
  const current = useCowork((st) => st.live.project)
  const currentConv = useCowork((st) => st.live.conversation)
  const tick = useCowork((st) => st.conversationsTick)
  const [all, setAll] = useState<ConversationSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEscape(true, onClose)

  useEffect(() => {
    const a = api
    if (!a) return
    let alive = true
    a.allConversations().then(
      (list) => alive && setAll(list),
      (e) => alive && setError(errorText(e))
    )
    return () => {
      alive = false
    }
  }, [tick])

  const terms = useMemo(() => searchTerms(query), [query])
  const nameOf = (id: string): string => projects.find((p) => p.id === id)?.name ?? ''
  const filtered = useMemo(
    () =>
      (all ?? []).filter((c) => {
        if (projectId && c.projectId !== projectId) return false
        if (!terms.length) return true
        const hay = fold(`${c.title} ${projects.find((p) => p.id === c.projectId)?.name ?? ''}`)
        return terms.every((term) => hay.includes(term))
      }),
    [all, projectId, terms, projects]
  )
  const groups = useMemo(() => groupByDate(filtered), [filtered])
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])

  useEffect(() => setSel(0), [query, projectId])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${sel}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  async function open(c: ConversationSummary): Promise<void> {
    setError(null)
    try {
      await openInHistory({ kind: 'conversation', projectId: c.projectId, conversationId: c.id })
      onClose()
    } catch (e) {
      setError(errorText(e))
    }
  }

  function searchInside(): void {
    onClose()
    useCowork.setState({ searchOpen: true, searchSeed: query.trim() })
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((i) => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && flat[sel]) {
      e.preventDefault()
      void open(flat[sel])
    }
  }

  const withChats = projects.filter((p) => (all ?? []).some((c) => c.projectId === p.id))
  let index = -1
  return (
    <div className={s.backdrop} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(s.box, h.box)} role="dialog" aria-modal="true" aria-label={t('Historial')}>
        <div className={h.head}>
          <History size={18} aria-hidden="true" className={s.inputIcon} />
          <h2 className={h.title}>{t('Historial')}</h2>
          {all && <span className={h.sub}>{t('{n} conversaciones', { n: all.length })}</span>}
          <button type="button" className={h.close} onClick={onClose} aria-label={t('Cerrar')}>
            <X size={16} />
          </button>
        </div>
        <div className={s.inputRow}>
          <Search size={16} aria-hidden="true" className={s.inputIcon} />
          <input
            autoFocus
            className={s.input}
            value={query}
            placeholder={t('Filtrar por nombre…')}
            aria-label={t('Filtrar por nombre')}
            aria-controls="cowork-history-list"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <select className={s.select} value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label={t('Proyecto')}>
            <option value="">{t('Todos los proyectos')}</option>
            {withChats.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {query.trim().length >= 2 && (
          <button type="button" className={h.inside} onClick={searchInside}>
            <Search size={13} aria-hidden="true" />
            {t('Buscar «{q}» dentro de los mensajes', { q: query.trim() })}
          </button>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.results} id="cowork-history-list" role="listbox" ref={listRef}>
          {!all ? (
            <p className={s.empty}>{t('Cargando…')}</p>
          ) : flat.length === 0 ? (
            <p className={s.empty}>{all.length ? t('Ninguna conversación coincide.') : t('Todavía no hay conversaciones.')}</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className={s.group} role="group" aria-label={g.label}>
                <div className={s.groupHead}>{g.label}</div>
                {g.items.map((c) => {
                  index++
                  const i = index
                  const isCurrent = current?.id === c.projectId && currentConv?.id === c.id
                  return (
                    <div
                      key={`${c.projectId}:${c.id}`}
                      data-index={i}
                      role="option"
                      aria-selected={i === sel}
                      className={cx(s.hit, i === sel && s.hitOn)}
                      onPointerMove={() => setSel(i)}
                      onClick={() => void open(c)}
                    >
                      <MessageSquare size={16} aria-hidden="true" className={s.hitIcon} />
                      <span className={s.hitText}>
                        <span className={s.hitTitle}>
                          {highlight(c.title, terms).map((p, k) =>
                            p.hit ? (
                              <mark key={k} className={s.mark}>
                                {p.text}
                              </mark>
                            ) : (
                              <span key={k}>{p.text}</span>
                            )
                          )}
                          {c.pinned && <Pin size={11} aria-label={t('Fijada')} className={h.pin} />}
                        </span>
                        <span className={s.hitSnippet}>
                          {c.messageCount === 1 ? t('1 mensaje') : t('{n} mensajes', { n: c.messageCount })}
                          {isCurrent ? ` · ${t('abierta')}` : ''}
                        </span>
                      </span>
                      <span className={s.hitWhere}>
                        {nameOf(c.projectId)} · {shortDate(c.updatedAt)}
                      </span>
                      {i === sel && <CornerDownLeft size={14} aria-hidden="true" className={s.enter} />}
                    </div>
                  )
                })}
              </div>
            ))
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
