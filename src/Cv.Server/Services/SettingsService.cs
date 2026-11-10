using Cv.Server.Data;
using Microsoft.EntityFrameworkCore;

namespace Cv.Server.Services;

/// <summary>The instance settings an admin changes in the UI (stored in the database, not in configuration files).</summary>
public sealed record InstanceSettings(bool RegistrationOpen, bool RequireTwoFactor)
{
    /// <summary>
    /// Host names or IP addresses an own AI base URL may point to in server mode (for example a local Ollama). Empty means: only the public
    /// addresses of the built-in providers.
    /// </summary>
    public IReadOnlyList<string> AiAllowedHosts { get; init; } = [];

    /// <summary>The chosen update channel (<c>none</c>, <c>beta</c>, <c>nightly</c>); null while nothing is saved. Not part of the admin settings form, it has its own endpoint.</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public string? UpdateChannel { get; init; }

    public bool Equals(InstanceSettings? other) =>
        other is not null
        && RegistrationOpen == other.RegistrationOpen
        && RequireTwoFactor == other.RequireTwoFactor
        && UpdateChannel == other.UpdateChannel
        && AiAllowedHosts.SequenceEqual(other.AiAllowedHosts, StringComparer.Ordinal);

    public override int GetHashCode() => HashCode.Combine(RegistrationOpen, RequireTwoFactor, UpdateChannel, AiAllowedHosts.Count);
}

/// <summary>
/// Reads and writes <see cref="InstanceSettings"/>. Cached in memory (every authenticated request needs <c>requireTwoFactor</c>);
/// a save updates the cache at once, so the change takes effect immediately for everybody.
/// </summary>
public sealed class SettingsService(IServiceScopeFactory scopes, TimeProvider time) : Updates.IUpdateChannelSetting
{
    public const string RegistrationOpenKey = "registrationOpen";
    public const string RequireTwoFactorKey = "requireTwoFactor";
    public const string AiAllowedHostsKey = "ai.allowed_hosts";
    public const string UpdateChannelKey = "updates.channel";

    private readonly SemaphoreSlim _gate = new(1, 1);
    private InstanceSettings? _cached;

    public async Task<InstanceSettings> GetAsync(CancellationToken ct = default)
    {
        if (_cached is { } hit) return hit;
        await _gate.WaitAsync(ct);
        try
        {
            if (_cached is { } again) return again;
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var rows = await db.AppSettings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value, ct);
            _cached = new InstanceSettings(Flag(rows, RegistrationOpenKey), Flag(rows, RequireTwoFactorKey))
            {
                AiAllowedHosts = rows.TryGetValue(AiAllowedHostsKey, out var hosts)
                    ? hosts.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    : [],
                UpdateChannel = rows.TryGetValue(UpdateChannelKey, out var channel) && Updates.UpdateChannels.IsValid(channel) ? channel : null,
            };
            return _cached;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<InstanceSettings> SaveAsync(AppDbContext db, InstanceSettings value, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            var now = time.GetUtcNow().UtcDateTime;
            await Upsert(db, RegistrationOpenKey, value.RegistrationOpen ? "true" : "false", now, ct);
            await Upsert(db, RequireTwoFactorKey, value.RequireTwoFactor ? "true" : "false", now, ct);
            await Upsert(db, AiAllowedHostsKey, string.Join('\n', value.AiAllowedHosts), now, ct);
            await db.SaveChangesAsync(ct);
            _cached = value;
            return value;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<string?> GetUpdateChannelAsync(CancellationToken ct) => (await GetAsync(ct)).UpdateChannel;

    /// <summary>Saves the update channel on its own: changing it has nothing to do with the instance settings form.</summary>
    public async Task SaveUpdateChannelAsync(AppDbContext db, string channel, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            await Upsert(db, UpdateChannelKey, channel, time.GetUtcNow().UtcDateTime, ct);
            await db.SaveChangesAsync(ct);
            _cached = _cached is null ? null : _cached with { UpdateChannel = channel };
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>After a restore the database holds other values.</summary>
    public void Invalidate() => _cached = null;

    private static async Task Upsert(AppDbContext db, string key, string value, DateTime now, CancellationToken ct)
    {
        var row = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (row is null) db.AppSettings.Add(new AppSetting { Key = key, Value = value, UpdatedAt = now });
        else if (row.Value != value)
        {
            row.Value = value;
            row.UpdatedAt = now;
        }
    }

    private static bool Flag(Dictionary<string, string> rows, string key) =>
        rows.TryGetValue(key, out var value) && value.Equals("true", StringComparison.OrdinalIgnoreCase);
}
