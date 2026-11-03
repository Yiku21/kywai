#!/usr/bin/env bash
# Lo lanza AI Cowork al actualizarse en macOS: espera a que la app se cierre, sustituye la .app por la
# recién compilada y la vuelve a abrir.
# Uso: actualizar-mac.sh <pid de la app> <ruta de la .app instalada> <ruta de la .app nueva>
set -uo pipefail
PID="${1:?}"
CURRENT="${2:?}"
NEW="${3:?}"

for _ in $(seq 1 120); do
  kill -0 "${PID}" 2>/dev/null || break
  sleep 0.5
done

if [ -d "${NEW}" ]; then
  rm -rf "${CURRENT}"
  cp -R "${NEW}" "${CURRENT}"
  bash "$(dirname "$0")/firmar-mac.sh" "${CURRENT}"
  xattr -cr "${CURRENT}" 2>/dev/null || true
fi
open "${CURRENT}"
