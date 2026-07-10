$ErrorActionPreference = "Stop"

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$sourcePath = Join-Path $repo "src\icon\its.png"
$appxDir = Join-Path $repo "build\appx"
$storeDir = Join-Path $repo "store-assets\logos"

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Path $appxDir -Force | Out-Null
New-Item -ItemType Directory -Path $storeDir -Force | Out-Null

function Write-TransparentLogo {
  param(
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][int]$Width,
    [Parameter(Mandatory = $true)][int]$Height,
    [Parameter(Mandatory = $true)][double]$Fill,
    [switch]$WhiteOnly
  )

  $source = [System.Drawing.Image]::FromFile($sourcePath)
  $canvas = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $maxWidth = [Math]::Max(1, [Math]::Round($Width * $Fill))
    $maxHeight = [Math]::Max(1, [Math]::Round($Height * $Fill))
    $scale = [Math]::Min($maxWidth / $source.Width, $maxHeight / $source.Height)
    $drawWidth = [Math]::Max(1, [Math]::Round($source.Width * $scale))
    $drawHeight = [Math]::Max(1, [Math]::Round($source.Height * $scale))
    $x = [Math]::Round(($Width - $drawWidth) / 2)
    $y = [Math]::Round(($Height - $drawHeight) / 2)
    $graphics.DrawImage($source, $x, $y, $drawWidth, $drawHeight)
    if ($WhiteOnly) {
      for ($py = 0; $py -lt $canvas.Height; $py++) {
        for ($px = 0; $px -lt $canvas.Width; $px++) {
          $pixel = $canvas.GetPixel($px, $py)
          if ($pixel.A -gt 0) {
            $canvas.SetPixel($px, $py, [System.Drawing.Color]::FromArgb($pixel.A, 255, 255, 255))
          }
        }
      }
    }
    $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $canvas.Dispose()
    $source.Dispose()
  }
}

$appxAssets = @(
  @{ Name = "SmallTile.png"; Width = 71; Height = 71; Fill = 0.90 },
  @{ Name = "Square150x150Logo.png"; Width = 150; Height = 150; Fill = 0.88 },
  @{ Name = "Square44x44Logo.png"; Width = 44; Height = 44; Fill = 0.90 },
  @{ Name = "BadgeLogo.png"; Width = 24; Height = 24; Fill = 0.92 },
  @{ Name = "StoreLogo.png"; Width = 50; Height = 50; Fill = 0.90 },
  @{ Name = "Wide310x150Logo.png"; Width = 310; Height = 150; Fill = 0.86 },
  @{ Name = "LargeTile.png"; Width = 310; Height = 310; Fill = 0.84 },
  @{ Name = "SplashScreen.png"; Width = 620; Height = 300; Fill = 0.58 }
)

foreach ($asset in $appxAssets) {
  Write-TransparentLogo -OutputPath (Join-Path $appxDir $asset.Name) -Width $asset.Width -Height $asset.Height -Fill $asset.Fill -WhiteOnly:($asset.Name -eq "BadgeLogo.png")
}

$storeAssets = @(
  @{ Name = "ITS-Maps-App-Tile-300x300.png"; Width = 300; Height = 300; Fill = 0.90 },
  @{ Name = "ITS-Maps-Logo-150x150.png"; Width = 150; Height = 150; Fill = 0.90 },
  @{ Name = "ITS-Maps-Logo-71x71.png"; Width = 71; Height = 71; Fill = 0.90 }
)

foreach ($asset in $storeAssets) {
  Write-TransparentLogo -OutputPath (Join-Path $storeDir $asset.Name) -Width $asset.Width -Height $asset.Height -Fill $asset.Fill
}

Write-Host "Transparent AppX assets: $appxDir"
Write-Host "Transparent Store logos: $storeDir"
