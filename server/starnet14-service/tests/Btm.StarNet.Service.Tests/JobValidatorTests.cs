using Btm.StarNet.Service;

namespace Btm.StarNet.Service.Tests;

public sealed class JobValidatorTests
{
    [Fact]
    public void AcceptsCanonicalRun()
    {
        Assert.Empty(JobValidator.Validate(TestJob()));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void AcceptsTypicalAndNoGraphicsLaunchModes(bool noGraphics)
    {
        var job = TestJob() with
        {
            Execution = TestJob().Execution with { NoGraphics = noGraphics }
        };

        Assert.Empty(JobValidator.Validate(job));
    }

    [Theory]
    [InlineData("../escape")]
    [InlineData("btm-")]
    [InlineData("not-prefixed")]
    public void RejectsUnsafeJobIdentifier(string jobId)
    {
        Assert.Contains("Invalid jobId.", JobValidator.Validate(TestJob() with { JobId = jobId }));
    }

    [Fact]
    public void RejectsNonCanonicalFiles()
    {
        var job = TestJob() with
        {
            Files = new StarNetFiles("..\\input.dat", "project.prj", "DM A-B 1-2-3 4\n", "*STAR*NET 2\n")
        };

        Assert.Contains("Only input.dat and project.prj are accepted.", JobValidator.Validate(job));
    }

    [Fact]
    public void RejectsAProjectThatReferencesAnExternalFile()
    {
        var job = TestJob() with
        {
            Files = new StarNetFiles(
                "input.dat",
                "project.prj",
                "DM STA-TGT 0-00-00 90-00-00 10.000\n",
                "*STAR*NET 2\n[DataFileList]\n3 \"C:\\secret\\input.dat\"\n")
        };

        Assert.Contains(
            "Project content must use the native template and reference only input.dat.",
            JobValidator.Validate(job));
    }

    [Fact]
    public void RejectsAReconstructedOrWrongProjectFormat()
    {
        var job = TestJob() with
        {
            Files = TestJob().Files with
            {
                Project = "*STAR*NET 3\n[DataFileList]\n3 \"input.dat\"\n"
            }
        };

        Assert.Contains(
            "Project content must use the native template and reference only input.dat.",
            JobValidator.Validate(job));
    }

    [Fact]
    public void RequiresAutoAdjustParameters()
    {
        var job = TestJob() with
        {
            Execution = new StarNetExecution("auto-adjust", true, 900, null)
        };

        Assert.Contains("Invalid Auto Adjust settings.", JobValidator.Validate(job));
    }

    internal static StarNetJob TestJob() =>
        new(
            "btm-starnet-job",
            1,
            "btm-run-001",
            42,
            "run-001",
            "cfg-001",
            "2026-07-25T12:00:00Z",
            "2026-07-25T12:00:01Z",
            new StarNetExecution("run", true, 900, null),
            new StarNetFiles(
                "input.dat",
                "project.prj",
                "DM STA-TGT 0-00-00 90-00-00 10.000\n",
                "*STAR*NET 2\n[DataFileList]\n3 \"input.dat\"\n"));
}
