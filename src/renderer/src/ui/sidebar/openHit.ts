import type { SearchHit } from '@shared/types'
import { useCowork, type LeftTab } from '@/store/cowork'
import { api } from '@/lib/api'

/**
 * Lleva a donde está algo del historial: al proyecto y a la conversación, en la pestaña que toca. Con un mensaje,
 * el chat baja hasta él y lo resalta (con lo buscado marcado).
 */
export async function openInHistory(
  target: Pick<SearchHit, 'kind' | 'projectId' | 'conversationId' | 'ref'> & { messageId?: string },
  terms: string[] = []
): Promise<void> {
  const a = api
  if (!a) return
  const st = useCowork.getState()
  const sameProject = st.live.project?.id === target.projectId
  const needsConversation = !!target.conversationId && (!sameProject || st.live.conversation?.id !== target.conversationId)
  if (needsConversation) st.loadProjectState(await a.openConversation(target.projectId, target.conversationId!))
  else if (!sameProject) st.loadProjectState(await a.loadProject(target.projectId))
  const tab: LeftTab = target.kind === 'task' ? 'tasks' : target.kind === 'memory' ? 'memory' : target.kind === 'artifact' ? 'results' : 'chat'
  useCowork.setState({
    leftTab: tab,
    drawerOpen: false,
    focusMessage: target.messageId && tab === 'chat' ? { id: target.messageId, terms, nonce: Date.now() } : null
  })
  if (target.kind === 'artifact' && target.ref) st.openViewer(target.ref)
}
