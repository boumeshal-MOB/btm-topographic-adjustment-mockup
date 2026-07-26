[CmdletBinding()]
param(
    [string]$StarNetExecutable = "C:\Program Files\MicroSurvey\StarNet 14\StarNet.exe",
    [ValidateRange(1, 32)]
    [int]$LicensedSeats = 1,
    [string]$ServiceName = "BTMStarNetExecution",
    [string]$ServiceUrl = "http://127.0.0.1:5080",
    [string]$InstallRoot = "C:\Program Files\BTM\StarNet Execution Service",
    [string]$PilotRoot = "C:\ProgramData\BTM\StarNet\PilotTunnel",
    [bool]$RunExecutionHostInteractively = $true,
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

function Stop-PreviousPilot {
    param(
        [string]$StatePath,
        [string]$WindowsServiceName
    )

    if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
        return
    }
    try {
        $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
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
            $windowsService = Get-Service -Name $WindowsServiceName -ErrorAction SilentlyContinue
            if ($null -ne $windowsService -and $windowsService.Status -ne "Running") {
                Start-Service -Name $WindowsServiceName
                $windowsService.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
            }
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

function Update-ExistingService {
    param(
        [string]$Name,
        [string]$PackagePublish,
        [string]$Destination
    )

    $packagedExecutable = Join-Path $PackagePublish "Btm.StarNet.Service.exe"
    $installedExecutable = Join-Path $Destination "Btm.StarNet.Service.exe"
    $packagedRunner = Join-Path $PackagePublish "scripts\Invoke-BtmStarNetJob.ps1"
    $installedRunner = Join-Path $Destination "scripts\Invoke-BtmStarNetJob.ps1"
    if (-not (Test-Path -LiteralPath $packagedExecutable -PathType Leaf) -or
        -not (Test-Path -LiteralPath $packagedRunner -PathType Leaf)) {
        throw "The downloaded package is incomplete. The service cannot be updated."
    }

    $needsUpdate =
        -not (Test-Path -LiteralPath $installedExecutable -PathType Leaf) -or
        -not (Test-Path -LiteralPath $installedRunner -PathType Leaf) -or
        (Get-FileHash -LiteralPath $packagedExecutable -Algorithm SHA256).Hash -ne
            (Get-FileHash -LiteralPath $installedExecutable -Algorithm SHA256).Hash -or
        (Get-FileHash -LiteralPath $packagedRunner -Algorithm SHA256).Hash -ne
            (Get-FileHash -LiteralPath $installedRunner -Algorithm SHA256).Hash
    if (-not $needsUpdate) {
        return
    }

    Write-Host "Updating the existing BTM STAR*NET service from this package..."
    $service = Get-Service -Name $Name -ErrorAction Stop
    if ($service.Status -ne "Stopped") {
        Stop-Service -Name $Name -Force
        $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
    }

    $settingsPath = Join-Path $Destination "appsettings.json"
    $savedSettings = if (Test-Path -LiteralPath $settingsPath -PathType Leaf) {
        [System.IO.File]::ReadAllBytes($settingsPath)
    } else {
        $null
    }
    try {
        New-Item -ItemType Directory -Force -Path $Destination | Out-Null
        Copy-Item -Path (Join-Path $PackagePublish "*") -Destination $Destination -Recurse -Force
        if ($null -ne $savedSettings) {
            [System.IO.File]::WriteAllBytes($settingsPath, $savedSettings)
        }
    } finally {
        Start-Service -Name $Name
    }
    (Get-Service -Name $Name).WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
    Write-Host "Existing BTM STAR*NET service updated."
}

Assert-Administrator

$statePath = Join-Path $PilotRoot "pilot-tunnel.json"
New-Item -ItemType Directory -Force -Path $PilotRoot | Out-Null
Stop-PreviousPilot -StatePath $statePath -WindowsServiceName $ServiceName

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
} else {
    Update-ExistingService `
        -Name $ServiceName `
        -PackagePublish (Join-Path $PSScriptRoot "publish") `
        -Destination $InstallRoot
    $service = Get-Service -Name $ServiceName
    if ($service.Status -ne "Running") {
        Write-Host "Starting the existing BTM STAR*NET service..."
        Start-Service -Name $ServiceName
    }
}

$apiKey = [Environment]::GetEnvironmentVariable("BTM_STARNET_API_KEY", "Machine")
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey.Length -lt 24) {
    throw "The machine API key is missing. Reinstall the BTM STAR*NET service."
}

$executionHostProcess = $null
$windowsServiceWasRunning = $false
if ($RunExecutionHostInteractively) {
    $service = Get-Service -Name $ServiceName -ErrorAction Stop
    $windowsServiceWasRunning = $service.Status -eq "Running"
    if ($service.Status -ne "Stopped") {
        Write-Host "Switching the pilot to the current Windows user for STAR*NET Typical..."
        Stop-Service -Name $ServiceName -Force
        $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
    }

    $executionHostPath = Join-Path $InstallRoot "Btm.StarNet.Service.exe"
    if (-not (Test-Path -LiteralPath $executionHostPath -PathType Leaf)) {
        throw "The installed BTM STAR*NET execution host is missing."
    }
    $executionHostStdout = Join-Path $PilotRoot "execution-host.stdout.log"
    $executionHostStderr = Join-Path $PilotRoot "execution-host.stderr.log"
    Remove-Item `
        -LiteralPath $executionHostStdout, $executionHostStderr `
        -Force `
        -ErrorAction SilentlyContinue

    # A Typical STAR*NET installation uses the interactive user's licence/profile. Running the
    # HTTP host in that same session makes /RUN behave like the user's known-good BAT command.
    $env:BTM_STARNET_API_KEY = $apiKey
    $executionHostProcess = Start-Process `
        -FilePath $executionHostPath `
        -WorkingDirectory $InstallRoot `
        -RedirectStandardOutput $executionHostStdout `
        -RedirectStandardError $executionHostStderr `
        -WindowStyle Hidden `
        -PassThru

    [ordered]@{
        processId = $null
        executionHostProcessId = $executionHostProcess.Id
        windowsServiceWasRunning = $windowsServiceWasRunning
        serviceUrl = $null
        startedAtUtc = [DateTime]::UtcNow.ToString("o")
    } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}

& $testScript -ServiceUrl $ServiceUrl

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

if ($null -ne $remoteHealth -and
    ($remoteHealth.status -ne "ok" -or -not $remoteHealth.starNetAvailable)) {
    Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
    throw "The HTTPS tunnel is running, but the remote STAR*NET readiness test failed."
}

$remoteHealthConfirmed = $null -ne $remoteHealth
if (-not $remoteHealthConfirmed) {
    Write-Warning "The VM could not resolve or call its own public tunnel URL."
    Write-Warning "The tunnel remains running. The mockup's Test service button is the external readiness check."
    Write-Warning "VM self-check error: $lastRemoteError"
}

[ordered]@{
    processId = $tunnelProcess.Id
    executionHostProcessId = if ($null -ne $executionHostProcess) {
        $executionHostProcess.Id
    } else {
        $null
    }
    windowsServiceWasRunning = $windowsServiceWasRunning
    serviceUrl = $publicUrl
    startedAtUtc = [DateTime]::UtcNow.ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8

Write-Host ""
Write-Host "============================================================"
if ($remoteHealthConfirmed) {
    Write-Host "THE STAR*NET PILOT IS READY"
} else {
    Write-Host "THE STAR*NET PILOT URL IS READY FOR EXTERNAL TEST"
}
Write-Host "============================================================"
Write-Host "STAR*NET service URL:"
Write-Host $publicUrl
Write-Host ""
Write-Host "Service access key:"
Write-Host $apiKey
Write-Host ""
Write-Host "Enter these two values in the mockup Run page, then click Test service."
Write-Host "The key is not saved by the mockup. Do not send or commit it."
if ($RunExecutionHostInteractively) {
    Write-Host "Pilot execution mode: current Windows user (required by STAR*NET Typical)."
}
Write-Host "Keep the VM running during the test."
Write-Host "To stop the public pilot URL, double-click STOP-PILOT.cmd."
