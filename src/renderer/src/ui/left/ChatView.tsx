import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, Sparkles } from 'lucide-react'
import { useCowork, useData } from '@/store/cowork'
import { AgentAvatar } from '../common/AgentBits'
import { useAgentLookup } from '../common/agents'
import { MessageItem } from './Messages'
import { useNow } from '../common/hooks'
import { agentVars, cx, formatDuration } from '../common/util'
import { useComposer } from './composerStore'
import { markInElement } from '@/lib/searchText'
import s from './ChatView.module.css'
import { t } from '@/lib/i18n'

/**
 * Respuesta inmediata al enviar: mientras el coordinador prepara el plan (no escribe nada hasta tenerlo, de 10 s a
 * un minuto), se ve que la petición llegó, quién la está planificando y cuánto lleva. Desaparece con su respuesta.
 */
function PlanningRow() {
  const messages = useData((d) => d.messages)
  const active = useData((d) => d.activeRunIds)
  const runtimes = useData((d) => d.runtimes)
  const plannerOrder = useCowork((st) => st.config.plannerOrder)
  const reduced = useCowork((st) => st.reducedEffects)
  const lookup = useAgentLookup()
  const last = messages[messages.length - 1]
  const waiting = !!last && last.author.type === 'user' && !!last.runId && active.includes(last.runId)
  const now = useNow(1000, waiting)
  if (!waiting) return null
  // Quien planifica está «pensando» sin tarea; si no se ve, el primero del orden de coordinadores.
  const planner = Object.values(runtimes).find((r) => r.activity === 'thinking' && !r.taskId)?.agentId ?? plannerOrder[0]
  const look = lookup(planner)
  return (
    <div className={s.planning} role="status" style={agentVars(look.color)}>
      <AgentAvatar look={look} size={28} />
      <div className={s.planningBody}>
        <span className={s.planningTitle}>
          {t('{name} prepara el plan', { name: look.name })}
          <span className={cx(s.planningDots, !reduced && s.planningDotsAnim)} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className={s.planningClock}>{formatDuration(now - last.createdAt)}</span>
        </span>
        <span className={s.planningSub}>{t('Recibido. Decide qué agentes lo hacen y cómo; cuando lo tenga, empiezan.')}</span>
      </div>
    </div>
  )
}

const EXAMPLES = [
  t('Crea una landing page para mi tienda'),
  t('Resume este PDF y propón tareas'),
  t('Escribe un script que ordene mis fotos')
]

/** Lista de mensajes con autodesplazamiento (salvo si el usuario ha subido). */
export function ChatView() {
  const messages = useData((d) => d.messages)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prevLen = useRef(messages.length)
  const [showNew, setShowNew] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const focus = useCowork((st) => st.focusMessage)
  const unmark = useRef<() => void>(() => undefined)
  const flashTimer = useRef(0)
  const firstId = messages[0]?.id

  const lastTop = useRef(0)

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    lastTop.current = el.scrollTop
  }, [])

  /*
   * Solo deja de seguir el final si TÚ subes (la posición baja). El aviso de scroll llega un fotograma tarde: si entre
   * medias el texto que se va revelando añadió de golpe un bloque alto (una tabla, una lista), la distancia al final
   * ya es grande aunque nadie haya subido. Antes eso soltaba el chat y se quedaba quieto con «Nuevos mensajes».
   */
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const top = el.scrollTop
    const atBottom = el.scrollHeight - top - el.clientHeight < 56
    if (atBottom) {
      stick.current = true
      setShowNew(false)
    } else if (top < lastTop.current - 2) stick.current = false
    lastTop.current = top
  }, [])

  // Nueva conversación (cambio de modo o de proyecto): empezar abajo.
  useLayoutEffect(() => {
    stick.current = true
    setShowNew(false)
    scrollToBottom()
  }, [firstId, scrollToBottom])

  useLayoutEffect(() => {
    const grew = messages.length > prevLen.current
    prevLen.current = messages.length
    const last = messages[messages.length - 1]
    // Tu propio mensaje siempre te lleva abajo.
    if (grew && last?.author.type === 'user') stick.current = true
    if (stick.current) scrollToBottom()
    else if (grew) setShowNew(true)
  }, [messages, scrollToBottom])

  // El contenido crece sin cambiar `messages` (imágenes, markdown): mantener abajo si procede.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (stick.current) scrollToBottom()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [scrollToBottom, messages.length === 0])

  // Lo pide el buscador: bajar hasta el mensaje encontrado, resaltarlo un momento y marcar lo buscado.
  useEffect(() => {
    if (!focus) return
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(focus.id)}"]`)
    if (!el) return
    stick.current = false
    setShowNew(false)
    el.scrollIntoView({ block: 'center' })
    unmark.current()
    unmark.current = markInElement(el, focus.terms)
    setFlashId(focus.id)
    useCowork.setState({ focusMessage: null })
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlashId(null), 2600)
  }, [focus, messages])

  useEffect(
    () => () => {
      window.clearTimeout(flashTimer.current)
      unmark.current()
    },
    []
  )

  if (messages.length === 0) {
    return (
      <div className={s.scroller}>
        <EmptyChat />
      </div>
    )
  }

  return (
    <div className={s.wrap}>
      <div
        ref={scrollRef}
        className={s.scroller}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={t('Conversación')}
      >
        <div ref={contentRef} className={s.list}>
          {messages.map((m) => (
            <div key={m.id} data-message-id={m.id} className={m.id === flashId ? s.flash : undefined}>
              <MessageItem message={m} />
            </div>
          ))}
          <PlanningRow />
        </div>
      </div>
      {showNew && (
        <button
          type="button"
          className={s.newBtn}
          onClick={() => {
            stick.current = true
            setShowNew(false)
            scrollToBottom()
          }}
        >
          {t('Nuevos mensajes')}
          <ArrowDown size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function EmptyChat() {
  const mode = useCowork((st) => st.mode)
  const agentOrder = useData((d) => d.agentOrder)
  const lookup = useAgentLookup()

  const fill = (text: string): void => {
    const c = useComposer.getState()
    c.setText(text)
    c.requestFocus()
  }

  return (
    <div className={s.empty}>
      <div className={s.emptyCard}>
        <div className={s.team} aria-hidden="true">
          {agentOrder.slice(0, 5).map((id) => (
            <AgentAvatar key={id} look={lookup(id)} size={40} className={s.teamAvatar} />
          ))}
          {agentOrder.length === 0 && (
            <span className={s.sparkle}>
              <Sparkles size={22} />
            </span>
          )}
        </div>
        <h2 className={s.emptyTitle}>{t('Pide algo a tu equipo')}</h2>
        <p className={s.emptyText}>
          {t('Describe una tarea: el equipo la dividirá en partes y cada agente se encargará de lo que mejor hace.')}
        </p>
        <div className={s.examples}>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className={s.example} onClick={() => fill(ex)}>
              <Sparkles size={13} aria-hidden="true" />
              {ex}
            </button>
          ))}
        </div>
        {mode === 'demo' && <p className={s.demoNote}>{t('Modo demo: verás una simulación, sin coste.')}</p>}
      </div>
    </div>
  )
}
