import { useEffect, useState } from 'react'
import { Globe, Pencil, Plus, RefreshCw, Server, Trash2 } from 'lucide-react'
import type { ProviderKind } from '@shared/types'
import { MCP_AGENT_KINDS, parseMcpPaste, splitCommandLine, type McpAgentKind, type McpServerInfo, type McpServerInput } from '@shared/extensions'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './ExtensionsTab.module.css'

const KIND_LABEL: Record<string, string> = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', hermes: 'Hermes', qwen: 'Qwen' }

/** Un formulario para añadir o cambiar un servidor. Las claves guardadas no se ven: vacías, se quedan como estaban. */
interface Draft {
  replaces?: string
  id: string
  title: string
  transport: 'stdio' | 'http'
  line: string
  url: string
  /** Variables (local) o cabeceras (remoto): nombre, valor nuevo y si ya hay uno guardado. */
  secrets: Array<{ name: string; value: string; saved: boolean }>
}

function lineOf(command = '', args: string[] = []): string {
  return [command, ...args].map((a) => (/[\s"']/.test(a) || !a ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')
}

function draftFrom(x: McpServerInput): Draft {
  const map = x.transport === 'http' ? (x.headers ?? {}) : (x.env ?? {})
  return {
    id: x.id,
    title: x.title ?? '',
    transport: x.transport,
    line: lineOf(x.command, x.args),
    url: x.url ?? '',
    secrets: Object.entries(map).map(([name, value]) => ({ name, value, saved: false }))
  }
}

function draftOf(x: McpServerInfo): Draft {
  return {
    replaces: x.id,
    id: x.id,
    title: x.title,
    transport: x.transport,
    line: lineOf(x.command, x.args),
    url: x.url ?? '',
    secrets: (x.transport === 'http' ? x.headerNames : x.envNames).map((name) => ({ name, value: '', saved: true }))
  }
}

function ago(at: number): string {
  const min = Math.round((Date.now() - at) / 60000)
  if (min < 2) return t('ahora mismo')
  if (min < 60) return t('hace {n} min', { n: min })
  const h = Math.round(min / 60)
  return h < 48 ? t('hace {n} h', { n: h }) : t('hace {n} días', { n: Math.round(h / 24) })
}

/**
 * Ajustes › Extensiones: los servidores MCP que añades tú y a qué agentes llegan (un chip por agente). Al encender
 * uno para un agente, kywai lo prueba antes; si falla, se queda apagado y dice por qué.
 */
export function ExtensionsTab() {
  const agents = useCowork((st) => st.config.agents)
  const live = useCowork((st) => st.mode === 'live') && !!api
  const [list, setList] = useState<McpServerInfo[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    if (!live) return
    api!
      .listMcpServers()
      .then(setList)
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoaded(true))
  }, [live])

  async function run(key: string, fn: () => Promise<McpServerInfo[]>): Promise<boolean> {
    setError(null)
    setBusy(key)
    try {
      setList(await fn())
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    } finally {
      setBusy(null)
    }
  }

  // Los tipos de agente que tiene el equipo (para los chips), con el color del primero de cada tipo.
  const kinds: Array<{ kind: ProviderKind; color: string; name: string }> = []
  for (const a of agents) if (a.enabled && !a.isSubagent && !kinds.some((k) => k.kind === a.provider)) kinds.push({ kind: a.provider, color: a.color, name: a.name })
  for (const k of MCP_AGENT_KINDS) if (!kinds.some((x) => x.kind === k)) kinds.push({ kind: k, color: 'var(--text-3)', name: KIND_LABEL[k] })
  // Primero los que pueden recibirlos (Claude, Codex, Gemini), en ese orden; después los demás, en gris.
  const rank = (k: ProviderKind): number => {
    const i = MCP_AGENT_KINDS.indexOf(k as McpAgentKind)
    return i < 0 ? 9 : i
  }
  kinds.sort((a, b) => rank(a.kind) - rank(b.kind))

  function understand(): void {
    const r = parseMcpPaste(paste ?? '')
    if (typeof r === 'string') {
      setError(t(r))
      return
    }
    setError(null)
    setPaste(null)
    const first = r[0]
    // Si el nombre ya existe, se sugiere otro.
    let id = first.id
    for (let i = 2; list.some((x) => x.id === id); i++) id = `${first.id.slice(0, 28)}-${i}`
    setDraft(draftFrom({ ...first, id }))
  }

  async function save(d: Draft): Promise<void> {
    const words = splitCommandLine(d.line)
    const map = Object.fromEntries(d.secrets.filter((x) => x.name.trim()).map((x) => [x.name.trim(), x.value]))
    const input: McpServerInput = {
      id: d.id.trim().toLowerCase(),
      title: d.title.trim() || undefined,
      transport: d.transport,
      ...(d.transport === 'stdio' ? { command: words[0] ?? '', args: words.slice(1), env: map } : { url: d.url.trim(), headers: map })
    }
    const ok = await run('save', () => api!.saveMcpServer(input, d.replaces))
    if (!ok) return
    setDraft(null)
    // Recién añadido o cambiado: se prueba enseguida para que se vea si funciona.
    await run(`test:${input.id}`, () => api!.testMcpServer(input.id))
  }

  function toggle(x: McpServerInfo, kind: McpAgentKind): void {
    const on = x.agents.includes(kind)
    const next = on ? x.agents.filter((k) => k !== kind) : [...x.agents, kind]
    void run(`agents:${x.id}:${kind}`, () => api!.setMcpServerAgents(x.id, next))
  }

  function remove(x: McpServerInfo): void {
    if (!window.confirm(t('¿Quitar «{name}»? Dejará de llegar a los agentes.', { name: x.title }))) return
    void run(`remove:${x.id}`, () => api!.removeMcpServer(x.id))
  }

  return (
    <>
      <header className={s.head}>
        <h3 className={s.title}>{t('Extensiones')}</h3>
        <p className={s.subtitle}>{t('Servidores MCP que das a los agentes. Cada tarea recibe solo los que su agente tiene encendidos.')}</p>
      </header>

      <div className={s.bar}>
        <span className={s.section}>{t('Servidores MCP')}</span>
        <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!live || paste !== null || !!draft} onClick={() => setPaste('')}>
          <Plus size={15} aria-hidden="true" />
          {t('Añadir servidor')}
        </button>
      </div>

      {!live && <p className={s.muted}>{t('No disponible en modo demo')}</p>}

      {paste !== null && (
        <div className={s.form}>
          <label className={s.label} htmlFor="mcp-paste">
            {t('Pega la línea de su README, su JSON o su dirección')}
          </label>
          <textarea
            id="mcp-paste"
            className={s.textarea}
            rows={4}
            autoFocus
            spellCheck={false}
            placeholder={'npx -y @playwright/mcp@latest\n{ "mcpServers": { … } }\nhttps://…/mcp'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className={s.actions}>
            <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => setPaste(null)}>
              {t('Cancelar')}
            </button>
            <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!paste.trim()} onClick={understand}>
              {t('Continuar')}
            </button>
          </div>
        </div>
      )}

      {draft && <DraftForm draft={draft} onChange={setDraft} onCancel={() => setDraft(null)} onSave={() => void save(draft)} saving={busy === 'save'} />}

      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}

      {live && loaded && !list.length && paste === null && !draft && (
        <p className={s.muted}>{t('Aún no hay ninguno. Añade uno pegando la línea de instalación de su README (por ejemplo «npx -y @playwright/mcp@latest»).')}</p>
      )}

      <ul className={s.list}>
        {list.map((x) => {
          const testing = busy === `test:${x.id}` || (busy?.startsWith(`agents:${x.id}:`) ?? false)
          return (
            <li key={x.id} className={s.item}>
              <span className={s.icon} aria-hidden="true">
                {x.transport === 'http' ? <Globe size={18} /> : <Server size={18} />}
              </span>
              <span className={s.text}>
                <span className={s.name}>
                  {x.title}
                  {x.title !== x.id && <small>{x.id}</small>}
                </span>
                <span className={s.cmd} title={x.transport === 'http' ? x.url : lineOf(x.command, x.args)}>
                  {x.transport === 'http' ? x.url : lineOf(x.command, x.args)}
                </span>
                <span className={cx(s.status, testing ? s.wait : x.test?.ok ? s.ok : x.test ? s.bad : undefined)}>
                  {testing
                    ? t('Probando… (la primera vez puede tardar: descarga el servidor)')
                    : x.test
                      ? `${x.test.ok ? '●' : '▲'} ${x.test.message} · ${ago(x.test.at)}`
                      : t('Sin probar')}
                </span>
              </span>
              <span className={s.side}>
                <span className={s.chips}>
                  {kinds.map(({ kind, color, name }) => {
                    const can = MCP_AGENT_KINDS.includes(kind as McpAgentKind)
                    const on = can && x.agents.includes(kind as McpAgentKind)
                    const label = can ? (KIND_LABEL[kind] ?? name) : name
                    return (
                      <button
                        key={kind}
                        type="button"
                        className={cx(s.chip, on && s.chipOn, !can && s.chipNo)}
                        style={{ ['--c' as string]: color }}
                        disabled={!can || !!busy}
                        aria-pressed={on}
                        title={can ? (on ? t('Llega a {name}: pulsa para quitárselo', { name: label }) : t('Dárselo a {name} (se prueba antes)', { name: label })) : t('{name} aún no puede recibir servidores MCP de kywai', { name: label })}
                        onClick={() => can && toggle(x, kind as McpAgentKind)}
                      >
                        <span className={s.dot} aria-hidden="true" />
                        {label}
                      </button>
                    )
                  })}
                </span>
                <span className={s.tools}>
                  <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} disabled={!!busy} title={t('Probar')} aria-label={t('Probar')} onClick={() => void run(`test:${x.id}`, () => api!.testMcpServer(x.id))}>
                    <RefreshCw size={15} className={cx(testing && u.spin)} aria-hidden="true" />
                  </button>
                  <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} disabled={!!busy || !!draft} title={t('Cambiar')} aria-label={t('Cambiar')} onClick={() => setDraft(draftOf(x))}>
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} disabled={!!busy} title={t('Quitar')} aria-label={t('Quitar')} onClick={() => remove(x)}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </span>
              </span>
            </li>
          )
        })}
      </ul>

      <p className={s.note}>
        {t('Al dárselo a un agente, kywai lo arranca y comprueba que responde. Si falla, se queda apagado y te dice por qué: ninguna tarea se rompe por una extensión. Hermes sabe qué herramientas tiene cada agente y reparte el trabajo con eso en cuenta.')}
      </p>
    </>
  )
}

function DraftForm({ draft, onChange, onCancel, onSave, saving }: { draft: Draft; onChange: (d: Draft) => void; onCancel: () => void; onSave: () => void; saving: boolean }) {
  const set = (p: Partial<Draft>): void => onChange({ ...draft, ...p })
  const setSecret = (i: number, p: Partial<Draft['secrets'][number]>): void => set({ secrets: draft.secrets.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  const http = draft.transport === 'http'
  return (
    <div className={s.form}>
      <div className={s.grid}>
        <label className={s.label}>
          {t('Nombre')}
          <input className={s.input} value={draft.id} spellCheck={false} maxLength={31} onChange={(e) => set({ id: e.target.value })} />
        </label>
        <label className={s.label}>
          {t('Título (opcional)')}
          <input className={s.input} value={draft.title} maxLength={80} placeholder={draft.id} onChange={(e) => set({ title: e.target.value })} />
        </label>
      </div>
      <label className={s.label}>
        {http ? t('Dirección') : t('Orden que lo arranca')}
        <input
          className={cx(s.input, s.mono)}
          spellCheck={false}
          value={http ? draft.url : draft.line}
          onChange={(e) => (http ? set({ url: e.target.value }) : set({ line: e.target.value }))}
        />
      </label>
      <div className={s.label}>
        {http ? t('Cabeceras (por ejemplo Authorization: Bearer …)') : t('Variables (claves de API, tokens…)')}
        {draft.secrets.map((x, i) => (
          <div key={i} className={s.secret}>
            <input className={cx(s.input, s.mono)} value={x.name} spellCheck={false} placeholder={http ? 'Authorization' : 'API_KEY'} aria-label={t('Nombre')} onChange={(e) => setSecret(i, { name: e.target.value })} />
            <input
              className={cx(s.input, s.mono)}
              type="password"
              autoComplete="off"
              value={x.value}
              placeholder={x.saved ? t('Guardada (vacía = no cambiarla)') : t('Valor')}
              aria-label={t('Valor')}
              onChange={(e) => setSecret(i, { value: e.target.value })}
            />
            <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} title={t('Quitar')} aria-label={t('Quitar')} onClick={() => set({ secrets: draft.secrets.filter((_, j) => j !== i) })}>
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost, s.addSecret)} onClick={() => set({ secrets: [...draft.secrets, { name: http ? 'Authorization' : '', value: '', saved: false }] })}>
          <Plus size={14} aria-hidden="true" />
          {http ? t('Añadir cabecera') : t('Añadir variable')}
        </button>
      </div>
      <p className={s.hint}>{t('Las claves se guardan cifradas en este equipo y no vuelven a mostrarse.')}</p>
      <div className={s.actions}>
        <button type="button" className={cx(u.btn, u.btnSm)} onClick={onCancel}>
          {t('Cancelar')}
        </button>
        <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={saving || !draft.id.trim() || !(http ? draft.url.trim() : draft.line.trim())} onClick={onSave}>
          {saving ? t('Guardando…') : t('Guardar y probar')}
        </button>
      </div>
    </div>
  )
}
