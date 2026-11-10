/**
 * Tu cuenta de YouTube en la música. Con ella el reproductor oficial carga desde www.youtube.com (en vez de
 * youtube-nocookie, que no usa la sesión) y YouTube la reconoce: con YouTube Premium no hay anuncios.
 * - App de escritorio y cliente: se inicia sesión en una ventana de Google dentro de kywai (ver main/youtubeAccount).
 * - Navegador: se usa la sesión de YouTube que ya tengas en ese navegador; aquí solo se elige usarla.
 * Se recuerda en cada dispositivo.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'kywai.youtube.cuenta.v1'
const NOCOOKIE = 'https://www.youtube-nocookie.com'
const WITH_ACCOUNT = 'https://www.youtube.com'

interface Bridge {
  youtubeAccount?: () => Promise<boolean>
  youtubeSignIn?: () => Promise<boolean>
  youtubeSignOut?: () => Promise<void>
}

const listeners = new Set<() => void>()

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

let on = read()

function set(next: boolean): void {
  if (next === on) return
  on = next
  try {
    if (next) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* almacenamiento no disponible */
  }
  for (const l of listeners) l()
}

/** El puente que abre la ventana de Google: la app de escritorio o el cliente (null en un navegador normal). */
export function accountBridge(): Bridge | null {
  const w = window as unknown as { cowork?: Bridge; coworkClient?: Bridge }
  if (w.cowork?.youtubeSignIn) return w.cowork
  if (w.coworkClient?.youtubeSignIn) return w.coworkClient
  return null
}

/** De dónde carga el reproductor de YouTube ahora. */
export const youtubeHost = (): string => (on ? WITH_ACCOUNT : NOCOOKIE)

/** Se usa tu cuenta de YouTube (en este dispositivo). */
export function useYoutubeAccount(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => on
  )
}

/** Escritorio: mira si la sesión sigue abierta (se pudo cerrar desde Google). */
export async function refreshYoutubeAccount(): Promise<void> {
  const bridge = accountBridge()
  if (!bridge?.youtubeAccount) return
  set(await bridge.youtubeAccount().catch(() => on))
}

/** Escritorio: abre la ventana de Google. Navegador: solo empieza a usar la sesión de ese navegador. */
export async function signInYoutube(): Promise<boolean> {
  const bridge = accountBridge()
  const ok = bridge?.youtubeSignIn ? await bridge.youtubeSignIn() : true
  set(ok)
  return ok
}

/** Deja de usar la cuenta (en el escritorio, además cierra la sesión de Google en kywai). */
export async function signOutYoutube(): Promise<void> {
  const bridge = accountBridge()
  if (bridge?.youtubeSignOut) await bridge.youtubeSignOut()
  set(false)
}
