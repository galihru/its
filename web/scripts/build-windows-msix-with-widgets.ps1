$ErrorActionPreference = "Stop"

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repo
try {
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Web production build failed with exit code $LASTEXITCODE."
  }

  npm run widgets:publish
  if ($LASTEXITCODE -ne 0) {
    throw "Windows widget provider publish failed with exit code $LASTEXITCODE."
  }

  & (Join-Path $PSScriptRoot "generate-transparent-windows-assets.ps1")

  Add-Type -AssemblyName System.Drawing
  $appxAssetDir = Join-Path $repo "build\appx"
  $storeLogoDir = Join-Path $repo "store-assets\logos"
  function Assert-TransparentCorners {
    param(
      [Parameter(Mandatory = $true)][string]$Path,
      [Parameter(Mandatory = $true)][string]$Label
    )

    $bitmap = [System.Drawing.Bitmap]::FromFile($Path)
    try {
      $right = $bitmap.Width - 1
      $bottom = $bitmap.Height - 1
      $points = @(
        @(0, 0),
        @($right, 0),
        @(0, $bottom),
        @($right, $bottom)
      )
      foreach ($point in $points) {
        $alpha = $bitmap.GetPixel($point[0], $point[1]).A
        if ($alpha -ne 0) {
          throw "$Label must have transparent corners. $Path has alpha $alpha at $($point[0]),$($point[1])."
        }
      }
    }
    finally {
      $bitmap.Dispose()
    }
  }

  function Assert-WhiteOrTransparent {
    param(
      [Parameter(Mandatory = $true)][string]$Path,
      [Parameter(Mandatory = $true)][string]$Label
    )

    $bitmap = [System.Drawing.Bitmap]::FromFile($Path)
    try {
      for ($y = 0; $y -lt $bitmap.Height; $y++) {
        for ($x = 0; $x -lt $bitmap.Width; $x++) {
          $pixel = $bitmap.GetPixel($x, $y)
          if ($pixel.A -eq 0) {
            continue
          }
          if ($pixel.R -ne 255 -or $pixel.G -ne 255 -or $pixel.B -ne 255) {
            throw "$Label must be white or transparent. $Path has RGBA($($pixel.R),$($pixel.G),$($pixel.B),$($pixel.A)) at $x,$y."
          }
        }
      }
    }
    finally {
      $bitmap.Dispose()
    }
  }

  $requiredAssets = @{
    "SmallTile.png" = @(71, 71)
    "Square150x150Logo.png" = @(150, 150)
    "Square44x44Logo.png" = @(44, 44)
    "BadgeLogo.png" = @(24, 24)
    "StoreLogo.png" = @(50, 50)
    "Wide310x150Logo.png" = @(310, 150)
    "LargeTile.png" = @(310, 310)
    "SplashScreen.png" = @(620, 300)
  }
  foreach ($assetName in $requiredAssets.Keys) {
    $assetPath = Join-Path $appxAssetDir $assetName
    if (-not (Test-Path -LiteralPath $assetPath)) {
      throw "Required AppX asset is missing: $assetPath"
    }

    $expectedSize = $requiredAssets[$assetName]
    $image = [System.Drawing.Image]::FromFile($assetPath)
    try {
      if ($image.Width -ne $expectedSize[0] -or $image.Height -ne $expectedSize[1]) {
        throw "Invalid AppX asset dimensions for ${assetName}: $($image.Width)x$($image.Height), expected $($expectedSize[0])x$($expectedSize[1])."
      }
    }
    finally {
      $image.Dispose()
    }
    Assert-TransparentCorners -Path $assetPath -Label $assetName
    if ($assetName -eq "BadgeLogo.png") {
      Assert-WhiteOrTransparent -Path $assetPath -Label $assetName
    }
  }

  $storeLogoAssets = @(
    "ITS-Maps-App-Tile-300x300.png",
    "ITS-Maps-Logo-150x150.png",
    "ITS-Maps-Logo-71x71.png"
  )
  foreach ($assetName in $storeLogoAssets) {
    $assetPath = Join-Path $storeLogoDir $assetName
    if (-not (Test-Path -LiteralPath $assetPath)) {
      throw "Required Store logo is missing: $assetPath"
    }
    Assert-TransparentCorners -Path $assetPath -Label $assetName
  }

  $largeTilePath = Join-Path $appxAssetDir "LargeTile.png"
  if ((Get-Item -LiteralPath $largeTilePath).Length -ge 204800) {
    throw "LargeTile.png must be smaller than 204800 bytes."
  }

  $packageBuildStarted = Get-Date
  npx electron-builder --win appx --publish never
  if ($LASTEXITCODE -ne 0) {
    throw "Electron AppX build failed with exit code $LASTEXITCODE."
  }

  $releaseDir = Join-Path $repo "release"
  $appx = Get-ChildItem $releaseDir -Filter "ITS-Maps-Windows-Store-*-x64.appx" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if (-not $appx) {
    throw "Electron AppX artifact was not created in $releaseDir"
  }
  if ($appx.LastWriteTime -lt $packageBuildStarted) {
    throw "Electron AppX artifact was not refreshed by the current build: $($appx.FullName)"
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($appx.FullName)
  try {
    $manifestEntry = $archive.Entries | Where-Object { $_.FullName -eq "AppxManifest.xml" } | Select-Object -First 1
    if (-not $manifestEntry) {
      throw "AppxManifest.xml is missing from $($appx.FullName)."
    }
    $reader = New-Object System.IO.StreamReader($manifestEntry.Open())
    try {
      $manifestText = $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
    if ($manifestText -notmatch '<uap:LockScreen\b' -or $manifestText -notmatch 'BadgeLogo="assets\\BadgeLogo\.png"') {
      throw "Final AppX manifest is missing the ITS Maps lock screen badgeAndTileText declaration."
    }
    $badgeEntry = $archive.Entries | Where-Object { $_.FullName -eq "assets/BadgeLogo.png" } | Select-Object -First 1
    if (-not $badgeEntry) {
      throw "Final AppX is missing assets/BadgeLogo.png."
    }
  }
  finally {
    $archive.Dispose()
  }

  $publisherSubject = "CN=79B6244C-1730-4472-9953-3D2B3B9A1FB4"
  $cert = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $publisherSubject } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

  $signTool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\x64\signtool.exe" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if ($cert -and $signTool -and $env:ITS_MSIX_SKIP_TEST_SIGN -ne "1") {
    & $($signTool.FullName) sign /fd SHA256 /sha1 $cert.Thumbprint $appx.FullName
    if ($LASTEXITCODE -ne 0) {
      throw "AppX signing failed with exit code $LASTEXITCODE."
    }
  } else {
    Write-Warning "AppX test signing skipped. Install testing requires a trusted certificate that matches $publisherSubject."
  }

  $msixPath = [System.IO.Path]::ChangeExtension($appx.FullName, ".msix")
  Copy-Item -LiteralPath $appx.FullName -Destination $msixPath -Force

  Write-Host "Store AppX created: $($appx.FullName)"
  Write-Host "MSIX copy created: $msixPath"
}
finally {
  Pop-Location
}
