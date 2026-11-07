import { useEffect, useState } from 'react'
import { CircleCheck, Download, GitCommitHorizontal, LoaderCircle, RefreshCw, X } from 'lucide-react'
import type { UpdateStatus } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api, isClient } from '@/lib/api'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './RemoteAccess.module.css'
import { t } from '@/lib/i18n'

/** Buscar e instalar actualizaciones desde GitHub (⚙ → Buscar actualizaciones). */
export function UpdateDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const log = useCowork((st) => st.updateLog)
  const [logFrom, setLogFrom] = useState(0)

  async function check(): Promise<void> {
    const a = api
    if (!a) return
    setChecking(true)
    setError(null)
    try {
      setStatus(await a.checkForUpdates())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    void check()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !updating) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, updating])

  async function update(setAside = false): Promise<void> {
    const a = api
    if (!a || updating) return
    setLogFrom(useCowork.getState().updateLog.length)
    setUpdating(true)
    setError(null)
    try {
      const msg = await a.applyUpdate(setAside)
      // Si va bien, la app se reinicia sola; si vuelve un mensaje, es que no se pudo.
      if (msg) {
        setError(msg)
        setUpdating(false)
        void check()
      }
    } catch (e) {
      // Por web, la conexión se corta al reiniciarse: es lo esperado.
      setError(errorText(e))
      setUpdating(false)
    }
  }

  const n = status?.commits.length ?? 0
  const lines = log.slice(logFrom)
  // Cambios o commits hechos en este equipo (por ejemplo, por un agente) que impiden actualizar: se apartan.
  const localCommits = status?.localCommits ?? []
  const blockedLocal = !!status && !status.canUpdate && (!!status.localChanges?.length || localCommits.length > 0)

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="update-title" onMouseDown={(e) => e.target === e.currentTarget && !updating && onClose()}>
      <div className={s.dialog}>
        <header className={s.head}>
          <Download size={20} aria-hidden="true" className={s.headIcon} />
          <div>
            <h2 id="update-title" className={s.title}>
              {t('Actualizaciones')}
            </h2>
            <p className={s.subtitle}>
              {status?.current ? t('Versión actual: {hash} · {date} · {subject}', { hash: status.current.hash, date: status.current.date, subject: status.current.subject }) : t('Comprueba si hay cambios nuevos en GitHub.')}
            </p>
          </div>
          <button type="button" className={cx(u.iconBtn, s.close)} aria-label={t('Cerrar')} onClick={onClose} disabled={updating}>
            <X size={18} />
          </button>
        </header>

        <div className={s.body}>
          {isClient && (
            <p className={s.note}>
              {t('Esto actualiza el')} <strong>{t('servidor')}</strong> {t('al que estás conectado. Para actualizar este equipo (la app instalada aquí) usa «Actualizar este equipo…» en el menú ⚙.')}
            </p>
          )}
          {checking && !status ? (
            <p className={s.rowHint}>
              <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> {t('Consultando GitHub…')}
            </p>
          ) : status && !status.canUpdate && !n && !blockedLocal ? (
            <p className={s.warn}>{status.reason}</p>
          ) : n === 0 && !blockedLocal ? (
            <p className={cx(s.rowLabel)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CircleCheck size={18} style={{ color: 'var(--live)' }} aria-hidden="true" />
              {t('Tienes la última versión.')}
            </p>
          ) : (
            <div className={s.links}>
              <p className={s.rowLabel}>
                {n === 0
                  ? t('No hay cambios nuevos en GitHub')
                  : status?.pendingInstall
                    ? (n === 1 ? t('Hay código descargado sin instalar (1 cambio)') : t('Hay código descargado sin instalar ({n} cambios)', { n }))
                    : n === 1
                      ? t('Hay 1 cambio nuevo')
                      : t('Hay {n} cambios nuevos', { n })}
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {status!.commits.slice(0, 12).map((c) => (
                  <li key={c.hash} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
                    <GitCommitHorizontal size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 2, color: 'var(--text-3)' }} />
                    <span>
                      {c.subject} <span style={{ color: 'var(--text-3)' }}>· {c.date}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {status && !status.canUpdate && <p className={s.warn}>{status.reason}</p>}
              {!!status?.localChanges?.length && (
                <p className={s.note}>
                  {t('Cambiados aquí:')} {status.localChanges.slice(0, 8).join(', ')}
                  {status.localChanges.length > 8 ? t(' y {n} más', { n: status.localChanges.length - 8 }) : ''}{t('. Quedarán guardados en git (')}<code>git stash list</code> {t('en la carpeta del código) por si quieres recuperarlos.')}
                </p>
              )}
              {localCommits.length > 0 && (
                <p className={s.note}>
                  {t('Commits hechos aquí:')} {localCommits.slice(0, 4).map((c) => `«${c.subject}»`).join(', ')}
                  {localCommits.length > 4 ? t(' y {n} más', { n: localCommits.length - 4 }) : ''}{t('. Se guardan en una rama')} <code>apartado/…</code> {t('del código (no se borran) y la app queda como en GitHub.')}
                </p>
              )}
            </div>
          )}

          {(updating || lines.length > 0) && (
            <pre className={s.code} style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', margin: 0 }} aria-live="polite">
              {lines.slice(-14).join('\n') || t('Preparando…')}
            </pre>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className={cx(u.btn, u.btnGhost)} onClick={() => void check()} disabled={checking || updating}>
              <RefreshCw size={14} className={cx(checking && u.spin)} aria-hidden="true" />
              {t('Comprobar de nuevo')}
            </button>
            {n > 0 && status?.canUpdate && (
              <button type="button" className={cx(u.btn, u.btnPrimary)} onClick={() => void update()} disabled={updating}>
                {updating ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                {updating ? t('Actualizando…') : t('Actualizar y reiniciar')}
              </button>
            )}
            {blockedLocal && (
              <button type="button" className={cx(u.btn, u.btnPrimary)} onClick={() => void update(true)} disabled={updating}>
                {updating ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                {updating ? t('Actualizando…') : t('Apartar cambios y actualizar')}
              </button>
            )}
          </div>
          {updating && <p className={s.note}>{t('AI Cowork se reiniciará al terminar (unos minutos si hay que compilar). Las tareas en curso se detendrán.')}</p>}
        </div>

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
