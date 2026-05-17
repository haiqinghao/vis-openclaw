@echo off
echo ========================================
echo   VIS OpenClaw V1.1 - Quick Start
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
) else (
    echo [1/3] Dependencies already installed, skipping...
)

echo.
echo [2/3] Starting backend...
start "VIS-Backend" cmd /k "cd /d %~dp0packages\backend && npm run dev"

timeout /t 3 /nobreak >nul

echo [3/3] Starting frontend...
start "VIS-Frontend" cmd /k "cd /d %~dp0packages\frontend && npm run dev"

echo.
echo ========================================
echo   Started successfully!
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:4000
echo ========================================
echo.
pause
