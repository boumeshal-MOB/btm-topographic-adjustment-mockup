[CmdletBinding()]
param(
    [string]$ServiceUrl = "http://127.0.0.1:5080"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$health = $null
$lastError = $null
$deadline = [DateTime]::UtcNow.AddSeconds(30)
while ([DateTime]::UtcNow -lt $deadline -and $null -eq $health) {
    try {
        $health = Invoke-RestMethod `
            -Uri "$($ServiceUrl.TrimEnd('/'))/health" `
            -Method Get `
            -TimeoutSec 5
    } catch {
        $lastError = $_
        Start-Sleep -Milliseconds 500
    }
}
if ($null -eq $health) {
    throw "The execution service did not become reachable. Last error: $lastError"
}
if ($health.status -ne "ok") {
    throw "The execution service did not report a healthy state."
}
$health | ConvertTo-Json -Depth 4
if (-not $health.starNetAvailable -or -not $health.invocationScriptAvailable) {
    throw "The service is running, but STAR*NET or its invocation script is unavailable."
}
Write-Host "Local service test passed."
