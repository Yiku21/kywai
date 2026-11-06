// Piezas propias de Linux, sin Electron para poder probarlas: abrir una terminal visible, instalar con el gestor de
// paquetes de la distribución (pidiendo la contraseña con la ventana del sistema, pkexec) y el arranque al iniciar
// sesión (Electron no lo hace en Linux: se usa ~/.config/autostart).
import { accessSync, constants, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

/** Busca un programa en el PATH (null si no está). */
export function which(name: string, path = process.env.PATH ?? ''): string | null {
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    const file = join(dir, name)
    try {
      accessSync(file, constants.X_OK)
      return file
    } catch {
      /* sigue buscando */
    }
  }
  return null
}

// ---------- Terminal visible ----------

/** Terminales que se prueban, en orden: la predeterminada de Debian/Ubuntu y luego las de cada escritorio. */
export const LINUX_TERMINALS = [
  'x-terminal-emulator',
  'gnome-terminal',
  'konsole',
  'xfce4-terminal',
  'mate-terminal',
  'kgx',
  'ptyxis',
  'kitty',
  'alacritty',
  'wezterm',
  'foot',
  'xterm'
] as const

/**
 * Argumentos para abrir `terminal` ejecutando `cmd` en bash. Al terminar la orden se queda una consola abierta
 * (como en el Mac), para leer lo que dijo el CLI.
 */
export function terminalArgs(terminal: string, cmd: string): string[] {
  const run = ['bash', '-lc', `${cmd}; exec bash -l`]
  const name = terminal.split('/').pop() ?? terminal
  switch (name) {
    case 'gnome-terminal':
    case 'kgx':
    case 'ptyxis':
      return ['--', ...run]
    case 'xfce4-terminal':
    case 'mate-terminal':
      return ['-x', ...run]
    case 'kitty':
    case 'foot':
      return run
    case 'wezterm':
      return ['start', '--', ...run]
    default:
      // x-terminal-emulator, konsole, alacritty, xterm y la variable $TERMINAL: «-e orden argumentos…».
      return ['-e', ...run]
  }
}

/** La terminal a usar: la de $TERMINAL si existe, o la primera de la lista que esté instalada. */
export function findTerminal(path = process.env.PATH ?? '', preferred = process.env.TERMINAL): string | null {
  if (preferred) {
    const own = preferred.includes('/') ? (existsSync(preferred) ? preferred : null) : which(preferred, path)
    if (own) return own
  }
  for (const t of LINUX_TERMINALS) {
    const found = which(t, path)
    if (found) return found
  }
  return null
}

// ---------- Instalar con el gestor de paquetes ----------

export type LinuxPackageManager = 'apt' | 'dnf' | 'pacman' | 'zypper'

export function detectPackageManager(path = process.env.PATH ?? ''): LinuxPackageManager | null {
  if (which('apt-get', path)) return 'apt'
  if (which('dnf', path)) return 'dnf'
  if (which('pacman', path)) return 'pacman'
  if (which('zypper', path)) return 'zypper'
  return null
}

/** Orden (para ejecutar como administrador) que instala estos paquetes. */
export function packageInstall(pm: LinuxPackageManager, packages: string[]): string {
  const list = packages.join(' ')
  switch (pm) {
    case 'apt':
      return `apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y ${list}`
    case 'dnf':
      return `dnf install -y ${list}`
    case 'pacman':
      return `pacman -S --needed --noconfirm ${list}`
    case 'zypper':
      return `zypper --non-interactive install ${list}`
  }
}

/** Paquetes de cada programa por distribución. */
export const LINUX_PACKAGES: Record<'python' | 'node', Record<LinuxPackageManager, string[]>> = {
  // Python con venv y pipx: los agentes de catálogo que lo necesitan se instalan con pipx.
  python: {
    apt: ['python3', 'python3-venv', 'python3-pip', 'pipx'],
    dnf: ['python3', 'python3-pip', 'pipx'],
    pacman: ['python', 'python-pip', 'python-pipx'],
    zypper: ['python3', 'python3-pip', 'python3-pipx']
  },
  node: {
    apt: ['nodejs'],
    dnf: ['nodejs', 'npm'],
    pacman: ['nodejs', 'npm'],
    zypper: ['nodejs-default', 'npm-default']
  }
}

/** Node.js: en Debian/Ubuntu el paquete de la distribución suele ser antiguo, así que se usa el repositorio oficial (NodeSource, LTS). */
export function nodeInstall(pm: LinuxPackageManager): string {
  if (pm === 'apt') return `curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && ${packageInstall(pm, LINUX_PACKAGES.node.apt)}`
  return packageInstall(pm, LINUX_PACKAGES.node[pm])
}

/** Ejecuta `script` como administrador: pkexec enseña la ventana del sistema que pide la contraseña. */
export function asAdmin(script: string): string {
  return `pkexec sh -c '${script.replace(/'/g, `'\\''`)}'`
}

/**
 * En Linux, `npm install -g` con el Node.js del sistema escribe en /usr y falla sin administrador. Si la carpeta
 * global no se puede escribir, se instala en ~/.npm-global (AI Cowork ya la añade al PATH).
 */
export function withUserNpmPrefix(cmd: string): string {
  return cmd.replace(/\bnpm (install|i) -g\b/g, 'npm $1 -g --prefix "$HOME/.npm-global"')
}

// ---------- Abrir al iniciar sesión ----------

export function autostartFile(home = homedir(), configHome = process.env.XDG_CONFIG_HOME): string {
  return join(configHome || join(home, '.config'), 'autostart', 'ai-cowork.desktop')
}

/** Comillas de la clave Exec de un archivo .desktop (especificación de freedesktop). */
export function desktopExecQuote(arg: string): string {
  const a = arg.replace(/%/g, '%%')
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(a)) return a
  // Dentro de comillas se escapan " ` $ y la barra invertida (esta, dos veces: la clave también es una cadena escapada).
  return `"${a.replace(/\\/g, '\\\\\\\\').replace(/(["`$])/g, '\\$1')}"`
}

export function autostartEntry(exec: string[]): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=AI Cowork',
    'Comment=Abre AI Cowork al iniciar sesión',
    `Exec=${exec.map(desktopExecQuote).join(' ')}`,
    'Icon=ai-cowork',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    ''
  ].join('\n')
}

export function linuxAutostartEnabled(file = autostartFile()): boolean {
  try {
    const text = readFileSync(file, 'utf8')
    return /^Exec=/m.test(text) && !/^Hidden=true/m.test(text)
  } catch {
    return false
  }
}

export function setLinuxAutostart(on: boolean, exec: string[], file = autostartFile()): void {
  if (!on) {
    rmSync(file, { force: true })
    return
  }
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, autostartEntry(exec))
}

/**
 * Cómo se abre esta app: la AppImage (su ruta real, no la carpeta temporal donde se monta) o el ejecutable, con las
 * opciones con las que se abrió (p. ej. --no-sandbox si el instalador lo puso).
 */
export function launchCommand(execPath: string, argv: string[], appImage = process.env.APPIMAGE): string[] {
  const flags = argv.slice(1).filter((a) => /^--[a-z0-9-]+(=.*)?$/i.test(a))
  return [appImage || execPath, ...flags]
}
