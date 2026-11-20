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

# Idioma de los mensajes: español, chino, hindi o inglés (el resto). Cada mensaje se escribe en ese orden de argumentos
# (msg "es" "en" "zh" "hi"); si falta el chino o el hindi, sale en inglés.
case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
  es*) LG=es ;;
  zh*) LG=zh ;;
  hi*) LG=hi ;;
  *) LG=en ;;
esac
msg() {
  case "$LG" in
    es) printf '%s\n' "$1" ;;
    zh) printf '%s\n' "${3:-$2}" ;;
    hi) printf '%s\n' "${4:-$2}" ;;
    *) printf '%s\n' "$2" ;;
  esac
}

# Colores solo si la salida es una terminal (en un registro o con NO_COLOR, texto plano).
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  B=$'\033[1m' V=$'\033[32m' R=$'\033[31m' A=$'\033[33m' G=$'\033[2m' N=$'\033[0m'
else
  B='' V='' R='' A='' G='' N=''
fi
# Pasos numerados que se ven igual que en la web (kywai.app, «Instálala en 3 pasos»): quien instala sabe por dónde va.
paso() { printf '\n%s' "$B"; msg "Paso $1 de 3: $2" "Step $1 of 3: $3" "第 $1 步（共 3 步）：${4:-$3}" "चरण $1/3: ${5:-$3}"; printf '%s' "$N"; }
nota() { printf '%s' "$G"; msg "   $1" "   $2" "   ${3:-$2}" "   ${4:-$2}"; printf '%s' "$N"; }
# Un fallo dice qué pasó y qué hacer, en sencillo, y recuerda que repetir la orden no rompe nada.
fallo() {
  printf '\n%s' "$R" >&2
  msg "✗ $1" "✗ $2" "✗ ${3:-$2}" "✗ ${4:-$2}" >&2
  printf '%s' "$N" >&2
  msg "  Puedes volver a pegar la misma orden cuando quieras: no rompe nada. Si sigue fallando, descarga el instalador en https://kywai.app/es/#download" \
    "  You can paste the same command again any time: it breaks nothing. If it keeps failing, download the installer at https://kywai.app/#download" "  你可以随时重新粘贴同一条命令，不会造成任何损坏。如果仍然失败，请在 https://kywai.app/zh/#download 下载安装程序" "  आप कभी भी वही कमांड फिर से चिपका सकते हैं: इससे कुछ नहीं टूटता। अगर फिर भी विफल हो, तो https://kywai.app/hi/#download से इंस्टॉलर डाउनलोड करें" >&2
  exit 1
}
# ¿Se puede preguntar? Con «curl | bash» la entrada es el propio script, así que se lee de /dev/tty.
preguntar_si() { # preguntar_si "pregunta es" "question en" "中文" "हिन्दी" → 0 si sí (Intro = sí)
  { : </dev/tty; } 2>/dev/null || return 0
  local r
  printf '%s' "$A"
  if [ "$LG" = es ]; then printf '%s [S/n] ' "$1"; else printf '%s [Y/n] ' "$(msg "$1" "$2" "${3:-}" "${4:-}")"; fi
  printf '%s' "$N"
  read -r r </dev/tty || r=""
  case "$r" in [nN]*) return 1 ;; *) return 0 ;; esac
}

printf '\n%s' "$B"
msg "kywai · instalador" "kywai · installer" "kywai · 安装程序" "kywai · इंस्टॉलर"
printf '%s' "$N"
msg "Esto tarda unos 2 minutos. No cierres esta ventana hasta que ponga «Listo»." \
  "This takes about 2 minutes. Do not close this window until it says “Done”." "大约需要 2 分钟。在显示“完成”之前请不要关闭此窗口。" "इसमें लगभग 2 मिनट लगते हैं। जब तक “हो गया” न दिखे, यह विंडो बंद न करें।"

command -v curl >/dev/null 2>&1 || fallo "Falta el programa «curl», que sirve para descargar. En Linux instálalo con el gestor de programas de tu sistema y vuelve a pegar la orden." \
  "The “curl” program (used to download) is missing. On Linux, install it with your system's software manager and paste the command again." "缺少用于下载的“curl”程序。在 Linux 上，请用系统的软件管理器安装它，然后重新粘贴命令。" "डाउनलोड के लिए ज़रूरी “curl” प्रोग्राम नहीं है। Linux पर इसे अपने सिस्टम के सॉफ़्टवेयर मैनेजर से इंस्टॉल करें और कमांड फिर से चिपकाएँ।"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

paso 1 "buscando la última versión y descargándola" "finding the latest version and downloading it" "查找最新版本并下载" "नया संस्करण ढूँढकर डाउनलोड कर रहे हैं"

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
[ -n "$version" ] || fallo "No se pudo conectar con GitHub para saber cuál es la última versión. Revisa tu conexión a internet y vuelve a probar en un momento." \
  "Could not reach GitHub to find the latest version. Check your internet connection and try again in a moment." "无法连接 GitHub 获取最新版本。请检查网络连接，稍后再试。" "नया संस्करण जानने के लिए GitHub से जुड़ नहीं पाए। अपना इंटरनेट कनेक्शन जाँचें और थोड़ी देर में फिर कोशिश करें।"
BASE="https://github.com/${REPO}/releases/download/v${version}"

bajar() { # bajar URL DESTINO
  nota "Descargando $(basename "$1") (la barra de abajo avanza hasta 100 %)…" "Downloading $(basename "$1") (the bar below goes up to 100%)…" "正在下载 $(basename "$1")（下方进度条会走到 100%）…" "$(basename "$1") डाउनलोड हो रहा है (नीचे की पट्टी 100% तक जाती है)…"
  curl -fL --retry 3 --progress-bar -o "$2" "$1" || fallo "No se pudo descargar kywai. Revisa tu conexión a internet y vuelve a pegar la orden." \
    "Could not download kywai. Check your internet connection and paste the command again." "无法下载 kywai。请检查网络连接，然后重新粘贴命令。" "kywai डाउनलोड नहीं हो पाया। अपना इंटरनेट कनेक्शन जाँचें और कमांड फिर से चिपकाएँ।"
}

instalar_mac() {
  local arch
  arch="$(uname -m)"
  # Un Terminal abierto con Rosetta dice x86_64 aunque el Mac sea Apple silicon.
  if [ "$arch" = "arm64" ] || [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then arch="arm64"; else arch="x64"; fi
  nota "kywai ${version} para tu Mac ($([ "$arch" = arm64 ] && echo 'Apple silicon' || echo Intel))" \
    "kywai ${version} for your Mac ($([ "$arch" = arm64 ] && echo 'Apple silicon' || echo Intel))" "适用于你的 Mac 的 kywai ${version}（$([ "$arch" = arm64 ] && echo 'Apple silicon' || echo Intel)）" "आपके Mac के लिए kywai ${version} ($([ "$arch" = arm64 ] && echo 'Apple silicon' || echo Intel))"

  # Para reemplazarla tiene que estar cerrada: se ofrece cerrarla en vez de obligar a empezar de nuevo.
  if pgrep -xq kywai 2>/dev/null; then
    if preguntar_si "kywai está abierta y hay que cerrarla para actualizarla. ¿La cierro yo?" "kywai is open and must be closed to update it. Shall I close it?" "kywai 正在运行，需要关闭后才能更新。要我帮你关闭吗？" "kywai खुला है और अपडेट के लिए इसे बंद करना होगा। क्या मैं इसे बंद कर दूँ?"; then
      osascript -e 'quit app "kywai"' >/dev/null 2>&1 || true
      for _ in $(seq 20); do pgrep -xq kywai 2>/dev/null || break; sleep 1; done
    fi
    if pgrep -xq kywai 2>/dev/null; then
      fallo "kywai sigue abierta. Ciérrala con ⌘ Comando + Q y vuelve a pegar la orden." \
        "kywai is still open. Quit it with ⌘ Command + Q and paste the command again." "kywai 仍在运行。请按 ⌘ Command + Q 退出，然后重新粘贴命令。" "kywai अब भी खुला है। ⌘ Command + Q से इसे बंद करें और कमांड फिर से चिपकाएँ।"
    fi
  fi

  bajar "${BASE}/kywai-${version}-${arch}.zip" "$TMP/kywai.zip"
  paso 2 "instalando kywai en Aplicaciones" "installing kywai in Applications" "正在将 kywai 安装到“应用程序”" "kywai को Applications में इंस्टॉल कर रहे हैं"
  ditto -x -k "$TMP/kywai.zip" "$TMP/app"
  [ -d "$TMP/app/kywai.app" ] || fallo "La descarga llegó incompleta. Vuelve a pegar la orden para bajarla de nuevo." "The download arrived incomplete. Paste the command again to download it again." "下载不完整。请重新粘贴命令再次下载。" "डाउनलोड अधूरा पहुँचा। फिर से डाउनलोड करने के लिए कमांड दोबारा चिपकाएँ।"

  local dest="/Applications"
  if [ ! -w "$dest" ]; then dest="$HOME/Applications"; mkdir -p "$dest"; fi
  rm -rf "$dest/kywai.app"
  ditto "$TMP/app/kywai.app" "$dest/kywai.app"
  # Sin firma de Apple todavía: quitar la cuarentena evita el aviso de «está dañada» o «no se puede abrir».
  xattr -cr "$dest/kywai.app" 2>/dev/null || true

  nota "Instalada en $dest/kywai.app" "Installed in $dest/kywai.app" "已安装到 $dest/kywai.app" "$dest/kywai.app में इंस्टॉल हो गया"
  if [ -d "/Applications/AI Cowork.app" ] || [ -d "$HOME/Applications/AI Cowork.app" ]; then
    msg "  Tienes también la app antigua «AI Cowork.app»: puedes borrarla, tus datos se conservan." \
      "  You also have the old «AI Cowork.app»: you can delete it, your data is kept." "  你还有旧版的 «AI Cowork.app»：可以删除它，你的数据会保留。" "  आपके पास पुराना «AI Cowork.app» भी है: आप इसे हटा सकते हैं, आपका डेटा बना रहता है।"
  fi
  paso 3 "abriendo kywai" "opening kywai" "正在打开 kywai" "kywai खोल रहे हैं"
  open "$dest/kywai.app" || true
  ABIERTA=1
}

hay_libfuse2() {
  { command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; } ||
    ls /usr/lib*/libfuse.so.2* /usr/lib/*/libfuse.so.2* /lib/*/libfuse.so.2* >/dev/null 2>&1
}

instalar_libfuse2() {
  # Solo con una terminal de verdad para pedir la contraseña (con «curl | bash» la entrada es el script, por eso /dev/tty).
  command -v sudo >/dev/null 2>&1 && { : </dev/tty; } 2>/dev/null || return 1
  nota "Falta una pieza pequeña del sistema (libfuse2) para que kywai arranque rápido. Se instala ahora y te pedirá la contraseña de este ordenador." \
    "A small system piece (libfuse2) is missing so kywai starts quickly. Installing it now: it will ask for this computer's password." "缺少一个让 kywai 快速启动的小系统组件（libfuse2）。现在安装：它会要求输入这台电脑的密码。" "kywai के जल्दी शुरू होने के लिए सिस्टम का एक छोटा हिस्सा (libfuse2) नहीं है। अभी इसे इंस्टॉल कर रहे हैं: यह इस कंप्यूटर का पासवर्ड माँगेगा।"
  nota "(La contraseña no se ve mientras la escribes: es normal. Escríbela y pulsa Intro.)" "(Your password does not show while you type it: that is normal. Type it and press Enter.)" "（输入密码时不会显示任何字符，这是正常的。输入后按回车。）" "(लिखते समय पासवर्ड नहीं दिखता: यह सामान्य है। इसे लिखें और Enter दबाएँ।)"
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
      "There is no kywai build for this processor ($(uname -m)). You can build it: bash scripts/instalar-linux.sh" "此处理器（$(uname -m)）没有 kywai 版本。你可以自行编译：bash scripts/instalar-linux.sh" "इस प्रोसेसर ($(uname -m)) के लिए kywai का संस्करण नहीं है। आप इसे ख़ुद बना सकते हैं: bash scripts/instalar-linux.sh" ;;
  esac
  nota "kywai ${version} para Linux (${arch})" "kywai ${version} for Linux (${arch})" "适用于 Linux（${arch}）的 kywai ${version}" "Linux (${arch}) के लिए kywai ${version}"

  local data="${XDG_DATA_HOME:-$HOME/.local/share}"
  local dir="$data/kywai" bin="$HOME/.local/bin"
  mkdir -p "$dir" "$bin" "$data/applications" "$data/icons/hicolor/256x256/apps"

  bajar "${BASE}/${file}" "$TMP/kywai.AppImage"
  chmod +x "$TMP/kywai.AppImage"
  # Nombre fijo: así la actualización automática de la app reemplaza este mismo archivo.
  mv -f "$TMP/kywai.AppImage" "$dir/kywai.AppImage"
  curl -fsSL -o "$data/icons/hicolor/256x256/apps/kywai.png" "https://raw.githubusercontent.com/${REPO}/master/build/icon-256.png" 2>/dev/null || true

  paso 2 "instalando kywai y añadiéndola al menú de aplicaciones" "installing kywai and adding it to the applications menu" "正在安装 kywai 并添加到应用菜单" "kywai इंस्टॉल करके ऐप्लिकेशन मेनू में जोड़ रहे हैं"
  # Sin libfuse2 el AppImage no se monta; si no se puede instalar, se abre extrayéndose cada vez (más lento al abrir).
  local env=""
  if ! hay_libfuse2; then
    if ! instalar_libfuse2 || ! hay_libfuse2; then
      env="APPIMAGE_EXTRACT_AND_RUN=1 "
      nota "No se pudo instalar libfuse2, pero no pasa nada: kywai se abrirá igual, solo tarda un poco más en arrancar." \
        "libfuse2 could not be installed, but that is fine: kywai will still open, it just takes a little longer to start." "无法安装 libfuse2，但没关系：kywai 仍然可以打开，只是启动稍慢一些。" "libfuse2 इंस्टॉल नहीं हो पाया, लेकिन कोई बात नहीं: kywai फिर भी खुलेगा, बस शुरू होने में थोड़ा ज़्यादा समय लगेगा।"
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

  nota "Está en el menú de aplicaciones (y se abre también con la orden «kywai»)." \
    "It is in your applications menu (and also opens with the «kywai» command)." "它已在应用菜单中（也可以用 «kywai» 命令打开）。" "यह आपके ऐप्लिकेशन मेनू में है (और «kywai» कमांड से भी खुलता है)।"
  case ":${PATH}:" in
    *":$bin:"*) ;;
    *) nota "(Para usar «kywai» en la terminal, añade $bin a tu PATH.)" "(To use «kywai» in the terminal, add $bin to your PATH.)" "（要在终端中使用 «kywai»，请将 $bin 添加到 PATH。）" "(टर्मिनल में «kywai» इस्तेमाल करने के लिए $bin को अपने PATH में जोड़ें।)" ;;
  esac
  if [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    paso 3 "abriendo kywai" "opening kywai" "正在打开 kywai" "kywai खोल रहे हैं"
    nohup "$bin/kywai" >/dev/null 2>&1 &
    ABIERTA=1
  fi
}

ABIERTA=0
case "$(uname -s)" in
  Darwin) instalar_mac ;;
  Linux) instalar_linux ;;
  *) fallo "Este instalador es para macOS y Linux. En Windows usa: irm https://kywai.app/install.ps1 | iex" \
    "This installer is for macOS and Linux. On Windows use: irm https://kywai.app/install.ps1 | iex" "此安装程序适用于 macOS 和 Linux。在 Windows 上请使用：irm https://kywai.app/install.ps1 | iex" "यह इंस्टॉलर macOS और Linux के लिए है। Windows पर इस्तेमाल करें: irm https://kywai.app/install.ps1 | iex" ;;
esac
printf '\n%s' "$V$B"
msg "✓ Listo: kywai está instalada." "✓ Done: kywai is installed." "✓ 完成：kywai 已安装。" "✓ हो गया: kywai इंस्टॉल हो गया है।"
printf '%s' "$N"
if [ "$ABIERTA" = 1 ]; then
  msg "  Ya puedes cerrar esta ventana. kywai se está abriendo (la primera vez tarda unos segundos)." \
    "  You can close this window now. kywai is opening (the first time takes a few seconds)." "  现在可以关闭此窗口。kywai 正在打开（第一次需要几秒钟）。" "  अब आप यह विंडो बंद कर सकते हैं। kywai खुल रहा है (पहली बार कुछ सेकंड लगते हैं)।"
else
  msg "  Ábrela desde el menú de aplicaciones. Ya puedes cerrar esta ventana." \
    "  Open it from your applications menu. You can close this window now." "  请从应用菜单打开它。现在可以关闭此窗口。" "  इसे अपने ऐप्लिकेशन मेनू से खोलें। अब आप यह विंडो बंद कर सकते हैं।"
fi
msg "  Al abrirse, un asistente te guía con botones para instalar los agentes de IA y conectarlos." \
  "  When it opens, an assistant guides you with buttons to install the AI agents and connect them." "  打开后，助手会用按钮引导你安装并连接 AI 智能体。" "  खुलने पर एक सहायक बटनों से AI एजेंट इंस्टॉल करने और जोड़ने में आपका मार्गदर्शन करता है।"
