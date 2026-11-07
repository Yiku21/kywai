#!/usr/bin/env bash
# Instala kywai en este Mac desde la carpeta del código: compila la app y la copia donde elijas.
# Uso (desde la carpeta descomprimida):   bash scripts/instalar-mac.sh   [carpeta de destino]
# Al abrirla por primera vez, el asistente te deja elegir agentes, instalar sus CLIs e iniciar sesión.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== kywai · instalación en macOS =="

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
  read -r -p "¿Dónde instalar kywai? [/Applications]: " DEST
  DEST="${DEST:-/Applications}"
fi
mkdir -p "${DEST}"

echo "Instalando dependencias (unos minutos la primera vez)…"
npm ci

case "$(uname -m)" in
  arm64) ARCH=--arm64 ;;
  *) ARCH=--x64 ;;
esac

echo "Compilando kywai…"
npx electron-vite build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir "$ARCH"

APP="$(find release -maxdepth 2 -name 'kywai.app' -type d | head -n 1)"
if [ -z "${APP}" ]; then
  echo "No se encontró la app compilada en release/."
  exit 1
fi

echo "Copiando a ${DEST}…"
rm -rf "${DEST}/kywai.app"
cp -R "${APP}" "${DEST}/"
# Antes se llamaba «AI Cowork.app»: se quita para no tener dos (los datos están aparte y no se tocan).
rm -rf "${DEST}/kywai.app"
# Sin certificado de Apple: firma con un certificado propio de este Mac (obligatoria en Mac con chip Apple; así
# macOS conserva los permisos de Privacidad al actualizar) y sin cuarentena.
bash scripts/firmar-mac.sh "${DEST}/kywai.app"
xattr -cr "${DEST}/kywai.app" 2>/dev/null || true

# Para «Buscar actualizaciones» en la app: dónde está el código (un clon de git de GitHub). La carpeta de datos
# conserva el nombre antiguo (src/main/dataDir.ts).
DATA="$HOME/Library/Application Support/AI Cowork"
mkdir -p "${DATA}"
printf '%s' "$(pwd)" > "${DATA}/source-dir.txt"

echo "Listo: ${DEST}/kywai.app"
open "${DEST}/kywai.app"
