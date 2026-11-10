using System.Globalization;
using System.Text.RegularExpressions;

namespace Cv.Server.Updates;

/// <summary>
/// A version as it appears in tags and GitHub releases:
/// <list type="bullet">
/// <item><c>vYear.Month.Commit</c> for a release (e.g. <c>v2026.11.7</c>)</item>
/// <item><c>vYear.Month.Commit.Prompts.Lines-beta</c> for a beta (e.g. <c>v2026.11.7.0.11-beta</c>)</item>
/// <item><c>vYear.Month.Commit.Prompts.Lines-nightly</c> for a nightly (e.g. <c>v2026.11.7.0.11-nightly</c>; <c>-alpha</c> is the older name)</item>
/// <item><c>vYear.Month.Commit-rcN</c> older release candidates, which count as betas: a pre-release, never a release</item>
/// </list>
/// Order: Year, then Commit, then Channel (Release &gt; Beta &gt; Nightly), then the counters. A tag ending in <c>-dev</c> never parses.
/// </summary>
public readonly partial record struct ReleaseVersion(
    int Year,
    int Month,
    int Commit,
    int Prompts,
    int Lines,
    bool IsBeta,
    bool IsNightly,
    int Candidate,
    string Text) : IComparable<ReleaseVersion>
{
    [GeneratedRegex(@"^v?(\d{4})\.(\d{1,2})\.(\d+)(?:\.(\d+)\.(\d+))?(?:-(?:(beta)|(nightly)|(alpha)|rc(\d+)))?\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Pattern();

    public static ReleaseVersion? Parse(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var trimmed = text.Trim();

        var match = Pattern().Match(trimmed);
        if (!match.Success) return null;

        // Tags are short, but a crafted release name must not overflow the parser
        if (!int.TryParse(match.Groups[1].Value, CultureInfo.InvariantCulture, out var year)
            || !int.TryParse(match.Groups[2].Value, CultureInfo.InvariantCulture, out var month)
            || !int.TryParse(match.Groups[3].Value, CultureInfo.InvariantCulture, out var commit))
        {
            return null;
        }
        if (!TryCounter(match.Groups[4], out var prompts) || !TryCounter(match.Groups[5], out var lines) || !TryCounter(match.Groups[9], out var candidate))
        {
            return null;
        }

        var isCandidate = match.Groups[9].Success;
        return new ReleaseVersion(year, month, commit, prompts, lines, match.Groups[6].Success || isCandidate, match.Groups[7].Success || match.Groups[8].Success, candidate, trimmed);
    }

    private static bool TryCounter(Group group, out int value)
    {
        value = 0;
        return !group.Success || int.TryParse(group.Value, CultureInfo.InvariantCulture, out value);
    }

    public bool IsRelease => !IsBeta && !IsNightly;

    public string Channel => IsBeta ? "beta" : IsNightly ? "nightly" : "release";

    public int CompareTo(ReleaseVersion other)
    {
        var c = Year.CompareTo(other.Year);
        if (c != 0) return c;
        c = Commit.CompareTo(other.Commit);
        if (c != 0) return c;

        // Same commit: Release > Beta > Nightly
        c = Rank.CompareTo(other.Rank);
        if (c != 0) return c;

        // Same channel: compare build counters, then the number of an older release candidate
        c = Prompts.CompareTo(other.Prompts);
        if (c != 0) return c;
        c = Lines.CompareTo(other.Lines);
        return c != 0 ? c : Candidate.CompareTo(other.Candidate);
    }

    // Higher rank = newer
    private int Rank => IsRelease ? 3 : IsBeta ? 2 : 1;

    public static bool operator <(ReleaseVersion left, ReleaseVersion right) => left.CompareTo(right) < 0;
    public static bool operator >(ReleaseVersion left, ReleaseVersion right) => left.CompareTo(right) > 0;
    public static bool operator <=(ReleaseVersion left, ReleaseVersion right) => left.CompareTo(right) <= 0;
    public static bool operator >=(ReleaseVersion left, ReleaseVersion right) => left.CompareTo(right) >= 0;
}
