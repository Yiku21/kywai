import { useId } from 'react'
import { Building2, MessageSquare, Share2 } from 'lucide-react'
import { useCowork, useData, type DataSlice } from '@/store/cowork'
import { api, isWeb } from '@/lib/api'
import { useMediaQuery } from './common/hooks'
import { TABS_QUERY } from './left/chatWidth'
import { cx } from './common/util'
import { QuotaChip } from './quota/QuotaChip'
import { CompactQuotas } from './header/CompactQuotas'
import { HeaderMenu } from './header/HeaderMenu'
import { LogoMark } from './header/LogoMark'
import { ProjectSelector } from './header/ProjectSelector'
import { AudioToggle } from './header/AudioToggle'
import { InboxButton } from './header/InboxButton'
import u from './common/ui.module.css'
import s from './Header.module.css'
import { t } from '@/lib/i18n'

function anyBusy(d: DataSlice): boolean {
  for (const id in d.runtimes) {
    const a = d.runtimes[id]?.activity
    if (a === 'thinking' || a === 'working') return true
  }
  return false
}

export function Header() {
  const mode = useCowork((st) => st.mode)
  const reduced = useCowork((st) => st.reducedEffects)
  const mobileView = useCowork((st) => st.mobileView)
  const setMobileView = useCowork((st) => st.setMobileView)
  const project = useCowork((st) => st.live.project)
  const quotas = useData((d) => d.quotas)
  const busy = useData(anyBusy)
  const compact = useMediaQuery('(max-width: 759.98px)')
  // Pestañas Chat / Espacio: también en ventanas de escritorio estrechas, donde el chat ocupa toda la ventana.
  const mobile = useMediaQuery(TABS_QUERY)
  const captionId = useId()

  const canOpenFolder = !!api && mode === 'live' && !!project
  const folderTitle = canOpenFolder
    ? t('Abrir carpeta del proyecto')
    : !api
      ? t('Sin motor de agentes: abre la app de escritorio')
      : mode === 'demo'
        ? t('No disponible en modo demo')
        : t('Abre o crea un proyecto primero')

  return (
    <header className={s.header}>
      <div className={s.brand}>
        <LogoMark />
        <span className={s.title}>AI Cowork</span>
        <span className={s.divider} aria-hidden="true" />
        <span className={s.team} title={busy ? t('Hay agentes trabajando') : t('El equipo está en espera')}>
          <span className={cx(s.teamDot, busy && s.teamDotBusy, busy && !reduced && u.pulse)} aria-hidden="true" />
          <span className={s.subtitle}>{t('Tu equipo de agentes')}</span>
          <span className="sr-only">{busy ? t('Equipo trabajando') : t('Equipo en espera')}</span>
        </span>
        {mode === 'demo' && (
          <span className={s.demoPill} title={t('Modo demo: datos simulados, sin llamadas a los agentes reales')}>
            {t('Demo')}
          </span>
        )}
        <ProjectSelector />
      </div>

      {mobile && (
        <div className={s.segmented} role="group" aria-label={t('Vista')}>
          <button
            type="button"
            className={s.segment}
            aria-pressed={mobileView === 'chat'}
            onClick={() => setMobileView('chat')}
          >
            <MessageSquare size={15} aria-hidden="true" />
            {t('Chat')}
          </button>
          <button
            type="button"
            className={s.segment}
            aria-pressed={mobileView === 'space'}
            onClick={() => setMobileView('space')}
          >
            <Building2 size={15} aria-hidden="true" />
            {t('Espacio')}
          </button>
        </div>
      )}

      <div className={s.actions}>
        {compact ? (
          quotas.length > 0 && <CompactQuotas quotas={quotas} />
        ) : (
          quotas.length > 0 && (
            <div className={s.quotaBlock}>
              <span className={s.quotaCaption} id={captionId}>
                {t('Cuota restante')}
              </span>
              <div className={s.chips} role="list" aria-labelledby={captionId}>
                {quotas.map((q) => (
                  <div role="listitem" key={q.id} className={s.chipItem}>
                    <QuotaChip quota={q} />
                  </div>
                ))}
              </div>
            </div>
          )
        )}
        {!isWeb && (
        <button
          type="button"
          className={cx(u.iconBtn, s.headerBtn)}
          aria-label={t('Abrir carpeta del proyecto')}
          title={folderTitle}
          disabled={!canOpenFolder}
          onClick={() => {
            if (api && project) api.openPath(project.id).catch(() => {})
          }}
        >
          <Share2 size={18} aria-hidden="true" />
        </button>
        )}
        {mode === 'live' && <InboxButton />}
        <AudioToggle />
        <HeaderMenu />
      </div>
    </header>
  )
}
