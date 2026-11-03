# Abre AI Cowork. Si el código cambió desde la última compilación (por ejemplo, porque lo
# editaron los agentes), la app se actualiza antes de arrancar.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$builtMain = Join-Path $root 'out\main\index.js'
$builtPage = Join-Path $root 'out\renderer\index.html'

function Show-Error([string]$msg) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($msg, 'AI Cowork', 'OK', 'Error') | Out-Null
}

if (-not (Test-Path $electron)) {
  Show-Error "Falta Electron. Abre una terminal en `"$root`" y ejecuta: npm install"
  exit 1
}

# ¿Hace falta compilar?
$needBuild = -not (Test-Path $builtMain) -or -not (Test-Path $builtPage)
if (-not $needBuild) {
  $stamp = (Get-Item $builtMain).LastWriteTimeUtc
  $watch = @('src', 'package.json', 'electron.vite.config.ts') | ForEach-Object { Join-Path $root $_ }
  $newer = Get-ChildItem -Path $watch -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -gt $stamp } |
    Select-Object -First 1
  $needBuild = [bool]$newer
}

if ($needBuild) {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form = New-Object System.Windows.Forms.Form
  $form.Text = 'AI Cowork'
  $form.Width = 380
  $form.Height = 120
  $form.StartPosition = 'CenterScreen'
  $form.FormBorderStyle = 'FixedDialog'
  $form.ControlBox = $false
  $form.TopMost = $true
  $form.BackColor = [System.Drawing.Color]::FromArgb(11, 17, 28)
  $form.ForeColor = [System.Drawing.Color]::FromArgb(233, 238, 248)
  $icon = Join-Path $root 'build\icon.ico'
  if (Test-Path $icon) { $form.Icon = New-Object System.Drawing.Icon $icon }
  $label = New-Object System.Windows.Forms.Label
  $label.Text = 'Actualizando AI Cowork con los últimos cambios…'
  $label.Dock = 'Fill'
  $label.TextAlign = 'MiddleCenter'
  $label.Font = New-Object System.Drawing.Font('Segoe UI', 10)
  $form.Controls.Add($label)
  $form.Show()
  [System.Windows.Forms.Application]::DoEvents()

  $p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npx electron-vite build' -WorkingDirectory $root -WindowStyle Hidden -Wait -PassThru
  $form.Close()
  if ($p.ExitCode -ne 0) {
    Show-Error 'No se pudo actualizar la app con los últimos cambios. Se abrirá la versión anterior. Para ver el error, ejecuta "npm run dev" en la carpeta del proyecto.'
    if (-not (Test-Path $builtMain)) { exit 1 }
  }
}

Start-Process -FilePath $electron -ArgumentList "`"$root`"" -WorkingDirectory $root
