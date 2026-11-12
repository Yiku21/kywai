import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Clapperboard, Copy, GitBranch, PenLine, Reply, ThumbsDown, ThumbsUp } from 'lucide-react'
import type { ChatMessage, MessageRating } from '@shared/types'
import { replyExcerpt } from '@shared/replyTo'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import { t } from '@/lib/i18n'
import { ContextMenu, menuPoint, type MenuAt, type MenuEntry } from '../sidebar/ContextMenu'
import { errorText } from '../common/util'
import { useComposer } from './composerStore'

/** Qué se puede hacer con un mensaje del agente (lo que ya ofrecen los botones de debajo). */
export type AgentMenuOptions = {
  agentId: string
  name: string
  replyable: boolean
  videoable: boolean
  ratable: boolean
}

/** Texto seleccionado dentro del mensaje, si lo hay (para copiar solo eso). */
function selectionIn(el: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return ''
  const node = sel.getRangeAt(0).commonAncestorContainer
  return el.contains(node) ? sel.toString().trim() : ''
}

/** Abre una conversación recién bifurcada y vuelve al chat. */
async function openFork(projectId: string, conversationId: string, from: { messageId: string; before?: boolean }): Promise<void> {
  const a = api!
  const id = await a.forkConversation(projectId, conversationId, from)
  useCowork.getState().loadProjectState(await a.openConversation(projectId, id))
  useCowork.setState((st) => ({ conversationsTick: st.conversationsTick + 1 }))
  useCowork.getState().setLeftTab('chat')
}

/**
 * Clic derecho en un mensaje del chat. Del agente: Copiar, Responder, Bifurcar desde aquí, Crear vídeo de esto y
 * 👍/👎. Tuyo: Copiar, Editar (en su sitio, en el mismo chat: ver EditBox en Messages.tsx) y Bifurcar desde aquí.
 * Copiar copia solo lo seleccionado si hay algo seleccionado dentro del mensaje.
 */
export function useMessageMenu(
  m: ChatMessage,
  opts: { agent: AgentMenuOptions } | { user: { text: string } }
): { onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void; menu: ReactNode; note: { text: string; error: boolean } | null } {
  const [at, setAt] = useState<MenuAt | null>(null)
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null)
  const selected = useRef('')
  const live = useCowork((st) => st.mode === 'live')
  const conversationId = useCowork((st) => st.live.conversation?.id ?? null)
  const replying = useComposer((c) => c.replyTo?.messageId === m.id)

  useEffect(() => {
    if (!note || note.error) return
    const id = window.setTimeout(() => setNote(null), 2000)
    return () => window.clearTimeout(id)
  }, [note])

  const run = (fn: () => Promise<unknown> | void, done?: string): void => {
    setNote(null)
    Promise.resolve()
      .then(fn)
      .then(
        () => done && setNote({ text: done, error: false }),
        (e) => setNote({ text: errorText(e), error: true })
      )
  }

  const agent = 'agent' in opts ? opts.agent : null
  const canFork = live && !!api && !!conversationId && !m.streaming
  const forkTitle = !live || !api ? t('Disponible en modo real') : !conversationId ? t('Este proyecto aún no tiene conversación') : undefined
  const copy: MenuEntry = {
    id: 'copiar',
    label: selected.current ? t('Copiar lo seleccionado') : t('Copiar'),
    icon: <Copy size={15} />,
    shortcut: 'c',
    disabled: !m.text?.trim() && !selected.current,
    onSelect: () => run(() => copyText(selected.current || ('user' in opts ? opts.user.text : m.text), t('No se pudo copiar')), t('Copiado'))
  }
  const fork: MenuEntry = {
    id: 'bifurcar',
    label: t('Bifurcar desde aquí'),
    icon: <GitBranch size={15} />,
    shortcut: 'b',
    disabled: !canFork,
    title: forkTitle ?? t('Conversación nueva con todo hasta este mensaje, para seguir por otro camino sin tocar esta'),
    onSelect: () => run(() => openFork(m.projectId, conversationId!, { messageId: m.id }))
  }

  let items: MenuEntry[]
  if (agent) {
    items = [
      copy,
      {
        id: 'responder',
        label: replying ? t('Dejar de responder a {name}', { name: agent.name }) : t('Responder a {name}', { name: agent.name }),
        icon: <Reply size={15} />,
        shortcut: 'r',
        disabled: !agent.replyable,
        title: t('Lo que escribas le llega a él para que revise o continúe esta respuesta'),
        onSelect: () =>
          useComposer
            .getState()
            .setReplyTo(replying ? null : { messageId: m.id, agentId: agent.agentId, name: agent.name, excerpt: replyExcerpt(m.text) })
      },
      fork,
      {
        id: 'video',
        label: t('Crear vídeo de esto'),
        icon: <Clapperboard size={15} />,
        shortcut: 'v',
        disabled: !agent.videoable || !api,
        onSelect: () => run(() => api!.sendMessage({ projectId: m.projectId, text: '', filePaths: [], videoFrom: m.id }), t('Vídeo pedido'))
      }
    ]
    if (agent.ratable) {
      const rate = (r: MessageRating) => () => run(() => api!.rateMessage(m.projectId, m.id, m.rating === r ? null : r))
      items.push(
        'sep',
        { id: 'sirvio', label: m.rating === 'up' ? t('Quitar «Me sirvió»') : t('Me sirvió'), icon: <ThumbsUp size={15} />, shortcut: 's', disabled: !api, onSelect: rate('up') },
        { id: 'nosirvio', label: m.rating === 'down' ? t('Quitar «No me sirvió»') : t('No me sirvió'), icon: <ThumbsDown size={15} />, shortcut: 'n', disabled: !api, onSelect: rate('down') }
      )
    }
  } else {
    const editable = live && !!api && !m.routine && m.voiceNote !== 'transcribing'
    items = [
      copy,
      {
        id: 'editar',
        label: t('Editar'),
        icon: <PenLine size={15} />,
        shortcut: 'e',
        disabled: !editable,
        title: editable ? t('Lo cambias aquí mismo y se vuelve a enviar; lo de ahora queda guardado como otra versión (‹ ›)') : t('Disponible en modo real'),
        onSelect: () => useComposer.getState().setEditing(m.id)
      },
      fork
    ]
  }

  return {
    onContextMenu: (e) => {
      // Dentro de un campo de texto (o si un elemento de dentro ya puso su menú) se deja el de siempre.
      const target = e.target as HTMLElement
      if (e.defaultPrevented || target.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      selected.current = selectionIn(e.currentTarget)
      setAt(menuPoint(e))
    },
    menu: at ? <ContextMenu at={at} items={items} label={agent ? t('Mensaje de {name}', { name: agent.name }) : t('Tu mensaje')} onClose={() => setAt(null)} /> : null,
    note
  }
}
