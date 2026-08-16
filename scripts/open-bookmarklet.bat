@echo off
rem Open the bookmarklet setup page with the current token (gateway must be running).
setlocal
cd /d "%~dp0.."

for /f "delims=" %%i in ('node scripts\get-bookmarklet-url.mjs') do set "URL=%%i"
if not defined URL (
  echo [edge-page-ai] Could not read config. Please check config.local.json.
  pause
  exit /b 1
)

start "" "%URL%"
