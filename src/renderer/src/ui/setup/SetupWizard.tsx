import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, Check, CircleCheck, Crown, Download, ExternalLink, KeyRound, LoaderCircle, LogIn, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import type { AgentConfig, SetupAuth, SetupTool, SetupToolId } from '@shared/types'
import { useCowork } from '@/store/cowork'
import { api } from '@/lib/api'
import { RobotAvatar } from '@/lib/RobotAvatar'
import { catalogEntry } from '@shared/agentCatalog'
import { installOrder } from '@shared/setupTool'
import { LocalConfig } from '../quota/LocalConfig'
import { AddAgent } from './AddAgent'
import { cx, errorText } from '../common/util'
import u from '../common/ui.module.css'
import s from './SetupWizard.module.css'
import { t } from '@/lib/i18n'

type Step = 0 | 1 | 2 | 3
type LocalEngine = 'lmstudio' | 'ollama'

const STEPS = [t('Agentes'), t('Programas'), t('Sesiones'), t('Listo')]

const isLocal = (a: AgentConfig): boolean => a.provider === 'ollama' || a.provider === 'lmstudio'

/** Qué hace cada agente y qué cuenta necesita (texto de las tarjetas). */
const ABOUT: Record<string, { what: string; account: string }> = {
  hermes: { what: t('Coordinador: planifica y reparte el trabajo entre los demás.'), account: t('Necesita un proveedor de modelos (OmniRoute, Nous Portal u otra cuenta).') },
  claude: { what: t('Diseño, textos y código de calidad.'), account: t('Con tu suscripción de Claude (Pro o Max).') },
  codex: { what: t('Programación y tareas técnicas.'), account: t('Con tu cuenta de ChatGPT.') },
  gemini: { what: t('Análisis, investigación y documentos largos.'), account: t('Con tu cuenta de Google o una clave de API.') },
  muse: { what: t('Vídeos y refuerzo cuando los demás no tienen cuota.'), account: t('Con tu suscripción de Muse Code (cuenta de Meta).') },
  local: { what: t('Tareas sencillas gratis, en tu propio equipo.'), account: t('Sin cuenta: LM Studio u Ollama con un modelo descargado.') }
}

/** Qué hace y con qué cuenta funciona: el texto de fábrica, el del catálogo o, si no, su rol. */
function aboutAgent(a: AgentConfig): { what: string; account: string } {
  const key = isLocal(a) ? 'local' : a.id
  if (ABOUT[key]) return ABOUT[key]
  const entry = a.cli?.presetId ? catalogEntry(a.cli.presetId) : undefined
  if (entry) return { what: entry.summary, account: entry.account }
  return { what: a.role || t('Agente conectado.'), account: a.provider === 'cli' ? t('Con la sesión que tengas iniciada en su programa.') : '' }
}

function toolFor(a: AgentConfig, engine: LocalEngine): SetupToolId | null {
  if (isLocal(a)) return engine
  if (a.provider === 'cli') return `cli:${a.id}`
  if (a.provider === 'claude' || a.provider === 'codex' || a.provider === 'gemini' || a.provider === 'hermes' || a.provider === 'muse') return a.provider
  return null
}

/** Asistente de primer arranque (y desde el menú ⋮): agentes, programas, inicio de sesión. */
export function SetupWizard() {
  const configAgents = useCowork((st) => st.config.agents)
  const coordinatorId = useCowork((st) => st.config.plannerOrder[0])
  const quotaGroups = useCowork((st) => st.config.quotaGroups)
  const log = useCowork((st) => st.setupLog)
  const main = useMemo(() => configAgents.filter((a) => !a.isSubagent), [configAgents])
  const localAgent = main.find(isLocal)

  const [step, setStep] = useState<Step>(0)
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(main.filter((a) => a.enabled).map((a) => a.id)))
  const [engine, setEngine] = useState<LocalEngine>(localAgent?.provider === 'ollama' ? 'ollama' : 'lmstudio')
  const [tools, setTools] = useState<SetupTool[] | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [installing, setInstalling] = useState<SetupToolId | null>(null)
  const [auth, setAuth] = useState<Partial<Record<SetupToolId, SetupAuth | 'checking'>>>({})
  const [geminiKey, setGeminiKey] = useState('')
  const [agentKeys, setAgentKeys] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  // Sesiones que el usuario ha pedido cambiar (lápiz): se enseñan como si faltaran hasta la siguiente comprobación.
  const [changing, setChanging] = useState<ReadonlySet<SetupToolId>>(new Set())
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  // Un agente que se acaba de añadir entra elegido.
  const knownAgents = useRef(new Set(main.map((a) => a.id)))
  useEffect(() => {
    const fresh = main.filter((a) => !knownAgents.current.has(a.id))
    for (const a of main) knownAgents.current.add(a.id)
    if (fresh.length) setChosen((prev) => new Set([...prev, ...fresh.filter((a) => a.enabled).map((a) => a.id)]))
  }, [main])

  const selected = main.filter((a) => chosen.has(a.id))
  const agentTools = selected.map((a) => toolFor(a, engine)).filter((tool): tool is SetupToolId => !!tool)
  const loginTools: SetupToolId[] = agentTools.filter((tool) => {
    if (tool.startsWith('cli:')) {
      const spec = selected.find((a) => a.id === tool.slice(4))?.cli
      return !!(spec?.login || spec?.authCheck || spec?.apiKey)
    }
    return tool === 'claude' || tool === 'codex' || tool === 'gemini' || tool === 'hermes' || tool === 'muse'
  })

  // Programas a mostrar: los de los agentes elegidos y lo que necesiten antes (Node.js, Homebrew).
  const shownTools = useMemo(() => {
    if (!tools) return []
    const byId = new Map(tools.map((tool) => [tool.id, tool]))
    const ids = new Set<SetupToolId>()
    if (byId.has('brew')) ids.add('brew')
    for (const id of agentTools) {
      const tool = byId.get(id)
      if (tool?.needs && !tool.installed) ids.add(tool.needs)
      ids.add(id)
    }
    return [...ids].map((id) => byId.get(id)).filter((tool): tool is SetupTool => !!tool)
  }, [tools, agentTools.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const detect = useCallback(async () => {
    const a = api
    if (!a) return
    setDetecting(true)
    setError(null)
    try {
      setTools(await a.setupDetect())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setDetecting(false)
    }
  }, [])

  const checkAuth = useCallback(async (ids: SetupToolId[]) => {
    const a = api
    if (!a) return
    setAuth((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, 'checking'])) }))
    await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await a.setupAuth(id)
          setAuth((prev) => ({ ...prev, [id]: r }))
        } catch (e) {
          setAuth((prev) => ({ ...prev, [id]: { id, ok: false, detail: errorText(e), canLogin: true } }))
        }
      })
    )
  }, [])

  useEffect(() => {
    if (step === 1 && !tools) void detect()
    if (step === 2) void checkAuth(loginTools)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al volver de la ventana de inicio de sesión se comprueba de nuevo lo que faltaba.
  const pendingLogins = useRef<SetupToolId[]>([])
  pendingLogins.current = loginTools.filter((id) => {
    const st = auth[id]
    return !st || (st !== 'checking' && !st.ok) || changing.has(id)
  })
  useEffect(() => {
    if (step !== 2) return
    const onFocus = () => {
      if (!pendingLogins.current.length) return
      // Al volver con la sesión cambiada se enseña la nueva (correo o proveedor) y el lápiz otra vez.
      void Promise.resolve(checkAuth(pendingLogins.current)).finally(() => setChanging(new Set()))
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [step, checkAuth])

  if (!api) return null

  function toggle(id: string): void {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function makeCoordinator(id: string): Promise<void> {
    const a = api
    if (!a) return
    setError(null)
    try {
      await a.setCoordinator(id)
      setChosen((prev) => new Set(prev).add(id))
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function removeAgent(id: string): Promise<void> {
    const a = api
    if (!a) return
    if (confirmRemove !== id) {
      setConfirmRemove(id)
      return
    }
    setConfirmRemove(null)
    setError(null)
    try {
      await a.removeAgent(id)
      setChosen((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function next(): Promise<void> {
    const a = api
    if (!a || busy) return
    setError(null)
    if (step === 0) {
      setBusy(true)
      try {
        await a.setAgentsEnabled([...chosen])
      } catch (e) {
        setError(errorText(e))
        setBusy(false)
        return
      }
      setBusy(false)
    }
    setStep((st) => Math.min(3, st + 1) as Step)
  }

  async function install(id: SetupToolId): Promise<boolean> {
    const a = api
    if (!a || installing) return false
    setInstalling(id)
    setError(null)
    try {
      const r = await a.setupInstall(id)
      if (!r.ok) setError(r.message)
      return r.ok
    } catch (e) {
      setError(errorText(e))
      return false
    } finally {
      setInstalling(null)
      await detect()
    }
  }

  async function installMissing(): Promise<void> {
    // Primero lo que necesitan los demás (Homebrew, Node.js, Python), luego cada CLI.
    for (const tool of installOrder(shownTools)) {
      if (tool.installed || !tool.canInstall) continue
      if (!(await install(tool.id))) break
    }
  }

  async function login(id: SetupToolId): Promise<void> {
    const a = api
    if (!a) return
    setError(null)
    try {
      await a.setupLogin(id)
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function saveAgentApiKey(agentId: string, e: FormEvent): Promise<void> {
    e.preventDefault()
    const a = api
    const key = (agentKeys[agentId] ?? '').trim()
    if (!a || !key) return
    setError(null)
    const id = `cli:${agentId}` as SetupToolId
    setAuth((prev) => ({ ...prev, [id]: 'checking' }))
    try {
      const r = await a.setAgentKey(agentId, key)
      setAuth((prev) => ({ ...prev, [id]: r }))
      if (r.ok) setChanging((prev) => new Set([...prev].filter((x) => x !== id)))
      setAgentKeys((prev) => ({ ...prev, [agentId]: '' }))
    } catch (err) {
      setError(errorText(err))
      void checkAuth([id])
    }
  }

  async function saveKey(e: FormEvent): Promise<void> {
    e.preventDefault()
    const a = api
    if (!a || !geminiKey.trim()) return
    setError(null)
    setAuth((prev) => ({ ...prev, gemini: 'checking' }))
    try {
      const r = await a.setupGeminiKey(geminiKey)
      setAuth((prev) => ({ ...prev, gemini: r }))
      if (r.ok) setChanging((prev) => new Set([...prev].filter((x) => x !== 'gemini')))
      setGeminiKey('')
    } catch (err) {
      setError(errorText(err))
      void checkAuth(['gemini'])
    }
  }

  async function finish(): Promise<void> {
    const a = api
    if (!a) return
    try {
      await a.setupFinish()
    } finally {
      useCowork.getState().openSetup(false)
    }
  }

  const missing = shownTools.filter((tool) => !tool.installed)
  const localGroup = quotaGroups.find((g) => g.id === 'local')
  const ready = (id: SetupToolId): boolean => {
    const tool = tools?.find((x) => x.id === id)
    const au = auth[id]
    const loggedIn = !loginTools.includes(id) || (!!au && au !== 'checking' && au.ok)
    return !!tool?.installed && loggedIn
  }

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <div className={s.dialog}>
        <header className={s.head}>
          <div>
            <h2 id="setup-title" className={s.title}>
              {t('Configura AI Cowork')}
            </h2>
            <p className={s.subtitle}>{t('Elige tu equipo, instala lo que falte e inicia sesión. Puedes repetirlo cuando quieras desde el menú ⋮.')}</p>
          </div>
          <button type="button" className={cx(u.iconBtn, s.close)} aria-label={t('Cerrar el asistente')} title={t('Cerrar (podrás volver desde el menú ⋮)')} onClick={() => void finish()}>
            <X size={18} />
          </button>
        </header>

        <ol className={s.steps}>
          {STEPS.map((label, i) => (
            <li key={label} className={cx(s.stepItem, i === step && s.stepNow, i < step && s.stepDone)}>
              <span className={s.stepNum}>{i < step ? <Check size={12} /> : i + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        <div className={s.body}>
          {step === 0 && (
            <div className={s.cards}>
              {main.map((a) => {
                const about = aboutAgent(a)
                const on = chosen.has(a.id)
                const isCoordinator = coordinatorId === a.id
                return (
                  <div key={a.id} className={cx(s.card, on && s.cardOn)} style={{ ['--agent' as string]: a.color }}>
                    <button type="button" className={s.cardMain} aria-pressed={on} onClick={() => toggle(a.id)}>
                      <RobotAvatar agent={a} size={52} />
                      <span className={s.cardText}>
                        <span className={s.cardName}>
                          {isLocal(a) ? t('Agente local') : a.name}
                          {isCoordinator && <span className={s.tag}>{t('Coordinador')}</span>}
                          {a.provider === 'cli' && a.cli && !a.cli.presetId && <span className={s.tagSoft}>{t('a medida')}</span>}
                        </span>
                        <span className={s.cardWhat}>{about.what}</span>
                        <span className={s.cardAccount}>{about.account}</span>
                      </span>
                      <span className={cx(s.check, on && s.checkOn)} aria-hidden="true">
                        {on && <Check size={14} />}
                      </span>
                    </button>
                    <div className={s.cardTools}>
                      {on && !isCoordinator && (
                        <button type="button" className={s.cardTool} onClick={() => void makeCoordinator(a.id)} title={t('Que este agente planifique y reparta el trabajo')}>
                          <Crown size={12} aria-hidden="true" /> {t('Hacer coordinador')}
                        </button>
                      )}
                      {main.length > 1 && (
                        <button
                          type="button"
                          className={cx(s.cardTool, confirmRemove === a.id && s.cardToolDanger)}
                          onClick={() => void removeAgent(a.id)}
                          onBlur={() => setConfirmRemove((c) => (c === a.id ? null : c))}
                          title={t('Quitar este agente de tu equipo')}
                        >
                          <Trash2 size={12} aria-hidden="true" /> {confirmRemove === a.id ? t('Pulsa otra vez para quitarlo') : t('Quitar')}
                        </button>
                      )}
                    </div>
                    {isLocal(a) && on && (
                      <div className={s.engines} role="radiogroup" aria-label={t('Programa del agente local')}>
                        {(['lmstudio', 'ollama'] as const).map((eng) => (
                          <button
                            key={eng}
                            type="button"
                            role="radio"
                            aria-checked={engine === eng}
                            className={cx(s.engine, engine === eng && s.engineOn)}
                            onClick={() => setEngine(eng)}
                          >
                            {eng === 'lmstudio' ? 'LM Studio' : 'Ollama'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <button type="button" className={cx(s.card, s.addCard)} onClick={() => setAdding(true)}>
                <span className={s.addIcon} aria-hidden="true">
                  <Plus size={22} />
                </span>
                <span className={s.cardText}>
                  <span className={s.cardName}>{t('Añadir un agente')}</span>
                  <span className={s.cardWhat}>{t('Conecta otro de los que ya usas con tu suscripción: Aider, OpenCode, Copilot, Cursor… o cualquier programa de terminal.')}</span>
                </span>
              </button>
            </div>
          )}

          {step === 1 && (
            <div className={s.section}>
              <div className={s.sectionHead}>
                <p className={s.lead}>{t('Cada agente funciona con su programa oficial (CLI). Lo que falte se instala desde aquí.')}</p>
                <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => void detect()} disabled={detecting || !!installing}>
                  <RefreshCw size={13} className={cx(detecting && u.spin)} aria-hidden="true" />
                  {t('Comprobar de nuevo')}
                </button>
              </div>
              {!tools ? (
                <p className={s.muted}>
                  <LoaderCircle size={14} className={u.spin} aria-hidden="true" /> {t('Buscando programas…')}
                </p>
              ) : (
                <ul className={s.rows}>
                  {shownTools.map((tool) => (
                    <li key={tool.id} className={s.row}>
                      <span className={cx(s.state, tool.installed ? s.stateOk : s.stateMissing)} aria-hidden="true">
                        {tool.installed ? <Check size={13} /> : <X size={13} />}
                      </span>
                      <span className={s.rowText}>
                        <span className={s.rowName}>{tool.label}</span>
                        <span className={s.rowDetail}>
                          {tool.installed
                            ? t('Instalado') + (tool.version ? ` · ${tool.version}` : '')
                            : tool.id === 'brew'
                              ? t('Recomendado en Mac: instala programas sin pedirte nada más')
                              : tool.needs && !tools.find((x) => x.id === tool.needs)?.installed
                                ? t('Falta · necesita {tool}', { tool: tools.find((x) => x.id === tool.needs)?.label ?? tool.needs })
                                : t('No instalado')}
                        </span>
                      </span>
                      {!tool.installed &&
                        (tool.canInstall ? (
                          <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} onClick={() => void install(tool.id)} disabled={!!installing}>
                            {installing === tool.id ? <LoaderCircle size={13} className={u.spin} aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
                            {installing === tool.id ? t('Instalando…') : t('Instalar')}
                          </button>
                        ) : (
                          <button type="button" className={cx(u.btn, u.btnSm)} onClick={() => void api?.openExternal(tool.url)}>
                            <ExternalLink size={13} aria-hidden="true" />
                            {t('Descargar')}
                          </button>
                        ))}
                    </li>
                  ))}
                </ul>
              )}
              {missing.some((tool) => tool.canInstall) && (
                <button type="button" className={cx(u.btn, u.btnPrimary, s.allBtn)} onClick={() => void installMissing()} disabled={!!installing}>
                  <Download size={14} aria-hidden="true" />
                  {t('Instalar todo lo que falta')}
                </button>
              )}
              {(installing || log.length > 0) && (
                <pre className={s.log} aria-live="polite">
                  {log
                    .slice(-14)
                    .map((l) => l.line)
                    .join('\n')}
                </pre>
              )}
            </div>
          )}

          {step === 2 && (
            <div className={s.section}>
              <p className={s.lead}>
                {t('Cada agente inicia sesión con su propia cuenta en una ventana aparte (normalmente se abre el navegador). AI Cowork no ve ni guarda tus contraseñas. Al volver aquí se comprueba solo.')}
              </p>
              <ul className={s.rows}>
                {loginTools.map((id) => {
                  const st = auth[id]
                  const agent = selected.find((a) => toolFor(a, engine) === id)
                  const checking = st === 'checking'
                  const ok = !!st && st !== 'checking' && st.ok
                  const isChanging = changing.has(id)
                  const showFix = !ok || isChanging
                  const stopChanging = () =>
                    setChanging((prev) => {
                      const next = new Set(prev)
                      next.delete(id)
                      return next
                    })
                  return (
                    <li key={id} className={cx(s.row, s.rowTall)}>
                      {agent && <RobotAvatar agent={agent} size={34} />}
                      <span className={s.rowText}>
                        <span className={s.rowName}>{agent?.name ?? id}</span>
                        <span className={cx(s.rowDetail, ok && s.okText)}>
                          {st === 'checking' ? t('Comprobando…') : st ? st.detail : '—'}
                        </span>
                        {agent?.cli?.apiKey && showFix && (
                          <form className={s.keyForm} onSubmit={(e) => void saveAgentApiKey(agent.id, e)}>
                            <KeyRound size={13} aria-hidden="true" className={s.keyIcon} />
                            <input
                              className={s.input}
                              type="password"
                              value={agentKeys[agent.id] ?? ''}
                              onChange={(e) => setAgentKeys((prev) => ({ ...prev, [agent.id]: e.target.value }))}
                              placeholder={t('Pega aquí {label}', { label: agent.cli.apiKey.label })}
                              aria-label={agent.cli.apiKey.label}
                              autoComplete="off"
                            />
                            <button type="submit" className={cx(u.btn, u.btnSm)} disabled={!(agentKeys[agent.id] ?? '').trim()}>
                              {t('Guardar')}
                            </button>
                            <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => void api?.openExternal(agent.cli!.apiKey!.url)}>
                              {t('Conseguir una')}
                            </button>
                          </form>
                        )}
                        {id === 'gemini' && showFix && (
                          <form className={s.keyForm} onSubmit={(e) => void saveKey(e)}>
                            <KeyRound size={13} aria-hidden="true" className={s.keyIcon} />
                            <input
                              className={s.input}
                              type="password"
                              value={geminiKey}
                              onChange={(e) => setGeminiKey(e.target.value)}
                              placeholder={t('…o pega aquí una clave de API de Google AI Studio')}
                              aria-label={t('Clave de API de Gemini')}
                              autoComplete="off"
                            />
                            <button type="submit" className={cx(u.btn, u.btnSm)} disabled={!geminiKey.trim()}>
                              {t('Guardar')}
                            </button>
                          </form>
                        )}
                      </span>
                      {checking ? (
                        <LoaderCircle size={16} className={cx(u.spin, s.rowSpin)} aria-hidden="true" />
                      ) : ok && !isChanging ? (
                        <span className={s.rowActions}>
                          <CircleCheck size={18} className={s.okIcon} aria-label={t('Listo')} />
                          <button
                            type="button"
                            className={cx(u.btn, u.btnSm, u.btnGhost)}
                            onClick={() => setChanging((prev) => new Set(prev).add(id))}
                            title={id === 'hermes' ? t('Cambiar proveedor o modelo') : t('Cambiar de cuenta')}
                            aria-label={(id === 'hermes' ? t('Cambiar proveedor de {name}', { name: agent?.name ?? id }) : t('Cambiar la sesión de {name}', { name: agent?.name ?? id }))}
                          >
                            <Pencil size={13} aria-hidden="true" />
                          </button>
                        </span>
                      ) : (
                        <span className={s.rowActions}>
                          {!(agent?.cli?.apiKey && !agent.cli.login) && (
                            <button type="button" className={cx(u.btn, u.btnSm, u.btnPrimary)} onClick={() => void login(id)}>
                              <LogIn size={13} aria-hidden="true" />
                              {id === 'hermes' ? t('Configurar') : isChanging ? t('Cambiar cuenta') : t('Iniciar sesión')}
                            </button>
                          )}
                          <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={() => void checkAuth([id])}>
                            {t('Comprobar')}
                          </button>
                          {isChanging && (
                            <button type="button" className={cx(u.btn, u.btnSm, u.btnGhost)} onClick={stopChanging}>
                              {t('Cancelar')}
                            </button>
                          )}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
              {localAgent && chosen.has(localAgent.id) && (
                <div className={s.localBox}>
                  <p className={s.rowName}>{t('Agente local')}</p>
                  <p className={s.rowDetail}>{t('Elige el programa y el modelo (en LM Studio, descárgalo desde su app; en Ollama, desde aquí).')}</p>
                  <LocalConfig groupId="local" unlimited={!!localGroup?.unlimited} />
                </div>
              )}
              {loginTools.length === 0 && !localAgent && <p className={s.muted}>{t('Ningún agente elegido necesita iniciar sesión.')}</p>}
            </div>
          )}

          {step === 3 && (
            <div className={s.section}>
              <p className={s.lead}>{t('Así queda tu equipo en este ordenador:')}</p>
              <ul className={s.rows}>
                {selected.map((a) => {
                  const id = toolFor(a, engine)
                  const ok = !!id && ready(id)
                  return (
                    <li key={a.id} className={s.row}>
                      <RobotAvatar agent={a} size={30} />
                      <span className={s.rowText}>
                        <span className={s.rowName}>{isLocal(a) ? t('Agente local') : a.name}</span>
                        <span className={cx(s.rowDetail, ok && s.okText)}>
                          {ok ? t('Listo') : t('Pendiente: vuelve a los pasos anteriores o termínalo más tarde desde ⋮ → Configurar agentes')}
                        </span>
                      </span>
                      {ok ? <CircleCheck size={18} className={s.okIcon} aria-hidden="true" /> : <AlertTriangle size={17} className={s.warnIcon} aria-hidden="true" />}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        {adding && <AddAgent existing={main} onClose={() => setAdding(false)} onAdded={(id) => setChosen((prev) => new Set(prev).add(id))} />}

        <footer className={s.foot}>
          <button type="button" className={cx(u.btn, u.btnGhost)} onClick={() => void finish()}>
            {step === 3 ? t('Cerrar') : t('Omitir por ahora')}
          </button>
          <span className={s.spacer} />
          {step > 0 && (
            <button type="button" className={u.btn} onClick={() => setStep((st) => (st - 1) as Step)} disabled={!!installing}>
              {t('Atrás')}
            </button>
          )}
          {step < 3 ? (
            <button type="button" className={cx(u.btn, u.btnPrimary)} onClick={() => void next()} disabled={busy || !!installing || chosen.size === 0}>
              {busy && <LoaderCircle size={14} className={u.spin} aria-hidden="true" />}
              {t('Siguiente')}
            </button>
          ) : (
            <button type="button" className={cx(u.btn, u.btnPrimary)} onClick={() => void finish()}>
              {t('Empezar a usar AI Cowork')}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
