#!/usr/bin/env bash
# Instala AI Cowork en este Linux desde la carpeta del código: compila la app y la deja en tu carpeta de usuario,
# con su entrada en el menú de aplicaciones y la orden «ai-cowork». No necesita permisos de administrador, salvo
# (si tu sistema lo pide) para activar el aislamiento de Chromium; ver más abajo.
# Uso (desde un clon del repositorio):   bash scripts/instalar-linux.sh   [carpeta de destino]
# Al abrirla por primera vez, el asistente te deja elegir agentes, instalar sus CLIs e iniciar sesión.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== AI Cowork · instalación en Linux =="

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Falta Node.js (22 o más nuevo). Instálalo desde https://nodejs.org/es/download (el de algunas"
  echo "distribuciones, como Ubuntu, es demasiado antiguo) y vuelve a ejecutar este script."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${NODE_MAJOR}" -lt 22 ]; then
  echo "Tu Node.js es la versión $(node --version) y hace falta la 22 o más nueva (https://nodejs.org)."
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "Aviso: no está git. La app funcionará, pero «Buscar actualizaciones» necesita git y un clon del repositorio."
fi

DEFAULT_DEST="${XDG_DATA_HOME:-$HOME/.local/share}/ai-cowork"
DEST="${1:-}"
if [ -z "${DEST}" ]; then
  read -r -p "¿Dónde instalar AI Cowork? [${DEFAULT_DEST}]: " DEST
  DEST="${DEST:-$DEFAULT_DEST}"
fi

echo "Instalando dependencias (unos minutos la primera vez)…"
npm ci

case "$(uname -m)" in
  aarch64 | arm64) ARCH=--arm64; BUILT=release/linux-arm64-unpacked ;;
  *) ARCH=--x64; BUILT=release/linux-unpacked ;;
esac

echo "Compilando AI Cowork…"
npx electron-vite build
npx electron-builder --linux dir "$ARCH"
if [ ! -x "${BUILT}/ai-cowork" ]; then
  echo "No se encontró la app compilada en ${BUILT}."
  exit 1
fi

# Solo se sustituye una carpeta vacía o una instalación anterior de AI Cowork (nunca otra cosa que esté ahí).
if [ -e "${DEST}" ] && [ ! -x "${DEST}/ai-cowork" ] && [ -n "$(ls -A "${DEST}" 2>/dev/null)" ]; then
  echo "${DEST} ya existe y no es una instalación de AI Cowork. Elige otra carpeta (por ejemplo ${DEST}/ai-cowork)."
  exit 1
fi
echo "Copiando a ${DEST}…"
mkdir -p "$(dirname "${DEST}")"
rm -rf "${DEST}"
cp -R "${BUILT}" "${DEST}"

# Aislamiento de Chromium (sandbox). Si el sistema deja crear «espacios de nombres de usuario», no hace falta nada.
# Si no (Ubuntu 24.04 y otros lo restringen), se activa el ayudante chrome-sandbox, que necesita ser de root; y si
# eso tampoco se puede, la app se abre sin aislamiento (funciona igual, pero con menos protección) y se avisa.
FLAGS=""
if unshare -Ur true >/dev/null 2>&1; then
  echo "Aislamiento de Chromium: disponible."
else
  echo "Tu sistema restringe el aislamiento de Chromium. Para activarlo hay que hacer de root el archivo"
  echo "chrome-sandbox de la app (te pedirá tu contraseña)."
  if sudo chown root:root "${DEST}/chrome-sandbox" && sudo chmod 4755 "${DEST}/chrome-sandbox"; then
    echo "Aislamiento de Chromium: activado."
  else
    FLAGS="--no-sandbox"
    echo "Aviso: no se pudo activar; AI Cowork se abrirá sin el aislamiento de Chromium."
  fi
fi

BIN_DIR="$HOME/.local/bin"
LAUNCHER="${BIN_DIR}/ai-cowork"
mkdir -p "${BIN_DIR}"
cat > "${LAUNCHER}" <<EOF
#!/usr/bin/env bash
# Abre AI Cowork (lo creó scripts/instalar-linux.sh).
exec "${DEST}/ai-cowork" ${FLAGS} "\$@"
EOF
chmod +x "${LAUNCHER}"

ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/256x256/apps"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "${ICON_DIR}" "${APPS_DIR}"
cp build/icon-256.png "${ICON_DIR}/ai-cowork.png"
cat > "${APPS_DIR}/ai-cowork.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=AI Cowork
Comment=Tu equipo de agentes de IA trabajando juntos
Exec="${LAUNCHER}" %U
Icon=ai-cowork
Terminal=false
Categories=Development;
StartupWMClass=AI Cowork
EOF
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "${APPS_DIR}" >/dev/null 2>&1 || true

# Para «Buscar actualizaciones» en la app: dónde está el código (un clon de git de GitHub).
DATA="${XDG_CONFIG_HOME:-$HOME/.config}/AI Cowork"
mkdir -p "${DATA}"
printf '%s' "$(pwd)" > "${DATA}/source-dir.txt"

echo "Listo: AI Cowork está en el menú de aplicaciones y se abre también con la orden «ai-cowork»."
case ":${PATH}:" in
  *":${BIN_DIR}:"*) ;;
  *) echo "(Para usar la orden «ai-cowork» en la terminal, añade ${BIN_DIR} a tu PATH.)" ;;
esac
if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  setsid "${LAUNCHER}" >/dev/null 2>&1 < /dev/null &
fi
