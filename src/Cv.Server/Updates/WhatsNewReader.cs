using Cv.Server.Configuration;

namespace Cv.Server.Updates;

public sealed record WhatsNewDto(
    bool Show,
    string? Version,
    string? Tag,
    string Language,
    string? Summary,
    IReadOnlyList<ChangelogSection> Sections);

/// <summary>
/// The entry of the running version from the customer changelog that ships with the program. A development build, a version without an entry and a
/// missing file all give "nothing to show"; the shipped file is small, so it is simply read when asked.
/// </summary>
public sealed class WhatsNewReader(AppVersion appVersion, ServerSettings settings, ILogger<WhatsNewReader> logger)
{
    /// <summary>Generous for a changelog; a corrupt or replaced file must not be read into memory without a limit.</summary>
    private const long MaxFileBytes = 4L * 1024 * 1024;

    public VersionInfo Current => appVersion.Current;

    public string CurrentTag => VersionFormat.Tag(Current.Short, Current.BuildId, Current.Channel);

    public bool IsDevelopmentBuild => string.Equals(Current.Channel, "dev", StringComparison.OrdinalIgnoreCase);

    public WhatsNewDto? Read(string language, bool show)
    {
        if (IsDevelopmentBuild) return null;
        var markdown = ReadFile();
        if (markdown is null) return null;
        var current = Current;
        var entry = ChangelogParser.FindEntry(markdown, language, current.Short, current.BuildId, current.Channel);
        return entry is null ? null : new WhatsNewDto(show, current.Version, CurrentTag, language, entry.Summary, entry.Sections);
    }

    private string? ReadFile()
    {
        var path = settings.ChangelogPath;
        if (path is null) return null;
        try
        {
            var info = new FileInfo(path);
            if (!info.Exists || info.Length > MaxFileBytes) return null;
            return File.ReadAllText(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(ex, "Der Änderungsverlauf {File} kann nicht gelesen werden.", path);
            return null;
        }
    }
}
