// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text.Json;
using System.Text.Json.Serialization;
using Cv.Server.Errors;

namespace Cv.Server.Applications;

/// <summary>
/// What the user said in the click-through guide ("Ratgeber"): the situation, the years of experience, the plan and what needs explaining.
/// Stored per account (<c>profiles.GuideAnswersJson</c>) and used by <see cref="ContentSuggestionRules"/>. Every field may be missing:
/// the guide saves while the user is still clicking.
/// </summary>
public sealed record GuideAnswersDto(
    string? Situation,
    int? YearsOfExperience,
    string? Plan,
    IReadOnlyList<string>? Explain,
    string? Region);

public static class GuideAnswers
{
    public const string SituationSchool = "school";
    public const string SituationTraining = "training_or_studies";
    public const string SituationWorking = "working";
    public const string SituationReturning = "returning";

    public const string PlanSameField = "same_field";
    public const string PlanNewField = "new_field";
    public const string PlanFirstJob = "first_job";

    public const string RegionDe = "de";
    public const string RegionUk = "uk";
    public const string RegionUs = "us";

    public static readonly string[] Situations = [SituationSchool, SituationTraining, SituationWorking, SituationReturning];
    public static readonly string[] Plans = [PlanSameField, PlanNewField, PlanFirstJob];
    public static readonly string[] Regions = [RegionDe, RegionUk, RegionUs];

    /// <summary>In this order the topics are stored, so two equal answers give equal text.</summary>
    public static readonly string[] ExplainTopics = ["gap", "parental_leave", "illness", "unemployment", "dropped_out", "frequent_changes"];

    public const int MaxYears = 60;

    // More raw items than there are topics can only be an abuse of the endpoint
    private const int MaxExplainItems = 12;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.Never };

    public static void Validate(FieldErrors errors, GuideAnswersDto? body)
    {
        if (body is null) { errors.Add("body", "validation.required"); return; }
        Choice(errors, "situation", body.Situation, Situations);
        Choice(errors, "plan", body.Plan, Plans);
        Choice(errors, "region", body.Region, Regions);
        if (body.YearsOfExperience is { } years) InputRules.Range(errors, "yearsOfExperience", years, 0, MaxYears);
        if (body.Explain is { Count: > MaxExplainItems }) errors.Add("explain", "validation.max_items", new() { ["max"] = MaxExplainItems });
        else if (body.Explain is not null)
        {
            foreach (var item in body.Explain)
            {
                if (!ExplainTopics.Contains(Clean(item))) { errors.Add("explain", "validation.one_of", new() { ["allowed"] = ExplainTopics }); break; }
            }
        }
    }

    /// <summary>The canonical form of valid answers: lower case, trimmed, topics without duplicates in a fixed order.</summary>
    public static GuideAnswersDto Normalize(GuideAnswersDto body) => new(
        Clean(body.Situation) is { Length: > 0 } s ? s : null,
        body.YearsOfExperience,
        Clean(body.Plan) is { Length: > 0 } p ? p : null,
        ExplainTopics.Where(t => body.Explain?.Any(x => Clean(x) == t) == true).ToList(),
        Clean(body.Region) is { Length: > 0 } r ? r : null);

    public static string ToJson(GuideAnswersDto normalized) => JsonSerializer.Serialize(normalized, Json);

    /// <summary>Reads the stored column. Null when nothing was saved or the text is unreadable; a value that is not valid any more (a removed option) becomes "not answered".</summary>
    public static GuideAnswersDto? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            var raw = JsonSerializer.Deserialize<GuideAnswersDto>(json, Json);
            if (raw is null) return null;
            return new GuideAnswersDto(
                Known(raw.Situation, Situations),
                raw.YearsOfExperience is >= 0 and <= MaxYears ? raw.YearsOfExperience : null,
                Known(raw.Plan, Plans),
                ExplainTopics.Where(t => raw.Explain?.Any(x => Clean(x) == t) == true).ToList(),
                Known(raw.Region, Regions));
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string Clean(string? value) => value?.Trim().ToLowerInvariant() ?? "";

    private static string? Known(string? value, string[] allowed) => allowed.Contains(Clean(value)) ? Clean(value) : null;

    private static void Choice(FieldErrors errors, string field, string? value, string[] allowed)
    {
        if (value is null) return;
        InputRules.OneOf(errors, field, Clean(value), allowed);
    }
}
