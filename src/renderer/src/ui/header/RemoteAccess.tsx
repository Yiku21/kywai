import { useEffect, useState } from 'react'
import { Check, Copy, LoaderCircle, Monitor, RefreshCw, Smartphone, X } from 'lucide-react'
import type { AccessLogEntry, PairedDevice, WebAccessInfo } from '@shared/types'
import { api } from '@/lib/api'
import { fileSize, relativeTime } from '@/lib/format'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './RemoteAccess.module.css'
import { t } from '@/lib/i18n'

/** Panel del Mac para abrir AI Cowork desde el móvil o el portátil (red de Tailscale). */
export function RemoteAccess({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<WebAccessInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [httpsBusy, setHttpsBusy] = useState(false)

  useEffect(() => {
    api?.getWebAccess().then(setInfo, (e) => setError(errorText(e)))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function change(input: Parameters<NonNullable<typeof api>['setWebAccess']>[0]): Promise<void> {
    const a = api
    if (!a || busy) return
    setBusy(true)
    setError(null)
    try {
      setInfo(await a.setWebAccess(input))
    } catch (e) {
      setError(errorText(e))
      a.getWebAccess().then(setInfo, () => {})
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(text)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setError(t('No se pudo copiar: selecciona el enlace y cópialo a mano'))
    }
  }

  async function toggleHttps(on: boolean): Promise<void> {
    setHttpsBusy(true)
    try {
      await change({ https: on })
    } finally {
      setHttpsBusy(false)
    }
  }

  const link = (url: string) => `${url}/?t=${info?.token ?? ''}`
  const https = info?.https
  // Primero el enlace HTTPS (el único con micrófono en el móvil), si está activo.
  // Sin Tailscale Serve, la versión HTTPS propia (avisa la primera vez, pero también deja usar el micrófono).
  const urls = [
    ...(https?.active && https.url ? [https.url] : info?.secureUrl ? [info.secureUrl] : []),
    ...(info?.urls ?? [])
  ]

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="remote-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.dialog}>
        <header className={s.head}>
          <Smartphone size={20} aria-hidden="true" className={s.headIcon} />
          <div>
            <h2 id="remote-title" className={s.title}>
              {t('Acceso desde otros dispositivos')}
            </h2>
            <p className={s.subtitle}>{t('Usa AI Cowork desde el móvil o el portátil, con este equipo como servidor. Solo dentro de tu red de Tailscale.')}</p>
          </div>
          <button type="button" className={cx(u.iconBtn, s.close)} aria-label={t('Cerrar')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {!info ? (
          <p className={s.muted}>
            <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> {t('Cargando…')}
          </p>
        ) : (
          <div className={s.body}>
            <button type="button" role="switch" aria-checked={info.enabled} className={s.row} onClick={() => void change({ enabled: !info.enabled })} disabled={busy}>
              <span className={s.rowText}>
                <span className={s.rowLabel}>{t('Permitir el acceso por Tailscale')}</span>
                <span className={s.rowHint}>{t('Mientras esté activo, el equipo no suspende AI Cowork.')}</span>
              </span>
              <span className={cx(u.switch, info.enabled && u.switchOn)} aria-hidden="true" />
            </button>

            {info.enabled && (
              <>
                {!info.tailscaleIp && (
                  <p className={s.warn}>{t('No encuentro Tailscale conectado en este equipo. Ábrelo e inicia sesión; el acceso se activará solo en cuanto conecte.')}</p>
                )}
                {https && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={https.active}
                    className={s.row}
                    onClick={() => void toggleHttps(!https.active)}
                    disabled={busy || (!https.active && !!https.problem)}
                  >
                    <span className={s.rowText}>
                      <span className={s.rowLabel}>{t('HTTPS para usar el micrófono desde el móvil')}</span>
                      <span className={s.rowHint}>
                        {httpsBusy
                          ? t('Preparando HTTPS con Tailscale…')
                          : https.active
                            ? t('Activo: usa el enlace https. El navegador solo deja grabar notas de voz en páginas HTTPS.')
                            : (https.problem ??
                              (info.secureUrl
                                ? t('Opcional: con Tailscale Serve el navegador no avisa. Sin él ya tienes la versión https de arriba, con el certificado propio de AI Cowork (el navegador avisa la primera vez).')
                                : t('Lo publica Tailscale Serve con su certificado, solo dentro de tu red. El navegador solo deja grabar notas de voz con HTTPS.')))}
                      </span>
                    </span>
                    {httpsBusy ? (
                      <LoaderCircle size={16} className={u.spin} aria-hidden="true" />
                    ) : (
                      <span className={cx(u.switch, https.active && u.switchOn)} aria-hidden="true" />
                    )}
                  </button>
                )}
                {https?.enableUrl && (
                  <div className={s.warn}>
                    {t('Tu red de Tailscale todavía no permite HTTPS. Ábrelo, acepta y vuelve a activar el interruptor.')}{' '}
                    <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void api?.openExternal(https.enableUrl!)}>
                      {t('Permitir HTTPS en Tailscale')}
                    </button>
                  </div>
                )}
                <div className={s.links}>
                  <p className={s.rowLabel}>{t('Enlace de acceso')}</p>
                  <p className={s.rowHint}>{t('Ábrelo una vez en cada dispositivo (con Tailscale activo). Es tu llave: no lo compartas.')}</p>
                  {urls.map((url) => (
                    <div key={url} className={s.link}>
                      <code className={s.code}>{link(url)}</code>
                      <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void copy(link(url))}>
                        {copied === link(url) ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                        {copied === link(url) ? t('Copiado') : t('Copiar')}
                      </button>
                    </div>
                  ))}
                  <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost, s.regen)} onClick={() => void change({ regenerateToken: true })} disabled={busy}>
                    <RefreshCw size={13} aria-hidden="true" />
                    {t('Cambiar el código (anula los enlaces anteriores)')}
                  </button>
                </div>
                <MobilePairing token={info.token} copied={copied} onCopy={(t) => void copy(t)} />
                <PairedDevices />
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!info.restrictClients}
                  className={s.row}
                  onClick={() => void change({ restrictClients: !info.restrictClients })}
                  disabled={busy}
                >
                  <span className={s.rowText}>
                    <span className={s.rowLabel}>{t('Restringir los clientes a las carpetas de los proyectos')}</span>
                    <span className={s.rowHint}>
                      {info.restrictClients
                        ? t('Los clientes de escritorio solo ven las carpetas de los proyectos.')
                        : t('Los clientes pueden ver todo el disco de este equipo: eres tú desde otro sitio.')}
                    </span>
                  </span>
                  <span className={cx(u.switch, info.restrictClients && u.switchOn)} aria-hidden="true" />
                </button>
                <AccessLogList />
              </>
            )}

            <button
              type="button"
              role="switch"
              aria-checked={!!info.openAtLogin}
              className={s.row}
              onClick={() => void change({ openAtLogin: !info.openAtLogin })}
              disabled={busy}
            >
              <span className={s.rowText}>
                <span className={s.rowLabel}>{t('Abrir AI Cowork al iniciar sesión')}</span>
                <span className={s.rowHint}>{t('Para usarlo 24/7: si el equipo se reinicia, vuelve a estar disponible.')}</span>
              </span>
              <span className={cx(u.switch, info.openAtLogin && u.switchOn)} aria-hidden="true" />
            </button>

            <p className={s.note}>
              {t('En un Mac que haga de servidor, evita que se duerma: Ajustes del Sistema → Energía → «Evitar que el Mac entre en reposo automáticamente».')}
            </p>
          </div>
        )}

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}

/** Emparejar la app del móvil (Android): un código de 6 cifras que caduca, o el código de acceso entero. */
function MobilePairing({ token, copied, onCopy }: { token: string; copied: string | null; onCopy: (text: string) => void }) {
  const [pin, setPin] = useState<{ pin: string; expiresAt: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const left = pin ? Math.max(0, Math.ceil((pin.expiresAt - now) / 1000)) : 0

  useEffect(() => {
    if (!pin) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [pin])

  async function generate(): Promise<void> {
    const a = api
    if (!a) return
    setBusy(true)
    setProblem(null)
    try {
      const p = await a.mobilePairingPin()
      if (!p) setProblem(t('Activa antes el acceso por Tailscale.'))
      setPin(p)
      setNow(Date.now())
    } catch (e) {
      setProblem(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={s.links}>
      <p className={s.rowLabel}>{t('App del móvil (Android)')}</p>
      <p className={s.rowHint}>{t('Para emparejarla, escribe en la app uno de estos códigos.')}</p>
      {pin && left > 0 ? (
        <div className={s.pin}>
          <span className={s.pinCode} aria-label={t('Código {pin}', { pin: pin.pin.split('').join(' ') })}>
            {pin.pin.slice(0, 3)} {pin.pin.slice(3)}
          </span>
          <span className={s.rowHint}>
            {t('Válido {time} min y una sola vez.', { time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` })}
          </span>
        </div>
      ) : (
        <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary, s.regen)} onClick={() => void generate()} disabled={busy}>
          {busy ? <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> : <Smartphone size={13} aria-hidden="true" />}
          {pin ? t('Generar otro código de 6 cifras') : t('Generar código de 6 cifras')}
        </button>
      )}
      {problem && <p className={s.warn}>{problem}</p>}
      <p className={s.rowHint}>{t('O el código de acceso entero (distingue mayúsculas; también vale siempre):')}</p>
      <div className={s.link}>
        <code className={s.code}>{token}</code>
        <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => onCopy(token)}>
          {copied === token ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied === token ? t('Copiado') : t('Copiar')}
        </button>
      </div>
    </div>
  )
}

/** Móviles y clientes emparejados: cuándo se usaron por última vez y revocar uno sin tocar los demás. */
function PairedDevices() {
  const [devices, setDevices] = useState<PairedDevice[] | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  function refresh(): void {
    api?.listDevices().then(setDevices, (e) => setProblem(errorText(e)))
  }

  useEffect(() => {
    refresh()
    const t = window.setInterval(refresh, 15_000)
    return () => window.clearInterval(t)
  }, [])

  async function run(action: 'revoke' | 'forget', id: string): Promise<void> {
    const a = api
    if (!a) return
    setProblem(null)
    setConfirming(null)
    try {
      await (action === 'revoke' ? a.revokeDevice(id) : a.forgetDevice(id))
    } catch (e) {
      setProblem(errorText(e))
    }
    refresh()
  }

  if (!devices?.length && !problem) return null
  return (
    <div className={s.links}>
      <p className={s.rowLabel}>{t('Dispositivos emparejados')}</p>
      <p className={s.rowHint}>
        {t('Cada móvil o cliente tiene su propia llave. Revocar uno lo desempareja sin tocar los demás; los que llevan 90 días sin usarse dejan de valer solos.')}
      </p>
      {devices?.map((d) => {
        const Icon = d.kind === 'client' ? Monitor : Smartphone
        const revoked = !!d.revokedAt
        return (
          <div key={d.id} className={s.link}>
            <Icon size={15} aria-hidden="true" />
            <span className={s.rowText}>
              <span className={s.rowLabel}>
                {d.name}
                {d.platform ? ` · ${d.platform}` : ''}
              </span>
              <span className={s.rowHint}>
                {revoked ? t('Revocado') : t('Visto {when}', { when: relativeTime(d.lastSeenAt) })}
                {d.lastIp && !revoked ? ` · ${d.lastIp}` : ''}
              </span>
            </span>
            {revoked ? (
              <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void run('forget', d.id)}>
                {t('Quitar')}
              </button>
            ) : confirming === d.id ? (
              <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} onClick={() => void run('revoke', d.id)}>
                {t('Confirmar')}
              </button>
            ) : (
              <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setConfirming(d.id)}>
                {t('Revocar')}
              </button>
            )}
          </div>
        )
      })}
      {problem && <p className={s.warn}>{problem}</p>}
    </div>
  )
}

const ACTION_LABEL: Record<AccessLogEntry['action'], string> = {
  list: t('Vio la carpeta'),
  read: t('Abrió o bajó'),
  zip: t('Bajó como zip'),
  folder: t('Puso la carpeta de trabajo'),
  write: t('Escribió'),
  mkdir: t('Creó la carpeta'),
  trash: t('Mandó a la papelera'),
  denied: t('Se le negó')
}

/** Lo que han hecho los clientes y navegadores con los archivos de este equipo, lo más reciente primero. */
function AccessLogList() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<AccessLogEntry[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const load = (): void => {
      api?.getAccessLog(100).then(setEntries, (e) => setProblem(errorText(e)))
    }
    load()
    const t = window.setInterval(load, 10_000)
    return () => window.clearInterval(t)
  }, [open])

  return (
    <div className={s.links}>
      <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost, s.regen)} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? t('Ocultar el registro de accesos') : t('Ver el registro de accesos a los archivos')}
      </button>
      {open && (
        <>
          {entries && entries.length === 0 && <p className={s.rowHint}>{t('Todavía no ha entrado ningún cliente a los archivos.')}</p>}
          {entries?.map((e, i) => (
            <div key={`${e.t}-${i}`} className={s.rowText}>
              <span className={s.rowLabel}>
                {e.device} · {ACTION_LABEL[e.action]}
                {typeof e.bytes === 'number' ? ` · ${fileSize(e.bytes)}` : ''}
              </span>
              <span className={s.rowHint} title={e.path}>
                {relativeTime(e.t)} · {e.path}
                {e.note ? ` · ${e.note}` : ''}
              </span>
            </div>
          ))}
          {problem && <p className={s.warn}>{problem}</p>}
        </>
      )}
    </div>
  )
}
