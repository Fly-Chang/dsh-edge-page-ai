# Uninstall the dsh-edge-page-ai Native Messaging Host for Edge.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/uninstall-native-host.ps1
$ErrorActionPreference = 'Continue'
$hostName = 'dsh_edge_page_ai'
$key = "HKCU\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"

reg delete $key /f 2>$null | Out-Null
if (Test-Path (Join-Path (Split-Path -Parent $PSScriptRoot) 'native-host\manifest.json')) {
  Remove-Item (Join-Path (Split-Path -Parent $PSScriptRoot) 'native-host\manifest.json') -Force -ErrorAction SilentlyContinue
}

Write-Output '[dsh-edge-page-ai] Native host uninstalled.'
