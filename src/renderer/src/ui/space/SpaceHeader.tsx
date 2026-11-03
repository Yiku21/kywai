import { Building2, Music, Pause, Play, RotateCcw } from 'lucide-react'
import { useCowork } from '@/store/cowork'
import { demoEngine } from '@/demo/engine'
import { toggleMusicPanel, useMusic } from '@/lib/music'
import { useDemoLabel, useDemoRunning } from '../common/useDemoEngine'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import s from './SpaceHeader.module.css'

/** Fila superior del panel del espacio digital (la demo se activa en ⋮ → «Modo demo»). */
export function SpaceHeader() {
  const mode = useCowork((st) => st.mode)
  const reduced = useCowork((st) => st.reducedEffects)
  const isDemo = mode === 'demo'

  return (
    <div className={s.bar}>
      <div className={s.titleWrap}>
        <Building2 size={20} aria-hidden="true" className={s.titleIcon} />
        <h2 className={s.title}>Espacio digital</h2>
      </div>

      <div className={s.right}>
        <MusicButton reduced={reduced} />
        {isDemo ? (
          <>
            <DemoControls reduced={reduced} />
            <span className={cx(s.pill, s.pillDemo)} title="Datos simulados: ninguna llamada a los agentes reales">
              <span className={s.pillDot} aria-hidden="true" />
              <span className={s.pillLong}>Demo · datos simulados</span>
              <span className={s.pillShort}>Demo</span>
            </span>
          </>
        ) : (
          <span className={cx(s.pill, s.pillLive)} title="Mostrando la actividad real de los agentes">
            <span className={cx(s.pillDot, !reduced && u.pulse)} aria-hidden="true" />
            En vivo
          </span>
        )}

      </div>
    </div>
  )
}

/** Abre la música; con una canción, minimiza / vuelve a abrir el reproductor. El punto indica que está sonando. */
function MusicButton({ reduced }: { reduced: boolean }) {
  const open = useMusic((st) => st.open)
  const mini = useMusic((st) => st.mini)
  const hasSong = useMusic((st) => !!st.videoId)
  const playing = useMusic((st) => st.status === 'playing')
  const label = !open ? 'Música de YouTube con luces al ritmo' : mini ? 'Abrir el reproductor' : hasSong ? 'Minimizar el reproductor (sigue sonando)' : 'Cerrar la música'
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
      <span className={s.musicLabel}>Música</span>
      {playing && <span className={cx(s.musicDot, !reduced && u.pulse)} aria-hidden="true" />}
    </button>
  )
}

function DemoControls({ reduced }: { reduced: boolean }) {
  const running = useDemoRunning()
  const label = useDemoLabel()
  return (
    <div className={s.demo} role="group" aria-label="Controles de la demo">
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
        aria-label={running ? 'Pausar la demo' : 'Reproducir la demo'}
        title={running ? 'Pausar la demo' : 'Reproducir la demo'}
      >
        {running ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
      </button>
      <button
        type="button"
        className={cx(u.iconBtn, u.iconBtnSm, s.ctl)}
        onClick={() => demoEngine.restart()}
        aria-label="Reiniciar la demo"
        title="Reiniciar la demo"
      >
        <RotateCcw size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
