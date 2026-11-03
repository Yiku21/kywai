// La última versión de Órbita (la app de Android) para que el móvil se actualice desde Ajustes sin pasar la APK a
// mano. La APK firmada se publica en el repositorio (android/release/, con ./gradlew :app:publishOrbita) y llega a
// este equipo con «Buscar actualizaciones»; la API móvil la sirve solo a los móviles emparejados.
import { createHash } from 'node:crypto'
import { createReadStream, promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { sourceDir } from './selfUpdate'

export const ORBITA_APK = 'orbita.apk'
export const ORBITA_INFO = 'orbita.json'

export interface OrbitaRelease {
  /** Órbita solo la ofrece si es mayor que la instalada (Android no instala encima una más antigua). */
  versionCode: number
  versionName: string
  size: number
  sha256: string
  builtAt: string | null
}

let dirOverride: string | null | undefined
/** Pruebas y servidor de desarrollo: otra carpeta (null = ninguna; undefined = la del código). */
export function __setOrbitaReleaseDirForChecks(dir: string | null | undefined): void {
  dirOverride = dir
  hashCache = null
}

function releaseDir(): string | null {
  if (dirOverride !== undefined) return dirOverride
  const dir = sourceDir()
  return dir ? join(dir, 'android', 'release') : null
}

let hashCache: { path: string; size: number; mtimeMs: number; sha256: string } | null = null

async function sha256(path: string, size: number, mtimeMs: number): Promise<string> {
  if (hashCache && hashCache.path === path && hashCache.size === size && hashCache.mtimeMs === mtimeMs) return hashCache.sha256
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  const sha = hash.digest('hex')
  hashCache = { path, size, mtimeMs, sha256: sha }
  return sha
}

/**
 * La versión publicada, o null si no hay o está incompleta: sin APK, con datos que no cuadran o con una APK que no
 * es la anotada (así el móvil nunca descarga algo distinto de lo que se le anuncia).
 */
export async function orbitaRelease(): Promise<{ info: OrbitaRelease; apk: string } | null> {
  const dir = releaseDir()
  if (!dir) return null
  try {
    const raw = JSON.parse(await fsp.readFile(join(dir, ORBITA_INFO), 'utf8')) as Record<string, unknown>
    const apk = join(dir, ORBITA_APK)
    const st = await fsp.stat(apk)
    const { versionCode, versionName, sha256: declared, builtAt } = raw
    if (!st.isFile() || st.size === 0) return null
    if (typeof versionCode !== 'number' || !Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) return null
    if (typeof versionName !== 'string' || !/^[\w.+-]{1,40}$/.test(versionName)) return null
    const actual = await sha256(apk, st.size, st.mtimeMs)
    if (typeof declared !== 'string' || declared.toLowerCase() !== actual) return null
    return {
      info: { versionCode, versionName, size: st.size, sha256: actual, builtAt: typeof builtAt === 'string' && builtAt.length <= 40 ? builtAt : null },
      apk
    }
  } catch {
    return null
  }
}
