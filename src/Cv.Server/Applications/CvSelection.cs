// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text.Json;
using System.Text.Json.Serialization;
using Cv.Server.Controllers;
using Cv.Server.Errors;

namespace Cv.Server.Applications;

/// <summary>
/// What one application takes from the master profile (API field <c>cvSelection</c>, stored as JSON in <c>applications.CvSelectionJson</c>).
/// The keys are the ids of profile entries. An entry that is not named is shown in full, so an entry added to the profile later appears by
/// itself and an application without a selection (null) stays exactly as it was.
/// </summary>
public sealed record CvSelectionDto(
    IReadOnlyDictionary<string, string?>? Experiences,
    IReadOnlyDictionary<string, string?>? Educations,
    IReadOnlyDictionary<string, string?>? Certificates,
    IReadOnlyList<string>? HiddenSections);

public static class CvSelectionRules
{
    public const string Short = "short";
    public const string Hidden = "hidden";
    public const string CustomPrefix = "custom:";

    public static readonly string[] StationLevels = [Short, Hidden];
    public static readonly string[] CertificateLevels = [Hidden];
    public static readonly string[] SectionNames = ["summary", "skills", "languages", "interests"];

    // A profile has far fewer entries than this; the limits only stop absurd payloads (a key is 36 characters)
    public const int MaxEntriesPerGroup = 200;
    public const int MaxHiddenSections = 50;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    public static void Validate(FieldErrors errors, CvSelectionDto? body) =>
        Validate(errors, body, "cvSelection", StationLevels, CertificateLevels);

    /// <summary>The same checks for another use of the shape (the overrides of the profile settings may also say "full"); <paramref name="prefix"/> names the field in the errors.</summary>
    public static void Validate(FieldErrors errors, CvSelectionDto? body, string prefix, string[] stationLevels, string[] certificateLevels)
    {
        if (body is null) return;
        Group(errors, prefix + ".experiences", body.Experiences, stationLevels);
        Group(errors, prefix + ".educations", body.Educations, stationLevels);
        Group(errors, prefix + ".certificates", body.Certificates, certificateLevels);

        if (body.HiddenSections is null) return;
        var field = prefix + ".hiddenSections";
        if (body.HiddenSections.Count > MaxHiddenSections)
        {
            errors.Add(field, "validation.max_items", new() { ["max"] = MaxHiddenSections });
            return;
        }
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var raw in body.HiddenSections)
        {
            var section = NormalizeSection(raw);
            if (section is null) { errors.Add(field, "validation.invalid_value"); return; }
            if (!seen.Add(section)) { errors.Add(field, "validation.duplicates"); return; }
        }
    }

    /// <summary>
    /// The canonical form of a valid selection (ids in lower case, values trimmed), or null when it selects nothing: "everything in full"
    /// is stored as no selection at all.
    /// </summary>
    public static CvSelectionDto? Normalize(CvSelectionDto? body, bool keepEmpty = false)
    {
        if (body is null) return null;
        var normalized = new CvSelectionDto(
            Canonical(body.Experiences),
            Canonical(body.Educations),
            Canonical(body.Certificates),
            body.HiddenSections is { Count: > 0 } ? [.. body.HiddenSections.Select(NormalizeSection).OfType<string>()] : null);
        // The settings of the profile always carry all four groups, empty when nothing is chosen
        if (keepEmpty)
        {
            return new CvSelectionDto(
                normalized.Experiences ?? new Dictionary<string, string?>(),
                normalized.Educations ?? new Dictionary<string, string?>(),
                normalized.Certificates ?? new Dictionary<string, string?>(),
                normalized.HiddenSections ?? []);
        }
        return normalized.Experiences is null && normalized.Educations is null && normalized.Certificates is null && normalized.HiddenSections is null
            ? null
            : normalized;
    }

    public static string? ToJson(CvSelectionDto? normalized) => normalized is null ? null : JsonSerializer.Serialize(normalized, Json);

    /// <summary>Reads the stored column; null for "nothing selected" and for text that cannot be read (the application then renders in full).</summary>
    public static CvSelectionDto? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<CvSelectionDto>(json, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// The single place where a selection is applied, before anything is rendered (preview, download, the frozen snapshot). Ids that do not
    /// belong to this profile (another account, a deleted entry) match nothing and are ignored; so are values this version does not know.
    /// "Short" keeps title, employer or institution and period and drops the description.
    /// </summary>
    public static ProfileResponse Apply(ProfileResponse profile, CvSelectionDto? selection)
    {
        if (selection is null) return profile;

        var experiences = Levels(selection.Experiences, StationLevels);
        var educations = Levels(selection.Educations, StationLevels);
        var certificates = Levels(selection.Certificates, CertificateLevels);
        var sections = new HashSet<string>(selection.HiddenSections?.Select(NormalizeSection).OfType<string>() ?? [], StringComparer.Ordinal);

        string? Level(Dictionary<Guid, string> levels, Guid id) => levels.GetValueOrDefault(id);

        return profile with
        {
            Bio = sections.Contains("summary") ? null : profile.Bio,
            Experiences = [.. profile.Experiences
                .Where(e => Level(experiences, e.Id) != Hidden)
                .Select(e => Level(experiences, e.Id) == Short ? e with { Description = null } : e)],
            Educations = [.. profile.Educations
                .Where(e => Level(educations, e.Id) != Hidden)
                .Select(e => Level(educations, e.Id) == Short ? e with { Description = null } : e)],
            Certificates = [.. profile.Certificates.Where(c => Level(certificates, c.Id) != Hidden)],
            Skills = sections.Contains("skills") ? [] : profile.Skills,
            Languages = sections.Contains("languages") ? [] : profile.Languages,
            Interests = sections.Contains("interests") ? [] : profile.Interests,
            CustomSections = [.. profile.CustomSections.Where(s => !sections.Contains(CustomPrefix + s.Id.ToString("D")))],
        };
    }

    private static void Group(FieldErrors errors, string field, IReadOnlyDictionary<string, string?>? group, string[] allowed)
    {
        if (group is null) return;
        if (group.Count > MaxEntriesPerGroup)
        {
            errors.Add(field, "validation.max_items", new() { ["max"] = MaxEntriesPerGroup });
            return;
        }
        var seen = new HashSet<Guid>();
        foreach (var (key, value) in group)
        {
            if (!Guid.TryParseExact(key, "D", out var id)) { errors.Add(field, "validation.invalid_value"); return; }
            if (!seen.Add(id)) { errors.Add(field, "validation.duplicates"); return; }
            if (!allowed.Contains(value?.Trim().ToLowerInvariant())) { errors.Add(field, "validation.one_of", new() { ["allowed"] = allowed }); return; }
        }
    }

    private static Dictionary<string, string?>? Canonical(IReadOnlyDictionary<string, string?>? group) =>
        group is { Count: > 0 }
            ? group.ToDictionary(p => Guid.ParseExact(p.Key, "D").ToString("D"), p => (string?)p.Value!.Trim().ToLowerInvariant())
            : null;

    private static Dictionary<Guid, string> Levels(IReadOnlyDictionary<string, string?>? group, string[] allowed)
    {
        var result = new Dictionary<Guid, string>();
        if (group is null) return result;
        foreach (var (key, value) in group)
        {
            var level = value?.Trim().ToLowerInvariant();
            if (Guid.TryParseExact(key, "D", out var id) && level is not null && allowed.Contains(level)) result[id] = level;
        }
        return result;
    }

    /// <summary>"summary", "skills", "languages", "interests" or "custom:&lt;guid&gt;" in canonical form; null for anything else.</summary>
    private static string? NormalizeSection(string? raw)
    {
        var value = raw?.Trim().ToLowerInvariant();
        if (value is null) return null;
        if (SectionNames.Contains(value)) return value;
        if (value.StartsWith(CustomPrefix, StringComparison.Ordinal) && Guid.TryParseExact(value[CustomPrefix.Length..], "D", out var id))
        {
            return CustomPrefix + id.ToString("D");
        }
        return null;
    }
}
