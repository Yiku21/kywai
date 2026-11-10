import { useEffect, useState } from 'react'
import { CheckCircle2, ExternalLink, LoaderCircle } from 'lucide-react'
import { accountBridge, refreshYoutubeAccount, signInYoutube, signOutYoutube, useYoutubeAccount } from '@/lib/youtubeAccount'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './MusicPanel.module.css'
import { t } from '@/lib/i18n'

const GOOGLE_SIGN_IN = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F'

/**
 * Pestaña YouTube: usar tu cuenta de YouTube. Con YouTube Premium el reproductor oficial suena sin anuncios.
 * En la app se inicia sesión en una ventana de Google; en el navegador se usa la sesión que ya tenga ese navegador.
 */
export function YoutubeAccountRow() {
  const on = useYoutubeAccount()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const app = accountBridge() !== null

  useEffect(() => {
    void refreshYoutubeAccount()
  }, [])

  async function run(fn: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setProblem(null)
    try {
      await fn()
    } catch (err) {
      setProblem(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const spinner = busy ? <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> : null

  return (
    <div className={s.ytAccount}>
      {on ? (
        <>
          <span className={s.ytAccountText}>
            <CheckCircle2 size={14} aria-hidden="true" className={s.ytAccountOk} />
            {app ? t('Con tu cuenta de YouTube: con Premium, sin anuncios.') : t('Con la sesión de YouTube de este navegador: con Premium, sin anuncios.')}
          </span>
          <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => void run(signOutYoutube)}>
            {spinner}
            {app ? t('Cerrar sesión') : t('Dejar de usarla')}
          </button>
        </>
      ) : (
        <>
          <span className={s.ytAccountText}>
            {app
              ? t('¿Tienes YouTube Premium? Inicia sesión con tu cuenta y sonará sin anuncios.')
              : t('¿Tienes YouTube Premium? Usa la sesión de YouTube de este navegador y sonará sin anuncios.')}
          </span>
          <button
            type="button"
            className={cx(u.btn, u.btnSm)}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const ok = await signInYoutube()
                if (!ok) setProblem(t('No se inició sesión en YouTube.'))
              })
            }
          >
            {spinner}
            {app ? t('Iniciar sesión en YouTube') : t('Usar mi cuenta')}
          </button>
          {!app && (
            <a className={s.source} href={GOOGLE_SIGN_IN} target="_blank" rel="noreferrer">
              {t('Entrar en YouTube')} <ExternalLink size={11} aria-hidden="true" />
            </a>
          )}
        </>
      )}
      {problem && (
        <p className={s.formError} role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
