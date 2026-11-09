import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Settings2 } from 'lucide-react'
import type { HermesSetupResult, HermesSetupScan } from '@shared/imports'
import { api, clientBridge } from '@/lib/api'
import { t } from '@/lib/i18n'
import { cx, errorText } from '../common/util'
import m from './ImportDialog.module.css'

/**
 * Traer la configuración de Hermes / Hermes Desktop (en «Importar de otras apps»): sus skills propias a las
 * habilidades de kywai, lo que sabe del usuario a la habilidad «lo-que-sabe-hermes» y sus MCP a Extensiones.
 * `here` = el equipo de esta ventana (en un PC cliente, ese PC: lo lee la app de aquí y lo sube). El motor está en
 * src/main/hermesSetup.ts.
 */
export function HermesSetupPanel({ here, busy, setBusy }: { here: boolean; busy: boolean; setBusy: (b: boolean) => void }) {
  const bridge = clientBridge()
  const fromClient = here && !!bridge?.hermesSetupScan && !!bridge.hermesSetupSend
  const [scan, setScan] = useState<HermesSetupScan | null>(null)
  const [skills, setSkills] = useState<Set<string>>(new Set())
  const [memory, setMemory] = useState(false)
  const [mcp, setMcp] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)
  const [otherOs, setOtherOs] = useState(false)
  const [result, setResult] = useState<HermesSetupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load(): Promise<void> {
    if (!api) return
    try {
      let r: HermesSetupScan
      let other = false
      if (fromClient) {
        r = await bridge!.hermesSetupScan!(await api.hermesSetupStatus())
        // Un MCP con rutas de este PC no arranca en un servidor con otro sistema.
        const host = await api.getHostInfo().catch(() => null)
        other = !!host && !navigator.userAgent.toLowerCase().includes(host.platform === 'win32' ? 'windows' : host.platform === 'darwin' ? 'mac' : 'linux')
      } else {
        r = await api.scanHermesSetup()
      }
      setScan(r)
      setSkills(new Set(r.skills.filter((s) => s.own && !s.imported).map((s) => s.name)))
      setMemory(r.memory.length > 0 && !r.memoryImported)
      setOtherOs(other)
      setMcp(new Set(r.mcp.filter((s) => !s.imported && !(other && s.transport === 'stdio')).map((s) => s.id)))
    } catch (e) {
      setError(errorText(e))
    }
  }

  useEffect(() => {
    setScan(null)
    setResult(null)
    void load()
  }, [here])

  async function bring(): Promise<void> {
    if (!api || !scan) return
    setBusy(true)
    setError(null)
    try {
      const choice = { skills: [...skills], memory, mcp: [...mcp] }
      const r = fromClient ? await api.importHermesSetupFile(await bridge!.hermesSetupSend!(choice)) : await api.importHermesSetup(choice)
      setResult(r)
      await load()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  if (!scan?.found) return null
  const own = scan.skills.filter((s) => s.own)
  const listed = showAll ? scan.skills : own
  const toggle = (set: Set<string>, id: string, on: boolean): Set<string> => {
    const next = new Set(set)
    if (on) next.add(id)
    else next.delete(id)
    return next
  }
  const count = skills.size + mcp.size + (memory ? 1 : 0)

  return (
    <section className={cx(m.source, m.setup)}>
      <div className={m.sourceHead}>
        <Settings2 size={15} aria-hidden="true" />
        <strong>{t('Configuración de Hermes')}</strong>
        <span className={m.dim}>{t('skills, memoria y servidores MCP')}</span>
      </div>
      <p className={m.where}>{t('Lo que configuraste en Hermes Desktop pasa a kywai para todos los agentes. Tu modelo y las claves de tus proveedores no se copian: el Hermes de kywai ya usa los suyos.')}</p>

      {result && (
        <p className={m.setupDone} role="status">
          {t('Traído: {s} habilidades, {m} servidores MCP{mem}.', { s: result.skills.length, m: result.mcp.length, mem: result.memory ? t(' y la memoria') : '' })}
          {result.mcp.length > 0 && ` ${t('Los servidores quedan apagados: enciéndelos en Extensiones para los agentes que quieras.')}`}
          {result.skipped.map((x) => (
            <span key={x} className={m.setupSkip}>
              {x}
            </span>
          ))}
        </p>
      )}
      {error && (
        <p className={m.setupSkip} role="alert">
          {error}
        </p>
      )}

      {scan.memory.length > 0 && (
        <label className={m.session}>
          <input type="checkbox" checked={memory} disabled={busy} onChange={(e) => setMemory(e.target.checked)} />
          <span className={m.name}>{t('Lo que Hermes sabe de ti')}</span>
          <span className={m.dim}>{scan.memoryImported ? t('ya traída: se actualiza') : scan.memory.map((x) => x.name).join(' · ')}</span>
        </label>
      )}

      {scan.skills.length > 0 && (
        <>
          <div className={m.folderHead}>
            <button type="button" className={m.folderName} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              <span className={m.name}>{t('Skills')}</span>
              <span className={m.dim}>
                {showAll ? t('{n} en total (las de serie también)', { n: scan.skills.length }) : t('{n} tuyas de {total}', { n: own.length, total: scan.skills.length })}
              </span>
            </button>
          </div>
          <ul className={m.sessions}>
            {listed.map((s) => (
              <li key={s.name}>
                <label className={cx(m.session, s.imported && m.sessionDone)} title={s.description}>
                  <input type="checkbox" checked={s.imported || skills.has(s.name)} disabled={s.imported || busy} onChange={(e) => setSkills((x) => toggle(x, s.name, e.target.checked))} />
                  <span className={m.name}>{s.name}</span>
                  <span className={m.dim}>{s.imported ? t('ya está en kywai') : s.own ? t('tuya') : t('de serie')}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}

      {scan.mcp.length > 0 && (
        <ul className={m.sessions}>
          {scan.mcp.map((s) => (
            <li key={s.id}>
              <label className={cx(m.session, s.imported && m.sessionDone)} title={s.summary}>
                <input
                  type="checkbox"
                  checked={s.imported || mcp.has(s.id)}
                  disabled={s.imported || busy || (otherOs && s.transport === 'stdio')}
                  onChange={(e) => setMcp((x) => toggle(x, s.id, e.target.checked))}
                />
                <span className={m.name}>
                  {t('MCP')} · {s.id}
                </span>
                <span className={m.dim}>
                  {s.imported
                    ? t('ya está en Extensiones')
                    : otherOs && s.transport === 'stdio'
                      ? t('es un programa de este PC: en el servidor no arrancaría')
                      : s.secrets
                        ? t('con {n} claves (se guardan cifradas)', { n: s.secrets })
                        : ''}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className={m.setupFoot}>
        <button type="button" className={m.primary} disabled={busy || !count} onClick={() => void bring()}>
          {busy ? t('Trayendo…') : t('Traer {n}', { n: count })}
        </button>
      </div>
    </section>
  )
}
