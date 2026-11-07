// Actualizar kywai desde GitHub. El código vive en un clon de git (en desarrollo, la propia carpeta del
// proyecto; en el Mac y en Linux, la carpeta desde la que se instaló con scripts/instalar-mac.sh o instalar-linux.sh). Buscar = git fetch y comparar.
// Actualizar = git pull + dependencias (si cambiaron) + compilar + reinstalar y reiniciar. Si algo falla
// después de descargar, se vuelve a la versión anterior.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import type { UpdateCommit, UpdateStatus } from '@shared/types'
import { emit } from './events'
import { sh } from './setup'
import { launchCommand } from './linuxDesktop'
import { tr } from '@shared/i18n'
import { checkReleaseNow, isReleaseBuild } from './updater'

const IS_MAC = process.platform === 'darwin'
const IS_LINUX = process.platform === 'linux'

declare const __BUILD_COMMIT__: string | undefined
/** Commit con el que se compiló esta app ('' si no se sabe, como en las versiones anteriores a esto). */
function buildCommit(): string {
  return typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : (process.env.AICW_CHECK_BUILD_COMMIT ?? '')
}

/** Carpeta del código: la del proyecto en desarrollo o la que dejó anotada el instalador del Mac o de Linux. */
export function sourceDir(): string | null {
  if (!app.isPackaged) return existsSync(join(app.getAppPath(), '.git')) ? app.getAppPath() : null
  try {
    const dir = readFileSync(join(app.getPath('userData'), 'source-dir.txt'), 'utf8').trim()
    return dir && existsSync(join(dir, '.git')) ? dir : null
  } catch {
    return null
  }
}

const q = (s: string): string => `"${s.replace(/"/g, '\\"')}"`

async function git(dir: string, args: string, timeoutMs = 60_000): Promise<{ ok: boolean; out: string }> {
  const r = await sh(`git -C ${q(dir)} ${args}`, timeoutMs)
  return { ok: r.code === 0, out: r.out.trim() }
}

function parseCommits(out: string): UpdateCommit[] {
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [hash, date, ...subject] = l.split('\t')
      return { hash, date, subject: subject.join('\t') }
    })
}

const FORMAT = '--format=%h%x09%ad%x09%s --date=short'

export async function checkForUpdates(): Promise<UpdateStatus> {
  const dir = sourceDir()
  if (!dir && isReleaseBuild()) {
    checkReleaseNow()
    return {
      canUpdate: false,
      commits: [],
      reason: tr('Esta versión se descargó de GitHub y se actualiza sola: al abrirse busca la última y la instala. Ahora mismo también lo está comprobando.')
    }
  }
  if (!dir) {
    return {
      canUpdate: false,
      commits: [],
      reason: app.isPackaged
        ? tr('Esta instalación no tiene su código descargado de GitHub. Reinstálala desde un clon del repositorio (README → Instalar).')
        : tr('La carpeta del proyecto no es un repositorio de git.')
    }
  }
  const current = parseCommits((await git(dir, `log -1 ${FORMAT}`)).out)[0]
  const branch = (await git(dir, 'rev-parse --abbrev-ref HEAD')).out || 'main'
  const fetch = await git(dir, 'fetch --quiet origin', 90_000)
  if (!fetch.ok) {
    return {
      canUpdate: false,
      current,
      branch,
      commits: [],
      reason: /auth|denied|could not read|403|401/i.test(fetch.out)
        ? tr('GitHub no acepta la conexión: inicia sesión en este equipo con «gh auth login» y «gh auth setup-git».')
        : tr('No se pudo consultar GitHub: {v1}', { v1: fetch.out.split('\n').pop() ?? tr('sin conexión') })
    }
  }
  const commits = parseCommits((await git(dir, `log ${FORMAT} HEAD..origin/${branch}`)).out)
  // Commits hechos aquí (por ejemplo, por un agente) que no están en GitHub: impiden actualizar sin más.
  const localCommits = parseCommits((await git(dir, `log ${FORMAT} origin/${branch}..HEAD`)).out)
  const dirty = (await git(dir, 'status --porcelain --untracked-files=no')).out
  // «XY ruta» → ruta (git() recorta la salida, así que la primera línea puede haber perdido su espacio inicial).
  const localChanges = dirty
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^\S+\s+/, ''))
    .filter(Boolean)
  if (localCommits.length) {
    return {
      canUpdate: false,
      current,
      branch,
      commits,
      localChanges,
      localCommits,
      reason:
        tr('El código de este equipo tiene commits hechos aquí (por ejemplo, por tus agentes) que no están en GitHub. ') +
        tr('Apártalos para actualizar: quedan guardados en una rama de git, no se borran.')
    }
  }
  if (commits.length && localChanges.length) {
    return {
      canUpdate: false,
      current,
      branch,
      commits,
      localChanges,
      reason:
        tr('El código de este equipo tiene cambios hechos aquí (por ejemplo, por tus agentes) que no están en GitHub. ') +
        tr('Apártalos para actualizar: se guardan en git, no se borran.')
    }
  }
  // Nada nuevo en GitHub, pero la app instalada se compiló con un código anterior al descargado (por ejemplo,
  // alguien lo bajó o lo subió desde aquí sin recompilar): se ofrece instalarlo.
  if (!commits.length && buildCommit() && !localChanges.length) {
    const head = (await git(dir, 'rev-parse HEAD')).out
    if (head && head !== buildCommit()) {
      const known = (await git(dir, `cat-file -e ${q(`${buildCommit()}^{commit}`)}`)).ok
      const pending = known ? parseCommits((await git(dir, `log ${FORMAT} ${buildCommit()}..HEAD`)).out) : current ? [current] : []
      if (pending.length) return { canUpdate: true, current, branch, commits: pending, pendingInstall: true }
    }
  }
  return { canUpdate: true, current, branch, commits }
}

/** Aparta los commits hechos aquí en una rama («apartado/fecha») y deja el código como en GitHub. */
export async function setAsideLocalCommits(dir: string, branch: string, count: number): Promise<string | null> {
  const stamp = new Date().toLocaleString('sv-SE').slice(0, 16).replace(' ', '-').replace(':', '')
  const name = `apartado/${stamp}`
  const r = await git(dir, `branch ${q(name)} HEAD`)
  if (!r.ok) return tr('No se pudieron apartar los commits locales: {v1}', { v1: r.out.split('\n').pop() ?? tr('error de git') })
  const reset = await git(dir, `reset --hard origin/${branch}`)
  if (!reset.ok) return tr('No se pudo volver a la versión de GitHub: {v1}', { v1: reset.out.split('\n').pop() ?? tr('error de git') })
  emit({ kind: 'update.log', line: tr('▸ {count} {v2} aquí apartados en la rama {name} (git log {name2})', { count, v2: count === 1 ? tr('commit hecho') : tr('commits hechos'), name, name2: name }) })
  return null
}

/** Guarda los cambios locales del código aparte (git stash) para poder actualizar sin perderlos. */
async function setAsideLocalChanges(dir: string, files: string[]): Promise<string | null> {
  const when = new Date().toLocaleString('sv-SE').slice(0, 16) // «2026-10-11 09:30», hora local
  // Identidad propia por si este equipo no tiene git configurado (stash la necesita).
  const r = await git(dir, `-c user.name="AI Cowork" -c user.email="ai-cowork@localhost" stash push -m ${q(`AI Cowork: cambios locales apartados antes de actualizar (${when})`)}`)
  if (!r.ok) return tr('No se pudieron apartar los cambios locales: {v1}', { v1: r.out.split('\n').pop() ?? tr('error de git') })
  emit({ kind: 'update.log', line: tr('▸ Cambios locales apartados con git stash ({length}): {v2}', { length: files.length, v2: files.join(', ') }) })
  return null
}

let running = false

/** Ejecuta un paso mostrando su salida en el diálogo de actualización. */
async function step(label: string, command: string, cwd: string, timeoutMs = 20 * 60_000): Promise<void> {
  const log = (line: string) => emit({ kind: 'update.log', line: line.slice(0, 400) })
  log(`▸ ${label}`)
  const r = await sh(command, timeoutMs, log, cwd)
  if (r.code !== 0) throw new Error(`${label}: falló (${r.out.split('\n').filter(Boolean).pop() ?? 'sin detalles'})`)
}

function buildCommand(): string {
  if (!app.isPackaged) return 'npx electron-vite build'
  const arch = process.arch === 'arm64' ? '--arm64' : '--x64'
  if (IS_LINUX) return `npx electron-vite build && npx electron-builder --linux dir ${arch}`
  return `npx electron-vite build && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir ${arch}`
}

/** Linux: carpeta instalada (la del ejecutable), si es una instalación de scripts/instalar-linux.sh. */
function runningLinuxDir(): string | null {
  if (!IS_LINUX || process.env.APPIMAGE) return null
  const dir = dirname(process.execPath)
  return existsSync(join(dir, 'ai-cowork')) ? dir : null
}

/** Carpeta .app que se está ejecutando (solo macOS empaquetado). */
function runningBundle(): string | null {
  const m = process.execPath.match(/^(.*?\.app)\//)
  return m ? m[1] : null
}

export async function applyUpdate(setAside = false): Promise<string> {
  if (running) return tr('Ya hay una actualización en curso')
  let status = await checkForUpdates()
  if (!status.canUpdate && setAside && (status.localChanges?.length || status.localCommits?.length)) {
    if (status.localChanges?.length) {
      const failed = await setAsideLocalChanges(sourceDir()!, status.localChanges)
      if (failed) return failed
    }
    if (status.localCommits?.length) {
      const failed = await setAsideLocalCommits(sourceDir()!, status.branch ?? 'master', status.localCommits.length)
      if (failed) return failed
    }
    status = await checkForUpdates()
  }
  if (!status.canUpdate) return status.reason ?? tr('No se puede actualizar')
  if (!status.commits.length) return tr('Ya tienes la última versión')
  if (app.isPackaged && !IS_MAC && !IS_LINUX) return tr('En Windows, actualiza con el instalador nuevo (por ahora)')
  if (app.isPackaged && IS_LINUX && !runningLinuxDir()) return tr('La AppImage no se actualiza sola: descarga o compila la nueva (npm run dist:linux)')
  const dir = sourceDir()!
  running = true
  const before = (await git(dir, 'rev-parse HEAD')).out
  // Lo que cambió desde lo que está instalado (si se sabe): así se reinstalan las dependencias si hace falta.
  const base = status.pendingInstall && buildCommit() && (await git(dir, `cat-file -e ${q(`${buildCommit()}^{commit}`)}`)).ok ? buildCommit() : before
  try {
    await step(tr('Descargando los cambios de GitHub'), `git pull --ff-only origin ${status.branch}`, dir, 5 * 60_000)
    const changed = (await git(dir, `diff --name-only ${base} HEAD`)).out
    if (/(^|\n)package(-lock)?\.json$/m.test(changed)) await step(tr('Actualizando dependencias'), 'npm install --no-audit --no-fund', dir)
    await step(tr('Compilando kywai'), buildCommand(), dir)
  } catch (e) {
    // Vuelve a la versión anterior para no dejar la app a medias.
    emit({ kind: 'update.log', line: tr('↺ Volviendo a la versión anterior…') })
    await git(dir, `reset --hard ${before}`)
    await sh(buildCommand(), 20 * 60_000, undefined, dir).catch(() => undefined)
    running = false
    return tr('No se pudo actualizar: {message}', { message: (e as Error).message })
  }

  emit({ kind: 'update.log', line: tr('✓ Listo. Reiniciando kywai…') })
  const bundle = app.isPackaged && IS_MAC ? runningBundle() : null
  const linuxDir = app.isPackaged ? runningLinuxDir() : null
  if (linuxDir) {
    // Linux: igual que en el Mac, un script aparte cambia la carpeta instalada y vuelve a abrir la app.
    const built = join(dir, 'release', process.arch === 'arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked')
    const child = spawn(
      'bash',
      [join(dir, 'scripts', 'actualizar-linux.sh'), String(process.pid), linuxDir, built, ...launchCommand(process.execPath, process.argv)],
      { detached: true, stdio: 'ignore', cwd: dirname(linuxDir) }
    )
    child.unref()
    setTimeout(() => app.quit(), 800)
  } else if (bundle) {
    // macOS: un script aparte espera a que se cierre la app, cambia la .app y la vuelve a abrir.
    const built = join(dir, 'release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'AI Cowork.app')
    const child = spawn('bash', [join(dir, 'scripts', 'actualizar-mac.sh'), String(process.pid), bundle, built], {
      detached: true,
      stdio: 'ignore',
      cwd: dirname(bundle)
    })
    child.unref()
    setTimeout(() => app.quit(), 800)
  } else {
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 800)
  }
  return ''
}
