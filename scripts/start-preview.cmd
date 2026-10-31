@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo LexiLoom requires Node.js 22 or newer in PATH.
  exit /b 1
)
node "%~dp0start.js" preview
exit /b %errorlevel%
