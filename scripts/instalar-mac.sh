#!/usr/bin/env bash
# Instala AI Cowork en este Mac desde la carpeta del código: compila la app y la copia donde elijas.
# Uso (desde la carpeta descomprimida):   bash scripts/instalar-mac.sh   [carpeta de destino]
# Al abrirla por primera vez, el asistente te deja elegir agentes, instalar sus CLIs e iniciar sesión.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== AI Cowork · instalación en macOS =="

if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Instalando Node.js con Homebrew…"
    brew install node
  else
    echo "Falta Node.js. Instala Homebrew (https://brew.sh) o Node.js (https://nodejs.org) y vuelve a ejecutar este script."
    exit 1
  fi
fi

DEST="${1:-}"
if [ -z "${DEST}" ]; then
  read -r -p "¿Dónde instalar AI Cowork? [/Applications]: " DEST
  DEST="${DEST:-/Applications}"
fi
mkdir -p "${DEST}"

echo "Instalando dependencias (unos minutos la primera vez)…"
npm ci

case "$(uname -m)" in
  arm64) ARCH=--arm64 ;;
  *) ARCH=--x64 ;;
esac

echo "Compilando AI Cowork…"
npx electron-vite build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir "$ARCH"

APP="$(find release -maxdepth 2 -name 'AI Cowork.app' -type d | head -n 1)"
if [ -z "${APP}" ]; then
  echo "No se encontró la app compilada en release/."
  exit 1
fi

echo "Copiando a ${DEST}…"
rm -rf "${DEST}/AI Cowork.app"
cp -R "${APP}" "${DEST}/"
# Sin certificado de Apple: firma con un certificado propio de este Mac (obligatoria en Mac con chip Apple; así
# macOS conserva los permisos de Privacidad al actualizar) y sin cuarentena.
bash scripts/firmar-mac.sh "${DEST}/AI Cowork.app"
xattr -cr "${DEST}/AI Cowork.app" 2>/dev/null || true

# Para «Buscar actualizaciones» en la app: dónde está el código (un clon de git de GitHub).
DATA="$HOME/Library/Application Support/AI Cowork"
mkdir -p "${DATA}"
printf '%s' "$(pwd)" > "${DATA}/source-dir.txt"

echo "Listo: ${DEST}/AI Cowork.app"
open "${DEST}/AI Cowork.app"
