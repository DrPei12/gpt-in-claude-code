@echo off
node "%~dp0bin\gicc-package.mjs" %*
exit /b %ERRORLEVEL%
