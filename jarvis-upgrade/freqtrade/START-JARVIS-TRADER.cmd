@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title JARVIS TRADER LAUNCHER

set "DASHBOARD=http://127.0.0.1:8080"
set "RUNNER=%CD%\jarvis-freqtrade-native.cmd"

if not exist "%RUNNER%" (
  echo [JARVIS] Runner not found: %RUNNER%
  pause
  exit /b 2
)

powershell.exe -NoProfile -Command "$c = New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1',8080); exit 0 } catch { exit 1 } finally { $c.Dispose() }" >nul 2>nul
if not errorlevel 1 (
  echo [JARVIS] Trader is already running. Opening dashboard...
  start "" "%DASHBOARD%"
  exit /b 0
)

echo [JARVIS] Starting AGGRESSIVE DRY-RUN in a separate window...
start "JARVIS TRADER ENGINE" cmd.exe /k ""%RUNNER%" aggressive"

echo [JARVIS] Waiting for dashboard...
for /L %%I in (1,1,30) do (
  powershell.exe -NoProfile -Command "$c = New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1',8080); exit 0 } catch { exit 1 } finally { $c.Dispose() }" >nul 2>nul
  if not errorlevel 1 goto open_dashboard
  timeout /t 1 /nobreak >nul
)

echo [JARVIS] Trader window started, but dashboard is not ready yet.
echo [JARVIS] You can open it later at %DASHBOARD%
pause
exit /b 1

:open_dashboard
echo [JARVIS] Dashboard is ready. Opening browser...
start "" "%DASHBOARD%"
exit /b 0
