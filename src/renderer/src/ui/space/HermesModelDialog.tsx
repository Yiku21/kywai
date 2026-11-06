import { useEffect, useMemo, useState } from 'react'
import { Check, Cpu, LoaderCircle, RotateCcw, Search, X } from 'lucide-react'
import type { HermesModelsInfo } from '@shared/types'
import { api } from '@/lib/api'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import r from '../header/RemoteAccess.module.css'
import s from './HermesModelDialog.module.css'
import { locale, t } from '@/lib/i18n'

/** Cuántos modelos se pintan a la vez (OmniRoute tiene cientos: el buscador filtra). */
const SHOWN = 250

const when = (ts: number): string =>
  new Date(ts).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * «/model» en el chat o el panel de Hermes: con qué modelo coordina y los de sus proveedores con sesión, como
 * `hermes model` en la terminal. La elección vale para Hermes en AI Cowork (su configuración no se toca).
 */
export function HermesModelDialog({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<HermesModelsInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    if (!api) {
      setError(t('Sin motor de agentes: abre la app de escritorio'))
      return
    }
    api.getHermesModels().then(
      (i) => {
        setInfo(i)
        setProvider(i.providers.find((p) => p.id === i.current.provider)?.id ?? i.providers[0]?.id ?? null)
      },
      (e) => setError(errorText(e))
    )
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const current = info?.current
  const list = useMemo(() => info?.providers.find((p) => p.id === provider)?.models ?? [], [info, provider])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? list.filter((m) => m.toLowerCase().includes(q)) : list
  }, [list, query])

  async function choose(choice: { provider: string; model: string } | null): Promise<void> {
    const a = api
    if (!a || saving) return
    setSaving(true)
    setError(null)
    try {
      const next = await a.setHermesModel(choice)
      setInfo(next)
      setPicked(null)
      setSaved(choice ? t('Hermes usará {model} ({provider}) desde el próximo encargo.', { model: choice.model, provider: choice.provider }) : t('Hermes vuelve a usar el modelo de su configuración.'))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={r.backdrop} role="dialog" aria-modal="true" aria-labelledby="hermes-model-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx(r.dialog, s.dialog)}>
        <header className={r.head}>
          <Cpu size={20} aria-hidden="true" className={r.headIcon} />
          <div>
            <h2 id="hermes-model-title" className={r.title}>
              {t('Modelo de Hermes')}
            </h2>
            <p className={r.subtitle}>
              {t('Con el que Hermes planifica y reparte el trabajo. Los proveedores son los que tienes con sesión en Hermes, como en')}{' '}
              <code>hermes model</code>.
            </p>
          </div>
          <button type="button" className={cx(u.iconBtn, r.close)} aria-label={t('Cerrar')} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className={s.body}>
          {!info && !error && (
            <p className={s.note}>
              <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> {t('Leyendo los modelos de Hermes…')}
            </p>
          )}
          {info && !info.installed && <p className={s.note}>{t('Hermes Agent no está instalado en este equipo.')}</p>}
          {current && (
            <div className={s.current}>
              <div className={s.currentInfo}>
                <span className={s.currentLabel}>{t('Ahora')}</span>
                <span className={s.currentModel}>{current.model || t('El de su configuración')}</span>
                <span className={s.currentSub}>
                  {current.provider || t('proveedor de su configuración')} · {current.fromApp ? t('elegido en AI Cowork') : t('el de la configuración de Hermes')}
                </span>
              </div>
              {current.fromApp && (
                <button
                  type="button"
                  className={cx(u.btn, u.btnSm)}
                  disabled={saving}
                  title={info?.hermesDefault ? t('Volver a {model} ({provider})', { model: info.hermesDefault.model, provider: info.hermesDefault.provider }) : undefined}
                  onClick={() => void choose(null)}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  {t('Volver al de Hermes')}
                </button>
              )}
            </div>
          )}

          {info && info.providers.length === 0 && info.installed && (
            <p className={s.note}>
              {t('Hermes todavía no tiene listas de modelos. Abre')} <code>hermes model</code> {t('una vez en la terminal del Mac y vuelve aquí.')}
            </p>
          )}

          {info && info.providers.length > 0 && (
            <div className={s.picker}>
              <ul className={s.providers} aria-label={t('Proveedores')}>
                {info.providers.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={cx(s.provider, p.id === provider && s.providerOn)}
                      aria-pressed={p.id === provider}
                      onClick={() => {
                        setProvider(p.id)
                        setPicked(null)
                        setQuery('')
                      }}
                    >
                      <span className={s.providerName}>{p.label}</span>
                      <span className={s.providerCount}>
                        {p.models.length} {p.id === current?.provider ? t('· actual') : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className={s.models}>
                <label className={s.search}>
                  <Search size={14} aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    placeholder={t('Buscar entre {length} modelos…', { length: list.length })}
                    aria-label={t('Buscar modelo')}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                  />
                </label>
                <ul className={s.modelList} aria-label={t('Modelos')}>
                  {filtered.slice(0, SHOWN).map((m) => {
                    const isCurrent = provider === current?.provider && m === current?.model
                    return (
                      <li key={m}>
                        <button
                          type="button"
                          className={cx(s.model, m === picked && s.modelPicked, isCurrent && s.modelCurrent)}
                          aria-pressed={m === picked}
                          onClick={() => setPicked(m)}
                          onDoubleClick={() => provider && void choose({ provider, model: m })}
                        >
                          <span>{m}</span>
                          {isCurrent && <Check size={14} aria-label={t('Actual')} />}
                        </button>
                      </li>
                    )
                  })}
                  {filtered.length === 0 && <li className={s.note}>{t('Ningún modelo coincide.')}</li>}
                  {filtered.length > SHOWN && <li className={s.note}>{t('Y {n} más: escribe para buscar.', { n: filtered.length - SHOWN })}</li>}
                </ul>
              </div>
            </div>
          )}

          {saved && (
            <p className={s.saved} role="status">
              <Check size={14} aria-hidden="true" /> {saved}
            </p>
          )}
          {error && (
            <p className={s.error} role="alert">
              {error}
            </p>
          )}

          <div className={s.foot}>
            <span className={s.note}>
              {info?.updatedAt ? t('Listas de Hermes del {when}. ', { when: when(info.updatedAt) }) : ''}
              {t('Para actualizarlas:')} <code>hermes model --refresh</code> {t('en la terminal.')}
            </span>
            <button
              type="button"
              className={cx(u.btn, u.btnPrimary)}
              disabled={!picked || !provider || saving}
              onClick={() => picked && provider && void choose({ provider, model: picked })}
            >
              {saving ? <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
              {picked ? t('Usar {model}', { model: picked }) : t('Elige un modelo')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
