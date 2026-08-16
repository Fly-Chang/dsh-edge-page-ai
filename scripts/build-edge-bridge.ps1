# 打包 Edge 薄壳扩展为 dist/edge-bridge.zip（未签名，开发者模式加载用）。
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-edge-bridge.ps1
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
