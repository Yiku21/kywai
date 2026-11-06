// Cuentas del registro de consumo: totales, reparto por agente, cuota gastada y exportación a CSV.
import type { QuotaSnapshot, UsageCall, UsageRun } from '@shared/types'
import { locale, t } from '@/lib/i18n'

/** Tokens de una llamada (entrada + salida). */
export const callTokens = (c: UsageCall): number => c.input + c.output

/** Tokens «nuevos»: sin la entrada leída de caché, que cuesta mucho menos. */
export const freshTokens = (c: UsageCall): number => Math.max(0, c.input - c.cached) + c.output

export function runDuration(r: UsageRun, now = Date.now()): number {
  return Math.max(0, (r.finishedAt ?? now) - r.startedAt - (r.pausedMs ?? 0))
}

export interface QuotaDelta {
  groupId: string
  group: string
  window: string
  label: string
  /** Puntos de porcentaje gastados durante la petición. */
  delta: number
}

/** Cuánto subió el uso de cada ventana de cuota entre el antes y el después (si no se renovó por medio). */
export function quotaDeltas(before?: QuotaSnapshot, after?: QuotaSnapshot): QuotaDelta[] {
  if (!before || !after) return []
  const out: QuotaDelta[] = []
  for (const [groupId, b] of Object.entries(before)) {
    const a = after[groupId]
    if (!a) continue
    for (const wb of b.windows) {
      const wa = a.windows.find((w) => w.name === wb.name)
      if (!wa) continue
      if (wb.resetsAt != null && wa.resetsAt != null && Math.abs(wa.resetsAt - wb.resetsAt) > 15 * 60_000) continue
      out.push({ groupId, group: b.label, window: wb.name, label: wb.label, delta: Math.max(0, Math.round((wa.usedPct - wb.usedPct) * 10) / 10) })
    }
  }
  return out
}

/** Nombre corto de una ventana de cuota: «5 h», «semana», «semana Fable». */
export function shortWindow(label: string): string {
  if (/5\s*h/i.test(label)) return '5 h'
  if (/^ventana semanal$/i.test(label)) return 'semana'
  const m = label.match(/^semanal \((.+)\)$/i)
  if (m) return t('semana {n}', { n: m[1] })
  return label.replace(/^ventana de /i, '')
}

/** «Claude 5 h +5 %» (con espacios que no se parten). */
export function deltaText(d: QuotaDelta): string {
  return `${d.group} ${shortWindow(d.label)} +${d.delta.toLocaleString(locale())} %`.replace(/ (?=\+)/, ' ')
}

export interface AgentTotals {
  key: string
  name: string
  provider: string
  calls: number
  failed: number
  input: number
  output: number
  cached: number
  tokens: number
  durationMs: number
  noTokens: boolean
}

export interface QuotaTotal {
  key: string
  group: string
  label: string
  delta: number
  /** Peticiones en las que se pudo medir. */
  runs: number
}

export interface UsageTotals {
  runs: number
  ok: number
  failed: number
  cancelled: number
  running: number
  /** Suma de lo que tardó cada petición (tiempo real). */
  wallMs: number
  /** Suma del tiempo de todas las llamadas (los agentes trabajan a la vez: puede ser mayor que el real). */
  agentMs: number
  calls: number
  failedCalls: number
  input: number
  output: number
  cached: number
  tokens: number
  freshTokens: number
  /** Tokens de planificar (coste de coordinar el equipo). */
  planTokens: number
  /** Tokens de llamadas que fallaron (gastados sin resultado). */
  wastedTokens: number
  noTokenCalls: number
  byAgent: AgentTotals[]
  quota: QuotaTotal[]
}

export function summarize(runs: UsageRun[], now = Date.now()): UsageTotals {
  const t: UsageTotals = {
    runs: runs.length,
    ok: 0,
    failed: 0,
    cancelled: 0,
    running: 0,
    wallMs: 0,
    agentMs: 0,
    calls: 0,
    failedCalls: 0,
    input: 0,
    output: 0,
    cached: 0,
    tokens: 0,
    freshTokens: 0,
    planTokens: 0,
    wastedTokens: 0,
    noTokenCalls: 0,
    byAgent: [],
    quota: []
  }
  const agents = new Map<string, AgentTotals>()
  const quota = new Map<string, QuotaTotal>()
  for (const r of runs) {
    t[r.status === 'ok' ? 'ok' : r.status === 'failed' ? 'failed' : r.status === 'cancelled' ? 'cancelled' : 'running']++
    t.wallMs += runDuration(r, now)
    for (const c of r.calls) {
      const tokens = callTokens(c)
      t.calls++
      t.agentMs += c.durationMs
      t.input += c.input
      t.output += c.output
      t.cached += c.cached
      t.tokens += tokens
      t.freshTokens += freshTokens(c)
      if (c.kind === 'plan') t.planTokens += tokens
      if (!c.ok) {
        t.failedCalls++
        t.wastedTokens += tokens
      }
      if (c.noTokens) t.noTokenCalls++
      const key = `${c.provider}:${c.agentName}`
      const a = agents.get(key) ?? {
        key,
        name: c.agentName,
        provider: c.provider,
        calls: 0,
        failed: 0,
        input: 0,
        output: 0,
        cached: 0,
        tokens: 0,
        durationMs: 0,
        noTokens: false
      }
      a.calls++
      if (!c.ok) a.failed++
      a.input += c.input
      a.output += c.output
      a.cached += c.cached
      a.tokens += tokens
      a.durationMs += c.durationMs
      a.noTokens ||= !!c.noTokens
      agents.set(key, a)
    }
    for (const d of quotaDeltas(r.quotaBefore, r.quotaAfter)) {
      const key = `${d.groupId}:${d.window}`
      const q = quota.get(key) ?? { key, group: d.group, label: d.label, delta: 0, runs: 0 }
      q.delta = Math.round((q.delta + d.delta) * 10) / 10
      q.runs++
      quota.set(key, q)
    }
  }
  t.byAgent = [...agents.values()].sort((a, b) => b.tokens - a.tokens || b.calls - a.calls)
  t.quota = [...quota.values()]
  return t
}

/** «1,2 M», «184 k», «950». */
export function compactTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString(locale(), { maximumFractionDigits: 1 })} M`
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString(locale())} k`
  if (n >= 1000) return `${(n / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })} k`
  return String(n)
}

/** «45 s», «12 min», «1 h 05 min». */
export function shortDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

const STATUS_LABEL: Record<UsageRun['status'], string> = { running: t('en marcha'), ok: t('bien'), failed: t('con errores'), cancelled: t('cancelada') }

export function statusLabel(s: UsageRun['status']): string {
  return STATUS_LABEL[s]
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Una fila por llamada a un agente, con los datos de su petición (para abrirlo en Excel o Numbers). */
export function usageCsv(runs: UsageRun[]): string {
  const head = [
    'fecha',
    'proyecto',
    'peticion',
    'estado_peticion',
    'duracion_peticion_s',
    'cuota_gastada',
    'tipo',
    'agente',
    'proveedor',
    'modelo',
    'tokens_entrada',
    'tokens_salida',
    'tokens_cache',
    'duracion_llamada_s',
    'llamada_ok'
  ]
  const rows = [head.join(',')]
  for (const r of runs) {
    const quota = quotaDeltas(r.quotaBefore, r.quotaAfter)
      .map((d) => `${d.group} ${d.label} +${d.delta}%`)
      .join(' · ')
    const base = [new Date(r.startedAt).toISOString(), r.projectName, r.request, statusLabel(r.status), Math.round(runDuration(r) / 1000), quota]
    for (const c of r.calls) {
      rows.push(
        [
          ...base,
          c.kind === 'plan' ? 'planificar' : c.kind === 'verify' ? 'verificar' : 'tarea',
          c.agentName,
          c.provider,
          c.model ?? '',
          c.noTokens ? '' : c.input,
          c.noTokens ? '' : c.output,
          c.noTokens ? '' : c.cached,
          Math.round(c.durationMs / 1000),
          c.ok ? 'si' : 'no'
        ]
          .map(csvCell)
          .join(',')
      )
    }
  }
  return `${rows.join('\n')}\n`
}
