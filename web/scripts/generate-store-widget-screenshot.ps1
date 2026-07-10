$ErrorActionPreference = "Stop"

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$boardPath = Join-Path $repo "test-results\widget-winw-again.png"
$aiPath = Join-Path $repo "test-results\widget-ai-pinned-live.png"
$iconPath = Join-Path $repo "src\icon\its.png"
$outputDir = Join-Path $repo "store-assets\screenshots"
$outputPath = Join-Path $outputDir "05-windows-11-widgets.png"

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

$canvas = New-Object System.Drawing.Bitmap 1440, 900, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$board = [System.Drawing.Image]::FromFile($boardPath)
$ai = [System.Drawing.Image]::FromFile($aiPath)
$icon = [System.Drawing.Image]::FromFile($iconPath)

try {
  $graphics.Clear([System.Drawing.Color]::FromArgb(24, 27, 32))
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.DrawImage($icon, 62, 44, 48, 72)

  $titleFont = New-Object System.Drawing.Font "Segoe UI", 30, ([System.Drawing.FontStyle]::Bold)
  $subtitleFont = New-Object System.Drawing.Font "Segoe UI", 15, ([System.Drawing.FontStyle]::Regular)
  $labelFont = New-Object System.Drawing.Font "Segoe UI", 13, ([System.Drawing.FontStyle]::Bold)
  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(178, 187, 199))

  try {
    $graphics.DrawString("ITS Maps Widgets", $titleFont, $white, 128, 48)
    $graphics.DrawString("Data realtime langsung di Windows 11 Widget Board", $subtitleFont, $muted, 130, 91)

    $cards = @(
      @{ Name = "Data Lengkap"; Image = $board; Source = [System.Drawing.Rectangle]::new(36, 139, 300, 303) },
      @{ Name = "Peta ITS"; Image = $board; Source = [System.Drawing.Rectangle]::new(36, 454, 300, 304) },
      @{ Name = "Grafik Lalu Lintas"; Image = $board; Source = [System.Drawing.Rectangle]::new(36, 770, 300, 300) },
      @{ Name = "Kamera AI ITS"; Image = $ai; Source = [System.Drawing.Rectangle]::new(36, 101, 300, 306) }
    )

    for ($index = 0; $index -lt $cards.Count; $index++) {
      $x = 55 + ($index * 345)
      $destination = [System.Drawing.Rectangle]::new($x, 180, 300, 306)
      $graphics.DrawImage($cards[$index].Image, $destination, $cards[$index].Source, [System.Drawing.GraphicsUnit]::Pixel)
      $graphics.DrawString($cards[$index].Name, $labelFont, $white, $x, 510)
    }

    $graphics.DrawString("Lokasi, snapshot AI, grafik, dan data kendaraan diperbarui dari Firebase RTDB.", $subtitleFont, $muted, 55, 590)
    $graphics.DrawString("Tampilan aktual dari build Windows 11 yang diuji.", $subtitleFont, $muted, 55, 625)
  }
  finally {
    $titleFont.Dispose()
    $subtitleFont.Dispose()
    $labelFont.Dispose()
    $white.Dispose()
    $muted.Dispose()
  }

  $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
  $graphics.Dispose()
  $canvas.Dispose()
  $board.Dispose()
  $ai.Dispose()
  $icon.Dispose()
}

Write-Host $outputPath
