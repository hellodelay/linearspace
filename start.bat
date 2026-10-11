@echo off
rem Starts the local dev server and opens the prototype in the default browser.
rem Usage: start.bat [port]
setlocal
set "ROOT=%~dp0"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

cd /d "%ROOT%"
start "" "http://localhost:%PORT%/"
call npm run serve -- %PORT%
endlocal
