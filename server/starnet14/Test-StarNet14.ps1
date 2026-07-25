[CmdletBinding()]
param(
    [string]$StarNetExe = "",
    [string]$JobPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$candidates = @()
if ($StarNetExe) { $candidates += $StarNetExe }
if ($env:STARNET14_EXE) { $candidates += $env:STARNET14_EXE }
$candidates += @(
    "C:\Program Files\MicroSurvey\StarNet 14\StarNet.exe",
    "C:\Program Files (x86)\MicroSurvey\StarNet 14\StarNet.exe"
)

$resolved = $null
foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        $resolved = (Resolve-Path -LiteralPath $candidate).Path
        break
    }
}
if (-not $resolved) {
    throw "STAR*NET 14 was not found. Pass -StarNetExe or set STARNET14_EXE."
}

$version = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($resolved)
Write-Host "STAR*NET executable: $resolved"
Write-Host "File version: $($version.FileVersion)"
Write-Host "Product: $($version.ProductName)"
Write-Host ""
Write-Host "Before unattended use, run STAR*NET once as Administrator and verify the Ultimate licence."

if ($JobPath) {
    Write-Host ""
    Write-Host "Running bridge job: $JobPath"
    & (Join-Path $PSScriptRoot "Invoke-BtmStarNetJob.ps1") `
        -JobPath $JobPath `
        -StarNetExe $resolved `
        -OutgoingDirectory (Join-Path $PSScriptRoot "test-output") `
        -WorkRoot (Join-Path $PSScriptRoot "test-work") `
        -PreserveWorkspace
}
