@echo off
rem GICC compatibility shim for gpt-in-claude-code. The canonical command is gicc.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0claudex.ps1" %*
exit /b %ERRORLEVEL%
