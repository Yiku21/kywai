import { useMemo, useState } from 'react'
import { CheckCircle2, Package } from 'lucide-react'
import type { InboxItem } from '@shared/types'
import { needsYou } from '@shared/inbox'
import { api } from '@/lib/api'
import { ago } from '../header/InboxButton'
import b from '../header/InboxButton.module.css'
import { cx } from '../common/util'
import { useCowork, useData } from '@/store/cowork'
import { useAgentLookup } from '../common/agents'
import { ARTIFACT_KIND_LABEL, KindTile } from '../common/icons'
import { agentVars, shortTime } from '../common/util'
import u from '../common/ui.module.css'
import s from './Views.module.css'
import { t } from '@/lib/i18n'
import { ArtifactDownloadButton } from './ArtifactDownloadButton'

/** Los avisos de «Terminado» que aún no has visto (de cualquier proyecto): no esperan nada de ti. */
export function useFinished(): InboxItem[] {
  const inbox = useCowork((st) => st.inbox)
  return useMemo(() => inbox.filter((i) => !needsYou(i)), [inbox])
}

/**
 * «Recién terminado»: lo que el equipo acabó y aún no has visto, encima de los resultados. Antes salía en
 * «Te necesita», pero no espera nada de ti; el móvil sigue avisando al terminar.
 */
function Finished() {
  const items = useFinished()
  const project = useCowork((st) => st.live.project)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  if (!api || !items.length) return null

  async function seen(list: InboxItem[]): Promise<void> {
    if (!api || busy) return
    setBusy(true)
    setNote(null)
    try {
      for (const i of list) await api.actInbox(i.id, i.actions.find((a) => a.id === 'dismiss')?.id ?? i.actions[0]?.id ?? 'dismiss')
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function goTo(item: InboxItem): Promise<void> {
    if (!api || !item.projectId || item.projectId === project?.id) return
    try {
      useCowork.getState().loadProjectState(await api.loadProject(item.projectId))
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section className={s.section} aria-label={t('Recién terminado')}>
      <h3 className={u.sectionLabel}>
        {t('Recién terminado')} · {items.length}
      </h3>
      {items.length > 1 && (
        <div>
          <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => void seen(items)}>
            {t('Marcar todo como visto')}
          </button>
        </div>
      )}
      {note && (
        <div className={b.note} role="status">
          {note}
        </div>
      )}
      <ul className={b.list}>
        {items.map((item) => (
          <li key={item.id} className={cx(b.item, b.k_done)}>
            <div className={b.meta}>
              <span className={b.kind}>
                <CheckCircle2 size={11} aria-hidden="true" /> {t('Nuevo')}
              </span>
              <span>{ago(item.createdAt)}</span>
            </div>
            <button type="button" className={b.title} onClick={() => void goTo(item)} title={item.projectId && item.projectId !== project?.id ? t('Ir al proyecto') : undefined}>
              {item.title}
            </button>
            {item.detail && <p className={b.detail}>{item.detail}</p>}
            <div className={b.actions}>
              <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => void seen([item])}>
                {t('Visto')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Pestaña Resultados: lo recién terminado y la cuadrícula de lo que ha generado el equipo. */
export function ResultsView() {
  const artifactsMap = useData((d) => d.artifacts)
  const openViewer = useCowork((st) => st.openViewer)
  const lookup = useAgentLookup()
  const artifacts = useMemo(
    () => Object.values(artifactsMap).sort((a, b) => b.createdAt - a.createdAt),
    [artifactsMap]
  )

  if (artifacts.length === 0) {
    return (
      <div className={s.scroll}>
        <Finished />
        <div className={u.empty}>
          <span className={u.emptyIcon}>
            <Package size={20} aria-hidden="true" />
          </span>
          <span className={u.emptyTitle}>{t('Sin resultados por ahora')}</span>
          <span className={u.emptyText}>
            {t('Páginas, documentos, código e imágenes que creen los agentes aparecerán aquí para abrirlos al momento.')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={s.scroll}>
      <Finished />
      <ul className={s.grid} aria-label={t('Resultados')}>
        {artifacts.map((a) => {
          const look = lookup(a.agentId)
          return (
            <li key={a.id}>
              <button
                type="button"
                className={s.card}
                onClick={() => openViewer(a.id)}
                aria-label={t('Abrir {name}, {kind} creado por {agent}', { name: a.name, kind: ARTIFACT_KIND_LABEL[a.kind], agent: look.name })}
              >
                <span className={s.cardTop}>
                  <KindTile kind={a.kind} size={40} />
                  <span className={s.cardKind}>{ARTIFACT_KIND_LABEL[a.kind]}</span>
                </span>
                <span className={s.cardName} title={a.name}>
                  {a.name}
                </span>
                <span className={s.cardMeta}>
                  <span className={s.agentDot} style={agentVars(look.color)} aria-hidden="true" />
                  <span className={s.cardAgent}>{look.name}</span>
                  <span className={s.cardTime}>{shortTime(a.createdAt)}</span>
                </span>
              </button>
              <ArtifactDownloadButton projectId={a.projectId} ids={[a.id]} name={a.name} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
