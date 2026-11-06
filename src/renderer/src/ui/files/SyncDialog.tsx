import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, FolderPlus, FolderSync, LoaderCircle, Pause, Play, RefreshCw, Trash2, X } from 'lucide-react'
import type { SyncPairStatus } from '@shared/sync'
import { clientBridge } from '@/lib/api'
import { relativeTime } from '@/lib/format'
import { requestServerFolder } from '@/lib/serverFiles'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './SyncDialog.module.css'
import { t } from '@/lib/i18n'

/** Carpetas sincronizadas con el servidor (solo en el cliente de escritorio: el motor corre en este equipo). */
export function SyncDialog({ onClose }: { onClose: () => void }) {
  const bridge = clientBridge()
  const [pairs, setPairs] = useState<SyncPairStatus[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      setPairs((await bridge?.syncList?.()) ?? [])
    } catch (e) {
      setError(errorText(e))
    }
  }, [bridge])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 2000)
    return () => window.clearInterval(t)
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function act(fn: () => Promise<unknown>): Promise<void> {
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function add(): Promise<void> {
    if (!bridge?.syncAdd) return
    setAdding(true)
    setError(null)
    try {
      // Primero la carpeta del servidor (el explorador), luego la de este equipo (el diálogo del sistema).
      const remote = await requestServerFolder()
      if (remote) await bridge.syncAdd(remote)
      await load()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setAdding(false)
    }
  }

  const supported = !!bridge?.syncList

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="sync-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.dialog}>
        <header className={s.head}>
          <FolderSync size={20} aria-hidden="true" className={s.headIcon} />
          <div>
            <h2 id="sync-title" className={s.title}>
              {t('Sincronizar carpetas')}
            </h2>
            <p className={s.subtitle}>
              {t('Mantiene una carpeta de este equipo igual que una del servidor, en los dos sentidos. Si el mismo archivo cambia en los dos lados se conservan las dos versiones, y lo que se borra en un lado va a la papelera del otro (con un aviso).')}
            </p>
          </div>
          <button type="button" className={cx(u.iconBtn, s.close)} aria-label={t('Cerrar')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className={s.body}>
          {!supported && <p className={s.warn}>{t('Esta versión del cliente no sincroniza carpetas: instala la nueva con ⋮ → «Actualizar este equipo…».')}</p>}
          {supported && pairs && pairs.length === 0 && <p className={s.empty}>{t('Todavía no sincronizas ninguna carpeta.')}</p>}
          {pairs?.map((p) => (
            <article key={p.id} className={s.pair}>
              <div className={s.pairHead}>
                <strong className={s.pairName}>{p.name}</strong>
                <span className={cx(s.state, s[`state_${p.phase}`])}>
                  {p.phase === 'syncing' && <LoaderCircle size={12} className={u.spin} aria-hidden="true" />}
                  {PHASE_LABEL[p.phase]}
                </span>
              </div>
              <p className={s.path} title={p.localDir}>
                {t('Este equipo:')} {p.localDir}
              </p>
              <p className={s.path} title={p.remoteDir}>
                {t('Servidor:')} {p.remoteDir}
              </p>
              <p className={s.meta}>
                {p.files} {p.files === 1 ? t('archivo') : t('archivos')}
                {p.lastSyncAt ? t(' · última vez {relativeTime}', { relativeTime: relativeTime(p.lastSyncAt) }) : t(' · todavía sin terminar una ronda')}
                {p.activity ? ` · ${p.activity}` : ''}
              </p>
              {p.problem && (
                <p className={s.problem} role={p.phase === 'paused' ? 'alert' : undefined}>
                  <AlertTriangle size={14} aria-hidden="true" /> {p.problem}
                </p>
              )}
              <div className={s.actions}>
                {p.phase === 'paused' && (
                  <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} onClick={() => void act(() => bridge!.syncConfirm!(p.id))}>
                    {t('Sí, continuar')}
                  </button>
                )}
                <button type="button" className={cx(u.btn, u.btnSm)} disabled={!p.enabled} onClick={() => void act(() => bridge!.syncNow!(p.id))}>
                  <RefreshCw size={13} aria-hidden="true" /> {t('Ahora')}
                </button>
                <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void act(() => bridge!.syncToggle!(p.id, !p.enabled))}>
                  {p.enabled ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                  {p.enabled ? t('Pausar') : t('Reanudar')}
                </button>
                <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => void act(() => bridge!.syncRemove!(p.id))} title={t('Deja de sincronizarla; no borra nada')}>
                  <Trash2 size={13} aria-hidden="true" /> {t('Quitar')}
                </button>
              </div>
              {p.notices.length > 0 && (
                <ul className={s.notices}>
                  {p.notices.slice(0, 4).map((n, i) => (
                    <li key={`${n.t}-${i}`}>
                      <span className={s.noticeTime}>{relativeTime(n.t)}</span> {n.message}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        <footer className={s.foot}>
          <p className={s.hint}>{t('No se sincronizan .git, node_modules, cachés ni temporales.')}</p>
          <button type="button" className={cx(u.btn, u.btnPrimary)} disabled={!supported || adding} onClick={() => void add()}>
            {adding ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : <FolderPlus size={14} aria-hidden="true" />}
            {t('Añadir una carpeta…')}
          </button>
        </footer>
      </div>
    </div>
  )
}

const PHASE_LABEL: Record<SyncPairStatus['phase'], string> = {
  idle: t('Al día'),
  syncing: t('Sincronizando'),
  paused: t('Parada: necesita tu OK'),
  error: t('Con un problema'),
  disabled: t('En pausa')
}
