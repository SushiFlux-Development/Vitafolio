using System.Text.RegularExpressions;

namespace Cv.Server.Configuration;

/// <summary>
/// How a version is written for people and for tags - the C# twin of <c>scripts/version-display.sh</c>; keep both in step.
/// Input is version.txt: line 1 = short version (<c>v2026.11.12</c>), line 2 = build id (<c>v2026.11.12.13.557</c>, may be missing).
/// <list type="bullet">
/// <item>Display: all five segments, the channel symbol in parentheses behind them. Release <c>v2026.11.12.13.557</c>, beta
/// <c>v2026.11.12.13.557 (β)</c>, nightly <c>v2026.11.12.13.557 (α)</c>, dev <c>v2026.11.10.13.557 (&lt;/&gt;)</c>. Without counters the short
/// version plus symbol (<c>v2026.11.12 (β)</c>) - never empty parentheses.</item>
/// <item>Tag (git/Docker, no spaces or parentheses): release <c>v2026.11.12</c>, beta <c>v2026.11.12.13.557-beta</c>, nightly
/// <c>v2026.11.12.13.557-nightly</c>. A development build has no tag of its own: its identifier is the plain build id.</item>
/// </list>
/// Channel: <c>beta</c>, <c>nightly</c> (also the older <c>alpha</c>) and <c>dev</c> as named, anything else counts as release (same as the script).
/// </summary>
public static partial class VersionFormat
{
    /// <summary>Greek small letter beta (U+03B2).</summary>
    public const string BetaMark = "β";

    /// <summary>Greek small letter alpha (U+03B1).</summary>
    public const string NightlyMark = "α";

    public const string DevMark = "</>";

    // The script accepts "<digits>.<digits>" after "<short>." and nothing else (no leading/trailing/double dots, no third part)
    [GeneratedRegex(@"^[0-9]+\.[0-9]+$")]
    private static partial Regex CountersPattern();

    /// <summary>The "prompts.lines" part of the build id, or null when it is missing or not "&lt;short&gt;.&lt;digits&gt;.&lt;digits&gt;".</summary>
    public static string? Counters(string shortVersion, string? buildId)
    {
        if (string.IsNullOrEmpty(buildId)) return null;
        var prefix = shortVersion + ".";
        if (!buildId.StartsWith(prefix, StringComparison.Ordinal)) return null;
        var rest = buildId[prefix.Length..];
        return CountersPattern().IsMatch(rest) ? rest : null;
    }

    public static string Display(string shortVersion, string? buildId, string? channel)
    {
        var full = Full(shortVersion, buildId);
        return Kind(channel) switch
        {
            "beta" => $"{full} ({BetaMark})",
            "nightly" => $"{full} ({NightlyMark})",
            "dev" => $"{full} ({DevMark})",
            _ => full,
        };
    }

    public static string Tag(string shortVersion, string? buildId, string? channel)
    {
        var full = Full(shortVersion, buildId);
        return Kind(channel) switch
        {
            "beta" => full + "-beta",
            "nightly" => full + "-nightly",
            "dev" => full,
            _ => shortVersion,
        };
    }

    private static string Full(string shortVersion, string? buildId) =>
        Counters(shortVersion, buildId) is { } counters ? $"{shortVersion}.{counters}" : shortVersion;

    /// <summary>The normalised channel: <c>alpha</c> is the older name of <c>nightly</c>.</summary>
    internal static string Kind(string? channel) => channel switch
    {
        "beta" or "dev" => channel,
        "nightly" or "alpha" => "nightly",
        _ => "release",
    };
}
