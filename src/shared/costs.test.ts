import { describe, expect, it } from 'vitest'
import type { AgentConfig, AppConfig, UsageCall, UsageRun } from './types'
import { DEFAULT_CONFIG } from './defaults'
import {
  billingPlans,
  budgetAlertDue,
  callCost,
  cleanCostSettings,
  costSummary,
  formatMoney,
  monthApiSpendUsd,
  planKeyFor,
  priceFor,
  subscriptionVerdict,
  tokensUsd
} from './costs'

const NOW = new Date(2026, 10, 7, 18, 0).getTime()
const DAY = 24 * 3600_000

function call(over: Partial<UsageCall>): UsageCall {
  return { ts: NOW - 3600_000, kind: 'task', agentId: 'codex', agentName: 'Codex', provider: 'codex', input: 0, output: 0, cached: 0, durationMs: 1000, ok: true, ...over }
}

function run(calls: UsageCall[], startedAt = NOW - 2 * 3600_000): UsageRun {
  return { runId: `r${Math.random()}`, projectId: 'p', projectName: 'P', request: 'x', startedAt, finishedAt: startedAt + 60_000, status: 'ok', tasks: 1, tasksDone: 1, calls }
}

const config = (costs?: AppConfig['costs']): Pick<AppConfig, 'agents' | 'quotaGroups' | 'costs'> => ({ agents: DEFAULT_CONFIG.agents, quotaGroups: DEFAULT_CONFIG.quotaGroups, costs })

describe('precio de cada llamada', () => {
  it('usa el coste que da Claude Code tal cual', () => {
    expect(callCost(call({ provider: 'claude', agentId: 'claude', model: 'sonnet', input: 1_000_000, output: 0, costUsd: 0.0467 }))).toEqual({ usd: 0.0467, source: 'real' })
  })

  it('calcula con la tabla: la entrada de caché cuesta su precio aparte', () => {
    // GPT-6.1 Sol: 2 $ entrada, 0,10 $ caché, 10 $ salida por millón.
    const c = callCost(call({ model: 'gpt-6.1-sol', input: 1_000_000, cached: 400_000, output: 100_000 }))
    expect(c.source).toBe('price')
    expect(c.usd).toBeCloseTo(0.6 * 2 + 0.4 * 0.1 + 0.1 * 10, 6)
  })

  it('sin modelo elegido usa el predeterminado del CLI; los alias de Claude son el modelo actual', () => {
    expect(priceFor('', 'codex')).toEqual({ input: 2, cached: 0.1, output: 10 })
    expect(priceFor('opus', 'claude')).toEqual({ input: 4, cached: 0.2, output: 20 })
    expect(priceFor('claude-opus-4-8', 'claude')?.input).toBe(5)
    expect(priceFor('anthropic/claude-sonnet-5-5', 'hermes')?.input).toBe(2)
    expect(priceFor('gemini-3.8-flash', 'gemini')?.output).toBe(3.75)
  })

  it('lo local y los modelos «gratis» no cuestan; un modelo desconocido queda sin precio', () => {
    expect(callCost(call({ provider: 'lmstudio', model: 'google/gemma-4', input: 5000, output: 500 }))).toEqual({ usd: 0, source: 'free' })
    expect(callCost(call({ provider: 'cli', model: 'kilo/kilo-auto/free', noTokens: true }))).toEqual({ usd: 0, source: 'free' })
    expect(callCost(call({ provider: 'cli', model: 'qualquier-cosa-x', input: 10, output: 10 }))).toEqual({ usd: null, source: 'unpriced' })
  })

  it('Hermes: el coste sale de la estimación por longitud, marcado como estimado', () => {
    const c = callCost(call({ provider: 'hermes', agentId: 'hermes', model: 'gpt-6.1-sol', noTokens: true, estInput: 1_000_000, estOutput: 0 }))
    expect(c).toEqual({ usd: 2, source: 'estimated' })
    expect(callCost(call({ provider: 'hermes', agentId: 'hermes', model: 'gpt-6.1-sol', noTokens: true })).source).toBe('unpriced')
  })

  it('los precios que cambias mandan, también para un modelo propio', () => {
    const costs = cleanCostSettings({ currency: 'USD', usdToEur: 0.9, plans: {}, prices: { 'gpt-6.1-sol': { input: 1, output: 1 }, deepseek: { input: 0.3, output: 1.2 } } })!
    expect(priceFor('gpt-6.1-sol', 'codex', costs)).toEqual({ input: 1, output: 1 })
    expect(priceFor('deepseek-v4-chat', 'cli', costs)).toEqual({ input: 0.3, output: 1.2 })
    // Sin precio de caché: la décima parte de la entrada.
    expect(tokensUsd(1_000_000, 1_000_000, 0, { input: 1, output: 1 })).toBeCloseTo(0.1)
  })
})

describe('cómo pagas cada agente', () => {
  it('una suscripción vale para todos los agentes de su grupo; los sueltos van por su id', () => {
    const agents: AgentConfig[] = [...DEFAULT_CONFIG.agents, { ...DEFAULT_CONFIG.agents[0], id: 'kilo', name: 'Kilo', provider: 'cli', model: 'kilo/kilo-auto/free', quotaGroupId: undefined }]
    expect(planKeyFor('claude', 'claude', agents)).toBe('anthropic')
    expect(planKeyFor('becario-1', 'claude', agents)).toBe('anthropic')
    expect(planKeyFor('kilo', 'cli', agents)).toBe('kilo')
    const plans = billingPlans({ agents, quotaGroups: DEFAULT_CONFIG.quotaGroups })
    expect(plans.find((p) => p.key === 'kilo')?.defaultMode).toBe('free')
    expect(plans.find((p) => p.key === 'local')?.defaultMode).toBe('local')
    expect(plans.find((p) => p.key === 'anthropic')?.defaultMode).toBeUndefined()
  })

  it('limpia lo que llega: modos, importes y claves raras fuera', () => {
    const c = cleanCostSettings({
      currency: 'EUR',
      usdToEur: -3,
      plans: { anthropic: { mode: 'subscription', monthly: 18 }, openai: { mode: 'raro' }, 'x y': { mode: 'api' } },
      prices: { 'GPT-X': { input: 1, output: 2 }, malo: { input: 'a', output: 1 } },
      monthlyBudget: 50,
      budgetAlerted: 'cualquier cosa'
    })!
    expect(c.usdToEur).toBe(0.87)
    expect(c.plans).toEqual({ anthropic: { mode: 'subscription', monthly: 18, currency: 'EUR' } })
    expect(c.prices).toEqual({ 'gpt-x': { input: 1, output: 2 } })
    expect(c.monthlyBudget).toBe(50)
    expect(c.budgetCurrency).toBe('EUR')
    expect(c.budgetAlerted).toBeUndefined()
    expect(cleanCostSettings('nada')).toBeNull()
  })
})

describe('resumen de coste', () => {
  const costs = cleanCostSettings({
    currency: 'USD',
    usdToEur: 0.9,
    plans: { anthropic: { mode: 'subscription', monthly: 20, currency: 'USD' }, openai: { mode: 'api' } },
    monthlyBudget: 10,
    budgetCurrency: 'USD'
  })!
  const runs = [
    run([
      call({ provider: 'claude', agentId: 'claude', agentName: 'Claude', model: 'sonnet', costUsd: 3 }),
      call({ model: 'gpt-6.1-sol', input: 1_000_000, output: 0 }),
      call({ provider: 'hermes', agentId: 'hermes', agentName: 'Hermes', kind: 'plan', noTokens: true })
    ]),
    run([call({ provider: 'claude', agentId: 'claude', agentName: 'Claude', model: 'sonnet', costUsd: 30, ts: NOW - 20 * DAY })], NOW - 20 * DAY)
  ]

  it('separa lo que pagas por uso de lo que vale todo a precios de API', () => {
    const s = costSummary([runs[0]], config(costs), runs, NOW)
    expect(s.apiUsd).toBeCloseTo(5)
    expect(s.paidUsd).toBeCloseTo(2)
    expect(s.unpricedCalls).toBe(1)
    expect(s.unknownModeCalls).toBe(1)
    expect(s.byAgent.map((a) => a.name)).toEqual(['Claude', 'Codex', 'Hermes'])
    expect(s.byDay).toHaveLength(1)
  })

  it('¿compensa la suscripción? compara su precio con lo que valió en 30 días', () => {
    const s = costSummary([runs[0]], config(costs), runs, NOW)
    const claude = s.byPlan.find((p) => p.key === 'anthropic')!
    expect(claude.monthlyUsd).toBe(20)
    expect(claude.api30Usd).toBeCloseTo(33)
    expect(claude.runs30).toBe(2)
    expect(subscriptionVerdict(claude)).toBe('worth')
    expect(subscriptionVerdict({ ...claude, api30Usd: 5 })).toBe('cheaper-api')
  })

  it('presupuesto: solo cuenta lo de este mes de los agentes por API', () => {
    expect(monthApiSpendUsd(runs, config(costs), NOW)).toBeCloseTo(2)
    const s = costSummary(runs, config(costs), runs, NOW)
    expect(s.budget).toEqual({ limitUsd: 10, spentUsd: 2, pct: 20, month: '2026-11' })
  })

  it('el aviso del presupuesto se da una vez al 80 % y otra al pasarlo', () => {
    expect(budgetAlertDue(7, 10, '2026-11')).toBeNull()
    expect(budgetAlertDue(8, 10, '2026-11')).toBe(80)
    expect(budgetAlertDue(9, 10, '2026-11', '2026-11:80')).toBeNull()
    expect(budgetAlertDue(10.5, 10, '2026-11', '2026-11:80')).toBe(100)
    expect(budgetAlertDue(12, 10, '2026-11', '2026-11:100')).toBeNull()
    expect(budgetAlertDue(9, 10, '2026-12', '2026-11:100')).toBe(80)
  })

  it('formatea el dinero con más decimales si es poco', () => {
    expect(formatMoney(12.4, 'EUR', 'es-ES')).toMatch(/^12,40\s€$/)
    expect(formatMoney(0.0312, 'USD', 'en-US')).toBe('$0.031')
  })
})
