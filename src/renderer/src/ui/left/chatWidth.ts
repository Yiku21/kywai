/**
 * Ancho del chat elegido a mano (arrastrando su borde derecho). Se guarda en este equipo; null = ancho automático,
 * que ya da prioridad al chat en ventanas medianas (ver App.module.css).
 */
/**
 * Por debajo de este ancho de ventana, chat y espacio 3D van en pestañas (Chat / Espacio) en vez de lado a lado.
 * Debe coincidir con los @media (max-width: 949.98px) de App.module.css y Header.module.css.
 */
export const TABS_QUERY = '(max-width: 949.98px)'

const KEY = 'ai-cowork.chatWidth'

/** Lo mínimo que puede medir el chat y lo mínimo que se le deja al espacio 3D al lado. */
export const CHAT_MIN = 300
export const SPACE_MIN = 320

/** Ajusta un ancho pedido al sitio disponible: nunca menos que CHAT_MIN ni tanto que el 3D quede por debajo de SPACE_MIN. */
export function clampChatWidth(width: number, available: number): number {
  const max = Math.max(CHAT_MIN, available - SPACE_MIN)
  return Math.round(Math.min(Math.max(width, CHAT_MIN), max))
}

export function readChatWidth(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY))
    return Number.isFinite(n) && n >= CHAT_MIN ? n : null
  } catch {
    return null
  }
}

export function saveChatWidth(width: number | null): void {
  try {
    if (width == null) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(Math.round(width)))
  } catch {
    // Sin almacenamiento (ventana privada…): el ancho dura hasta cerrar.
  }
}
