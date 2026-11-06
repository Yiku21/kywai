import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tr } from '@shared/i18n'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { AgentConfig, AppConfig, QuotaBudget, QuotaGroupConfig, QuotaInfo, QuotaSnapshot } from '@shared/types'
import { readCodexRateLimits, type CodexRateLimits, type CodexRateWindow } from './agents/codex'
import type { RateLimitInfo } from './agents/types'
import { emit } from './events'
import { probeClaudeUsage, probeCodexRateLimits } from './quotaProbe'

interface UsageRecord {
  g: string
  ts: number
  tokens: number
  requests: number
}

const HOUR = 3600_000
const DAY = 24 * HOUR
const KEEP_MS = 8 * DAY

let root = ''
let records: UsageRecord[] = []
let claudeRate: RateLimitInfo | null = null
let codexRate: CodexRateLimits | null = null
let latest: QuotaInfo[] = []
let timer: NodeJS.Timeout | null = null
let usageSaveTimer: NodeJS.Timeout | null = null
let getCfg: () => AppConfig = () => {
  throw new Error('quota not initialised')
}
let getAgents: () => AgentConfig[] = () => []

function usageFile(): string {
  return join(root, 'usage.json')
}
function cacheFile(): string {
  return join(root, 'quota-cache.json')
}

function writeJson(file: string, data: unknown): void {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data), 'utf8')
  renameSync(tmp, file)
}

export function initQuota(workspaceRoot: string, cfg: () => AppConfig, agents: () => AgentConfig[]): void {
  root = workspaceRoot
  getCfg = cfg
  getAgents = agents
  try {
    if (existsSync(usageFile())) {
      const j = JSON.parse(readFileSync(usageFile(), 'utf8')) as { records?: UsageRecord[] }
      records = (j.records ?? []).filter((r) => r && typeof r.g === 'string' && typeof r.ts === 'number')
    }
  } catch {
    records = []
  }
  try {
    if (existsSync(cacheFile())) {
      const j = JSON.parse(readFileSync(cacheFile(), 'utf8')) as { claude?: RateLimitInfo }
      if (j.claude && Array.isArray(j.claude.windows)) claudeRate = j.claude
    }
  } catch {
    claudeRate = null
  }
}

/** Cada cuánto se pregunta la cuota a Claude y Codex (no gasta uso). */
const PROBE_MS = 5 * 60_000
let probeTimer: NodeJS.Timeout | null = null

export function startQuotaTimer(): void {
  if (timer) clearInterval(timer)
  timer = setInterval(() => void refreshQuotas({ codex: true }), 60_000)
  if (probeTimer) clearInterval(probeTimer)
  probeTimer = setInterval(() => void refreshQuotas({ probe: true }), PROBE_MS)
}

export function stopQuota(): void {
  if (timer) clearInterval(timer)
  if (probeTimer) clearInterval(probeTimer)
  timer = probeTimer = null
  flushUsage()
}

/** Se queda con los datos de Codex más recientes (los de su app-server o los de sus archivos de sesión). */
function setCodexRate(rl: CodexRateLimits | null): void {
  if (rl && (!codexRate || rl.updatedAt >= codexRate.updatedAt)) codexRate = rl
}

let probing: Promise<void> | null = null
/** Las comprobaciones automáticas (CLIs falsos) apagan las consultas a los CLIs reales. */
let probeEnabled = true

export function setQuotaProbing(on: boolean): void {
  probeEnabled = on
}
/** Por qué no se pudo leer la cuota de Claude en la última consulta (se enseña en su indicador). */
let claudeProblem: string | null = null
/** Claude Code pasa por otro servidor (OmniRoute…): se ofrece el arreglo en su indicador. */
let claudeOverride = false

/** Pregunta la cuota a Claude («/usage») y a Codex (app-server), si están activos. */
function probeAll(): Promise<void> {
  if (!probeEnabled) return Promise.resolve()
  if (probing) return probing
  const providers = new Set(getAgents().map((a) => a.provider))
  probing = (async () => {
    const [claude, codex] = await Promise.all([
      providers.has('claude') ? probeClaudeUsage().catch(() => null) : null,
      providers.has('codex') ? probeCodexRateLimits().catch(() => null) : null
    ])
    if (claude?.info) setClaudeRateLimit(claude.info)
    if (claude) {
      claudeProblem = claude.info ? null : (claude.problem ?? null)
      claudeOverride = !claude.info && !!claude.override
    }
    setCodexRate(codex)
  })().finally(() => {
    probing = null
  })
  return probing
}

function flushUsage(): void {
  if (usageSaveTimer) {
    clearTimeout(usageSaveTimer)
    usageSaveTimer = null
  }
  if (!root) return
  try {
    writeJson(usageFile(), { records })
  } catch (e) {
    console.error('[cowork] no se pudo guardar usage.json', e)
  }
}

export function recordUsage(groupId: string | undefined, tokens: number, requests = 1): void {
  if (!groupId) return
  const now = Date.now()
  records.push({ g: groupId, ts: now, tokens: Math.max(0, Math.round(tokens)), requests })
  records = records.filter((r) => now - r.ts < KEEP_MS)
  if (usageSaveTimer) clearTimeout(usageSaveTimer)
  usageSaveTimer = setTimeout(flushUsage, 500)
}

export function setClaudeRateLimit(info: RateLimitInfo): void {
  // Keep windows we already knew if this event only carries a status.
  if (!info.windows.length && claudeRate) info = { ...info, windows: claudeRate.windows }
  claudeRate = info
  if (!root) return
  try {
    writeJson(cacheFile(), { claude: claudeRate })
  } catch {
    /* non fatal */
  }
}

export function latestQuotas(): QuotaInfo[] {
  return latest
}

// ---------- computation ----------

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10))
}

function minutesLabel(min: number | null): string {
  if (min === 300) return tr('Ventana de 5 h')
  if (min === 10080) return tr('Ventana semanal')
  if (min == null) return tr('Ventana de uso')
  const h = Math.round(min / 60)
  return tr('Ventana de {h} h', { h })
}

function claudeWindowLabel(name: string): string {
  switch (name) {
    case 'five_hour':
      return tr('Ventana de 5 h')
    case 'seven_day':
      return tr('Ventana semanal')
    case 'seven_day_opus':
      return 'Semanal (Opus)'
    case 'seven_day_sonnet':
      return 'Semanal (Sonnet)'
    default: {
      // Ventana semanal de un modelo concreto (p. ej. «seven_day_fable» de «/usage»).
      const m = name.match(/^seven_day_(.+)$/)
      if (m) return `Semanal (${m[1].replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())})`
      return name.replace(/_/g, ' ')
    }
  }
}

interface PeriodWindow {
  start: number
  label: string
  resetsAt: number | null
}

function periodWindow(period: QuotaBudget['period'], groupId: string, now: number): PeriodWindow {
  if (period === 'diario') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    const start = d.getTime()
    const next = new Date(start)
    next.setDate(next.getDate() + 1)
    return { start, label: tr('Diario'), resetsAt: next.getTime() }
  }
  const span = period === '5h' ? 5 * HOUR : 7 * DAY
  const start = now - span
  const inWindow = records.filter((r) => r.g === groupId && r.ts >= start)
  const oldest = inWindow.length ? Math.min(...inWindow.map((r) => r.ts)) : null
  return {
    start,
    label: period === '5h' ? 'Últimas 5 h' : 'Últimos 7 días',
    resetsAt: oldest != null ? oldest + span : null
  }
}

function usedSince(groupId: string, start: number): { tokens: number; requests: number } {
  let tokens = 0
  let requests = 0
  for (const r of records) {
    if (r.g === groupId && r.ts >= start) {
      tokens += r.tokens
      requests += r.requests
    }
  }
  return { tokens, requests }
}

function estimate(g: QuotaGroupConfig, budget: QuotaBudget, now: number): Partial<QuotaInfo> {
  const w = periodWindow(budget.period, g.id, now)
  const used = usedSince(g.id, w.start)
  const usedAmount = budget.unit === 'tokens' ? used.tokens : used.requests
  const remaining = Math.max(0, budget.limit - usedAmount)
  return {
    kind: budget.unit === 'tokens' ? 'tokens' : 'requests',
    remainingPct: clampPct((remaining / budget.limit) * 100),
    remaining,
    limit: budget.limit,
    unit: budget.unit,
    period: w.label,
    resetsAt: w.resetsAt,
    updatedAt: now,
    source: 'estimate',
    note: tr('Estimación con el consumo registrado por la app y tu presupuesto.'),
    usedTokens: used.tokens,
    usedRequests: used.requests
  }
}

function codexReal(rl: CodexRateLimits, now: number): Partial<QuotaInfo> | null {
  const all = [rl.windows.primary, rl.windows.secondary].filter((w): w is CodexRateWindow => !!w)
  if (!all.length) return null
  const live = all.filter((w) => w.resetsAt == null || w.resetsAt > now)
  if (!live.length) {
    return {
      kind: 'usage',
      remainingPct: null,
      source: 'none',
      updatedAt: rl.updatedAt,
      note: tr('La ventana de uso de Codex se renovó; se actualizará con el próximo uso de Codex.')
    }
  }
  const scored = live.map((w) => ({ w, remaining: clampPct(100 - w.usedPercent), label: minutesLabel(w.windowMinutes) }))
  scored.sort((a, b) => a.remaining - b.remaining)
  const min = scored[0]
  const notes: string[] = []
  if (scored.length > 1) notes.push(scored.map((s) => `${s.label}: ${Math.round(s.remaining)}% restante`).join(' · '))
  if (rl.reachedType) notes.push(tr('Límite alcanzado'))
  if (rl.planType) notes.push(`Plan ${rl.planType}`)
  notes.push(tr('Dato real de Codex (última sesión registrada).'))
  return {
    kind: 'usage',
    remainingPct: rl.reachedType ? 0 : min.remaining,
    unit: '%',
    period: min.label,
    resetsAt: min.w.resetsAt,
    updatedAt: rl.updatedAt,
    source: 'real',
    note: notes.join(' · ')
  }
}

function claudeReal(info: RateLimitInfo, now: number): Partial<QuotaInfo> | null {
  const live = info.windows.filter((w) => w.usedPct != null && (w.resetsAt == null || w.resetsAt > now))
  const rejected = info.status === 'rejected' && (info.resetsAt == null || info.resetsAt > now)
  if (!live.length && !rejected) return null
  if (!live.length) {
    return {
      kind: 'usage',
      remainingPct: 0,
      resetsAt: info.resetsAt ?? null,
      updatedAt: info.receivedAt,
      source: 'real',
      note: tr('Claude rechazó la última solicitud por límite de uso.')
    }
  }
  const scored = live.map((w) => ({ w, remaining: clampPct(100 - (w.usedPct ?? 0)), label: claudeWindowLabel(w.name) }))
  scored.sort((a, b) => a.remaining - b.remaining)
  const min = scored[0]
  const notes: string[] = []
  if (scored.length > 1) notes.push(scored.map((s) => `${s.label}: ${Math.round(s.remaining)}% restante`).join(' · '))
  if (rejected) notes.push(tr('Límite alcanzado'))
  notes.push(tr('Dato real informado por Claude Code en la última ejecución.'))
  return {
    kind: 'usage',
    remainingPct: rejected ? 0 : min.remaining,
    unit: '%',
    period: min.label,
    resetsAt: min.w.resetsAt ?? null,
    updatedAt: info.receivedAt,
    source: 'real',
    note: notes.join(' · ')
  }
}

function geminiAuthType(): string | null {
  try {
    const raw = readFileSync(join(homedir(), '.gemini', 'settings.json'), 'utf8')
    const j = JSON.parse(raw) as { security?: { auth?: { selectedType?: string } }; selectedAuthType?: string }
    return j.security?.auth?.selectedType ?? j.selectedAuthType ?? null
  } catch {
    return null
  }
}

function geminiNote(): string {
  const t = geminiAuthType()
  if (t === 'gemini-api-key') {
    return tr('Gemini CLI usa una API key (gemini-api-key) y no informa la cuota restante. Puedes configurar un presupuesto para estimarla.')
  }
  if (t === 'oauth-personal') {
    return tr('Gemini CLI (cuenta de Google) no informa la cuota restante. Puedes configurar un presupuesto para estimarla.')
  }
  return tr('Gemini CLI no informa la cuota restante. Puedes configurar un presupuesto para estimarla.')
}

export function computeQuotas(cfg: AppConfig, agents: AgentConfig[], now = Date.now()): QuotaInfo[] {
  return cfg.quotaGroups.map((g): QuotaInfo => {
    const agentIds = agents.filter((a) => a.quotaGroupId === g.id).map((a) => a.id)
    const todayStart = periodWindow('diario', g.id, now).start
    const usedWindowStart = g.budget ? periodWindow(g.budget.period, g.id, now).start : todayStart
    const used = usedSince(g.id, usedWindowStart)
    const base: QuotaInfo = {
      id: g.id,
      label: g.label,
      kind: 'usage',
      agentIds,
      remainingPct: null,
      source: 'none',
      updatedAt: now,
      usedTokens: used.tokens,
      usedRequests: used.requests
    }
    const withBudgetOr = (fallbackNote: string): QuotaInfo =>
      g.budget ? { ...base, ...estimate(g, g.budget, now) } : { ...base, note: fallbackNote }

    if (g.provider === 'local') {
      if (g.unlimited) {
        return { ...base, kind: 'local', source: 'config', unlimited: true, note: tr('Ejecución local en tu PC: sin cuota') }
      }
      return g.budget ? { ...base, ...estimate(g, g.budget, now) } : { ...base, kind: 'local', note: tr('Sin cuota configurada') }
    }
    if (g.provider === 'codex') {
      const real = codexRate ? codexReal(codexRate, now) : null
      if (real && real.source === 'real') return { ...base, ...real }
      if (g.budget) return { ...base, ...estimate(g, g.budget, now) }
      return { ...base, ...(real ?? {}), note: real?.note ?? 'No disponible' }
    }
    if (g.provider === 'claude') {
      const real = claudeRate ? claudeReal(claudeRate, now) : null
      if (real) return { ...base, ...real }
      const fallback = withBudgetOr(
        claudeProblem ?? tr('Claude Code no informa la cuota restante en modo automático. Puedes configurar un presupuesto para estimarla.')
      )
      return claudeOverride ? { ...fallback, fix: 'claude-direct' } : fallback
    }
    if (g.provider === 'gemini') return withBudgetOr(geminiNote())
    if (g.provider === 'muse') {
      return withBudgetOr(tr('Muse Code no informa la cuota restante de la suscripción (límites cada 5 horas). Puedes configurar un presupuesto para estimarla.'))
    }
    return withBudgetOr('No disponible')
  })
    // Un grupo sin ningún agente (se quitó o está desactivado) no enseña su indicador.
    .filter((q) => q.agentIds.length > 0)
}

/** Uso actual de cada ventana con dato real (Claude y Codex), para medir lo que gasta cada petición. */
export function quotaSnapshot(now = Date.now()): QuotaSnapshot {
  const snap: QuotaSnapshot = {}
  const groups = getCfg().quotaGroups
  const claudeGroup = groups.find((g) => g.provider === 'claude')
  if (claudeRate && claudeGroup) {
    const windows = claudeRate.windows
      .filter((w) => w.usedPct != null && (w.resetsAt == null || w.resetsAt > now))
      .map((w) => ({ name: w.name, label: claudeWindowLabel(w.name), usedPct: w.usedPct!, resetsAt: w.resetsAt ?? null }))
    if (windows.length) snap[claudeGroup.id] = { label: claudeGroup.label, at: claudeRate.receivedAt, windows }
  }
  const codexGroup = groups.find((g) => g.provider === 'codex')
  if (codexRate && codexGroup) {
    const windows = (['primary', 'secondary'] as const)
      .map((name) => ({ name, w: codexRate!.windows[name] }))
      .filter((x): x is { name: 'primary' | 'secondary'; w: CodexRateWindow } => !!x.w && (x.w.resetsAt == null || x.w.resetsAt > now))
      .map(({ name, w }) => ({ name, label: minutesLabel(w.windowMinutes), usedPct: w.usedPercent, resetsAt: w.resetsAt }))
    if (windows.length) snap[codexGroup.id] = { label: codexGroup.label, at: codexRate.updatedAt, windows }
  }
  return snap
}

/** Pregunta la cuota (sin gastar uso) y devuelve la foto; si tarda más de maxWaitMs, la última conocida. */
export async function freshQuotaSnapshot(maxWaitMs: number): Promise<QuotaSnapshot> {
  await Promise.race([refreshQuotas({ codex: true, probe: true }).catch(() => undefined), new Promise((r) => setTimeout(r, maxWaitMs))])
  return quotaSnapshot()
}

let refreshing: Promise<QuotaInfo[]> | null = null

/**
 * Recompute (optionally re-reading Codex rollout files, or asking Claude and Codex directly with `probe`)
 * and emit `quota.update`.
 */
export async function refreshQuotas(opts: { codex?: boolean; probe?: boolean } = {}): Promise<QuotaInfo[]> {
  if (opts.probe) await probeAll()
  if (opts.codex || !codexRate) {
    if (!refreshing) {
      refreshing = (async () => {
        try {
          setCodexRate(await readCodexRateLimits())
        } catch (e) {
          console.error('[cowork] no se pudo leer la cuota de Codex', e)
        }
        return latest
      })().finally(() => {
        refreshing = null
      })
    }
    await refreshing
  }
  latest = computeQuotas(getCfg(), getAgents())
  emit({ kind: 'quota.update', quotas: latest })
  return latest
}
