using Btm.StarNet.Service;

namespace Btm.StarNet.Service.Tests;

public sealed class SecurityAndStoreTests
{
    [Fact]
    public void ApiKeyComparisonRequiresExactSecret()
    {
        Assert.True(ApiKeyComparer.Matches("a-long-random-service-key", "a-long-random-service-key"));
        Assert.False(ApiKeyComparer.Matches("a-long-random-service-key", "a-long-random-service-keX"));
        Assert.False(ApiKeyComparer.Matches("a-long-random-service-key", ""));
    }

    [Fact]
    public void DuplicateSubmissionIsIdempotent()
    {
        var store = new RunStore();
        var job = JobValidatorTests.TestJob();

        Assert.True(store.TryCreate(job, out var first));
        Assert.False(store.TryCreate(job, out var duplicate));
        Assert.Equal(RunLifecycle.Queued, first.Status);
        Assert.Equal(first, duplicate);
    }

    [Fact]
    public void StoresLifecycleAndResultOnlyInMemory()
    {
        var store = new RunStore();
        var job = JobValidatorTests.TestJob();
        store.TryCreate(job, out _);

        store.MarkRunning(job.JobId, 1);
        Assert.True(store.TryGetSnapshot(job.JobId, out var running));
        Assert.Equal(RunLifecycle.Running, running?.Status);
        Assert.Equal(1, running?.ExecutionSlot);

        store.MarkCompleted(job.JobId, """{"kind":"btm-starnet-result"}""");
        Assert.True(store.TryGetResult(job.JobId, out var result, out var completed));
        Assert.Equal("""{"kind":"btm-starnet-result"}""", result);
        Assert.Equal(RunLifecycle.Completed, completed?.Status);
        Assert.NotNull(completed?.FinishedAt);
    }
}
