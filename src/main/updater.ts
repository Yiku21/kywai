// Actualizaciones de las versiones descargadas de GitHub Releases (las que compila .github/workflows/publicar-escritorio.yml).
// Solo esas traen app-update.yml; las compiladas en el propio equipo (instalar-mac.sh, instalar-linux.sh, npm run dist:*)
// no lo traen y se actualizan con «Buscar actualizaciones» desde su clon de git (selfUpdate.ts).
//
// Al abrirse, la app busca la última versión. En Windows y en el AppImage de Linux la descarga y, si llega en los
// primeros minutos, se reinicia ya con ella; si llega más tarde, se instala al cerrar. En el Mac pasa lo mismo, pero
// la descarga y el cambio de la .app los hace macUpdate.ts: la app no va firmada por Apple y electron-updater no sabe
// reemplazarla. Solo si la app del Mac está donde no se puede escribir (abierta desde el .dmg, por ejemplo) avisa y
// abre la página de descarga.
// También en modo cliente (un Linux o un Mac conectado a otro kywai): esa app es la de este equipo y se actualiza
// desde GitHub igual. Los clientes de Windows se actualizan desde su servidor (client.ts), no desde aquí.
import { app, BrowserWindow, dialog, Notification, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { tr } from '@shared/i18n'
import type { ReleaseUpdate } from '@shared/types'
import { downloadMacUpdate, macCanSelfInstall, swapMacApp } from './macUpdate'

const RELEASES_URL = 'https://github.com/Yiku21/kywai/releases/latest'
/** Si la versión nueva se descarga antes de esto desde el arranque, se instala ya y la app se reabre. */
const INSTALL_NOW_MS = 5 * 60_000
const CHECK_EVERY_MS = 6 * 60 * 60_000

let initialized = false
let startedAt = 0
let macWarnedFor = ''
/** Hay una versión nueva bajando (para no pedir otra descarga a la vez). */
let downloading = ''
/** Versión ya descargada y lista para instalar al cerrar. */
let downloadedVersion = ''
/** Se pidió instalar mientras bajaba: se instala en cuanto termine. */
let installWhenReady = false
const IS_MAC = process.platform === 'darwin'
/** Mac: la .app nueva ya descomprimida, lista para cambiarla por la instalada. */
let macNewApp = ''
/** Mac: ya se lanzó el cambio de la app (para no lanzarlo dos veces). */
let macSwapStarted = false


/** true si esta app es una versión de GitHub Releases, que se actualiza sola. */
export function isReleaseBuild(): boolean {
  return app.isPackaged && existsSync(join(process.resourcesPath, 'app-update.yml'))
}

/** En Windows, en el AppImage de Linux y en el Mac (si la app está en una carpeta donde se puede escribir) se instala sola. */
function canSelfInstall(): boolean {
  if (process.platform === 'win32') return true
  if (process.platform === 'linux') return Boolean(process.env.APPIMAGE)
  if (IS_MAC) return macCanSelfInstall()
  return false
}

/** Cierra kywai y lo reabre con la versión descargada. */
function installDownloaded(delay: number): void {
  if (IS_MAC) {
    if (macSwapStarted) return
    macSwapStarted = true
    setTimeout(() => {
      if (!swapMacApp(macNewApp, true)) macSwapStarted = false
    }, delay)
    return
  }
  setTimeout(() => autoUpdater.quitAndInstall(true, true), delay)
}

/** Mac: baja la versión nueva nosotros (electron-updater no puede) y avisa como si la hubiera bajado él. */
function downloadOnMac(info: UpdateInfo): void {
  downloadMacUpdate(info)
    .then((path) => {
      macNewApp = path
      onDownloaded(info)
    })
    .catch((error: unknown) => {
      console.error('[updater] No se pudo bajar la versión del Mac:', error)
      downloading = ''
      installWhenReady = false
    })
}

function onDownloaded(info: UpdateInfo): void {
  console.info('[updater] Actualización descargada:', info.version)
  downloading = ''
  downloadedVersion = info.version
  if (installWhenReady || Date.now() - startedAt < INSTALL_NOW_MS) {
    notify(tr('Instalando la versión {version}. kywai se reabre solo.', { version: info.version }))
    // Sin preguntas y reabriendo la app al terminar.
    installDownloaded(1500)
  } else {
    notify(tr('La versión {version} se instalará al cerrar kywai.', { version: info.version }))
  }
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

/** Busca la última versión ahora, sin esperar la respuesta (al abrir y cada pocas horas). */
export function checkReleaseNow(): void {
  if (!initialized || downloading) return
  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.error('[updater] No se pudo comprobar la actualización:', error)
  })
}

/**
 * Busca la última versión en GitHub y espera la respuesta, para decir de verdad si hay una nueva («Buscar
 * actualizaciones» y, en un cliente, «Actualizar este equipo…»). Si la hay y esta app se instala sola, la descarga.
 */
export async function checkRelease(): Promise<ReleaseUpdate> {
  const current = app.getVersion()
  const selfInstall = canSelfInstall()
  if (!initialized) return { state: 'error', current, selfInstall, message: tr('Esta versión no se actualiza desde GitHub.') }
  if (downloadedVersion) return { state: 'downloaded', current, latest: downloadedVersion, selfInstall }
  if (downloading) return { state: 'downloading', current, latest: downloading, selfInstall }
  try {
    const r = await autoUpdater.checkForUpdates()
    const latest = r?.updateInfo?.version
    if (!r?.isUpdateAvailable || !latest) return { state: 'current', current, latest: latest ?? current, selfInstall }
    if (downloadedVersion === latest) return { state: 'downloaded', current, latest, selfInstall }
    return { state: selfInstall ? 'downloading' : 'available', current, latest, selfInstall }
  } catch (error) {
    const text = (error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 200)
    return { state: 'error', current, selfInstall, message: tr('No se pudo consultar GitHub: {v1}', { v1: text }) }
  }
}

/**
 * Instala la versión nueva ya: si está descargada, cierra y reabre kywai con ella; si aún baja, lo hace al terminar.
 * Si esta app no puede cambiarse sola (un Mac con la app en el .dmg, por ejemplo), abre la página de descarga. Devuelve un mensaje si no hay nada que instalar.
 */
export async function installRelease(): Promise<string> {
  if (!initialized) return tr('Esta versión no se actualiza desde GitHub.')
  if (!canSelfInstall()) {
    void shell.openExternal(RELEASES_URL)
    return ''
  }
  if (downloadedVersion) {
    installDownloaded(300)
    return ''
  }
  const r = downloading ? null : await checkRelease()
  if (r && r.state === 'current') return tr('Ya tienes la última versión')
  if (r && r.state === 'error') return r.message ?? tr('No se pudo consultar GitHub')
  if (downloadedVersion) {
    installDownloaded(300)
    return ''
  }
  installWhenReady = true
  notify(tr('Descargando la versión {version}: kywai se reabre solo al terminar.', { version: downloading || r?.latest || '' }))
  return ''
}

/** Iniciar después de app.whenReady(). En un cliente de Windows no hace nada (se actualiza desde su servidor). */
export function initUpdater(opts: { client?: boolean } = {}): void {
  if (initialized || !isReleaseBuild()) return
  if (opts.client && process.platform === 'win32') return
  initialized = true
  startedAt = Date.now()
  autoUpdater.logger = console
  // En el Mac la descarga y la instalación las hace macUpdate.ts, no electron-updater.
  autoUpdater.autoDownload = canSelfInstall() && !IS_MAC
  autoUpdater.autoInstallOnAppQuit = canSelfInstall() && !IS_MAC

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.info('[updater] Actualización disponible:', info.version)
    if (!canSelfInstall()) {
      if (IS_MAC) void offerMacDownload(info)
      return
    }
    if (downloadedVersion === info.version || downloading === info.version) return
    downloading = info.version
    notify(tr('Descargando la versión {version}…', { version: info.version }))
    if (IS_MAC) downloadOnMac(info)
  })
  autoUpdater.on('update-downloaded', onDownloaded)
  // Mac: si la nueva quedó descargada y no se instaló aún, se cambia al cerrar kywai (sin reabrirla).
  if (IS_MAC) {
    app.on('will-quit', () => {
      if (macNewApp && !macSwapStarted) {
        macSwapStarted = true
        swapMacApp(macNewApp, false)
      }
    })
  }
  autoUpdater.on('error', (error: Error) => {
    console.error('[updater] Error de actualización:', error)
    downloading = ''
    installWhenReady = false
  })

  checkReleaseNow()
  setInterval(checkReleaseNow, CHECK_EVERY_MS).unref?.()
}
