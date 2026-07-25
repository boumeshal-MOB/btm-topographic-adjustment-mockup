[CmdletBinding()]
param(
    [string]$ServiceUrl = "http://127.0.0.1:5080"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$health = Invoke-RestMethod -Uri "$($ServiceUrl.TrimEnd('/'))/health" -Method Get
if ($health.status -ne "ok") {
    throw "The execution service did not report a healthy state."
}
$health | ConvertTo-Json -Depth 4
if (-not $health.starNetAvailable -or -not $health.invocationScriptAvailable) {
    throw "The service is running, but STAR*NET or its invocation script is unavailable."
}
Write-Host "Local service test passed."
