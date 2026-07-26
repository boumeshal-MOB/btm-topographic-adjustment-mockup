[CmdletBinding()]
param(
    [string]$PilotRoot = "C:\ProgramData\BTM\StarNet\PilotTunnel",
    [string]$ServiceName = "BTMStarNetExecution"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$statePath = Join-Path $PilotRoot "pilot-tunnel.json"
if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
    Write-Host "No active BTM STAR*NET pilot tunnel was recorded."
    exit 0
}

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$tunnelProperty = $state.PSObject.Properties["processId"]
if ($null -ne $tunnelProperty -and $null -ne $tunnelProperty.Value) {
    $tunnel = Get-Process -Id ([int]$tunnelProperty.Value) -ErrorAction SilentlyContinue
    if ($null -ne $tunnel -and $tunnel.ProcessName -eq "cloudflared") {
        Stop-Process -Id $tunnel.Id -Force
        $tunnel.WaitForExit()
    }
}
$executionHostProperty = $state.PSObject.Properties["executionHostProcessId"]
if ($null -ne $executionHostProperty -and $null -ne $executionHostProperty.Value) {
    $executionHost = Get-Process `
        -Id ([int]$executionHostProperty.Value) `
        -ErrorAction SilentlyContinue
    if ($null -ne $executionHost -and $executionHost.ProcessName -eq "Btm.StarNet.Service") {
        Stop-Process -Id $executionHost.Id -Force
        $executionHost.WaitForExit()
    }
}
$serviceStateProperty = $state.PSObject.Properties["windowsServiceWasRunning"]
if ($null -ne $serviceStateProperty -and $serviceStateProperty.Value -eq $true) {
    $windowsService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -ne $windowsService -and $windowsService.Status -ne "Running") {
        Start-Service -Name $ServiceName
        $windowsService.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
    }
}
Remove-Item -LiteralPath $statePath -Force

Write-Host "The public pilot is stopped. The local BTM STAR*NET Windows service remains installed."
