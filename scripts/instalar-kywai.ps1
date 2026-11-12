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
  $es = (Get-UICulture).Name -like 'es*'
  # El archivo es solo ASCII (PowerShell 5.1 puede leerlo con otra codificaci\u00f3n): los acentos van como \u00e1 y se
  # convierten aqu\u00ed.
  function Txt($esText, $enText) { if ($es) { $t = $esText } else { $t = $enText }; [regex]::Unescape($t) }
  function Msg($esText, $enText, $color) {
    if ($color) { Write-Host (Txt $esText $enText) -ForegroundColor $color } else { Write-Host (Txt $esText $enText) }
  }
  # Pasos numerados como en la web (kywai.app, \u00abInst\u00e1lala en 3 pasos\u00bb): quien instala sabe por d\u00f3nde va.
  function Paso($n, $esText, $enText) { Write-Host ''; Msg "Paso $n de 3: $esText" "Step $n of 3: $enText" 'Cyan' }
  function Nota($esText, $enText) { Msg "   $esText" "   $enText" 'DarkGray' }
  # Un fallo dice qu\u00e9 pas\u00f3 y qu\u00e9 hacer, en sencillo, y recuerda que repetir la orden no rompe nada.
  function Fallo($esText, $enText) {
    Write-Host ''
    Msg "x $esText" "x $enText" 'Red'
    Msg '  Puedes volver a pegar la misma orden cuando quieras: no rompe nada. Si sigue fallando, descarga el instalador en https://kywai.app/es/#download' `
      '  You can paste the same command again any time: it breaks nothing. If it keeps failing, download the installer at https://kywai.app/#download'
    throw 'kywai'
  }

  Write-Host ''
  Msg 'kywai - instalador' 'kywai - installer' 'White'
  Msg 'Esto tarda unos 2 minutos. No cierres esta ventana hasta que ponga \u00abListo\u00bb.' `
    'This takes about 2 minutes. Do not close this window until it says "Done".'

  try {
    Paso 1 'buscando la \u00faltima versi\u00f3n y descarg\u00e1ndola' 'finding the latest version and downloading it'
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
        'Could not reach GitHub to find the latest version. Check your internet connection and try again in a moment.'

    }
    Nota "kywai $version para Windows" "kywai $version for Windows"

    # Para reemplazarla tiene que estar cerrada: se ofrece cerrarla en vez de obligar a empezar de nuevo.
    if (Get-Process -Name kywai -ErrorAction SilentlyContinue) {
      $r = Read-Host (Txt 'kywai est\u00e1 abierta y hay que cerrarla para actualizarla. \u00bfLa cierro yo? [S/n]' 'kywai is open and must be closed to update it. Shall I close it? [Y/n]')
      if ($r -notmatch '^[nN]') {
        Get-Process -Name kywai -ErrorAction SilentlyContinue | ForEach-Object { [void]$_.CloseMainWindow() }
        for ($i = 0; $i -lt 10 -and (Get-Process -Name kywai -ErrorAction SilentlyContinue); $i++) { Start-Sleep 1 }
        # Sigue en la bandeja (junto al reloj): se cierra del todo.
        Get-Process -Name kywai -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep 2
      }
      if (Get-Process -Name kywai -ErrorAction SilentlyContinue) {
        Fallo 'kywai sigue abierta. Ci\u00e9rrala (tambi\u00e9n desde su icono junto al reloj: clic derecho, Salir) y vuelve a pegar la orden.' `
          'kywai is still open. Quit it (also from its icon next to the clock: right-click, Quit) and paste the command again.'
      }
    }

    $name = "kywai-Setup-$version.exe"
    $exe = Join-Path $env:TEMP $name
    Nota "Descargando $name (unos 100 MB; puede parecer parado, es normal)..." "Downloading $name (about 100 MB; it may look stuck, that is normal)..."
    try {
      Invoke-WebRequest -UseBasicParsing "https://github.com/$repo/releases/download/v$version/$name" -OutFile $exe
    } catch {
      Fallo 'No se pudo descargar kywai. Revisa tu conexi\u00f3n a internet y vuelve a pegar la orden.' 'Could not download kywai. Check your internet connection and paste the command again.'
    }

    Paso 2 'instalando kywai (si Windows pregunta algo, pulsa S\u00ed)' 'installing kywai (if Windows asks anything, click Yes)'
    $p = Start-Process -FilePath $exe -ArgumentList '/S' -Wait -PassThru
    Remove-Item $exe -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0) {
      Fallo "La instalaci\u00f3n no termin\u00f3 bien (c\u00f3digo $($p.ExitCode)). Cierra kywai si est\u00e1 abierta y vuelve a pegar la orden." `
        "The installation did not finish (code $($p.ExitCode)). Quit kywai if it is open and paste the command again."
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

    Nota 'Con acceso directo en el Escritorio y en el men\u00fa Inicio.' 'With shortcuts on the Desktop and in the Start menu.'
    if ($app) {
      Paso 3 'abriendo kywai' 'opening kywai'
      Start-Process -FilePath $app
    }
    Write-Host ''
    Msg 'OK  Listo: kywai est\u00e1 instalada.' 'OK  Done: kywai is installed.' 'Green'
    if ($app) {
      Msg '    Ya puedes cerrar esta ventana. kywai se est\u00e1 abriendo (la primera vez tarda unos segundos).' `
        '    You can close this window now. kywai is opening (the first time takes a few seconds).'
    } else {
      Msg '    \u00c1brela desde el acceso directo del Escritorio. Ya puedes cerrar esta ventana.' '    Open it from the Desktop shortcut. You can close this window now.'
    }
    Msg '    Al abrirse, un asistente te gu\u00eda con botones para instalar los agentes de IA y conectarlos.' `
      '    When it opens, an assistant guides you with buttons to install the AI agents and connect them.'
  } catch {
    if ($_.Exception.Message -ne 'kywai') {
      Write-Host ''
      Msg 'x Algo fall\u00f3. Este es el detalle (por si alguien te ayuda):' 'x Something failed. This is the detail (in case someone helps you):' 'Red'
      Write-Host $_.Exception.Message
      Msg '  Puedes volver a pegar la misma orden: no rompe nada. Si sigue fallando, descarga el instalador en https://kywai.app/es/#download' `
        '  You can paste the same command again: it breaks nothing. If it keeps failing, download the installer at https://kywai.app/#download'
    }
  }
}
