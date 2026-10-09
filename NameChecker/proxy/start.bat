@echo off
cd /d "%~dp0"

if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo Failed to install dependencies. Make sure Node.js is installed.
    pause
    exit /b 1
  )
)

echo Starting domain availability proxy...
start "" node server.js

echo Waiting for server to start...
timeout /t 2 /nobreak >nul

echo Opening browser...
start http://localhost:3456/

echo.
echo Server is running. Close the server window to stop.
pause
