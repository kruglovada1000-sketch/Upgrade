@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "BASE=https://raw.githubusercontent.com/kruglovada1000-sketch/Upgrade/main/jarvis-upgrade/freqtrade"

echo [JARVIS] Updating dashboard configuration and launchers...

curl.exe -fL "%BASE%/user_data/config.aggressive-dryrun.json" -o "%CD%\user_data\config.aggressive-dryrun.json"
if errorlevel 1 goto fail

curl.exe -fL "%BASE%/jarvis-freqtrade-native.cmd" -o "%CD%\jarvis-freqtrade-native.cmd"
if errorlevel 1 goto fail

curl.exe -fL "%BASE%/START-JARVIS-TRADER.cmd" -o "%CD%\START-JARVIS-TRADER.cmd"
if errorlevel 1 goto fail

curl.exe -fL "%BASE%/INSTALL-DESKTOP-LAUNCHER.cmd" -o "%CD%\INSTALL-DESKTOP-LAUNCHER.cmd"
if errorlevel 1 goto fail

call "%CD%\INSTALL-DESKTOP-LAUNCHER.cmd"
exit /b %errorlevel%

:fail
echo [JARVIS] Update failed. Check internet connection and retry.
pause
exit /b 1
