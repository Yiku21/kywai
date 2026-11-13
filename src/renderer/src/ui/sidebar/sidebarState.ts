import { locale, t } from '@/lib/i18n'

/** Barra lateral plegada (solo iconos): lo eligió el usuario, o por defecto en ventanas de menos de este ancho. */
export const AUTO_COLLAPSE_BELOW = 1300
const KEY = 'ai-cowork.sidebar'

export function readCollapsed(): boolean {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'closed') return true
    if (v === 'open') return false
  } catch {
    // Sin almacenamiento: se decide por el ancho.
  }
  return typeof window !== 'undefined' && window.innerWidth < AUTO_COLLAPSE_BELOW
}

/** Evento de ventana que lanza el logo de la cabecera para abrir o plegar la barra lateral. */
export const TOGGLE_SIDEBAR_EVENT = 'cowork:toggle-sidebar'

export function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? 'closed' : 'open')
  } catch {
    // Sin almacenamiento (ventana privada…): dura hasta cerrar.
  }
}

/** Ancho de la barra abierta: se cambia arrastrando su borde derecho. */
export const SIDEBAR_DEFAULT = 252
export const SIDEBAR_MIN = 200
export const SIDEBAR_MAX = 440
/** Arrastrada por debajo de esto, la barra se pliega en su columna de iconos. */
export const SIDEBAR_FOLD_BELOW = 150
const WIDTH_KEY = 'ai-cowork.sidebarWidth'

export function clampSidebarWidth(w: number): number {
  return Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)))
}

export function readSidebarWidth(): number {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY))
    if (Number.isFinite(v) && v > 0) return clampSidebarWidth(v)
  } catch {
    // Sin almacenamiento: el ancho de siempre.
  }
  return SIDEBAR_DEFAULT
}

/** null vuelve al ancho de siempre. */
export function saveSidebarWidth(w: number | null): void {
  try {
    if (w == null) localStorage.removeItem(WIDTH_KEY)
    else localStorage.setItem(WIDTH_KEY, String(clampSidebarWidth(w)))
  } catch {
    // Sin almacenamiento: dura hasta cerrar.
  }
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const MOD = isMac ? '⌘' : 'Ctrl'

export const SEARCH_KEYS = `${MOD} K`
export const NEW_CHAT_KEYS = `${MOD} ⇧ O`

const mod = (e: KeyboardEvent): boolean => (isMac ? e.metaKey : e.ctrlKey) && !e.altKey

/** Ctrl+K (⌘K en el Mac): abre o cierra el buscador. */
export function isSearchKey(e: KeyboardEvent): boolean {
  return mod(e) && !e.shiftKey && e.key.toLowerCase() === 'k'
}

/** Ctrl+Mayús+O (⌘⇧O en el Mac): conversación nueva. */
export function isNewChatKey(e: KeyboardEvent): boolean {
  return mod(e) && e.shiftKey && e.key.toLowerCase() === 'o'
}

/** Fecha corta para la lista: la hora si es de hoy, «ayer», o el día y el mes. */
export function shortDate(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const today = new Date(now)
  const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, today)) return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  const y = new Date(now - 86_400_000)
  if (sameDay(d, y)) return t('ayer')
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' })
}
