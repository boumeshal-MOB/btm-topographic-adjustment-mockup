[CmdletBinding()]
param(
    [string]$PilotRoot = "C:\ProgramData\BTM\StarNet\PilotTunnel"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$statePath = Join-Path $PilotRoot "pilot-tunnel.json"
if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
    Write-Host "No active BTM STAR*NET pilot tunnel was recorded."
    exit 0
}

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$trackedProcess = Get-Process -Id ([int]$state.processId) -ErrorAction SilentlyContinue
if ($null -ne $trackedProcess -and $trackedProcess.ProcessName -eq "cloudflared") {
    Stop-Process -Id $trackedProcess.Id -Force
    $trackedProcess.WaitForExit()
}
Remove-Item -LiteralPath $statePath -Force

Write-Host "The public pilot URL is stopped. The local BTM STAR*NET Windows service remains installed."
