import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CircleCheck, ExternalLink, Sparkles, X } from 'lucide-react'
import type { WhatsNew } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api, isWeb } from '@/lib/api'
import { cx } from '../common/util'
import u from '../common/ui.module.css'
import s from './RemoteAccess.module.css'
import { t } from '@/lib/i18n'

/**
 * «Novedades»: al abrir kywai después de una actualización, una ventana con las mejoras de la versión nueva.
 * Sale una sola vez por versión (al cerrarla se apunta como vista). No sale en el asistente inicial.
 * En el navegador y en el cliente de escritorio (la interfaz del servidor) se enseñan las novedades de la versión del
 * servidor y cada dispositivo apunta en su navegador cuál vio, así cada uno la ve una vez.
 */

const SEEN_KEY = 'kywai.novedades.vista'

function seenOnDevice(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

function markSeenOnDevice(version: string): void {
  try {
    localStorage.setItem(SEEN_KEY, version)
  } catch {
    // Sin almacenamiento (ventana privada): volverá a salir la próxima vez, no pasa nada.
  }
}

/** Web y cliente: las novedades del servidor si este dispositivo no las ha visto. */
async function deviceNews(): Promise<WhatsNew | null> {
  const news = await api!.latestWhatsNew()
  if (!news || news.failed || !news.items.length || seenOnDevice() === news.to) return null
  return news
}
export function WhatsNewDialog() {
  const [news, setNews] = useState<WhatsNew | null>(null)
  const ready = useCowork((st) => (isWeb || st.hasBackend) && st.configLoaded && !!st.config.setupDone && !st.setupOpen)

  useEffect(() => {
    if (!ready || !api) return
    let alive = true
    // Un poco después de abrir, para no taparlo todo mientras carga.
    const timer = window.setTimeout(() => {
      ;(isWeb ? deviceNews() : api!.getWhatsNew()).then(
        (n) => alive && setNews(n),
        () => undefined
      )
    }, 1500)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [ready])

  useEffect(() => {
    if (!news) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [news])

  function close(): void {
    if (isWeb) {
      if (news) markSeenOnDevice(news.to)
    } else void api?.markWhatsNewSeen().catch(() => undefined)
    setNews(null)
  }

  if (!news) return null
  return createPortal(
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="whats-new-title" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={s.dialog}>
        <header className={s.head}>
          <Sparkles size={20} aria-hidden="true" className={s.headIcon} />
          <div>
            <h2 id="whats-new-title" className={s.title}>
              {t('Novedades de kywai')}
            </h2>
            <p className={s.subtitle}>
              {news.from ? t('Se actualizó a la versión {to} (tenías la {from}).', { to: news.to, from: news.from }) : t('Se actualizó a la versión {to}. Estos son los últimos cambios:', { to: news.to })}
            </p>
          </div>
          <button type="button" className={cx(u.iconBtn, s.close)} aria-label={t('Cerrar')} onClick={close}>
            <X size={18} />
          </button>
        </header>

        <div className={s.body}>
          {news.items.length > 0 ? (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflow: 'auto' }}>
              {news.items.map((item) => (
                <li key={item} style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
                  <CircleCheck size={15} aria-hidden="true" style={{ flex: 'none', marginTop: 2, color: 'var(--live)' }} />
                  <span>{item}</span>
                </li>
              ))}
              {news.more > 0 && <li style={{ fontSize: 12.5, color: 'var(--text-3)', paddingLeft: 23 }}>{t('y {n} cambios más', { n: news.more })}</li>}
            </ul>
          ) : (
            <p className={s.rowHint}>{news.failed ? t('No se pudo cargar la lista de cambios.') : t('Esta versión trae arreglos internos.')}</p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {news.url && (
              <button type="button" className={cx(u.btn, u.btnGhost)} onClick={() => void api?.openExternal(news.url!)}>
                <ExternalLink size={14} aria-hidden="true" />
                {t('Ver en GitHub')}
              </button>
            )}
            <button type="button" className={cx(u.btn, u.btnPrimary)} onClick={close}>
              {t('Entendido')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
