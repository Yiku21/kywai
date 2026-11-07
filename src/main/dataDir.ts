import { app } from 'electron'
import { basename, dirname, join } from 'node:path'

// La app se llamaba «AI Cowork» y ahora se llama kywai (productName). Electron pone la carpeta de datos con el
// nombre de la app, así que sin esto las instalaciones que ya hay empezarían de cero. La carpeta se queda con el
// nombre antiguo: %APPDATA%\AI Cowork, ~/Library/Application Support/AI Cowork y ~/.config/AI Cowork.
// Este módulo se importa el primero en index.ts, antes de que nada lea app.getPath('userData').
export const DATA_FOLDER_NAME = 'AI Cowork'

/** Nombre del ejecutable de Windows antes de llamarse kywai.exe. */
export const OLD_WINDOWS_EXE = 'AI Cowork.exe'

app.setPath('userData', join(app.getPath('appData'), DATA_FOLDER_NAME))

/**
 * Windows: «Abrir kywai al iniciar sesión» guardaba la ruta de `AI Cowork.exe`, que la actualización borra. Si esa
 * entrada estaba activa, la apunta a kywai.exe (la actualización instala en la misma carpeta). Sin efecto en el
 * resto de sistemas, sin la entrada antigua o si el exe ya se llama igual.
 */
export function migrateWindowsLoginItem(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return
  if (basename(process.execPath).toLowerCase() === OLD_WINDOWS_EXE.toLowerCase()) return
  const oldExe = join(dirname(process.execPath), OLD_WINDOWS_EXE)
  try {
    if (!app.getLoginItemSettings({ path: oldExe }).openAtLogin) return
    app.setLoginItemSettings({ openAtLogin: false, path: oldExe })
    app.setLoginItemSettings({ openAtLogin: true })
  } catch (e) {
    console.warn('[cowork] no se pudo pasar «Abrir al iniciar sesión» a kywai.exe', e)
  }
}
