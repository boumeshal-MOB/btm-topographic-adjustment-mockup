using Microsoft.Extensions.Options;

namespace Btm.StarNet.Service;

public sealed class RunDispatcher(
    ExecutionQueue queue,
    RunStore store,
    StarNetPowerShellExecutor executor,
    IOptions<StarNetServiceOptions> options,
    ILogger<RunDispatcher> logger) : BackgroundService
{
    private readonly StarNetServiceOptions _options = options.Value;

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var concurrency = Math.Clamp(_options.MaximumConcurrentExecutions, 1, 32);
        logger.LogInformation(
            "Starting {Count} STAR*NET execution slot(s). Configure this value to the licensed seat count.",
            concurrency);
        return Task.WhenAll(
            Enumerable.Range(1, concurrency)
                .Select(slot => ExecuteSlotAsync(slot, stoppingToken)));
    }

    private async Task ExecuteSlotAsync(int slot, CancellationToken cancellationToken)
    {
        await foreach (var jobId in queue.ReadAllAsync(cancellationToken))
        {
            if (!store.TryGetJob(jobId, out var job) || job is null)
                continue;
            store.MarkRunning(jobId, slot);
            try
            {
                var result = await executor.ExecuteAsync(job, slot, cancellationToken);
                store.MarkCompleted(jobId, result);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                store.MarkFailed(jobId, "The execution service is stopping.");
                return;
            }
            catch (Exception error)
            {
                logger.LogError(error, "STAR*NET execution failed for {JobId}.", jobId);
                store.MarkFailed(jobId, PublicError(error));
            }
        }
    }

    private static string PublicError(Exception error) => error switch
    {
        TimeoutException => "STAR*NET exceeded the configured timeout.",
        InvalidOperationException => error.Message,
        _ => "The STAR*NET execution service failed to process the run."
    };
}

public sealed class RunRetentionService(
    RunStore store,
    IOptions<StarNetServiceOptions> options,
    ILogger<RunRetentionService> logger) : BackgroundService
{
    private readonly TimeSpan _retention =
        TimeSpan.FromMinutes(Math.Clamp(options.Value.ResultRetentionMinutes, 5, 1440));

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            var removed = store.RemoveExpired(_retention);
            if (removed > 0)
                logger.LogInformation("Removed {Count} expired in-memory run result(s).", removed);
        }
    }
}
