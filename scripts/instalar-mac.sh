#!/usr/bin/env bash
# Instala kywai en este Mac desde la carpeta del código: compila la app y la copia donde elijas.
# Uso (desde la carpeta descomprimida):   bash scripts/instalar-mac.sh   [carpeta de destino]
# Al abrirla por primera vez, el asistente te deja elegir agentes, instalar sus CLIs e iniciar sesión.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== kywai · instalación en macOS =="

# Node.js de kywai (el que deja el asistente de la app sin Homebrew), si ya está.
[ -x "$HOME/.local/share/kywai/node/bin/node" ] && export PATH="$HOME/.local/share/kywai/node/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Instalando Node.js con Homebrew…"
    brew install node
  else
    # Sin Homebrew: el Node.js oficial de nodejs.org para este procesador (Apple silicon o Intel), en la carpeta del
    # usuario y sin contraseña. Node 24 pide macOS 13.5 o más nuevo; en uno más viejo, Node 22.
    A=x64; { [ "$(uname -m)" = arm64 ] || [ "$(sysctl -in sysctl.proc_translated 2>/dev/null)" = 1 ]; } && A=arm64
    L=22; [ "$(sw_vers -productVersion | cut -d. -f1)" -ge 14 ] && L=24
    U="https://nodejs.org/dist/latest-v$L.x"
    S="$(curl -fsSL "$U/SHASUMS256.txt" | grep " node-v[0-9.]*-darwin-$A.tar.gz$")"
    F="${S##* }"
    D="$HOME/.local/share/kywai"
    echo "Instalando Node.js ($F)…"
    mkdir -p "$D/node"
    curl -fL --retry 3 -o "$D/node.tar.gz" "$U/$F"
    if [ "$(shasum -a 256 "$D/node.tar.gz" | cut -d' ' -f1)" != "${S%% *}" ]; then
      echo "La descarga de Node.js no coincide con su SHA-256. Vuelve a probar o instálalo desde https://nodejs.org"
      rm -f "$D/node.tar.gz"
      exit 1
    fi
    tar -xzf "$D/node.tar.gz" -C "$D/node" --strip-components 1
    rm -f "$D/node.tar.gz"
    grep -qs '.local/share/kywai/node/bin' "$HOME/.zprofile" ||
      printf '\n# Node.js de kywai\nexport PATH="$HOME/.local/share/kywai/node/bin:$PATH"\n' >> "$HOME/.zprofile"
    export PATH="$D/node/bin:$PATH"
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
