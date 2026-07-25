using Btm.StarNet.Service;
using Microsoft.AspNetCore.Http.Json;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);
builder.Host.UseWindowsService(options =>
{
    options.ServiceName = "BTM STAR*NET Execution Service";
});
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 4_000_000;
});
builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonDefaults.Options.PropertyNamingPolicy;
    options.SerializerOptions.DefaultIgnoreCondition = JsonDefaults.Options.DefaultIgnoreCondition;
    options.SerializerOptions.Converters.Add(
        new JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase));
});
builder.Services.AddOptions<StarNetServiceOptions>()
    .Bind(builder.Configuration.GetSection("StarNet"))
    .Validate(options => options.MaximumConcurrentExecutions is >= 1 and <= 32,
        "MaximumConcurrentExecutions must be between 1 and 32.")
    .Validate(options => options.QueueCapacity is >= 1 and <= 10_000,
        "QueueCapacity must be between 1 and 10000.")
    .ValidateOnStart();

var apiKey = builder.Configuration["Security:ApiKey"]
    ?? Environment.GetEnvironmentVariable("BTM_STARNET_API_KEY");
if (string.IsNullOrWhiteSpace(apiKey) || apiKey.Length < 24)
{
    throw new InvalidOperationException(
        "Set BTM_STARNET_API_KEY to a random secret containing at least 24 characters.");
}

builder.Services.AddSingleton(new ApiSecurityOptions(apiKey));
builder.Services.AddSingleton<RunStore>();
builder.Services.AddSingleton<ExecutionQueue>();
builder.Services.AddSingleton<StarNetPowerShellExecutor>();
builder.Services.AddHostedService<RunDispatcher>();
builder.Services.AddHostedService<RunRetentionService>();

var app = builder.Build();
app.UseMiddleware<ApiKeyMiddleware>();

object ServiceHealth(
    Microsoft.Extensions.Options.IOptions<StarNetServiceOptions> options)
{
    var configured = options.Value;
    return new
    {
        status = "ok",
        starNetAvailable = File.Exists(configured.StarNetExecutable),
        invocationScriptAvailable = File.Exists(configured.InvokeScript),
        maximumConcurrentExecutions = configured.MaximumConcurrentExecutions
    };
}

app.MapGet("/health", (
    Microsoft.Extensions.Options.IOptions<StarNetServiceOptions> options) =>
    Results.Ok(ServiceHealth(options)));
app.MapGet("/v1/health", (
    Microsoft.Extensions.Options.IOptions<StarNetServiceOptions> options) =>
    Results.Ok(ServiceHealth(options)));

app.MapPost("/v1/runs", (StarNetJob job, RunStore store, ExecutionQueue queue) =>
{
    var errors = JobValidator.Validate(job);
    if (errors.Count > 0)
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["job"] = errors.ToArray()
        });

    if (!store.TryCreate(job, out var snapshot))
        return Results.Accepted($"/v1/runs/{job.JobId}", snapshot);
    if (!queue.TryQueue(job.JobId))
    {
        store.Remove(job.JobId);
        return Results.Json(
            new { code = "QUEUE_FULL", message = "The STAR*NET execution queue is full." },
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    return Results.Accepted($"/v1/runs/{job.JobId}", snapshot);
});

app.MapGet("/v1/runs/{jobId}", (string jobId, RunStore store) =>
    store.TryGetSnapshot(jobId, out var snapshot)
        ? Results.Ok(snapshot)
        : Results.NotFound(new { code = "RUN_NOT_FOUND", message = "Run not found." }));

app.MapGet("/v1/runs/{jobId}/result", (string jobId, RunStore store) =>
{
    if (!store.TryGetResult(jobId, out var resultJson, out var snapshot) || snapshot is null)
        return Results.NotFound(new { code = "RUN_NOT_FOUND", message = "Run not found." });
    if (resultJson is not null)
        return Results.Content(resultJson, "application/json");
    if (snapshot.Status == RunLifecycle.Failed)
        return Results.Json(snapshot, statusCode: StatusCodes.Status500InternalServerError);
    return Results.Json(snapshot, statusCode: StatusCodes.Status202Accepted);
});

app.Run();

public partial class Program;
