// Ajustes de la interfaz de este dispositivo (música, efectos, voces, calidad del 3D, tema propio, anchos…) guardados
// también en el disco del motor, no solo en el localStorage de la ventana. El localStorage se puede perder al
// actualizar o reiniciar (cierre a medias antes de que Chromium lo escriba, carpeta de la página distinta, almacén
// borrado); la copia en disco lo devuelve al abrir. Lo puro va aquí para probarlo; el disco en main/uiSettings.ts y
// la ventana en preload/uiSettings.ts.

/** Claves que son ajustes de kywai (las de otras webs o librerías no se tocan). */
const PREFIXES = ['aicowork.', 'ai-cowork.', 'kywai.']

/** Un valor más grande que esto no se copia al disco (no es un ajuste: sería una lista enorme). */
export const MAX_VALUE_CHARS = 256 * 1024
/** Como mucho tantas claves, por si algo se desboca. */
export const MAX_KEYS = 400

export type UiSettings = Record<string, string>
/** Cambios: un texto es el valor nuevo; null, que se quitó. */
export type UiSettingsPatch = Record<string, string | null>

export function isUiSettingKey(key: unknown): key is string {
  return typeof key === 'string' && key.length <= 120 && PREFIXES.some((p) => key.startsWith(p))
}

function keepValue(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_VALUE_CHARS
}

/** Lo que vale la pena guardar de un almacén (solo claves de kywai y valores razonables). */
export function pickUiSettings(entries: Iterable<[string, string | null]>): UiSettings {
  const out: UiSettings = {}
  let n = 0
  for (const [k, v] of entries) {
    if (n >= MAX_KEYS) break
    if (isUiSettingKey(k) && keepValue(v)) {
      out[k] = v
      n++
    }
  }
  return out
}

/** Qué cambió de `before` a `after` (null = la clave ya no está). Vacío si nada. */
export function diffUiSettings(before: UiSettings, after: UiSettings): UiSettingsPatch {
  const patch: UiSettingsPatch = {}
  for (const [k, v] of Object.entries(after)) if (before[k] !== v) patch[k] = v
  for (const k of Object.keys(before)) if (!(k in after)) patch[k] = null
  return patch
}

/** Aplica unos cambios llegados de la ventana; ignora lo que no sea un ajuste de kywai. Devuelve si cambió algo. */
export function applyUiSettingsPatch(target: UiSettings, patch: unknown): boolean {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false
  let changed = false
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!isUiSettingKey(k)) continue
    if (v === null) {
      if (k in target) {
        delete target[k]
        changed = true
      }
    } else if (keepValue(v) && target[k] !== v) {
      if (!(k in target) && Object.keys(target).length >= MAX_KEYS) continue
      target[k] = v
      changed = true
    }
  }
  return changed
}
