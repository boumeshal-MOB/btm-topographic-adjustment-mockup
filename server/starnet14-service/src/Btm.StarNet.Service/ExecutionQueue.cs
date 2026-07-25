using System.Threading.Channels;
using Microsoft.Extensions.Options;

namespace Btm.StarNet.Service;

public sealed class ExecutionQueue
{
    private readonly Channel<string> _channel;

    public ExecutionQueue(IOptions<StarNetServiceOptions> options)
    {
        _channel = Channel.CreateBounded<string>(new BoundedChannelOptions(
            Math.Clamp(options.Value.QueueCapacity, 1, 10_000))
        {
            // TryWrite must return false when the queue is full. DropWrite can report success
            // while discarding an item, which would strand the run in "queued".
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = false,
            SingleWriter = false
        });
    }

    public bool TryQueue(string jobId) => _channel.Writer.TryWrite(jobId);

    public IAsyncEnumerable<string> ReadAllAsync(CancellationToken cancellationToken) =>
        _channel.Reader.ReadAllAsync(cancellationToken);
}
