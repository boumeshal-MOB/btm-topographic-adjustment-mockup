using System.Security.Cryptography;
using System.Text;

namespace Btm.StarNet.Service;

public sealed class ApiKeyMiddleware(RequestDelegate next, ApiSecurityOptions security)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments("/v1"))
        {
            await next(context);
            return;
        }

        var supplied = context.Request.Headers["X-BTM-StarNet-Key"].ToString();
        if (!ApiKeyComparer.Matches(security.ApiKey, supplied))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(new
            {
                code = "UNAUTHORIZED",
                message = "A valid STAR*NET service key is required."
            });
            return;
        }

        await next(context);
    }
}

public static class ApiKeyComparer
{
    public static bool Matches(string expected, string supplied)
    {
        if (string.IsNullOrEmpty(expected) || string.IsNullOrEmpty(supplied))
            return false;
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        var suppliedHash = SHA256.HashData(Encoding.UTF8.GetBytes(supplied));
        return CryptographicOperations.FixedTimeEquals(expectedHash, suppliedHash);
    }
}
