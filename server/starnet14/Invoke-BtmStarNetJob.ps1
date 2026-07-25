[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$JobPath,

    [string]$OutgoingDirectory = "C:\BTM-StarNet\queue\outgoing",
    [string]$WorkRoot = "C:\BTM-StarNet\work",
    [string]$StarNetExe = "",
    [int]$LockTimeoutSeconds = 1800,
    [switch]$PreserveWorkspace
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Find-StarNetExecutable {
    param([string]$ExplicitPath)

    $candidates = @()
    if ($ExplicitPath) { $candidates += $ExplicitPath }
    if ($env:STARNET14_EXE) { $candidates += $env:STARNET14_EXE }
    $candidates += @(
        "C:\Program Files\MicroSurvey\StarNet 14\StarNet.exe",
        "C:\Program Files (x86)\MicroSurvey\StarNet 14\StarNet.exe"
    )

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }
    throw "STAR*NET 14 executable not found. Set STARNET14_EXE or pass -StarNetExe."
}

function Assert-SafeIdentifier {
    param([string]$Value, [string]$Field)
    if (-not $Value -or $Value -notmatch '^btm-[A-Za-z0-9._-]{1,80}$') {
        throw "Invalid $Field in job package."
    }
}

function Convert-ToInvariantString {
    param([double]$Value)
    return $Value.ToString([System.Globalization.CultureInfo]::InvariantCulture)
}

function Get-TextSha256 {
    param([string]$Text)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        return [System.BitConverter]::ToString($algorithm.ComputeHash($bytes)).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
    }
}

function Get-OutputFiles {
    param([string]$Workspace)

    $allowed = @(".lst", ".pts", ".err", ".dmp", ".sbf", ".log", ".csv")
    $items = @()
    foreach ($file in Get-ChildItem -LiteralPath $Workspace -File) {
        $extension = $file.Extension.ToLowerInvariant()
        if ($allowed -notcontains $extension) { continue }
        if ($file.Length -gt 20000000) {
            throw "Output file $($file.Name) exceeds the 20 MB bridge limit."
        }
        $content = [System.IO.File]::ReadAllText($file.FullName).Replace($Workspace, "<workspace>")
        $items += [ordered]@{
            name = $file.Name
            extension = $extension
            sizeBytes = [int64][System.Text.Encoding]::UTF8.GetByteCount($content)
            sha256 = Get-TextSha256 -Text $content
            content = $content
        }
    }
    return @($items)
}

$job = $null
$workspace = $null
$mutex = $null
$mutexAcquired = $false
$startedAt = [DateTime]::UtcNow
$stdout = ""
$stderr = ""
$exitCode = $null
$timedOut = $false
$outputs = @()
$starNetPath = ""
$starNetVersion = ""

try {
    $resolvedJobPath = (Resolve-Path -LiteralPath $JobPath).Path
    $job = Get-Content -LiteralPath $resolvedJobPath -Raw | ConvertFrom-Json

    if ($job.kind -ne "btm-starnet-job" -or [int]$job.schemaVersion -ne 1) {
        throw "Unsupported BTM STAR*NET job package."
    }
    Assert-SafeIdentifier -Value ([string]$job.jobId) -Field "jobId"
    if ([string]$job.files.dataFileName -ne "input.dat" -or [string]$job.files.projectFileName -ne "project.snproj") {
        throw "Only canonical input.dat/project.snproj filenames are accepted."
    }
    if ([int]$job.execution.timeoutSeconds -lt 30 -or [int]$job.execution.timeoutSeconds -gt 3600) {
        throw "Job timeout must be between 30 and 3600 seconds."
    }

    $starNetPath = Find-StarNetExecutable -ExplicitPath $StarNetExe
    $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($starNetPath)
    $starNetVersion = [string]$versionInfo.FileVersion

    New-Item -ItemType Directory -Force -Path $WorkRoot, $OutgoingDirectory | Out-Null
    $workspaceName = "$($job.jobId)-$([Guid]::NewGuid().ToString('N'))"
    $workspace = Join-Path $WorkRoot $workspaceName
    New-Item -ItemType Directory -Path $workspace | Out-Null

    $ascii = [System.Text.Encoding]::ASCII
    [System.IO.File]::WriteAllText((Join-Path $workspace "input.dat"), [string]$job.files.data, $ascii)
    [System.IO.File]::WriteAllText((Join-Path $workspace "project.snproj"), [string]$job.files.project, $ascii)

    $projectPath = Join-Path $workspace "project.snproj"
    $arguments = @("`"$projectPath`"")
    if ([string]$job.execution.mode -eq "auto-adjust") {
        $auto = $job.execution.autoAdjust
        $arguments += "/AUTOADJUST"
        $arguments += Convert-ToInvariantString -Value ([double]$auto.maxStandardizedResidual)
        $arguments += [int]$auto.outliersRemovedPerAdjustment
        $arguments += [int]$auto.maxAdjustments
    }
    else {
        $arguments += "/run"
    }
    if ([bool]$job.execution.noGraphics) {
        $arguments += "/NoGraphics"
    }

    $mutex = New-Object System.Threading.Mutex($false, "Global\BTM_STARNET_14_LICENSE")
    $mutexAcquired = $mutex.WaitOne([TimeSpan]::FromSeconds($LockTimeoutSeconds))
    if (-not $mutexAcquired) {
        throw "Timed out waiting for the STAR*NET licence lock."
    }

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $starNetPath
    $startInfo.Arguments = ($arguments -join " ")
    $startInfo.WorkingDirectory = $workspace
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "STAR*NET process could not be started."
    }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $completed = $process.WaitForExit([int]$job.execution.timeoutSeconds * 1000)
    if (-not $completed) {
        $timedOut = $true
        try { $process.Kill() } catch { }
        $process.WaitForExit()
    }
    else {
        $exitCode = [int]$process.ExitCode
    }
    $stdout = $stdoutTask.Result
    $stderr = $stderrTask.Result
    $stdout = $stdout.Replace($workspace, "<workspace>").Replace($starNetPath, "<STAR*NET>")
    $stderr = $stderr.Replace($workspace, "<workspace>").Replace($starNetPath, "<STAR*NET>")
    $outputs = Get-OutputFiles -Workspace $workspace

    $fatalErrorFile = $false
    foreach ($output in $outputs) {
        if ($output.extension -eq ".err" -and $output.content -match '(?im)Processing Terminated Due to Errors|^\s*ERROR\b') {
            $fatalErrorFile = $true
        }
    }
    $completedNormally = $stdout -match 'Network Processing Completed'
    $status = if ($timedOut) {
        "timed-out"
    }
    elseif ($exitCode -eq 0 -and -not $fatalErrorFile -and ($completedNormally -or ($outputs | Where-Object { $_.extension -eq ".lst" }))) {
        "succeeded"
    }
    else {
        "failed"
    }
    $errorMessage = if ($timedOut) {
        "STAR*NET exceeded the configured timeout."
    }
    elseif ($fatalErrorFile) {
        "STAR*NET produced a fatal .err output."
    }
    elseif ($exitCode -ne 0) {
        "STAR*NET returned exit code $exitCode."
    }
    elseif (-not $completedNormally -and -not ($outputs | Where-Object { $_.extension -eq ".lst" })) {
        "STAR*NET completion could not be confirmed."
    }
    else {
        $null
    }

    $result = [ordered]@{
        kind = "btm-starnet-result"
        schemaVersion = 1
        jobId = [string]$job.jobId
        processingId = [int]$job.processingId
        runId = [string]$job.runId
        status = $status
        exitCode = $exitCode
        startedAt = $startedAt.ToString("o")
        finishedAt = [DateTime]::UtcNow.ToString("o")
        starNet = [ordered]@{
            executableName = [System.IO.Path]::GetFileName($starNetPath)
            fileVersion = $starNetVersion
            noGraphics = [bool]$job.execution.noGraphics
            mode = [string]$job.execution.mode
        }
        console = [ordered]@{
            stdout = $stdout
            stderr = $stderr
        }
        outputFiles = @($outputs)
        error = $errorMessage
    }

    $resultPath = Join-Path $OutgoingDirectory "$($job.jobId).btmresult.json"
    $json = $result | ConvertTo-Json -Depth 10
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($resultPath, $json, $utf8NoBom)
    Write-Output $resultPath
}
catch {
    if ($job -and (([string]$job.jobId) -match '^btm-[A-Za-z0-9._-]{1,80}$')) {
        New-Item -ItemType Directory -Force -Path $OutgoingDirectory | Out-Null
        $safeError = [string]$_.Exception.Message
        if ($workspace) { $safeError = $safeError.Replace($workspace, "<workspace>") }
        if ($starNetPath) { $safeError = $safeError.Replace($starNetPath, "<STAR*NET>") }
        $failureResult = [ordered]@{
            kind = "btm-starnet-result"
            schemaVersion = 1
            jobId = [string]$job.jobId
            processingId = [int]$job.processingId
            runId = [string]$job.runId
            status = if ($timedOut) { "timed-out" } else { "failed" }
            exitCode = $exitCode
            startedAt = $startedAt.ToString("o")
            finishedAt = [DateTime]::UtcNow.ToString("o")
            starNet = [ordered]@{
                executableName = if ($starNetPath) { [System.IO.Path]::GetFileName($starNetPath) } else { "StarNet.exe" }
                fileVersion = $starNetVersion
                noGraphics = [bool]$job.execution.noGraphics
                mode = [string]$job.execution.mode
            }
            console = [ordered]@{
                stdout = $stdout
                stderr = $stderr
            }
            outputFiles = @($outputs)
            error = $safeError
        }
        $failurePath = Join-Path $OutgoingDirectory "$($job.jobId).btmresult.json"
        $failureJson = $failureResult | ConvertTo-Json -Depth 10
        $failureEncoding = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($failurePath, $failureJson, $failureEncoding)
        Write-Output $failurePath
    }
    else {
        throw
    }
}
finally {
    if ($mutexAcquired -and $mutex) {
        $mutex.ReleaseMutex()
    }
    if ($mutex) {
        $mutex.Dispose()
    }
    if ($workspace -and -not $PreserveWorkspace -and (Test-Path -LiteralPath $workspace)) {
        Remove-Item -LiteralPath $workspace -Recurse -Force
    }
}
