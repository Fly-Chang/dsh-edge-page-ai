@echo off
rem Stop the gateway process listening on port 8787 (double-click to run).
powershell -NoProfile -ExecutionPolicy Bypass -Command "$conns = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue; if ($conns) { $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force }; Write-Host '[edge-page-ai] gateway stopped.' } else { Write-Host '[edge-page-ai] gateway is not running.' }"
pause
