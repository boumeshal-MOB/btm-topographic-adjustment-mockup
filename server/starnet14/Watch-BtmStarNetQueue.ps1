[CmdletBinding()]
param(
    [string]$QueueRoot = "C:\BTM-StarNet\queue",
    [string]$WorkRoot = "C:\BTM-StarNet\work",
    [string]$StarNetExe = "",
    [int]$PollSeconds = 5,
    [switch]$Once,
    [switch]$PreserveWorkspace
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$incoming = Join-Path $QueueRoot "incoming"
$processing = Join-Path $QueueRoot "processing"
$outgoing = Join-Path $QueueRoot "outgoing"
$processed = Join-Path $QueueRoot "processed"
$failed = Join-Path $QueueRoot "failed"
New-Item -ItemType Directory -Force -Path $incoming, $processing, $outgoing, $processed, $failed, $WorkRoot | Out-Null

$invokeScript = Join-Path $PSScriptRoot "Invoke-BtmStarNetJob.ps1"

Write-Host "BTM STAR*NET 14 queue worker"
Write-Host "Incoming: $incoming"
Write-Host "Outgoing: $outgoing"
Write-Host "Stop with Ctrl+C."

do {
    $jobs = @(Get-ChildItem -LiteralPath $incoming -Filter "*.btmjob.json" -File | Sort-Object CreationTimeUtc)
    foreach ($job in $jobs) {
        $claimedPath = Join-Path $processing $job.Name
        try {
            Move-Item -LiteralPath $job.FullName -Destination $claimedPath -ErrorAction Stop
        }
        catch {
            continue
        }

        try {
            $arguments = @{
                JobPath = $claimedPath
                OutgoingDirectory = $outgoing
                WorkRoot = $WorkRoot
                StarNetExe = $StarNetExe
                PreserveWorkspace = $PreserveWorkspace
            }
            $resultPath = & $invokeScript @arguments
            $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json
            $destination = if ($result.status -eq "succeeded") { $processed } else { $failed }
            Move-Item -LiteralPath $claimedPath -Destination (Join-Path $destination $job.Name) -Force
            Write-Host "[$([DateTime]::Now.ToString('s'))] $($job.Name) -> $($result.status)"
        }
        catch {
            Move-Item -LiteralPath $claimedPath -Destination (Join-Path $failed $job.Name) -Force
            $failureLog = Join-Path $failed "$($job.BaseName).worker-error.txt"
            $_ | Out-String | Set-Content -LiteralPath $failureLog -Encoding UTF8
            Write-Warning "Job $($job.Name) failed in the worker: $($_.Exception.Message)"
        }
    }

    if (-not $Once) {
        Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
    }
}
while (-not $Once)
