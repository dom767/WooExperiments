@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export-Website.ps1" %*
if errorlevel 1 (
    echo.
    echo Export failed.
    pause
    exit /b 1
)
echo.
pause
endlocal
