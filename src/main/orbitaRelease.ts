// La última versión de Órbita (la app de Android) para que el móvil se actualice desde Ajustes sin pasar la APK a
// mano. La APK firmada se publica en el repositorio (android/release/, la sube «Publicar Órbita» en GitHub Actions).
// Un equipo con el código (git) la recibe con «Buscar actualizaciones»; uno con kywai descargado de Releases no
// tiene esa carpeta y la baja del repositorio público (y comprueba su huella) cuando el móvil pregunta. La API móvil
// la sirve solo a los móviles emparejados.
import { app, net } from 'electron'
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

/** De donde la bajan los equipos sin código: master del repositorio público (lo mismo que lleva la última Release). */
export const ORBITA_REMOTE_BASE = 'https://raw.githubusercontent.com/Yiku21/kywai/master/android/release/'
/** Como mucho una consulta cada tanto: el móvil pregunta al abrir Ajustes y otra vez justo antes de descargar. */
const REMOTE_CHECK_MS = 15 * 60_000
const REMOTE_TIMEOUT_MS = 120_000
const MAX_APK_BYTES = 200 * 1024 * 1024

type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<Response>

let dirOverride: string | null | undefined
/** Pruebas y servidor de desarrollo: otra carpeta (null = ninguna; undefined = la del código). */
export function __setOrbitaReleaseDirForChecks(dir: string | null | undefined): void {
  dirOverride = dir
  hashCache = null
}

let remoteOverride: { dir: string; fetch: Fetcher; base?: string } | null | undefined
/** Pruebas: la descarga del repositorio público con otra carpeta y otro fetch (null = nunca; undefined = la real). */
export function __setOrbitaRemoteForChecks(remote: { dir: string; fetch: Fetcher; base?: string } | null | undefined): void {
  remoteOverride = remote
  lastRemoteCheck = 0
  remoteInFlight = null
  hashCache = null
}

/** Solo las apps empaquetadas sin código (las de Releases) la bajan; en desarrollo siempre hay código. */
function remote(): { dir: string; fetch: Fetcher; base: string } | null {
  if (remoteOverride !== undefined) return remoteOverride && { base: ORBITA_REMOTE_BASE, ...remoteOverride }
  if (!app.isPackaged) return null
  return { dir: join(app.getPath('userData'), 'orbita-release'), fetch: (url, init) => net.fetch(url, init), base: ORBITA_REMOTE_BASE }
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
  if (dir) return readRelease(dir)
  const r = remote()
  if (!r) return null
  await refreshRemote(r)
  return readRelease(r.dir)
}

async function readRelease(dir: string): Promise<{ info: OrbitaRelease; apk: string } | null> {
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

let lastRemoteCheck = 0
let remoteInFlight: Promise<void> | null = null

/** Baja la última Órbita publicada si es otra que la guardada. Si falla (sin internet…) se queda la que hubiera. */
function refreshRemote(r: { dir: string; fetch: Fetcher; base: string }): Promise<void> {
  if (remoteInFlight) return remoteInFlight
  if (Date.now() - lastRemoteCheck < REMOTE_CHECK_MS) return Promise.resolve()
  remoteInFlight = (async () => {
    const signal = AbortSignal.timeout(REMOTE_TIMEOUT_MS)
    try {
      const res = await r.fetch(r.base + ORBITA_INFO, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (text.length > 4096) throw new Error('orbita.json demasiado grande')
      const info = JSON.parse(text) as Record<string, unknown>
      const declared = typeof info.sha256 === 'string' ? info.sha256.toLowerCase() : ''
      if (!/^[0-9a-f]{64}$/.test(declared)) throw new Error('orbita.json sin huella')
      const current = await readRelease(r.dir)
      if (current?.info.sha256 === declared) {
        lastRemoteCheck = Date.now()
        return
      }
      const apkRes = await r.fetch(r.base + ORBITA_APK, { signal })
      if (!apkRes.ok) throw new Error(`HTTP ${apkRes.status}`)
      const apk = Buffer.from(await apkRes.arrayBuffer())
      if (apk.length === 0 || apk.length > MAX_APK_BYTES) throw new Error('APK de tamaño imposible')
      // Si la APK no es la anotada (p. ej. se publicó otra entre las dos descargas) no se guarda nada.
      if (createHash('sha256').update(apk).digest('hex') !== declared) throw new Error('la APK no es la anotada')
      await fsp.mkdir(r.dir, { recursive: true })
      await fsp.writeFile(join(r.dir, ORBITA_APK + '.part'), apk)
      await fsp.writeFile(join(r.dir, ORBITA_INFO + '.part'), text)
      await fsp.rename(join(r.dir, ORBITA_APK + '.part'), join(r.dir, ORBITA_APK))
      await fsp.rename(join(r.dir, ORBITA_INFO + '.part'), join(r.dir, ORBITA_INFO))
      hashCache = null
      lastRemoteCheck = Date.now()
    } catch (e) {
      // Se vuelve a intentar al cabo de un minuto, no en cada pregunta del móvil.
      lastRemoteCheck = Date.now() - REMOTE_CHECK_MS + 60_000
      console.warn('[orbita] no se pudo bajar la última Órbita:', e instanceof Error ? e.message : e)
    } finally {
      remoteInFlight = null
    }
  })()
  return remoteInFlight
}
