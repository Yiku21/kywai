// Manejar Spotifast (app de escritorio para escuchar Spotify con Premium, https://spotifast.rocks) desde la música de
// kywai. kywai no reproduce nada de Spotify ni lleva Spotifast dentro: busca la app instalada en este equipo, la abre
// y le manda sus propias órdenes de mando a distancia («spotifast next», «spotifast now-playing --raw»…), siempre
// con execFile y argumentos sueltos (sin shell). Ver @shared/spotifast.
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { tr } from '@shared/i18n'
import { checkAction, parseNowPlaying, spotifastArgs, type SpotifastAction, type SpotifastStatus } from '@shared/spotifast'

const FLATPAK_ID = 'rocks.spotifast.Spotifast'
const COMMAND_TIMEOUT_MS = 5000
const START_WAIT_MS = 12_000

interface Program {
  /** Ejecutable al que se le pasan las órdenes. */
  file: string
  /** Lo que va delante de cada orden (flatpak: «run rocks.spotifast.Spotifast»). */
  prefix: string[]
  /** macOS: la app (.app), que se abre con «open -a». */
  appBundle?: string
}

function onPath(name: string): string | null {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  dirs.push(join(homedir(), '.local', 'bin'), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin')
  for (const dir of dirs) {
    const full = join(dir, name)
    if (existsSync(full)) return full
  }
  return null
}

/** Dónde está Spotifast en este equipo (null si no está instalada). */
export function findSpotifast(platform: NodeJS.Platform = process.platform, home = homedir()): Program | null {
  if (platform === 'darwin') {
    for (const bundle of ['/Applications/Spotifast.app', join(home, 'Applications', 'Spotifast.app')]) {
      const file = join(bundle, 'Contents', 'MacOS', 'Spotifast')
      if (existsSync(file)) return { file, prefix: [], appBundle: bundle }
    }
  }
  if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    const file = join(local, 'Programs', 'Spotifast', 'spotifast.exe')
    if (existsSync(file)) return { file, prefix: [] }
    const found = onPath('spotifast.exe')
    return found ? { file: found, prefix: [] } : null
  }
  const found = onPath('spotifast')
  if (found) return { file: found, prefix: [] }
  if (platform === 'linux') {
    const flatpak = [join(home, '.local', 'share', 'flatpak', 'app', FLATPAK_ID), join('/var/lib/flatpak/app', FLATPAK_ID)]
    const bin = onPath('flatpak')
    if (bin && flatpak.some((d) => existsSync(d))) return { file: bin, prefix: ['run', FLATPAK_ID] }
  }
  return null
}

function run(program: Program, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(
      program.file,
      [...program.prefix, ...args],
      { timeout: COMMAND_TIMEOUT_MS, windowsHide: true, maxBuffer: 256 * 1024, encoding: 'utf8' },
      (err, stdout) => resolve({ ok: !err, out: typeof stdout === 'string' ? stdout : '' })
    )
  })
}

async function readStatus(program: Program): Promise<SpotifastStatus> {
  const r = await run(program, ['now-playing', '--raw'])
  // Sin Spotifast abierta, la orden termina con error («Spotifast is not running»).
  if (!r.ok) return { installed: true, running: false, state: 'stopped' }
  return { installed: true, running: true, ...parseNowPlaying(r.out) }
}

/** Abre Spotifast y espera a que responda a sus órdenes. */
async function start(program: Program): Promise<boolean> {
  const child = program.appBundle
    ? spawn('open', ['-a', program.appBundle], { detached: true, stdio: 'ignore' })
    : spawn(program.file, program.prefix, { detached: true, stdio: 'ignore', windowsHide: false })
  child.on('error', () => undefined)
  child.unref()
  const until = Date.now() + START_WAIT_MS
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 700))
    if ((await readStatus(program)).running) return true
  }
  return false
}

/**
 * Lo que pide el panel de Música: el estado («status»), abrir Spotifast o una orden (pausa, siguiente, buscar y
 * poner, un enlace de Spotify…). Siempre devuelve cómo ha quedado.
 */
export async function spotifast(input: unknown): Promise<SpotifastStatus> {
  const action: SpotifastAction | null = checkAction(input)
  if (!action) throw new Error(tr('Orden de Spotifast no válida'))
  const program = findSpotifast()
  if (!program) return { installed: false, running: false, state: 'stopped' }
  if (action.kind === 'status') return readStatus(program)
  let status = await readStatus(program)
  if (!status.running) {
    // Abrir la app, buscar o pegar un enlace la abren si hace falta; pausa o siguiente sin ella no hacen nada.
    if (action.kind !== 'open' && action.kind !== 'search' && action.kind !== 'link') return status
    if (!(await start(program))) throw new Error(tr('Spotifast no ha respondido al abrirla. Ábrela a mano e inicia sesión en ella.'))
  } else if (action.kind === 'open') {
    await run(program, ['show'])
  }
  const args = spotifastArgs(action)
  if (args) {
    const r = await run(program, args)
    if (!r.ok && (action.kind === 'search' || action.kind === 'link')) {
      throw new Error(tr('Spotifast no pudo ponerlo. Mira que hayas iniciado sesión con Spotify Premium en ella.'))
    }
  }
  // Spotifast tarda un momento en cambiar de canción: se lee después.
  await new Promise((r) => setTimeout(r, action.kind === 'search' || action.kind === 'link' ? 900 : 250))
  status = await readStatus(program)
  return status
}
