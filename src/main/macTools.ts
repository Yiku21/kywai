// Programas para el Mac sin Homebrew. Ningún Mac trae Homebrew de serie y su instalador pide la contraseña, así que
// kywai baja los oficiales ya hechos para el procesador del Mac (Apple silicon o Intel) y los deja en la carpeta del
// usuario, sin pedir nada. Si Homebrew está, setup.ts y videoStudio.ts siguen usándolo como antes.
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Carpeta propia de kywai para estos programas (Node.js va en su subcarpeta «node»). */
export const macToolsDir = (home = homedir()): string => join(home, '.local', 'share', 'kywai')
/** Donde quedan node, npm, npx y lo que se instale con «npm install -g». */
export const macNodeBin = (home = homedir()): string => join(macToolsDir(home), 'node', 'bin')
/** Donde se dejan las órdenes sueltas (ffmpeg, ffprobe, ollama, acli…): kywai ya la añade al PATH. */
export const macUserBin = (home = homedir()): string => join(home, '.local', 'bin')

/**
 * Pone en $A la arquitectura de los programas a bajar: «arm64» o «x64». Un Terminal abierto con Rosetta dice x86_64
 * aunque el Mac sea Apple silicon, así que se mira también sysctl.proc_translated.
 */
const ARCH =
  'A=x64; { [ "$(uname -m)" = arm64 ] || [ "$(sysctl -in sysctl.proc_translated 2>/dev/null)" = 1 ]; } && A=arm64'

/**
 * Node.js oficial de nodejs.org en ~/.local/share/kywai/node, comprobado con su SHA-256. Node 24 pide macOS 13.5 o
 * más nuevo: en un macOS más viejo (habitual en los Mac Intel) se baja Node 22, que funciona desde macOS 11.
 * También se añade la carpeta al PATH de ~/.zprofile para que la encuentre la Terminal (inicios de sesión de los CLIs).
 */
export function macNodeInstall(): string {
  return [
    'set -e',
    ARCH,
    'M=$(sw_vers -productVersion | cut -d. -f1)',
    'L=22; [ "$M" -ge 14 ] && L=24',
    'U="https://nodejs.org/dist/latest-v$L.x"',
    'S=$(curl -fsSL "$U/SHASUMS256.txt" | grep " node-v[0-9.]*-darwin-$A.tar.gz$")',
    'F=${S##* }',
    'D="$HOME/.local/share/kywai"',
    'mkdir -p "$D"',
    'echo "Descargando $F…"',
    'curl -fsSL --retry 3 -o "$D/node.tar.gz" "$U/$F"',
    '[ "$(shasum -a 256 "$D/node.tar.gz" | cut -d" " -f1)" = "${S%% *}" ] || { echo "La descarga de Node.js no coincide con su SHA-256"; rm -f "$D/node.tar.gz"; exit 1; }',
    'rm -rf "$D/node"',
    'mkdir -p "$D/node"',
    'tar -xzf "$D/node.tar.gz" -C "$D/node" --strip-components 1',
    'rm -f "$D/node.tar.gz"',
    `grep -qs '.local/share/kywai/node/bin' "$HOME/.zprofile" || printf '\\n# Node.js de kywai\\nexport PATH="$HOME/.local/share/kywai/node/bin:$PATH"\\n' >> "$HOME/.zprofile"`,
    '"$D/node/bin/node" --version'
  ].join('\n')
}

/**
 * Python 3.12 con uv (el instalador oficial de Astral, sin contraseña): queda en ~/.local/bin como python3.12 y,
 * si el Mac no tiene ya un python3 propio ahí, también como python3.
 */
export function macPythonInstall(): string {
  return [
    'set -e',
    'export PATH="$HOME/.local/bin:$PATH"',
    'command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh',
    'uv python install 3.12',
    'P=$(uv python find 3.12)',
    'mkdir -p "$HOME/.local/bin"',
    '[ -e "$HOME/.local/bin/python3" ] || ln -s "$P" "$HOME/.local/bin/python3"',
    '"$HOME/.local/bin/python3" --version'
  ].join('\n')
}

/** El python3 que deja macPythonInstall: se mira antes que el de macOS, que es el 3.9 o pide las herramientas de desarrollo. */
export const macUserPython = (home = homedir()): string => join(macUserBin(home), 'python3')

/** Copia una .app ya descomprimida a /Applications (o ~/Applications si no se puede escribir) y le quita la cuarentena. */
const COPY_APP = (src: string, name: string): string[] => [
  'T=/Applications; [ -w "$T" ] || { T="$HOME/Applications"; mkdir -p "$T"; }',
  `rm -rf "$T/${name}"`,
  `ditto "${src}/${name}" "$T/${name}"`,
  `xattr -dr com.apple.quarantine "$T/${name}" 2>/dev/null || true`
]

/**
 * Ollama oficial (Ollama-darwin.zip, sirve para los dos procesadores) en Aplicaciones. Se abre para que arranque su
 * servidor y su orden «ollama» se enlaza en ~/.local/bin (la app la pediría con contraseña para /usr/local/bin).
 */
export function macOllamaInstall(): string {
  return [
    'set -e',
    'W=$(mktemp -d)',
    'echo "Descargando Ollama…"',
    'curl -fsSL --retry 3 -o "$W/ollama.zip" https://ollama.com/download/Ollama-darwin.zip',
    'ditto -x -k "$W/ollama.zip" "$W"',
    ...COPY_APP('$W', 'Ollama.app'),
    'rm -rf "$W"',
    'mkdir -p "$HOME/.local/bin"',
    'ln -sf "$T/Ollama.app/Contents/Resources/ollama" "$HOME/.local/bin/ollama"',
    'open -g "$T/Ollama.app"',
    '"$HOME/.local/bin/ollama" --version || true'
  ].join('\n')
}

/** LM Studio solo existe para Apple silicon: en un Mac Intel no hay nada que instalar. */
export function macLmStudioInstall(): string {
  return [
    'set -e',
    ARCH,
    '[ "$A" = arm64 ] || { echo "LM Studio solo funciona en los Mac con Apple silicon (M1 o más nuevo)."; exit 1; }',
    'W=$(mktemp -d)',
    'echo "Descargando LM Studio…"',
    'curl -fsSL --retry 3 -o "$W/lmstudio.dmg" https://lmstudio.ai/download/latest/darwin/arm64',
    'hdiutil attach -nobrowse -quiet -mountpoint "$W/dmg" "$W/lmstudio.dmg"',
    ...COPY_APP('$W/dmg', 'LM Studio.app'),
    'hdiutil detach -quiet "$W/dmg" || true',
    'rm -rf "$W"',
    'open -a "$T/LM Studio.app"',
    'for i in $(seq 60); do [ -x "$HOME/.lmstudio/bin/lms" ] && break; sleep 2; done'
  ].join('\n')
}

/**
 * ffmpeg y ffprobe ya compilados para macOS (las compilaciones de Martin Riedl, firmadas, para arm64 y amd64) en
 * ~/.local/bin.
 */
export function macFfmpegInstall(): string {
  return [
    'set -e',
    ARCH,
    'R=amd64; [ "$A" = arm64 ] && R=arm64',
    'W=$(mktemp -d)',
    'mkdir -p "$HOME/.local/bin"',
    'for p in ffmpeg ffprobe; do',
    '  echo "Descargando $p…"',
    '  curl -fsSL --retry 3 -o "$W/$p.zip" "https://ffmpeg.martin-riedl.de/redirect/latest/macos/$R/release/$p.zip"',
    '  ditto -x -k "$W/$p.zip" "$W/$p-dir"',
    '  install -m 755 "$W/$p-dir/$p" "$HOME/.local/bin/$p"',
    '  xattr -d com.apple.quarantine "$HOME/.local/bin/$p" 2>/dev/null || true',
    'done',
    'rm -rf "$W"',
    '"$HOME/.local/bin/ffmpeg" -version | head -n 1'
  ].join('\n')
}
