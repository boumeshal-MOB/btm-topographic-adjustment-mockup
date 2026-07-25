@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Watch-BtmStarNetQueue.ps1"
if errorlevel 1 (
  echo.
  echo Worker stopped with an error. Review the message above.
  pause
)
endlocal
