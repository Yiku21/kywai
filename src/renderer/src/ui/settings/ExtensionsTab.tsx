import { useEffect, useState } from 'react'
import { BadgeCheck, BookOpen, ExternalLink, Globe, Package, Pencil, Plus, RefreshCw, Search, Server, Trash2 } from 'lucide-react'
import type { ProviderKind } from '@shared/types'
import { MCP_AGENT_KINDS, parseMcpPaste, splitCommandLine, type McpAgentKind, type McpCatalogItem, type McpServerInfo, type McpServerInput, type PluginCatalogItem, type PluginInfo, type SkillCatalogItem, type SkillInfo } from '@shared/extensions'
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
  /** Qué es cada clave (del catálogo). */
  help?: Record<string, string>
  /** Viene del catálogo con algo entre <> o {} que hay que poner a mano. */
  needsEdit?: boolean
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

type Section = 'mcp' | 'skills' | 'plugins'

/**
 * Ajustes › Extensiones: los servidores MCP que añades tú y a qué agentes llegan (un chip por agente), y las
 * habilidades del equipo. Las dos cosas se pueden instalar desde su catálogo.
 */
export function ExtensionsTab() {
  const [section, setSection] = useState<Section>('mcp')
  return (
    <>
      <header className={s.head}>
        <h3 className={s.title}>{t('Extensiones')}</h3>
        <p className={s.subtitle}>{t('Herramientas y habilidades para los agentes, con su catálogo para instalarlas con un clic.')}</p>
      </header>
      <div className={s.seg} role="tablist" aria-label={t('Extensiones')}>
        <button type="button" role="tab" aria-selected={section === 'mcp'} className={cx(s.segBtn, section === 'mcp' && s.segOn)} onClick={() => setSection('mcp')}>
          <Server size={14} aria-hidden="true" />
          {t('Servidores MCP')}
        </button>
        <button type="button" role="tab" aria-selected={section === 'skills'} className={cx(s.segBtn, section === 'skills' && s.segOn)} onClick={() => setSection('skills')}>
          <BookOpen size={14} aria-hidden="true" />
          {t('Habilidades')}
        </button>
        <button type="button" role="tab" aria-selected={section === 'plugins'} className={cx(s.segBtn, section === 'plugins' && s.segOn)} onClick={() => setSection('plugins')}>
          <Package size={14} aria-hidden="true" />
          {t('Plugins')}
        </button>
      </div>
      {section === 'mcp' ? <McpSection /> : section === 'skills' ? <SkillsSection /> : <PluginsSection />}
    </>
  )
}

/**
 * Los servidores MCP que añades tú y a qué agentes llegan (un chip por agente). Al encender uno para un agente,
 * kywai lo prueba antes; si falla, se queda apagado y dice por qué.
 */
function McpSection() {
  const agents = useCowork((st) => st.config.agents)
  const live = useCowork((st) => st.mode === 'live') && !!api
  const [list, setList] = useState<McpServerInfo[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [catalog, setCatalog] = useState(false)

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

  /** Abre el formulario con lo entendido (si el nombre ya existe, se sugiere otro). */
  function open(first: McpServerInput, extra: Partial<Draft> = {}): void {
    let id = first.id
    for (let i = 2; list.some((x) => x.id === id); i++) id = `${first.id.slice(0, 28)}-${i}`
    setDraft({ ...draftFrom({ ...first, id }), ...extra })
  }

  function understand(): void {
    const r = parseMcpPaste(paste ?? '')
    if (typeof r === 'string') {
      setError(t(r))
      return
    }
    setError(null)
    setPaste(null)
    open(r[0])
  }

  function fromCatalog(item: McpCatalogItem): void {
    if (!item.install) return
    setCatalog(false)
    setError(null)
    open(item.install, { help: Object.fromEntries(item.keys.map((k) => [k.name, k.description])), needsEdit: item.needsEdit })
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
      <div className={s.bar}>
        <span className={s.muted}>{t('Servidores MCP que das a los agentes. Cada tarea recibe solo los que su agente tiene encendidos.')}</span>
        <span className={s.barBtns}>
          <button type="button" className={cx(u.btn, u.btnSm)} disabled={!live || paste !== null || !!draft} onClick={() => setPaste('')}>
            <Plus size={15} aria-hidden="true" />
            {t('Añadir a mano')}
          </button>
          <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!live || !!draft} aria-pressed={catalog} onClick={() => setCatalog(!catalog)}>
            <Search size={15} aria-hidden="true" />
            {catalog ? t('Cerrar catálogo') : t('Explorar catálogo')}
          </button>
        </span>
      </div>

      {catalog && live && <McpCatalog installed={list.map((x) => x.title.toLowerCase())} onInstall={fromCatalog} />}

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
                  {x.plugin && <span className={s.tag}>{t('Plugin: {name}', { name: x.plugin })}</span>}
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
      {draft.needsEdit && <p className={s.warnNote}>{t('Cambia lo que va entre <> o {} por tu valor antes de guardar.')}</p>}
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
          <div key={i} className={s.secretWrap}>
          <div className={s.secret}>
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
          {draft.help?.[x.name] && <span className={s.hint}>{t(draft.help[x.name])}</span>}
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

/** Catálogo de servidores: los destacados y, al buscar, el registro oficial de MCP. */
function McpCatalog({ installed, onInstall }: { installed: string[]; onInstall: (item: McpCatalogItem) => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<McpCatalogItem[]>([])
  const [next, setNext] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState('')

  async function load(q: string, cursor?: string): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const r = await api!.mcpCatalog(q, cursor)
      setItems((prev) => (cursor ? [...prev, ...r.items] : r.items))
      setNext(r.next)
      setSearched(q)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load('')
  }, [])

  return (
    <div className={s.catalog}>
      <form
        className={s.searchRow}
        onSubmit={(e) => {
          e.preventDefault()
          void load(query)
        }}
      >
        <input className={s.input} value={query} placeholder={t('Buscar en el registro oficial de MCP (notion, postgres, slack…)')} aria-label={t('Buscar')} onChange={(e) => setQuery(e.target.value)} />
        <button type="submit" className={cx(u.btn, u.btnSm)} disabled={loading}>
          {t('Buscar')}
        </button>
      </form>
      <p className={s.hint}>{searched ? t('Resultados del registro oficial de MCP. Cualquiera puede publicar en él: los marcados con ✓ son de empresas conocidas.') : t('Destacados. Busca para ver los miles del registro oficial de MCP.')}</p>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <ul className={s.list}>
        {items.map((x) => {
          const have = installed.includes(x.title.toLowerCase())
          return (
            <li key={x.name} className={s.item}>
              <span className={s.icon} aria-hidden="true">
                {x.kind === 'http' ? <Globe size={18} /> : <Server size={18} />}
              </span>
              <span className={s.text}>
                <span className={s.name}>
                  {x.title}
                  {x.verified && <BadgeCheck size={14} className={s.verified} aria-label={t('Verificado')} />}
                  <small>{x.name}</small>
                </span>
                {x.description && <span className={s.desc}>{t(x.description)}</span>}
                <span className={s.status}>
                  {x.kind === 'http' ? t('Remoto') : t('En este equipo')}
                  {x.keys.length > 0 && ` · ${t('Pide: {list}', { list: x.keys.map((k) => k.name).join(', ') })}`}
                  {x.unsupported && ` · ${x.unsupported}`}
                </span>
              </span>
              <span className={s.tools}>
                {(x.repo || x.website) && (
                  <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} title={t('Ver su página')} aria-label={t('Ver su página')} onClick={() => void api!.openExternal((x.repo || x.website)!)}>
                    <ExternalLink size={15} aria-hidden="true" />
                  </button>
                )}
                <button type="button" className={cx(u.btn, u.btnSm, !have && u.btnPrimary)} disabled={!x.install} onClick={() => onInstall(x)}>
                  {have ? t('Instalar otra vez') : t('Instalar')}
                </button>
              </span>
            </li>
          )
        })}
      </ul>
      {next && (
        <button type="button" className={cx(u.btn, u.btnSm, s.more)} disabled={loading} onClick={() => void load(searched, next)}>
          {t('Más resultados')}
        </button>
      )}
      {loading && <p className={s.muted}>{t('Buscando…')}</p>}
    </div>
  )
}

/** Las habilidades del equipo (carpeta «habilidades»): las instaladas y su catálogo. */
function SkillsSection() {
  const live = useCowork((st) => st.mode === 'live') && !!api
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [items, setItems] = useState<SkillCatalogItem[]>([])
  const [query, setQuery] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (!live) return
    api!.listSkills().then(setSkills, (e) => setError(errorText(e)))
    api!.skillCatalog('').then(setItems, () => undefined)
  }, [live])

  async function run(key: string, fn: () => Promise<void>): Promise<void> {
    setBusy(key)
    setError(null)
    setDone(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const installed = (r: { installed: string[]; skills: SkillInfo[] }): void => {
    setSkills(r.skills)
    setDone(t('Instalada: {list}', { list: r.installed.join(', ') }))
  }

  return (
    <>
      <p className={s.muted}>{t('Procedimientos escritos (SKILL.md) que leen todos los agentes, sea cual sea su programa. Están en la carpeta «habilidades» de kywai.')}</p>

      {live && skills.length === 0 && <p className={s.muted}>{t('Aún no hay ninguna. Instala alguna del catálogo o desde un enlace de GitHub.')}</p>}
      <ul className={s.list}>
        {skills.map((x) => (
          <li key={x.name} className={s.item}>
            <span className={s.icon} aria-hidden="true">
              <BookOpen size={18} />
            </span>
            <span className={s.text}>
              <span className={s.name}>{x.name}</span>
              {x.description && <span className={s.desc}>{x.description}</span>}
            </span>
            <span className={s.tools}>
              <button
                type="button"
                className={cx(u.iconBtn, u.iconBtnSm)}
                disabled={!!busy}
                title={t('Quitar')}
                aria-label={t('Quitar')}
                onClick={() => {
                  if (window.confirm(t('¿Quitar «{name}»? Dejará de llegar a los agentes.', { name: x.name }))) void run(`rm:${x.name}`, async () => setSkills(await api!.removeSkill(x.name)))
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className={s.catalog}>
        <span className={s.section}>{t('Instalar habilidades')}</span>
        <form
          className={s.searchRow}
          onSubmit={(e) => {
            e.preventDefault()
            void run('search', async () => {
              setItems(await api!.skillCatalog(query))
              setSearched(!!query.trim())
            })
          }}
        >
          <input className={s.input} value={query} disabled={!live} placeholder={t('Buscar en skills.sh (pdf, diseño, pruebas…)')} aria-label={t('Buscar')} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" className={cx(u.btn, u.btnSm)} disabled={!live || !!busy}>
            {t('Buscar')}
          </button>
        </form>
        <form
          className={s.searchRow}
          onSubmit={(e) => {
            e.preventDefault()
            void run('link', async () => {
              installed(await api!.installSkillLink(link))
              setLink('')
            })
          }}
        >
          <input className={cx(s.input, s.mono)} value={link} disabled={!live} spellCheck={false} placeholder="https://github.com/dueño/repositorio" aria-label={t('Enlace de GitHub')} onChange={(e) => setLink(e.target.value)} />
          <button type="submit" className={cx(u.btn, u.btnSm)} disabled={!live || !!busy || !link.trim()}>
            {busy === 'link' ? t('Instalando…') : t('Instalar desde el enlace')}
          </button>
        </form>
        <p className={s.hint}>{searched ? t('Resultados de skills.sh. Cualquiera puede publicar: los marcados con ✓ son de fuentes conocidas.') : t('Destacadas. Busca para ver las de skills.sh, o pega el enlace de un repositorio de GitHub con skills.')}</p>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        {done && <p className={s.okNote}>{done}</p>}
        <ul className={s.list}>
          {items.map((x) => {
            const key = `${x.source}/${x.skillId}`
            const have = skills.some((k) => k.name.toLowerCase() === (x.skillId || x.name).toLowerCase())
            return (
              <li key={key} className={s.item}>
                <span className={s.icon} aria-hidden="true">
                  <BookOpen size={18} />
                </span>
                <span className={s.text}>
                  <span className={s.name}>
                    {t(x.name)}
                    {x.verified && <BadgeCheck size={14} className={s.verified} aria-label={t('Verificado')} />}
                    <small>{x.source}</small>
                  </span>
                  {x.description && <span className={s.desc}>{t(x.description)}</span>}
                  {x.installs > 0 && <span className={s.status}>{t('{n} instalaciones', { n: x.installs.toLocaleString() })}</span>}
                </span>
                <span className={s.tools}>
                  <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} title={t('Ver su página')} aria-label={t('Ver su página')} onClick={() => void api!.openExternal(x.url ?? `https://github.com/${x.source}`)}>
                    <ExternalLink size={15} aria-hidden="true" />
                  </button>
                  <button type="button" className={cx(u.btn, u.btnSm, !have && u.btnPrimary)} disabled={!live || !!busy} onClick={() => void run(key, async () => installed(await api!.installSkill(x.source, x.skillId)))}>
                    {busy === key ? t('Instalando…') : have ? t('Instalar otra vez') : t('Instalar')}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      <p className={s.note}>{t('Las habilidades son instrucciones que siguen los agentes: instala solo las de fuentes en las que confíes. Los servidores MCP ejecutan programas en este equipo: revisa la orden antes de guardar.')}</p>
    </>
  )
}

/** Plugins con el formato de Claude Code: los instalados (y lo que trajo cada uno) y los de sus catálogos. */
function PluginsSection() {
  const live = useCowork((st) => st.mode === 'live') && !!api
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [items, setItems] = useState<PluginCatalogItem[]>([])
  const [markets, setMarkets] = useState<string[]>([])
  const [failed, setFailed] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [shown, setShown] = useState(30)

  async function search(q: string): Promise<void> {
    const r = await api!.pluginCatalog(q)
    setItems(r.items)
    setMarkets(r.marketplaces)
    setFailed(r.errors)
    setShown(30)
  }

  useEffect(() => {
    if (!live) return
    api!.listPlugins().then(setPlugins, (e) => setError(errorText(e)))
    search('').catch((e) => setError(errorText(e)))
  }, [live])

  async function run(key: string, fn: () => Promise<void>): Promise<void> {
    setBusy(key)
    setError(null)
    setDone(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const parts = (p: PluginInfo): string =>
    [p.skills.length && t('{n} habilidades', { n: p.skills.length }), p.mcp.length && t('{n} servidores MCP (apagados hasta que los enciendas)', { n: p.mcp.length })].filter(Boolean).join(' · ')

  const installedOk = (list: PluginInfo[], name: string): void => {
    setPlugins(list)
    const p = list.find((x) => x.name === name)
    if (p) setDone(t('Instalado {name}: {parts}', { name: p.title, parts: parts(p) || '—' }))
  }

  return (
    <>
      <p className={s.muted}>{t('Paquetes con el formato de los plugins de Claude Code. Sus habilidades, órdenes y subagentes llegan a todos los agentes como habilidades; sus servidores MCP se añaden apagados para que elijas a quién darlos.')}</p>

      {live && plugins.length === 0 && <p className={s.muted}>{t('Aún no hay ninguno instalado.')}</p>}
      <ul className={s.list}>
        {plugins.map((p) => (
          <li key={p.name} className={s.item}>
            <span className={s.icon} aria-hidden="true">
              <Package size={18} />
            </span>
            <span className={s.text}>
              <span className={s.name}>
                {p.title}
                {p.version && <small>{p.version}</small>}
              </span>
              {p.description && <span className={s.desc}>{p.description}</span>}
              <span className={s.status}>{parts(p) || t('Nada que kywai pueda usar')}</span>
              {p.skipped.length > 0 && <span className={s.status}>{t('Sin usar: {list}', { list: p.skipped.join('; ') })}</span>}
            </span>
            <span className={s.tools}>
              <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} disabled={!!busy} title={t('Ver su página')} aria-label={t('Ver su página')} onClick={() => void api!.openExternal(`https://github.com/${p.source.repo}${p.source.path ? `/tree/${p.source.ref}/${p.source.path}` : ''}`)}>
                <ExternalLink size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={cx(u.iconBtn, u.iconBtnSm)}
                disabled={!!busy}
                title={t('Quitar')}
                aria-label={t('Quitar')}
                onClick={() => {
                  if (window.confirm(t('¿Quitar «{name}»? Se borran sus habilidades y sus servidores MCP.', { name: p.title }))) void run(`rm:${p.name}`, async () => setPlugins(await api!.removePlugin(p.name)))
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className={s.catalog}>
        <span className={s.section}>{t('Instalar plugins')}</span>
        <form
          className={s.searchRow}
          onSubmit={(e) => {
            e.preventDefault()
            void run('search', () => search(query))
          }}
        >
          <input className={s.input} value={query} disabled={!live} placeholder={t('Buscar plugins (github, figma, seguridad, ventas…)')} aria-label={t('Buscar')} onChange={(e) => setQuery(e.target.value)} />
          <button type="submit" className={cx(u.btn, u.btnSm)} disabled={!live || !!busy}>
            {t('Buscar')}
          </button>
        </form>
        <form
          className={s.searchRow}
          onSubmit={(e) => {
            e.preventDefault()
            void run('link', async () => {
              const r = await api!.addPluginLink(link)
              setLink('')
              if (r.kind === 'marketplace') {
                await search(query)
                setDone(t('Catálogo añadido: {name}. Sus plugins ya salen en la lista.', { name: r.name }))
              } else installedOk(r.plugins, r.name)
            })
          }}
        >
          <input className={cx(s.input, s.mono)} value={link} disabled={!live} spellCheck={false} placeholder="https://github.com/dueño/repositorio" aria-label={t('Enlace de GitHub')} onChange={(e) => setLink(e.target.value)} />
          <button type="submit" className={cx(u.btn, u.btnSm)} disabled={!live || !!busy || !link.trim()}>
            {busy === 'link' ? t('Instalando…') : t('Añadir el enlace')}
          </button>
        </form>
        <p className={s.hint}>{t('Del catálogo oficial de plugins de Anthropic y del de plugins de trabajo. Pega el enlace de un plugin para instalarlo, o el de otro catálogo (marketplace) para añadirlo.')} {t('{n} plugins', { n: items.length })}</p>
        {markets.length > 2 && <p className={s.hint}>{t('Catálogos: {list}', { list: markets.join(', ') })}</p>}
        {failed.length > 0 && <p className={s.warnNote}>{t('No se pudo leer: {list}', { list: failed.join('; ') })}</p>}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        {done && <p className={s.okNote}>{done}</p>}
        <ul className={s.list}>
          {items.slice(0, shown).map((x) => {
            const key = `${x.marketplace}/${x.name}`
            const have = plugins.some((p) => p.name === x.name.toLowerCase())
            return (
              <li key={key} className={s.item}>
                <span className={s.icon} aria-hidden="true">
                  <Package size={18} />
                </span>
                <span className={s.text}>
                  <span className={s.name}>
                    {x.title}
                    {x.verified && <BadgeCheck size={14} className={s.verified} aria-label={t('Verificado')} />}
                    <small>{x.author ?? x.marketplace}</small>
                  </span>
                  {x.description && (
                    <span className={cx(s.desc, s.clamp)} title={x.description}>
                      {x.description}
                    </span>
                  )}
                  {x.category && <span className={s.status}>{x.category}</span>}
                </span>
                <span className={s.tools}>
                  {(x.homepage || x.source) && (
                    <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} title={t('Ver su página')} aria-label={t('Ver su página')} onClick={() => void api!.openExternal(x.homepage ?? `https://github.com/${x.source!.repo}`)}>
                      <ExternalLink size={15} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className={cx(u.btn, u.btnSm, !have && u.btnPrimary)}
                    disabled={!live || !!busy || !x.source}
                    title={x.source ? undefined : t('No está en GitHub: kywai aún no sabe descargarlo')}
                    onClick={() => void run(key, async () => installedOk(await api!.installPlugin(x.marketplace, x.name), x.name.toLowerCase()))}
                  >
                    {busy === key ? t('Instalando…') : have ? t('Instalar otra vez') : t('Instalar')}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
        {items.length > shown && (
          <button type="button" className={cx(u.btn, u.btnSm, s.more)} onClick={() => setShown((n) => n + 30)}>
            {t('Más resultados')}
          </button>
        )}
      </div>
      <p className={s.note}>{t('Los hooks y los servidores de lenguaje de un plugin no se instalan (los cambios de comportamiento llegarán con los mods). Los servidores MCP que solo admiten iniciar sesión en el navegador tampoco: aún no se pueden usar en las tareas.')}</p>
    </>
  )
}
