#!/usr/bin/env bash
# Lo lanza AI Cowork al actualizarse en Linux: espera a que la app se cierre, sustituye la carpeta instalada por la
# recién compilada y la vuelve a abrir con la misma orden con la que estaba abierta.
# Uso: actualizar-linux.sh <pid de la app> <carpeta instalada> <carpeta nueva> <orden para abrirla> [opciones…]
set -uo pipefail
PID="${1:?}"
CURRENT="${2:?}"
NEW="${3:?}"
shift 3

for _ in $(seq 1 120); do
  kill -0 "${PID}" 2>/dev/null || break
  sleep 0.5
done

if [ -x "${NEW}/ai-cowork" ] && [ -x "${CURRENT}/ai-cowork" ]; then
  # Si el instalador hizo de root el ayudante del aislamiento de Chromium (chrome-sandbox), se conserva el de antes:
  # copiarlo le quitaría ese permiso y la app no abriría.
  KEEP=""
  if [ -u "${CURRENT}/chrome-sandbox" ]; then
    KEEP="$(mktemp -d)"
    mv "${CURRENT}/chrome-sandbox" "${KEEP}/chrome-sandbox"
  fi
  rm -rf "${CURRENT}"
  cp -R "${NEW}" "${CURRENT}"
  if [ -n "${KEEP}" ]; then
    mv -f "${KEEP}/chrome-sandbox" "${CURRENT}/chrome-sandbox"
    rmdir "${KEEP}" 2>/dev/null || true
  fi
fi

if [ "$#" -gt 0 ]; then
  setsid "$@" >/dev/null 2>&1 < /dev/null &
fi
