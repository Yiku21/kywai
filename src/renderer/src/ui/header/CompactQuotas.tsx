import { useId, useRef, useState } from 'react'
import { AlertTriangle, Gauge } from 'lucide-react'
import type { QuotaInfo } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { Popover } from '../common/Popover'
import { cx, plural } from '../common/util'
import { QuotaChip } from '../quota/QuotaChip'
import { describeQuota, severity } from '../quota/quotaView'
import s from './CompactQuotas.module.css'
import { t } from '@/lib/i18n'

/** Botón "Cuotas" para pantallas estrechas: abre un popover con todos los chips. */
export function CompactQuotas({ quotas }: { quotas: QuotaInfo[] }) {
  const thresholds = useCowork((st) => st.config.thresholds)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const popId = useId()

  let worst = 0
  let flagged = 0
  for (const q of quotas) {
    const sev = severity(describeQuota(q, thresholds, undefined).variant)
    if (sev >= 2) flagged++
    worst = Math.max(worst, sev)
  }
  const tone = worst >= 3 ? s.alert : worst === 2 ? s.warn : undefined
  const label = flagged > 0 ? t('Cuotas: {n}', { n: plural(flagged, t('aviso'), t('avisos')) }) : t('Cuotas')

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={cx(s.btn, tone)}
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {flagged > 0 ? <AlertTriangle size={15} aria-hidden="true" /> : <Gauge size={15} aria-hidden="true" />}
        <span className={s.text}>{t('Cuotas')}</span>
        {flagged > 0 && <span className={s.badge}>{flagged}</span>}
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={ref}
        align="end"
        role="dialog"
        ariaLabel={t('Cuota restante')}
        id={popId}
        className={s.pop}
      >
        <div className={s.caption}>{t('Cuota restante')}</div>
        <ul className={s.list}>
          {quotas.map((q) => (
            <li key={q.id}>
              <QuotaChip quota={q} block />
            </li>
          ))}
        </ul>
      </Popover>
    </>
  )
}
