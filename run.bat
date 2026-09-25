@echo off
title AI CodePass
cd /d "%~dp0"

echo ========================================================
echo         Starting AI CodePass Desktop Application
echo ========================================================
echo.

call npm run tauri:dev

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to launch AI CodePass. Error code: %errorlevel%
    echo Please check the error message above.
    pause
)
