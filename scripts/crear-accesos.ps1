# Crea los accesos directos de AI Cowork en el Escritorio y en el menú Inicio.
# Uso: npm run accesos
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $root 'scripts\abrir-ai-cowork.ps1'
$icon = Join-Path $root 'build\icon.ico'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shell = New-Object -ComObject WScript.Shell

foreach ($dir in [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs')) {
  $path = Join-Path $dir 'AI Cowork.lnk'
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = $powershell
  $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = "$icon,0"
  $lnk.Description = 'AI Cowork: tu equipo de agentes de IA'
  $lnk.WindowStyle = 7
  $lnk.Save()
  Write-Output "Acceso directo creado: $path"
}
