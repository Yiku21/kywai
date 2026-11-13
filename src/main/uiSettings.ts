// Copia en disco de los ajustes de la interfaz de este dispositivo (ver shared/uiSettings.ts). Vive en la carpeta de
// datos (ajustes-interfaz.json), que no se toca al actualizar ni al reiniciar. La ventana la lee al abrir, antes de
// que arranque la interfaz, y le manda cada cambio.
import { ipcMain, session } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { applyUiSettingsPatch, pickUiSettings, type UiSettings } from '@shared/uiSettings'

/** Espera tras un cambio antes de escribir (varios cambios seguidos, una sola escritura). */
const SAVE_DELAY_MS = 400

export class UiSettingsFile {
  private settings: UiSettings = {}
  private timer: NodeJS.Timeout | null = null
  private dirty = false

  constructor(private readonly file: string) {
    try {
      if (existsSync(file)) {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as { settings?: Record<string, string | null> }
        this.settings = pickUiSettings(Object.entries(raw?.settings ?? {}))
      }
    } catch (e) {
      console.warn('[cowork] no se pudieron leer los ajustes de la interfaz', e)
    }
  }

  get(): UiSettings {
    return { ...this.settings }
  }

  /** Cambios llegados de una ventana; se escriben al poco. */
  patch(patch: unknown): void {
    if (!applyUiSettingsPatch(this.settings, patch)) return
    this.dirty = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS)
    this.timer.unref?.()
  }

  /** Escribe ya lo pendiente (al cerrar la app). Primero a un archivo aparte y luego lo cambia: nunca queda a medias. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (!this.dirty) return
    this.dirty = false
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify({ version: 1, settings: this.settings }, null, 1))
      renameSync(tmp, this.file)
    } catch (e) {
      console.warn('[cowork] no se pudieron guardar los ajustes de la interfaz', e)
    }
  }
}

let current: UiSettingsFile | null = null

/** Atiende a las ventanas (la principal, las de chat sueltas y la del modo cliente). Una vez, antes de abrir ventanas. */
export function initUiSettings(file: string): void {
  if (current) return
  current = new UiSettingsFile(file)
  const store = current
  ipcMain.on('cowork:uiSettings:load', (e) => {
    e.returnValue = store.get()
  })
  ipcMain.on('cowork:uiSettings:save', (_e, patch: unknown) => store.patch(patch))
}

/** Al cerrar: lo pendiente al disco, y que Chromium escriba también su localStorage. */
export function flushUiSettings(): void {
  current?.flush()
  try {
    session.defaultSession.flushStorageData()
  } catch {
    /* sin sesión todavía */
  }
}
