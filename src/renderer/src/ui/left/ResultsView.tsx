import { useMemo } from 'react'
import { Package } from 'lucide-react'
import { useCowork, useData } from '@/store/cowork'
import { useAgentLookup } from '../common/agents'
import { ARTIFACT_KIND_LABEL, KindTile } from '../common/icons'
import { agentVars, shortTime } from '../common/util'
import u from '../common/ui.module.css'
import s from './Views.module.css'
import { t } from '@/lib/i18n'

/** Pestaña Resultados: cuadrícula de lo que ha generado el equipo. */
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
            </li>
          )
        })}
      </ul>
    </div>
  )
}
