// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

namespace Cv.Server.Documents;

/// <summary>One CV design. Its template is <c>Templates/cv_&lt;Id&gt;.typ</c> and defines <c>design-&lt;Id&gt;</c>; the names and descriptions live in the web UI's translations.</summary>
public sealed record DocumentDesign(string Id, string Group = DocumentDesignGroups.Standard);

/// <summary>How the design gallery groups the designs. Names live in the web UI.</summary>
public static class DocumentDesignGroups
{
    public const string Standard = "standard";
    public const string Expressive = "expressive";
}

/// <summary>
/// The CV designs the program offers. This list is the single source: rendering, validation and the web UI (through /api/bootstrap) read it.
/// The Word export has one layout of its own and does not depend on the design.
/// </summary>
public static class DocumentDesigns
{
    public const string Default = "classic";

    public static readonly IReadOnlyList<DocumentDesign> All =
    [
        new("classic"),
        new("modern"),
        new("plain"),
        new("sidebar"),
        new("rail"),
        new("banner"),
        new("timeline"),
        new("elegant"),
        new("compact"),
        new("edge"),
        new("grid"),
        new("executive"),
        new("wave", DocumentDesignGroups.Expressive),
        new("diagonal", DocumentDesignGroups.Expressive),
        new("arc", DocumentDesignGroups.Expressive),
        new("facet", DocumentDesignGroups.Expressive),
        new("monogram", DocumentDesignGroups.Expressive),
        new("aurora", DocumentDesignGroups.Expressive),
    ];

    /// <summary>All design ids, in the order the user sees them.</summary>
    public static readonly string[] Ids = [.. All.Select(d => d.Id)];

    // Spellings that older versions accepted for a design.
    private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase) { ["schlicht"] = "plain" };

    /// <summary>The design to use for a stored or requested value. An unknown or empty value falls back to <see cref="Default"/> instead of failing, so stored documents keep rendering when the list changes.</summary>
    public static string Normalize(string? requested)
    {
        var name = requested?.Trim();
        if (string.IsNullOrEmpty(name)) return Default;
        if (Aliases.TryGetValue(name, out var alias)) return alias;
        foreach (var design in All)
        {
            if (string.Equals(design.Id, name, StringComparison.OrdinalIgnoreCase)) return design.Id;
        }
        return Default;
    }

    /// <summary>The list as the web UI needs it.</summary>
    public static IReadOnlyList<object> Describe() => [.. All.Select(d => new { id = d.Id, group = d.Group })];
}
