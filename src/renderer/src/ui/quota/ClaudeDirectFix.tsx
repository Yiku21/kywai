import { useState } from 'react'
import { LoaderCircle, Wrench } from 'lucide-react'
import { api } from '@/lib/api'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './ClaudeDirectFix.module.css'
import { t } from '@/lib/i18n'

/**
 * Claude Code pasa por otro servidor (p. ej. OmniRoute) y por eso no da la cuota: botón para que use
 * directamente tu cuenta de Claude (la app quita el desvío de ~/.claude/settings.json y guarda una copia).
 */
export function ClaudeDirectFix() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  async function fix(): Promise<void> {
    const a = api
    if (!a || busy) return
    setBusy(true)
    setMsg(null)
    try {
      setMsg({ tone: 'ok', text: await a.fixClaudeDirect() })
    } catch (e) {
      setMsg({ tone: 'error', text: errorText(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.box}>
      {msg?.tone !== 'ok' && (
        <>
          <p className={s.text}>
            {t('Para ver la cuota, Claude Code tiene que ir directo a tu cuenta de Claude. Se quitará el desvío de ~/.claude/settings.json (se guarda una copia al lado); si hace falta, luego te pedirá iniciar sesión.')}
          </p>
          <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} onClick={() => void fix()} disabled={busy || !api}>
            {busy ? <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> : <Wrench size={13} aria-hidden="true" />}
            {busy ? t('Conectando…') : t('Conectar Claude directo a tu cuenta')}
          </button>
        </>
      )}
      {msg && (
        <p className={cx(s.text, msg.tone === 'error' && s.error)} role="status">
          {msg.text}
        </p>
      )}
    </div>
  )
}
