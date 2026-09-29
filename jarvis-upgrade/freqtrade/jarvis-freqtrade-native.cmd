@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "ENGINE=%CD%\engine"
set "FT=%ENGINE%\.venv\Scripts\freqtrade.exe"
set "USERDIR=%CD%\user_data"
set "STRATDIR=%USERDIR%\strategies"
set "DASHBOARD=http://127.0.0.1:8080"

if "%~1"=="" goto help
set "ACTION=%~1"

if /I "%ACTION%"=="install" goto install
if /I "%ACTION%"=="doctor" goto doctor
if /I "%ACTION%"=="strategies" goto strategies
if /I "%ACTION%"=="data" goto data
if /I "%ACTION%"=="benchmark" goto benchmark
if /I "%ACTION%"=="aggressive" goto aggressive
if /I "%ACTION%"=="dashboard" goto dashboard
if /I "%ACTION%"=="stop" goto stop
goto help

:install
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\install-native.ps1"
exit /b %errorlevel%

:doctor
if not exist "%FT%" (
  echo [JARVIS] Native Freqtrade is not installed yet.
  echo [JARVIS] Run: jarvis-freqtrade-native.cmd install
  exit /b 2
)
echo [JARVIS] Native Freqtrade:
"%FT%" --version
exit /b %errorlevel%

:strategies
if not exist "%STRATDIR%" mkdir "%STRATDIR%"
echo [JARVIS] Downloading official futures strategy candidates...
curl.exe -L "https://raw.githubusercontent.com/freqtrade/freqtrade-strategies/main/user_data/strategies/futures/FAdxSmaStrategy.py" -o "%STRATDIR%\FAdxSmaStrategy.py"
if errorlevel 1 exit /b 3
curl.exe -L "https://raw.githubusercontent.com/freqtrade/freqtrade-strategies/main/user_data/strategies/futures/FSupertrendStrategy.py" -o "%STRATDIR%\FSupertrendStrategy.py"
if errorlevel 1 exit /b 3
curl.exe -L "https://raw.githubusercontent.com/freqtrade/freqtrade-strategies/main/user_data/strategies/futures/TrendFollowingStrategy.py" -o "%STRATDIR%\TrendFollowingStrategy.py"
if errorlevel 1 exit /b 3
echo [JARVIS] Strategies ready:
dir /b "%STRATDIR%\*.py"
exit /b 0

:data
call "%~f0" doctor
if errorlevel 1 exit /b %errorlevel%
set "DAYS=%~2"
if "%DAYS%"=="" set "DAYS=180"
if not exist "%STRATDIR%\FAdxSmaStrategy.py" call "%~f0" strategies
if errorlevel 1 exit /b %errorlevel%
echo [JARVIS] Downloading %DAYS% days of Bybit futures data...
"%FT%" download-data --userdir "%USERDIR%" --config "%USERDIR%\config.backtest.json" --days %DAYS% --timeframes 5m 1h
exit /b %errorlevel%

:benchmark
call "%~f0" doctor
if errorlevel 1 exit /b %errorlevel%
if not exist "%STRATDIR%\FAdxSmaStrategy.py" call "%~f0" strategies
if errorlevel 1 exit /b %errorlevel%
echo [JARVIS] Benchmarking 3 official futures strategies...
"%FT%" backtesting --userdir "%USERDIR%" --config "%USERDIR%\config.backtest.json" --strategy-path "%STRATDIR%" --strategy-list FAdxSmaStrategy FSupertrendStrategy TrendFollowingStrategy --cache none
exit /b %errorlevel%

:aggressive
call "%~f0" doctor
if errorlevel 1 exit /b %errorlevel%
if not exist "%STRATDIR%\FAdxSmaStrategy.py" call "%~f0" strategies
if errorlevel 1 exit /b %errorlevel%
set "STRATEGY=%~2"
if "%STRATEGY%"=="" set "STRATEGY=FSupertrendStrategy"
echo ============================================================
echo JARVIS AGGRESSIVE DRY-RUN
echo Strategy: %STRATEGY%
echo Wallet: virtual 10000 USDT
echo Max open trades: 3
echo Stake per trade: 2000 USDT
echo Real orders: DISABLED
echo Dashboard: %DASHBOARD%
echo Login: jarvis
echo Password: jarvis-local-2026
echo ============================================================
"%FT%" trade --userdir "%USERDIR%" --config "%USERDIR%\config.aggressive-dryrun.json" --strategy-path "%STRATDIR%" --strategy "%STRATEGY%"
exit /b %errorlevel%

:dashboard
start "" "%DASHBOARD%"
exit /b 0

:stop
echo [JARVIS] Stop the running dry-run with Ctrl+C in its PowerShell window.
exit /b 0

:help
echo.
echo JARVIS + Freqtrade native Windows module
echo.
echo   jarvis-freqtrade-native.cmd install
echo   jarvis-freqtrade-native.cmd doctor
echo   jarvis-freqtrade-native.cmd strategies
echo   jarvis-freqtrade-native.cmd data 180
echo   jarvis-freqtrade-native.cmd benchmark
echo   jarvis-freqtrade-native.cmd aggressive [StrategyName]
echo   jarvis-freqtrade-native.cmd dashboard
echo.
echo Aggressive mode is DRY-RUN only. No live trading command is included.
exit /b 1
