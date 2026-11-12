import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { api } from '@/lib/api'
import { boundChat, tellParent } from '@/lib/chatPane'
import { followServerTheme } from '@/lib/theme'
import { lang, t } from '@/lib/i18n'
import { localizeInbox } from '@shared/inbox'
import { useCowork } from '@/store/cowork'
import { LeftPanel } from '@/ui/left/LeftPanel'
import { FilePreview } from '@/ui/preview/FilePreview'
import { TaskTraceDialog } from '@/ui/trace/TaskTraceDialog'
import { HermesModelDialog } from '@/ui/space/HermesModelDialog'
import { errorText } from '@/ui/common/util'
import { announcePane, titleOf } from './paneTarget'
import s from './ChatPaneApp.module.css'

/** Arranca el chat de esta página: el motor, la configuración y la conversación que pide la dirección. */
function usePaneBoot(): string | null {
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const a = api
    const ref = boundChat
    if (!a || !ref) {
      setError(t('Sin motor de agentes'))
      return
    }
    const off = a.onEvent((e) => {
      useCowork.getState().applyEvent(e)
      if (e.kind === 'config.updated') followServerTheme(e.config.uiTheme)
    })
    // En la app de escritorio escucha por el puente de la ventana principal: al cerrar este chat se deja de escuchar.
    window.addEventListener('pagehide', off)
    let alive = true
    ;(async () => {
      const [config, runtime, projects] = await Promise.all([a.getConfig(), a.getRuntime(), a.listProjects()])
      if (!alive) return
      const st = useCowork.getState()
      st.hydrateLive(config, runtime.runtimes, runtime.quotas)
      if (config.uiTheme) followServerTheme(config.uiTheme)
      st.setProjects(projects)
      a.listTemplates?.().then((list) => alive && useCowork.setState({ templates: list }), () => undefined)
      a.listInbox().then(
        (list) => alive && useCowork.setState({ inbox: list.filter((i) => !i.resolvedAt).map((i) => localizeInbox(i, lang())) }),
        () => undefined
      )
      const state = await a.getConversation(ref.projectId, ref.conversationId)
      if (!alive) return
      useCowork.getState().loadProjectState(state)
      announcePane()
    })().catch((err) => alive && setError(errorText(err)))
    return () => {
      alive = false
      window.removeEventListener('pagehide', off)
      off()
    }
  }, [])
  return error
}

/**
 * Solo un chat: el de al lado (dentro de la ventana principal, en lugar del espacio 3D) o el de una ventana suelta.
 * Es el mismo panel de siempre (chat, archivos, tareas…), con la conversación que pide la dirección.
 */
export function ChatPaneApp() {
  const error = usePaneBoot()
  const embedded = !!boundChat?.embedded
  const project = useCowork((st) => st.live.project)
  const conversation = useCowork((st) => st.live.conversation)
  const firstLine = useCowork((st) => titleOf(st.live.messages))
  const title = conversation?.title || firstLine || t('Conversación nueva')
  const preview = useCowork((st) => st.preview)
  const maximized = useCowork((st) => st.previewMaximized)
  const hermesModelOpen = useCowork((st) => st.hermesModelOpen)

  // La cabecera de la ventana principal (o el título de la ventana suelta) sigue el nombre del chat.
  useEffect(() => {
    if (conversation) announcePane()
  }, [conversation, firstLine])

  // Aquí no hay columna para la vista previa: un archivo se abre a toda la ventana (con ✕ vuelve al chat).
  useEffect(() => {
    if (preview && !maximized) useCowork.setState({ previewMaximized: true })
  }, [preview, maximized])

  return (
    <div className={s.app} data-embedded={embedded || undefined}>
      {!embedded && (
        <header className={s.head}>
          <MessageSquare size={16} aria-hidden="true" className={s.icon} />
          <h1 className={s.title} title={title}>
            {title}
          </h1>
          {project && <span className={s.project}>{project.name}</span>}
        </header>
      )}
      {error ? (
        <div className={s.error} role="alert">
          <p>{error}</p>
          {embedded && (
            <button type="button" className={s.close} onClick={() => tellParent({ kywaiPane: 'close' })}>
              {t('Cerrar')}
            </button>
          )}
        </div>
      ) : (
        <aside className={s.panel} aria-label={t('Chat, archivos, tareas y resultados')}>
          <LeftPanel />
        </aside>
      )}
      <FilePreview />
      <TaskTraceDialog />
      {hermesModelOpen && <HermesModelDialog onClose={() => useCowork.setState({ hermesModelOpen: false })} />}
    </div>
  )
}
