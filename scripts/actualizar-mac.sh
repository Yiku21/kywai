#!/usr/bin/env bash
# Lo lanza kywai al actualizarse en macOS: espera a que la app se cierre, sustituye la .app por la
# recién compilada y la vuelve a abrir.
# Uso: actualizar-mac.sh <pid de la app> <ruta de la .app instalada> <ruta de la .app nueva>
# La app se llamaba «AI Cowork.app» y ahora se compila como «kywai.app». Una versión antigua que se actualiza pasa
# la ruta vieja de la compilación (y puede quedar allí una «AI Cowork.app» de antes): si en esa carpeta está
# kywai.app, se usa esa. La nueva queda junto a la instalada con su nombre nuevo y la vieja se quita (la carpeta de
# datos no se toca).
set -uo pipefail
PID="${1:?}"
CURRENT="${2:?}"
NEW="${3:?}"

for _ in $(seq 1 120); do
  kill -0 "${PID}" 2>/dev/null || break
  sleep 0.5
done

if [ -d "$(dirname "${NEW}")/kywai.app" ]; then
  NEW="$(dirname "${NEW}")/kywai.app"
fi

if [ -d "${NEW}" ]; then
  TARGET="$(dirname "${CURRENT}")/$(basename "${NEW}")"
  rm -rf "${TARGET}"
  if cp -R "${NEW}" "${TARGET}"; then
    bash "$(dirname "$0")/firmar-mac.sh" "${TARGET}"
    xattr -cr "${TARGET}" 2>/dev/null || true
    if [ "${TARGET}" != "${CURRENT}" ]; then
      rm -rf "${CURRENT}"
    fi
    CURRENT="${TARGET}"
  fi
fi
open "${CURRENT}"
