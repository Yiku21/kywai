import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { AddAgentInput, AgentAccess, AgentConfig, AgentId, AppConfig, QuotaBudget, QuotaGroupConfig, SetAgentModelsInput, SetLocalAgentInput, StationConfig } from '@shared/types'
import { buildAgent } from '@shared/agentCatalog'
import { isLang, langFromLocale, setCurrentLang, type Lang } from '@shared/i18n'
import { CONFIG_VERSION, DEFAULT_CONFIG, avatarFor, localLogoFor, upgradeAgentModels, upgradeAgentProfile, upgradeAgentRole } from '@shared/defaults'

let config: AppConfig | null = null
let configRoot = ''

/** Where config.json lives (and the default project storage). */
export function defaultWorkspaceRoot(): string {
  // In dev that's <repo>/workspace. A packaged app can't write inside app.asar → userData.
  return app.isPackaged ? join(app.getPath('userData'), 'workspace') : join(app.getAppPath(), 'workspace')
}

function configPath(): string {
  return join(configRoot, 'config.json')
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function mergeById<T extends { id: string }>(defaults: T[], user: unknown): T[] {
  if (!Array.isArray(user)) return clone(defaults)
  const byId = new Map<string, Record<string, unknown>>()
  for (const u of user) if (isObj(u) && typeof u.id === 'string') byId.set(u.id, u)
  const out: T[] = defaults.map((d) => {
    const u = byId.get(d.id)
    byId.delete(d.id)
    return u ? ({ ...clone(d), ...u } as T) : clone(d)
  })
  for (const u of byId.values()) out.push(u as unknown as T)
  return out
}

/** La ficha de un agente de catálogo: programa seguro y argumentos que son texto. */
function validCliSpec(c: unknown): boolean {
  if (!isObj(c)) return false
  const strings = (v: unknown): boolean => v === undefined || (Array.isArray(v) && v.every((x) => typeof x === 'string'))
  return (
    typeof c.command === 'string' &&
    /^[\w.-]+$/.test(c.command) &&
    (c.promptVia === 'stdin' || c.promptVia === 'file' || c.promptVia === 'arg') &&
    strings(c.args) &&
    Array.isArray(c.args) &&
    strings(c.versionArgs) &&
    (c.authCheck === undefined || typeof c.authCheck === 'string') &&
    (c.apiKey === undefined ||
      (isObj(c.apiKey) && typeof c.apiKey.env === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(c.apiKey.env) && typeof c.apiKey.label === 'string' && typeof c.apiKey.url === 'string')) &&
    (c.login === undefined || typeof c.login === 'string') &&
    strings(c.fullAccessArgs) &&
    strings(c.workArgs) &&
    strings(c.planArgs) &&
    strings(c.modelArgs)
  )
}

function validAgent(a: AgentConfig): boolean {
  return (
    typeof a.id === 'string' &&
    /^[\w\-]+$/.test(a.id) &&
    typeof a.name === 'string' &&
    ['claude', 'codex', 'gemini', 'qwen', 'ollama', 'lmstudio', 'hermes', 'muse', 'cli'].includes(a.provider) &&
    typeof a.stationId === 'string' &&
    (a.provider !== 'cli' || validCliSpec(a.cli))
  )
}

function mergeWebAccess(v: unknown): AppConfig['webAccess'] {
  const w = isObj(v) ? v : {}
  const port = typeof w.port === 'number' && Number.isInteger(w.port) && w.port >= 1024 && w.port <= 65535 ? w.port : 8787
  const token = typeof w.token === 'string' && /^[\w-]{16,}$/.test(w.token) ? w.token : ''
  return { enabled: w.enabled === true && !!token, port, token, ...(w.restrictClients === true ? { restrictClients: true } : {}) }
}

export function mergeConfig(user: unknown, workspaceRoot: string): AppConfig {
  const d = clone(DEFAULT_CONFIG)
  const u = isObj(user) ? user : {}
  const version = typeof u.configVersion === 'number' ? u.configVersion : 1
  const removed = Array.isArray(u.removedAgents) ? u.removedAgents.filter((x): x is string => typeof x === 'string') : []
  // Los de fábrica que el usuario quitó no vuelven a aparecer al actualizar.
  const agents = mergeById<AgentConfig>(
    d.agents.filter((a) => !removed.includes(a.id)),
    u.agents
  )
    .filter(validAgent)
    .map((a) => ({
      ...a,
      model: typeof a.model === 'string' ? a.model : '',
      modelLabel: typeof a.modelLabel === 'string' ? a.modelLabel : a.model || 'Auto',
      strengths: Array.isArray(a.strengths) ? a.strengths.filter((s) => typeof s === 'string') : [],
      avoid: Array.isArray(a.avoid) ? a.avoid.filter((s) => typeof s === 'string') : undefined,
      role: typeof a.role === 'string' ? a.role : '',
      enabled: a.enabled !== false,
      modelProvider: typeof a.modelProvider === 'string' && /^[\w.\-:]+$/.test(a.modelProvider) ? a.modelProvider : undefined,
      thinking: a.provider === 'lmstudio' && a.thinking === true ? true : undefined,
      isSubagent: undefined,
      parentId: undefined
    }))
  // Versión 2: modelos por dificultad. Se completan los que falten sin pisar lo que eligió el usuario.
  if (version < 2) {
    for (const a of agents) {
      const def = d.agents.find((x) => x.id === a.id)
      if (!def) continue
      if (def.strongModel && !a.strongModel) {
        a.strongModel = def.strongModel
        a.strongModelLabel = def.strongModelLabel
      }
      // Codex: el habitual pasaba a ser Astra; ahora Astra es el de lo difícil.
      if (a.provider === 'codex' && a.model === 'gpt-6-astra' && /luna/.test(a.lightModel ?? '')) {
        a.model = def.model
        a.modelLabel = def.modelLabel
        a.lightModel = def.lightModel
        a.lightModelLabel = def.lightModelLabel
      }
    }
  }
  // Versiones 7 y 8: fichas con datos verificados y modelos según lo medido (sin pisar lo que eligió el usuario).
  if (version < 8) {
    for (const a of agents) {
      upgradeAgentProfile(a)
      upgradeAgentModels(a)
    }
  }
  // Versión 9: Muse solo para vídeo y de refuerzo (su cuota es muy pequeña), si seguía con su primera ficha.
  if (version < 9) for (const a of agents) upgradeAgentProfile(a)
  // Versión 10: el rol de Codex dice que es el único que genera imágenes (se ve en su panel).
  if (version < 10) for (const a of agents) upgradeAgentRole(a)
  // Versión 5: Hermes estrena su diseño definitivo (sustituye a los provisionales).
  if (version < 5) {
    const def = d.agents.find((x) => x.id === 'hermes')
    const h = agents.find((a) => a.id === 'hermes')
    if (def && h && ['#e64fb4', '#f2e6cb'].includes(h.color)) {
      h.avatar = def.avatar
      h.color = def.color
    }
  }
  // La estación de un agente de fábrica quitado tampoco vuelve (no se queda una plataforma vacía).
  const removedStations = new Set(d.agents.filter((a) => removed.includes(a.id)).map((a) => a.stationId))
  let stations = mergeById<StationConfig>(
    d.stations.filter((s) => !removedStations.has(s.id)),
    u.stations
  ).filter((s) => typeof s.id === 'string' && Array.isArray(s.position) && s.position.length === 2 && !removedStations.has(s.id))
  // Versión 3: Hermes coordina desde la estación delantera, que antes era la segunda de apoyo.
  if (version < 3) stations = stations.filter((s) => s.id !== 'st-sub-2')
  const quotaGroups = mergeById<QuotaGroupConfig>(d.quotaGroups, u.quotaGroups).map((g) => {
    const out = { ...g }
    if (out.budget && !validBudget(out.budget)) delete out.budget
    return out
  })
  const thresholds = { ...d.thresholds, ...(isObj(u.thresholds) ? u.thresholds : {}) }
  const plannerOrder = Array.isArray(u.plannerOrder) ? u.plannerOrder.filter((x): x is string => typeof x === 'string') : d.plannerOrder
  if (version < 3 && !plannerOrder.includes('hermes')) plannerOrder.unshift('hermes')
  const maxParallel = typeof u.maxParallel === 'number' && u.maxParallel >= 1 ? Math.min(8, Math.floor(u.maxParallel)) : d.maxParallel
  const root = typeof u.workspaceRoot === 'string' && u.workspaceRoot && isAbsolute(u.workspaceRoot) ? u.workspaceRoot : workspaceRoot
  return {
    configVersion: CONFIG_VERSION,
    workspaceRoot: root,
    agents,
    stations,
    quotaGroups,
    thresholds: {
      warn: typeof thresholds.warn === 'number' ? thresholds.warn : d.thresholds.warn,
      alert: typeof thresholds.alert === 'number' ? thresholds.alert : d.thresholds.alert
    },
    plannerOrder: (() => {
      const known = plannerOrder.filter((id) => agents.some((a) => a.id === id))
      return known.length ? known : d.plannerOrder.filter((id) => agents.some((a) => a.id === id))
    })(),
    ...(removed.length ? { removedAgents: removed } : {}),
    agentAccess: u.agentAccess === 'project' ? 'project' : 'full',
    planApproval: u.planApproval !== false,
    ...(isLang(u.language) ? { language: u.language } : {}),
    // Versión 6: el asistente de configuración. Quien ya usaba la app no lo necesita.
    setupDone: u.setupDone === true || (isObj(user) && version < 6),
    webAccess: mergeWebAccess(u.webAccess),
    maxParallel
  }
}

export function validBudget(b: unknown): b is QuotaBudget {
  if (!isObj(b)) return false
  return (
    typeof b.limit === 'number' &&
    Number.isFinite(b.limit) &&
    b.limit > 0 &&
    (b.unit === 'tokens' || b.unit === 'solicitudes') &&
    (b.period === 'diario' || b.period === '5h' || b.period === 'semanal')
  )
}

export function loadConfig(): AppConfig {
  configRoot = defaultWorkspaceRoot()
  mkdirSync(configRoot, { recursive: true })
  const file = configPath()
  let user: unknown = null
  if (existsSync(file)) {
    try {
      user = JSON.parse(readFileSync(file, 'utf8'))
    } catch (e) {
      console.error('[cowork] config.json inválido, se usan los valores por defecto', e)
      try {
        renameSync(file, `${file}.bad-${Date.now()}`)
      } catch {
        /* ignore */
      }
    }
  }
  config = mergeConfig(user, configRoot)
  // Idioma de los avisos del motor y de lo que escriben los agentes para el usuario.
  // Sin idioma elegido aún, el del sistema (la interfaz lo guarda en cuanto arranca).
  setCurrentLang(config.language ?? (app?.isReady?.() ? langFromLocale(app.getLocale()) : 'es'))
  mkdirSync(config.workspaceRoot, { recursive: true })
  if (!user || (user as { configVersion?: number }).configVersion !== CONFIG_VERSION) saveConfig()
  return config
}

export function getConfig(): AppConfig {
  return config ?? loadConfig()
}

export function saveConfig(): void {
  if (!config) return
  const file = configPath()
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  renameSync(tmp, file)
}

export function setQuotaBudget(groupId: string, budget: QuotaBudget | null): void {
  const cfg = getConfig()
  const g = cfg.quotaGroups.find((q) => q.id === groupId)
  if (!g) throw new Error(`Grupo de cuota desconocido: ${groupId}`)
  if (budget === null) delete g.budget
  else if (validBudget(budget)) g.budget = { limit: budget.limit, unit: budget.unit, period: budget.period }
  else throw new Error('Presupuesto no válido')
  saveConfig()
}

const MODEL_RE = /^[\w.:\-/@]+$/

/** Cambia el motor, el modelo y (opcionalmente) el nombre de un agente local. */
export function setLocalAgent(input: SetLocalAgentInput): void {
  const cfg = getConfig()
  const a = cfg.agents.find((x) => x.id === input.agentId)
  if (!a) throw new Error('Agente desconocido')
  if (a.provider !== 'ollama' && a.provider !== 'lmstudio') throw new Error('Este agente no es local')
  if (input.engine !== 'ollama' && input.engine !== 'lmstudio') throw new Error('Motor no válido')
  if (typeof input.model !== 'string' || !MODEL_RE.test(input.model)) throw new Error('Nombre de modelo no válido')
  a.provider = input.engine
  a.model = input.model
  a.modelLabel = (typeof input.modelLabel === 'string' && input.modelLabel.trim().slice(0, 40)) || input.model
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 24) : ''
  if (name) a.name = name
  // El robot local lleva el logo de Qwen solo si el modelo es de esa familia.
  a.avatar = { ...avatarFor(a), logo: localLogoFor(input.model) }
  saveConfig()
}

/** Activa los agentes elegidos en el asistente (y desactiva el resto de los principales). */
export function setAgentsEnabled(ids: AgentId[]): void {
  const cfg = getConfig()
  if (!cfg.agents.some((a) => ids.includes(a.id) && !a.plannerOnly)) throw new Error('Elige al menos un agente que trabaje (no solo el coordinador)')
  for (const a of cfg.agents) if (!a.isSubagent) a.enabled = ids.includes(a.id)
  saveConfig()
}

/** Activa o desactiva el acceso web; al activarlo por primera vez (o al pedirlo) se genera un código nuevo. */
export function setWebAccessConfig(enabled: boolean | undefined, regenerate: boolean, newToken: () => string): AppConfig['webAccess'] {
  const w = getConfig().webAccess
  if (regenerate || (enabled && !w.token)) w.token = newToken()
  if (enabled !== undefined) w.enabled = enabled
  saveConfig()
  return { ...w }
}

/** Restringe (o no) los archivos que ven los clientes de escritorio a las carpetas de los proyectos. */
export function setRestrictClients(value: boolean): void {
  const w = getConfig().webAccess
  if (value) w.restrictClients = true
  else delete w.restrictClients
  saveConfig()
}

/** Añade un agente (del catálogo o a medida): le da identificador, aspecto y estación, y lo deja activo. */
export function addAgent(input: AddAgentInput): AppConfig {
  const cfg = getConfig()
  const { agent, station } = buildAgent(input, cfg.agents, cfg.stations)
  if (station && !cfg.stations.some((s) => s.id === station.id)) cfg.stations.push(station)
  cfg.agents.push(agent)
  if (cfg.removedAgents?.includes(agent.id)) {
    cfg.removedAgents = cfg.removedAgents.filter((id) => id !== agent.id)
    if (!cfg.removedAgents.length) delete cfg.removedAgents
  }
  // Puede coordinar si los anteriores no están disponibles (el primero de la lista sigue siendo el de siempre).
  if (!cfg.plannerOrder.includes(agent.id)) cfg.plannerOrder.push(agent.id)
  saveConfig()
  return getConfig()
}

/** Quita un agente. Al menos uno tiene que seguir trabajando; si era el coordinador, pasa al siguiente. */
export function removeAgent(id: AgentId): AppConfig {
  const cfg = getConfig()
  const agent = cfg.agents.find((a) => a.id === id)
  if (!agent) throw new Error('Ese agente no existe')
  if (!cfg.agents.some((a) => a.id !== id && a.enabled && !a.plannerOnly)) throw new Error('Tiene que quedar al menos un agente que trabaje')
  cfg.agents = cfg.agents.filter((a) => a.id !== id)
  cfg.plannerOrder = cfg.plannerOrder.filter((x) => x !== id)
  const factory = DEFAULT_CONFIG.agents.find((a) => a.id === id)
  if (factory) {
    cfg.removedAgents = [...new Set([...(cfg.removedAgents ?? []), id])]
    cfg.stations = cfg.stations.filter((s) => s.id !== factory.stationId)
  } else if (!cfg.agents.some((a) => a.stationId === agent.stationId)) {
    // Su estación propia se va con él (las de apoyo de los becarios no son de nadie).
    cfg.stations = cfg.stations.filter((s) => s.id !== agent.stationId || s.forSubagents)
  }
  saveConfig()
  return getConfig()
}

/** Elige quién coordina: pasa al primer puesto de la lista de quienes planifican. */
export function setCoordinator(id: AgentId): AppConfig {
  const cfg = getConfig()
  const agent = cfg.agents.find((a) => a.id === id)
  if (!agent || !agent.enabled) throw new Error('Ese agente no está disponible')
  cfg.plannerOrder = [id, ...cfg.plannerOrder.filter((x) => x !== id)]
  saveConfig()
  return getConfig()
}

export function finishSetup(): void {
  getConfig().setupDone = true
  saveConfig()
}

/** Permisos de los agentes al trabajar (afecta a las tareas que empiecen a partir de ahora). */
export function setAgentAccess(access: AgentAccess): void {
  getConfig().agentAccess = access === 'project' ? 'project' : 'full'
  saveConfig()
}

/**
 * Modelo de Hermes elegido con «/model» (null: el de su propia configuración). Se le pasa en cada encargo con -m y
 * --provider; su config.yaml no se toca.
 */
export function setHermesModel(choice: { provider: string; model: string } | null, label: (model: string) => string): void {
  const hermes = getConfig().agents.find((a) => a.provider === 'hermes')
  if (!hermes) throw new Error('Hermes no está en el equipo')
  if (choice) {
    if (!MODEL_ID_RE.test(choice.model) || !choice.model) throw new Error('Modelo no válido')
    if (!/^[\w.\-:]+$/.test(choice.provider)) throw new Error('Proveedor no válido')
    hermes.model = choice.model
    hermes.modelLabel = label(choice.model)
    hermes.modelProvider = choice.provider
  } else {
    hermes.model = ''
    hermes.modelLabel = 'Hermes Agent'
    delete hermes.modelProvider
  }
  saveConfig()
}

/** Idioma de los avisos del motor y de las respuestas de los agentes (afecta a lo que venga). */
export function setLanguage(id: Lang): void {
  if (!isLang(id)) return
  getConfig().language = id
  setCurrentLang(id)
  saveConfig()
}

/** Pedir (o no) el visto bueno del usuario antes de ejecutar cada plan (afecta a los planes que vengan). */
export function setPlanApproval(on: boolean): void {
  getConfig().planApproval = !!on
  saveConfig()
}

export function setQuotaUnlimited(groupId: string, unlimited: boolean): void {
  const cfg = getConfig()
  const g = cfg.quotaGroups.find((q) => q.id === groupId)
  if (!g) throw new Error(`Grupo de cuota desconocido: ${groupId}`)
  if (g.provider !== 'local') throw new Error('Solo la ejecución local puede ser ilimitada')
  g.unlimited = !!unlimited
  saveConfig()
}

const MODEL_ID_RE = /^[\w.:\-/@]*$/

/** Cambia los modelos de un agente para tareas fáciles, normales y difíciles. */
/** Razonamiento («think») del modelo local de LM Studio: apagado por defecto para que responda antes. */
export function setAgentThinking(agentId: unknown, enabled: unknown): void {
  const a = getConfig().agents.find((x) => x.id === agentId)
  if (!a) throw new Error('Agente desconocido')
  if (a.provider !== 'lmstudio') throw new Error('El razonamiento solo se cambia en el agente de LM Studio')
  if (typeof enabled !== 'boolean') throw new Error('Datos no válidos')
  if (enabled) a.thinking = true
  else delete a.thinking
  saveConfig()
}

export function setAgentModels(input: SetAgentModelsInput): void {
  const a = getConfig().agents.find((x) => x.id === input.agentId)
  if (!a) throw new Error('Agente desconocido')
  if (a.provider === 'ollama' || a.provider === 'lmstudio') throw new Error('El agente local se configura desde el indicador Local')
  const ok = (m: { model: string; label: string } | null): boolean =>
    m === null || (typeof m.model === 'string' && MODEL_ID_RE.test(m.model) && typeof m.label === 'string')
  if (!input.standard || !ok(input.standard) || !ok(input.light) || !ok(input.strong)) throw new Error('Modelo no válido')
  const label = (m: { model: string; label: string }): string => m.label.trim().slice(0, 32) || m.model || 'Auto'
  a.model = input.standard.model
  a.modelLabel = label(input.standard)
  if (input.light && input.light.model) {
    a.lightModel = input.light.model
    a.lightModelLabel = label(input.light)
  } else {
    delete a.lightModel
    delete a.lightModelLabel
  }
  if (input.strong && input.strong.model && input.strong.model !== a.model) {
    a.strongModel = input.strong.model
    a.strongModelLabel = label(input.strong)
  } else {
    delete a.strongModel
    delete a.strongModelLabel
  }
  saveConfig()
}
