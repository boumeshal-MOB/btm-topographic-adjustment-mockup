[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$ServiceName = "BTMStarNetExecution",
    [string]$InstallRoot = "C:\Program Files\BTM\StarNet Execution Service",
    [switch]$DeleteData,
    [string]$DataRoot = "C:\ProgramData\BTM\StarNet"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service -and ($PSCmdlet.ShouldProcess($ServiceName, "Stop and remove Windows service"))) {
    if ($service.Status -ne "Stopped") {
        Stop-Service -Name $ServiceName -Force
    }
    & sc.exe delete $ServiceName | Out-Null
}
if ((Test-Path -LiteralPath $InstallRoot) -and
    ($PSCmdlet.ShouldProcess($InstallRoot, "Delete service files"))) {
    Remove-Item -LiteralPath $InstallRoot -Recurse -Force
}
[Environment]::SetEnvironmentVariable("BTM_STARNET_API_KEY", $null, "Machine")
if ($DeleteData -and
    (Test-Path -LiteralPath $DataRoot) -and
    ($PSCmdlet.ShouldProcess($DataRoot, "Delete temporary service data"))) {
    Remove-Item -LiteralPath $DataRoot -Recurse -Force
}
