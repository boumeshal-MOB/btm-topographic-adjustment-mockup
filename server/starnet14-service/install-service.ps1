[CmdletBinding()]
param(
    [string]$SourceDirectory = (Join-Path $PSScriptRoot "publish"),
    [string]$InstallRoot = "C:\Program Files\BTM\StarNet Execution Service",
    [string]$DataRoot = "C:\ProgramData\BTM\StarNet",
    [string]$StarNetExecutable = "C:\Program Files\MicroSurvey\StarNet 14\StarNet.exe",
    [ValidateRange(1, 32)]
    [int]$LicensedSeats = 1,
    [string]$ServiceName = "BTMStarNetExecution",
    [string]$ListenUrl = "http://127.0.0.1:5080",
    [string]$ApiKey = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))) {
    throw "Run this installation script from PowerShell as Administrator."
}
if (-not (Test-Path -LiteralPath $SourceDirectory -PathType Container)) {
    throw "Publish folder not found. Run publish-win-x64.ps1 first."
}
if (-not (Test-Path -LiteralPath $StarNetExecutable -PathType Leaf)) {
    throw "STAR*NET 14 was not found at the configured path."
}
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    throw "Service $ServiceName already exists. Uninstall it before reinstalling."
}

if (-not $ApiKey) {
    $keyGenerator = Join-Path $PSScriptRoot "internal\New-BtmServiceApiKey.ps1"
    if (-not (Test-Path -LiteralPath $keyGenerator -PathType Leaf)) {
        throw "The API key generator is missing from the installation package."
    }
    $ApiKey = & $keyGenerator
}
if ($ApiKey.Length -lt 24) {
    throw "The API key must contain at least 24 characters."
}

New-Item -ItemType Directory -Force -Path $InstallRoot, $DataRoot | Out-Null
Copy-Item -Path (Join-Path $SourceDirectory "*") -Destination $InstallRoot -Recurse -Force

$settings = [ordered]@{
    Urls = $ListenUrl
    StarNet = [ordered]@{
        StarNetExecutable = $StarNetExecutable
        InvokeScript = Join-Path $InstallRoot "scripts\Invoke-BtmStarNetJob.ps1"
        ServiceDataRoot = $DataRoot
        MaximumConcurrentExecutions = $LicensedSeats
        QueueCapacity = 500
        ResultRetentionMinutes = 60
        PreserveFailedWorkspaces = $false
    }
    Logging = [ordered]@{
        LogLevel = [ordered]@{
            Default = "Information"
            "Microsoft.AspNetCore" = "Warning"
        }
    }
}
$settings | ConvertTo-Json -Depth 8 | Set-Content `
    -LiteralPath (Join-Path $InstallRoot "appsettings.json") `
    -Encoding UTF8

[Environment]::SetEnvironmentVariable("BTM_STARNET_API_KEY", $ApiKey, "Machine")
$executable = Join-Path $InstallRoot "Btm.StarNet.Service.exe"
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "Published service executable not found at $executable."
}

New-Service `
    -Name $ServiceName `
    -BinaryPathName "`"$executable`"" `
    -DisplayName "BTM STAR*NET Execution Service" `
    -Description "Runs isolated STAR*NET 14 adjustment jobs requested by BTM." `
    -StartupType Automatic | Out-Null
& sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/15000/restart/30000 | Out-Null
Start-Service -Name $ServiceName

Write-Host ""
Write-Host "BTM STAR*NET Execution Service is installed and running."
Write-Host "Local health URL: $ListenUrl/health"
Write-Host "Maximum parallel STAR*NET executions: $LicensedSeats"
Write-Host ""
Write-Host "COPY THIS ACCESS KEY NOW. It is shown only by this installation command:"
Write-Host $ApiKey
Write-Host ""
Write-Host "Do not commit the key. Keep the service bound to localhost and expose it through your HTTPS reverse proxy."
