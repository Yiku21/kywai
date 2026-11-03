export function timeHM(ts: number): string {
  return new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
}

export function relativeTime(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return 'Sin datos'
  const s = Math.round((now - ts) / 1000)
  if (s < 5) return 'ahora'
  if (s < 60) return `hace ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `hace ${h} h`
  return new Date(ts).toLocaleDateString('es')
}

export function untilTime(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return 'No disponible'
  const s = Math.round((ts - now) / 1000)
  if (s <= 0) return 'ya renovada'
  const m = Math.round(s / 60)
  if (m < 60) return `en ${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `en ${h} h ${m % 60} min`
  return new Date(ts).toLocaleString('es', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function compactNumber(n: number | null | undefined): string {
  if (n == null) return 'No disponible'
  return new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
