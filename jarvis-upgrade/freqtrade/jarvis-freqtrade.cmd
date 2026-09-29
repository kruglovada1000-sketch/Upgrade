@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if "%~1"=="" goto help
set "ACTION=%~1"

if /I "%ACTION%"=="doctor" goto doctor
if /I "%ACTION%"=="pull" goto pull
if /I "%ACTION%"=="strategies" goto strategies
if /I "%ACTION%"=="data" goto data
if /I "%ACTION%"=="benchmark" goto benchmark
if /I "%ACTION%"=="bias" goto bias
if /I "%ACTION%"=="ui" goto ui
goto help

:doctor
where docker >nul 2>nul
if errorlevel 1 (
  echo [JARVIS] Docker not found. Install Docker Desktop for Windows first.
  exit /b 2
)
echo [JARVIS] Docker:
docker --version
if errorlevel 1 exit /b 2
echo [JARVIS] Docker Compose:
docker compose version
if errorlevel 1 exit /b 2
echo [JARVIS] Freqtrade image check:
docker compose run --rm freqtrade --version
exit /b %errorlevel%

:pull
call "%~f0" doctor
if errorlevel 1 exit /b %errorlevel%
echo [JARVIS] Pulling official Freqtrade stable image...
docker compose pull
exit /b %errorlevel%

:strategies
if not exist "user_data\strategies" mkdir "user_data\strategies"
echo [JARVIS] Downloading official futures strategy candidates...
curl.exe -L "https://raw.githubusercontent.com/freqtrade/freqtrade-strategies/main/user_data/strategies/futures/FAdxSmaStrategy.py" -o "user_data\strategies\FAdxSmaStrategy.py"
if errorlevel 1 exit /b 3
curl.exe -L "https://raw.githubusercontent.com/freqtrade/freqtrade-strategies/main/user_data/strategies/futures/FSupertrendStrategy.py" -o "user_data\strategies\FSupertrendStrategy.py"
if errorlevel 1 exit /b 3
curl.exe -L "https://raw.githubusercontent.com/freqtrade/freqtrade-strategies/main/user_data/strategies/futures/TrendFollowingStrategy.py" -o "user_data\strategies\TrendFollowingStrategy.py"
if errorlevel 1 exit /b 3
echo [JARVIS] Strategies ready:
dir /b "user_data\strategies\*.py"
exit /b 0

:data
set "DAYS=%~2"
if "%DAYS%"=="" set "DAYS=180"
call "%~f0" doctor
if errorlevel 1 exit /b %errorlevel%
if not exist "user_data\strategies\FAdxSmaStrategy.py" call "%~f0" strategies
if errorlevel 1 exit /b %errorlevel%
echo [JARVIS] Downloading %DAYS% days of Bybit futures data for BTC/ETH/SOL...
docker compose run --rm freqtrade download-data --config /freqtrade/user_data/config.backtest.json --days %DAYS% --timeframes 5m 1h
exit /b %errorlevel%

:benchmark
call "%~f0" doctor
if errorlevel 1 exit /b %errorlevel%
if not exist "user_data\strategies\FAdxSmaStrategy.py" call "%~f0" strategies
if errorlevel 1 exit /b %errorlevel%
if not exist "user_data\backtest_results\jarvis" mkdir "user_data\backtest_results\jarvis"
echo.
echo ============================================================
echo [1/3] FAdxSmaStrategy - 1h with 5m detail
 echo ============================================================
docker compose run --rm freqtrade backtesting --config /freqtrade/user_data/config.backtest.json --strategy FAdxSmaStrategy --timeframe 1h --timeframe-detail 5m --cache none --export trades --backtest-directory /freqtrade/user_data/backtest_results/jarvis
if errorlevel 1 exit /b %errorlevel%
echo.
echo ============================================================
echo [2/3] FSupertrendStrategy - 1h with 5m detail
 echo ============================================================
docker compose run --rm freqtrade backtesting --config /freqtrade/user_data/config.backtest.json --strategy FSupertrendStrategy --timeframe 1h --timeframe-detail 5m --cache none --export trades --backtest-directory /freqtrade/user_data/backtest_results/jarvis
if errorlevel 1 exit /b %errorlevel%
echo.
echo ============================================================
echo [3/3] TrendFollowingStrategy - 5m
 echo ============================================================
docker compose run --rm freqtrade backtesting --config /freqtrade/user_data/config.backtest.json --strategy TrendFollowingStrategy --timeframe 5m --cache none --export trades --backtest-directory /freqtrade/user_data/backtest_results/jarvis
exit /b %errorlevel%

:bias
call "%~f0" doctor
if errorlevel 1 exit /b %errorlevel%
if not exist "user_data\strategies\FAdxSmaStrategy.py" call "%~f0" strategies
if errorlevel 1 exit /b %errorlevel%
echo [JARVIS] Lookahead analysis: FAdxSmaStrategy
docker compose run --rm freqtrade lookahead-analysis --config /freqtrade/user_data/config.backtest.json --strategy FAdxSmaStrategy --timeframe 1h --timeframe-detail 5m --minimum-trade-amount 10 --targeted-trade-amount 20
if errorlevel 1 exit /b %errorlevel%
echo [JARVIS] Lookahead analysis: FSupertrendStrategy
docker compose run --rm freqtrade lookahead-analysis --config /freqtrade/user_data/config.backtest.json --strategy FSupertrendStrategy --timeframe 1h --timeframe-detail 5m --minimum-trade-amount 10 --targeted-trade-amount 20
if errorlevel 1 exit /b %errorlevel%
echo [JARVIS] Lookahead analysis: TrendFollowingStrategy
docker compose run --rm freqtrade lookahead-analysis --config /freqtrade/user_data/config.backtest.json --strategy TrendFollowingStrategy --timeframe 5m --minimum-trade-amount 10 --targeted-trade-amount 20
exit /b %errorlevel%

:ui
call "%~f0" doctor
if errorlevel 1 exit /b %errorlevel%
echo [JARVIS] Starting local Freqtrade webserver on http://127.0.0.1:8080
echo [JARVIS] This module is research-only and dry-run configured.
docker compose run --rm --service-ports freqtrade webserver --config /freqtrade/user_data/config.backtest.json
exit /b %errorlevel%

:help
echo.
echo JARVIS + Freqtrade research module
echo.
echo   jarvis-freqtrade.cmd doctor
 echo   jarvis-freqtrade.cmd pull
 echo   jarvis-freqtrade.cmd strategies
 echo   jarvis-freqtrade.cmd data 180
 echo   jarvis-freqtrade.cmd benchmark
 echo   jarvis-freqtrade.cmd bias
 echo   jarvis-freqtrade.cmd ui
 echo.
echo No live trading command is included in this build.
exit /b 1
