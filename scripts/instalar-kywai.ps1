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
  function Msg($esText, $enText) { if ($es) { $t = $esText } else { $t = $enText }; Write-Host ([regex]::Unescape($t)) }
  function Fallo($esText, $enText) { Msg "x $esText" "x $enText"; throw 'kywai' }

  try {
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
      Fallo "No se pudo saber cu\u00e1l es la \u00faltima versi\u00f3n. Prueba m\u00e1s tarde o desc\u00e1rgala de https://github.com/$repo/releases/latest" `
        "Could not find the latest version. Try again later or download it from https://github.com/$repo/releases/latest"
    }
    Msg "kywai $version para Windows" "kywai $version for Windows"

    if (Get-Process -Name kywai -ErrorAction SilentlyContinue) {
      Fallo 'kywai est\u00e1 abierta. Ci\u00e9rrala (tambi\u00e9n desde el icono junto al reloj) y vuelve a pegar la orden.' `
        'kywai is running. Quit it (also from the icon next to the clock) and paste the command again.'
    }

    $name = "kywai-Setup-$version.exe"
    $exe = Join-Path $env:TEMP $name
    Msg "Descargando $name..." "Downloading $name..."
    Invoke-WebRequest -UseBasicParsing "https://github.com/$repo/releases/download/v$version/$name" -OutFile $exe

    Msg 'Instalando...' 'Installing...'
    $p = Start-Process -FilePath $exe -ArgumentList '/S' -Wait -PassThru
    Remove-Item $exe -Force -ErrorAction SilentlyContinue
    if ($p.ExitCode -ne 0) { Fallo "El instalador termin\u00f3 con el c\u00f3digo $($p.ExitCode)." "The installer exited with code $($p.ExitCode)." }

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

    Msg 'OK: Instalada, con acceso directo en el Escritorio y en el men\u00fa Inicio.' 'OK: Installed, with shortcuts on the Desktop and in the Start menu.'
    if ($app) { Start-Process -FilePath $app }
    Msg 'La primera vez se abre el asistente, que instala los agentes de IA y abre su inicio de sesi\u00f3n.' `
      'The first time, the setup assistant opens: it installs the AI agents and opens their sign-in.'
  } catch {
    if ($_.Exception.Message -ne 'kywai') { Msg 'x Algo fall\u00f3:' 'x Something failed:'; Write-Host $_.Exception.Message }
  }
}
