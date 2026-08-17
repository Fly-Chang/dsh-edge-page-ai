# Phase 1 companion launcher:
#   starts the local gateway if needed, opens Edge, monitors Edge,
#   and stops the gateway when all visible Edge windows are closed.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-edge-with-gateway.ps1
param([switch]$SkipEdge)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$gatewayPort = 8787
$logDir = Join-Path $root 'logs'
$logFile = Join-Path $logDir 'edge-gateway.log'
$gatewayOut = Join-Path $logDir 'gateway.out.log'
$gatewayErr = Join-Path $logDir 'gateway.err.log'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-Log([string]$message) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $message"
  Add-Content -Path $logFile -Value $line
}

Set-Location $root
$gatewayStarted = $false

# 1. Ensure gateway is running.
node scripts\check-gateway-running.mjs *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Log 'gateway already running'
} else {
  Write-Log 'starting gateway'
  $gatewayProc = Start-Process node `
    -ArgumentList 'src/gateway/server.js' `
    -WorkingDirectory $root `
    -PassThru `
    -WindowStyle Hidden `
    -RedirectStandardOutput $gatewayOut `
    -RedirectStandardError $gatewayErr
  $gatewayStarted = $true
  Start-Sleep -Seconds 2
  node scripts\check-gateway-running.mjs *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Log 'gateway failed to start'
    if ($gatewayStarted -and $gatewayProc) {
      Stop-Process -Id $gatewayProc.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
  }
  Write-Log 'gateway started'
}

# 2. Start Edge.
$candidates = @(
  'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
  'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
)
$edge = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
  Write-Log 'Edge executable not found'
  if ($gatewayStarted) {
    $conns = Get-NetTCPConnection -LocalPort $gatewayPort -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
      }
    }
  }
  exit 1
}

if ($SkipEdge) {
  Write-Log 'SkipEdge test mode; skipping Edge monitor'
  Start-Sleep -Seconds 3
} else {
  Start-Process $edge | Out-Null
  Write-Log 'Edge launched'

  # 3. Monitor until no visible Edge window remains for 10 seconds.
  $noWindowSeconds = 0
  while ($true) {
    Start-Sleep -Seconds 2
    $visible = @(Get-Process msedge -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
    if ($visible.Count -eq 0) {
      $noWindowSeconds += 2
      if ($noWindowSeconds -ge 10) {
        Write-Log 'no visible Edge window for 10 seconds; treating browser as closed'
        break
      }
    } else {
      $noWindowSeconds = 0
    }
  }
  Write-Log 'Edge closed'
}

# 4. Stop gateway only if this launcher started it.
if ($gatewayStarted) {
  Write-Log 'stopping gateway'
  $conns = Get-NetTCPConnection -LocalPort $gatewayPort -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
      Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Log 'gateway stopped'
}
Write-Log 'companion monitor exit'