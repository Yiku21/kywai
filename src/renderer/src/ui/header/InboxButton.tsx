import { useRef, useState } from 'react'
import { Bell, BellDot } from 'lucide-react'
import type { InboxItem } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { Popover } from '../common/Popover'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import s from '../Header.module.css'
import b from './InboxButton.module.css'
import { t } from '@/lib/i18n'

const KIND_LABEL: Record<string, string> = {
  plan: 'Plan',
  stalled: t('Agente parado'),
  'mac-permission': t('Permiso de macOS'),
  question: t('Pregunta'),
  'verify-failed': t('Revisión'),
  conflict: t('Choque'),
  failed: t('Fallo'),
  done: t('Terminado')
}

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60_000)
  if (m < 1) return t('ahora')
  if (m < 60) return t('hace {m} min', { m })
  const h = Math.round(m / 60)
  return h < 24 ? t('hace {h} h', { h }) : t('hace {Math} d', { Math: Math.round(h / 24) })
}

/**
 * Bandeja «Te necesita»: lo que espera una decisión tuya (un plan, un permiso de macOS en la pantalla del servidor,
 * un agente parado, choques al integrar…), con sus botones. Lo mismo sale en Órbita y en la web.
 */
export function InboxButton() {
  const items = useCowork((st) => st.inbox)
  const project = useCowork((st) => st.live.project)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const anchor = useRef<HTMLButtonElement>(null)
  if (!api) return null
  const count = items.length
  const Icon = count ? BellDot : Bell
  const label = count ? (count === 1 ? t('Te necesita: 1 aviso') : t('Te necesita: {count} avisos', { count })) : t('Te necesita: nada pendiente')

  async function act(item: InboxItem, actionId: string): Promise<void> {
    if (!api || busy) return
    setBusy(`${item.id}:${actionId}`)
    setNote(null)
    try {
      const r = await api.actInbox(item.id, actionId)
      if (r.message) setNote(r.message)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function goTo(item: InboxItem): Promise<void> {
    if (!api || !item.projectId || item.projectId === project?.id) return setOpen(false)
    try {
      useCowork.getState().loadProjectState(await api.loadProject(item.projectId))
      setOpen(false)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={cx(u.iconBtn, s.headerBtn, b.btn)}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon size={18} aria-hidden="true" />
        {count > 0 && (
          <span className={b.badge} aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} align="end" ariaLabel={t('Te necesita')} className={b.panel}>
        <div className={b.head}>{t('Te necesita')}</div>
        {note && <div className={b.note} role="status">{note}</div>}
        {count === 0 ? (
          <p className={b.empty}>{t('Nada pendiente. Aquí saldrá lo que espere una decisión tuya.')}</p>
        ) : (
          <ul className={b.list}>
            {items.map((item) => (
              <li key={item.id} className={cx(b.item, b[`k_${item.kind.replace('-', '_')}`])}>
                <div className={b.meta}>
                  <span className={b.kind}>{KIND_LABEL[item.kind] ?? item.kind}</span>
                  <span>{ago(item.createdAt)}</span>
                </div>
                <button type="button" className={b.title} onClick={() => void goTo(item)} title={item.projectId ? t('Ir al proyecto') : undefined}>
                  {item.title}
                </button>
                {item.detail && <p className={b.detail}>{item.detail}</p>}
                <div className={b.actions}>
                  {item.actions.map((a) =>
                    a.url ? (
                      <a key={a.id} className={cx(u.btn, u.btnSm)} href={a.url} target="_blank" rel="noopener noreferrer">
                        {a.label}
                      </a>
                    ) : (
                      <button
                        key={a.id}
                        type="button"
                        className={cx(u.btn, u.btnSm, (a.id === 'approve' || a.id === 'retry') && u.btnPrimary)}
                        disabled={!!busy}
                        onClick={() => void act(item, a.id)}
                      >
                        {busy === `${item.id}:${a.id}` ? '…' : a.label}
                      </button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Popover>
    </>
  )
}
