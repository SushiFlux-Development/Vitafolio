// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text.RegularExpressions;

namespace Cv.Server.Documents;

/// <summary>
/// How stored ISO dates ("2018", "2018-01", "1985-09-20") are written in generated documents. The document language decides,
/// not the account's date format setting. Keep in step with <c>fmt-date</c> in the Typst library (Templates/lib.typ).
/// </summary>
public static partial class DocumentDates
{
    private static readonly string[] EnglishMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    [GeneratedRegex(@"^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$", RegexOptions.CultureInvariant)]
    private static partial Regex IsoPattern();

    /// <summary>"2018", "01/2018", "20.09.1985" (German) or "20 Sep 1985" (English); anything that is not a valid ISO date is returned as it is.</summary>
    public static string Format(string? value, bool english)
    {
        if (value is null) return "";
        var trimmed = value.Trim();
        var m = IsoPattern().Match(trimmed);
        if (!m.Success) return value;

        var year = m.Groups[1].Value;
        if (!m.Groups[2].Success) return year;
        var month = int.Parse(m.Groups[2].Value);
        if (month is < 1 or > 12) return value;
        if (!m.Groups[3].Success) return $"{m.Groups[2].Value}/{year}";

        var day = int.Parse(m.Groups[3].Value);
        if (day < 1 || day > DateTime.DaysInMonth(Math.Max(int.Parse(year), 1), month)) return value;
        return english
            ? $"{day} {EnglishMonths[month - 1]} {year}"
            : $"{m.Groups[3].Value}.{m.Groups[2].Value}.{year}";
    }
}
