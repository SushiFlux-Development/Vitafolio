using System.Globalization;
using System.Text.RegularExpressions;
using Cv.Server.Configuration;

namespace Cv.Server.Updates;

/// <summary>One block of a release entry: what kind of change, the heading as written in the file, the bullets (inline Markdown is left as it is).</summary>
public sealed record ChangelogSection(string Category, string Title, IReadOnlyList<string> Items);

public sealed record ChangelogEntry(string Heading, string? Summary, IReadOnlyList<ChangelogSection> Sections);

/// <summary>
/// Reads the customer changelog: one block per language (<c>&lt;a name="english"&gt;</c> first, then <c>&lt;a name="deutsch"&gt;</c>) with one <c>## v...</c> entry per
/// version, each entry with an optional intro paragraph and <c>### ✨ New</c> style sections of bullets. It understands every heading the commit hook has
/// written so far and will write, so entries that are already stamped stay found: <c>v2026.11.7 (0.11 α)</c>, <c>v2026.11.1 (19.31258 β)</c>,
/// <c>v2026.11.12 (13.557)</c>, <c>v2026.11.12.13.557</c> and <c>v2026.11.12.13.557 (β)</c>, each with an optional <c> · Platform</c> suffix.
/// </summary>
public static partial class ChangelogParser
{
    public const string Other = "other";

    // Everything after the version: optional five-segment counters, optional parentheses, optional " · Platform"
    [GeneratedRegex(@"^##\s+v(\d{4}\.\d{1,2}\.\d+)(?:\.(\d+)\.(\d+))?(?:\s*\(([^)]*)\))?(?:\s*·.*)?\s*\z", RegexOptions.CultureInvariant)]
    private static partial Regex VersionHeading();

    [GeneratedRegex(@"^\s*(\d+)\.(\d+)")]
    private static partial Regex ParenCounters();

    [GeneratedRegex(@"^<a\s+(?:name|id)=""(\w+)""", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Anchor();

    [GeneratedRegex(@"^###\s+(.+)\z", RegexOptions.CultureInvariant)]
    private static partial Regex SectionHeading();

    [GeneratedRegex(@"^\p{P}*\p{S}*\s*")]
    private static partial Regex LeadingSymbols();

    /// <summary>The entry of this version in the given language ("de" / "en"), or null. Without a matching language block the whole file is searched.</summary>
    public static ChangelogEntry? FindEntry(string markdown, string language, string shortVersion, string? buildId, string? channel)
    {
        var lines = markdown.ReplaceLineEndings("\n").Split('\n');
        var anchorName = language == "en" ? "english" : "deutsch";
        var (start, end) = LanguageBlock(lines, anchorName);

        var counters = VersionFormat.Counters(shortVersion, buildId);
        var kind = VersionFormat.Kind(channel);
        var version = shortVersion.TrimStart('v');
        for (var i = start; i < end; i++)
        {
            var heading = lines[i].TrimEnd();
            if (!heading.StartsWith("## v", StringComparison.Ordinal)) continue;
            var match = VersionHeading().Match(heading);
            if (!match.Success) continue;
            if (!string.Equals(match.Groups[1].Value, version, StringComparison.Ordinal)) continue;
            if (HeadingChannel(match) != kind) continue;
            var headingCounters = HeadingCounters(match);
            if (headingCounters is not null && counters is not null && headingCounters != counters) continue;
            return ReadEntry(lines, i, end);
        }
        return null;
    }

    private static (int Start, int End) LanguageBlock(string[] lines, string anchorName)
    {
        var start = -1;
        var end = lines.Length;
        for (var i = 0; i < lines.Length; i++)
        {
            var match = Anchor().Match(lines[i]);
            if (!match.Success) continue;
            if (string.Equals(match.Groups[1].Value, anchorName, StringComparison.OrdinalIgnoreCase)) start = i + 1;
            else if (start >= 0)
            {
                end = i;
                break;
            }
        }
        return start >= 0 ? (start, end) : (0, lines.Length);
    }

    private static string? HeadingCounters(Match match)
    {
        if (match.Groups[2].Success) return $"{match.Groups[2].Value}.{match.Groups[3].Value}";
        var inParentheses = ParenCounters().Match(match.Groups[4].Value);
        return inParentheses.Success ? $"{inParentheses.Groups[1].Value}.{inParentheses.Groups[2].Value}" : null;
    }

    private static string HeadingChannel(Match match)
    {
        var marks = match.Groups[4].Value;
        if (marks.Contains(VersionFormat.BetaMark, StringComparison.Ordinal)) return "beta";
        if (marks.Contains(VersionFormat.NightlyMark, StringComparison.Ordinal)) return "nightly";
        if (marks.Contains(VersionFormat.DevMark, StringComparison.Ordinal) || marks.Contains("-dev", StringComparison.Ordinal)) return "dev";
        return "release";
    }

    private static ChangelogEntry ReadEntry(string[] lines, int headingLine, int end)
    {
        var summary = new List<string>();
        var sections = new List<(string Title, List<string> Items)>();
        var paragraph = new List<string>();

        void FlushParagraph()
        {
            if (paragraph.Count == 0) return;
            var text = string.Join(' ', paragraph);
            if (sections.Count == 0) summary.Add(text);
            else sections[^1].Items.Add(text);
            paragraph.Clear();
        }

        var last = headingLine;
        for (var i = headingLine + 1; i < end; i++)
        {
            var raw = lines[i];
            var line = raw.Trim();
            if (line.StartsWith("## ", StringComparison.Ordinal) || line == "---" || Anchor().IsMatch(line)) break;
            last = i;

            var section = SectionHeading().Match(line);
            if (section.Success)
            {
                FlushParagraph();
                sections.Add((LeadingSymbols().Replace(section.Groups[1].Value.Trim(), ""), []));
                continue;
            }
            if (line.Length == 0)
            {
                FlushParagraph();
                continue;
            }
            if (line.StartsWith("- ", StringComparison.Ordinal) || line.StartsWith("* ", StringComparison.Ordinal))
            {
                FlushParagraph();
                // A bullet may run over several lines; the following indented lines belong to it
                var text = line[2..].Trim();
                while (i + 1 < end && lines[i + 1].Length > 0 && char.IsWhiteSpace(lines[i + 1][0]) && lines[i + 1].Trim().Length > 0)
                {
                    text += " " + lines[++i].Trim();
                    last = i;
                }
                if (sections.Count == 0) sections.Add(("", []));
                sections[^1].Items.Add(text);
                continue;
            }
            paragraph.Add(line);
        }
        FlushParagraph();
        _ = last;

        return new ChangelogEntry(
            lines[headingLine].TrimEnd(),
            summary.Count == 0 ? null : string.Join("\n\n", summary),
            sections.Select(s => new ChangelogSection(Category(s.Title), s.Title, s.Items)).ToList());
    }

    private static string Category(string title)
    {
        var lower = title.ToLowerInvariant();
        foreach (var (keys, category) in Categories)
        {
            if (keys.Any(k => lower.Contains(k, StringComparison.Ordinal))) return category;
        }
        return Other;
    }

    private static readonly (string[] Keys, string Category)[] Categories =
    [
        (["security", "sicherheit"], "security"),
        (["fix", "behoben", "fehlerbehebung"], "fixed"),
        (["deprecated", "veraltet"], "deprecated"),
        (["removed", "entfernt"], "removed"),
        (["change", "geändert", "geändert", "änderung"], "changed"),
        (["new", "neu"], "new"),
    ];

    /// <summary>"de" or "en" from what the caller sent; anything else is rejected by the endpoint.</summary>
    public static string NormalizeLanguage(string? language) =>
        (language ?? "de").ToLower(CultureInfo.InvariantCulture) switch { "en" => "en", "de" => "de", _ => "" };
}
