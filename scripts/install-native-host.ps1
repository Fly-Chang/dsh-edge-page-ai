# Install the dsh-edge-page-ai Native Messaging Host for Edge.
# Registers: HKCU\Software\Microsoft\Edge\NativeMessagingHosts\dsh_edge_page_ai
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-native-host.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$hostName = 'dsh_edge_page_ai'
$nativeDir = Join-Path $root 'native-host'
$manifestPath = Join-Path $nativeDir 'manifest.json'
$hostCmd = Join-Path $nativeDir 'host.cmd'

if (-not (Test-Path $hostCmd)) {
  throw "Native host wrapper not found: $hostCmd"
}

$manifest = @{
  name = $hostName
  description = 'dsh-edge-page-ai native companion host'
  path = $hostCmd
  type = 'stdio'
} | ConvertTo-Json -Compress

Set-Content -Path $manifestPath -Value $manifest -Encoding Ascii

reg add "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\$hostName" /ve /t REG_SZ /d "$manifestPath" /f | Out-Null

Write-Output "[dsh-edge-page-ai] Native host installed."
Write-Output "Manifest: $manifestPath"
Write-Output "Host: $hostCmd"
