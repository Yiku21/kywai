// La ventana y la copia en disco de sus ajustes (ver shared/uiSettings.ts y main/uiSettings.ts).
// Corre en el preload, antes que la interfaz: si al actualizar o reiniciar el localStorage llega vacío o viejo, lo
// rellena con lo del disco y la interfaz arranca ya con tus ajustes. Después vigila el localStorage y manda al disco
// cada cambio, venga de donde venga (así sirve para cualquier ajuste, también los que se añadan más adelante).
import { ipcRenderer } from 'electron'
import { diffUiSettings, pickUiSettings, type UiSettings } from '../shared/uiSettings'

/** Cada cuánto se mira si cambió algún ajuste. */
const WATCH_MS = 1000

// El preload se compila sin los tipos del navegador: lo justo de window y localStorage.
interface Storage {
  readonly length: number
  key(i: number): string | null
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}
interface PageGlobals {
  localStorage?: Storage
  addEventListener(type: string, fn: () => void): void
  document: { addEventListener(type: string, fn: () => void): void }
}
const page = globalThis as unknown as PageGlobals

function readLocal(storage: Storage): UiSettings {
  const entries: [string, string | null][] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k != null) entries.push([k, storage.getItem(k)])
  }
  return pickUiSettings(entries)
}

export function startUiSettingsMirror(): void {
  let storage: Storage
  try {
    const s = page.localStorage
    if (!s) return
    storage = s
  } catch {
    return // páginas sin almacén (data:, la de conectar del modo cliente)
  }

  let saved: UiSettings = {}
  try {
    saved = (ipcRenderer.sendSync('cowork:uiSettings:load') as UiSettings | null) ?? {}
  } catch {
    saved = {}
  }
  // Lo del disco manda: es la copia que sobrevive a actualizar y reiniciar.
  for (const [k, v] of Object.entries(saved)) {
    try {
      if (storage.getItem(k) !== v) storage.setItem(k, v)
    } catch {
      /* almacén lleno: sigue con lo demás */
    }
  }
  // Lo que solo estaba en la ventana (la primera vez: todos los ajustes de antes) pasa al disco.
  let last = saved
  const sync = (): void => {
    let now: UiSettings
    try {
      now = readLocal(storage)
    } catch {
      return
    }
    const patch = diffUiSettings(last, now)
    if (!Object.keys(patch).length) return
    last = now
    ipcRenderer.send('cowork:uiSettings:save', patch)
  }
  sync()
  setInterval(sync, WATCH_MS)
  page.addEventListener('pagehide', sync)
  page.addEventListener('beforeunload', sync)
  page.document.addEventListener('visibilitychange', sync)
}
