// Navegador de kywai: una pestaña de navegador dentro de la app, con su propia sesión guardada, donde entras con tus
// cuentas (GoHighLevel, un panel de tu web…) para que los agentes puedan leer y recorrer esas páginas sin que nunca
// les des la contraseña. Aquí va lo que comparten el motor y la interfaz; el navegador en sí está en
// src/main/browser.ts y la pestaña en src/renderer/src/ui/pane/BrowserPane.tsx.

/** Lo que enseña la barra del navegador (llega con el evento browser.state). */
export interface BrowserState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  /** Un agente lo está usando ahora (sale su nombre encima, con «Parar»). */
  agent?: { taskId: string; name: string; taskTitle: string; action: string } | null
  /** Un agente acaba de empezar a usarlo: la interfaz abre la pestaña para que lo veas. */
  reveal?: boolean
}

/** Sitio de la pestaña en la ventana (en píxeles CSS de la interfaz). */
export interface BrowserRect {
  x: number
  y: number
  width: number
  height: number
}

/** Lo que manda la pestaña desde otro dispositivo (cliente, navegador web): ve capturas y pasa clics y teclas. */
export type BrowserRemoteInput =
  | { type: 'click'; x: number; y: number }
  | { type: 'scroll'; x: number; y: number; dy: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: string }

/** Teclas especiales que se pueden mandar (desde otro dispositivo o la herramienta navegador_tecla). */
export const BROWSER_KEYS = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Space'] as const

export function isBrowserKey(k: unknown): k is (typeof BROWSER_KEYS)[number] {
  return typeof k === 'string' && (BROWSER_KEYS as readonly string[]).includes(k)
}

/** Página en blanco del principio (y la que se ve tras «Cerrar sesión en todo»). */
export const BLANK_URL = 'about:blank'

/**
 * Lo escrito en la barra de direcciones → una dirección que abrir. «gohighlevel.com» lleva https://; lo que no
 * parece una dirección se busca en DuckDuckGo. Nunca devuelve otros esquemas (file:, javascript:, data:…).
 */
export function addressToUrl(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return safeUrl(text)
  if (/^localhost(:\d+)?(\/|$)/i.test(text) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(text)) return safeUrl(`http://${text}`)
  // Un dominio: algo.algo sin espacios (y sin otro esquema delante, como javascript:).
  if (!/\s/.test(text) && /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(text)) return safeUrl(`https://${text}`)
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/\s/.test(text)) return null
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`
}

/** Solo http y https (lo que pide un agente o la barra; nada de file:, javascript:, chrome:…). */
export function safeUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}

/** El sitio de una dirección (lo que recuerda «Permitir siempre en esta sesión» para ese agente). */
export function siteOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host.replace(/^www\./, '') || url
  } catch {
    return url
  }
}

/** Ruta relativa segura para guardar una captura en la carpeta de la tarea (null si sale de ella o no es una imagen). */
export function captureRelPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const parts = raw.replace(/\\/g, '/').split('/').map((p) => p.trim()).filter(Boolean)
  if (!parts.length || parts.length > 6) return null
  if (parts.some((p) => p === '.' || p === '..' || p.includes('\0') || p.length > 80 || /^[a-z]:$/i.test(p))) return null
  const name = parts[parts.length - 1]
  if (!/\.(png|jpe?g)$/i.test(name)) parts[parts.length - 1] = `${name}.png`
  return parts.join('/')
}

const num = (v: unknown, min: number, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null)

/** Lo que manda la interfaz para colocar la pestaña, comprobado (null: que no se vea). */
export function browserRectArg(raw: unknown): BrowserRect | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const x = num(r.x, -10000, 20000)
  const y = num(r.y, -10000, 20000)
  const width = num(r.width, 0, 20000)
  const height = num(r.height, 0, 20000)
  if (x === null || y === null || width === null || height === null || width < 1 || height < 1) return null
  return { x, y, width, height }
}

/** Un clic, rueda, texto o tecla de otro dispositivo, comprobado (null si no vale). */
export function browserInputArg(raw: unknown): BrowserRemoteInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const x = num(r.x, 0, 20000)
  const y = num(r.y, 0, 20000)
  if (r.type === 'click' && x !== null && y !== null) return { type: 'click', x, y }
  if (r.type === 'scroll' && x !== null && y !== null) {
    const dy = num(r.dy, -5000, 5000)
    return dy === null ? null : { type: 'scroll', x, y, dy }
  }
  if (r.type === 'text' && typeof r.text === 'string' && r.text.length > 0 && r.text.length <= 2000) return { type: 'text', text: r.text }
  if (r.type === 'key' && isBrowserKey(r.key)) return { type: 'key', key: r.key }
  return null
}
