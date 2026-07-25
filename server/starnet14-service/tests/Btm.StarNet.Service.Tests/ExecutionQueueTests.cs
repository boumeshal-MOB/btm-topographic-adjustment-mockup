using Btm.StarNet.Service;
using Microsoft.Extensions.Options;

namespace Btm.StarNet.Service.Tests;

public sealed class ExecutionQueueTests
{
    [Fact]
    public void RejectsAnItemWhenCapacityIsReached()
    {
        var queue = new ExecutionQueue(Options.Create(new StarNetServiceOptions
        {
            QueueCapacity = 1
        }));

        Assert.True(queue.TryQueue("btm-first"));
        Assert.False(queue.TryQueue("btm-second"));
    }
}
