// Actualizar en el Mac la versión descargada de GitHub Releases. No va firmada por Apple y el actualizador de
// electron-updater (Squirrel.Mac) se niega a reemplazarla, así que lo hacemos nosotros: se baja el .zip de la Release
// para la arquitectura de este Mac, se comprueba su huella sha512 (la de latest-mac.yml), se descomprime junto a la
// app instalada y, al cerrar kywai, un script aparte cambia la .app vieja por la nueva y la vuelve a abrir.
// Lo que bajamos nosotros no lleva la marca de cuarentena (y el script la quita por si acaso), así que el Mac no
// vuelve a preguntar «¿Seguro que quieres abrirla?». Si está el firmador de este Mac (firmar-mac.sh, va dentro de la
// app), la nueva se firma con un certificado propio y fijo: así macOS no olvida los permisos (micrófono, carpetas…)
// en cada versión.
// Si la app no está en un sitio donde se pueda escribir (abierta desde el .dmg, «translocada» por macOS o en una
// carpeta de otro usuario), no se toca nada y se sigue abriendo la página de descarga como antes.
import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { UpdateInfo } from 'electron-updater'

const DOWNLOAD_BASE = 'https://github.com/Yiku21/kywai/releases/download'
/** Carpeta (oculta) junto a la app instalada donde se deja la versión nueva. Al lado, para que el cambio sea un mv. */
const WORK_DIR = '.kywai-actualizacion'

/** Carpeta .app que se está ejecutando (null si no es una app empaquetada de macOS). */
export function macBundle(): string | null {
  const m = process.execPath.match(/^(.*?\.app)\//)
  return m ? m[1] : null
}

/** true si esta app del Mac puede cambiarse sola por la versión nueva. */
export function macCanSelfInstall(): boolean {
  if (process.platform !== 'darwin' || !app.isPackaged) return false
  const bundle = macBundle()
  // Abierta desde el .dmg o «translocada» (macOS la ejecuta desde una copia de solo lectura): no se puede cambiar.
  if (!bundle || bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return false
  try {
    accessSync(dirname(bundle), constants.W_OK)
    accessSync(join(bundle, 'Contents'), constants.W_OK)
    return true
  } catch {
    return false
  }
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (d: Buffer) => (err += d.toString()))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd}: ${err.trim().split('\n')[0] || `código ${code}`}`))))
  })
}

/** Dirección de descarga de un archivo de la Release (en latest-mac.yml viene solo el nombre). */
export function macDownloadUrl(version: string, file: string): string {
  return /^https?:\/\//.test(file) ? file : `${DOWNLOAD_BASE}/v${version}/${encodeURIComponent(file)}`
}

/** El .zip de esta arquitectura (arm64 o x64) entre los archivos de la Release. */
export function pickMacZip(info: Pick<UpdateInfo, 'files'>, arch: string = process.arch): { url: string; sha512: string } | null {
  const file = info.files.find((f) => f.url.endsWith(`-${arch}.zip`))
  return file ? { url: file.url, sha512: file.sha512 } : null
}

/**
 * Baja y prepara la versión nueva. Devuelve la ruta de la .app nueva, lista para cambiarla por la instalada.
 * Lanza un error si algo falla (descarga, huella o descompresión) y no deja restos.
 */
export async function downloadMacUpdate(info: UpdateInfo): Promise<string> {
  const bundle = macBundle()
  if (!bundle) throw new Error('No es una app de macOS')
  const file = pickMacZip(info)
  if (!file) throw new Error(`La Release ${info.version} no trae el .zip para ${process.arch}`)
  const work = join(dirname(bundle), WORK_DIR)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  try {
    const zip = join(work, 'kywai.zip')
    const res = await net.fetch(macDownloadUrl(info.version, file.url))
    if (!res.ok || !res.body) throw new Error(`GitHub respondió ${res.status}`)
    const hash = createHash('sha512')
    const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
    body.on('data', (chunk: Buffer) => hash.update(chunk))
    await pipeline(body, createWriteStream(zip))
    if (hash.digest('base64') !== file.sha512) throw new Error('La descarga no coincide con la huella de la Release')
    // ditto respeta los enlaces y permisos de dentro de la .app (unzip no siempre).
    await run('/usr/bin/ditto', ['-x', '-k', zip, work])
    rmSync(zip, { force: true })
    const name = readdirSync(work).find((n) => n.endsWith('.app'))
    if (!name) throw new Error('El .zip no trae la app')
    return join(work, name)
  } catch (error) {
    rmSync(work, { recursive: true, force: true })
    throw error
  }
}

/** Script que espera a que kywai se cierre, cambia la .app y (si se pide) la vuelve a abrir. */
export const MAC_SWAP_SCRIPT = `#!/bin/bash
# Uso: <pid de kywai> <app instalada> <app nueva> <1 para reabrir> [firmador]
set -uo pipefail
PID="$1"; CURRENT="$2"; NEW="$3"; RELAUNCH="$4"; SIGN="\${5:-}"
closed=0
for _ in $(seq 1 240); do
  if ! kill -0 "$PID" 2>/dev/null; then closed=1; break; fi
  sleep 0.5
done
# Si kywai no llega a cerrarse, no se toca nada (la nueva se queda preparada para la próxima vez).
[ "$closed" = 1 ] || exit 0
[ -d "$NEW" ] || exit 0
xattr -cr "$NEW" 2>/dev/null || true
if [ -n "$SIGN" ] && [ -f "$SIGN" ]; then bash "$SIGN" "$NEW" >/dev/null 2>&1 || true; fi
OLD="$CURRENT.anterior"
rm -rf "$OLD"
if mv "$CURRENT" "$OLD"; then
  if mv "$NEW" "$CURRENT"; then
    rm -rf "$OLD"
  else
    mv "$OLD" "$CURRENT"
  fi
fi
rm -rf "$(dirname "$NEW")"
if [ "$RELAUNCH" = 1 ]; then open "$CURRENT"; fi
`

/**
 * Deja lanzado el script que cambia la app en cuanto kywai se cierre. Con relaunch, además cierra kywai ya y la
 * vuelve a abrir con la versión nueva. Devuelve false si no hay nada preparado.
 */
export function swapMacApp(newApp: string, relaunch: boolean): boolean {
  const bundle = macBundle()
  if (!bundle || !existsSync(newApp)) return false
  const script = join(app.getPath('temp'), 'kywai-actualizar-mac.sh')
  writeFileSync(script, MAC_SWAP_SCRIPT, { mode: 0o755 })
  const signer = join(process.resourcesPath, 'firmar-mac.sh')
  const args = [script, String(process.pid), bundle, newApp, relaunch ? '1' : '0', ...(existsSync(signer) ? [signer] : [])]
  const child = spawn('/bin/bash', args, { detached: true, stdio: 'ignore', cwd: dirname(bundle) })
  child.unref()
  if (relaunch) setTimeout(() => app.quit(), 300)
  return true
}
