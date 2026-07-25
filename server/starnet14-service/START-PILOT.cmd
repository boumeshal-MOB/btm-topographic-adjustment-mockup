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

echo Preparing the downloaded BTM STAR*NET package...
set "BTM_STARNET_PACKAGE=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop'; Get-ChildItem -LiteralPath $env:BTM_STARNET_PACKAGE -Recurse -File | Unblock-File; & (Join-Path $env:BTM_STARNET_PACKAGE 'start-pilot.ps1')"
set "BTM_STARNET_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%BTM_STARNET_EXIT_CODE%"=="0" (
  echo The STAR*NET pilot did not start. Keep this window open and share a screenshot of the red error only.
) else (
  echo Keep this window open until you have copied the service URL and access key.
)
echo.
pause
exit /b %BTM_STARNET_EXIT_CODE%
