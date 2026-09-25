@echo off
title AI CodePass Launcher
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
if %ERRORLEVEL% neq 0 pause
