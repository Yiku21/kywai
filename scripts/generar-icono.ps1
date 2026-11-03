# Genera build/icon-<tamaño>.png con el logo de AI Cowork (tres nodos conectados).
# Uso: powershell -NoProfile -File scripts/generar-icono.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'build'
New-Item -ItemType Directory -Force $outDir | Out-Null

function Hex($h, $a = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($h)
  return [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B)
}

# 1024: icono de macOS (build/icon.png); el resto forman el .ico de Windows.
foreach ($size in 1024, 256, 64, 48, 32, 16) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # Fondo: cuadrado redondeado oscuro con borde sutil
  $r = [Math]::Max(3, [int]($size * 0.22))
  $m = [Math]::Max(0.5, $size * 0.02)
  $w = $size - 2 * $m
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($m, $m, 2 * $r, 2 * $r, 180, 90)
  $path.AddArc($m + $w - 2 * $r, $m, 2 * $r, 2 * $r, 270, 90)
  $path.AddArc($m + $w - 2 * $r, $m + $w - 2 * $r, 2 * $r, 2 * $r, 0, 90)
  $path.AddArc($m, $m + $w - 2 * $r, 2 * $r, 2 * $r, 90, 90)
  $path.CloseFigure()
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.PointF]::new(0, 0)), ([System.Drawing.PointF]::new(0, $size)), (Hex '#16213a'), (Hex '#0a101d')
  $g.FillPath($bg, $path)
  $g.DrawPath((New-Object System.Drawing.Pen (Hex '#2c3d5c'), ([Math]::Max(1, $size / 128))), $path)

  # Logo en una caja de 32 unidades, escalado al 76 % del icono
  $s = $size * 0.76 / 32
  $o = $size * 0.12
  function P($x, $y) { return [System.Drawing.PointF]::new($o + $x * $s, $o + $y * $s) }
  $pen = New-Object System.Drawing.Pen (Hex '#e9eef8' 190), ([Math]::Max(1, 2.2 * $s))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  $g.DrawLine($pen, (P 16 9), (P 8.5 22.5))
  $g.DrawLine($pen, (P 16 9), (P 23.5 22.5))
  $g.DrawLine($pen, (P 9 23), (P 23 23))
  function Dot($cx, $cy, $rad, $color, $alpha = 255) {
    $b = New-Object System.Drawing.SolidBrush (Hex $color $alpha)
    $p = P ($cx - $rad) ($cy - $rad)
    $g.FillEllipse($b, $p.X, $p.Y, 2 * $rad * $s, 2 * $rad * $s)
  }
  Dot 16 8.5 5.6 '#2a7bff'
  Dot 8.3 23.2 5 '#21c07c'
  Dot 23.7 23.2 5 '#ff7a1f'
  if ($size -ge 32) {
    Dot 14.4 6.9 1.6 '#ffffff' 115
    Dot 7 21.8 1.3 '#ffffff' 90
    Dot 22.4 21.8 1.3 '#ffffff' 90
  }
  $file = Join-Path $outDir "icon-$size.png"
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Output "creado $file"
}
Copy-Item -Force (Join-Path $outDir 'icon-1024.png') (Join-Path $outDir 'icon.png')
Write-Output "creado $(Join-Path $outDir 'icon.png')"
