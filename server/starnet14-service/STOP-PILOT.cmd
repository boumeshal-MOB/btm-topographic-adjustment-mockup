@echo off
setlocal
cd /d "%~dp0"

set "BTM_STARNET_LAUNCHER=%~f0"
powershell.exe -NoLogo -NoProfile -Command ^
  "$p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); if ($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Requesting administrator permission...
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process -FilePath $env:BTM_STARNET_LAUNCHER -Verb RunAs"
  exit /b
)

set "BTM_STARNET_PACKAGE=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop'; Get-ChildItem -LiteralPath $env:BTM_STARNET_PACKAGE -Recurse -File | Unblock-File; & (Join-Path $env:BTM_STARNET_PACKAGE 'stop-pilot.ps1')"
set "BTM_STARNET_EXIT_CODE=%ERRORLEVEL%"

echo.
pause
exit /b %BTM_STARNET_EXIT_CODE%
