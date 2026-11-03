#!/usr/bin/env bash
# Firma AI Cowork.app con un certificado propio de este Mac (lo crea la primera vez).
# Con la firma «ad hoc» (`--sign -`) cada compilación es, para macOS, una app nueva: se pierden los permisos de
# Privacidad (Acceso total al disco, Automatización…) y vuelve el aviso del llavero tras cada actualización. Con un
# certificado fijo la app conserva su identidad entre versiones.
# El certificado vive en un llavero aparte, con contraseña aleatoria guardada junto a él, para firmar sin ventanas
# (la actualización se lanza a menudo desde el móvil, sin nadie delante del Mac). Si algo falla, firma ad hoc.
# Uso: firmar-mac.sh <ruta de la .app>
set -uo pipefail
APP="${1:?}"
NAME="AI Cowork (este Mac)"
DATA="$HOME/Library/Application Support/AI Cowork"
KC="${DATA}/firma-local.keychain-db"
PASS_FILE="${DATA}/firma-local.pass"

adhoc() {
  codesign --force --deep --sign - "${APP}" >/dev/null 2>&1 || true
}

# El openssl del sistema (LibreSSL) crea el .p12 en el formato antiguo que entiende `security import`; el de Homebrew
# (OpenSSL 3 o 4) usa AES por defecto y macOS lo rechaza, así que con él se pide el formato antiguo a mano.
if [ -x /usr/bin/openssl ]; then
  OPENSSL=/usr/bin/openssl
  P12_FORMAT=()
else
  OPENSSL=openssl
  P12_FORMAT=(-keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1)
fi

create_identity() {
  local tmp pass
  tmp="$(mktemp -d)" || return 1
  pass="$("${OPENSSL}" rand -hex 24)" || return 1
  mkdir -p "${DATA}"
  cat > "${tmp}/cert.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = ${NAME}
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF
  "${OPENSSL}" req -x509 -newkey rsa:2048 -nodes -days 7300 -config "${tmp}/cert.cnf" \
    -keyout "${tmp}/key.pem" -out "${tmp}/cert.pem" >/dev/null 2>&1 &&
    "${OPENSSL}" pkcs12 -export ${P12_FORMAT[@]+"${P12_FORMAT[@]}"} -inkey "${tmp}/key.pem" -in "${tmp}/cert.pem" -name "${NAME}" \
      -out "${tmp}/id.p12" -passout pass:aicowork >/dev/null 2>&1 &&
    rm -f "${KC}" &&
    security create-keychain -p "${pass}" "${KC}" >/dev/null 2>&1 &&
    security set-keychain-settings "${KC}" >/dev/null 2>&1 &&
    security import "${tmp}/id.p12" -k "${KC}" -P aicowork -T /usr/bin/codesign >/dev/null 2>&1 &&
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "${pass}" "${KC}" >/dev/null 2>&1 &&
    (umask 077 && printf '%s' "${pass}" > "${PASS_FILE}")
  local ok=$?
  rm -rf "${tmp}"
  return ${ok}
}

if [ ! -f "${KC}" ] || [ ! -f "${PASS_FILE}" ]; then
  if ! create_identity; then
    echo "No se pudo crear el certificado de firma de este Mac: se firma ad hoc (los permisos de macOS se pedirán de nuevo)."
    rm -f "${KC}" "${PASS_FILE}"
    adhoc
    exit 0
  fi
  echo "Creado el certificado «${NAME}» para firmar AI Cowork en este Mac."
fi

security unlock-keychain -p "$(cat "${PASS_FILE}")" "${KC}" >/dev/null 2>&1
# codesign solo encuentra identidades de los llaveros de la lista de búsqueda: se añade este mientras firma y luego
# se deja la lista como estaba.
OLD_LIST=()
while IFS= read -r line; do
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line#\"}"
  line="${line%\"}"
  [ -n "${line}" ] && [ "${line}" != "${KC}" ] && OLD_LIST+=("${line}")
done < <(security list-keychains -d user 2>/dev/null)
# Sin la lista actual no se toca (dejarla vacía quitaría el llavero de inicio de sesión).
if [ ${#OLD_LIST[@]} -gt 0 ]; then
  trap 'security list-keychains -d user -s "${OLD_LIST[@]}" >/dev/null 2>&1' EXIT
  security list-keychains -d user -s "${KC}" "${OLD_LIST[@]}" >/dev/null 2>&1
fi
# Por nombre, codesign solo acepta certificados de confianza; este es propio (no lo emite Apple), así que se elige
# por su huella SHA-1, que sí vale aunque macOS no confíe en él.
HASH="$(security find-identity -p codesigning "${KC}" 2>/dev/null | awk -v n="\"${NAME}\"" 'index($0, n) { print $2; exit }')"
if [ -n "${HASH}" ] && ERR="$(codesign --force --deep --keychain "${KC}" --sign "${HASH}" "${APP}" 2>&1)"; then
  echo "Firmada con «${NAME}»."
else
  echo "No se pudo firmar con «${NAME}»: se firma ad hoc (los permisos de macOS se pedirán de nuevo)."
  [ -n "${HASH}" ] || ERR="no se encontró el certificado en ${KC}"
  echo "  Motivo: ${ERR:-desconocido}" | tail -n 3
  adhoc
fi
