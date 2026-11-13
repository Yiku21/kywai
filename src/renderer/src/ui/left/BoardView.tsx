import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { ArrowDown, ArrowUp, ChevronsUp, LoaderCircle, MessageSquare, Pause, Pencil, Play, Plus, RotateCcw, SquareKanban, Trash2 } from 'lucide-react'
import { BOARD_COLUMNS, cardsIn, MAX_BOARD_TEXT, type Board, type BoardCard, type BoardColumnId, type BoardCommand } from '@shared/board'
import { useCowork, useData } from '@/store/cowork'
import { api } from '@/lib/api'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import { ExampleChips } from '../common/ExampleChips'
import v from './Views.module.css'
import s from './BoardView.module.css'
import { locale, t } from '@/lib/i18n'

const COLUMN_LABEL: Record<BoardColumnId, string> = {
  todo: t('Por hacer'),
  doing: t('En marcha'),
  waiting: t('Te espera'),
  done: t('Hecho')
}

const COLUMN_EMPTY: Record<BoardColumnId, string> = {
  todo: t('Nada en la cola.'),
  doing: t('El equipo está libre.'),
  waiting: t('Nada te espera.'),
  done: t('Aún no ha terminado ninguna.')
}

// Ejemplos del tablero vacío: un toque los deja escritos en «Nueva tarjeta».
const BOARD_EXAMPLES = [{ text: t('Haz la página de precios') }, { text: t('Escribe las pruebas del carrito') }, { text: t('/video las novedades de la semana') }]

function when(ts: number | undefined): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const EMPTY: Board = { projectId: '', paused: false, cards: [] }

/**
 * Pestaña Tablero (Kanban): dejas tareas en «Por hacer» y el equipo las va cogiendo solas, una tras otra. Cada tarjeta
 * va al chat como si la escribieras tú (plan de Hermes, agentes, verificación) y se mueve de columna sola.
 */
export function BoardView() {
  const project = useCowork((st) => st.live.project)
  const mode = useCowork((st) => st.mode)
  const pid = project?.id ?? ''
  const board = useCowork((st) => (pid ? st.boards[pid] : undefined)) ?? EMPTY
  const editable = !!api && mode === 'live' && !!project
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputId = useId()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Al abrir la pestaña (o cambiar de proyecto) se pide el tablero; lo demás llega por board.updated.
  useEffect(() => {
    const a = api
    if (!a || mode !== 'live' || !pid) return
    let alive = true
    a.getBoard(pid).then(
      (b) => {
        if (alive) useCowork.setState((st) => ({ boards: { ...st.boards, [pid]: b } }))
      },
      (e) => alive && setError(errorText(e))
    )
    return () => {
      alive = false
    }
  }, [pid, mode])

  async function run(cmd: BoardCommand): Promise<boolean> {
    if (!api || !pid) return false
    setError(null)
    try {
      const b = await api.boardCommand(pid, cmd)
      useCowork.setState((st) => ({ boards: { ...st.boards, [pid]: b } }))
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    }
  }

  async function add(): Promise<void> {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    if (await run({ type: 'add', text })) setDraft('')
    setBusy(false)
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void add()
    }
  }

  // Arrastrar una terminada o una que no salió a «Por hacer» la vuelve a poner en la cola (como «Reintentar»).
  function onDrop(e: DragEvent): void {
    e.preventDefault()
    setDragOver(false)
    const id = e.dataTransfer.getData('application/x-kywai-card')
    if (id) void run({ type: 'retry', id })
  }

  const total = board.cards.length
  const queued = board.cards.filter((c) => c.status === 'todo').length

  return (
    <div className={v.scroll}>
      <p className={s.intro}>
        {t('Deja aquí lo que quieras que haga el equipo. Hermes coge la primera de «Por hacer», la reparte entre los agentes, la verifica y, cuando acaba, pasa a la siguiente, aunque no estés delante. Cada tarjeta sale en el chat como si la escribieras tú (también valen órdenes como /video).')}
      </p>

      {editable && (
        <div className={s.addBox}>
          <label htmlFor={inputId} className={s.srOnly}>
            {t('Nueva tarjeta')}
          </label>
          <textarea
            id={inputId}
            ref={inputRef}
            className={s.textarea}
            value={draft}
            maxLength={MAX_BOARD_TEXT}
            rows={2}
            placeholder={t('Qué hay que hacer… (Ctrl + Intro para añadir)')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
          />
          <div className={s.addRow}>
            <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!draft.trim() || busy} onClick={() => void add()}>
              {busy ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
              {t('Añadir a «Por hacer»')}
            </button>
            <button
              type="button"
              className={cx(u.btn, u.btnSm, board.paused && s.pausedBtn)}
              aria-pressed={board.paused}
              onClick={() => void run({ type: 'pause', paused: !board.paused })}
              title={board.paused ? t('El equipo vuelve a coger tarjetas') : t('El equipo termina la que tiene y no coge más')}
            >
              {board.paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
              {board.paused ? t('Reanudar el tablero') : t('Pausar el tablero')}
            </button>
          </div>
          {board.paused && queued > 0 && <p className={s.pausedNote}>{t('En pausa: el equipo no cogerá ninguna tarjeta nueva.')}</p>}
        </div>
      )}

      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      {total === 0 ? (
        <div className={u.empty}>
          <span className={u.emptyIcon}>
            <SquareKanban size={20} aria-hidden="true" />
          </span>
          <span className={u.emptyTitle}>{t('El tablero está vacío')}</span>
          <span className={u.emptyText}>
            {mode === 'demo'
              ? t('En la demo no hay tablero: aparece con los agentes reales.')
              : t('Déjalas todas y vuelve luego a ver los resultados.')}
          </span>
          {editable && (
            <ExampleChips
              examples={BOARD_EXAMPLES}
              onPick={(text) => {
                setDraft(text)
                inputRef.current?.focus()
              }}
            />
          )}
        </div>
      ) : (
        <div className={s.columns}>
          {BOARD_COLUMNS.map((col) => {
            const list = cardsIn(board, col)
            return (
              <section
                key={col}
                className={cx(s.column, s[`col_${col}`], col === 'todo' && dragOver && s.dropping)}
                aria-label={COLUMN_LABEL[col]}
                onDragOver={
                  col === 'todo' && editable
                    ? (e) => {
                        if (!e.dataTransfer.types.includes('application/x-kywai-card')) return
                        e.preventDefault()
                        setDragOver(true)
                      }
                    : undefined
                }
                onDragLeave={col === 'todo' ? () => setDragOver(false) : undefined}
                onDrop={col === 'todo' && editable ? onDrop : undefined}
              >
                <header className={s.colHead}>
                  <h3 className={s.colTitle}>
                    {COLUMN_LABEL[col]} <span className={u.count}>{list.length}</span>
                  </h3>
                  {col === 'done' && editable && list.length > 0 && (
                    <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => void run({ type: 'clearDone' })}>
                      {t('Quitar terminadas')}
                    </button>
                  )}
                </header>
                {list.length === 0 ? (
                  <p className={s.colEmpty}>{COLUMN_EMPTY[col]}</p>
                ) : (
                  <ol className={s.list}>
                    {list.map((c, i) => (
                      <CardItem key={c.id} c={c} index={i} count={list.length} editable={editable} run={run} />
                    ))}
                  </ol>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

const STATUS_LABEL: Record<BoardCard['status'], string> = {
  todo: t('Por hacer'),
  doing: t('El equipo trabaja en ella'),
  review: t('Su plan espera tu visto bueno en el chat'),
  done: t('Terminada'),
  failed: t('No salió')
}

function CardItem({ c, index, count, editable, run }: { c: BoardCard; index: number; count: number; editable: boolean; run: (cmd: BoardCommand) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(c.text)
  const [confirm, setConfirm] = useState(false)
  const messages = useData((d) => d.messages)
  const setLeftTab = useCowork((st) => st.setLeftTab)
  const draggable = editable && (c.status === 'done' || c.status === 'failed')

  function openInChat(): void {
    const m = c.runId ? messages.find((x) => x.runId === c.runId && x.author.type === 'user') : undefined
    setLeftTab('chat')
    if (m) useCowork.setState({ focusMessage: { id: m.id, terms: [], nonce: Date.now() } })
  }

  if (editing) {
    return (
      <li className={cx(s.card, s[`card_${c.status}`])}>
        <textarea className={s.textarea} value={text} maxLength={MAX_BOARD_TEXT} rows={3} onChange={(e) => setText(e.target.value)} aria-label={t('Texto de la tarjeta')} />
        <div className={s.actions}>
          <button
            type="button"
            className={cx(u.btn, u.btnSm, u.btnPrimary)}
            disabled={!text.trim()}
            onClick={() => void run({ type: 'edit', id: c.id, text }).then((ok) => ok && setEditing(false))}
          >
            {t('Guardar')}
          </button>
          <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setEditing(false)}>
            {t('Cancelar')}
          </button>
        </div>
      </li>
    )
  }

  const at = c.status === 'todo' ? c.createdAt : c.status === 'done' || c.status === 'failed' ? c.finishedAt : c.startedAt
  return (
    <li
      className={cx(s.card, s[`card_${c.status}`])}
      draggable={draggable}
      onDragStart={draggable ? (e) => e.dataTransfer.setData('application/x-kywai-card', c.id) : undefined}
      title={draggable ? t('Arrástrala a «Por hacer» para hacerla otra vez') : undefined}
    >
      <p className={s.text}>{c.text}</p>
      <p className={s.meta}>
        {c.status === 'doing' && <LoaderCircle size={12} className={u.spin} aria-hidden="true" />}
        <span>{STATUS_LABEL[c.status]}</span>
        {at ? <span className={s.time}>· {when(at)}</span> : null}
      </p>
      {c.note && <p className={s.note}>{c.note}</p>}
      {editable && (
        <div className={s.actions}>
          {c.status === 'todo' && (
            <>
              <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} disabled={index === 0} aria-label={t('Ponerla la primera')} title={t('Ponerla la primera')} onClick={() => void run({ type: 'move', id: c.id, to: 'top' })}>
                <ChevronsUp size={14} />
              </button>
              <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} disabled={index === 0} aria-label={t('Subir')} title={t('Subir')} onClick={() => void run({ type: 'move', id: c.id, to: 'up' })}>
                <ArrowUp size={14} />
              </button>
              <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} disabled={index === count - 1} aria-label={t('Bajar')} title={t('Bajar')} onClick={() => void run({ type: 'move', id: c.id, to: 'down' })}>
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                className={cx(u.iconBtn, u.iconBtnSm)}
                aria-label={t('Editar')}
                title={t('Editar')}
                onClick={() => {
                  setText(c.text)
                  setEditing(true)
                }}
              >
                <Pencil size={14} />
              </button>
            </>
          )}
          {(c.status === 'doing' || c.status === 'review' || ((c.status === 'done' || c.status === 'failed') && c.runId)) && (
            <button type="button" className={cx(u.btn, u.btnSm)} onClick={openInChat}>
              <MessageSquare size={14} aria-hidden="true" />
              {c.status === 'review' ? t('Revisar en el chat') : t('Ver en el chat')}
            </button>
          )}
          {(c.status === 'done' || c.status === 'failed') && (
            <button type="button" className={cx(u.btn, u.btnSm, c.status === 'failed' && u.btnPrimary)} onClick={() => void run({ type: 'retry', id: c.id })}>
              <RotateCcw size={14} aria-hidden="true" />
              {c.status === 'failed' ? t('Reintentar') : t('Otra vez')}
            </button>
          )}
          {c.status !== 'doing' && c.status !== 'review' && (
            <button
              type="button"
              className={cx(u.iconBtn, u.iconBtnSm, confirm && s.danger)}
              aria-label={confirm ? t('Pulsa otra vez para quitarla') : t('Quitar')}
              title={confirm ? t('Pulsa otra vez para quitarla') : t('Quitar')}
              onBlur={() => setConfirm(false)}
              onClick={() => {
                if (!confirm) return setConfirm(true)
                void run({ type: 'remove', id: c.id })
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </li>
  )
}
