// Vista previa de los documentos que kywai no sabe pintar por sí mismo (Word y PowerPoint antiguos .doc y .ppt,
// Publisher, Visio, WordPerfect, dibujos .emf/.wmf…): si el equipo tiene LibreOffice, se convierte el archivo a PDF en
// el propio equipo (sin nube) y el panel enseña ese PDF. Se guarda en caché por archivo y fecha, así la segunda vez es
// al momento. Sin Electron, para poder probarlo.
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, promises as fsp, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { which } from './linuxDesktop'

/** Carpeta de la caché de PDF, dentro de la carpeta de datos de la app. */
export function previewCacheDir(userData: string): string {
  return join(userData, 'vista-previa')
}

/** Dónde suele estar LibreOffice en cada sistema (además del PATH). */
export function sofficeCandidates(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  if (platform === 'darwin') {
    return ['/Applications/LibreOffice.app/Contents/MacOS/soffice', join(homedir(), 'Applications/LibreOffice.app/Contents/MacOS/soffice')]
  }
  if (platform === 'win32') {
    const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs')].filter((r): r is string => !!r)
    return roots.map((r) => join(r, 'LibreOffice', 'program', 'soffice.exe'))
  }
  return ['/usr/bin/soffice', '/usr/bin/libreoffice', '/usr/local/bin/soffice', '/snap/bin/libreoffice', '/opt/libreoffice/program/soffice']
}

let found: string | null | undefined

/** La ruta de LibreOffice, o null si no está instalado. Se vuelve a mirar cada vez que no está (puede instalarse luego). */
export function findSoffice(): string | null {
  if (found) return found
  const hit = sofficeCandidates().find((p) => existsSync(p)) ?? which(process.platform === 'win32' ? 'soffice.exe' : 'soffice') ?? which('libreoffice')
  found = hit ?? null
  return found
}

/** Nombre del PDF en caché: cambia si cambia el archivo (ruta, tamaño o fecha). */
export function previewKey(abs: string, size: number, mtimeMs: number): string {
  return createHash('sha1').update(`${abs}\0${size}\0${Math.floor(mtimeMs)}`).digest('hex')
}

/** Un PDF de la caché (nombre seguro: 40 cifras hexadecimales). */
export function cachedPdf(cacheDir: string, name: string): string | null {
  if (!/^[0-9a-f]{40}\.pdf$/.test(name)) return null
  const file = join(cacheDir, name)
  return existsSync(file) ? file : null
}

/** Cuántos PDF se guardan (los más viejos se borran). */
const KEEP = 60
/** Lo que puede tardar LibreOffice en convertir un archivo (uno grande, la primera vez, tarda más). */
const TIMEOUT_MS = 120_000

// LibreOffice no puede convertir dos archivos a la vez con el mismo perfil: van en fila.
let queue: Promise<unknown> = Promise.resolve()

export class NoLibreOfficeError extends Error {
  constructor() {
    super('NO_LIBREOFFICE')
  }
}

/**
 * Convierte `abs` a PDF con LibreOffice (o devuelve el que ya estaba en la caché) y da el nombre del PDF dentro de
 * `cacheDir`. Lanza NoLibreOfficeError si no está instalado.
 */
export async function officeToPdf(abs: string, cacheDir: string, soffice: string | null = findSoffice()): Promise<string> {
  if (!soffice) throw new NoLibreOfficeError()
  const st = statSync(abs)
  const key = previewKey(abs, st.size, st.mtimeMs)
  const name = `${key}.pdf`
  if (cachedPdf(cacheDir, name)) return name
  const job = queue.then(() => convert(soffice, abs, cacheDir, name))
  queue = job.catch(() => undefined)
  return job
}

async function convert(soffice: string, abs: string, cacheDir: string, name: string): Promise<string> {
  if (cachedPdf(cacheDir, name)) return name
  const work = join(cacheDir, `tmp-${name.slice(0, 12)}`)
  await fsp.mkdir(work, { recursive: true })
  try {
    // Copia con un nombre sencillo: LibreOffice se lía con algunas rutas (espacios raros, comillas, unidades de red).
    const ext = extname(abs).toLowerCase()
    const input = join(work, `documento${ext}`)
    await fsp.copyFile(abs, input)
    // Perfil propio: así funciona aunque el usuario tenga LibreOffice abierto.
    const profile = pathToFileURL(join(cacheDir, 'perfil-libreoffice')).toString()
    await new Promise<void>((resolve, reject) => {
      execFile(
        soffice,
        ['--headless', '--norestore', '--nolockcheck', '--nodefault', `-env:UserInstallation=${profile}`, '--convert-to', 'pdf', '--outdir', work, input],
        { timeout: TIMEOUT_MS, windowsHide: true },
        (err, _stdout, stderr) => (err ? reject(new Error(String(stderr || err.message).trim().slice(0, 400))) : resolve())
      )
    })
    const out = join(work, 'documento.pdf')
    if (!existsSync(out)) throw new Error(`LibreOffice no pudo convertir ${basename(abs)}`)
    await fsp.rename(out, join(cacheDir, name))
    await prune(cacheDir)
    return name
  } finally {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function prune(cacheDir: string): Promise<void> {
  const pdfs = (await fsp.readdir(cacheDir)).filter((f) => /^[0-9a-f]{40}\.pdf$/.test(f))
  if (pdfs.length <= KEEP) return
  const withTime = await Promise.all(pdfs.map(async (f) => ({ f, t: (await fsp.stat(join(cacheDir, f))).mtimeMs })))
  withTime.sort((a, b) => b.t - a.t)
  for (const { f } of withTime.slice(KEEP)) await fsp.rm(join(cacheDir, f), { force: true }).catch(() => undefined)
}
