import { useId, useMemo } from 'react'
import { ChevronRight, ExternalLink, Paperclip, Sparkles } from 'lucide-react'
import { useCowork, useData } from '@/store/cowork'
import { api } from '@/lib/api'
import { fileSize } from '@/lib/format'
import { useAgentLookup } from '../common/agents'
import { FileTypeIcon, KindTile, ARTIFACT_KIND_LABEL } from '../common/icons'
import { agentVars, cx, shortTime } from '../common/util'
import u from '../common/ui.module.css'
import s from './Views.module.css'
import { t } from '@/lib/i18n'

/** Pestaña Archivos: adjuntos del usuario y resultados generados. */
export function FilesView() {
  const attachments = useData((d) => d.attachments)
  const artifactsMap = useData((d) => d.artifacts)
  const mode = useCowork((st) => st.mode)
  const project = useCowork((st) => st.live.project)
  const openViewer = useCowork((st) => st.openViewer)
  const lookup = useAgentLookup()
  const idA = useId()
  const idG = useId()

  const artifacts = useMemo(
    () => Object.values(artifactsMap).sort((a, b) => b.createdAt - a.createdAt),
    [artifactsMap]
  )
  const canOpen = !!api && mode === 'live' && !!project
  const openTitle = canOpen
    ? undefined
    : mode === 'demo'
      ? t('Abrir archivos está disponible en modo real')
      : t('Sin motor de agentes: abre la app de escritorio')

  if (attachments.length === 0 && artifacts.length === 0) {
    return (
      <div className={s.scroll}>
        <div className={u.empty}>
          <span className={u.emptyIcon}>
            <Paperclip size={20} aria-hidden="true" />
          </span>
          <span className={u.emptyTitle}>{t('Aún no hay archivos')}</span>
          <span className={u.emptyText}>
            {t('Adjunta documentos o imágenes desde el chat (o arrástralos aquí). Lo que generen los agentes también aparecerá en esta pestaña.')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={s.scroll}>
      <section className={s.section} aria-labelledby={idA}>
        <h3 className={u.sectionLabel} id={idA}>
          {t('Adjuntos')} <span className={u.count}>{attachments.length}</span>
        </h3>
        {attachments.length === 0 ? (
          <p className={s.sectionEmpty}>{t('Todavía no has adjuntado archivos.')}</p>
        ) : (
          <ul className={s.rows}>
            {attachments.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={cx(s.fileRow, !canOpen && s.rowStatic)}
                  disabled={!canOpen}
                  title={openTitle ?? t('Abrir {name}', { name: a.name })}
                  onClick={() => {
                    if (api && project) api.openPath(project.id, a.relPath).catch(() => {})
                  }}
                >
                  <span className={s.fileIcon}>
                    <FileTypeIcon name={a.name} mime={a.mime} size={17} />
                  </span>
                  <span className={s.fileMain}>
                    <span className={s.fileName}>{a.name}</span>
                    <span className={s.fileMeta}>{fileSize(a.size)}</span>
                  </span>
                  {canOpen && <ExternalLink size={14} aria-hidden="true" className={s.rowAction} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.section} aria-labelledby={idG}>
        <h3 className={u.sectionLabel} id={idG}>
          {t('Generados')} <span className={u.count}>{artifacts.length}</span>
        </h3>
        {artifacts.length === 0 ? (
          <p className={s.sectionEmpty}>
            <Sparkles size={13} aria-hidden="true" /> {t('Los resultados del equipo aparecerán aquí.')}
          </p>
        ) : (
          <ul className={s.rows}>
            {artifacts.map((a) => {
              const look = lookup(a.agentId)
              return (
                <li key={a.id}>
                  <button type="button" className={s.fileRow} onClick={() => openViewer(a.id)} title={t('Ver {name}', { name: a.name })}>
                    <KindTile kind={a.kind} size={34} />
                    <span className={s.fileMain}>
                      <span className={s.fileName}>{a.name}</span>
                      <span className={s.fileMeta}>
                        <span className={s.agentDot} style={agentVars(look.color)} aria-hidden="true" />
                        {look.name} · {ARTIFACT_KIND_LABEL[a.kind]} · {fileSize(a.size)} · {shortTime(a.createdAt)}
                      </span>
                    </span>
                    <ChevronRight size={15} aria-hidden="true" className={s.rowAction} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
