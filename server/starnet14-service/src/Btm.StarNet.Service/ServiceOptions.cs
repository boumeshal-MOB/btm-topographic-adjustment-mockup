namespace Btm.StarNet.Service;

public sealed class StarNetServiceOptions
{
    public string StarNetExecutable { get; set; } =
        @"C:\Program Files\MicroSurvey\StarNet 14\StarNet.exe";

    public string InvokeScript { get; set; } =
        @"C:\Program Files\BTM\StarNet Execution Service\scripts\Invoke-BtmStarNetJob.ps1";

    public string ServiceDataRoot { get; set; } = @"C:\ProgramData\BTM\StarNet";

    public int MaximumConcurrentExecutions { get; set; } = 1;

    public int QueueCapacity { get; set; } = 500;

    public int ResultRetentionMinutes { get; set; } = 60;

    public bool PreserveFailedWorkspaces { get; set; }
}

public sealed record ApiSecurityOptions(string ApiKey);
