@echo off
title DSA Tracker Server
color 0F
echo ============================================================
echo   DSA Tracker -- Editorial Paper Pro  (56 chapters)
echo   Starting server at http://localhost:3000  ...
echo ============================================================
echo.

:: Always run from the server directory (this bat lives in tracker root)
cd /d "%~dp0server"

:: Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo [ERROR] Node.js not found! Install from https://nodejs.org
  pause
  exit /b 1
)

:: Install deps if missing
if not exist "node_modules" (
  echo Installing dependencies - first run...
  call npm install
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed. See output above.
    pause
    exit /b 1
  )
)

:: Start server in a persistent (minimized) window with logging
echo Starting Express server (server.js)...
if not exist "logs" mkdir logs
start "DSA-Tracker-Server" /min cmd /k "node server.js ^> logs\server.log 2^>^&1"

:: Wait for health endpoint (up to 30s) instead of a blind sleep
echo Waiting for server to be ready...
set READY=0
set COUNT=0
:waitloop
curl -s -o nul --max-time 2 http://localhost:3000/api/health >nul 2>nul
if %ERRORLEVEL% equ 0 (
  set READY=1
  goto :ready
)
set /a COUNT+=1 >nul
if %COUNT% GEQ 30 goto :ready
timeout /t 1 /nobreak >nul
goto :waitloop
:ready
if "%READY%"=="0" (
  echo [ERROR] Server did not respond in 30s. Check server\logs\server.log
  pause
  exit /b 1
)
echo Server is up!

:: Open in Chrome App mode if available, else default browser
where chrome >nul 2>nul
if %ERRORLEVEL% equ 0 (
  start "" chrome --app=http://localhost:3000 --window-size=1280,900
) else (
  start "" http://localhost:3000
)

echo.
echo Server running at http://localhost:3000  (logs: server\logs\server.log)
echo To STOP the server: taskkill /F /FI "WINDOWTITLE eq DSA-Tracker-Server*"
echo You can close this window now - the server keeps running.
pause
