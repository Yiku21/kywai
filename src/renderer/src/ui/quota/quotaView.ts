import type { QuotaInfo, QuotaKind, QuotaSource, QuotaThresholds } from '@shared/types'
import { quotaLevel, type QuotaLevel } from '@shared/defaults'
import { t } from '@/lib/i18n'

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
  real: t('Dato real'),
  estimate: t('Estimación'),
  config: t('Según tu configuración'),
  demo: 'Demo',
  none: t('No disponible')
}

const SOURCE_SENTENCE: Record<QuotaSource, string> = {
  real: t('dato real'),
  estimate: t('estimación'),
  config: t('según tu configuración'),
  demo: t('dato de demostración'),
  none: t('sin datos')
}

export const KIND_LABEL: Record<QuotaKind, string> = {
  usage: t('Cuota de uso de la suscripción'),
  tokens: t('Presupuesto de tokens'),
  requests: t('Presupuesto de solicitudes'),
  local: t('Ejecución local')
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

export function describeQuota(q: QuotaInfo, th: QuotaThresholds, agentColor: string | undefined): QuotaView {
  let variant: QuotaVariant = quotaLevel(q.remainingPct, th, q.unlimited)
  if (variant === 'unknown' && q.kind === 'local') variant = 'local'
  const estimate = q.source === 'estimate'
  const color = levelColor(variant, agentColor)
  const pct = q.remainingPct != null && !Number.isNaN(q.remainingPct) ? Math.max(0, Math.min(100, q.remainingPct)) : null
  const src = SOURCE_SENTENCE[q.source] ?? t('sin datos')
  const approx = estimate ? t('aproximadamente ') : ''

  switch (variant) {
    case 'unlimited':
      return { variant, color, pct: null, barPct: 100, estimate, fixedValue: '∞', sentence: t('{label}: ejecución local sin límite de cuota', { label: q.label }) }
    case 'local':
      return { variant, color, pct: null, barPct: 100, estimate, fixedValue: 'Local', sentence: t('{label}: ejecución local, sin presupuesto configurado', { label: q.label }) }
    case 'unknown': {
      // Sin dato de cuota (p. ej. Gemini con clave de API): al menos, cuánto se ha usado hoy desde la app.
      const used = q.usedRequests ?? 0
      return used > 0
        ? { variant, color, pct: null, barPct: 0, estimate, fixedValue: t('{used} hoy', { used }), sentence: used === 1 ? t('{label}: cuota no disponible; 1 uso hoy desde kywai', { label: q.label }) : t('{label}: cuota no disponible; {used} usos hoy desde kywai', { label: q.label, used }) }
        : { variant, color, pct: null, barPct: 0, estimate, fixedValue: 'N/D', sentence: t('{label}: cuota no disponible', { label: q.label }) }
    }
    case 'empty':
      return { variant, color, pct: 0, barPct: 0, estimate, fixedValue: t('Agotada'), sentence: t('{label}: cuota agotada, {src}', { label: q.label, src }) }
    default: {
      const p = pct ?? 0
      const extra = variant === 'warn' ? t(', cuota baja') : variant === 'alert' ? t(', cuota casi agotada') : ''
      return {
        variant,
        color,
        pct: p,
        barPct: p,
        estimate,
        fixedValue: null,
        sentence: t('{label}: {approx}{Math}% de cuota restante, {src}{extra}', { label: q.label, approx, Math: Math.round(p), src, extra })
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
