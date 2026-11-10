// «Novedades»: la primera vez que kywai se abre después de actualizarse, enseña una ventana con las mejoras de la
// versión nueva. La app recuerda la última versión que vio (novedades-vistas.json en su carpeta de datos); si al abrir
// es otra, junta los cambios que hay entre las dos:
// - App de GitHub Releases: los commits entre las dos etiquetas del repositorio público (API «compare» de GitHub).
// - App compilada en el equipo (el Mac mini, Linux con instalar-linux.sh): los commits del clon de git entre el commit
//   con el que se compiló la anterior y el actual.
// Solo se usa el título de cada commit y se quitan los que no le dicen nada a quien usa la app (publicaciones
// automáticas de Órbita, fusiones, versiones de prueba). En una instalación nueva no sale nada.
// Si no se sabe qué versión había (la primera vez que se abre una versión con esta ventana) pero kywai ya estaba
// configurado al abrir, no es una instalación nueva: se enseñan los últimos cambios hasta la versión instalada.
import { app } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WhatsNew } from '@shared/types'
import { isReleaseBuild } from './updater'
import { sourceDir } from './selfUpdate'

const REPO = 'Yiku21/kywai'
const MAX_ITEMS = 30
/** Cambios que se enseñan cuando no se sabe qué versión había antes. */
const RECENT_ITEMS = 12

/** kywai ya estaba configurado al abrirse esta vez (no es una instalación nueva). Lo apunta boot() en index.ts. */
let configuredAtBoot = false
export function noteConfiguredAtBoot(done: boolean): void {
  configuredAtBoot = done
}

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

/** Los últimos commits hasta esta versión (cuando no se sabe cuál había antes). */
async function recentReleaseSubjects(to: string): Promise<string[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits?sha=v${encodeURIComponent(to)}&per_page=40`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'kywai' },
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}`)
  const data = (await res.json()) as { commit?: { message?: string } }[]
  // Estos ya vienen del más nuevo al más viejo.
  return data.map((c) => c.commit?.message ?? '')
}

function gitSubjects(dir: string, from: string | null, to: string): Promise<string[]> {
  const range = from ? [`${from}..${to}`] : ['-n', '40', to]
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', dir, 'log', '--no-merges', '--format=%s', ...range], { timeout: 15_000 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout.split('\n'))
    })
  })
}

/** Las novedades entre [from] (null: no se sabe, salen los últimos cambios) y [to]. */
async function buildNews(from: string | null, to: string): Promise<WhatsNew> {
  const release = isReleaseBuild()
  let items: string[] = []
  let failed = false
  try {
    if (release) items = cleanSubjects(from ? await releaseSubjects(from, to) : await recentReleaseSubjects(to))
    else {
      const dir = sourceDir()
      if (dir && existsSync(join(dir, '.git'))) items = cleanSubjects(await gitSubjects(dir, from, to))
      else failed = true
    }
  } catch (e) {
    console.error('[novedades] No se pudieron leer los cambios:', e)
    failed = true
  }
  if (!from) items = items.slice(0, RECENT_ITEMS)
  const news: WhatsNew = {
    from: !from ? '' : release ? from : from.slice(0, 7),
    to: release ? to : to.slice(0, 7),
    items: items.slice(0, MAX_ITEMS),
    more: Math.max(0, items.length - MAX_ITEMS),
    failed,
    url: release ? `https://github.com/${REPO}/releases/tag/v${to}` : null
  }
  // Se guardan para los dispositivos conectados (latestWhatsNew), que las verán aunque se abran más tarde.
  if (!failed) writeLatest(to, news)
  return news
}

function latestFile(): string {
  return join(app.getPath('userData'), 'novedades-ultimas.json')
}

function readLatest(key: string): WhatsNew | null {
  try {
    const data = JSON.parse(readFileSync(latestFile(), 'utf8')) as { key?: unknown; news?: WhatsNew }
    return data.key === key && data.news && Array.isArray(data.news.items) ? data.news : null
  } catch {
    return null
  }
}

function writeLatest(key: string, news: WhatsNew): void {
  try {
    writeFileSync(latestFile(), JSON.stringify({ key, news }))
  } catch (e) {
    console.error('[novedades] No se pudieron guardar las novedades:', e)
  }
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
  // Instalación nueva: se apunta la versión y no se enseña nada.
  if (!from && !configuredAtBoot) {
    writeSeen(to)
    return null
  }
  if (from === to) return null
  return buildNews(from, to)
}

/**
 * Las novedades de la versión que tiene este servidor, para los dispositivos conectados (la web, el cliente de
 * escritorio y Órbita): cada uno apunta por su cuenta cuál vio (news.to) y la enseña una vez. No marca nada aquí.
 * null si no se sabe la versión (en desarrollo sin AICW_WHATS_NEW).
 */
export async function latestWhatsNew(): Promise<WhatsNew | null> {
  if (!app.isPackaged && process.env['AICW_WHATS_NEW'] !== '1') return null
  const to = currentKey()
  if (!to) return null
  const cached = readLatest(to)
  if (cached) return cached
  const from = readSeen()
  return buildNews(from && from !== to ? from : null, to)
}

/** Se cerró la ventana de novedades: no vuelve a salir hasta la próxima actualización. */
export function markWhatsNewSeen(): void {
  const key = currentKey()
  if (key) writeSeen(key)
}
