using System.Diagnostics;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Btm.StarNet.Service;

public sealed class StarNetPowerShellExecutor(
    IOptions<StarNetServiceOptions> options,
    ILogger<StarNetPowerShellExecutor> logger)
{
    private const int MaximumResultBytes = 4_000_000;
    private readonly StarNetServiceOptions _options = options.Value;

    public async Task<string> ExecuteAsync(
        StarNetJob job,
        int executionSlot,
        CancellationToken serviceCancellation)
    {
        AssertLocalInstallation();
        if (!job.Execution.NoGraphics && !Environment.UserInteractive)
        {
            throw new InvalidOperationException(
                "STAR*NET Standard CLI requires an interactive Windows user session. "
                + "Use the interactive pilot host for a Typical installation, or install "
                + "the Custom No Graphics component before selecting No Graphics CLI.");
        }
        var attemptsRoot = Path.Combine(_options.ServiceDataRoot, "attempts");
        var workRoot = Path.Combine(_options.ServiceDataRoot, "work");
        Directory.CreateDirectory(attemptsRoot);
        Directory.CreateDirectory(workRoot);

        var attemptRoot = Path.Combine(
            attemptsRoot,
            $"{job.JobId}-{Guid.NewGuid():N}");
        var outgoing = Path.Combine(attemptRoot, "outgoing");
        Directory.CreateDirectory(outgoing);
        var jobPath = Path.Combine(attemptRoot, $"{job.JobId}.btmjob.json");
        await File.WriteAllTextAsync(
            jobPath,
            JsonSerializer.Serialize(job, JsonDefaults.Options),
            serviceCancellation);
        var completedSuccessfully = false;

        try
        {
            using var process = new Process
            {
                StartInfo = BuildStartInfo(jobPath, outgoing, workRoot, executionSlot)
            };
            if (!process.Start())
                throw new InvalidOperationException("The STAR*NET launcher could not be started.");

            var stdoutTask = process.StandardOutput.ReadToEndAsync(serviceCancellation);
            var stderrTask = process.StandardError.ReadToEndAsync(serviceCancellation);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(serviceCancellation);
            timeout.CancelAfter(TimeSpan.FromSeconds(job.Execution.TimeoutSeconds + 120));

            try
            {
                await process.WaitForExitAsync(timeout.Token);
            }
            catch (OperationCanceledException) when (serviceCancellation.IsCancellationRequested)
            {
                TryKill(process);
                throw;
            }
            catch (OperationCanceledException) when (!serviceCancellation.IsCancellationRequested)
            {
                TryKill(process);
                throw new TimeoutException("The STAR*NET launcher exceeded its timeout.");
            }

            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            var resultPath = Path.Combine(outgoing, $"{job.JobId}.btmresult.json");
            if (!File.Exists(resultPath))
            {
                logger.LogWarning(
                    "STAR*NET launcher returned {ExitCode} without a result for {JobId}. stderr length: {Length}",
                    process.ExitCode,
                    job.JobId,
                    stderr.Length);
                throw new InvalidOperationException("STAR*NET did not produce a result package.");
            }

            var fileInfo = new FileInfo(resultPath);
            if (fileInfo.Length > MaximumResultBytes)
                throw new InvalidOperationException("STAR*NET result exceeds the service limit.");
            var resultJson = await File.ReadAllTextAsync(resultPath, serviceCancellation);
            ValidateResultIdentity(resultJson, job.JobId);
            logger.LogInformation(
                "STAR*NET run {JobId} completed on slot {Slot}; launcher stdout length: {Length}",
                job.JobId,
                executionSlot,
                stdout.Length);
            completedSuccessfully = true;
            return resultJson;
        }
        finally
        {
            if (Directory.Exists(attemptRoot)
                && (completedSuccessfully || !_options.PreserveFailedWorkspaces))
            {
                try
                {
                    Directory.Delete(attemptRoot, recursive: true);
                }
                catch (Exception cleanupError)
                {
                    logger.LogWarning(
                        cleanupError,
                        "Could not remove ephemeral attempt folder for {JobId}.",
                        job.JobId);
                }
            }
        }
    }

    private ProcessStartInfo BuildStartInfo(
        string jobPath,
        string outgoing,
        string workRoot,
        int executionSlot)
    {
        var start = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        foreach (var argument in new[]
        {
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-File", _options.InvokeScript,
            "-JobPath", jobPath,
            "-OutgoingDirectory", outgoing,
            "-WorkRoot", workRoot,
            "-StarNetExe", _options.StarNetExecutable,
            "-LicenseSlot", executionSlot.ToString(System.Globalization.CultureInfo.InvariantCulture),
            "-LockTimeoutSeconds", "30"
        })
        {
            start.ArgumentList.Add(argument);
        }
        if (_options.PreserveFailedWorkspaces)
            start.ArgumentList.Add("-PreserveWorkspace");
        return start;
    }

    private void AssertLocalInstallation()
    {
        if (!File.Exists(_options.StarNetExecutable))
            throw new InvalidOperationException("STAR*NET 14 executable is not available.");
        if (!File.Exists(_options.InvokeScript))
            throw new InvalidOperationException("STAR*NET invocation script is not available.");
    }

    private static void ValidateResultIdentity(string json, string expectedJobId)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.GetProperty("kind").GetString() != "btm-starnet-result"
            || root.GetProperty("schemaVersion").GetInt32() != 1
            || root.GetProperty("jobId").GetString() != expectedJobId)
        {
            throw new InvalidOperationException("STAR*NET returned an invalid result identity.");
        }
    }

    private static void TryKill(Process process)
    {
        try
        {
            process.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException)
        {
            // The process already exited.
        }
    }
}
