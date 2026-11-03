import type { QuotaInfo, QuotaKind, QuotaSource, QuotaThresholds } from '@shared/types'
import { quotaLevel, type QuotaLevel } from '@shared/defaults'

/** Variante visual del chip: los niveles de quotaLevel + 'local' (ejecución local sin presupuesto). */
export type QuotaVariant = QuotaLevel | 'local'

export interface QuotaView {
  variant: QuotaVariant
  /** Color de acento (CSS). */
  color: string
  /** Porcentaje numérico que se muestra/interpola (null si no aplica). */
  pct: number | null
  /** Anchura de la barra 0..100. */
  barPct: number
  estimate: boolean
  /** Texto del valor cuando no es un porcentaje. */
  fixedValue: string | null
  /** Frase completa para lectores de pantalla y tooltip. */
  sentence: string
}

export const SOURCE_LABEL: Record<QuotaSource, string> = {
  real: 'Dato real',
  estimate: 'Estimación',
  config: 'Según tu configuración',
  demo: 'Demo',
  none: 'No disponible'
}

const SOURCE_SENTENCE: Record<QuotaSource, string> = {
  real: 'dato real',
  estimate: 'estimación',
  config: 'según tu configuración',
  demo: 'dato de demostración',
  none: 'sin datos'
}

export const KIND_LABEL: Record<QuotaKind, string> = {
  usage: 'Cuota de uso de la suscripción',
  tokens: 'Presupuesto de tokens',
  requests: 'Presupuesto de solicitudes',
  local: 'Ejecución local'
}

export function levelColor(variant: QuotaVariant, agentColor: string | undefined): string {
  switch (variant) {
    case 'warn':
      return 'var(--warn)'
    case 'alert':
    case 'empty':
      return 'var(--alert)'
    case 'unknown':
      return 'var(--text-3)'
    default:
      return agentColor || 'var(--cyan)'
  }
}

export function describeQuota(q: QuotaInfo, t: QuotaThresholds, agentColor: string | undefined): QuotaView {
  let variant: QuotaVariant = quotaLevel(q.remainingPct, t, q.unlimited)
  if (variant === 'unknown' && q.kind === 'local') variant = 'local'
  const estimate = q.source === 'estimate'
  const color = levelColor(variant, agentColor)
  const pct = q.remainingPct != null && !Number.isNaN(q.remainingPct) ? Math.max(0, Math.min(100, q.remainingPct)) : null
  const src = SOURCE_SENTENCE[q.source] ?? 'sin datos'
  const approx = estimate ? 'aproximadamente ' : ''

  switch (variant) {
    case 'unlimited':
      return { variant, color, pct: null, barPct: 100, estimate, fixedValue: '∞', sentence: `${q.label}: ejecución local sin límite de cuota` }
    case 'local':
      return { variant, color, pct: null, barPct: 100, estimate, fixedValue: 'Local', sentence: `${q.label}: ejecución local, sin presupuesto configurado` }
    case 'unknown': {
      // Sin dato de cuota (p. ej. Gemini con clave de API): al menos, cuánto se ha usado hoy desde la app.
      const used = q.usedRequests ?? 0
      return used > 0
        ? { variant, color, pct: null, barPct: 0, estimate, fixedValue: `${used} hoy`, sentence: `${q.label}: cuota no disponible; ${used} ${used === 1 ? 'uso' : 'usos'} hoy desde AI Cowork` }
        : { variant, color, pct: null, barPct: 0, estimate, fixedValue: 'N/D', sentence: `${q.label}: cuota no disponible` }
    }
    case 'empty':
      return { variant, color, pct: 0, barPct: 0, estimate, fixedValue: 'Agotada', sentence: `${q.label}: cuota agotada, ${src}` }
    default: {
      const p = pct ?? 0
      const extra = variant === 'warn' ? ', cuota baja' : variant === 'alert' ? ', cuota casi agotada' : ''
      return {
        variant,
        color,
        pct: p,
        barPct: p,
        estimate,
        fixedValue: null,
        sentence: `${q.label}: ${approx}${Math.round(p)}% de cuota restante, ${src}${extra}`
      }
    }
  }
}

/** Gravedad para ordenar/resumir (mayor = peor). */
export function severity(v: QuotaVariant): number {
  switch (v) {
    case 'empty':
      return 4
    case 'alert':
      return 3
    case 'warn':
      return 2
    case 'unknown':
      return 1
    default:
      return 0
  }
}
