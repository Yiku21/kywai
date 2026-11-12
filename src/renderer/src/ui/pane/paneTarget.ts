import { api } from '@/lib/api'
import { boundChat, chatPaneUrl, tellParent } from '@/lib/chatPane'
import { useCowork } from '@/store/cowork'

/**
 * En el chat de al lado o en una ventana suelta, lo que envías va a su conversación (que puede no ser la abierta
 * del proyecto). En la ventana principal no añade nada: va a la abierta, como siempre.
 */
export function paneTarget(): { conversationId?: string } {
  if (!boundChat) return {}
  const id = useCowork.getState().live.conversation?.id
  return id ? { conversationId: id } : {}
}

/**
 * El chat de al lado o la ventana suelta pasan a otra conversación (al bifurcar o editar y reenviar un mensaje):
 * se carga sin abrirla en el motor, así el chat principal no salta a ella.
 */
export async function showInPane(projectId: string, conversationId: string): Promise<void> {
  const a = api
  if (!a || !boundChat) return
  useCowork.getState().loadProjectState(await a.getConversation(projectId, conversationId))
  try {
    history.replaceState(null, '', chatPaneUrl({ projectId, conversationId }, boundChat.embedded))
  } catch {
    // Sin historial (marco sin permiso): la ventana sigue igual, solo no se recuerda al recargar.
  }
  announcePane()
}

/** Avisa a la ventana principal de qué chat enseña el de al lado (para su cabecera y para recordarlo). */
export function announcePane(): void {
  const live = useCowork.getState().live
  if (!live.project || !live.conversation) return
  const title = live.conversation.title || titleOf(live.messages)
  if (!boundChat?.embedded) document.title = title ? `${title} · kywai` : 'kywai'
  tellParent({ kywaiPane: 'switched', ref: { projectId: live.project.id, conversationId: live.conversation.id, title } })
}

/** Título de una conversación sin nombre: su primer mensaje tuyo, acortado. */
export function titleOf(messages: { author: { type: string }; text: string }[]): string {
  const first = messages.find((m) => m.author.type === 'user' && m.text.trim())
  const text = (first?.text ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 60 ? `${text.slice(0, 59)}…` : text
}
