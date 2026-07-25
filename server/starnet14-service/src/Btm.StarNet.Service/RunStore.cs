using System.Collections.Concurrent;

namespace Btm.StarNet.Service;

public sealed class RunStore
{
    private sealed class MutableRun(StarNetJob job)
    {
        public readonly object Gate = new();
        public StarNetJob Job { get; } = job;
        public RunLifecycle Status { get; set; } = RunLifecycle.Queued;
        public DateTimeOffset ReceivedAt { get; } = DateTimeOffset.UtcNow;
        public DateTimeOffset? StartedAt { get; set; }
        public DateTimeOffset? FinishedAt { get; set; }
        public int? ExecutionSlot { get; set; }
        public string? Error { get; set; }
        public string? ResultJson { get; set; }
    }

    private readonly ConcurrentDictionary<string, MutableRun> _runs =
        new(StringComparer.Ordinal);

    public bool TryCreate(StarNetJob job, out RunSnapshot snapshot)
    {
        var run = new MutableRun(job);
        var added = _runs.TryAdd(job.JobId, run);
        snapshot = Snapshot(added ? run : _runs[job.JobId]);
        return added;
    }

    public bool TryGetJob(string jobId, out StarNetJob? job)
    {
        if (_runs.TryGetValue(jobId, out var run))
        {
            job = run.Job;
            return true;
        }
        job = null;
        return false;
    }

    public bool TryGetSnapshot(string jobId, out RunSnapshot? snapshot)
    {
        if (_runs.TryGetValue(jobId, out var run))
        {
            snapshot = Snapshot(run);
            return true;
        }
        snapshot = null;
        return false;
    }

    public bool TryGetResult(string jobId, out string? resultJson, out RunSnapshot? snapshot)
    {
        if (!_runs.TryGetValue(jobId, out var run))
        {
            resultJson = null;
            snapshot = null;
            return false;
        }
        lock (run.Gate)
        {
            resultJson = run.ResultJson;
            snapshot = SnapshotUnsafe(run);
            return true;
        }
    }

    public void MarkRunning(string jobId, int slot)
    {
        var run = Required(jobId);
        lock (run.Gate)
        {
            run.Status = RunLifecycle.Running;
            run.StartedAt = DateTimeOffset.UtcNow;
            run.ExecutionSlot = slot;
        }
    }

    public void MarkCompleted(string jobId, string resultJson)
    {
        var run = Required(jobId);
        lock (run.Gate)
        {
            run.Status = RunLifecycle.Completed;
            run.ResultJson = resultJson;
            run.FinishedAt = DateTimeOffset.UtcNow;
        }
    }

    public void MarkFailed(string jobId, string publicError)
    {
        var run = Required(jobId);
        lock (run.Gate)
        {
            run.Status = RunLifecycle.Failed;
            run.Error = publicError;
            run.FinishedAt = DateTimeOffset.UtcNow;
        }
    }

    public void Remove(string jobId) => _runs.TryRemove(jobId, out _);

    public int RemoveExpired(TimeSpan retention)
    {
        var threshold = DateTimeOffset.UtcNow - retention;
        var removed = 0;
        foreach (var pair in _runs)
        {
            var snapshot = Snapshot(pair.Value);
            if (snapshot.FinishedAt is not null && snapshot.FinishedAt < threshold
                && _runs.TryRemove(pair.Key, out _))
            {
                removed++;
            }
        }
        return removed;
    }

    private MutableRun Required(string jobId) =>
        _runs.TryGetValue(jobId, out var run)
            ? run
            : throw new InvalidOperationException("Run not found.");

    private static RunSnapshot Snapshot(MutableRun run)
    {
        lock (run.Gate)
            return SnapshotUnsafe(run);
    }

    private static RunSnapshot SnapshotUnsafe(MutableRun run) =>
        new(
            run.Job.JobId,
            run.Job.ProcessingId,
            run.Job.RunId,
            run.Status,
            run.ReceivedAt,
            run.StartedAt,
            run.FinishedAt,
            run.ExecutionSlot,
            run.Error);
}
