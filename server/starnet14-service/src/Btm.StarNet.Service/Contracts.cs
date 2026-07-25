using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace Btm.StarNet.Service;

public sealed record StarNetJob(
    string Kind,
    int SchemaVersion,
    string JobId,
    int ProcessingId,
    string RunId,
    string ConfigVersionId,
    string OutputSlot,
    string CreatedAt,
    StarNetExecution Execution,
    StarNetFiles Files);

public sealed record StarNetExecution(
    string Mode,
    bool NoGraphics,
    int TimeoutSeconds,
    StarNetAutoAdjust? AutoAdjust);

public sealed record StarNetAutoAdjust(
    double MaxStandardizedResidual,
    int OutliersRemovedPerAdjustment,
    int MaxAdjustments);

public sealed record StarNetFiles(
    string DataFileName,
    string ProjectFileName,
    string Data,
    string Project);

public enum RunLifecycle
{
    Queued,
    Running,
    Completed,
    Failed
}

public sealed record RunSnapshot(
    string JobId,
    int ProcessingId,
    string RunId,
    RunLifecycle Status,
    DateTimeOffset ReceivedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt,
    int? ExecutionSlot,
    string? Error);

public static partial class JobValidator
{
    private const int MaximumDataCharacters = 3_000_000;
    private const int MaximumProjectCharacters = 1_000_000;

    [GeneratedRegex("^btm-[A-Za-z0-9._-]{1,80}$", RegexOptions.CultureInvariant)]
    private static partial Regex SafeJobId();

    [GeneratedRegex("(?im)^\\s*\\d+\\s+\"input\\.dat\"\\s*$", RegexOptions.CultureInvariant)]
    private static partial Regex CanonicalDataFileEntry();

    [GeneratedRegex("(?i)(?:[A-Z]:[\\\\/]|\\\\\\\\|\\.\\.)", RegexOptions.CultureInvariant)]
    private static partial Regex UnsafeProjectPath();

    public static IReadOnlyList<string> Validate(StarNetJob? job)
    {
        var errors = new List<string>();
        if (job is null)
        {
            errors.Add("A STAR*NET job is required.");
            return errors;
        }

        if (job.Kind != "btm-starnet-job" || job.SchemaVersion != 1)
            errors.Add("Unsupported STAR*NET job schema.");
        if (string.IsNullOrWhiteSpace(job.JobId) || !SafeJobId().IsMatch(job.JobId))
            errors.Add("Invalid jobId.");
        if (job.ProcessingId < 1)
            errors.Add("Invalid processingId.");
        if (string.IsNullOrWhiteSpace(job.RunId) || job.RunId.Length > 120)
            errors.Add("Invalid runId.");
        if (string.IsNullOrWhiteSpace(job.ConfigVersionId) || job.ConfigVersionId.Length > 120)
            errors.Add("Invalid configVersionId.");
        if (string.IsNullOrWhiteSpace(job.OutputSlot) || job.OutputSlot.Length > 80)
            errors.Add("Invalid outputSlot.");
        if (string.IsNullOrWhiteSpace(job.CreatedAt) || job.CreatedAt.Length > 80)
            errors.Add("Invalid createdAt.");
        if (job.Execution is null)
        {
            errors.Add("Execution settings are required.");
        }
        else
        {
            if (job.Execution.Mode is not ("run" or "auto-adjust"))
                errors.Add("Execution mode must be run or auto-adjust.");
            if (job.Execution.TimeoutSeconds is < 30 or > 3600)
                errors.Add("Execution timeout must be between 30 and 3600 seconds.");
            if (!job.Execution.NoGraphics)
                errors.Add("NoGraphics must be enabled for unattended execution.");
            if (job.Execution.Mode == "auto-adjust")
            {
                var auto = job.Execution.AutoAdjust;
                if (auto is null
                    || !double.IsFinite(auto.MaxStandardizedResidual)
                    || auto.MaxStandardizedResidual is <= 0 or > 100
                    || auto.OutliersRemovedPerAdjustment is < 1 or > 1000
                    || auto.MaxAdjustments is < 1 or > 10_000)
                {
                    errors.Add("Invalid Auto Adjust settings.");
                }
            }
        }

        if (job.Files is null)
        {
            errors.Add("Native STAR*NET files are required.");
        }
        else
        {
            if (job.Files.DataFileName != "input.dat" || job.Files.ProjectFileName != "project.snproj")
                errors.Add("Only input.dat and project.snproj are accepted.");
            if (job.Files.Data is null || job.Files.Data.Length > MaximumDataCharacters || job.Files.Data.Contains('\0'))
                errors.Add("Invalid or oversized DAT content.");
            if (job.Files.Project is null || job.Files.Project.Length > MaximumProjectCharacters || job.Files.Project.Contains('\0'))
                errors.Add("Invalid or oversized project content.");
            else if (
                UnsafeProjectPath().IsMatch(job.Files.Project)
                || !CanonicalDataFileEntry().IsMatch(job.Files.Project))
            {
                errors.Add("Project content must reference only the canonical input.dat file.");
            }
        }

        return errors;
    }
}

public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true
    };

    static JsonDefaults()
    {
        Options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    }
}
