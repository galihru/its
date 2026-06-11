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
$customSetup = Join-Path $webRoot "release\ITS-Maps-Windows-Custom-Setup-1.0.12-x64.exe"
$publicUpdateArtifact = Join-Path $webRoot "public\artifacts\apps\ITS-Maps-Windows-Custom-Setup-1.0.12-x64.download"
$distUpdateArtifact = Join-Path $webRoot "dist\artifacts\apps\ITS-Maps-Windows-Custom-Setup-1.0.12-x64.download"
$packageJson = Join-Path $webRoot "package.json"
$packageJsonOriginal = Get-Content -LiteralPath $packageJson -Raw
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

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

try {
  Write-Host "Building web assets..."
  Invoke-Native npm run build

  Write-Host "Packaging Electron app directory..."
  Invoke-Native npx electron-builder --win --dir --x64

  Write-Host "Publishing native uninstaller..."
  Invoke-Native dotnet publish $uninstallerProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true

  New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null
  if (Test-Path $appZip) {
    Remove-Item -LiteralPath $appZip -Force
  }
  if (Test-Path $uninstallerPayload) {
    Remove-Item -LiteralPath $uninstallerPayload -Force
  }

  Copy-Item -LiteralPath $uninstallerPublish -Destination $uninstallerPayload -Force

  Write-Host "Creating application payload zip..."
  Compress-Archive -Path (Join-Path $webRoot "release\win-unpacked\*") -DestinationPath $appZip -CompressionLevel Optimal

  Write-Host "Publishing native custom setup..."
  Invoke-Native dotnet publish $installerProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true

  New-Item -ItemType Directory -Force -Path (Join-Path $webRoot "release") | Out-Null
  Copy-Item -LiteralPath $installerPublish -Destination $customSetup -Force
  New-Item -ItemType Directory -Force -Path (Split-Path $publicUpdateArtifact -Parent) | Out-Null
  New-Item -ItemType Directory -Force -Path (Split-Path $distUpdateArtifact -Parent) | Out-Null
  Copy-Item -LiteralPath $customSetup -Destination $publicUpdateArtifact -Force
  Copy-Item -LiteralPath $customSetup -Destination $distUpdateArtifact -Force

  Write-Host "Custom setup ready:"
  Write-Host $customSetup
  Write-Host "Update artifact ready:"
  Write-Host $publicUpdateArtifact
}
finally {
  [System.IO.File]::WriteAllText($packageJson, $packageJsonOriginal, $utf8NoBom)
}
