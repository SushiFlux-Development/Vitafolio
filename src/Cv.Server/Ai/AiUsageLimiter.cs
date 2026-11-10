using System.Threading.RateLimiting;
using Cv.Server.Configuration;
using Cv.Server.Errors;

namespace Cv.Server.Ai;

/// <summary>
/// How often one account may use the administrator's AI key per day. The key is paid for by the operator, so an account with a stolen or
/// careless session must not be able to run up the bill. Own keys and copy and paste are not limited. Counted in memory: a restart gives
/// everybody a fresh day, which costs less than a table for a soft limit.
/// </summary>
public sealed class AiUsageLimiter(ServerSettings settings) : IDisposable
{
    private readonly PartitionedRateLimiter<Guid> _limiter = PartitionedRateLimiter.Create<Guid, Guid>(key => RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
    {
        PermitLimit = settings.RateLimits.AiServerKeyPerDay,
        Window = TimeSpan.FromDays(1),
        QueueLimit = 0,
        AutoReplenishment = true,
    }));

    /// <summary>Counts one use of the server key; 429 <c>ai.daily_limit</c> when the day's budget is used up.</summary>
    public void ConsumeServerKey(Guid userId)
    {
        using var lease = _limiter.AttemptAcquire(userId);
        if (!lease.IsAcquired)
        {
            throw new ApiException(StatusCodes.Status429TooManyRequests, "ai.daily_limit", "The daily limit for the server's AI key is used up.",
                new Dictionary<string, object?> { ["limit"] = settings.RateLimits.AiServerKeyPerDay });
        }
    }

    public void Dispose() => _limiter.Dispose();
}
