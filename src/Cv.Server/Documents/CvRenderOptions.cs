// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

namespace Cv.Server.Documents;

/// <summary>
/// User-configurable options when rendering a CV/resume document.
/// </summary>
public sealed record CvRenderOptions(
    string? Design,
    string? AccentColor,
    string? Font,
    bool? ShowPhoto,
    string? PhotoShape,
    string? Language,
    bool? ApplySelection = null)
{
    public string NormalizedDesign => DocumentDesigns.Normalize(Design);

    /// <summary>Whether the document shows what the profile settings select (suggestion plus own decisions) instead of the whole profile. Off unless asked for.</summary>
    public bool NormalizedApplySelection => ApplySelection ?? false;

    public string NormalizedAccentColor => DocumentText.NormalizeColor(AccentColor);

    public string NormalizedFont => DocumentFonts.Normalize(Font);

    public bool NormalizedShowPhoto => ShowPhoto ?? true;

    public string NormalizedPhotoShape => PhotoShape?.Trim().ToLowerInvariant() switch
    {
        "round" => "round",
        "rect" or "square" => "rect",
        _ => "rounded"
    };

    public string NormalizedLanguage => Language?.Trim().ToLowerInvariant() switch
    {
        "en" or "english" => "en",
        _ => "de"
    };
}

/// <summary>
/// Options when rendering an application dossier cover sheet (Deckblatt).
/// </summary>
public sealed record CoverSheetOptions(
    string? TargetJob,
    string? TargetCompany,
    IReadOnlyList<string>? Contents,
    string? AccentColor,
    string? Font,
    bool? ShowPhoto,
    string? PhotoShape,
    string? Language)
{
    public string NormalizedAccentColor => DocumentText.NormalizeColor(AccentColor);

    public string NormalizedFont => DocumentFonts.Normalize(Font);

    public bool NormalizedShowPhoto => ShowPhoto ?? true;

    public string NormalizedPhotoShape => PhotoShape?.Trim().ToLowerInvariant() switch
    {
        "round" => "round",
        "rect" or "square" => "rect",
        _ => "rounded"
    };

    public string NormalizedLanguage => Language?.Trim().ToLowerInvariant() switch
    {
        "en" or "english" => "en",
        _ => "de"
    };
}

public sealed record DossierAttachmentItem(
    string Title,
    string FilePath,
    string ContentType);

/// <summary>
/// Options when rendering a complete application portfolio dossier (Deckblatt, Anschreiben, Lebenslauf).
/// </summary>
public sealed record DossierRenderOptions(
    string? Design,
    string? AccentColor,
    string? Font,
    bool? ShowPhoto,
    string? PhotoShape,
    string? Language,
    bool? IncludeCoverSheet,
    string? TargetJob,
    string? TargetCompany,
    IReadOnlyList<string>? Contents,
    IReadOnlyList<DossierAttachmentItem>? Attachments = null)
{
    public string NormalizedDesign => DocumentDesigns.Normalize(Design);

    public string NormalizedAccentColor => DocumentText.NormalizeColor(AccentColor);

    public string NormalizedFont => DocumentFonts.Normalize(Font);

    public bool NormalizedShowPhoto => ShowPhoto ?? true;

    public string NormalizedPhotoShape => PhotoShape?.Trim().ToLowerInvariant() switch
    {
        "round" => "round",
        "rect" or "square" => "rect",
        _ => "rounded"
    };

    public string NormalizedLanguage => Language?.Trim().ToLowerInvariant() switch
    {
        "en" or "english" => "en",
        _ => "de"
    };

    public bool NormalizedIncludeCoverSheet => IncludeCoverSheet ?? true;

    /// <summary>Plain defaults, for the test render of a single attachment.</summary>
    internal static DossierRenderOptions ForCheck { get; } = new(null, null, null, null, null, null, null, null, null, null);
}
