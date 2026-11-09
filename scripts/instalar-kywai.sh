#!/usr/bin/env bash
# Instala (o actualiza) kywai en macOS o Linux con una sola orden:
#
#   curl -fsSL https://kywai.app/install.sh | bash
#
# Baja de la última Release de GitHub (Yiku21/kywai) el archivo que toca para este equipo y lo instala:
#   - macOS: el .zip de la app (Apple silicon o Intel) → /Applications/kywai.app (o ~/Applications si no se puede).
#   - Linux: el AppImage (x64 o ARM) → ~/.local/share/kywai/kywai.AppImage, con entrada en el menú de aplicaciones y la
#     orden «kywai». No pide contraseña salvo para instalar libfuse2 si falta (y si no se puede, funciona igual).
# No toca la carpeta de datos (los proyectos y ajustes se conservan). La web kywai.app sirve este mismo archivo
# (web/build.mjs lo copia como install.sh). Variables opcionales: KYWAI_VERSION=0.1.252 para una versión concreta.
set -euo pipefail

REPO="Yiku21/kywai"

case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
  es*) ES=1 ;;
  *) ES=0 ;;
esac
msg() { if [ "$ES" = 1 ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }
fallo() { msg "✗ $1" "✗ $2" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || fallo "Hace falta curl." "curl is required."

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Nombre de los archivos de la última Release. Primero la API de GitHub; si no responde (límite de peticiones), se
# deduce la versión de la redirección de /releases/latest (los nombres siguen siempre el mismo patrón).
version=""
if [ -n "${KYWAI_VERSION:-}" ]; then
  version="${KYWAI_VERSION#v}"
else
  json="$(curl -fsSL -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)"
  version="$(printf '%s' "$json" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' | head -n1)"
  if [ -z "$version" ]; then
    final="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest" 2>/dev/null || true)"
    version="${final##*/tag/v}"
    [ "$version" = "$final" ] && version=""
  fi
fi
[ -n "$version" ] || fallo "No se pudo saber cuál es la última versión. Prueba más tarde o descárgala de https://github.com/${REPO}/releases/latest" \
  "Could not find the latest version. Try again later or download it from https://github.com/${REPO}/releases/latest"
BASE="https://github.com/${REPO}/releases/download/v${version}"

bajar() { # bajar URL DESTINO
  msg "Descargando $(basename "$1")…" "Downloading $(basename "$1")…"
  curl -fL --retry 3 --progress-bar -o "$2" "$1" || fallo "No se pudo descargar $1" "Could not download $1"
}

instalar_mac() {
  local arch
  arch="$(uname -m)"
  # Un Terminal abierto con Rosetta dice x86_64 aunque el Mac sea Apple silicon.
  if [ "$arch" = "arm64" ] || [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then arch="arm64"; else arch="x64"; fi
  msg "kywai ${version} para macOS (${arch})" "kywai ${version} for macOS (${arch})"

  if pgrep -xq kywai 2>/dev/null; then
    fallo "kywai está abierta. Ciérrala (⌘Q) y vuelve a pegar la orden." "kywai is running. Quit it (⌘Q) and paste the command again."
  fi

  bajar "${BASE}/kywai-${version}-${arch}.zip" "$TMP/kywai.zip"
  ditto -x -k "$TMP/kywai.zip" "$TMP/app"
  [ -d "$TMP/app/kywai.app" ] || fallo "El archivo descargado no trae kywai.app." "The download does not contain kywai.app."

  local dest="/Applications"
  if [ ! -w "$dest" ]; then dest="$HOME/Applications"; mkdir -p "$dest"; fi
  rm -rf "$dest/kywai.app"
  ditto "$TMP/app/kywai.app" "$dest/kywai.app"
  # Sin firma de Apple todavía: quitar la cuarentena evita el aviso de «está dañada» o «no se puede abrir».
  xattr -cr "$dest/kywai.app" 2>/dev/null || true

  msg "✓ Instalada en $dest/kywai.app" "✓ Installed in $dest/kywai.app"
  if [ -d "/Applications/AI Cowork.app" ] || [ -d "$HOME/Applications/AI Cowork.app" ]; then
    msg "  Tienes también la app antigua «AI Cowork.app»: puedes borrarla, tus datos se conservan." \
      "  You also have the old «AI Cowork.app»: you can delete it, your data is kept."
  fi
  open "$dest/kywai.app" || true
}

hay_libfuse2() {
  { command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; } ||
    ls /usr/lib*/libfuse.so.2* /usr/lib/*/libfuse.so.2* /lib/*/libfuse.so.2* >/dev/null 2>&1
}

instalar_libfuse2() {
  # Solo con una terminal de verdad para pedir la contraseña (con «curl | bash» la entrada es el script, por eso /dev/tty).
  command -v sudo >/dev/null 2>&1 && { : </dev/tty; } 2>/dev/null || return 1
  msg "Los AppImage necesitan libfuse2. Se instala ahora (te pedirá tu contraseña)…" \
    "AppImages need libfuse2. Installing it now (it will ask for your password)…"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y libfuse2t64 </dev/tty || sudo apt-get install -y libfuse2 </dev/tty
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y fuse-libs </dev/tty
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --needed --noconfirm fuse2 </dev/tty
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper --non-interactive install libfuse2 </dev/tty
  else
    return 1
  fi
}

instalar_linux() {
  local arch file
  case "$(uname -m)" in
    x86_64 | amd64) arch="x64"; file="kywai-${version}-x86_64.AppImage" ;;
    aarch64 | arm64) arch="arm64"; file="kywai-${version}-arm64.AppImage" ;;
    *) fallo "Este procesador ($(uname -m)) no tiene versión de kywai. Puedes compilarla: bash scripts/instalar-linux.sh" \
      "There is no kywai build for this processor ($(uname -m)). You can build it: bash scripts/instalar-linux.sh" ;;
  esac
  msg "kywai ${version} para Linux (${arch})" "kywai ${version} for Linux (${arch})"

  local data="${XDG_DATA_HOME:-$HOME/.local/share}"
  local dir="$data/kywai" bin="$HOME/.local/bin"
  mkdir -p "$dir" "$bin" "$data/applications" "$data/icons/hicolor/256x256/apps"

  bajar "${BASE}/${file}" "$TMP/kywai.AppImage"
  chmod +x "$TMP/kywai.AppImage"
  # Nombre fijo: así la actualización automática de la app reemplaza este mismo archivo.
  mv -f "$TMP/kywai.AppImage" "$dir/kywai.AppImage"
  curl -fsSL -o "$data/icons/hicolor/256x256/apps/kywai.png" "https://raw.githubusercontent.com/${REPO}/master/build/icon-256.png" 2>/dev/null || true

  # Sin libfuse2 el AppImage no se monta; si no se puede instalar, se abre extrayéndose cada vez (más lento al abrir).
  local env=""
  if ! hay_libfuse2; then
    if ! instalar_libfuse2 || ! hay_libfuse2; then
      env="APPIMAGE_EXTRACT_AND_RUN=1 "
      msg "Aviso: sin libfuse2; kywai se abrirá igual, pero tardará un poco más en arrancar." \
        "Note: libfuse2 is missing; kywai will still open, but it will take a little longer to start."
    fi
  fi
  # Si el sistema restringe los espacios de nombres de usuario (Ubuntu 24.04…), Chromium no puede aislarse dentro de
  # un AppImage (chrome-sandbox no puede ser de root ahí) y hay que abrirlo con --no-sandbox.
  local flags=""
  if [ "$(id -u)" = 0 ] || ! unshare -Ur true >/dev/null 2>&1; then flags=" --no-sandbox"; fi

  cat >"$bin/kywai" <<EOF
#!/usr/bin/env bash
# Abre kywai (lo creó el instalador de kywai.app/install.sh).
exec env ${env}"$dir/kywai.AppImage"${flags} "\$@"
EOF
  chmod +x "$bin/kywai"

  cat >"$data/applications/kywai.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=kywai
Comment=Your team of AI agents working together
Exec="$bin/kywai" %U
Icon=kywai
Terminal=false
Categories=Development;
StartupWMClass=kywai
EOF
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$data/applications" >/dev/null 2>&1 || true

  msg "✓ Instalada: está en el menú de aplicaciones y se abre con la orden «kywai»." \
    "✓ Installed: it is in your applications menu and opens with the «kywai» command."
  case ":${PATH}:" in
    *":$bin:"*) ;;
    *) msg "  (Para usar «kywai» en la terminal, añade $bin a tu PATH.)" "  (To use «kywai» in the terminal, add $bin to your PATH.)" ;;
  esac
  if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    nohup "$bin/kywai" >/dev/null 2>&1 &
  fi
}

case "$(uname -s)" in
  Darwin) instalar_mac ;;
  Linux) instalar_linux ;;
  *) fallo "Este instalador es para macOS y Linux. En Windows usa: irm https://kywai.app/install.ps1 | iex" \
    "This installer is for macOS and Linux. On Windows use: irm https://kywai.app/install.ps1 | iex" ;;
esac
msg "La primera vez se abre el asistente, que instala los agentes de IA y abre su inicio de sesión." \
  "The first time, the setup assistant opens: it installs the AI agents and opens their sign-in."
