import { locale, t } from '@/lib/i18n'
export function timeHM(ts: number): string {
  return new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
}

export function relativeTime(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return t('Sin datos')
  const s = Math.round((now - ts) / 1000)
  if (s < 5) return t('ahora')
  if (s < 60) return t('hace {s} s', { s })
  const m = Math.round(s / 60)
  if (m < 60) return t('hace {m} min', { m })
  const h = Math.round(m / 60)
  if (h < 24) return t('hace {h} h', { h })
  return new Date(ts).toLocaleDateString(locale())
}

export function untilTime(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return t('No disponible')
  const s = Math.round((ts - now) / 1000)
  if (s <= 0) return t('ya renovada')
  const m = Math.round(s / 60)
  if (m < 60) return t('en {m} min', { m })
  const h = Math.floor(m / 60)
  if (h < 48) return t('en {h} h {m} min', { h, m: m % 60 })
  return new Date(ts).toLocaleString(locale(), { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function compactNumber(n: number | null | undefined): string {
  if (n == null) return t('No disponible')
  return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
