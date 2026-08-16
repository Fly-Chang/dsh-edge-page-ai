@echo off
rem Start the gateway in the foreground (double-click to run).
rem The window stays open. Press Ctrl+C or close the window to stop.
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo [edge-page-ai] Node.js not found. Please install Node.js 18.17 or newer.
  pause
  exit /b 1
)

echo [edge-page-ai] Starting gateway...
echo [edge-page-ai] The bookmarklet page URL will be printed below after startup.
call npm start

echo.
echo [edge-page-ai] Gateway exited.
pause
