import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  asAdmin,
  autostartEntry,
  desktopExecQuote,
  detectPackageManager,
  findTerminal,
  launchCommand,
  linuxAutostartEnabled,
  nodeInstall,
  packageInstall,
  setLinuxAutostart,
  terminalArgs,
  withUserNpmPrefix
} from './linuxDesktop'

/** Carpeta con «programas» falsos (archivos ejecutables vacíos) para simular el PATH. */
function fakePath(...names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'aicw-path-'))
  for (const n of names) {
    writeFileSync(join(dir, n), '#!/bin/sh\n')
    chmodSync(join(dir, n), 0o755)
  }
  return dir
}

describe('terminal de Linux', () => {
  it('cada terminal recibe la orden a su manera y deja una consola abierta', () => {
    const run = ['bash', '-lc', 'claude auth login; exec bash -l']
    expect(terminalArgs('/usr/bin/gnome-terminal', 'claude auth login')).toEqual(['--', ...run])
    expect(terminalArgs('xfce4-terminal', 'claude auth login')).toEqual(['-x', ...run])
    expect(terminalArgs('kitty', 'claude auth login')).toEqual(run)
    expect(terminalArgs('wezterm', 'claude auth login')).toEqual(['start', '--', ...run])
    expect(terminalArgs('x-terminal-emulator', 'claude auth login')).toEqual(['-e', ...run])
    expect(terminalArgs('konsole', 'claude auth login')).toEqual(['-e', ...run])
  })

  it('prefiere $TERMINAL, luego la predeterminada del sistema, y null si no hay ninguna', () => {
    const dir = fakePath('xterm', 'gnome-terminal', 'kitty')
    expect(findTerminal(dir, 'kitty')).toBe(join(dir, 'kitty'))
    expect(findTerminal(dir, 'no-existe')).toBe(join(dir, 'gnome-terminal'))
    expect(findTerminal(fakePath('xterm'), undefined)).toMatch(/xterm$/)
    expect(findTerminal(fakePath(), undefined)).toBeNull()
  })
})

describe('instalar en Linux', () => {
  it('reconoce el gestor de paquetes', () => {
    expect(detectPackageManager(fakePath('apt-get'))).toBe('apt')
    expect(detectPackageManager(fakePath('dnf'))).toBe('dnf')
    expect(detectPackageManager(fakePath('pacman'))).toBe('pacman')
    expect(detectPackageManager(fakePath())).toBeNull()
  })

  it('arma órdenes sin preguntas y Node.js oficial en Debian/Ubuntu', () => {
    expect(packageInstall('pacman', ['python', 'python-pipx'])).toBe('pacman -S --needed --noconfirm python python-pipx')
    expect(nodeInstall('apt')).toContain('deb.nodesource.com/setup_lts.x')
    expect(nodeInstall('dnf')).toBe('dnf install -y nodejs npm')
  })

  it('pkexec recibe el script entero aunque lleve comillas', () => {
    expect(asAdmin("echo 'hola'")).toBe(`pkexec sh -c 'echo '\\''hola'\\'''`)
  })

  it('npm -g va a la carpeta del usuario', () => {
    expect(withUserNpmPrefix('npm install -g @google/gemini-cli')).toBe('npm install -g --prefix "$HOME/.npm-global" @google/gemini-cli')
    expect(withUserNpmPrefix('pipx install gptme')).toBe('pipx install gptme')
  })
})

describe('abrir al iniciar sesión en Linux', () => {
  it('escribe y quita la entrada de autostart', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'aicw-auto-')), 'autostart', 'ai-cowork.desktop')
    expect(linuxAutostartEnabled(file)).toBe(false)
    setLinuxAutostart(true, ['/home/yo/.local/share/ai-cowork/ai-cowork', '--no-sandbox'], file)
    expect(readFileSync(file, 'utf8')).toContain('Exec=/home/yo/.local/share/ai-cowork/ai-cowork --no-sandbox\n')
    expect(linuxAutostartEnabled(file)).toBe(true)
    setLinuxAutostart(false, [], file)
    expect(linuxAutostartEnabled(file)).toBe(false)
  })

  it('pone comillas a las rutas con espacios y escapa lo que pide freedesktop', () => {
    expect(desktopExecQuote('/opt/AI Cowork/ai-cowork')).toBe('"/opt/AI Cowork/ai-cowork"')
    expect(desktopExecQuote('/x/100%')).toBe('/x/100%%')
    expect(desktopExecQuote('/a $b')).toBe('"/a \\$b"')
    expect(autostartEntry(['/a b'])).toMatch(/^Exec="\/a b"$/m)
  })

  it('se abre igual que ahora: la AppImage si lo es, y con sus opciones', () => {
    expect(launchCommand('/app/ai-cowork', ['/app/ai-cowork', '--no-sandbox', 'algo'], undefined)).toEqual(['/app/ai-cowork', '--no-sandbox'])
    expect(launchCommand('/tmp/.mount_x/ai-cowork', ['/tmp/.mount_x/ai-cowork'], '/home/yo/AI-Cowork.AppImage')).toEqual(['/home/yo/AI-Cowork.AppImage'])
  })
})
