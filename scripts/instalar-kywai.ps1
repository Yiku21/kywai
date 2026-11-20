# Instala (o actualiza) kywai en Windows 10/11 con una sola orden en PowerShell:
#
#   irm https://kywai.app/install.ps1 | iex
#
# Baja de la \u00faltima Release de GitHub (Yiku21/kywai) el instalador kywai-Setup-<versi\u00f3n>.exe, lo ejecuta en silencio
# (para tu usuario, sin pedir permisos de administrador; si ya estaba instalada, se actualiza en la misma carpeta) y
# abre la app. No toca la carpeta de datos (%APPDATA%\AI Cowork). La web kywai.app sirve este mismo archivo
# (web/build.mjs lo copia como install.ps1). Opcional: $env:KYWAI_VERSION = '0.1.252' para una versi\u00f3n concreta.

& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue' # la barra de progreso de Invoke-WebRequest hace la descarga muy lenta
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $repo = 'Yiku21/kywai'
  # Idioma: espa\u00f1ol, chino, hindi o ingl\u00e9s (el resto). El hindi solo en Windows Terminal: la consola cl\u00e1sica
  # no sabe unir las letras devanagari y saldr\u00eda ilegible.
  $ui = (Get-UICulture).Name
  $lang = 'en'
  if ($ui -like 'es*') { $lang = 'es' } elseif ($ui -like 'zh*') { $lang = 'zh' } elseif ($ui -like 'hi*' -and $env:WT_SESSION) { $lang = 'hi' }
  # El archivo es solo ASCII (PowerShell 5.1 puede leerlo con otra codificaci\u00f3n): los acentos, el chino y el hindi
  # van como \u00e1 y se convierten aqu\u00ed. Cada texto va en orden espa\u00f1ol, ingl\u00e9s, chino, hindi; si falta uno, ingl\u00e9s.
  function Txt($esText, $enText, $zhText, $hiText) {
    $t = $enText
    if ($lang -eq 'es') { $t = $esText } elseif ($lang -eq 'zh' -and $zhText) { $t = $zhText } elseif ($lang -eq 'hi' -and $hiText) { $t = $hiText }
    [regex]::Unescape($t)
  }
  function Msg($esText, $enText, $zhText, $hiText, $color) {
    if ($color) { Write-Host (Txt $esText $enText $zhText $hiText) -ForegroundColor $color } else { Write-Host (Txt $esText $enText $zhText $hiText) }
  }
  # Pasos numerados como en la web (kywai.app, \u00abInst\u00e1lala en 3 pasos\u00bb): quien instala sabe por d\u00f3nde va.
  function Paso($n, $esText, $enText, $zhText, $hiText) {
    Write-Host ''
    Msg "Paso $n de 3: $esText" "Step $n of 3: $enText" "\u7b2c $n \u6b65\uff08\u5171 3 \u6b65\uff09\uff1a$zhText" "\u091a\u0930\u0923 $n/3: $hiText" 'Cyan'
  }
  function Nota($esText, $enText, $zhText, $hiText) { Msg "   $esText" "   $enText" "   $zhText" "   $hiText" 'DarkGray' }
  # Un fallo dice qu\u00e9 pas\u00f3 y qu\u00e9 hacer, en sencillo, y recuerda que repetir la orden no rompe nada.
  function Fallo($esText, $enText, $zhText, $hiText) {
    Write-Host ''
    Msg "x $esText" "x $enText" "x $zhText" "x $hiText" 'Red'
    Msg '  Puedes volver a pegar la misma orden cuando quieras: no rompe nada. Si sigue fallando, descarga el instalador en https://kywai.app/es/#download' `
      '  You can paste the same command again any time: it breaks nothing. If it keeps failing, download the installer at https://kywai.app/#download' '  \u4f60\u53ef\u4ee5\u968f\u65f6\u91cd\u65b0\u7c98\u8d34\u540c\u4e00\u6761\u547d\u4ee4\uff0c\u4e0d\u4f1a\u9020\u6210\u4efb\u4f55\u635f\u574f\u3002\u5982\u679c\u4ecd\u7136\u5931\u8d25\uff0c\u8bf7\u5728 https://kywai.app/zh/#download \u4e0b\u8f7d\u5b89\u88c5\u7a0b\u5e8f' '  \u0906\u092a \u0915\u092d\u0940 \u092d\u0940 \u0935\u0939\u0940 \u0915\u092e\u093e\u0902\u0921 \u092b\u093f\u0930 \u0938\u0947 \u091a\u093f\u092a\u0915\u093e \u0938\u0915\u0924\u0947 \u0939\u0948\u0902: \u0907\u0938\u0938\u0947 \u0915\u0941\u091b \u0928\u0939\u0940\u0902 \u091f\u0942\u091f\u0924\u093e\u0964 \u0905\u0917\u0930 \u092b\u093f\u0930 \u092d\u0940 \u0935\u093f\u092b\u0932 \u0939\u094b, \u0924\u094b https://kywai.app/hi/#download \u0938\u0947 \u0907\u0902\u0938\u094d\u091f\u0949\u0932\u0930 \u0921\u093e\u0909\u0928\u0932\u094b\u0921 \u0915\u0930\u0947\u0902'
    throw 'kywai'
  }

  Write-Host ''
  Msg 'kywai - instalador' 'kywai - installer' 'kywai - \u5b89\u88c5\u7a0b\u5e8f' 'kywai - \u0907\u0902\u0938\u094d\u091f\u0949\u0932\u0930' 'White'
  Msg 'Esto tarda unos 2 minutos. No cierres esta ventana hasta que ponga \u00abListo\u00bb.' `
    'This takes about 2 minutes. Do not close this window until it says "Done".' '\u5927\u7ea6\u9700\u8981 2 \u5206\u949f\u3002\u5728\u663e\u793a\u201c\u5b8c\u6210\u201d\u4e4b\u524d\u8bf7\u4e0d\u8981\u5173\u95ed\u6b64\u7a97\u53e3\u3002' '\u0907\u0938\u092e\u0947\u0902 \u0932\u0917\u092d\u0917 2 \u092e\u093f\u0928\u091f \u0932\u0917\u0924\u0947 \u0939\u0948\u0902\u0964 \u091c\u092c \u0924\u0915 \u201c\u0939\u094b \u0917\u092f\u093e\u201d \u0928 \u0926\u093f\u0916\u0947, \u092f\u0939 \u0935\u093f\u0902\u0921\u094b \u092c\u0902\u0926 \u0928 \u0915\u0930\u0947\u0902\u0964'

  try {
    Paso 1 'buscando la \u00faltima versi\u00f3n y descarg\u00e1ndola' 'finding the latest version and downloading it' '\u67e5\u627e\u6700\u65b0\u7248\u672c\u5e76\u4e0b\u8f7d' '\u0928\u092f\u093e \u0938\u0902\u0938\u094d\u0915\u0930\u0923 \u0922\u0942\u0901\u0922\u0915\u0930 \u0921\u093e\u0909\u0928\u0932\u094b\u0921 \u0915\u0930 \u0930\u0939\u0947 \u0939\u0948\u0902'
    # Versi\u00f3n: la API de GitHub; si no responde (l\u00edmite de peticiones), la redirecci\u00f3n de /releases/latest.
    $version = $env:KYWAI_VERSION
    if ($version) { $version = $version.TrimStart('v') }
    if (-not $version) {
      try {
        $rel = Invoke-RestMethod -UseBasicParsing -Headers @{ Accept = 'application/vnd.github+json' } "https://api.github.com/repos/$repo/releases/latest"
        $version = $rel.tag_name.TrimStart('v')
      } catch {
        try {
          $r = Invoke-WebRequest -UseBasicParsing -Method Head "https://github.com/$repo/releases/latest"
          $final = $r.BaseResponse.ResponseUri.AbsoluteUri
          if (-not $final) { $final = $r.BaseResponse.RequestMessage.RequestUri.AbsoluteUri }
          if ($final -match '/tag/v?([^/]+)$') { $version = $Matches[1] }
        } catch {}
      }
    }
    if (-not $version) {
      Fallo 'No se pudo conectar con GitHub para saber cu\u00e1l es la \u00faltima versi\u00f3n. Revisa tu conexi\u00f3n a internet y vuelve a probar en un momento.' `
        'Could not reach GitHub to find the latest version. Check your internet connection and try again in a moment.' '\u65e0\u6cd5\u8fde\u63a5 GitHub \u83b7\u53d6\u6700\u65b0\u7248\u672c\u3002\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5\uff0c\u7a0d\u540e\u518d\u8bd5\u3002' '\u0928\u092f\u093e \u0938\u0902\u0938\u094d\u0915\u0930\u0923 \u091c\u093e\u0928\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f GitHub \u0938\u0947 \u091c\u0941\u0921\u093c \u0928\u0939\u0940\u0902 \u092a\u093e\u090f\u0964 \u0905\u092a\u0928\u093e \u0907\u0902\u091f\u0930\u0928\u0947\u091f \u0915\u0928\u0947\u0915\u094d\u0936\u0928 \u091c\u093e\u0901\u091a\u0947\u0902 \u0914\u0930 \u0925\u094b\u0921\u093c\u0940 \u0926\u0947\u0930 \u092e\u0947\u0902 \u092b\u093f\u0930 \u0915\u094b\u0936\u093f\u0936 \u0915\u0930\u0947\u0902\u0964'

    }
    Nota "kywai $version para Windows" "kywai $version for Windows" "\u9002\u7528\u4e8e Windows \u7684 kywai $version" "Windows \u0915\u0947 \u0932\u093f\u090f kywai $version"

    # Para reemplazarla tiene que estar cerrada: se ofrece cerrarla en vez de obligar a empezar de nuevo.
    if (Get-Process -Name kywai -ErrorAction SilentlyContinue) {
      $r = Read-Host (Txt 'kywai est\u00e1 abierta y hay que cerrarla para actualizarla. \u00bfLa cierro yo? [S/n]' 'kywai is open and must be closed to update it. Shall I close it? [Y/n]' 'kywai \u6b63\u5728\u8fd0\u884c\uff0c\u9700\u8981\u5173\u95ed\u540e\u624d\u80fd\u66f4\u65b0\u3002\u8981\u6211\u5e2e\u4f60\u5173\u95ed\u5417\uff1f[Y/n]' 'kywai \u0916\u0941\u0932\u093e \u0939\u0948 \u0914\u0930 \u0905\u092a\u0921\u0947\u091f \u0915\u0947 \u0932\u093f\u090f \u0907\u0938\u0947 \u092c\u0902\u0926 \u0915\u0930\u0928\u093e \u0939\u094b\u0917\u093e\u0964 \u0915\u094d\u092f\u093e \u092e\u0948\u0902 \u0907\u0938\u0947 \u092c\u0902\u0926 \u0915\u0930 \u0926\u0942\u0901? [Y/n]')
      if ($r -notmatch '^[nN]') {
        Get-Process -Name kywai -ErrorAction SilentlyContinue | ForEach-Object { [void]$_.CloseMainWindow() }
        for ($i = 0; $i -lt 10 -and (Get-Process -Name kywai -ErrorAction SilentlyContinue); $i++) { Start-Sleep 1 }
        # Sigue en la bandeja (junto al reloj): se cierra del todo.
        Get-Process -Name kywai -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep 2
      }
      if (Get-Process -Name kywai -ErrorAction SilentlyContinue) {
        Fallo 'kywai sigue abierta. Ci\u00e9rrala (tambi\u00e9n desde su icono junto al reloj: clic derecho, Salir) y vuelve a pegar la orden.' `
          'kywai is still open. Quit it (also from its icon next to the clock: right-click, Quit) and paste the command again.' 'kywai \u4ecd\u5728\u8fd0\u884c\u3002\u8bf7\u9000\u51fa\u5b83\uff08\u4e5f\u53ef\u5728\u65f6\u949f\u65c1\u7684\u56fe\u6807\u4e0a\u53f3\u952e\uff0c\u9009\u62e9\u9000\u51fa\uff09\uff0c\u7136\u540e\u91cd\u65b0\u7c98\u8d34\u547d\u4ee4\u3002' 'kywai \u0905\u092c \u092d\u0940 \u0916\u0941\u0932\u093e \u0939\u0948\u0964 \u0907\u0938\u0947 \u092c\u0902\u0926 \u0915\u0930\u0947\u0902 (\u0918\u0921\u093c\u0940 \u0915\u0947 \u092a\u093e\u0938 \u0935\u093e\u0932\u0947 \u0906\u0907\u0915\u0928 \u0938\u0947 \u092d\u0940: \u0930\u093e\u0907\u091f-\u0915\u094d\u0932\u093f\u0915, Quit) \u0914\u0930 \u0915\u092e\u093e\u0902\u0921 \u092b\u093f\u0930 \u0938\u0947 \u091a\u093f\u092a\u0915\u093e\u090f\u0901\u0964'
      }
    }

    $name = "kywai-Setup-$version.exe"
    $exe = Join-Path $env:TEMP $name
    Nota "Descargando $name (unos 100 MB; puede parecer parado, es normal)..." "Downloading $name (about 100 MB; it may look stuck, that is normal)..." "\u6b63\u5728\u4e0b\u8f7d $name\uff08\u7ea6 100 MB\uff1b\u770b\u8d77\u6765\u50cf\u5361\u4f4f\u4e86\uff0c\u8fd9\u662f\u6b63\u5e38\u7684\uff09..." "$name \u0921\u093e\u0909\u0928\u0932\u094b\u0921 \u0939\u094b \u0930\u0939\u093e \u0939\u0948 (\u0932\u0917\u092d\u0917 100 MB; \u0930\u0941\u0915\u093e \u0939\u0941\u0906 \u0932\u0917 \u0938\u0915\u0924\u093e \u0939\u0948, \u092f\u0939 \u0938\u093e\u092e\u093e\u0928\u094d\u092f \u0939\u0948)..."
    try {
      Invoke-WebRequest -UseBasicParsing "https://github.com/$repo/releases/download/v$version/$name" -OutFile $exe
    } catch {
      Fallo 'No se pudo descargar kywai. Revisa tu conexi\u00f3n a internet y vuelve a pegar la orden.' 'Could not download kywai. Check your internet connection and paste the command again.' '\u65e0\u6cd5\u4e0b\u8f7d kywai\u3002\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5\uff0c\u7136\u540e\u91cd\u65b0\u7c98\u8d34\u547d\u4ee4\u3002' 'kywai \u0921\u093e\u0909\u0928\u0932\u094b\u0921 \u0928\u0939\u0940\u0902 \u0939\u094b \u092a\u093e\u092f\u093e\u0964 \u0905\u092a\u0928\u093e \u0907\u0902\u091f\u0930\u0928\u0947\u091f \u0915\u0928\u0947\u0915\u094d\u0936\u0928 \u091c\u093e\u0901\u091a\u0947\u0902 \u0914\u0930 \u0915\u092e\u093e\u0902\u0921 \u092b\u093f\u0930 \u0938\u0947 \u091a\u093f\u092a\u0915\u093e\u090f\u0901\u0964'
    }

    Paso 2 'instalando kywai (si Windows pregunta algo, pulsa S\u00ed)' 'installing kywai (if Windows asks anything, click Yes)' '\u6b63\u5728\u5b89\u88c5 kywai\uff08\u5982\u679c Windows \u8be2\u95ee\uff0c\u8bf7\u70b9\u51fb\u201c\u662f\u201d\uff09' 'kywai \u0907\u0902\u0938\u094d\u091f\u0949\u0932 \u0939\u094b \u0930\u0939\u093e \u0939\u0948 (\u0905\u0917\u0930 Windows \u0915\u0941\u091b \u092a\u0942\u091b\u0947, \u0924\u094b Yes \u092a\u0930 \u0915\u094d\u0932\u093f\u0915 \u0915\u0930\u0947\u0902)'
    $p = Start-Process -FilePath $exe -ArgumentList '/S' -Wait -PassThru
    Remove-Item $exe -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0) {
      Fallo "La instalaci\u00f3n no termin\u00f3 bien (c\u00f3digo $($p.ExitCode)). Cierra kywai si est\u00e1 abierta y vuelve a pegar la orden." `
        "The installation did not finish (code $($p.ExitCode)). Quit kywai if it is open and paste the command again." "\u5b89\u88c5\u672a\u6b63\u5e38\u5b8c\u6210\uff08\u4ee3\u7801 $($p.ExitCode)\uff09\u3002\u5982\u679c kywai \u6b63\u5728\u8fd0\u884c\u8bf7\u9000\u51fa\uff0c\u7136\u540e\u91cd\u65b0\u7c98\u8d34\u547d\u4ee4\u3002" "\u0907\u0902\u0938\u094d\u091f\u0949\u0932\u0947\u0936\u0928 \u0920\u0940\u0915 \u0938\u0947 \u092a\u0942\u0930\u093e \u0928\u0939\u0940\u0902 \u0939\u0941\u0906 (\u0915\u094b\u0921 $($p.ExitCode))\u0964 \u0905\u0917\u0930 kywai \u0916\u0941\u0932\u093e \u0939\u0948 \u0924\u094b \u0909\u0938\u0947 \u092c\u0902\u0926 \u0915\u0930\u0947\u0902 \u0914\u0930 \u0915\u092e\u093e\u0902\u0921 \u092b\u093f\u0930 \u0938\u0947 \u091a\u093f\u092a\u0915\u093e\u090f\u0901\u0964"
    }

    # D\u00f3nde qued\u00f3: la carpeta que guard\u00f3 el instalador en el registro (la misma si ya estaba instalada), o la de siempre.
    $app = $null
    $keys = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    foreach ($k in Get-ItemProperty $keys -ErrorAction SilentlyContinue) {
      if ($k.DisplayName -match '^(kywai|AI Cowork)' -and $k.InstallLocation) {
        $c = Join-Path $k.InstallLocation 'kywai.exe'
        if (Test-Path $c) { $app = $c; break }
      }
    }
    if (-not $app) { $c = Join-Path $env:LOCALAPPDATA 'Programs\kywai\kywai.exe'; if (Test-Path $c) { $app = $c } }

    Nota 'Con acceso directo en el Escritorio y en el men\u00fa Inicio.' 'With shortcuts on the Desktop and in the Start menu.' '\u5df2\u5728\u684c\u9762\u548c\u5f00\u59cb\u83dc\u5355\u4e2d\u521b\u5efa\u5feb\u6377\u65b9\u5f0f\u3002' '\u0921\u0947\u0938\u094d\u0915\u091f\u0949\u092a \u0914\u0930 Start \u092e\u0947\u0928\u0942 \u092e\u0947\u0902 \u0936\u0949\u0930\u094d\u091f\u0915\u091f \u0915\u0947 \u0938\u093e\u0925\u0964'
    if ($app) {
      Paso 3 'abriendo kywai' 'opening kywai' '\u6b63\u5728\u6253\u5f00 kywai' 'kywai \u0916\u094b\u0932 \u0930\u0939\u0947 \u0939\u0948\u0902'
      Start-Process -FilePath $app
    }
    Write-Host ''
    Msg 'OK  Listo: kywai est\u00e1 instalada.' 'OK  Done: kywai is installed.' 'OK  \u5b8c\u6210\uff1akywai \u5df2\u5b89\u88c5\u3002' 'OK  \u0939\u094b \u0917\u092f\u093e: kywai \u0907\u0902\u0938\u094d\u091f\u0949\u0932 \u0939\u094b \u0917\u092f\u093e \u0939\u0948\u0964' 'Green'
    if ($app) {
      Msg '    Ya puedes cerrar esta ventana. kywai se est\u00e1 abriendo (la primera vez tarda unos segundos).' `
        '    You can close this window now. kywai is opening (the first time takes a few seconds).' '    \u73b0\u5728\u53ef\u4ee5\u5173\u95ed\u6b64\u7a97\u53e3\u3002kywai \u6b63\u5728\u6253\u5f00\uff08\u7b2c\u4e00\u6b21\u9700\u8981\u51e0\u79d2\u949f\uff09\u3002' '    \u0905\u092c \u0906\u092a \u092f\u0939 \u0935\u093f\u0902\u0921\u094b \u092c\u0902\u0926 \u0915\u0930 \u0938\u0915\u0924\u0947 \u0939\u0948\u0902\u0964 kywai \u0916\u0941\u0932 \u0930\u0939\u093e \u0939\u0948 (\u092a\u0939\u0932\u0940 \u092c\u093e\u0930 \u0915\u0941\u091b \u0938\u0947\u0915\u0902\u0921 \u0932\u0917\u0924\u0947 \u0939\u0948\u0902)\u0964'
    } else {
      Msg '    \u00c1brela desde el acceso directo del Escritorio. Ya puedes cerrar esta ventana.' '    Open it from the Desktop shortcut. You can close this window now.' '    \u8bf7\u4ece\u684c\u9762\u5feb\u6377\u65b9\u5f0f\u6253\u5f00\u5b83\u3002\u73b0\u5728\u53ef\u4ee5\u5173\u95ed\u6b64\u7a97\u53e3\u3002' '    \u0907\u0938\u0947 \u0921\u0947\u0938\u094d\u0915\u091f\u0949\u092a \u0936\u0949\u0930\u094d\u091f\u0915\u091f \u0938\u0947 \u0916\u094b\u0932\u0947\u0902\u0964 \u0905\u092c \u0906\u092a \u092f\u0939 \u0935\u093f\u0902\u0921\u094b \u092c\u0902\u0926 \u0915\u0930 \u0938\u0915\u0924\u0947 \u0939\u0948\u0902\u0964'
    }
    Msg '    Al abrirse, un asistente te gu\u00eda con botones para instalar los agentes de IA y conectarlos.' `
      '    When it opens, an assistant guides you with buttons to install the AI agents and connect them.' '    \u6253\u5f00\u540e\uff0c\u52a9\u624b\u4f1a\u7528\u6309\u94ae\u5f15\u5bfc\u4f60\u5b89\u88c5\u5e76\u8fde\u63a5 AI \u667a\u80fd\u4f53\u3002' '    \u0916\u0941\u0932\u0928\u0947 \u092a\u0930 \u090f\u0915 \u0938\u0939\u093e\u092f\u0915 \u092c\u091f\u0928\u094b\u0902 \u0938\u0947 AI \u090f\u091c\u0947\u0902\u091f \u0907\u0902\u0938\u094d\u091f\u0949\u0932 \u0915\u0930\u0928\u0947 \u0914\u0930 \u091c\u094b\u0921\u093c\u0928\u0947 \u092e\u0947\u0902 \u0906\u092a\u0915\u093e \u092e\u093e\u0930\u094d\u0917\u0926\u0930\u094d\u0936\u0928 \u0915\u0930\u0924\u093e \u0939\u0948\u0964'
  } catch {
    if ($_.Exception.Message -ne 'kywai') {
      Write-Host ''
      Msg 'x Algo fall\u00f3. Este es el detalle (por si alguien te ayuda):' 'x Something failed. This is the detail (in case someone helps you):' 'x \u51fa\u4e86\u70b9\u95ee\u9898\u3002\u4ee5\u4e0b\u662f\u8be6\u7ec6\u4fe1\u606f\uff08\u65b9\u4fbf\u522b\u4eba\u5e2e\u4f60\uff09\uff1a' 'x \u0915\u0941\u091b \u0935\u093f\u092b\u0932 \u0939\u0941\u0906\u0964 \u092f\u0939 \u0930\u0939\u093e \u0935\u093f\u0935\u0930\u0923 (\u0905\u0917\u0930 \u0915\u094b\u0908 \u0906\u092a\u0915\u0940 \u092e\u0926\u0926 \u0915\u0930\u0947):' 'Red'
      Write-Host $_.Exception.Message
      Msg '  Puedes volver a pegar la misma orden: no rompe nada. Si sigue fallando, descarga el instalador en https://kywai.app/es/#download' `
        '  You can paste the same command again: it breaks nothing. If it keeps failing, download the installer at https://kywai.app/#download' '  \u4f60\u53ef\u4ee5\u91cd\u65b0\u7c98\u8d34\u540c\u4e00\u6761\u547d\u4ee4\uff0c\u4e0d\u4f1a\u9020\u6210\u4efb\u4f55\u635f\u574f\u3002\u5982\u679c\u4ecd\u7136\u5931\u8d25\uff0c\u8bf7\u5728 https://kywai.app/zh/#download \u4e0b\u8f7d\u5b89\u88c5\u7a0b\u5e8f' '  \u0906\u092a \u0935\u0939\u0940 \u0915\u092e\u093e\u0902\u0921 \u092b\u093f\u0930 \u0938\u0947 \u091a\u093f\u092a\u0915\u093e \u0938\u0915\u0924\u0947 \u0939\u0948\u0902: \u0907\u0938\u0938\u0947 \u0915\u0941\u091b \u0928\u0939\u0940\u0902 \u091f\u0942\u091f\u0924\u093e\u0964 \u0905\u0917\u0930 \u092b\u093f\u0930 \u092d\u0940 \u0935\u093f\u092b\u0932 \u0939\u094b, \u0924\u094b https://kywai.app/hi/#download \u0938\u0947 \u0907\u0902\u0938\u094d\u091f\u0949\u0932\u0930 \u0921\u093e\u0909\u0928\u0932\u094b\u0921 \u0915\u0930\u0947\u0902'
    }
  }
}
