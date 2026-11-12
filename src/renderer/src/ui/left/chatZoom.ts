/**
 * Tamaño de la letra del chat elegido con Ctrl + rueda del ratón, en %. 100 = el tamaño de siempre. Se guarda en
 * este equipo (cada ordenador o navegador recuerda el suyo).
 */
const KEY = 'ai-cowork.chatZoom'

export const ZOOM_MIN = 50
export const ZOOM_MAX = 200
export const ZOOM_STEP = 10

/** Ajusta un % a los límites y a pasos de 10 (110, 120…), para que no se quede en 107 %. */
export function clampZoom(pct: number): number {
  if (!Number.isFinite(pct)) return 100
  const stepped = Math.round(pct / ZOOM_STEP) * ZOOM_STEP
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, stepped))
}

/** Un golpe de rueda hacia arriba (deltaY < 0) agranda la letra; hacia abajo la achica. */
export function zoomAfterWheel(pct: number, deltaY: number): number {
  if (deltaY === 0) return clampZoom(pct)
  return clampZoom(pct + (deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
}

export function loadChatZoom(): number {
  try {
    const v = localStorage.getItem(KEY)
    return v == null ? 100 : clampZoom(Number(v))
  } catch {
    return 100
  }
}

export function saveChatZoom(pct: number): void {
  try {
    if (pct === 100) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(pct))
  } catch {
    /* sin almacenamiento: vale solo para esta sesión */
  }
}
