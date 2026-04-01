@echo off
echo ========================================
echo   VIS OpenClaw V0.9 - Stop Services
echo ========================================
echo.

echo Stopping services...
taskkill /F /FI "WINDOWTITLE eq VIS-Backend*" 2>nul
taskkill /F /FI "WINDOWTITLE eq VIS-Frontend*" 2>nul

echo.
echo Services stopped.
echo ========================================
pause