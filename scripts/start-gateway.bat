@echo off
rem 前台启动网关（双击运行）。窗口保持打开；Ctrl+C 或直接关闭窗口即可停止。
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo [edge-page-ai] 未找到 Node.js，请先安装 Node.js 18.17 或更高版本。
  pause
  exit /b 1
)

echo [edge-page-ai] 正在启动网关...
echo [edge-page-ai] 启动后可在下方输出中找到书签页地址。
call npm start

echo.
echo [edge-page-ai] 网关已退出。
pause
