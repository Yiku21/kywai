// Sustituto de ../quota para el servidor de pruebas del móvil: nunca consulta a Claude ni a Codex (no gasta cuota).
import type { QuotaInfo } from '@shared/types'

export const freshQuotaSnapshot = async (): Promise<Record<string, never>> => ({})
export const latestQuotas = (): QuotaInfo[] => []
export const refreshQuotas = async (): Promise<QuotaInfo[]> => []
export const recordUsage = (): void => {}
export const setClaudeRateLimit = (): void => {}
