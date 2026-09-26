param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path -Parent $PSScriptRoot
Set-Location $workspaceRoot

if (-not $SkipBuild) {
    $keyPath = Join-Path $workspaceRoot ".tmp\updater_key"
    if (Test-Path $keyPath) {
        Write-Host "Loading updater signing key from $keyPath..."
        $keyContent = Get-Content -Path $keyPath -Raw
        $env:TAURI_SIGNING_PRIVATE_KEY = $keyContent.Trim()
    } else {
        Write-Warning "updater_key not found at $keyPath. Building without updater private key."
    }

    Write-Host "Running tauri build..."
    npm run tauri -- build --bundles msi
}

$releaseDir = Join-Path $workspaceRoot "release_artifacts"
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}

$msiCandidates = @(
    (Join-Path $workspaceRoot "target\release\bundle\msi\*.msi"),
    (Join-Path $workspaceRoot "src-tauri\target\release\bundle\msi\*.msi")
)

$msiSource = $null
foreach ($pattern in $msiCandidates) {
    $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($found) {
        $msiSource = $found
        break
    }
}

if (-not $msiSource) {
    throw "MSI build output not found in target directories!"
}

$packageJson = Get-Content (Join-Path $workspaceRoot "package.json") -Raw | ConvertFrom-Json
$version = $packageJson.version
Write-Host "Target release version: $version"

$msiTarget = Join-Path $releaseDir "AI-CodePass_${version}_x64_Setup.msi"
Write-Host "Copying MSI from $($msiSource.FullName) to $msiTarget..."
Copy-Item -Path $msiSource.FullName -Destination $msiTarget -Force

$exeCandidates = @(
    (Join-Path $workspaceRoot "target\release\ai-codepass.exe"),
    (Join-Path $workspaceRoot "src-tauri\target\release\ai-codepass.exe")
)

$exeSource = $null
foreach ($path in $exeCandidates) {
    if (Test-Path $path) {
        $exeSource = $path
        break
    }
}

if (-not $exeSource) {
    throw "Release executable not found!"
}

$zipTarget = Join-Path $releaseDir "AI-CodePass_${version}_x64_Portable.zip"
if (Test-Path $zipTarget) {
    Remove-Item -Path $zipTarget -Force
}

Write-Host "Creating portable zip at $zipTarget from $exeSource..."
Compress-Archive -Path $exeSource -DestinationPath $zipTarget -Force

Write-Host "Calculating SHA-256 checksums..."
$zipHash = (Get-FileHash -Path $zipTarget -Algorithm SHA256).Hash.ToUpper()
$msiHash = (Get-FileHash -Path $msiTarget -Algorithm SHA256).Hash.ToUpper()

$checksumContent = "$zipHash  AI-CodePass_${version}_x64_Portable.zip`r`n$msiHash  AI-CodePass_${version}_x64_Setup.msi`r`n"
$checksumPath = Join-Path $releaseDir "checksums.txt"
[System.IO.File]::WriteAllText($checksumPath, $checksumContent, [System.Text.Encoding]::ASCII)
$privateKeyPath = Join-Path $workspaceRoot ".tmp\updater_key"
if (Test-Path $privateKeyPath) {
    Write-Host "Signing MSI release artifact with project private key..."
    npx @tauri-apps/cli signer sign -p "aicodepass2026" -f $privateKeyPath $msiTarget
}

Write-Host "Generating latest.json updater manifests via node..."
node (Join-Path $PSScriptRoot "generate_manifest.cjs") $version

Write-Host "`n==== Packaging Release Successful ===="
Write-Host "MSI:  $msiTarget ($((Get-Item $msiTarget).Length) bytes, SHA-256: $msiHash)"
Write-Host "ZIP:  $zipTarget ($((Get-Item $zipTarget).Length) bytes, SHA-256: $zipHash)"
Write-Host "Checksum file: $checksumPath"
Write-Host "Updater manifest: $latestJsonPath"

