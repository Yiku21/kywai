// Actualizaciones de las versiones descargadas de GitHub Releases (las que compila .github/workflows/publicar-escritorio.yml).
// Solo esas traen app-update.yml; las compiladas en el propio equipo (instalar-mac.sh, instalar-linux.sh, npm run dist:*)
// no lo traen y se actualizan con «Buscar actualizaciones» desde su clon de git (selfUpdate.ts).
//
// Al abrirse, la app busca la última versión. En Windows y en el AppImage de Linux la descarga y, si llega en los
// primeros minutos, se reinicia ya con ella; si llega más tarde, se instala al cerrar. En el Mac la versión
// descargada no va firmada por Apple y no se puede reemplazar sola: avisa y abre la página de descarga.
// También en modo cliente (un Linux o un Mac conectado a otro kywai): esa app es la de este equipo y se actualiza
// desde GitHub igual. Los clientes de Windows se actualizan desde su servidor (client.ts), no desde aquí.
import { app, BrowserWindow, dialog, Notification, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { tr } from '@shared/i18n'
import type { ReleaseUpdate } from '@shared/types'

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
 * En el Mac abre la página de descarga. Devuelve un mensaje si no hay nada que instalar.
 */
export async function installRelease(): Promise<string> {
  if (!initialized) return tr('Esta versión no se actualiza desde GitHub.')
  if (!canSelfInstall()) {
    void shell.openExternal(RELEASES_URL)
    return ''
  }
  if (downloadedVersion) {
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 300)
    return ''
  }
  const r = downloading ? null : await checkRelease()
  if (r && r.state === 'current') return tr('Ya tienes la última versión')
  if (r && r.state === 'error') return r.message ?? tr('No se pudo consultar GitHub')
  if (downloadedVersion) {
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 300)
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
  autoUpdater.autoDownload = canSelfInstall()
  autoUpdater.autoInstallOnAppQuit = canSelfInstall()

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.info('[updater] Actualización disponible:', info.version)
    if (canSelfInstall() && downloadedVersion !== info.version) downloading = info.version
    if (canSelfInstall()) notify(tr('Descargando la versión {version}…', { version: info.version }))
    else if (process.platform === 'darwin') void offerMacDownload(info)
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.info('[updater] Actualización descargada:', info.version)
    downloading = ''
    downloadedVersion = info.version
    if (installWhenReady || Date.now() - startedAt < INSTALL_NOW_MS) {
      notify(tr('Instalando la versión {version}. kywai se reabre solo.', { version: info.version }))
      // Sin preguntas y reabriendo la app al terminar.
      setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500)
    } else {
      notify(tr('La versión {version} se instalará al cerrar kywai.', { version: info.version }))
    }
  })
  autoUpdater.on('error', (error: Error) => {
    console.error('[updater] Error de actualización:', error)
    downloading = ''
    installWhenReady = false
  })

  checkReleaseNow()
  setInterval(checkReleaseNow, CHECK_EVERY_MS).unref?.()
}
