// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

namespace Cv.Server.Documents;

/// <summary>One font family the documents can use. <see cref="Folder"/> is the sub folder below <c>Documents/Fonts</c>.</summary>
public sealed record DocumentFont(string Family, string Folder, bool Serif);

/// <summary>
/// The fonts that are shipped with the program (SIL Open Font License 1.1, licence text next to the files) and the only fonts documents can
/// use. The renderer does not look at fonts installed on the machine, so a PDF looks the same on Windows, in the Docker image and on a
/// developer machine. This list is the single source: the server publishes it to the web UI, validation and rendering read it too.
/// </summary>
public static class DocumentFonts
{
    public const string Default = "Liberation Sans";

    public static readonly IReadOnlyList<DocumentFont> All =
    [
        new("Liberation Sans", "LiberationSans", Serif: false),
        new("Roboto", "Roboto", Serif: false),
        new("Open Sans", "OpenSans", Serif: false),
        new("Inter", "Inter", Serif: false),
        new("Lato", "Lato", Serif: false),
        new("Source Sans 3", "SourceSans3", Serif: false),
        new("IBM Plex Sans", "IBMPlexSans", Serif: false),
        new("Work Sans", "WorkSans", Serif: false),
        new("Liberation Serif", "LiberationSerif", Serif: true),
        new("Merriweather", "Merriweather", Serif: true),
        new("Lora", "Lora", Serif: true),
        new("EB Garamond", "EBGaramond", Serif: true),
        new("Source Serif 4", "SourceSerif4", Serif: true),
        new("IBM Plex Serif", "IBMPlexSerif", Serif: true),
    ];

    /// <summary>Folder with the font files: next to the program, wherever the runtime put it (published app, Docker image, test run).</summary>
    public static string Directory => Path.Combine(AppContext.BaseDirectory, "Documents", "Fonts");

    /// <summary>
    /// The family to use for a stored or requested name. An unknown, empty or removed name falls back to <see cref="Default"/> instead of
    /// failing: old documents and settings must keep rendering when the list changes.
    /// </summary>
    public static string Normalize(string? requested)
    {
        var name = requested?.Trim();
        if (string.IsNullOrEmpty(name)) return Default;
        foreach (var font in All)
        {
            if (string.Equals(font.Family, name, StringComparison.OrdinalIgnoreCase)) return font.Family;
        }
        return Default;
    }

    /// <summary>The value to store for a font the user picked: nothing stays nothing ("use the default"), anything else becomes a shipped family.</summary>
    public static string? ForStorage(string? requested) => string.IsNullOrWhiteSpace(requested) ? null : Normalize(requested);

    /// <summary>True when the name is exactly one of the shipped families (for validation at save time).</summary>
    public static bool IsKnown(string? requested) =>
        !string.IsNullOrWhiteSpace(requested) && All.Any(f => string.Equals(f.Family, requested.Trim(), StringComparison.OrdinalIgnoreCase));

    /// <summary>The families whose files are not next to the program (empty when the installation is complete).</summary>
    public static IReadOnlyList<string> Missing() =>
        [.. All.Where(f => !System.IO.Directory.Exists(Path.Combine(Directory, f.Folder)) || System.IO.Directory.GetFiles(Path.Combine(Directory, f.Folder), "*.ttf").Length == 0).Select(f => f.Family)];

    /// <summary>The list as the web UI needs it.</summary>
    public static IReadOnlyList<object> Describe() => [.. All.Select(f => new { family = f.Family, serif = f.Serif })];
}
