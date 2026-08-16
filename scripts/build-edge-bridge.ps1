# Package the Edge bridge extension as dist/edge-bridge.zip (unsigned, for developer mode).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-edge-bridge.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'src/edge-bridge'
$dist = Join-Path $root 'dist'
$zip = Join-Path $dist 'edge-bridge.zip'

New-Item -ItemType Directory -Force -Path $dist | Out-Null
if (Test-Path $zip) {
  Remove-Item $zip -Force
}
Compress-Archive -Path (Join-Path $source '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Output "created $zip"
