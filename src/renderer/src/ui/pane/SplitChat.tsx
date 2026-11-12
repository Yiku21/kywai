import { useEffect, useRef, useState } from 'react'
import { AppWindow, MessageSquare, X } from 'lucide-react'
import { chatPaneUrl, draggedChat, isChatDrag, isPaneMessage, openChatWindow, type ChatRef } from '@/lib/chatPane'
import { useCowork } from '@/store/cowork'
import { t } from '@/lib/i18n'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import s from './SplitChat.module.css'

/**
 * Chat de al lado: otro chat a la derecha, en lugar del espacio 3D (que se para mientras tanto). Es la misma
 * interfaz en un marco, con solo esa conversación; se escribe en ella sin que el chat principal cambie.
 */
export function SplitChat({ chat }: { chat: ChatRef }) {
  const setSplitChat = useCowork((st) => st.setSplitChat)
  const projectName = useCowork((st) => st.projects.find((p) => p.id === chat.projectId)?.name)
  const frame = useRef<HTMLIFrameElement>(null)
  // La dirección del marco solo cambia si sueltas otro chat; si el propio chat de al lado pasa a otra conversación
  // (al bifurcar), ya la está enseñando y no se recarga.
  const [src, setSrc] = useState(() => chatPaneUrl(chat, true))
  const shown = useRef(chat.conversationId)
  useEffect(() => {
    if (chat.conversationId === shown.current) return
    shown.current = chat.conversationId
    setSrc(chatPaneUrl(chat, true))
  }, [chat])

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      if (e.source !== frame.current?.contentWindow || !isPaneMessage(e.data)) return
      const msg = e.data
      if (msg.kywaiPane === 'close') setSplitChat(null)
      else if (msg.kywaiPane === 'popout') {
        openChatWindow(msg.ref)
        setSplitChat(null)
      } else if (msg.kywaiPane === 'switched') {
        shown.current = msg.ref.conversationId
        const cur = useCowork.getState().splitChat
        if (cur?.conversationId !== msg.ref.conversationId || cur.title !== msg.ref.title || cur.projectId !== msg.ref.projectId) setSplitChat(msg.ref)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [setSplitChat])

  const title = chat.title || t('Conversación')
  const popout = t('Abrir en una ventana aparte (se puede llevar a otro monitor)')
  const close = t('Cerrar este chat (vuelve el espacio 3D)')
  return (
    <section className={s.split} aria-label={t('Chat de al lado: {title}', { title })}>
      <div className={s.bar}>
        <MessageSquare size={17} aria-hidden="true" className={s.icon} />
        <h2 className={s.title} title={title}>
          {title}
        </h2>
        {projectName && <span className={s.project}>{projectName}</span>}
        <div className={s.actions}>
          <button
            type="button"
            className={cx(u.iconBtn, u.iconBtnSm)}
            onClick={() => {
              openChatWindow(chat)
              setSplitChat(null)
            }}
            aria-label={popout}
            title={popout}
          >
            <AppWindow size={16} aria-hidden="true" />
          </button>
          <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} onClick={() => setSplitChat(null)} aria-label={close} title={close}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <iframe ref={frame} className={s.frame} src={src} title={title} />
    </section>
  )
}

/**
 * Mientras arrastras un chat de la barra lateral, la parte derecha de la ventana se marca para soltarlo allí y
 * abrirlo al lado. Si ya había uno al lado, lo sustituye.
 */
export function SplitDropZone({ wide }: { wide?: boolean }) {
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState(false)
  useEffect(() => {
    const start = (e: DragEvent): void => {
      if (isChatDrag(e.dataTransfer)) setDragging(true)
    }
    const end = (): void => {
      setDragging(false)
      setOver(false)
    }
    // En fase de captura: la barra lateral para la propagación de sus arrastres (para que mande el de más dentro). Se
    // mira al entrar en algo (en dragstart aún no lleva sus datos); dragend llega siempre al terminar el arrastre.
    document.addEventListener('dragenter', start, true)
    document.addEventListener('dragend', end, true)
    return () => {
      document.removeEventListener('dragenter', start, true)
      document.removeEventListener('dragend', end, true)
    }
  }, [])
  if (!dragging) return null
  return (
    <div
      className={s.drop}
      data-over={over || undefined}
      data-wide={wide || undefined}
      onDragEnter={(e) => {
        if (!isChatDrag(e.dataTransfer)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragOver={(e) => {
        if (!isChatDrag(e.dataTransfer)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setOver(false)
      }}
      onDrop={(e) => {
        const ref = draggedChat(e.dataTransfer)
        if (!ref) return
        e.preventDefault()
        setDragging(false)
        setOver(false)
        useCowork.getState().setSplitChat(ref)
      }}
    >
      <div className={s.dropCard}>
        <MessageSquare size={28} aria-hidden="true" />
        <span>{t('Suelta aquí para abrirlo al lado')}</span>
      </div>
    </div>
  )
}
