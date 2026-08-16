@echo off
rem 打开带 token 的书签说明页（双击运行，需网关已启动）。
setlocal
cd /d "%~dp0.."

for /f "delims=" %%i in ('node scripts\get-bookmarklet-url.mjs') do set "URL=%%i"
if not defined URL (
  echo [edge-page-ai] 无法读取配置，请确认 config.local.json 存在。
  pause
  exit /b 1
)

start "" "%URL%"
