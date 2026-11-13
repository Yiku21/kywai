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

/** Botón del ratón (el central también sirve para abrir enlaces en pestaña nueva en muchas webs). */
export type BrowserMouseButton = 'left' | 'right' | 'middle'
/** Teclas que se mantienen pulsadas con otra (Ctrl+A, Mayús+Tab…). */
export type BrowserModifier = 'shift' | 'control' | 'alt' | 'meta'

/** Lo que manda la pestaña desde otro dispositivo (cliente, navegador web): ve imágenes y pasa ratón y teclado. */
export type BrowserRemoteInput =
  | { type: 'click'; x: number; y: number; button?: BrowserMouseButton; clickCount?: number }
  /** Ratón paso a paso: mover (con el botón pulsado si se arrastra), pulsar y soltar. */
  | { type: 'mouse'; action: 'move' | 'down' | 'up'; x: number; y: number; button?: BrowserMouseButton; clickCount?: number; buttons?: BrowserMouseButton[] }
  | { type: 'scroll'; x: number; y: number; dy: number; dx?: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: string; modifiers?: BrowserModifier[] }

/** Una imagen de la pestaña para otro dispositivo, con lo que hace falta para manejarla como una web normal. */
export interface BrowserFrame {
  /** JPEG en data URL (sin imagen si no cambió nada desde «after»). */
  image?: string
  /** Tamaño de la página en píxeles CSS (las coordenadas de ratón van en estos píxeles). */
  width: number
  height: number
  /** Cuenta de imágenes: se pide la siguiente con «after» y el servidor espera a que cambie algo. */
  version: number
  /** Puntero que pide la página donde está el ratón (mano en un enlace, barra en un texto…), en CSS. */
  cursor: string
}

/** Lo que pide la vista remota: la imagen siguiente a «after», a su tamaño, y el hueco que tiene para la página. */
export interface BrowserFrameRequest {
  after?: number
  /** Ancho máximo de la imagen en píxeles de pantalla (su hueco por la densidad de la pantalla). */
  maxWidth?: number
  /** Hueco que tiene la vista remota (en píxeles CSS): si nadie la ve en el servidor, la página se maqueta a ese tamaño. */
  viewport?: { width: number; height: number }
}

/** Teclas especiales que se pueden mandar (desde otro dispositivo o la herramienta navegador_tecla). */
export const BROWSER_KEYS = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Space'] as const

export function isBrowserKey(k: unknown): k is (typeof BROWSER_KEYS)[number] {
  return typeof k === 'string' && (BROWSER_KEYS as readonly string[]).includes(k)
}

/**
 * ¿La tarea necesita el navegador de kywai? Cuando lo nombra (o sus herramientas navegador_…) o habla de un sitio
 * que solo se ve con la cuenta del usuario, como GoHighLevel. Así no va a un agente que no lo tiene.
 */
export function needsKywaiBrowser(text: string): boolean {
  return /navegador (de|del) kywai|navegador incorporado|pesta[ñn]a\s*[«"'“]?\s*navegador|\bnavegador_[a-z]+|kywai[- ]navegador|kywai'?s? (built-in )?browser|\b(go ?high ?level|ghl)\b/i.test(text)
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

const BUTTONS: readonly BrowserMouseButton[] = ['left', 'right', 'middle']
const MODIFIERS: readonly BrowserModifier[] = ['shift', 'control', 'alt', 'meta']
const isButton = (v: unknown): v is BrowserMouseButton => typeof v === 'string' && (BUTTONS as readonly string[]).includes(v)

/** Teclas que se pueden mandar desde otro dispositivo: las especiales, F1–F12 y una letra o cifra (con Ctrl, etc.). */
export function isRemoteKey(k: unknown): k is string {
  return isBrowserKey(k) || (typeof k === 'string' && (/^F([1-9]|1[0-2])$/.test(k) || /^[a-zA-Z0-9]$/.test(k)))
}

/** Un clic, ratón, rueda, texto o tecla de otro dispositivo, comprobado (null si no vale). */
export function browserInputArg(raw: unknown): BrowserRemoteInput | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const x = num(r.x, 0, 20000)
  const y = num(r.y, 0, 20000)
  const button = isButton(r.button) ? r.button : 'left'
  const clickCount = num(r.clickCount, 1, 3) ?? 1
  if (r.type === 'click' && x !== null && y !== null) return { type: 'click', x, y, button, clickCount }
  if (r.type === 'mouse' && x !== null && y !== null && (r.action === 'move' || r.action === 'down' || r.action === 'up')) {
    const buttons = Array.isArray(r.buttons) ? [...new Set(r.buttons.filter(isButton))] : []
    return { type: 'mouse', action: r.action, x, y, button, clickCount, buttons }
  }
  if (r.type === 'scroll' && x !== null && y !== null) {
    const dy = num(r.dy, -5000, 5000)
    const dx = r.dx === undefined ? 0 : num(r.dx, -5000, 5000)
    return dy === null || dx === null ? null : { type: 'scroll', x, y, dy, dx }
  }
  if (r.type === 'text' && typeof r.text === 'string' && r.text.length > 0 && r.text.length <= 2000) return { type: 'text', text: r.text }
  if (r.type === 'key' && isRemoteKey(r.key)) {
    const modifiers = Array.isArray(r.modifiers) ? [...new Set(r.modifiers.filter((m): m is BrowserModifier => typeof m === 'string' && (MODIFIERS as readonly string[]).includes(m)))] : []
    // Una letra sola sin Ctrl/Alt/Cmd es texto: va con «text».
    if (/^[a-zA-Z0-9]$/.test(r.key) && !modifiers.some((m) => m !== 'shift')) return null
    return { type: 'key', key: r.key, modifiers }
  }
  return null
}

/** Lo que pide la vista remota, comprobado (lo que no valga se ignora). */
export function browserFrameArg(raw: unknown): BrowserFrameRequest {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: BrowserFrameRequest = {}
  const after = num(r.after, 0, Number.MAX_SAFE_INTEGER)
  if (after !== null) out.after = Math.floor(after)
  const maxWidth = num(r.maxWidth, 200, 4000)
  if (maxWidth !== null) out.maxWidth = Math.round(maxWidth)
  const vp = r.viewport as Record<string, unknown> | undefined
  const w = num(vp?.width, 1, 20000)
  const h = num(vp?.height, 1, 20000)
  if (w !== null && h !== null) out.viewport = { width: Math.round(w), height: Math.round(h) }
  return out
}

/** El puntero de Electron («hand», «text»…) como cursor CSS. */
export function cssCursor(type: string): string {
  const map: Record<string, string> = { hand: 'pointer', pointer: 'pointer', nodrop: 'no-drop', 'not-allowed': 'not-allowed', 'vertical-text': 'vertical-text' }
  if (map[type]) return map[type]
  return /^(default|crosshair|text|wait|help|progress|move|grab|grabbing|cell|copy|alias|context-menu|zoom-in|zoom-out|col-resize|row-resize|all-scroll|[nsew]{1,2}-resize|nesw-resize|nwse-resize|ew-resize|ns-resize|none)$/.test(type) ? type : 'default'
}
