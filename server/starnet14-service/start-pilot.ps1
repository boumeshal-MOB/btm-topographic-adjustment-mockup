[CmdletBinding()]
param(
    [string]$StarNetExecutable = "C:\Program Files\MicroSurvey\StarNet 14\StarNet.exe",
    [ValidateRange(1, 32)]
    [int]$LicensedSeats = 1,
    [string]$ServiceName = "BTMStarNetExecution",
    [string]$ServiceUrl = "http://127.0.0.1:5080",
    [string]$PilotRoot = "C:\ProgramData\BTM\StarNet\PilotTunnel",
    [string]$BundledCloudflaredPath = (Join-Path $PSScriptRoot "cloudflared.exe"),
    [string]$CloudflaredDownloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))) {
        throw "Open PowerShell as Administrator, then run start-pilot.ps1 again."
    }
}

function Stop-PreviousPilotTunnel {
    param([string]$StatePath)

    if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
        return
    }
    try {
        $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
        $trackedProcess = Get-Process -Id ([int]$state.processId) -ErrorAction SilentlyContinue
        if ($null -ne $trackedProcess -and $trackedProcess.ProcessName -eq "cloudflared") {
            Stop-Process -Id $trackedProcess.Id -Force
            $trackedProcess.WaitForExit()
        }
    } finally {
        Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
    }
}

function Read-TunnelLog {
    param([string[]]$Paths)

    $content = ""
    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $content += [Environment]::NewLine
            $content += Get-Content -LiteralPath $path -Raw
        }
    }
    return $content
}

Assert-Administrator

$installScript = Join-Path $PSScriptRoot "install-service.ps1"
$testScript = Join-Path $PSScriptRoot "test-service.ps1"
if (-not (Test-Path -LiteralPath $installScript -PathType Leaf)) {
    throw "install-service.ps1 is missing from the extracted package."
}
if (-not (Test-Path -LiteralPath $testScript -PathType Leaf)) {
    throw "test-service.ps1 is missing from the extracted package."
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -eq $service) {
    Write-Host "Installing the BTM STAR*NET service..."
    & $installScript `
        -StarNetExecutable $StarNetExecutable `
        -LicensedSeats $LicensedSeats `
        -ServiceName $ServiceName
} elseif ($service.Status -ne "Running") {
    Write-Host "Starting the existing BTM STAR*NET service..."
    Start-Service -Name $ServiceName
}

& $testScript -ServiceUrl $ServiceUrl

$apiKey = [Environment]::GetEnvironmentVariable("BTM_STARNET_API_KEY", "Machine")
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 24) {
    throw "The machine API key is missing. Reinstall the BTM STAR*NET service."
}

New-Item -ItemType Directory -Force -Path $PilotRoot | Out-Null
$cloudflaredPath = Join-Path $PilotRoot "cloudflared.exe"
if (-not (Test-Path -LiteralPath $cloudflaredPath -PathType Leaf)) {
    if (Test-Path -LiteralPath $BundledCloudflaredPath -PathType Leaf) {
        Copy-Item -LiteralPath $BundledCloudflaredPath -Destination $cloudflaredPath
    } else {
        Write-Host "Downloading the official Cloudflare Tunnel client..."
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $temporaryDownload = Join-Path $PilotRoot "cloudflared.download"
        Invoke-WebRequest `
            -Uri $CloudflaredDownloadUrl `
            -OutFile $temporaryDownload `
            -UseBasicParsing
        if ((Get-Item -LiteralPath $temporaryDownload).Length -lt 1MB) {
            Remove-Item -LiteralPath $temporaryDownload -Force
            throw "The Cloudflare Tunnel download is unexpectedly small."
        }
        Move-Item -LiteralPath $temporaryDownload -Destination $cloudflaredPath -Force
    }
}

& $cloudflaredPath "--version"
if ($LASTEXITCODE -ne 0) {
    throw "cloudflared could not be started."
}

$statePath = Join-Path $PilotRoot "pilot-tunnel.json"
Stop-PreviousPilotTunnel -StatePath $statePath

$stdoutPath = Join-Path $PilotRoot "cloudflared.stdout.log"
$stderrPath = Join-Path $PilotRoot "cloudflared.stderr.log"
Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

# Quick Tunnels do not support a user's existing cloudflared config file. Give this pilot process
# a private, empty profile so it cannot accidentally reuse another tunnel configuration.
$previousUserProfile = $env:USERPROFILE
$previousHome = $env:HOME
$env:USERPROFILE = $PilotRoot
$env:HOME = $PilotRoot
try {
    $tunnelProcess = Start-Process `
        -FilePath $cloudflaredPath `
        -ArgumentList @(
            "tunnel",
            "--no-autoupdate",
            "--loglevel", "info",
            "--url", $ServiceUrl
        ) `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -WindowStyle Hidden `
        -PassThru
} finally {
    $env:USERPROFILE = $previousUserProfile
    $env:HOME = $previousHome
}

$publicUrl = $null
$deadline = [DateTime]::UtcNow.AddSeconds(60)
while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $tunnelProcess.Refresh()
    $log = Read-TunnelLog -Paths @($stdoutPath, $stderrPath)
    $match = [regex]::Match(
        $log,
        "https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com",
        [Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    if ($match.Success) {
        $publicUrl = $match.Value.ToLowerInvariant()
        break
    }
    if ($tunnelProcess.HasExited) {
        throw "The HTTPS tunnel stopped before returning a URL. See $stderrPath"
    }
}

if ([string]::IsNullOrWhiteSpace($publicUrl)) {
    Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
    throw "The HTTPS tunnel did not return a URL within 60 seconds. See $stderrPath"
}

$headers = @{ "X-BTM-StarNet-Key" = $apiKey }
$remoteHealth = $null
$lastRemoteError = $null
$remoteDeadline = [DateTime]::UtcNow.AddSeconds(30)
try {
    while ([DateTime]::UtcNow -lt $remoteDeadline -and $null -eq $remoteHealth) {
        try {
            $remoteHealth = Invoke-RestMethod `
                -Uri "$publicUrl/v1/health" `
                -Headers $headers `
                -Method Get `
                -TimeoutSec 10
        } catch {
            $lastRemoteError = $_
            Start-Sleep -Seconds 2
        }
    }
    if ($null -eq $remoteHealth) {
        throw "The public URL did not become reachable. Last error: $lastRemoteError"
    }
    if ($remoteHealth.status -ne "ok" -or -not $remoteHealth.starNetAvailable) {
        throw "The HTTPS tunnel is running, but the remote STAR*NET readiness test failed."
    }
} catch {
    Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
    throw
}

[ordered]@{
    processId = $tunnelProcess.Id
    serviceUrl = $publicUrl
    startedAtUtc = [DateTime]::UtcNow.ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

Write-Host ""
Write-Host "============================================================"
Write-Host "THE STAR*NET PILOT IS READY"
Write-Host "============================================================"
Write-Host "STAR*NET service URL:"
Write-Host $publicUrl
Write-Host ""
Write-Host "Service access key:"
Write-Host $apiKey
Write-Host ""
Write-Host "Enter these two values in the mockup Run page, then click Test service."
Write-Host "The key is not saved by the mockup. Do not send or commit it."
Write-Host "Keep the VM running during the test."
Write-Host "To stop the public pilot URL, double-click STOP-PILOT.cmd."
