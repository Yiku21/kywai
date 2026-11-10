// «Novedades»: la primera vez que kywai se abre después de actualizarse, enseña una ventana con las mejoras de la
// versión nueva. La app recuerda la última versión que vio (novedades-vistas.json en su carpeta de datos); si al abrir
// es otra, junta los cambios que hay entre las dos:
// - App de GitHub Releases: los commits entre las dos etiquetas del repositorio público (API «compare» de GitHub).
// - App compilada en el equipo (el Mac mini, Linux con instalar-linux.sh): los commits del clon de git entre el commit
//   con el que se compiló la anterior y el actual.
// Solo se usa el título de cada commit y se quitan los que no le dicen nada a quien usa la app (publicaciones
// automáticas de Órbita, fusiones, versiones de prueba). En una instalación nueva no sale nada.
import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WhatsNew } from '@shared/types'
import { isReleaseBuild } from './updater'
import { sourceDir } from './selfUpdate'

const REPO = 'Yiku21/kywai'
const MAX_ITEMS = 30

declare const __BUILD_COMMIT__: string | undefined

function stateFile(): string {
  return join(app.getPath('userData'), 'novedades-vistas.json')
}

/** Lo que identifica la versión instalada: el número de versión (Releases) o el commit con el que se compiló. */
function currentKey(): string {
  if (isReleaseBuild()) return app.getVersion()
  return typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : ''
}

function readSeen(): string | null {
  try {
    const v = (JSON.parse(readFileSync(stateFile(), 'utf8')) as { seen?: unknown }).seen
    return typeof v === 'string' ? v : null
  } catch {
    return null
  }
}

function writeSeen(key: string): void {
  try {
    writeFileSync(stateFile(), JSON.stringify({ seen: key }))
  } catch (e) {
    console.error('[novedades] No se pudo guardar la versión vista:', e)
  }
}

/** Títulos de commit que merecen salir en «Novedades», del más nuevo al más viejo y sin repetidos. */
export function cleanSubjects(messages: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const message of messages) {
    const subject = message.split('\n')[0].trim()
    if (!subject || seen.has(subject)) continue
    if (/^Merge\b|^Revert "|publicada automáticamente|versión de prueba|^\[skip|^wip\b/i.test(subject)) continue
    seen.add(subject)
    out.push(subject)
  }
  return out
}

async function releaseSubjects(from: string, to: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/compare/v${encodeURIComponent(from)}...v${encodeURIComponent(to)}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'kywai' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}`)
  const data = (await res.json()) as { commits?: { commit?: { message?: string } }[] }
  // GitHub los da del más viejo al más nuevo.
  return (data.commits ?? []).map((c) => c.commit?.message ?? '').reverse()
}

function gitSubjects(dir: string, from: string, to: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', dir, 'log', '--no-merges', '--format=%s', `${from}..${to}`], { timeout: 15_000 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout.split('\n'))
    })
  })
}

/**
 * Si kywai se actualizó desde la última vez que se abrió, las novedades que hay que enseñar; si no, null.
 * No marca nada como visto: eso lo hace markWhatsNewSeen al cerrar la ventana.
 */
export async function getWhatsNew(): Promise<WhatsNew | null> {
  if (!app.isPackaged && process.env['AICW_WHATS_NEW'] !== '1') return null
  const to = currentKey()
  if (!to) return null
  const from = readSeen()
  // Instalación nueva (o de antes de esto): se apunta la versión y no se enseña nada.
  if (!from) {
    writeSeen(to)
    return null
  }
  if (from === to) return null
  const release = isReleaseBuild()
  let items: string[] = []
  let failed = false
  try {
    if (release) items = cleanSubjects(await releaseSubjects(from, to))
    else {
      const dir = sourceDir()
      if (dir && existsSync(join(dir, '.git'))) items = cleanSubjects(await gitSubjects(dir, from, to))
      else failed = true
    }
  } catch (e) {
    console.error('[novedades] No se pudieron leer los cambios:', e)
    failed = true
  }
  return {
    from: release ? from : from.slice(0, 7),
    to: release ? to : to.slice(0, 7),
    items: items.slice(0, MAX_ITEMS),
    more: Math.max(0, items.length - MAX_ITEMS),
    failed,
    url: release ? `https://github.com/${REPO}/releases/tag/v${to}` : null
  }
}

/** Se cerró la ventana de novedades: no vuelve a salir hasta la próxima actualización. */
export function markWhatsNewSeen(): void {
  const key = currentKey()
  if (key) writeSeen(key)
}
