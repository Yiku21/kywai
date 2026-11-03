import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, Sparkles } from 'lucide-react'
import { useCowork, useData } from '@/store/cowork'
import { AgentAvatar } from '../common/AgentBits'
import { useAgentLookup } from '../common/agents'
import { MessageItem } from './Messages'
import { useComposer } from './composerStore'
import s from './ChatView.module.css'

const EXAMPLES = [
  'Crea una landing page para mi tienda',
  'Resume este PDF y propón tareas',
  'Escribe un script que ordene mis fotos'
]

/** Lista de mensajes con autodesplazamiento (salvo si el usuario ha subido). */
export function ChatView() {
  const messages = useData((d) => d.messages)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prevLen = useRef(messages.length)
  const [showNew, setShowNew] = useState(false)
  const firstId = messages[0]?.id

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 56
    stick.current = atBottom
    if (atBottom) setShowNew(false)
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
        aria-label="Conversación"
      >
        <div ref={contentRef} className={s.list}>
          {messages.map((m) => (
            <MessageItem key={m.id} message={m} />
          ))}
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
          Nuevos mensajes
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
        <h2 className={s.emptyTitle}>Pide algo a tu equipo</h2>
        <p className={s.emptyText}>
          Describe una tarea: el equipo la dividirá en partes y cada agente se encargará de lo que mejor hace.
        </p>
        <div className={s.examples}>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className={s.example} onClick={() => fill(ex)}>
              <Sparkles size={13} aria-hidden="true" />
              {ex}
            </button>
          ))}
        </div>
        {mode === 'demo' && <p className={s.demoNote}>Modo demo: verás una simulación, sin coste.</p>}
      </div>
    </div>
  )
}
