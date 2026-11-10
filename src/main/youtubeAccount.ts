// Tu cuenta de YouTube en la música de kywai (app de escritorio y cliente). Se inicia sesión en una ventana de Google
// de verdad, en la misma sesión del navegador de kywai, y el reproductor oficial de YouTube (que ya no usa
// youtube-nocookie) la reconoce: con YouTube Premium suena sin anuncios. kywai nunca ve la contraseña ni guarda nada
// aparte: son las cookies de Google en esta app, que «Cerrar sesión» borra.
import { BrowserWindow, session } from 'electron'

const SIGN_IN_URL =
  'https://accounts.google.com/ServiceLogin?service=youtube&continue=' + encodeURIComponent('https://www.youtube.com/signin?action_handle_signin=true&next=%2F')
const ACCOUNT_DOMAINS = /(^|\.)(youtube\.com|youtube-nocookie\.com|google(\.com)?(\.[a-z]{2,3})?)$/i

/** Google no deja iniciar sesión en ventanas que dicen ser Electron: se presenta como el Chrome en que se basa. */
function chromeAgent(): string {
  return session.defaultSession.getUserAgent().replace(/\s?(Electron|kywai|ai-cowork|AI Cowork)\/\S+/gi, '')
}

/** Hay una sesión de YouTube abierta en esta app. */
export async function youtubeSignedIn(): Promise<boolean> {
  const cookies = await session.defaultSession.cookies.get({ domain: 'youtube.com' })
  return cookies.some((c) => c.name === 'LOGIN_INFO' || c.name === 'SAPISID' || c.name === '__Secure-3PSID')
}

let open: Promise<boolean> | null = null

/** Abre la ventana de inicio de sesión de Google y espera a que vuelva a YouTube con la sesión iniciada (o se cierre). */
export function youtubeSignIn(parent?: BrowserWindow | null): Promise<boolean> {
  if (open) return open
  open = new Promise<boolean>((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      parent: parent ?? undefined,
      modal: false,
      autoHideMenuBar: true,
      title: 'YouTube',
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
    })
    win.webContents.setUserAgent(chromeAgent())
    // Nada de ventanas nuevas desde Google (ayuda, condiciones…): se quedan fuera.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    let done = false
    const finish = async (): Promise<void> => {
      if (done) return
      done = true
      const ok = await youtubeSignedIn().catch(() => false)
      if (!win.isDestroyed()) win.close()
      open = null
      resolve(ok)
    }
    win.webContents.on('did-navigate', (_e, url) => {
      // De vuelta en YouTube y con la sesión puesta: listo.
      if (/^https:\/\/(www|m)\.youtube\.com\//i.test(url)) {
        void youtubeSignedIn().then((ok) => {
          if (ok) void finish()
        })
      }
    })
    win.on('closed', () => void finish())
    void win.loadURL(SIGN_IN_URL).catch(() => undefined)
  })
  return open
}

/** Cierra la sesión de YouTube (y de Google) en esta app: borra sus cookies. */
export async function youtubeSignOut(): Promise<void> {
  const ses = session.defaultSession
  const cookies = await ses.cookies.get({})
  await Promise.all(
    cookies
      .filter((c) => c.domain && ACCOUNT_DOMAINS.test(c.domain.replace(/^\./, '')))
      .map((c) => ses.cookies.remove(`https://${c.domain!.replace(/^\./, '')}${c.path ?? '/'}`, c.name).catch(() => undefined))
  )
}
