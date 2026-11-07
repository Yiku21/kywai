// Uso y coste: cuánto vale cada llamada en dinero, cómo pagas cada agente y si te compensa cada suscripción.
// Lo usan el panel «Uso y coste» (escritorio y web), la API móvil (Órbita) y el aviso de presupuesto del motor.
import type {
  AgentConfig,
  AppConfig,
  BillingMode,
  BillingPlan,
  CostCurrency,
  CostSettings,
  ModelPrice,
  ProviderKind,
  UsageCall,
  UsageRun
} from './types'

/** Día en que se comprobaron los precios de fábrica. */
export const PRICES_CHECKED = '2026-11-07'

export const DEFAULT_USD_TO_EUR = 0.87

export interface PriceEntry {
  /** Clave con la que se guarda un precio cambiado. */
  id: string
  label: string
  /** Nombres de modelo a los que se aplica (minúsculas, sin el prefijo del proveedor). */
  match: RegExp
  price: ModelPrice
  /** Precio sacado de una fuente que no es la oficial, o de promoción con fecha de fin. */
  note?: string
}

/**
 * Precios oficiales en dólares por millón de tokens (entrada / caché / salida), comprobados el día PRICES_CHECKED.
 * Se pueden cambiar desde el panel. Los alias de Claude Code («opus», «sonnet», «haiku», «fable») son el modelo actual.
 */
export const DEFAULT_PRICES: PriceEntry[] = [
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', match: /fable|mythos/, price: { input: 10, cached: 0.25, output: 50 } },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', match: /^opus$|opus-5-5|opus-5\.5/, price: { input: 4, cached: 0.2, output: 20 } },
  { id: 'claude-opus-5', label: 'Claude Opus 5 / 4.x', match: /opus-(5|4)/, price: { input: 5, cached: 0.5, output: 25 } },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 / 5', match: /^sonnet$|sonnet-5/, price: { input: 2, cached: 0.2, output: 10 } },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', match: /sonnet-4/, price: { input: 3, cached: 0.3, output: 15 } },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', match: /^haiku$|haiku-5/, price: { input: 0.1, cached: 0.01, output: 0.5 } },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', match: /haiku-4/, price: { input: 1, cached: 0.1, output: 5 } },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', match: /gpt-6\.1-sol/, price: { input: 2, cached: 0.1, output: 10 } },
  { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', match: /gpt-6\.1-terra/, price: { input: 1, cached: 0.05, output: 5 } },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', match: /gpt-6(\.\d+)?-astra/, price: { input: 10, cached: 1, output: 50 } },
  { id: 'gpt-6-sol', label: 'GPT-6 Sol', match: /gpt-6-sol/, price: { input: 2, cached: 0.2, output: 10 }, note: 'fuente no oficial' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', match: /gpt-6(\.\d+)?-luna/, price: { input: 0.1, cached: 0.01, output: 0.5 } },
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon', match: /gemini-4/, price: { input: 2, cached: 0.1, output: 10 }, note: 'promoción hasta el 30 nov' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', match: /gemini-3\.8-flash(?!-lite)/, price: { input: 0.75, cached: 0.075, output: 3.75 }, note: 'fuente no oficial' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', match: /gemini-3\.5-flash-lite/, price: { input: 0.3, cached: 0.03, output: 2.5 }, note: 'fuente no oficial' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', match: /gemini-3\.5-flash/, price: { input: 1.5, cached: 0.15, output: 9 } },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', match: /gemini-3\.1-flash-lite/, price: { input: 0.25, cached: 0.025, output: 1.5 } },
  { id: 'gemini-3.1-pro', label: 'Gemini 3.1 Pro', match: /gemini-3\.1-pro/, price: { input: 2, cached: 0.2, output: 12 } }
]

/** Modelos gratis de OpenRouter («…:free») y de Kilo («kilo/…/free»). */
const FREE_MODEL = /(:|\/)free$/

/** Modelo que usa cada CLI si no se elige ninguno (para poner precio a sus llamadas). */
const PROVIDER_DEFAULT_MODEL: Partial<Record<ProviderKind, string>> = {
  codex: 'gpt-6.1-sol',
  gemini: 'gemini-3.8-flash'
}

const LOCAL_PROVIDERS: ProviderKind[] = ['ollama', 'lmstudio']

/** Grupo de cuota de fábrica de cada proveedor (para las llamadas de becarios y agentes que ya no existen). */
const PROVIDER_GROUP: Partial<Record<ProviderKind, string>> = {
  claude: 'anthropic',
  codex: 'openai',
  gemini: 'google',
  muse: 'meta',
  ollama: 'local',
  lmstudio: 'local'
}

export function normModel(model: string | undefined): string {
  return (model ?? '').trim().toLowerCase().replace(/^(models|anthropic|openai|google|gemini)\//, '')
}

export function isFreeModel(model: string | undefined): boolean {
  return FREE_MODEL.test(normModel(model))
}

export function priceEntryFor(model: string | undefined): PriceEntry | undefined {
  const m = normModel(model)
  return m ? DEFAULT_PRICES.find((e) => e.match.test(m)) : undefined
}

/** Precio que se aplica a un modelo: el que cambiaste, el de fábrica o, para un modelo propio, el que añadiste. */
export function priceFor(model: string | undefined, provider: ProviderKind, costs?: CostSettings): ModelPrice | null {
  const m = normModel(model) || PROVIDER_DEFAULT_MODEL[provider] || ''
  if (!m) return null
  if (LOCAL_PROVIDERS.includes(provider) || FREE_MODEL.test(m)) return { input: 0, output: 0, cached: 0 }
  const custom = costs?.prices ?? {}
  if (custom[m]) return custom[m]
  const entry = priceEntryFor(m)
  if (entry) return custom[entry.id] ?? entry.price
  // Un modelo propio que contiene la clave que añadiste («deepseek» vale para «deepseek-v4-chat»).
  const key = Object.keys(custom)
    .filter((k) => !DEFAULT_PRICES.some((e) => e.id === k) && m.includes(k.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0]
  return key ? custom[key] : null
}

export function tokensUsd(input: number, cached: number, output: number, p: ModelPrice): number {
  const cachedPrice = p.cached ?? p.input / 10
  return (Math.max(0, input - cached) * p.input + Math.max(0, cached) * cachedPrice + Math.max(0, output) * p.output) / 1e6
}

/** real: lo dio el CLI · price: tokens × precio · estimated: tokens estimados × precio · free: no cuesta · unpriced: sin precio. */
export type CostSource = 'real' | 'price' | 'estimated' | 'free' | 'unpriced'

export interface CallCost {
  /** Lo que habría costado a precios de API, en dólares (null: no se sabe). */
  usd: number | null
  source: CostSource
}

/** Valor de una llamada a precios de API (lo que pagas si ese agente va por API; si es suscripción, lo que te ahorras). */
export function callCost(call: UsageCall, costs?: CostSettings): CallCost {
  if (typeof call.costUsd === 'number' && Number.isFinite(call.costUsd)) return { usd: Math.max(0, call.costUsd), source: 'real' }
  const price = priceFor(call.model, call.provider, costs)
  if (!price) return { usd: null, source: 'unpriced' }
  if (price.input === 0 && price.output === 0) return { usd: 0, source: 'free' }
  if (call.noTokens) {
    if (call.estInput == null && call.estOutput == null) return { usd: null, source: 'unpriced' }
    return { usd: tokensUsd(call.estInput ?? 0, 0, call.estOutput ?? 0, price), source: 'estimated' }
  }
  return { usd: tokensUsd(call.input, call.cached, call.output, price), source: 'price' }
}

// ---------- Cómo pagas cada agente ----------

export interface PlanInfo {
  key: string
  label: string
  provider: ProviderKind | 'local'
  /** Lo que se supone si no lo has indicado (local: en tu equipo; modelo gratis: gratis). */
  defaultMode?: BillingMode
}

/** La clave de lo que pagas por un agente: su grupo de cuota (una suscripción vale para varios agentes) o su id. */
export function planKeyFor(agentId: string, provider: ProviderKind, agents: AgentConfig[]): string {
  const agent = agents.find((a) => a.id === agentId)
  const parent = agent?.parentId ? agents.find((a) => a.id === agent.parentId) : undefined
  const group = agent?.quotaGroupId ?? parent?.quotaGroupId
  if (group) return group
  if (agent && !agent.isSubagent && provider === 'cli') return agent.id
  return PROVIDER_GROUP[provider] ?? (agent?.parentId || agentId)
}

/** Lo que puedes configurar: cada grupo de cuota con agentes y cada agente suelto (Hermes, los de catálogo). */
export function billingPlans(config: Pick<AppConfig, 'agents' | 'quotaGroups'>): PlanInfo[] {
  const out: PlanInfo[] = []
  for (const g of config.quotaGroups) {
    const used = config.agents.some((a) => !a.isSubagent && planKeyFor(a.id, a.provider, config.agents) === g.id)
    if (!used) continue
    out.push({ key: g.id, label: g.label, provider: g.provider, defaultMode: g.provider === 'local' ? 'local' : undefined })
  }
  for (const a of config.agents) {
    if (a.isSubagent) continue
    const key = planKeyFor(a.id, a.provider, config.agents)
    if (out.some((p) => p.key === key)) continue
    out.push({ key, label: a.name, provider: a.provider, defaultMode: LOCAL_PROVIDERS.includes(a.provider) ? 'local' : isFreeModel(a.model) ? 'free' : undefined })
  }
  return out
}

export function planMode(key: string, plans: PlanInfo[], costs?: CostSettings): BillingMode | undefined {
  return costs?.plans[key]?.mode ?? plans.find((p) => p.key === key)?.defaultMode
}

// ---------- Monedas ----------

export function usdTo(usd: number, costs?: Pick<CostSettings, 'currency' | 'usdToEur'>): number {
  return costs?.currency === 'EUR' ? usd * (costs.usdToEur || DEFAULT_USD_TO_EUR) : usd
}

export function toUsd(amount: number, currency: CostCurrency | undefined, costs?: Pick<CostSettings, 'usdToEur'>): number {
  return currency === 'EUR' ? amount / (costs?.usdToEur || DEFAULT_USD_TO_EUR) : amount
}

export function planMonthlyUsd(plan: BillingPlan | undefined, costs?: CostSettings): number | null {
  if (plan?.mode !== 'subscription' || typeof plan.monthly !== 'number' || !(plan.monthly >= 0)) return null
  return toUsd(plan.monthly, plan.currency ?? costs?.currency, costs)
}

export function budgetUsd(costs?: CostSettings): number | null {
  if (!costs || typeof costs.monthlyBudget !== 'number' || !(costs.monthlyBudget > 0)) return null
  return toUsd(costs.monthlyBudget, costs.budgetCurrency ?? costs.currency, costs)
}

// ---------- Resumen ----------

export interface AgentCost {
  key: string
  agentId: string
  name: string
  provider: ProviderKind
  planKey: string
  mode?: BillingMode
  calls: number
  /** Valor a precios de API de las llamadas con precio, en dólares. */
  apiUsd: number
  /** Llamadas sin precio (modelo desconocido o sin tokens). */
  unpriced: number
  /** Parte del valor que sale de tokens estimados (Hermes y agentes de catálogo). */
  estimatedUsd: number
  /** Parte que dio el propio CLI. */
  realUsd: number
}

export interface PlanCost {
  key: string
  label: string
  mode?: BillingMode
  /** Suscripción: lo que pagas al mes, en dólares. */
  monthlyUsd: number | null
  /** Valor a precios de API en el periodo elegido. */
  apiUsd: number
  /** Valor a precios de API en los últimos 30 días (para comparar con el precio del mes). */
  api30Usd: number
  /** Peticiones de los últimos 30 días en las que trabajó. */
  runs30: number
  unpriced: number
}

export interface DayCost {
  /** Medianoche local del día. */
  day: number
  apiUsd: number
  /** Lo que pagaste por uso ese día (agentes que van por API). */
  paidUsd: number
}

export interface CostSummary {
  /** Lo que pagaste por uso (agentes por API) en el periodo, en dólares. */
  paidUsd: number
  /** Todo lo usado, valorado a precios de API. */
  apiUsd: number
  estimatedUsd: number
  unpricedCalls: number
  /** Llamadas de agentes sin indicar cómo pagas. */
  unknownModeCalls: number
  byAgent: AgentCost[]
  byPlan: PlanCost[]
  byDay: DayCost[]
  budget: { limitUsd: number; spentUsd: number; pct: number; month: string } | null
}

const DAY = 24 * 3600_000

export function dayStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function monthKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthStart(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

/** Lo pagado por uso (API) desde el día 1 del mes, en dólares. */
export function monthApiSpendUsd(runs: UsageRun[], config: Pick<AppConfig, 'agents' | 'quotaGroups' | 'costs'>, now = Date.now()): number {
  const plans = billingPlans(config)
  const from = monthStart(now)
  let usd = 0
  for (const r of runs)
    for (const c of r.calls) {
      if (c.ts < from || c.ts > now) continue
      if (planMode(planKeyFor(c.agentId, c.provider, config.agents), plans, config.costs) !== 'api') continue
      usd += callCost(c, config.costs).usd ?? 0
    }
  return usd
}

/**
 * Resumen del dinero de las peticiones `runs` (ya filtradas por periodo y proyecto). Las cifras de 30 días de cada
 * suscripción salen de `allRuns` (todo el registro), para comparar con el precio del mes aunque mires «Hoy».
 */
export function costSummary(
  runs: UsageRun[],
  config: Pick<AppConfig, 'agents' | 'quotaGroups' | 'costs'>,
  allRuns: UsageRun[] = runs,
  now = Date.now()
): CostSummary {
  const costs = config.costs
  const plans = billingPlans(config)
  const agents = new Map<string, AgentCost>()
  const planCosts = new Map<string, PlanCost>()
  const days = new Map<number, DayCost>()
  const out: CostSummary = { paidUsd: 0, apiUsd: 0, estimatedUsd: 0, unpricedCalls: 0, unknownModeCalls: 0, byAgent: [], byPlan: [], byDay: [], budget: null }

  const planOf = (key: string): PlanCost => {
    let p = planCosts.get(key)
    if (!p) {
      const info = plans.find((x) => x.key === key)
      const group = config.quotaGroups.find((g) => g.id === key)
      const mode = planMode(key, plans, costs)
      p = {
        key,
        label: info?.label ?? group?.label ?? config.agents.find((a) => a.id === key)?.name ?? key,
        mode,
        monthlyUsd: planMonthlyUsd(costs?.plans[key], costs),
        apiUsd: 0,
        api30Usd: 0,
        runs30: 0,
        unpriced: 0
      }
      planCosts.set(key, p)
    }
    return p
  }

  for (const r of runs)
    for (const c of r.calls) {
      const planKey = planKeyFor(c.agentId, c.provider, config.agents)
      const mode = planMode(planKey, plans, costs)
      const cost = callCost(c, costs)
      const key = `${c.provider}:${c.agentName}`
      const a = agents.get(key) ?? { key, agentId: c.agentId, name: c.agentName, provider: c.provider, planKey, mode, calls: 0, apiUsd: 0, unpriced: 0, estimatedUsd: 0, realUsd: 0 }
      a.calls++
      const plan = planOf(planKey)
      if (cost.usd == null) {
        a.unpriced++
        plan.unpriced++
        out.unpricedCalls++
      } else {
        a.apiUsd += cost.usd
        plan.apiUsd += cost.usd
        out.apiUsd += cost.usd
        if (cost.source === 'estimated') {
          a.estimatedUsd += cost.usd
          out.estimatedUsd += cost.usd
        }
        if (cost.source === 'real') a.realUsd += cost.usd
        const day = dayStart(c.ts)
        const d = days.get(day) ?? { day, apiUsd: 0, paidUsd: 0 }
        d.apiUsd += cost.usd
        if (mode === 'api') {
          d.paidUsd += cost.usd
          out.paidUsd += cost.usd
        }
        days.set(day, d)
      }
      if (!mode) out.unknownModeCalls++
      agents.set(key, a)
    }

  // Suscripciones (y lo que tenga precio al mes): su valor de los últimos 30 días, para ver si compensan.
  const from30 = now - 30 * DAY
  for (const info of plans) if (planMode(info.key, plans, costs) === 'subscription') planOf(info.key)
  for (const r of allRuns) {
    if (r.startedAt < from30 - DAY) continue
    const touched = new Set<string>()
    for (const c of r.calls) {
      if (c.ts < from30) continue
      const planKey = planKeyFor(c.agentId, c.provider, config.agents)
      const plan = planCosts.get(planKey)
      if (!plan) continue
      plan.api30Usd += callCost(c, costs).usd ?? 0
      touched.add(planKey)
    }
    for (const k of touched) planCosts.get(k)!.runs30++
  }

  const limitUsd = budgetUsd(costs)
  if (limitUsd != null) {
    const spentUsd = monthApiSpendUsd(allRuns, config, now)
    out.budget = { limitUsd, spentUsd, pct: Math.round((spentUsd / limitUsd) * 100), month: monthKey(now) }
  }

  out.byAgent = [...agents.values()].sort((a, b) => b.apiUsd - a.apiUsd || b.calls - a.calls)
  out.byPlan = [...planCosts.values()].sort((a, b) => (b.monthlyUsd ?? 0) - (a.monthlyUsd ?? 0) || b.api30Usd - a.api30Usd)
  out.byDay = [...days.values()].sort((a, b) => a.day - b.day)
  return out
}

/** ¿Compensa una suscripción? worth: por API te habría costado más · cheaper-api: por API pagarías menos. */
export function subscriptionVerdict(p: PlanCost): 'worth' | 'cheaper-api' | null {
  if (p.mode !== 'subscription' || p.monthlyUsd == null) return null
  return p.api30Usd >= p.monthlyUsd ? 'worth' : 'cheaper-api'
}

// ---------- Validación (lo que llega de la interfaz o de config.json) ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const money = (v: unknown, max = 1e6): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 1e4) / 1e4 : undefined)
const MODES: BillingMode[] = ['subscription', 'api', 'free', 'local']
const KEY_RE = /^[\w.:\-/@]{1,80}$/

function validPrice(v: unknown): ModelPrice | null {
  if (!isObj(v)) return null
  const input = money(v.input, 10_000)
  const output = money(v.output, 10_000)
  if (input == null || output == null) return null
  const cached = money(v.cached, 10_000)
  return cached == null ? { input, output } : { input, output, cached }
}

/** Limpia los ajustes de coste: lo que no tenga sentido se quita (null si no queda nada que guardar). */
export function cleanCostSettings(v: unknown): CostSettings | null {
  if (!isObj(v)) return null
  const currency: CostCurrency = v.currency === 'EUR' ? 'EUR' : 'USD'
  const rate = money(v.usdToEur, 100)
  const out: CostSettings = { currency, usdToEur: rate && rate > 0 ? rate : DEFAULT_USD_TO_EUR, plans: {} }
  if (isObj(v.plans))
    for (const [k, p] of Object.entries(v.plans)) {
      if (!KEY_RE.test(k) || !isObj(p) || !MODES.includes(p.mode as BillingMode)) continue
      const plan: BillingPlan = { mode: p.mode as BillingMode }
      const monthly = money(p.monthly, 100_000)
      if (plan.mode === 'subscription' && monthly != null) {
        plan.monthly = monthly
        plan.currency = p.currency === 'EUR' ? 'EUR' : p.currency === 'USD' ? 'USD' : currency
      }
      out.plans[k] = plan
    }
  if (isObj(v.prices)) {
    const prices: Record<string, ModelPrice> = {}
    for (const [k, p] of Object.entries(v.prices)) {
      const key = k.trim().toLowerCase()
      const price = validPrice(p)
      if (KEY_RE.test(key) && price) prices[key] = price
    }
    if (Object.keys(prices).length) out.prices = prices
  }
  const budget = money(v.monthlyBudget, 1_000_000)
  if (budget && budget > 0) {
    out.monthlyBudget = budget
    out.budgetCurrency = v.budgetCurrency === 'EUR' ? 'EUR' : v.budgetCurrency === 'USD' ? 'USD' : currency
  }
  if (typeof v.budgetAlerted === 'string' && /^\d{4}-\d{2}:(80|100)$/.test(v.budgetAlerted)) out.budgetAlerted = v.budgetAlerted
  return out
}

/** Umbral de aviso del presupuesto que toca dar ahora (80 o 100), o null si ya se dio o no se llega. */
export function budgetAlertDue(spentUsd: number, limitUsd: number, month: string, alerted?: string): 80 | 100 | null {
  if (!(limitUsd > 0)) return null
  const pct = (spentUsd / limitUsd) * 100
  const level = pct >= 100 ? 100 : pct >= 80 ? 80 : null
  if (!level) return null
  const [m, done] = (alerted ?? '').split(':')
  if (m === month && Number(done) >= level) return null
  return level
}

/** «12,40 €», «0,031 $», «1.250 $»: con más decimales si es poco dinero. */
export function formatMoney(amount: number, currency: CostCurrency, loc = 'es-ES'): string {
  const abs = Math.abs(amount)
  const digits = abs === 0 ? 0 : abs < 0.1 ? 3 : abs >= 1000 ? 0 : 2
  try {
    return new Intl.NumberFormat(loc, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount)
  } catch {
    return `${amount.toFixed(digits)} ${currency === 'EUR' ? '€' : '$'}`
  }
}

/** Lo que va a Órbita (GET /usage/cost y la instantánea): importes ya en la moneda elegida. */
export function mobileCost(
  allRuns: UsageRun[],
  config: Pick<AppConfig, 'agents' | 'quotaGroups' | 'costs'>,
  days = 30,
  now = Date.now()
): import('./mobile').MobileCost {
  const from = now - days * DAY
  const runs = allRuns.filter((r) => r.startedAt >= from || (r.finishedAt ?? now) >= from)
  const sum = costSummary(runs, config, allRuns, now)
  const costs = config.costs
  const cur = (usd: number): number => Math.round(usdTo(usd, costs) * 10_000) / 10_000
  return {
    currency: costs?.currency ?? 'USD',
    days,
    paid: cur(sum.paidUsd),
    api: cur(sum.apiUsd),
    estimated: cur(sum.estimatedUsd),
    unpricedCalls: sum.unpricedCalls,
    budget: sum.budget ? { limit: cur(sum.budget.limitUsd), spent: cur(sum.budget.spentUsd), pct: sum.budget.pct } : null,
    byAgent: sum.byAgent.map((a) => ({ agentId: a.agentId, name: a.name, mode: a.mode ?? null, calls: a.calls, api: cur(a.apiUsd), estimated: a.estimatedUsd > 0 && a.estimatedUsd >= a.apiUsd / 2 })),
    subscriptions: sum.byPlan
      .filter((p) => p.mode === 'subscription')
      .map((p) => ({ key: p.key, label: p.label, monthly: p.monthlyUsd == null ? null : cur(p.monthlyUsd), api30: cur(p.api30Usd), runs30: p.runs30, verdict: subscriptionVerdict(p) })),
    pricesChecked: PRICES_CHECKED
  }
}
