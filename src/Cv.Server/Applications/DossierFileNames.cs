// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text;

namespace Cv.Server.Applications;

/// <summary>
/// The file name of a dossier: <c>Bewerbung_Firma_Stelle.pdf</c> (<c>Application_...</c> for an English one). One function for the single
/// download, for the list of applications and for the ZIP of several dossiers. A name is safe by construction: company and job keep only
/// letters and digits (of every script, umlauts included), hyphens and underscores, so there are no path parts, no dots, no blanks at the end,
/// no control or direction characters, and the fixed prefix means the name never is a reserved Windows device name (CON, NUL, COM1, ...).
/// </summary>
public static class DossierFileNames
{
    /// <summary>Each of company and job is cut after this many characters, so the whole name stays far below every file system's limit.</summary>
    public const int MaxPartLength = 60;

    public static string For(string? company, string? jobTitle, string? language)
    {
        var companyPart = Part(company);
        var jobPart = Part(jobTitle);
        var prefix = language == "en" ? "Application" : "Bewerbung";
        return companyPart.Length > 0 || jobPart.Length > 0
            ? $"{prefix}_{companyPart}_{jobPart}.pdf"
            : $"{prefix}.pdf";
    }

    /// <summary>The letters, digits, hyphens and underscores of the text in composed form, at most <see cref="MaxPartLength"/> characters (never cutting a character in two).</summary>
    public static string Part(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var result = new StringBuilder();
        var count = 0;
        // Composed form first: "u" plus a combining diaeresis is one letter for the reader and must not lose its dots
        foreach (var rune in input.Normalize(NormalizationForm.FormC).EnumerateRunes())
        {
            if (!(Rune.IsLetterOrDigit(rune) || rune.Value is '-' or '_')) continue;
            if (count == MaxPartLength) break;
            result.Append(rune.ToString());
            count++;
        }
        return result.ToString();
    }

    /// <summary>Makes a name unique among the names already used in one ZIP (compared without regard to case, as Windows does): <c>name (2).pdf</c>, <c>name (3).pdf</c>, ...</summary>
    public static string Unique(string name, ISet<string> used)
    {
        var candidate = name;
        var stem = Path.GetFileNameWithoutExtension(name);
        var extension = Path.GetExtension(name);
        for (var n = 2; !used.Add(candidate); n++) candidate = $"{stem} ({n}){extension}";
        return candidate;
    }
}
