import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, ExternalLink, LoaderCircle, Plus, Search, Terminal, X } from 'lucide-react'
import type { AgentConfig } from '@shared/types'
import { AGENT_CATALOG, type CatalogEntry } from '@shared/agentCatalog'
import { api } from '@/lib/api'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './AddAgent.module.css'
import { t } from '@/lib/i18n'

/** Los argumentos como los escribe una persona: separados por espacios, sin comillas ni símbolos de consola. */
function splitArgs(text: string): string[] | null {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  return parts.every((p) => /^[\p{L}\p{N}_.:\-\/=,@{}]+$/u.test(p)) ? parts : null
}

/**
 * Elegir un agente para añadir: del catálogo (los que ya tienes con tu suscripción) o cualquier otro programa de
 * terminal. Al añadirlo se le da su robot y su estación; luego el asistente se encarga de instalarlo y de iniciar sesión.
 */
export function AddAgent({ existing, onClose, onAdded }: { existing: AgentConfig[]; onClose: () => void; onAdded: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [custom, setCustom] = useState(false)
  const [form, setForm] = useState({ name: '', command: '', promptVia: 'stdin' as 'stdin' | 'file' | 'arg', args: '', login: '' })

  const have = useMemo(() => new Set(existing.map((a) => a.cli?.presetId ?? a.id)), [existing])
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return AGENT_CATALOG.filter((e) => e.repeatable || !have.has(e.id)).filter(
      (e) => !q || `${e.name} ${e.summary} ${e.account} ${e.cli?.command ?? ''}`.toLowerCase().includes(q)
    )
  }, [have, query])

  async function add(entry: CatalogEntry): Promise<void> {
    const a = api
    if (!a || busy) return
    setBusy(entry.id)
    setError(null)
    try {
      const before = new Set(existing.map((x) => x.id))
      const cfg = await a.addAgent({ presetId: entry.id })
      const created = cfg.agents.find((x) => !before.has(x.id))
      onAdded(created?.id ?? entry.id)
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  async function addCustom(e: FormEvent): Promise<void> {
    e.preventDefault()
    const a = api
    if (!a || busy) return
    const args = splitArgs(form.args)
    if (!args) {
      setError(t('Los argumentos solo pueden llevar letras, números y . : - / = , @ (separados por espacios).'))
      return
    }
    setBusy('custom')
    setError(null)
    try {
      const before = new Set(existing.map((x) => x.id))
      const cfg = await a.addAgent({
        name: form.name.trim() || undefined,
        custom: {
          command: form.command.trim(),
          promptVia: form.promptVia,
          args,
          versionArgs: ['--version'],
          ...(form.login.trim() ? { login: form.login.trim() } : {})
        }
      })
      const created = cfg.agents.find((x) => !before.has(x.id))
      onAdded(created?.id ?? form.command.trim())
      onClose()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="addagent-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.dialog}>
        <header className={s.head}>
          <div>
            <h2 id="addagent-title" className={s.title}>
              {t('Añadir un agente')}
            </h2>
            <p className={s.subtitle}>
              {t('Conecta los agentes que ya usas con tu suscripción: AI Cowork los lanza con la sesión que tengas iniciada en ellos y les reparte trabajo como a los demás.')}
            </p>
          </div>
          <button type="button" className={cx(u.iconBtn, s.close)} aria-label={t('Cerrar')} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {!custom ? (
          <>
            <label className={s.search}>
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Buscar un agente…')} aria-label={t('Buscar un agente')} autoFocus />
            </label>
            <ul className={s.list}>
              {list.map((e) => (
                <li key={e.id} className={s.item} style={{ ['--agent' as string]: e.color }}>
                  <span className={s.dot} aria-hidden="true" />
                  <span className={s.itemText}>
                    <span className={s.itemName}>
                      {e.name}
                      {e.kind === 'cli' && <code className={s.cmd}>{e.cli?.command}</code>}
                      {e.kind === 'cli' && !e.verified && (
                        <span className={s.warn} title={e.note ?? t('Su forma de lanzarlo no se ha comprobado a fondo: puede necesitar ajustes.')}>
                          <AlertTriangle size={11} aria-hidden="true" /> {t('sin comprobar')}
                        </span>
                      )}
                    </span>
                    <span className={s.itemWhat}>{e.summary}</span>
                    <span className={s.itemAccount}>{e.account}</span>
                    {e.note && <span className={s.itemNote}>{e.note}</span>}
                  </span>
                  <span className={s.itemActions}>
                    {e.cli?.url && (
                      <button type="button" className={cx(u.iconBtn, s.link)} title={t('Más información')} aria-label={t('Más información sobre {name}', { name: e.name })} onClick={() => void api?.openExternal(e.cli!.url!)}>
                        <ExternalLink size={14} />
                      </button>
                    )}
                    <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!!busy} onClick={() => void add(e)}>
                      {busy === e.id ? <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
                      {t('Añadir')}
                    </button>
                  </span>
                </li>
              ))}
              {list.length === 0 && <li className={s.empty}>{t('No hay ningún agente que coincida. Prueba con «Otro programa…».')}</li>}
            </ul>
            <footer className={s.foot}>
              <p className={s.hint}>{t('¿No está el tuyo? Cualquier programa de terminal que atienda un encargo sirve.')}</p>
              <button type="button" className={u.btn} onClick={() => setCustom(true)}>
                <Terminal size={14} aria-hidden="true" /> {t('Otro programa…')}
              </button>
            </footer>
          </>
        ) : (
          <form className={s.form} onSubmit={(e) => void addCustom(e)}>
            <label>
              <span>{t('Nombre')}</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('Mi agente')} maxLength={40} />
            </label>
            <label>
              <span>{t('Programa (el comando que escribirías en la terminal)')}</span>
              <input
                value={form.command}
                onChange={(e) => setForm({ ...form, command: e.target.value })}
                placeholder="miagente"
                pattern="[\w.\-]+"
                required
                autoComplete="off"
              />
            </label>
            <label>
              <span>{t('Cómo recibe el encargo')}</span>
              <select value={form.promptVia} onChange={(e) => setForm({ ...form, promptVia: e.target.value as 'stdin' | 'file' | 'arg' })}>
                <option value="stdin">{t('Por la entrada estándar (stdin)')}</option>
                <option value="file">{t('En un archivo (')}{'{promptFile}'} {t('en los argumentos)')}</option>
                <option value="arg">{t('Como argumento (')}{'{prompt}'}{t(': se le pide leer el archivo del encargo)')}</option>
              </select>
            </label>
            <label>
              <span>{t('Argumentos de una consulta no interactiva')}</span>
              <input value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} placeholder="run --yes {promptFile}" autoComplete="off" />
            </label>
            <label>
              <span>{t('Para iniciar sesión (opcional)')}</span>
              <input value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} placeholder={t('miagente login')} autoComplete="off" />
            </label>
            <p className={s.hint}>
              {t('Se ejecuta en la carpeta del proyecto, con la sesión que ya tengas en él. El texto del encargo nunca va en la línea de órdenes.')}
            </p>
            <div className={s.formActions}>
              <button type="button" className={cx(u.btn, u.btnGhost)} onClick={() => setCustom(false)}>
                {t('Volver al catálogo')}
              </button>
              <button type="submit" className={cx(u.btn, u.btnPrimary)} disabled={!!busy || !form.command.trim()}>
                {busy === 'custom' && <LoaderCircle size={14} className={u.spin} aria-hidden="true" />}
                {t('Añadir')}
              </button>
            </div>
          </form>
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
