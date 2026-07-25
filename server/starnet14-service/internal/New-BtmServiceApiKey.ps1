[CmdletBinding()]
param(
    [ValidateRange(24, 128)]
    [int]$ByteCount = 32
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$bytes = New-Object byte[] $ByteCount
$generator = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $generator.GetBytes($bytes)
} finally {
    $generator.Dispose()
}

[Convert]::ToBase64String($bytes)
