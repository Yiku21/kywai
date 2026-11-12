import { Building2, Music, PanelRightClose, Pause, Play, RotateCcw } from 'lucide-react'
import { useCowork } from '@/store/cowork'
import { demoEngine } from '@/demo/engine'
import { toggleMusicPanel, useMusic } from '@/lib/music'
import { useDemoLabel, useDemoRunning } from '../common/useDemoEngine'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import s from './SpaceHeader.module.css'
import { HomeNightToggle } from './HomeNightToggle'
import { t } from '@/lib/i18n'
import { useMediaQuery } from '../common/hooks'
import { TABS_QUERY } from '../left/chatWidth'

/** Fila superior del panel del espacio digital (la demo se activa en ⚙ → Ajustes → «Modo demo»). */
export function SpaceHeader() {
  const mode = useCowork((st) => st.mode)
  const reduced = useCowork((st) => st.reducedEffects)
  const isDemo = mode === 'demo'

  return (
    <div className={s.bar}>
      <div className={s.titleWrap} title={t('Espacio digital')}>
        <Building2 size={20} aria-hidden="true" className={s.titleIcon} />
        <h2 className={s.title}>{t('Espacio digital')}</h2>
      </div>

      <div className={s.right}>
        <HomeNightToggle />
        <MusicButton reduced={reduced} />
        {isDemo ? (
          <>
            <DemoControls reduced={reduced} />
            <span className={cx(s.pill, s.pillDemo)} title={t('Datos simulados: ninguna llamada a los agentes reales')}>
              <span className={s.pillDot} aria-hidden="true" />
              <span className={s.pillLong}>{t('Demo · datos simulados')}</span>
              <span className={s.pillShort}>{t('Demo')}</span>
            </span>
          </>
        ) : (
          <span className={cx(s.pill, s.pillLive)} title={t('Mostrando la actividad real de los agentes')}>
            <span className={cx(s.pillDot, !reduced && u.pulse)} aria-hidden="true" />
            {t('En vivo')}
          </span>
        )}
        <HideSpaceButton />
      </div>
    </div>
  )
}

/** Cierra el espacio 3D del todo: el chat ocupa toda la ventana y la escena se para hasta volver a abrirlo. */
function HideSpaceButton() {
  const setSpaceHidden = useCowork((st) => st.setSpaceHidden)
  // En ventana estrecha ya están las pestañas Chat / Espacio (y con Chat el 3D también se para).
  const narrow = useMediaQuery(TABS_QUERY)
  if (narrow) return null
  const label = t('Ocultar el espacio 3D (se para y el chat ocupa todo)')
  return (
    <button type="button" className={cx(u.iconBtn, u.iconBtnSm, s.hide)} onClick={() => setSpaceHidden(true)} aria-label={label} title={label}>
      <PanelRightClose size={16} aria-hidden="true" />
    </button>
  )
}

/** Abre la música; con una canción, minimiza / vuelve a abrir el reproductor. El punto indica que está sonando. */
function MusicButton({ reduced }: { reduced: boolean }) {
  const open = useMusic((st) => st.open)
  const mini = useMusic((st) => st.mini)
  const hasSong = useMusic((st) => !!st.videoId)
  const playing = useMusic((st) => st.status === 'playing')
  const label = !open ? t('Música con luces al ritmo (YouTube, Audius y radios)') : mini ? t('Abrir el reproductor') : hasSong ? t('Minimizar el reproductor (sigue sonando)') : t('Cerrar la música')
  return (
    <button
      type="button"
      className={cx(s.music, open && s.musicOn)}
      onClick={toggleMusicPanel}
      aria-pressed={open}
      aria-label={label}
      title={label}
    >
      <Music size={15} aria-hidden="true" />
      <span className={s.musicLabel}>{t('Música')}</span>
      {playing && <span className={cx(s.musicDot, !reduced && u.pulse)} aria-hidden="true" />}
    </button>
  )
}

function DemoControls({ reduced }: { reduced: boolean }) {
  const running = useDemoRunning()
  const label = useDemoLabel()
  return (
    <div className={s.demo} role="group" aria-label={t('Controles de la demo')}>
      {label && (
        <span className={s.scene} title={label} aria-live="polite">
          {running && <span className={cx(s.sceneDot, !reduced && u.pulse)} aria-hidden="true" />}
          {label}
        </span>
      )}
      <button
        type="button"
        className={cx(u.iconBtn, u.iconBtnSm, s.ctl)}
        onClick={() => (running ? demoEngine.stop() : demoEngine.start())}
        aria-label={running ? t('Pausar la demo') : t('Reproducir la demo')}
        title={running ? t('Pausar la demo') : t('Reproducir la demo')}
      >
        {running ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
      </button>
      <button
        type="button"
        className={cx(u.iconBtn, u.iconBtnSm, s.ctl)}
        onClick={() => demoEngine.restart()}
        aria-label={t('Reiniciar la demo')}
        title={t('Reiniciar la demo')}
      >
        <RotateCcw size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
