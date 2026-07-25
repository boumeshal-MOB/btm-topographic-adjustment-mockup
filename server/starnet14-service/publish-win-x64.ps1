[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "publish"),
    [switch]$FrameworkDependent
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$project = Join-Path $PSScriptRoot "src\Btm.StarNet.Service\Btm.StarNet.Service.csproj"
$runner = Join-Path $PSScriptRoot "..\starnet14\Invoke-BtmStarNetJob.ps1"

$arguments = @(
    "publish", $project,
    "--configuration", "Release",
    "--runtime", "win-x64",
    "--output", $OutputDirectory,
    "-p:PublishSingleFile=true",
    "-p:DebugType=None",
    "-p:DebugSymbols=false"
)
if ($FrameworkDependent) {
    $arguments += "--no-self-contained"
}
else {
    $arguments += "--self-contained"
    $arguments += "true"
}

& dotnet @arguments
if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish failed with exit code $LASTEXITCODE."
}

$scripts = Join-Path $OutputDirectory "scripts"
New-Item -ItemType Directory -Force -Path $scripts | Out-Null
Copy-Item -LiteralPath $runner -Destination (Join-Path $scripts "Invoke-BtmStarNetJob.ps1") -Force
Write-Host "Publish package created at $OutputDirectory"
