using System.Net;

namespace Cv.Server.Configuration;

/// <summary>
/// The resolved settings of one running server: host mode, folders, channel, trusted proxies and tuning values. Built once in
/// <see cref="ServerApp.Build"/> from <see cref="ServerAppOptions"/> (wins), configuration / environment variables and the defaults.
/// </summary>
public sealed class ServerSettings
{
    public required HostMode Mode { get; init; }

    public required string DataDirectory { get; init; }

    public required string BackupDirectory { get; init; }

    public string DatabaseFile => Path.Combine(DataDirectory, "app.db");

    public string KeysDirectory => Path.Combine(DataDirectory, "keys");

    public required string Channel { get; init; }

    public string? VersionFilePath { get; init; }

    /// <summary>The customer changelog shipped with the program ("What's new" reads it); may not exist in a development checkout.</summary>
    public string? ChangelogPath { get; init; }

    /// <summary>Folder with <c>de/</c> and <c>en/</c> holding the manual as PDF; missing until the manuals are built.</summary>
    public string? HandbookDirectory { get; init; }

    public string? WebRootPath { get; init; }

    /// <summary>Desktop mode: the per-run token and the only Host header accepted (<c>127.0.0.1:&lt;port&gt;</c>).</summary>
    public string? DesktopToken { get; init; }

    public string? DesktopHost { get; init; }

    public IReadOnlyList<IPAddress> TrustedProxies { get; init; } = [];

    public IReadOnlyList<System.Net.IPNetwork> TrustedNetworks { get; init; } = [];

    /// <summary><c>ALLOWED_HOSTS</c>: host names (besides IP literals and localhost) the server mode answers to, see <see cref="Security.HostGuard"/>.</summary>
    public IReadOnlyList<string> AllowedHosts { get; init; } = [];

    /// <summary>Configuration key <c>Backups:Automatic</c> (default on): false switches the backup worker off completely, whatever the backup settings say.</summary>
    public bool AutomaticBackups { get; init; } = true;

    /// <summary>
    /// A refresh token that was rotated less than this long ago may be presented once more without counting as theft: two browser tabs
    /// can send the same refresh cookie at the same moment. Configuration key <c>Auth:RefreshReuseGraceSeconds</c>, default 5.
    /// </summary>
    public TimeSpan RefreshReuseGrace { get; init; } = TimeSpan.FromSeconds(5);

    public RateLimitSettings RateLimits { get; init; } = new();

    /// <summary>
    /// Storage per account for attachments (configuration key <c>Attachments:QuotaMegabytes</c>, default 250 MB - room for many certificates at
    /// a few MB each, while one account cannot fill the operator's disk).
    /// </summary>
    public long AttachmentQuotaBytes { get; init; } = 250L * 1024 * 1024;

    /// <summary>
    /// Largest backup this server makes or accepts (configuration keys <c>Backups:MaxFiles</c>, <c>Backups:MaxSizeMegabytes</c>; defaults 200,000 files
    /// and 16 GB): enough for many accounts at their attachment quota, while an uploaded archive cannot fill the disk.
    /// </summary>
    public Backups.BackupLimits BackupLimits { get; init; } = new(200_000, 16L * 1024 * 1024 * 1024);

    public bool IsDesktop => Mode == HostMode.Desktop;

    internal static ServerSettings Resolve(ServerAppOptions options, IConfiguration configuration, IHostEnvironment environment)
    {
        var mode = options.Mode;
        var repoRoot = RepoRoot.Find();
        var inContainer = string.Equals(Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"), "true", StringComparison.OrdinalIgnoreCase);

        var dataDir = NonEmpty(options.DataDirectory) ?? NonEmpty(configuration["DATA_DIR"]);
        var dataDirIsRepoDefault = false;
        if (dataDir is null)
        {
            if (mode == HostMode.Desktop)
            {
                dataDir = Branding.DesktopDataDirectory(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData));
            }
            else if (inContainer)
            {
                dataDir = "/data";
            }
            else if (repoRoot is not null)
            {
                dataDir = Path.Combine(repoRoot, ".data");
                dataDirIsRepoDefault = true;
            }
            else
            {
                dataDir = Path.Combine(AppContext.BaseDirectory, "data");
            }
        }
        dataDir = Path.GetFullPath(dataDir);

        var backupDir = NonEmpty(options.BackupDirectory) ?? NonEmpty(configuration["BACKUP_DIR"]);
        backupDir ??= dataDirIsRepoDefault && repoRoot is not null
            ? Path.Combine(repoRoot, ".backups", "auto")
            : Path.Combine(dataDir, "backups");
        backupDir = Path.GetFullPath(backupDir);

        var channel = (NonEmpty(options.Channel) ?? NonEmpty(configuration["APP_CHANNEL"]) ?? (environment.IsDevelopment() ? "dev" : "release"))
            .Trim().ToLowerInvariant();
        if (channel is not ("dev" or "beta" or "nightly" or "alpha" or "release")) channel = "release";

        var versionFile = NonEmpty(options.VersionFilePath) ?? NonEmpty(configuration["VERSION_FILE"]);
        if (versionFile is null)
        {
            var nextToApp = Path.Combine(AppContext.BaseDirectory, "version.txt");
            versionFile = File.Exists(nextToApp) || repoRoot is null ? nextToApp : Path.Combine(repoRoot, "version.txt");
        }

        var changelog = NonEmpty(options.ChangelogPath) ?? NonEmpty(configuration["CHANGELOG_FILE"]) ?? FirstExistingFile(repoRoot, "CHANGELOG.md");
        var handbook = NonEmpty(options.HandbookDirectory) ?? NonEmpty(configuration["HANDBOOK_DIR"])
            ?? (Directory.Exists(Path.Combine(AppContext.BaseDirectory, "docs", "handbuch")) || repoRoot is null
                ? Path.Combine(AppContext.BaseDirectory, "docs", "handbuch")
                : Path.Combine(repoRoot, "docs", "handbuch"));

        string? webRoot = NonEmpty(options.WebRootPath) ?? NonEmpty(configuration["WEB_ROOT"]);
        if (webRoot is null && options.WebRootPath is null)
        {
            var bundled = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            if (File.Exists(Path.Combine(bundled, "index.html"))) webRoot = bundled;
        }
        if (webRoot is not null) webRoot = Path.GetFullPath(webRoot);

        string? desktopHost = null;
        string? desktopToken = null;
        if (mode == HostMode.Desktop)
        {
            if (options.Urls.Length != 1 || !Uri.TryCreate(options.Urls[0], UriKind.Absolute, out var url)
                || url.Scheme != Uri.UriSchemeHttp || url.Host != "127.0.0.1" || url.IsDefaultPort || url.Port <= 0)
            {
                throw new ArgumentException("Desktop mode needs exactly one URL of the form http://127.0.0.1:<port>.", nameof(options));
            }
            if (string.IsNullOrEmpty(options.DesktopToken) || options.DesktopToken.Length < 32)
            {
                throw new ArgumentException("Desktop mode needs a random DesktopToken (at least 32 characters).", nameof(options));
            }
            desktopHost = $"127.0.0.1:{url.Port}";
            desktopToken = options.DesktopToken;
        }

        var (proxies, networks) = ParseTrustedProxies(configuration["TRUSTED_PROXIES"]);

        return new ServerSettings
        {
            Mode = mode,
            DataDirectory = dataDir,
            BackupDirectory = backupDir,
            Channel = channel,
            VersionFilePath = versionFile,
            ChangelogPath = changelog,
            HandbookDirectory = handbook,
            WebRootPath = webRoot,
            DesktopHost = desktopHost,
            DesktopToken = desktopToken,
            TrustedProxies = proxies,
            TrustedNetworks = networks,
            AllowedHosts = Security.HostGuard.ParseAllowedHosts(configuration["ALLOWED_HOSTS"]),
            AutomaticBackups = configuration.GetValue("Backups:Automatic", true),
            RefreshReuseGrace = TimeSpan.FromSeconds(Math.Clamp(configuration.GetValue("Auth:RefreshReuseGraceSeconds", 5), 0, 60)),
            RateLimits = RateLimitSettings.From(configuration.GetSection("RateLimits")),
            AttachmentQuotaBytes = Math.Max(1, configuration.GetValue<long>("Attachments:QuotaMegabytes", 250)) * 1024 * 1024,
            BackupLimits = new Backups.BackupLimits(
                Math.Max(1, configuration.GetValue("Backups:MaxFiles", 200_000)),
                Math.Max(1, configuration.GetValue<long>("Backups:MaxSizeMegabytes", 16L * 1024)) * 1024 * 1024),
        };
    }

    /// <summary>
    /// <c>TRUSTED_PROXIES</c>: comma-separated IP addresses and CIDR networks (e.g. <c>172.17.0.1, 10.0.0.0/8</c>). An invalid entry stops the
    /// start: silently ignoring it would make every client look like the proxy (one shared rate-limit bucket, wrong IPs in the log).
    /// </summary>
    internal static (IReadOnlyList<IPAddress> Proxies, IReadOnlyList<System.Net.IPNetwork> Networks) ParseTrustedProxies(string? value)
    {
        var proxies = new List<IPAddress>();
        var networks = new List<System.Net.IPNetwork>();
        if (string.IsNullOrWhiteSpace(value)) return (proxies, networks);
        foreach (var raw in value.Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (raw.Contains('/'))
            {
                if (!System.Net.IPNetwork.TryParse(raw, out var network))
                {
                    throw new InvalidOperationException($"TRUSTED_PROXIES: '{raw}' ist kein gültiges Netz (CIDR, z. B. 10.0.0.0/8).");
                }
                networks.Add(network);
            }
            else if (IPAddress.TryParse(raw, out var address))
            {
                proxies.Add(address);
            }
            else
            {
                throw new InvalidOperationException($"TRUSTED_PROXIES: '{raw}' ist keine gültige IP-Adresse.");
            }
        }
        return (proxies, networks);
    }

    /// <summary>Next to the program when it is there, otherwise in the source checkout (development, tests).</summary>
    private static string FirstExistingFile(string? repoRoot, string name)
    {
        var nextToApp = Path.Combine(AppContext.BaseDirectory, name);
        return File.Exists(nextToApp) || repoRoot is null ? nextToApp : Path.Combine(repoRoot, name);
    }

    private static string? NonEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

/// <summary>Permits per minute and client IP for the sensitive endpoints (configuration section <c>RateLimits</c>).</summary>
public sealed class RateLimitSettings
{
    public int Login { get; init; } = 10;

    public int TwoFactor { get; init; } = 10;

    public int Setup { get; init; } = 5;

    public int Register { get; init; } = 5;

    public int Password { get; init; } = 5;

    public int EmergencyReset { get; init; } = 5;

    public int StepUp { get; init; } = 10;

    /// <summary>A person works through a few AI actions per minute; 30 keeps a script from draining a key.</summary>
    public int Ai { get; init; } = 30;

    /// <summary>The live preview renders on pause while typing, about once a second at most.</summary>
    public int Render { get; init; } = 60;

    /// <summary>Uses of the administrator's AI key per account and day (own keys are not limited).</summary>
    public int AiServerKeyPerDay { get; init; } = 50;

    /// <summary>Wrong passwords / codes per account and client network and <see cref="AccountWindow"/>.</summary>
    public int AccountAttempts { get; init; } = 20;

    public TimeSpan AccountWindow { get; init; } = TimeSpan.FromMinutes(15);

    public TimeSpan Window { get; init; } = TimeSpan.FromMinutes(1);

    internal static RateLimitSettings From(IConfigurationSection section) => new()
    {
        Login = Math.Max(1, section.GetValue("Login", 10)),
        TwoFactor = Math.Max(1, section.GetValue("TwoFactor", 10)),
        Setup = Math.Max(1, section.GetValue("Setup", 5)),
        Register = Math.Max(1, section.GetValue("Register", 5)),
        Password = Math.Max(1, section.GetValue("Password", 5)),
        EmergencyReset = Math.Max(1, section.GetValue("EmergencyReset", 5)),
        StepUp = Math.Max(1, section.GetValue("StepUp", 10)),
        Ai = Math.Max(1, section.GetValue("Ai", 30)),
        Render = Math.Max(1, section.GetValue("Render", 60)),
        AiServerKeyPerDay = Math.Max(1, section.GetValue("AiServerKeyPerDay", 50)),
        AccountAttempts = Math.Max(1, section.GetValue("AccountAttempts", 20)),
        AccountWindow = TimeSpan.FromMinutes(Math.Clamp(section.GetValue("AccountWindowMinutes", 15), 1, 1440)),
        Window = TimeSpan.FromSeconds(Math.Clamp(section.GetValue("WindowSeconds", 60), 1, 3600)),
    };
}

/// <summary>The repository root (folder with Cv.slnx) when the server runs from a source checkout; null otherwise (container, installed program).</summary>
internal static class RepoRoot
{
    public static string? Find()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            for (var dir = new DirectoryInfo(start); dir is not null; dir = dir.Parent)
            {
                if (File.Exists(Path.Combine(dir.FullName, "Cv.slnx"))) return dir.FullName;
            }
        }
        return null;
    }
}
