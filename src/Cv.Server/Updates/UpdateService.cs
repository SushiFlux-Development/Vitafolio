using System.Net.Http.Headers;
using System.Text.Json;
using Cv.Server.Configuration;

namespace Cv.Server.Updates;

/// <summary>The saved update channel; null while nothing has been chosen.</summary>
public interface IUpdateChannelSetting
{
    Task<string?> GetUpdateChannelAsync(CancellationToken ct);
}

public sealed record UpdateReleaseDto(
    string Tag,
    string Display,
    string Channel,
    string? HtmlUrl,
    DateTimeOffset? PublishedAt,
    string? Notes);

public sealed record UpdateInstallDto(
    string State,
    int? Progress,
    string? TargetTag,
    string? TargetDisplay,
    string? ErrorCode,
    string? Error,
    string? ErrorDetails,
    string? BackupFile)
{
    public static readonly UpdateInstallDto Idle = new(UpdateInstallState.Idle, null, null, null, null, null, null, null);
}

public static class UpdateInstallState
{
    public const string Idle = "idle";
    public const string Downloading = "downloading";
    public const string BackingUp = "backingUp";
    public const string Restarting = "restarting";
    public const string Failed = "failed";
}

/// <summary>
/// What the UI needs: <see cref="CurrentChannel"/> is the channel of the running build (release / beta / nightly / dev), <see cref="Channel"/>
/// the chosen update channel (none / beta / nightly). <see cref="State"/>: devBuild, unknownVersion, error, available or upToDate.
/// </summary>
public sealed record UpdateStatusDto(
    string CurrentVersion,
    string CurrentTag,
    string CurrentChannel,
    string Host,
    string State,
    bool HasUpdate,
    UpdateReleaseDto? Available,
    UpdateReleaseDto? LatestRelease,
    UpdateReleaseDto? LatestBeta,
    UpdateReleaseDto? LatestNightly,
    DateTimeOffset? CheckedAt,
    DateTimeOffset? NextManualCheckAt,
    bool Throttled,
    string? Error,
    string DockerImage,
    string Channel,
    bool ChannelSaved,
    string DockerTag,
    bool CanInstall,
    UpdateInstallDto Install);

/// <summary>
/// Looks at the published GitHub releases and decides whether the running version has an update on the chosen channel. Checked at every start of
/// the program (<see cref="UpdateCheckWorker"/>), on the button, and when a status is asked for after the cache has run out. A development build
/// has nothing to update to: it never contacts GitHub and never offers anything.
/// </summary>
public sealed class UpdateService(
    IHttpClientFactory httpFactory,
    AppVersion appVersion,
    ServerSettings settings,
    IUpdateChannelSetting channelSetting,
    TimeProvider time,
    ILogger<UpdateService> logger)
{
    public static string GitHubRepo => Branding.Repository;

    public static string DockerImage => "ghcr.io/" + Branding.Repository.ToLowerInvariant();

    public static readonly TimeSpan CacheDuration = TimeSpan.FromHours(4);
    public static readonly TimeSpan ManualThrottle = TimeSpan.FromSeconds(30);

    /// <summary>After a failed check GitHub is left alone for this long: no retry storm while it, or the network, is down.</summary>
    public static readonly TimeSpan FailureCooldown = TimeSpan.FromMinutes(15);

    private const int PageSize = 100;

    /// <summary>Daily nightlies push older releases off the first pages: up to 500 releases are read until each kind has been seen once.</summary>
    private const int MaxPages = 5;

    private const int MaxNotesLength = 4000;

    private readonly SemaphoreSlim _gate = new(1, 1);
    private List<PublishedRelease>? _cachedReleases;
    private DateTimeOffset? _lastCheckedAt;
    private DateTimeOffset _nextAutomaticFetch = DateTimeOffset.MinValue;
    private string? _lastError;

    public bool IsDevelopmentBuild => string.Equals(appVersion.Current.Channel, "dev", StringComparison.OrdinalIgnoreCase);

    public async Task<UpdateStatusDto> GetStatusAsync(bool forceManualCheck = false, CancellationToken ct = default)
    {
        var channelSaved = await channelSetting.GetUpdateChannelAsync(ct);

        // A development build has nothing to update to and must not contact GitHub at all, not even on the button
        if (IsDevelopmentBuild) return BuildStatus(channelSaved, throttled: false, nextManualCheckAt: null);

        await _gate.WaitAsync(ct);
        try
        {
            var now = time.GetUtcNow();
            var throttled = false;
            var needsFetch = now >= _nextAutomaticFetch;
            if (forceManualCheck)
            {
                if (_lastCheckedAt is { } last && (now - last) < ManualThrottle)
                {
                    throttled = true;
                    needsFetch = false;
                }
                else
                {
                    needsFetch = true;
                }
            }

            if (needsFetch)
            {
                try
                {
                    _cachedReleases = await FetchReleasesFromGitHubAsync(ct);
                    _lastCheckedAt = now;
                    _nextAutomaticFetch = now + CacheDuration;
                    _lastError = null;
                }
                catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
                {
                    logger.LogWarning(ex, "Update-Prüfung bei GitHub fehlgeschlagen.");
                    _lastError = ex.Message;
                    _lastCheckedAt = now;
                    _nextAutomaticFetch = now + FailureCooldown;
                }
            }

            var nextManualCheckAt = _lastCheckedAt is { } checkedAt ? checkedAt + ManualThrottle : (DateTimeOffset?)null;
            return BuildStatus(channelSaved, throttled, nextManualCheckAt);
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task<List<PublishedRelease>> FetchReleasesFromGitHubAsync(CancellationToken ct)
    {
        var client = httpFactory.CreateClient("updates");
        client.DefaultRequestHeaders.UserAgent.Clear();
        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue(Branding.ProductName, "1.0"));
        client.DefaultRequestHeaders.Accept.Clear();
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));

        var list = new List<PublishedRelease>();
        for (var page = 1; page <= MaxPages; page++)
        {
            var url = $"https://api.github.com/repos/{GitHubRepo}/releases?per_page={PageSize}&page={page}";
            using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException($"GitHub API returned HTTP {(int)response.StatusCode} ({response.ReasonPhrase})");
            }

            await using var stream = await response.Content.ReadAsStreamAsync(ct);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
            var count = 0;
            foreach (var element in doc.RootElement.EnumerateArray())
            {
                count++;
                if (ReadRelease(element) is { } release) list.Add(release);
            }

            if (count < PageSize) break;
            if (list.Any(r => r.Version.IsRelease) && list.Any(r => r.Version.IsBeta) && list.Any(r => r.Version.IsNightly)) break;
        }

        list.Sort((a, b) => b.Version.CompareTo(a.Version));
        return list;
    }

    private static PublishedRelease? ReadRelease(JsonElement element)
    {
        if (element.TryGetProperty("draft", out var draft) && draft.ValueKind == JsonValueKind.True) return null;
        var tag = element.TryGetProperty("tag_name", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
        if (string.IsNullOrWhiteSpace(tag) || ReleaseVersion.Parse(tag) is not { } version) return null;

        var htmlUrl = element.TryGetProperty("html_url", out var u) && u.ValueKind == JsonValueKind.String ? u.GetString() : null;
        var body = element.TryGetProperty("body", out var b) && b.ValueKind == JsonValueKind.String ? b.GetString() : null;
        DateTimeOffset? publishedAt = element.TryGetProperty("published_at", out var p) && p.ValueKind == JsonValueKind.String && p.TryGetDateTimeOffset(out var at) ? at : null;

        var assets = new HashSet<string>(StringComparer.Ordinal);
        if (element.TryGetProperty("assets", out var files) && files.ValueKind == JsonValueKind.Array)
        {
            foreach (var file in files.EnumerateArray())
            {
                if (file.ValueKind == JsonValueKind.Object && file.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String) assets.Add(name.GetString()!);
            }
        }
        return new PublishedRelease(version, tag, htmlUrl, body, publishedAt, assets);
    }

    private UpdateStatusDto BuildStatus(string? channelSaved, bool throttled, DateTimeOffset? nextManualCheckAt)
    {
        var current = appVersion.Current;
        var host = settings.IsDesktop ? "desktop" : "server";
        var channel = channelSaved ?? UpdateChannels.FromBuild(current.Channel);
        var isDev = string.Equals(current.Channel, "dev", StringComparison.OrdinalIgnoreCase);
        var currentTag = VersionFormat.Tag(current.Short, current.BuildId, current.Channel);
        var currentParsed = isDev ? null : ReleaseVersion.Parse(currentTag);

        UpdateReleaseDto? latestRelease = null;
        UpdateReleaseDto? latestBeta = null;
        UpdateReleaseDto? latestNightly = null;
        if (!isDev && _cachedReleases is not null)
        {
            foreach (var release in _cachedReleases)
            {
                if (release.Version.IsRelease) latestRelease ??= Dto(release);
                else if (release.Version.IsBeta) latestBeta ??= Dto(release);
                else latestNightly ??= Dto(release);
            }
        }

        IEnumerable<PublishedRelease> candidates = isDev || _cachedReleases is null
            ? []
            // The Windows program can only install a release that has a package for it: a tag built only for Docker is not an update there
            : _cachedReleases.Where(r => !settings.IsDesktop || r.Assets.Contains(UpdateChannels.PackageFeedName(r.Version)));
        var update = UpdateChannels.NewestUpdate(channel, currentParsed, candidates, r => r.Version);
        var available = update is null ? null : Dto(update);

        var state = isDev ? "devBuild"
            : currentParsed is null ? "unknownVersion"
            : _lastError is not null && _cachedReleases is null ? "error"
            : available is not null ? "available"
            : "upToDate";

        return new UpdateStatusDto(
            CurrentVersion: current.Version,
            CurrentTag: currentTag,
            CurrentChannel: current.Channel,
            Host: host,
            State: state,
            HasUpdate: available is not null,
            Available: available,
            LatestRelease: latestRelease,
            LatestBeta: latestBeta,
            LatestNightly: latestNightly,
            CheckedAt: _lastCheckedAt,
            NextManualCheckAt: nextManualCheckAt,
            Throttled: throttled,
            Error: _lastError,
            DockerImage: DockerImage,
            Channel: channel,
            ChannelSaved: channelSaved is not null,
            DockerTag: UpdateChannels.DockerTag(channel),
            CanInstall: false,
            Install: UpdateInstallDto.Idle);
    }

    private static UpdateReleaseDto Dto(PublishedRelease release) => new(
        release.Tag,
        FormatDisplay(release.Version),
        release.Version.Channel,
        release.HtmlUrl,
        release.PublishedAt,
        release.Body?.Length > MaxNotesLength ? release.Body[..MaxNotesLength] + "..." : release.Body);

    private static string FormatDisplay(ReleaseVersion v)
    {
        var shortVersion = $"v{v.Year}.{v.Month}.{v.Commit}";
        var buildId = v.Prompts == 0 && v.Lines == 0 ? null : $"{shortVersion}.{v.Prompts}.{v.Lines}";
        return VersionFormat.Display(shortVersion, buildId, v.Channel);
    }

    private sealed record PublishedRelease(
        ReleaseVersion Version,
        string Tag,
        string? HtmlUrl,
        string? Body,
        DateTimeOffset? PublishedAt,
        IReadOnlySet<string> Assets);
}
