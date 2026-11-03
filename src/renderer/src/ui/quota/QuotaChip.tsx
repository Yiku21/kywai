import { useId, useRef, useState, type CSSProperties } from 'react'
import { AlertTriangle, Ban, HelpCircle } from 'lucide-react'
import type { QuotaInfo } from '@shared/types'
import { useCowork, useData } from '@/store/cowork'
import { useTweenedNumber } from '../common/hooks'
import { cx } from '../common/util'
import { describeQuota } from './quotaView'
import { QuotaPopover } from './QuotaPopover'
import s from './QuotaChip.module.css'

/** Indicador compacto de cuota: etiqueta + valor + barra fina. Al pulsarlo abre el detalle. */
export function QuotaChip({ quota, block = false }: { quota: QuotaInfo; block?: boolean }) {
  const thresholds = useCowork((st) => st.config.thresholds)
  const agents = useData((d) => d.agents)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const popId = useId()

  let agentColor: string | undefined
  for (const id of quota.agentIds) {
    if (agents[id]?.color) {
      agentColor = agents[id].color
      break
    }
  }
  const view = describeQuota(quota, thresholds, agentColor)
  const tween = useTweenedNumber(view.fixedValue == null ? view.pct : null)
  const value =
    view.fixedValue ?? `${view.estimate ? '≈' : ''}${Math.round(tween ?? view.pct ?? 0)}%`

  const Icon =
    view.variant === 'warn' || view.variant === 'alert'
      ? AlertTriangle
      : view.variant === 'empty'
        ? Ban
        : view.variant === 'unknown'
          ? HelpCircle
          : null

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={cx(s.chip, s[view.variant], view.estimate && s.estimate, block && s.block)}
        style={{ '--q': view.color, '--pct': `${view.barPct}%` } as CSSProperties}
        aria-label={view.sentence}
        title={view.sentence}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={s.row}>
          {Icon && <Icon size={13} strokeWidth={2.4} className={s.icon} aria-hidden="true" />}
          <span className={s.label}>{quota.label}</span>
          <span className={cx(s.value, view.variant === 'unlimited' && s.infinity)}>{value}</span>
        </span>
        <span className={s.track} aria-hidden="true">
          <span className={s.fill} />
        </span>
      </button>
      <QuotaPopover quota={quota} anchorRef={ref} open={open} onClose={() => setOpen(false)} id={popId} />
    </>
  )
}
