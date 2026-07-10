$ErrorActionPreference = "Stop"

$repo = Resolve-Path (Join-Path $PSScriptRoot "..")
$project = Join-Path $repo "windows-widgets\ItsMapsWidgetProvider\ItsMapsWidgetProvider.csproj"
$buildDir = Join-Path $repo "windows-widgets\ItsMapsWidgetProvider\bin\Release\net9.0-windows10.0.22621.0\win-x64"
$publishDir = Join-Path $buildDir "publish"
$localNugetSource = Join-Path $env:USERPROFILE ".nuget\packages"
$restoreSucceeded = $false

if (Test-Path $localNugetSource) {
  dotnet restore $project `
    -p:RestoreSources=$localNugetSource `
    -p:RestoreIgnoreFailedSources=true `
    -p:NuGetAudit=false
  $restoreSucceeded = ($LASTEXITCODE -eq 0)
}

if (-not $restoreSucceeded) {
  dotnet restore $project `
    --ignore-failed-sources `
    -p:RestoreIgnoreFailedSources=true `
    -p:NuGetAudit=false
  $restoreSucceeded = ($LASTEXITCODE -eq 0)
}

if (-not $restoreSucceeded) {
  throw "Widget provider restore failed with exit code $LASTEXITCODE"
}

dotnet build $project `
  -c Release `
  -r win-x64 `
  --no-restore

if ($LASTEXITCODE -ne 0) {
  throw "Widget provider build failed with exit code $LASTEXITCODE"
}

dotnet publish $project `
  -c Release `
  -r win-x64 `
  --no-restore `
  --self-contained true `
  --ignore-failed-sources `
  -p:NuGetAudit=false `
  -p:RestoreIgnoreFailedSources=true `
  -p:AppxPackageSigningEnabled=false

if ($LASTEXITCODE -ne 0) {
  if (-not (Test-Path (Join-Path $publishDir "coreclr.dll"))) {
    throw "Widget provider publish failed with exit code $LASTEXITCODE and no existing self-contained publish runtime was found."
  }

  Write-Warning "dotnet publish could not complete, most likely because package sources are offline. Reusing existing self-contained runtime and syncing the latest provider build output."
  Copy-Item -LiteralPath (Join-Path $buildDir "ItsMapsWidgetProvider.exe") -Destination $publishDir -Force
  Copy-Item -LiteralPath (Join-Path $buildDir "ItsMapsWidgetProvider.dll") -Destination $publishDir -Force
  Copy-Item -LiteralPath (Join-Path $buildDir "ItsMapsWidgetProvider.pdb") -Destination $publishDir -Force
  Copy-Item -LiteralPath (Join-Path $buildDir "Assets") -Destination $publishDir -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $buildDir "ProviderAssets") -Destination $publishDir -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $buildDir "Templates") -Destination $publishDir -Recurse -Force
}

if (-not (Test-Path (Join-Path $publishDir "ItsMapsWidgetProvider.exe"))) {
  throw "Widget provider publish failed: ItsMapsWidgetProvider.exe not found in $publishDir"
}

Write-Host "Widget provider published to $publishDir"
