// Modo cliente de AI Cowork: esta instalación no ejecuta agentes, se conecta con otro AI Cowork (el principal,
// por ejemplo un Mac mini encendido 24/7) y muestra su interfaz. Aquí, lo que no necesita Electron: la dirección
// del servidor y el archivo donde se recuerda a qué servidor está emparejado este equipo.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const DEFAULT_SERVER_PORT = 8787

export interface ServerAddress {
  /** `http://host:puerto`, sin ruta. */
  origin: string
  host: string
  /** Código de acceso que venía en el enlace (`?t=…`), si se pegó el enlace completo. */
  code?: string
}

/**
 * Acepta lo que la gente escribe: `100.101.1.2`, `mac-mini`, `mac-mini:8787`, `http://100.101.1.2:8787` o el
 * enlace de acceso entero (`http://…:8787/?t=código`). Sin puerto, el de AI Cowork (8787).
 */
export function parseServerAddress(input: string): ServerAddress | null {
  const text = input.trim()
  if (!text || /\s/.test(text)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null
  const port = url.port || (url.protocol === 'http:' ? String(DEFAULT_SERVER_PORT) : '')
  const host = url.hostname.includes(':') && !url.hostname.startsWith('[') ? `[${url.hostname}]` : url.hostname
  const code = url.searchParams.get('t')?.trim()
  return { origin: `${url.protocol}//${host}${port ? `:${port}` : ''}`, host, ...(code ? { code } : {}) }
}

export type AppMode = 'server' | 'client'

export interface ClientServer {
  origin: string
  /** Nombre del servidor (el del equipo), solo para mostrarlo. */
  name: string
  deviceId?: string
  /** Token del dispositivo: cifrado con el llavero del sistema si se pudo (`encrypted`), si no, en claro. */
  token: string
  encrypted: boolean
}

export interface ClientFile {
  mode: AppMode
  server?: ClientServer
}

export function readClientFile(file: string): ClientFile | null {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<ClientFile>
    if (data.mode !== 'server' && data.mode !== 'client') return null
    const s = data.server
    const server =
      s && typeof s.origin === 'string' && typeof s.token === 'string' && typeof s.name === 'string'
        ? { origin: s.origin, name: s.name, token: s.token, encrypted: s.encrypted === true, ...(typeof s.deviceId === 'string' ? { deviceId: s.deviceId } : {}) }
        : undefined
    return { mode: data.mode, ...(server ? { server } : {}) }
  } catch {
    return null
  }
}

export function writeClientFile(file: string, data: ClientFile): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, file)
}

/** Qué se le dice a quien intenta conectar según lo que respondió el servidor al emparejar. */
export function pairingProblem(status: number, code?: string): string {
  if (status === 401 || code === 'INVALID_PAIRING_CODE') return 'El código no es correcto. Genera uno nuevo en el servidor (⚙ → Acceso desde otros dispositivos).'
  if (status === 429) return 'Demasiados intentos con un código incorrecto. Espera un minuto.'
  if (status === 404 || status === 503) return 'El servidor no tiene activado el acceso desde otros dispositivos.'
  return `El servidor respondió con un error (${status}).`
}
