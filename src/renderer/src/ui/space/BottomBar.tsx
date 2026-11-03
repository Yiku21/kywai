import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowLeftRight, LayoutGrid, Maximize2, Minimize2, Sparkle, Sparkles, Users, ZoomIn, ZoomOut } from 'lucide-react'
import { useCowork, useData } from '@/store/cowork'
import { ACTIVITY_LABEL, useAgentLookup } from '../common/agents'
import { cx, plural } from '../common/util'
import u from '../common/ui.module.css'
import s from './BottomBar.module.css'

/** Una transferencia cuenta como activa durante este tiempo desde su creación. */
const ACTIVE_WINDOW_MS = 4000

/** Barra inferior del espacio: agentes conectados, transferencias y controles de cámara. */
export function BottomBar() {
  const agentOrder = useData((d) => d.agentOrder)
  const runtimes = useData((d) => d.runtimes)
  const transfers = useData((d) => d.transfers)
  const reduced = useCowork((st) => st.reducedEffects)
  const expanded = useCowork((st) => st.spaceExpanded)
  const setSpaceExpanded = useCowork((st) => st.setSpaceExpanded)
  const setReducedEffects = useCowork((st) => st.setReducedEffects)
  const cameraCommand = useCowork((st) => st.cameraCommand)
  const select = useCowork((st) => st.select)
  const lookup = useAgentLookup()

  // Las capas flotantes consumen Escape en document; la vista ampliada responde después.
  useEffect(() => {
    if (!expanded) return
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setSpaceExpanded(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [expanded, setSpaceExpanded])

  // Reevaluar una vez por segundo solo mientras haya transferencias recientes.
  const lastTs = transfers.length ? transfers[transfers.length - 1].createdAt : 0
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!lastTs || Date.now() - lastTs > ACTIVE_WINDOW_MS) return
    const id = window.setInterval(() => {
      setTick((n) => n + 1)
      if (Date.now() - lastTs > ACTIVE_WINDOW_MS) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [lastTs])

  const activeTransfers = useMemo(() => {
    const now = Date.now()
    let n = 0
    for (const t of transfers) if (now - t.createdAt < ACTIVE_WINDOW_MS) n++
    return n
    // `tick` fuerza el recálculo periódico.
  }, [transfers, tick])

  const connected = agentOrder.filter((id) => runtimes[id] && runtimes[id].activity !== 'offline').length

  const overview = (): void => {
    const cmd = { type: 'overview' as const }
    cameraCommand(cmd)
  }
  const zoom = (dir: 1 | -1): void => {
    const cmd = { type: 'zoom' as const, dir }
    cameraCommand(cmd)
  }

  return (
    <div className={s.bar}>
      <div className={s.status}>
        <div className={s.agents}>
          <Users size={18} aria-hidden="true" className={s.statusIcon} />
          <div className={s.dots}>
            {agentOrder.map((id) => {
              const look = lookup(id)
              const activity = runtimes[id]?.activity ?? 'offline'
              const busy = activity === 'thinking' || activity === 'working'
              const label = `${look.name}: ${ACTIVITY_LABEL[activity]}`
              return (
                <button
                  key={id}
                  type="button"
                  className={s.dotBtn}
                  onClick={() => select({ type: 'agent', id })}
                  aria-label={`${label}. Ver en el espacio`}
                  title={label}
                >
                  <span
                    className={cx(
                      s.dot,
                      activity === 'offline' && s.dotOff,
                      activity === 'error' && s.dotError,
                      busy && s.dotBusy,
                      busy && !reduced && u.pulse
                    )}
                    style={{ '--agent': look.color, '--pulse': look.color } as CSSProperties}
                  />
                </button>
              )
            })}
          </div>
          <span className={s.text}>
            {connected === 1 ? '1 agente conectado' : `${connected} agentes conectados`}
          </span>
          <span className={s.short} aria-hidden="true">
            {connected}
          </span>
        </div>
        <span className={s.divider} aria-hidden="true" />
        <div className={s.transfers}>
          <ArrowLeftRight size={16} aria-hidden="true" className={cx(s.statusIcon, activeTransfers > 0 && s.transferOn)} />
          <span className={s.text}>
            {activeTransfers === 1 ? '1 transferencia activa' : `${plural(activeTransfers, 'transferencia', 'transferencias')} activas`}
          </span>
          <span className={s.short} aria-hidden="true">
            {activeTransfers}
          </span>
        </div>
      </div>

      <div className={s.controls} role="group" aria-label="Controles de vista">
        <button type="button" className={cx(s.ctl, s.ctlPrimary)} onClick={overview} title="Vista general" aria-label="Vista general">
          <LayoutGrid size={16} aria-hidden="true" />
          <span className={s.ctlLabel}>Vista general</span>
        </button>
        <button type="button" className={s.ctl} onClick={() => zoom(1)} title="Acercar" aria-label="Acercar">
          <ZoomIn size={16} aria-hidden="true" />
          <span className={s.ctlLabel}>Acercar</span>
        </button>
        <button type="button" className={cx(s.ctl, s.ctlIconOnly)} onClick={() => zoom(-1)} title="Alejar" aria-label="Alejar">
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={s.ctl}
          onClick={() => setSpaceExpanded(!expanded)}
          aria-pressed={expanded}
          title={expanded ? 'Salir de pantalla completa' : 'Pantalla completa'}
          aria-label={expanded ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {expanded ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          <span className={s.ctlLabel}>{expanded ? 'Salir' : 'Pantalla completa'}</span>
        </button>
        <span className={s.ctlDivider} aria-hidden="true" />
        <button
          type="button"
          className={cx(s.ctl, reduced && s.ctlMuted)}
          onClick={() => setReducedEffects(!reduced)}
          aria-pressed={!reduced}
          title={reduced ? 'Efectos reducidos: pulsa para activar los efectos completos' : 'Efectos completos: pulsa para reducirlos'}
          aria-label="Efectos completos"
        >
          {reduced ? <Sparkle size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
          <span className={cx(s.ctlLabel, s.ctlLabelWide)}>{reduced ? 'Efectos reducidos' : 'Efectos completos'}</span>
        </button>
      </div>
    </div>
  )
}
