using System.Globalization;
using System.Net;
using System.Threading.RateLimiting;
using Cv.Server.Configuration;
using Cv.Server.Errors;

namespace Cv.Server.Security;

/// <summary>
/// A second brake next to the per-IP limits: wrong passwords and codes per account and client network (default 20 per 15 minutes). Only
/// failures count, and the budget belongs to the pair account + network, so a stranger guessing at somebody else's account uses up their
/// own budget and never locks the real owner out. Sign-in, 2FA, step-up, password change and enabling 2FA share one budget, so spreading
/// guesses over several endpoints gains nothing. A reached limit is logged in German.
/// </summary>
public sealed class AccountAttemptLimiter : IDisposable
{
    private readonly PartitionedRateLimiter<string> _limiter;
    private readonly RateLimitSettings _limits;
    private readonly ILogger<AccountAttemptLimiter> _logger;

    public AccountAttemptLimiter(ServerSettings settings, ILogger<AccountAttemptLimiter> logger)
    {
        _limits = settings.RateLimits;
        _logger = logger;
        _limiter = PartitionedRateLimiter.Create<string, string>(key => RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = _limits.AccountAttempts,
            Window = _limits.AccountWindow,
            QueueLimit = 0,
            AutoReplenishment = true,
        }));
    }

    /// <summary>Throws 429 <c>rate_limited</c> (scope <c>account</c>) when this client's budget for the account is used up. Costs nothing.</summary>
    public void EnsureAllowed(HttpContext context, string account)
    {
        // Zero permits only asks whether the window still has room
        using var lease = _limiter.AttemptAcquire(Key(context, account), 0);
        if (lease.IsAcquired) return;
        var seconds = lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter)
            ? (int)Math.Ceiling(retryAfter.TotalSeconds)
            : (int)_limits.AccountWindow.TotalSeconds;
        var name = LogText.Clean(account);
        _logger.LogWarning("Viele Fehlversuche für das Konto '{Account}' - weitere Versuche von dieser Adresse für {Seconds} Sekunden gesperrt (IP {Ip}).",
            name.Length > 64 ? name[..64] : name, seconds, context.Connection.RemoteIpAddress);
        context.Response.Headers.RetryAfter = seconds.ToString(CultureInfo.InvariantCulture);
        throw new ApiException(StatusCodes.Status429TooManyRequests, "rate_limited",
            $"Too many attempts for this account. Please wait {seconds} seconds and try again.",
            new Dictionary<string, object?> { ["retryAfterSeconds"] = seconds, ["scope"] = "account" });
    }

    /// <summary>Counts one wrong password or code against this client's budget for the account.</summary>
    public void RecordFailure(HttpContext context, string account)
    {
        using var lease = _limiter.AttemptAcquire(Key(context, account));
    }

    private static string Key(HttpContext context, string account) => $"{account}|{ClientPartition.Key(context.Connection.RemoteIpAddress)}";

    public void Dispose() => _limiter.Dispose();
}

/// <summary>The partition key of a client for the per-IP limits: IPv4 as it is, IPv6 by its /64 network (one connection usually owns a whole /64).</summary>
public static class ClientPartition
{
    public static string Key(IPAddress? address)
    {
        if (address is null) return "unknown";
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        if (address.AddressFamily != System.Net.Sockets.AddressFamily.InterNetworkV6) return address.ToString();
        var bytes = address.GetAddressBytes();
        for (var i = 8; i < 16; i++) bytes[i] = 0;
        return new IPAddress(bytes) + "/64";
    }
}

/// <summary>Text that comes from a client and ends up in a log line.</summary>
public static class LogText
{
    /// <summary>Replaces control characters (line breaks above all) with spaces, so a value cannot forge further log lines.</summary>
    public static string Clean(string value) =>
        value.Any(char.IsControl) ? string.Concat(value.Select(c => char.IsControl(c) ? ' ' : c)) : value;
}
