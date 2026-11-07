// Actualizaciones de las versiones descargadas de GitHub Releases (las que compila .github/workflows/publicar-escritorio.yml).
// Solo esas traen app-update.yml; las compiladas en el propio equipo (instalar-mac.sh, instalar-linux.sh, npm run dist:*)
// no lo traen y se actualizan con «Buscar actualizaciones» desde su clon de git (selfUpdate.ts).
//
// Al abrirse, la app busca la última versión. En Windows y en el AppImage de Linux la descarga y, si llega en los
// primeros minutos, se reinicia ya con ella; si llega más tarde, se instala al cerrar. En el Mac la versión
// descargada no va firmada por Apple y no se puede reemplazar sola: avisa y abre la página de descarga.
import { app, BrowserWindow, dialog, Notification, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { tr } from '@shared/i18n'

const RELEASES_URL = 'https://github.com/Yiku21/Ai-cowork/releases/latest'
/** Si la versión nueva se descarga antes de esto desde el arranque, se instala ya y la app se reabre. */
const INSTALL_NOW_MS = 5 * 60_000
const CHECK_EVERY_MS = 6 * 60 * 60_000

let initialized = false
let startedAt = 0
let macWarnedFor = ''

/** true si esta app es una versión de GitHub Releases, que se actualiza sola. */
export function isReleaseBuild(): boolean {
  return app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))
}

/** En Windows y en el AppImage de Linux se puede instalar sola; en el Mac no (sin firma de Apple). */
function canSelfInstall(): boolean {
  if (process.platform === 'win32') return true
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE)
  return false
}

function notify(body: string): void {
  try {
    if (Notification.isSupported()) new Notification({ title: 'kywai', body }).show()
  } catch {
    /* sin notificaciones no pasa nada */
  }
}

async function offerMacDownload(info: UpdateInfo): Promise<void> {
  if (macWarnedFor === info.version) return
  macWarnedFor = info.version
  const win = BrowserWindow.getAllWindows()[0]
  const opts = {
    type: 'info' as const,
    message: tr('Hay una versión nueva de kywai ({version}).', { version: info.version }),
    detail: tr('Descárgala y arrástrala a Aplicaciones para reemplazar esta. Tus proyectos y ajustes se conservan.'),
    buttons: [tr('Descargar'), tr('Más tarde')],
    defaultId: 0,
    cancelId: 1
  }
  const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  if (r.response === 0) void shell.openExternal(RELEASES_URL)
}

/** Busca la última versión ahora (también lo usa «Buscar actualizaciones»). */
export function checkReleaseNow(): void {
  if (!initialized) return
  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.error('[updater] No se pudo comprobar la actualización:', error)
  })
}

/** Iniciar después de app.whenReady(). */
export function initUpdater(): void {
  if (initialized || !isReleaseBuild()) return
  initialized = true
  startedAt = Date.now()
  autoUpdater.logger = console
  autoUpdater.autoDownload = canSelfInstall()
  autoUpdater.autoInstallOnAppQuit = canSelfInstall()

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.info('[updater] Actualización disponible:', info.version)
    if (canSelfInstall()) notify(tr('Descargando la versión {version}…', { version: info.version }))
    else if (process.platform === 'darwin') void offerMacDownload(info)
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.info('[updater] Actualización descargada:', info.version)
    if (Date.now() - startedAt < INSTALL_NOW_MS) {
      notify(tr('Instalando la versión {version}. kywai se reabre solo.', { version: info.version }))
      // Sin preguntas y reabriendo la app al terminar.
      setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500)
    } else {
      notify(tr('La versión {version} se instalará al cerrar kywai.', { version: info.version }))
    }
  })
  autoUpdater.on('error', (error: Error) => {
    console.error('[updater] Error de actualización:', error)
  })

  checkReleaseNow()
  setInterval(checkReleaseNow, CHECK_EVERY_MS).unref?.()
}
