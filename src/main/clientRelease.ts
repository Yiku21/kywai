// Canal de actualización del cliente de escritorio: el servidor guarda el instalador más reciente y lo sirve a los
// clientes emparejados (como hace con la APK de Órbita). Aquí, lo que no depende de Electron: qué archivos valen,
// cómo se leen y cómo se limpian los viejos.
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPublicKey, verify } from 'node:crypto'

/** Solo estos archivos: el descriptor y el instalador de Windows (nada con rutas ni extensiones raras). */
const FEED_FILE = /^(latest\.yml|AI-Cowork-Setup-[0-9][0-9A-Za-z.+-]{0,40}\.exe)$/
const INSTALLER = /^AI-Cowork-Setup-[0-9][0-9A-Za-z.+-]{0,40}\.exe$/

export const MAX_INSTALLER_BYTES = 400 * 1024 * 1024

export function isFeedFile(name: string): boolean {
  return FEED_FILE.test(name)
}

export interface ClientRelease {
  version: string
  file: string
  size: number
}

/** La versión publicada (la que dice latest.yml, con su instalador presente), o null si no hay ninguna. */
export function currentRelease(dir: string): ClientRelease | null {
  try {
    const yml = readFileSync(join(dir, 'latest.yml'), 'utf8')
    const version = /^version:\s*['"]?([^\s'"]+)['"]?\s*$/m.exec(yml)?.[1]
    const file = /^path:\s*['"]?([^\s'"]+)['"]?\s*$/m.exec(yml)?.[1]
    if (!version || !file || !INSTALLER.test(file)) return null
    const st = statSync(join(dir, file))
    return st.isFile() ? { version, file, size: st.size } : null
  } catch {
    return null
  }
}

/** Un latest.yml se acepta solo si apunta a un instalador que ya está subido. */
export function validDescriptor(dir: string, yml: string): string | null {
  const version = /^version:\s*['"]?([^\s'"]+)['"]?\s*$/m.exec(yml)?.[1]
  const file = /^path:\s*['"]?([^\s'"]+)['"]?\s*$/m.exec(yml)?.[1]
  const sha = /^sha512:\s*\S+/m.test(yml)
  if (!version || !file || !sha) return 'latest.yml no es válido (faltan version, path o sha512)'
  if (!INSTALLER.test(file) || !existsSync(join(dir, file))) return `El instalador ${file ?? ''} no está subido todavía: sube primero el .exe`
  return null
}

/**
 * Lo que firma quien publica (scripts/publicar-cliente.mjs escribe lo mismo): la versión, el instalador y su huella.
 * Así, quien tenga el código del servidor puede subir archivos, pero no un instalador que los clientes acepten.
 */
export function releaseMessage(version: string, file: string, sha512: string): string {
  return `kywai cliente\n${version}\n${file}\n${sha512}`
}

export interface SignedRelease {
  version?: unknown
  path?: unknown
  sha512?: unknown
  firma?: unknown
}

/** null si el instalador descargado es el que firmó el dueño; si no, el motivo para no instalarlo. */
export function verifyRelease(info: SignedRelease, fileSha512: string, publicKeyPem: string): string | null {
  if (!publicKeyPem.trim()) return 'Este cliente no trae la clave de firma de las actualizaciones: instálalo de nuevo con un instalador publicado con npm run publicar-cliente.'
  const { version, path, sha512, firma } = info
  if (typeof version !== 'string' || typeof path !== 'string' || typeof sha512 !== 'string') return 'La versión publicada no es válida.'
  if (typeof firma !== 'string' || !firma) return 'La versión publicada no está firmada: vuelve a publicarla con npm run publicar-cliente.'
  if (fileSha512 !== sha512) return 'El instalador descargado no es el publicado.'
  try {
    const ok = verify(null, Buffer.from(releaseMessage(version, path, sha512)), createPublicKey(publicKeyPem), Buffer.from(firma, 'base64'))
    return ok ? null : 'La firma de la versión publicada no es la tuya: no se instala.'
  } catch {
    return 'La firma de la versión publicada no es válida: no se instala.'
  }
}

/** Deja los instaladores de las dos últimas versiones publicadas y borra el resto. */
export function pruneInstallers(dir: string, keep: string[]): void {
  try {
    for (const name of readdirSync(dir)) {
      if (INSTALLER.test(name) && !keep.includes(name)) rmSync(join(dir, name), { force: true })
    }
  } catch {
    /* sin carpeta: nada que limpiar */
  }
}

/** Escribe un archivo del canal sin que nadie lo vea a medias. */
export function writeFeedFile(dir: string, name: string, data: Buffer): void {
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `${name}.${process.pid}.part`)
  writeFileSync(tmp, data)
  renameSync(tmp, join(dir, name))
}

export { createReadStream }
