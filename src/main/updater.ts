import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater, type UpdateInfo } from 'electron-updater'

let initialized = false

/** Iniciar después de app.whenReady(); la publicación proporciona app-update.yml. */
export function initUpdater(): void {
  if (initialized || !app.isPackaged) return
  if (!existsSync(join(process.resourcesPath, 'app-update.yml'))) {
    console.info('[updater] No hay configuración de publicación; se omite la comprobación.')
    return
  }
  initialized = true
  autoUpdater.logger = console
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.info('[updater] Actualización disponible:', info.version)
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.info('[updater] Actualización descargada; se instalará al salir:', info.version)
  })
  autoUpdater.on('error', (error: Error) => {
    console.error('[updater] Error de actualización:', error)
  })

  void autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
    console.error('[updater] No se pudo comprobar la actualización:', error)
  })
}
