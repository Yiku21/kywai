import { useEffect, useState } from 'react'
import { BadgeCheck, BookOpen, CircleHelp, Clapperboard, Send, ExternalLink, Globe, Package, Pencil, Plus, Puzzle, RefreshCw, Search, Server, Trash2 } from 'lucide-react'
import type { ElevenStatus, InstagramStatus, TikTokStatus, ProviderKind, VideoStudioStatus } from '@shared/types'
import { isVideoExtension } from '@shared/videoExtensions'
import { MCP_AGENT_KINDS, parseMcpPaste, splitCommandLine, type McpAgentKind, type McpCatalogItem, type McpRuntime, type McpServerInfo, type McpServerInput, type ModInfo, type PluginCatalogItem, type PluginInfo, type SkillCatalogItem, type SkillInfo } from '@shared/extensions'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'
import { shake } from '@/lib/shake'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './ExtensionsTab.module.css'
import { MODS_CHANGED } from '../left/ModsView'

/** Lo que instala el botón de un servidor que no arranca porque falta su programa. */
const RUNTIME_LABEL: Record<McpRuntime, string> = { uv: 'uv', node: 'Node.js', lightpanda: 'Lightpanda' }

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

type Section = 'mcp' | 'skills' | 'plugins' | 'mods' | 'video'

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
      <div className={s.segWrap}>
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
          <button type="button" role="tab" aria-selected={section === 'mods'} className={cx(s.segBtn, section === 'mods' && s.segOn)} onClick={() => setSection('mods')}>
            <Puzzle size={14} aria-hidden="true" />
            {t('Mods')}
          </button>
          <button type="button" role="tab" aria-selected={section === 'video'} className={cx(s.segBtn, section === 'video' && s.segOn)} onClick={() => setSection('video')}>
            <Clapperboard size={14} aria-hidden="true" />
            {t('Estudio de vídeo')}
          </button>
        </div>
      </div>
      {section === 'mcp' ? <McpSection /> : section === 'skills' ? <SkillsSection /> : section === 'plugins' ? <PluginsSection /> : section === 'mods' ? <ModsSection /> : <VideoSection />}
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
  const [badPaste, setBadPaste] = useState(false)
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
  // Primero los que pueden recibirlos (Claude, Codex, Gemini, Hermes), en ese orden; después los demás, en gris.
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
      setBadPaste(true)
      shake(document.getElementById('mcp-paste'))
      return
    }
    setBadPaste(false)
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
            onChange={(e) => {
              setPaste(e.target.value)
              if (badPaste) setBadPaste(false)
            }}
            aria-invalid={badPaste || undefined}
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
          const installing = busy === `runtime:${x.id}`
          const runtime = !testing && x.test && !x.test.ok ? x.test.runtime : undefined
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
                    : installing
                      ? t('Instalando {name}… (puede tardar unos minutos)', { name: RUNTIME_LABEL[x.test?.runtime ?? 'uv'] })
                      : x.test
                        ? `${x.test.ok ? '●' : '▲'} ${x.test.message} · ${ago(x.test.at)}`
                        : t('Sin probar')}
                </span>
                {runtime && !installing && (
                  <button
                    type="button"
                    className={cx(u.btn, u.btnSm, s.fixBtn)}
                    disabled={!!busy}
                    title={t('Se instala en el equipo donde trabajan los agentes, y después se vuelve a probar el servidor')}
                    onClick={() =>
                      void run(`runtime:${x.id}`, async () => {
                        const r = await api!.installMcpRuntime(x.id)
                        if (!r.ok) setError(r.message)
                        return r.servers
                      })
                    }
                  >
                    {t('Instalar {name}', { name: RUNTIME_LABEL[runtime] })}
                  </button>
                )}
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
    const video = r.skills.filter((x) => x.video && r.installed.includes(x.name)).map((x) => x.name)
    setDone(
      video.length === r.installed.length
        ? t('Instalada en el estudio de vídeo: {list}', { list: r.installed.join(', ') })
        : t('Instalada: {list}', { list: r.installed.join(', ') })
    )
  }

  return (
    <>
      <p className={s.muted}>{t('Procedimientos escritos (SKILL.md) que leen todos los agentes, sea cual sea su programa. Están en la carpeta «habilidades» de kywai.')}</p>

      {live && skills.length === 0 && <p className={s.muted}>{t('Aún no hay ninguna. Instala alguna del catálogo o desde un enlace de GitHub.')}</p>}
      <ul className={s.list}>
        {skills.map((x) => (
          <li key={x.name} className={s.item}>
            <span className={s.icon} aria-hidden="true" title={x.video ? t('De vídeo: está en la carpeta del estudio de vídeo y la usa el guion de los vídeos') : undefined}>
              {x.video ? <Clapperboard size={18} /> : <BookOpen size={18} />}
            </span>
            <span className={s.text}>
              <span className={s.name}>{x.name}</span>
              {x.description && <span className={s.desc}>{x.description}</span>}
              {x.video && <span className={s.status}>{t('En el estudio de vídeo')}</span>}
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
            <span className={s.icon} aria-hidden="true" title={p.video ? t('De vídeo: sus habilidades están en la carpeta del estudio de vídeo') : undefined}>
              {p.video ? <Clapperboard size={18} /> : <Package size={18} />}
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

const HOOK_LABEL: Record<string, string> = {
  'request.started': 'Al empezar una petición',
  'request.finished': 'Al acabar una petición',
  'task.started': 'Al empezar una tarea',
  'task.done': 'Al acabar bien una tarea',
  'task.failed': 'Al fallar una tarea'
}

/** Mods: cambian kywai en sí (órdenes «/…», hooks y paneles junto al chat). */
/**
 * Estudio de vídeo: qué tiene el equipo para montar vídeos («/video …», «créame un vídeo de …») e «Instalar lo que
 * falta». Se instala en el equipo donde corren los agentes, también si se pide desde la web.
 */
function VideoSection() {
  const live = useCowork((st) => st.mode === 'live') && !!api
  const [status, setStatus] = useState<VideoStudioStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const [ext, setExt] = useState<{ kind: 'skill' | 'plugin' | 'mcp'; name: string; desc: string }[]>([])

  // Mientras kywai lo instala solo, la lista se pone al día cada 15 s.
  useEffect(() => {
    if (!live || busy || !status?.installing) return
    const id = setInterval(() => api!.videoStudioStatus().then(setStatus, () => undefined), 15_000)
    return () => clearInterval(id)
  }, [live, busy, status?.installing])

  useEffect(() => {
    if (!live) return
    api!.videoStudioStatus().then(setStatus, (e) => setError(errorText(e)))
    // Lo instalado que es de vídeo: habilidades (carpeta del estudio), plugins y servidores MCP.
    void Promise.all([api!.listSkills(), api!.listPlugins(), api!.listMcpServers()]).then(
      ([sk, pl, mcp]) => {
        const videoPlugins = new Set(pl.filter((p) => p.video).map((p) => p.name))
        setExt([
          ...sk.filter((x) => x.video).map((x) => ({ kind: 'skill' as const, name: x.name, desc: x.description })),
          ...pl.filter((p) => p.video).map((p) => ({ kind: 'plugin' as const, name: p.title, desc: p.description })),
          ...mcp
            .filter((m) => (m.plugin && videoPlugins.has(m.plugin)) || isVideoExtension(m.id, m.title, m.command, (m.args ?? []).join(' '), m.url))
            .map((m) => ({ kind: 'mcp' as const, name: m.title, desc: m.agents.length ? t('Servidor MCP encendido') : t('Servidor MCP apagado: enciéndelo en «Servidores MCP»') }))
        ])
      },
      () => undefined
    )
  }, [live])

  const install = (): void => {
    setBusy(true)
    setError(null)
    setLog([])
    api!.installVideoStudio().then(
      (r) => {
        setStatus(r.status)
        setLog(r.log)
      },
      (e) => setError(errorText(e))
    ).finally(() => setBusy(false))
  }

  const rows: { label: string; ok: boolean; detail: string }[] = status
    ? [
        { label: t('Motor de animación (HyperFrames)'), ok: status.engine, detail: status.engine ? t('Instalado') : t('Falta') },
        { label: 'ffmpeg', ok: status.ffmpeg, detail: status.ffmpeg ? t('Instalado') : t('Falta') },
        {
          label: t('Voz'),
          ok: status.voice === 'voicebox' || status.voice === 'gemini' || status.voice === 'kokoro',
          detail:
            status.voice === 'voicebox'
              ? t('Voicebox en este equipo, gratis, con la voz del idioma del vídeo ({voices}); si no tiene ese idioma, {next}', {
                  voices: (status.voicebox?.voices ?? []).slice(0, 4).join(', '),
                  next: status.gemini ? 'Gemini' : 'Kokoro'
                })
              : status.voicebox?.running
                ? t('Voicebox está abierto pero sin voces: crea un perfil de voz en Voicebox')
                : status.voice === 'gemini'
              ? status.kokoro
                ? t('Gemini: la más natural, con tu clave (Kokoro de reserva)')
                : t('Gemini: la más natural, con tu clave (instala Kokoro de reserva)')
              : status.voice === 'kokoro'
                ? t('Kokoro: natural, gratis y en este equipo')
                : status.voice === 'system'
                  ? t('La del sistema (instala Kokoro para una más natural)')
                  : t('Sin voz')
        },
        {
          label: t('Voz con emoción (Chatterbox)'),
          ok: !!status.chatterbox,
          detail: status.chatterbox
            ? t('Instalada: cada frase suena alegre, triste o emocionada, con el timbre de la voz elegida')
            : t('Falta: «Instalar lo que falta» la instala (unos 5 GB con el modelo); mientras, la voz va sin emoción')
        },
        {
          label: t('Animaciones de fórmulas y diagramas (Manim)'),
          ok: !!status.manim,
          detail: status.manim ? t('Instalado') : t('Falta (opcional): «Instalar lo que falta» lo instala')
        },
        {
          label: t('Efectos de sonido'),
          ok: !!status.sfx?.earshot,
          detail: status.sfx?.earshot
            ? status.sfx.openverse
              ? t('Efectos reales: {earshot} de earshot y {openverse} de Openverse (CC0)', { earshot: status.sfx.earshot, openverse: status.sfx.openverse })
              : t('Efectos reales de earshot ({n}), hechos en este equipo', { n: status.sfx.earshot })
            : status.sfx?.openverse
              ? t('{n} sonidos libres (CC0) de Openverse; «Instalar lo que falta» instala earshot para tener más', { n: status.sfx.openverse })
              : t('Sintetizados por kywai: «Instalar lo que falta» instala earshot para tener efectos reales')
        },
        {
          label: t('Estilos de película (75, con muestras al escribir «/video»)'),
          ok: !!status.films?.library && !!status.films?.painted,
          detail:
            status.films?.library && status.films?.painted
              ? t('Instalados: la biblioteca Lemo-Opuscar y el kit de animación pintada con los robots')
              : status.films?.library || status.films?.painted
                ? t('Instalados a medias: «Instalar lo que falta» completa el resto')
                : t('Falta (opcional): «Instalar lo que falta» los instala, o se instalan solos con el primer vídeo con estilo')
        },
        {
          label: t('Escenas con movimiento (FreeVideo)'),
          ok: !!status.freevideo?.ready,
          detail: status.freevideo?.ready
            ? t('FreeVideo abierto: da movimiento a hasta 3 escenas por vídeo (cada una tarda varios minutos)')
            : status.freevideo?.installed
              ? t('FreeVideo instalado pero cerrado o sin el modelo: ábrelo para que kywai lo use')
              : t('Opcional: instala FreeVideo (github.com/FlashML-org/FreeVideo) para que las escenas clave se muevan. Su modelo MiniMax H3 tiene licencia propia con límites de uso')
        },
        {
          label: t('Imágenes'),
          ok: status.images !== null,
          detail:
            status.images === 'comfyui'
              ? t('ComfyUI en este equipo, gratis ({model}); Gemini de reserva si hay clave', { model: status.comfyui?.checkpoint ?? '' })
              : status.comfyui?.running
                ? t('ComfyUI está encendido pero sin un modelo que sirva (descarga uno SDXL o SD 1.5 en ComfyUI)')
                : status.images === 'gemini'
                  ? t('Las genera Gemini con tu clave de API (si enciendes ComfyUI, lo usa primero, gratis)')
                  : t('Sin ComfyUI ni clave de Gemini: fondos de diseño animados. Enciende ComfyUI (comfy.org) o pon la clave de Gemini')
        }
      ]
    : []
  const complete =
    !!status && status.ready && status.kokoro && !!status.chatterbox && !!status.manim && !!status.films?.library && !!status.films?.painted && !!status.sfx?.installed && !!status.sfx.earshot
  const autoInstalling = !busy && !!status?.installing

  return (
    <>
      <p className={s.muted}>
        {t('Escribe «/video» y el tema, o «créame un vídeo de…», o pulsa «Crear vídeo de esto» bajo un mensaje. Un agente escribe el guion y kywai pone la voz, las imágenes, la música, las animaciones y el montaje. Solo te llega el vídeo; el material de trabajo queda guardado en la carpeta oculta .ai-cowork/videos del proyecto. Para TikTok, Reels o Shorts, di «vertical».')}
      </p>
      <section className={s.block}>
        {status && (
          <ul className={s.list}>
            {rows.map((r) => (
              <li key={r.label} className={cx(s.item, !r.ok && s.off)}>
                <span className={s.icon} aria-hidden="true">
                  {r.ok ? <BadgeCheck size={18} /> : <Clapperboard size={18} />}
                </span>
                <span className={s.text}>
                  <span className={s.name}>{r.label}</span>
                  <span className={s.desc}>{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {live && (
          <div className={s.searchRow}>
            <button type="button" className={cx(u.btn, u.btnSm, !complete && u.btnPrimary)} disabled={busy || autoInstalling || !status} onClick={install}>
              {busy || autoInstalling ? t('Instalando… (puede tardar varios minutos)') : complete ? t('Comprobar e instalar otra vez') : t('Instalar lo que falta')}
            </button>
          </div>
        )}
        {live && autoInstalling && <p className={s.muted}>{t('kywai lo está instalando solo, en segundo plano: puedes seguir usando la app.')}</p>}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        {log.length > 0 && <pre className={s.mono}>{log.join('\n')}</pre>}
      </section>

      <ElevenPanel live={live} />
      <InstagramPanel live={live} />
      <TikTokPanel live={live} />

      <section className={s.block}>
        <span className={s.section}>{t('Extensiones de vídeo')}</span>
        <p className={s.muted}>
          {t('Las habilidades, plugins y servidores MCP de vídeo que instales en las otras pestañas vienen aquí solos: sus habilidades se guardan en la carpeta del estudio (habilidades/video) y el agente que escribe el guion de cada vídeo las lee.')}
        </p>
        {ext.length === 0 ? (
          <p className={s.muted}>{t('Aún no has instalado ninguna.')}</p>
        ) : (
          <ul className={s.list}>
            {ext.map((x) => (
              <li key={`${x.kind}:${x.name}`} className={s.item}>
                <span className={s.icon} aria-hidden="true">
                  {x.kind === 'skill' ? <BookOpen size={18} /> : x.kind === 'plugin' ? <Package size={18} /> : <Server size={18} />}
                </span>
                <span className={s.text}>
                  <span className={s.name}>{x.name}</span>
                  {x.desc && <span className={s.desc}>{x.desc}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

/** Un paso de una guía «¿Cómo lo hago?»: el texto y, si hace falta, la web que hay que abrir. */
interface GuideStep {
  text: string
  link?: { label: string; url: string }
}

/**
 * El título de una sección con su botón «¿Cómo lo hago?», que despliega debajo los pasos numerados para conseguir lo
 * que piden los cuadros (tokens, claves…), con botones que abren las webs. No envía nada: solo explica.
 */
function SectionWithGuide({ title, steps, note }: { title: string; steps: GuideStep[]; note?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className={s.sectionRow}>
        <span className={s.section}>{title}</span>
        <button type="button" className={cx(u.btn, u.btnSm, s.howBtn)} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <CircleHelp size={14} aria-hidden="true" />
          {open ? t('Ocultar la guía') : t('¿Cómo lo hago?')}
        </button>
      </div>
      {open && (
        <div className={s.howTo} role="region" aria-label={t('Guía: {title}', { title })}>
          <ol className={s.howSteps}>
            {steps.map((step, i) => (
              <li key={i}>
                {step.text}
                {step.link && (
                  <button type="button" className={s.howLink} onClick={() => window.open(step.link!.url, '_blank', 'noopener')}>
                    {step.link.label}
                    <ExternalLink size={12} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ol>
          {note && <p className={s.howNote}>{note}</p>}
        </div>
      )}
    </>
  )
}

/**
 * ElevenLabs v3: la voz de pago que más actúa (emociones, susurros, risas y diálogos). Con la clave, sus voces salen en
 * el paso «Voz» de /video para compararlas de oído con las gratis. La clave se guarda cifrada en este equipo.
 */
function ElevenPanel({ live }: { live: boolean }) {
  const [st, setSt] = useState<ElevenStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!live) return
    api!.elevenStatus().then(setSt, (e) => setError(errorText(e)))
  }, [live])

  const run = (fn: () => Promise<ElevenStatus>): void => {
    setBusy(true)
    setError(null)
    fn()
      .then((r) => {
        setSt(r)
        setKey('')
      }, (e) => setError(errorText(e)))
      .finally(() => setBusy(false))
  }

  return (
    <section className={s.block}>
      <SectionWithGuide
        title={t('Voz de ElevenLabs (de pago)')}
        steps={[
          { text: t('Crea una cuenta en elevenlabs.io (el plan gratis trae 10.000 caracteres al mes; un reel de un minuto gasta unos 1.000).'), link: { label: t('Abrir ElevenLabs'), url: 'https://elevenlabs.io/app/settings/api-keys' } },
          { text: t('En tu perfil → API Keys, pulsa «Create API Key», dale permiso de «Text to Speech» y de leer «Voices», y copia la clave (empieza por sk_).') },
          { text: t('Pégala aquí abajo y pulsa «Conectar». Si quieres más voces, añádelas a tu cuenta desde la biblioteca de voces de ElevenLabs: salen solas en /video.') }
        ]}
        note={t('No compartas la clave con nadie (tampoco en un chat): kywai la guarda cifrada en este equipo.')}
      />
      <p className={s.muted}>
        {t('Las voces de ElevenLabs (modelo v3) actúan cada frase: alegres, tristes, susurrando o riéndose, y hacen diálogos de dos personajes. Con la clave, salen en el paso «Voz» de /video junto a las gratis para que compares con el mismo guion.')}
      </p>
      {st?.connected ? (
        <ul className={s.list}>
          <li className={s.item}>
            <span className={s.icon} aria-hidden="true">
              <BadgeCheck size={18} />
            </span>
            <span className={s.text}>
              <span className={s.name}>{t('Conectada')}</span>
              <span className={s.desc}>{st.error ? st.error : typeof st.left === 'number' ? t('Te quedan {n} caracteres este mes', { n: st.left.toLocaleString() }) : t('Sus voces ya salen en /video')}</span>
            </span>
          </li>
        </ul>
      ) : (
        st && (
          <div className={s.searchRow}>
            <input className={s.input} type="password" autoComplete="off" spellCheck={false} placeholder={t('Clave de API (sk_…)')} aria-label={t('Clave de API de ElevenLabs')} value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
        )
      )}
      {live && st && (
        <div className={s.searchRow}>
          {st.connected ? (
            <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => run(() => api!.disconnectEleven())}>
              {t('Desconectar')}
            </button>
          ) : (
            <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy || !key.trim()} onClick={() => run(() => api!.connectEleven(key.trim()))}>
              {busy ? t('Comprobando…') : t('Conectar')}
            </button>
          )}
        </div>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

/**
 * El Instagram de kywai: la cuenta PROPIA de kywai (profesional), con el token de la API oficial de Meta. Nunca se pide
 * la contraseña. «/instagram» prepara el último vídeo con su texto; sin «Publicar sin preguntar», espera tu «Publicar».
 */
function InstagramPanel({ live }: { live: boolean }) {
  const [st, setSt] = useState<InstagramStatus | null>(null)
  const [token, setToken] = useState('')
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!live) return
    api!.instagramStatus().then(setSt, (e) => setError(errorText(e)))
  }, [live])

  const run = (fn: () => Promise<InstagramStatus>): void => {
    setBusy(true)
    setError(null)
    fn()
      .then((r) => {
        setSt(r)
        setToken('')
      }, (e) => setError(errorText(e)))
      .finally(() => setBusy(false))
  }

  return (
    <section className={s.block}>
      <SectionWithGuide
        title={t('El Instagram de kywai')}
        steps={[
          { text: t('Pon la cuenta de Instagram de kywai en modo profesional: en la app de Instagram, Configuración → Tipo de cuenta → Creador o Empresa. Es gratis.') },
          {
            text: t('Entra en developers.facebook.com → Mis apps → Crear app y elige el caso de uso «Administrar mensajes y contenido en Instagram» (si pregunta el tipo, «Empresa»).'),
            link: { label: t('Abrir Meta for Developers'), url: 'https://developers.facebook.com/apps' }
          },
          { text: t('Dentro de la app: Configuración de la API con inicio de sesión de Instagram → Generar identificadores de acceso → Añadir cuenta, e inicia sesión con el Instagram de kywai. Si llega una invitación de probador, acéptala en Instagram (Configuración → Apps y sitios web).') },
          { text: t('Junto a la cuenta sale un número: es el ID de la cuenta. Pulsa «Generar identificador» y copia el texto largo que empieza por IG…: es el token de acceso.') },
          { text: t('Pega los dos aquí abajo y pulsa «Conectar». El token dura unos 60 días: cuando caduque, kywai te avisa al publicar y repites el paso anterior.') }
        ]}
        note={t('Nunca hace falta la contraseña de Instagram. No compartas el token con nadie (tampoco en un chat): kywai lo guarda cifrado.')}
      />
      <p className={s.muted}>
        {t('Escribe «/instagram» (y, si quieres, qué debe decir el texto) y kywai prepara el último vídeo del chat con su texto para publicarlo en la cuenta de Instagram de kywai. Se conecta con la API oficial de Instagram: hace falta una cuenta profesional (de empresa o de creador) y un token de acceso de tu app de Meta. Nunca se pide la contraseña.')}
      </p>
      {st?.connected ? (
        <ul className={s.list}>
          <li className={s.item}>
            <span className={s.icon} aria-hidden="true">
              <BadgeCheck size={18} />
            </span>
            <span className={s.text}>
              <span className={s.name}>{st.username ? t('Conectada: @{name}', { name: st.username }) : t('Conectada')}</span>
              <span className={s.desc}>{st.autoPublish ? t('Publica sola: lo que prepara «/instagram» (también desde una rutina) sale sin preguntarte') : t('Te pide el visto bueno: cada reel espera tu «Publicar» en el chat y en «Te necesita»')}</span>
            </span>
          </li>
        </ul>
      ) : (
        st && (
          <div className={s.searchRow}>
            <input className={s.input} type="password" autoComplete="off" spellCheck={false} placeholder={t('Token de acceso (IG… o EAA…)')} aria-label={t('Token de acceso de Instagram')} value={token} onChange={(e) => setToken(e.target.value)} />
            <input className={s.input} inputMode="numeric" spellCheck={false} placeholder={t('ID de la cuenta (opcional)')} aria-label={t('ID de la cuenta de Instagram')} value={userId} onChange={(e) => setUserId(e.target.value)} />
          </div>
        )
      )}
      {live && st && (
        <div className={s.searchRow}>
          {st.connected ? (
            <>
              <button type="button" className={cx(u.btn, u.btnSm, !st.autoPublish && u.btnPrimary)} disabled={busy} onClick={() => run(() => api!.setInstagramAutoPublish(!st.autoPublish))}>
                <Send size={14} aria-hidden="true" />
                {st.autoPublish ? t('Volver a pedir mi visto bueno') : t('Publicar sin preguntar')}
              </button>
              <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => run(() => api!.disconnectInstagram())}>
                {t('Desconectar')}
              </button>
            </>
          ) : (
            <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy || !token.trim()} onClick={() => run(() => api!.connectInstagram(token.trim(), userId.trim() || undefined))}>
              {busy ? t('Comprobando…') : t('Conectar')}
            </button>
          )}
        </div>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

/**
 * El TikTok de kywai: la app propia en developers.tiktok.com (clave y secreto), el inicio de sesión de la cuenta (se
 * pega la dirección a la que vuelve TikTok) y los modos: borrador en la bandeja (desde el primer día) y publicar
 * directo cuando TikTok aprueba la app.
 */
function TikTokPanel({ live }: { live: boolean }) {
  const [st, setSt] = useState<TikTokStatus | null>(null)
  const [key, setKey] = useState('')
  const [secret, setSecret] = useState('')
  const [pasted, setPasted] = useState('')
  const [waiting, setWaiting] = useState(false)
  /** Volver a pegar la clave y el secreto (otra app, o las de producción tras usar el Sandbox). */
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!live) return
    api!.tiktokStatus().then(setSt, (e) => setError(errorText(e)))
  }, [live])

  const run = (fn: () => Promise<TikTokStatus>, after?: () => void): void => {
    setBusy(true)
    setError(null)
    fn()
      .then((r) => {
        setSt(r)
        after?.()
      }, (e) => setError(errorText(e)))
      .finally(() => setBusy(false))
  }

  const login = (): void => {
    setError(null)
    api!.tiktokLoginUrl().then(
      (url) => {
        window.open(url, '_blank', 'noopener')
        setWaiting(true)
      },
      (e) => setError(errorText(e))
    )
  }

  return (
    <section className={s.block}>
      <SectionWithGuide
        title={t('El TikTok de kywai')}
        steps={[
          {
            text: t('Entra en developers.tiktok.com con la cuenta de TikTok de kywai → Manage apps → Connect an app.'),
            link: { label: t('Abrir TikTok for Developers'), url: 'https://developers.tiktok.com/apps' }
          },
          { text: t('Rellena el icono, el nombre, la descripción y la categoría. También pide la dirección de unos términos del servicio y de una política de privacidad.') },
          { text: t('En Platforms marca «Desktop». En Products añade «Login Kit» y «Content Posting API» (con «Direct Post» activado). En Scopes: user.info.basic, video.upload y video.publish.') },
          { text: t('En Login Kit → Desktop → Redirect URI pon esta dirección: {uri}', { uri: st?.redirectUri || 'http://localhost:3455/tiktok/callback' }) },
          { text: t('Mientras TikTok no revise la app, usa el Sandbox: crea uno, añade la cuenta de kywai en «Target users» y copia su Client key y Client secret (salen en «Credentials»).') },
          { text: t('Pégalos aquí abajo y pulsa «Guardar». Luego «Iniciar sesión en TikTok», autoriza la cuenta de kywai y, cuando el navegador vaya a una página de localhost que no carga, copia esa dirección entera, pégala aquí y pulsa «Conectar».') },
          { text: t('Para publicar en público, pide la revisión de la app en developers.tiktok.com. Cuando la aprueben, pulsa «Desconectar» → «Cambiar la app», pega la clave y el secreto de producción (no los del Sandbox), vuelve a iniciar sesión y pulsa «TikTok ya aprobó la app».') }
        ]}
        note={t('Nunca hace falta la contraseña de TikTok. No compartas el Client secret con nadie (tampoco en un chat): kywai lo guarda cifrado.')}
      />
      <p className={s.muted}>
        {t('Escribe «/tiktok» y kywai prepara el último vídeo del chat con su texto para la cuenta de TikTok de kywai, con la API oficial de TikTok (nunca con la contraseña). Hace falta una app en developers.tiktok.com con «Login Kit» y «Content Posting API», y en Login Kit → Desktop esta dirección de vuelta: {uri}', { uri: st?.redirectUri ?? '' })}
      </p>
      {st && (!st.configured || changing) && (
        <div className={s.searchRow}>
          <input className={s.input} spellCheck={false} placeholder="Client key" aria-label={t('Client key de la app de TikTok')} value={key} onChange={(e) => setKey(e.target.value)} />
          <input className={s.input} type="password" autoComplete="off" spellCheck={false} placeholder="Client secret" aria-label={t('Client secret de la app de TikTok')} value={secret} onChange={(e) => setSecret(e.target.value)} />
          <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy || !live || !key.trim() || !secret.trim()} onClick={() => run(() => api!.setTikTokApp(key.trim(), secret.trim()), () => { setSecret(''); setChanging(false); setWaiting(false) })}>
            {t('Guardar')}
          </button>
        </div>
      )}
      {st?.configured && !st.connected && (
        <>
          <div className={s.searchRow}>
            <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy || !live} onClick={login}>
              {t('Iniciar sesión en TikTok')}
            </button>
            <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy || !live} aria-expanded={changing} onClick={() => setChanging((v) => !v)}>
              {changing ? t('Cancelar') : t('Cambiar la app')}
            </button>
          </div>
          {waiting && (
            <>
              <p className={s.muted}>{t('Autoriza la cuenta de kywai en TikTok. Al terminar, el navegador va a una página de localhost que no carga: copia esa dirección entera y pégala aquí.')}</p>
              <div className={s.searchRow}>
                <input className={s.input} spellCheck={false} placeholder="http://localhost:3455/tiktok/callback?code=…" aria-label={t('Dirección a la que volvió TikTok')} value={pasted} onChange={(e) => setPasted(e.target.value)} />
                <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={busy || !pasted.trim()} onClick={() => run(() => api!.connectTikTok(pasted.trim()), () => { setPasted(''); setWaiting(false) })}>
                  {busy ? t('Comprobando…') : t('Conectar')}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {st?.connected && (
        <ul className={s.list}>
          <li className={s.item}>
            <span className={s.icon} aria-hidden="true">
              <BadgeCheck size={18} />
            </span>
            <span className={s.text}>
              <span className={s.name}>{st.name ? t('Conectada: {name}', { name: st.name }) : t('Conectada')}</span>
              <span className={s.desc}>
                {st.canDirect
                  ? st.approved
                    ? t('Borrador o publicar directo en público (la app está aprobada por TikTok)')
                    : t('Borrador, o publicar directo solo en privado hasta que TikTok apruebe la app')
                  : t('Solo borrador: la cuenta no dio permiso para publicar directo')}
                {st.autoDraft ? ` · ${t('Los borradores se envían sin preguntar')}` : ''}
              </span>
            </span>
          </li>
        </ul>
      )}
      {live && st?.connected && (
        <div className={s.searchRow}>
          <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => run(() => api!.setTikTokOptions({ approved: !st.approved }))}>
            {st.approved ? t('La app aún no está aprobada') : t('TikTok ya aprobó la app')}
          </button>
          <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => run(() => api!.setTikTokOptions({ autoDraft: !st.autoDraft }))}>
            {st.autoDraft ? t('Pedirme antes de enviar borradores') : t('Enviar borradores sin preguntar')}
          </button>
          <button type="button" className={cx(u.btn, u.btnSm)} disabled={busy} onClick={() => run(() => api!.disconnectTikTok())}>
            {t('Desconectar')}
          </button>
        </div>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function ModsSection() {
  const live = useCowork((st) => st.mode === 'live') && !!api
  const [mods, setMods] = useState<ModInfo[]>([])
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (live) api!.listMods().then(setMods, (e) => setError(errorText(e)))
  }, [live])

  async function run(key: string, fn: () => Promise<ModInfo[]>, ok?: (list: ModInfo[]) => string): Promise<void> {
    setBusy(key)
    setError(null)
    setDone(null)
    try {
      const list = await fn()
      setMods(list)
      if (ok) setDone(ok(list))
      window.dispatchEvent(new Event(MODS_CHANGED))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const isFolder = (v: string): boolean => /^(\/|~|[A-Za-z]:[\\/])/.test(v.trim())

  return (
    <>
      <p className={s.muted}>{t('Cambian kywai en sí: órdenes «/algo» para el chat, hooks que hacen algo al empezar o acabar una petición o una tarea, y paneles que se abren junto al chat (pestaña «Mods»). Cada mod es una carpeta con su kywai-mod.json.')}</p>

      <form
        className={s.searchRow}
        onSubmit={(e) => {
          e.preventDefault()
          const v = link.trim()
          void run('add', () => (isFolder(v) ? api!.installModFolder(v) : api!.installModLink(v)), (list) => {
            setLink('')
            const last = list[list.length - 1]
            return t('Instalado: {name}', { name: last?.title ?? v })
          })
        }}
      >
        <input className={cx(s.input, s.mono)} value={link} disabled={!live} spellCheck={false} placeholder={t('https://github.com/dueño/repo/tree/main/mi-mod o una carpeta de este equipo')} aria-label={t('Enlace de GitHub o carpeta')} onChange={(e) => setLink(e.target.value)} />
        <button type="submit" className={cx(u.btn, u.btnSm, u.btnPrimary)} disabled={!live || !!busy || !link.trim()}>
          {busy === 'add' ? t('Instalando…') : t('Instalar mod')}
        </button>
      </form>
      <p className={s.hint}>
        {t('Prueba con el de ejemplo:')}{' '}
        <button type="button" className={s.linkBtn} onClick={() => setLink('https://github.com/Yiku21/kywai/tree/master/docs/mods/notas-rapidas')}>
          notas-rapidas
        </button>
        {' · '}
        {t('Cómo se hace uno: MANUAL, «Extensiones: mods».')}
      </p>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {done && <p className={s.okNote}>{done}</p>}

      {live && mods.length === 0 && <p className={s.muted}>{t('Aún no hay ninguno instalado.')}</p>}
      <ul className={s.list}>
        {mods.map((m) => (
          <li key={m.name} className={cx(s.item, s.modItem, !m.enabled && s.off)}>
            <span className={s.icon} aria-hidden="true">
              <Puzzle size={18} />
            </span>
            <span className={s.text}>
              <span className={s.name}>
                {m.title}
                {m.version && <small>{m.version}</small>}
                {!m.enabled && <span className={s.tag}>{t('Apagado')}</span>}
              </span>
              {m.description && <span className={s.desc}>{m.description}</span>}
              {m.commands.length > 0 && (
                <span className={s.modBlock}>
                  <span className={s.modLabel}>{t('Órdenes')}</span>
                  {m.commands.map((c) => (
                    <span key={c.name} className={s.modRow}>
                      <code>/{c.name}</code> {c.description}
                      {m.shadowed.includes(c.name) && <span className={s.warnInline}> {t('(no se usa: ese nombre ya lo tiene otro mod o kywai)')}</span>}
                    </span>
                  ))}
                </span>
              )}
              {m.panels.length > 0 && (
                <span className={s.modBlock}>
                  <span className={s.modLabel}>{t('Paneles (pestaña «Mods» junto al chat)')}</span>
                  <span className={s.modRow}>{m.panels.map((p) => p.title).join(', ')}</span>
                </span>
              )}
              {m.hooks.length > 0 && (
                <span className={s.modBlock}>
                  <span className={s.modLabel}>{m.hooksAllowed ? t('Hooks (con tu permiso)') : t('Hooks (no se ejecutan hasta que des permiso)')}</span>
                  {m.hooks.map((h, i) => (
                    <span key={i} className={s.modRow}>
                      {t(HOOK_LABEL[h.on] ?? h.on)}: <code>{h.run}</code>
                    </span>
                  ))}
                  {m.lastHook && (
                    <span className={cx(s.modRow, m.lastHook.ok ? s.okText : s.badText)} title={m.lastHook.output}>
                      {m.lastHook.ok ? t('Última vez bien ({when})', { when: ago(m.lastHook.at) }) : t('Última vez falló ({when})', { when: ago(m.lastHook.at) })}
                      {m.lastHook.output && `: ${m.lastHook.output.split('\n').slice(-1)[0].slice(0, 120)}`}
                    </span>
                  )}
                </span>
              )}
              {m.permissions.length > 0 && (
                <span className={s.status}>
                  {t('Permisos: {list}', {
                    list: m.permissions.map((p) => (p === 'network' ? t('sus paneles pueden conectarse a internet') : p === 'chat' ? t('sus paneles pueden proponer mensajes al chat (tú confirmas)') : p)).join('; ')
                  })}
                </span>
              )}
              <span className={s.modActions}>
                <button type="button" className={cx(u.btn, u.btnSm)} disabled={!!busy} onClick={() => void run(`en:${m.name}`, () => api!.setModEnabled(m.name, !m.enabled))}>
                  {m.enabled ? t('Apagar') : t('Encender')}
                </button>
                {m.hooks.length > 0 && (
                  <button
                    type="button"
                    className={cx(u.btn, u.btnSm, !m.hooksAllowed && u.btnPrimary)}
                    disabled={!!busy}
                    onClick={() => {
                      if (m.hooksAllowed) void run(`hk:${m.name}`, () => api!.allowModHooks(m.name, false))
                      else if (window.confirm(t('Los hooks de «{name}» ejecutarán estas órdenes en este equipo, en la carpeta del proyecto:\n\n{list}\n\n¿Das permiso?', { name: m.title, list: m.hooks.map((h) => `• ${h.run}`).join('\n') })))
                        void run(`hk:${m.name}`, () => api!.allowModHooks(m.name, true))
                    }}
                  >
                    {m.hooksAllowed ? t('Quitar permiso a los hooks') : t('Permitir sus hooks')}
                  </button>
                )}
                {m.source.startsWith('https://') && (
                  <button type="button" className={cx(u.iconBtn, u.iconBtnSm)} title={t('Ver su página')} aria-label={t('Ver su página')} onClick={() => void api!.openExternal(m.source)}>
                    <ExternalLink size={15} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className={cx(u.iconBtn, u.iconBtnSm)}
                  disabled={!!busy}
                  title={t('Quitar')}
                  aria-label={t('Quitar')}
                  onClick={() => {
                    if (window.confirm(t('¿Quitar «{name}»?', { name: m.title }))) void run(`rm:${m.name}`, () => api!.removeMod(m.name))
                  }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className={s.note}>{t('Los hooks ejecutan órdenes en este equipo: solo das permiso viendo cuáles son, y si una actualización del mod las cambia, hay que volver a darlo. Los paneles no pueden tocar el resto de kywai.')}</p>
    </>
  )
}
