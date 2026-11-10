// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text.Json;
using System.Text.Json.Serialization;
using Cv.Server.Errors;

namespace Cv.Server.Applications;

/// <summary>
/// What "Preview and export" of the master profile shows (API field <c>cvContentSettings</c> of the profile, stored as JSON in
/// <c>profiles.CvContentSettingsJson</c>): whether the suggestion of the app is followed, and the person's own decisions that beat it.
/// An override of "full" keeps an entry in, "short" and "hidden" take it down; the keys are ids of profile entries.
/// </summary>
public sealed record CvContentSettingsDto(bool UseSuggestion, CvSelectionDto Overrides);

/// <summary>What a request may carry: everything optional, missing parts mean "suggestion on, no overrides".</summary>
public sealed record CvContentSettingsRequest(bool? UseSuggestion, CvSelectionDto? Overrides);

public static class CvContentSettings
{
    public static readonly string[] StationLevels = [ContentSuggestionRules.Full, CvSelectionRules.Short, CvSelectionRules.Hidden];
    public static readonly string[] CertificateLevels = [ContentSuggestionRules.Full, CvSelectionRules.Hidden];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.Never };

    /// <summary>The setting of somebody who never chose anything: the suggestion is followed, nothing is overridden.</summary>
    public static CvContentSettingsDto Default { get; } = new(true, Empty());

    public static void Validate(FieldErrors errors, CvContentSettingsRequest? body)
    {
        if (body is null) { errors.Add("body", "validation.required"); return; }
        CvSelectionRules.Validate(errors, body.Overrides, "overrides", StationLevels, CertificateLevels);
    }

    /// <summary>The canonical form of valid settings: lower-case ids and values, groups always present (empty when nothing is overridden).</summary>
    public static CvContentSettingsDto Normalize(CvContentSettingsRequest body)
    {
        var overrides = CvSelectionRules.Normalize(body.Overrides, keepEmpty: true) ?? Empty();
        return new CvContentSettingsDto(body.UseSuggestion ?? true, overrides);
    }

    public static string ToJson(CvContentSettingsDto normalized) => JsonSerializer.Serialize(normalized, Json);

    /// <summary>Reads the stored column. Missing or unreadable text, and anything that is not valid any more, reads as the default.</summary>
    public static CvContentSettingsDto Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Default;
        try
        {
            var raw = JsonSerializer.Deserialize<CvContentSettingsRequest>(json, Json);
            if (raw is null) return Default;
            var errors = new FieldErrors();
            Validate(errors, raw);
            // A stored value this version does not know: the overrides are dropped, the choice about the suggestion is kept
            return errors.Any ? new CvContentSettingsDto(raw.UseSuggestion ?? true, Empty()) : Normalize(raw);
        }
        catch (JsonException)
        {
            return Default;
        }
    }

    private static CvSelectionDto Empty() =>
        new(new Dictionary<string, string?>(), new Dictionary<string, string?>(), new Dictionary<string, string?>(), []);
}
