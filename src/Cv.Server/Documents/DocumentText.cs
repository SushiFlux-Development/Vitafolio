// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text;
using System.Text.RegularExpressions;
using Cv.Server.Errors;

namespace Cv.Server.Documents;

/// <summary>Rules for text and colours that end up in generated documents.</summary>
public static partial class DocumentText
{
    public const string DefaultAccentColor = "#14213D";

    // \z, not $: .NET's $ also matches before a trailing line break
    [GeneratedRegex(@"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\z")]
    private static partial Regex HexColorRegex();

    /// <summary>True for #rgb, #rgba, #rrggbb and #rrggbbaa - exactly what Typst's rgb() accepts, and nothing else.</summary>
    public static bool IsHexColor(string? value) => value is not null && HexColorRegex().IsMatch(value);

    /// <summary>Checks a colour a user saves; an empty value means "use the default".</summary>
    public static void ValidateColor(FieldErrors errors, string field, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        if (!IsHexColor(value.Trim())) errors.Add(field, "validation.color");
    }

    /// <summary>
    /// The colour to render with. Old stored values may be anything, so an invalid one must not break the document: it falls back to the
    /// default. A missing '#' is tolerated here (earlier versions accepted it); saving requires the canonical form.
    /// </summary>
    public static string NormalizeColor(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return DefaultAccentColor;
        var color = value.Trim();
        if (!color.StartsWith('#')) color = "#" + color;
        return IsHexColor(color) ? color : DefaultAccentColor;
    }

    /// <summary>
    /// Removes characters that cannot be part of a document: control characters (except tab and line breaks), unpaired surrogates and the
    /// Unicode non-characters. Word documents are XML, which refuses most of them outright; in a PDF they would show up as empty boxes.
    /// Line breaks are normalised to "\n".
    /// </summary>
    public static string Clean(string? value)
    {
        if (string.IsNullOrEmpty(value)) return value ?? string.Empty;
        var needsWork = false;
        foreach (var c in value)
        {
            if (!IsPlain(c)) { needsWork = true; break; }
        }
        if (!needsWork) return value;

        var builder = new StringBuilder(value.Length);
        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            if (c == '\r')
            {
                builder.Append('\n');
                if (i + 1 < value.Length && value[i + 1] == '\n') i++;
            }
            else if (char.IsHighSurrogate(c) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1]))
            {
                builder.Append(c).Append(value[++i]);
            }
            else if (IsPlain(c))
            {
                builder.Append(c);
            }
        }
        return builder.ToString();
    }

    private static bool IsPlain(char c)
    {
        if (c is '\n' or '\t') return true;
        if (char.IsControl(c)) return false;
        if (char.IsSurrogate(c)) return false;
        return c is not ('￾' or '￿');
    }
}
