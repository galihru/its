$ErrorActionPreference = "Stop"

$webRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $webRoot

$installerProject = Join-Path $webRoot "windows-native\ItsMapsInstaller\ItsMapsInstaller.csproj"
$uninstallerProject = Join-Path $webRoot "windows-native\ItsMapsUninstaller\ItsMapsUninstaller.csproj"
$payloadDir = Join-Path $webRoot "windows-native\ItsMapsInstaller\Payload"
$appZip = Join-Path $payloadDir "app.zip"
$uninstallerPayload = Join-Path $payloadDir "ITS Maps Uninstall.exe"
$uninstallerPublish = Join-Path $webRoot "windows-native\ItsMapsUninstaller\bin\Release\net9.0-windows\win-x64\publish\ITS Maps Uninstall.exe"
$installerPublish = Join-Path $webRoot "windows-native\ItsMapsInstaller\bin\Release\net9.0-windows\win-x64\publish\ITS Maps Windows Setup.exe"
$packageJson = Join-Path $webRoot "package.json"
$packageJsonOriginal = Get-Content -LiteralPath $packageJson -Raw
$packageMeta = $packageJsonOriginal | ConvertFrom-Json
$appVersion = [string] $packageMeta.version
if (-not $appVersion) {
  throw "package.json version is required"
}
$appFileVersion = "$appVersion.0"
$customSetup = Join-Path $webRoot "release\ITS-Maps-Windows-Custom-Setup-$appVersion-x64.exe"
$electronOutputRoot = Join-Path $webRoot ("release\electron-builder-work-" + [System.DateTime]::UtcNow.ToString("yyyyMMddHHmmssfff"))
$electronAppDir = Join-Path $electronOutputRoot "win-unpacked"
$publicUpdateArtifact = Join-Path $webRoot "public\artifacts\apps\ITS-Maps-Windows-Custom-Setup-$appVersion-x64.download"
$distUpdateArtifact = Join-Path $webRoot "dist\artifacts\apps\ITS-Maps-Windows-Custom-Setup-$appVersion-x64.download"
$copyHostingArtifact = $env:ITS_COPY_HOSTING_APP_ARTIFACT -eq "1"
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Invoke-Native {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath exited with code $LASTEXITCODE"
  }
}

function Invoke-WithRetry {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Description,

    [Parameter(Mandatory = $true)]
    [scriptblock] $Action
  )

  $lastError = $null
  for ($attempt = 1; $attempt -le 8; $attempt++) {
    try {
      & $Action
      return
    }
    catch {
      $lastError = $_
      if ($attempt -eq 8) {
        throw
      }
      Write-Host "$Description locked, retrying in 2s ($attempt/8)..."
      Start-Sleep -Seconds 2
    }
  }

  if ($lastError) {
    throw $lastError
  }
}

function New-ZipFromDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string] $SourceDirectory,

    [Parameter(Mandatory = $true)]
    [string] $DestinationPath
  )

  $sourceRoot = (Resolve-Path -LiteralPath $SourceDirectory).Path.TrimEnd("\") + "\"
  if (Test-Path $DestinationPath) {
    Remove-Item -LiteralPath $DestinationPath -Force
  }

  $zipStream = [System.IO.File]::Open($DestinationPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  $archive = [System.IO.Compression.ZipArchive]::new($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    Get-ChildItem -LiteralPath $SourceDirectory -Recurse -File | ForEach-Object {
      $relativePath = $_.FullName.Substring($sourceRoot.Length).Replace("\", "/")
      $entry = $archive.CreateEntry($relativePath, [System.IO.Compression.CompressionLevel]::Optimal)
      $entryStream = $entry.Open()
      $sourceStream = [System.IO.File]::Open($_.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
      try {
        $sourceStream.CopyTo($entryStream)
      }
      finally {
        $sourceStream.Dispose()
        $entryStream.Dispose()
      }
    }
  }
  finally {
    $archive.Dispose()
    $zipStream.Dispose()
  }
}

try {
  if (Test-Path $publicUpdateArtifact) {
    Remove-Item -LiteralPath $publicUpdateArtifact -Force
  }
  if (Test-Path $distUpdateArtifact) {
    Remove-Item -LiteralPath $distUpdateArtifact -Force
  }

  Write-Host "Building web assets..."
  Invoke-Native npm run build

  Write-Host "Packaging Electron app directory..."
  Invoke-Native npx electron-builder --win --dir --x64 "--config.directories.output=$electronOutputRoot"

  Write-Host "Publishing native uninstaller..."
  Invoke-Native dotnet publish $uninstallerProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true "-p:Version=$appVersion" "-p:FileVersion=$appFileVersion" "-p:AssemblyVersion=$appFileVersion"

  New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null
  if (Test-Path $appZip) {
    Remove-Item -LiteralPath $appZip -Force
  }
  if (Test-Path $uninstallerPayload) {
    Remove-Item -LiteralPath $uninstallerPayload -Force
  }

  Copy-Item -LiteralPath $uninstallerPublish -Destination $uninstallerPayload -Force

  Write-Host "Creating application payload zip..."
  Invoke-WithRetry "Application payload zip" {
    New-ZipFromDirectory $electronAppDir $appZip
  }

  Write-Host "Publishing native custom setup..."
  Invoke-Native dotnet publish $installerProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true "-p:Version=$appVersion" "-p:FileVersion=$appFileVersion" "-p:AssemblyVersion=$appFileVersion"

  New-Item -ItemType Directory -Force -Path (Join-Path $webRoot "release") | Out-Null
  Copy-Item -LiteralPath $installerPublish -Destination $customSetup -Force
  if ($copyHostingArtifact) {
    New-Item -ItemType Directory -Force -Path (Split-Path $distUpdateArtifact -Parent) | Out-Null
    Copy-Item -LiteralPath $customSetup -Destination $distUpdateArtifact -Force
  }

  Write-Host "Custom setup ready:"
  Write-Host $customSetup
  if ($copyHostingArtifact) {
    Write-Host "Update artifact ready:"
    Write-Host $distUpdateArtifact
  } else {
    Write-Host "Hosting update artifact skipped. Upload the setup exe to GitHub Release instead."
  }
}
finally {
  [System.IO.File]::WriteAllText($packageJson, $packageJsonOriginal, $utf8NoBom)
}
