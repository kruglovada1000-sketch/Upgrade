@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "TARGET=%CD%\START-JARVIS-TRADER.cmd"

if not exist "%TARGET%" (
  echo [JARVIS] START-JARVIS-TRADER.cmd not found.
  pause
  exit /b 2
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop'); $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut((Join-Path $desktop 'JARVIS TRADER.lnk')); $shortcut.TargetPath='%TARGET%'; $shortcut.WorkingDirectory='%CD%'; $shortcut.Description='Start JARVIS aggressive dry-run and open dashboard'; $shortcut.Save()"

if errorlevel 1 (
  echo [JARVIS] Failed to create desktop shortcut.
  pause
  exit /b 1
)

echo [JARVIS] Desktop shortcut created: JARVIS TRADER
pause
exit /b 0
