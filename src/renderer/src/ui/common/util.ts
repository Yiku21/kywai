import type { CSSProperties } from 'react'
import { timeHM } from '@/lib/format'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Variables CSS de color de agente para estilos tintados. */
export function agentVars(color: string): CSSProperties {
  return { '--agent': color } as CSSProperties
}

/** Mensaje legible de un error (quita el prefijo de IPC de Electron). */
export function errorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Error desconocido'
  return raw.replace(/^Error invoking remote method '[^']*':\s*/, '').replace(/^Error:\s*/, '') || 'Error desconocido'
}

export function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

export function extOf(name: string): string {
  const base = basename(name)
  const i = base.lastIndexOf('.')
  return i > 0 ? base.slice(i + 1).toLowerCase() : ''
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico', 'heic'])

export function fileKind(name: string, mime?: string): 'pdf' | 'image' | 'other' {
  const ext = extOf(name)
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime?.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image'
  return 'other'
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')} min`
}

const nf1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('es', { maximumFractionDigits: 0 })

/** 12400 → "12,4 k". */
export function kTokens(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${nf1.format(n / 1_000_000)} M`
  if (a >= 1000) return `${nf1.format(n / 1000)} k`
  return nf0.format(n)
}

/** Cantidades exactas hasta 100 000, compactas a partir de ahí. */
export function amount(n: number): string {
  return Math.abs(n) >= 100_000 ? kTokens(n) : nf0.format(n)
}

/** Hora si es de hoy; día + hora si no. */
export function shortTime(ts: number): string {
  const d = new Date(ts)
  if (d.toDateString() === new Date().toDateString()) return timeHM(ts)
  return `${d.toLocaleDateString('es', { day: 'numeric', month: 'short' })} · ${timeHM(ts)}`
}

export function isoTime(ts: number): string {
  try {
    return new Date(ts).toISOString()
  } catch {
    return ''
  }
}
