// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text.RegularExpressions;
using Cv.Server.Controllers;
using Cv.Server.Data;

namespace Cv.Server.Applications;

public sealed record ContentSuggestionDto(
    int YearsOfExperience,
    string Stage,
    string? Situation,
    string? Plan,
    IReadOnlyList<ItemSuggestionDto> Experiences,
    IReadOnlyList<ItemSuggestionDto> Educations,
    IReadOnlyList<ItemSuggestionDto> Certificates,
    IReadOnlyList<AttachmentSuggestionDto> Attachments,
    IReadOnlyList<ChecklistItemDto> Checklist);

/// <summary>A suggestion for a station, an education or a certificate: full, short or hidden (certificates: full or hidden).</summary>
/// <param name="Suggestion">What the rules suggest.</param>
/// <param name="Effective">What counts: the person's own decision (<paramref name="Override"/>) if there is one, else the suggestion - or "full"
/// when the person switched the suggestion off.</param>
/// <param name="Override">The person's own decision for this entry (kept for good in the profile settings), or null.</param>
public sealed record ItemSuggestionDto(Guid Id, string Suggestion, string Reason, string? Effective = null, string? Override = null);

public sealed record AttachmentSuggestionDto(Guid Id, string Suggestion, string Reason);

public sealed record ChecklistItemDto(string Key, string State);

/// <summary>
/// The rules of thumb behind "what goes into this application". They are suggestions: the person decides, and nothing is left out
/// without their click. Where a rule is unsure the answer is "full" / "include" (or no opinion at all).
///
/// The yardstick is professional experience, not age (the date of birth is never read). Sources: the research notes on structure of
/// applications in Germany (sections 3 and 5) and the manual, chapters 22.4 and 22.6. All periods are advice-site rules of thumb and not
/// an official requirement, and the sources disagree in places:
/// <list type="bullet">
/// <item>The last three stations in full (Hays); older than 10 years: shortened (Hays, Karrierebibel); internships and side jobs older than 5
/// years can go (Karrierebibel). With a change of field the last five stay in full and the side jobs up to 10 years old stay too: what
/// is relevant for the new goal cannot be told without knowing the goal, so nothing is cut on a guess (own decision, the manual calls
/// it a recommendation without a source).</item>
/// <item>School reports: StepStone and Karrierebibel say only for school leavers without experience, with experience leave them out; the
/// BA names the last two school reports as usual (it speaks to pupils and career starters). Grundschule reports never (Karrierebibel).
/// Neither source gives a number of years for "without experience"; we take the steps of the guide in the app: a starter has none (0 years),
/// "some years" is 1 to 9, "long" from 10. Up to under 3 years school reports are offered only when there is nothing better (a degree or a
/// work reference).</item>
/// <item>Education below the highest degree: Karrierebibel says that after 5 to 10 years of experience only the highest degree counts, Hays
/// shortens earlier degrees next to a higher one. We take the upper end (10 years, "long"): then a school below the highest degree is
/// suggested to be left out, earlier vocational degrees are shortened.</item>
/// <item>Certificates: "continuing education of the last years" (Randstad), "old software and certificates without relation to the target
/// position can go" (Hays). Neither names a number of years and both mean relevance, which is not known here; as a rule of thumb a certificate
/// issued more than 10 years ago is suggested to be left out. Without an issue date it stays.</item>
/// <item>Skills, languages and interests carry no dates and always stay in full. The sources only speak of relevance for the target position
/// (BA, Karrierebibel: hobbies only when they fit the job, 2 to 4 of them; StepStone: leave out school-level language knowledge at A1), which
/// cannot be judged without the job.</item>
/// <item>Work references: the three newest (StepStone); Karrierebibel says one or two from age 30 or 40, three from 50. We follow the
/// three of StepStone. Degree documents: only the highest one (StepStone, Karrierebibel).</item>
/// </list>
/// </summary>
public sealed partial class ContentSuggestionRules(TimeProvider time)
{
    // ---------- thresholds (years are whole years of professional experience) ----------

    /// <summary>Below this many years (that is: none) a person is at the start of a career: nothing is shortened or hidden, school reports are offered. Same steps as the guide in the app.</summary>
    public const int EntryBelowYears = 1;

    /// <summary>From this many years on a person has a long career; earlier degrees are then shortened, schools below the highest degree left out.</summary>
    public const int LongCareerFromYears = 10;

    /// <summary>Up to here ("around two years") school reports are offered only if no degree or work reference exists.</summary>
    public const int SchoolReportsFallbackBelowYears = 3;

    public const int FullStations = 3;
    public const int FullStationsNewField = 5;

    /// <summary>A station that ended more than this many months ago is shortened.</summary>
    public const int OlderStationMonths = 120;

    /// <summary>An internship or side job that ended more than this many months ago is hidden.</summary>
    public const int MinorEngagementMonths = 60;
    public const int MinorEngagementMonthsNewField = 120;

    /// <summary>A certificate issued more than this many months ago is suggested to be left out (a rule of thumb).</summary>
    public const int OlderCertificateMonths = 120;

    public const int MaxWorkReferences = 3;
    public const int MaxSchoolReportsAtEntry = 2;

    // ---------- suggestion values ----------

    public const string Full = "full";
    public const string ShortLevel = "short";
    public const string HiddenLevel = "hidden";
    public const string Include = "include";
    public const string Omit = "omit";

    public const string StageEntry = "entry";
    public const string StageSome = "some";
    public const string StageLong = "long";

    private enum DegreeLevel { Unknown = 0, School = 1, Vocational = 2, Higher = 3, Master = 4, Doctorate = 5 }

    private enum Kind { None, SchoolReport, WorkReference, Degree, Certificate }

    private sealed record Station(ExperienceDto Item, int? Start, int? End, bool Open, bool Minor)
    {
        /// <summary>What orders stations: the end, or the start when the end is missing.</summary>
        public int? SortKey => End ?? Start;
    }

    private sealed record Classified(Attachment Attachment, Kind Kind, DegreeLevel Level, bool Grundschule, int Date);

    /// <summary>
    /// The selection that "Preview and export" of the profile applies when it is asked to: the suggestion plus the person's overrides, an
    /// override wins; with the suggestion switched off everything is in full except the overrides. Returned in the shape of
    /// <see cref="CvSelectionRules.Apply"/>, so there is one place that applies a selection.
    /// </summary>
    public CvSelectionDto EffectiveSelection(ProfileResponse profile, GuideAnswersDto? answers, CvContentSettingsDto? settings)
    {
        settings ??= CvContentSettings.Default;
        var suggestion = Suggest(profile, [], hasCoverLetter: false, answers, settings);
        Dictionary<string, string?> Taken(IEnumerable<ItemSuggestionDto> items) =>
            items.Where(i => i.Effective is CvSelectionRules.Short or CvSelectionRules.Hidden).ToDictionary(i => i.Id.ToString("D"), i => i.Effective);
        // Sections carry no date and no suggestion: only what the person switched off
        return new CvSelectionDto(Taken(suggestion.Experiences), Taken(suggestion.Educations), Taken(suggestion.Certificates), settings.Overrides.HiddenSections ?? []);
    }

    public ContentSuggestionDto Suggest(ProfileResponse profile, IReadOnlyList<Attachment> attachments, bool hasCoverLetter, GuideAnswersDto? answers = null, CvContentSettingsDto? settings = null)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var today = MonthIndex(now.Year, now.Month);

        var stations = profile.Experiences.Select(e => ToStation(e, today)).ToList();
        var years = answers?.YearsOfExperience ?? CountedMonths(stations) / 12;
        var situation = answers?.Situation;
        var plan = answers?.Plan;
        var region = answers?.Region ?? GuideAnswers.RegionDe;
        var newField = plan == GuideAnswers.PlanNewField;

        // The steps of the guide: school, training or studies, a first job, or no years at all is a start; 1 to 9 years is "some years" (also
        // when somebody who works did not say how many); from 10 it is long. The answers of the guide win over what the stations say.
        var workingWithoutYears = answers is { YearsOfExperience: null, Situation: GuideAnswers.SituationWorking or GuideAnswers.SituationReturning };
        var stage = situation is GuideAnswers.SituationSchool or GuideAnswers.SituationTraining || plan == GuideAnswers.PlanFirstJob || (years < EntryBelowYears && !workingWithoutYears) ? StageEntry
            : years < LongCareerFromYears ? StageSome
            : StageLong;

        var returning = situation == GuideAnswers.SituationReturning;
        var experiences = SuggestStations(stations, today, stage, newField, returning);
        var reference = BreakReference(stations, today, returning);
        var skipOldDegrees = newField || situation is GuideAnswers.SituationSchool or GuideAnswers.SituationTraining;
        var educations = SuggestEducations(profile.Educations, stage, newField, skipOldDegrees, reference, today);
        var certificates = SuggestCertificates(profile.Certificates, reference, stage, newField);
        settings ??= CvContentSettings.Default;
        var classified = Classify(attachments, stations, today);
        var suggestedAttachments = SuggestAttachments(classified, stage, years);
        var checklist = BuildChecklist(profile, stations, classified, hasCoverLetter, stage, region, today);

        return new ContentSuggestionDto(years, stage, situation, plan,
            [.. profile.Experiences.Select(e => WithOverride(experiences[e.Id], settings.UseSuggestion, settings.Overrides.Experiences))],
            [.. profile.Educations.Select(e => WithOverride(educations[e.Id], settings.UseSuggestion, settings.Overrides.Educations))],
            [.. profile.Certificates.Select(c => WithOverride(certificates[c.Id], settings.UseSuggestion, settings.Overrides.Certificates))],
            suggestedAttachments,
            checklist);
    }

    /// <summary>Adds what counts: the person's own decision for this entry, else the suggestion (or "full" when the suggestion is switched off). Ids that are not in the profile are never looked at.</summary>
    private static ItemSuggestionDto WithOverride(ItemSuggestionDto item, bool useSuggestion, IReadOnlyDictionary<string, string?>? overrides)
    {
        string? own = null;
        foreach (var (key, value) in overrides ?? new Dictionary<string, string?>())
        {
            if (Guid.TryParseExact(key, "D", out var id) && id == item.Id && value is Full or ShortLevel or HiddenLevel) own = value;
        }
        return item with { Override = own, Effective = own ?? (useSuggestion ? item.Suggestion : Full) };
    }

    // ---------- stations ----------

    private Dictionary<Guid, ItemSuggestionDto> SuggestStations(List<Station> stations, int today, string stage, bool newField, bool returning)
    {
        var result = new Dictionary<Guid, ItemSuggestionDto>();
        if (stage == StageEntry)
        {
            // Internships and side jobs are what a career starter has: they stay, nothing is shortened
            foreach (var s in stations) result[s.Item.Id] = new(s.Item.Id, Full, s.Minor ? "entry" : "recent");
            return result;
        }

        var reference = BreakReference(stations, today, returning);

        var byToday = Plan(stations, today, newField);
        var byReference = reference == today ? byToday : Plan(stations, reference, newField);
        foreach (var s in stations)
        {
            var decision = byReference[s.Item.Id];
            if (reference != today && byToday[s.Item.Id].Suggestion != decision.Suggestion && decision.Suggestion == Full)
            {
                decision = decision with { Reason = "before_break" };
            }
            result[s.Item.Id] = decision;
        }
        return result;
    }

    /// <summary>
    /// The month from which ages are counted. Someone who is coming back after a break is not measured against today: stations (and
    /// certificates) before the break are judged as of the day the break began, so the pause does not push them out of sight.
    /// </summary>
    private static int BreakReference(List<Station> stations, int today, bool returning)
    {
        if (!returning || stations.Any(s => s.Open)) return today;
        var lastEnd = stations.Where(s => s.End is not null).Select(s => s.End!.Value).DefaultIfEmpty(today).Max();
        return Math.Min(lastEnd, today);
    }

    /// <summary>The decision for every station as seen from the month <paramref name="reference"/>.</summary>
    private static Dictionary<Guid, ItemSuggestionDto> Plan(List<Station> stations, int reference, bool newField)
    {
        var minorLimit = newField ? MinorEngagementMonthsNewField : MinorEngagementMonths;
        var fullCount = newField ? FullStationsNewField : FullStations;

        // Age is known only for a station that has ended (or is running); a station without an end date is never judged old
        int? Age(Station s) => s.Open ? 0 : s.End is null ? null : reference - s.End;

        var hidden = stations.Where(s => s.Minor && Age(s) > minorLimit).Select(s => s.Item.Id).ToHashSet();
        var ranked = stations
            .Where(s => !hidden.Contains(s.Item.Id) && s.SortKey is not null)
            .OrderByDescending(s => s.SortKey).ThenByDescending(s => s.Start ?? int.MinValue)
            .Select((s, index) => (s.Item.Id, index))
            .ToDictionary(x => x.Id, x => x.index);

        var result = new Dictionary<Guid, ItemSuggestionDto>();
        foreach (var s in stations)
        {
            var id = s.Item.Id;
            if (hidden.Contains(id)) { result[id] = new(id, HiddenLevel, "old_internship"); continue; }
            var older = Age(s) > OlderStationMonths;
            if (ranked.TryGetValue(id, out var rank) && rank < FullStations) result[id] = new(id, Full, "recent");
            else if (ranked.TryGetValue(id, out rank) && rank < fullCount) result[id] = new(id, Full, older ? "new_field" : "recent");
            else if (older) result[id] = new(id, ShortLevel, "older_than_10_years");
            else result[id] = new(id, Full, "recent");
        }
        return result;
    }

    private static Station ToStation(ExperienceDto e, int today)
    {
        var start = Parse(e.StartDate, endOfPeriod: false);
        int? end = null;
        var open = false;
        if (e.IsCurrent) { open = true; end = today; }
        else if (Parse(e.EndDate, endOfPeriod: true) is { } parsed)
        {
            // An end date that lies ahead is a station that is still running
            if (parsed > today) { open = true; end = today; }
            else end = parsed;
        }
        return new Station(e, start, end, open, IsMinorEngagement(e));
    }

    /// <summary>
    /// Whole months in which the person worked: internships and side jobs do not count (a student with three internships is not "three
    /// years in the job"), overlapping stations count once. A station without an end date counts for its start month only.
    /// </summary>
    private static int CountedMonths(List<Station> stations)
    {
        var spans = stations.Where(s => !s.Minor && s.Start is not null)
            .Select(s => (From: s.Start!.Value, To: Math.Max(s.Start.Value, s.End ?? s.Start.Value)))
            .OrderBy(x => x.From).ToList();
        var total = 0;
        int? from = null, to = null;
        foreach (var span in spans)
        {
            if (to is null || span.From > to + 1)
            {
                if (from is not null) total += to!.Value - from.Value + 1;
                (from, to) = (span.From, span.To);
            }
            else to = Math.Max(to.Value, span.To);
        }
        if (from is not null) total += to!.Value - from.Value + 1;
        return total;
    }

    // ---------- educations ----------

    /// <summary>
    /// The highest degree stays in full, school is shortened. A rule of thumb on top (Karrierebibel: after 5 to 10 years only the highest degree
    /// counts; Hays: earlier degrees next to a higher one can go): an education or school that is not the highest or the newest one, ended more
    /// than 10 years ago and has a newer education next to it is suggested to be left out. The app cannot judge the relevance of a degree for the
    /// job without knowing the job - that is the person's call, and the suggestion can be overridden for good. Without an end date nothing is left
    /// out. It does not apply to a change of field and to somebody still at school or in training: there the older rules stay (a school below the
    /// highest degree is left out only after a long career, earlier vocational degrees are shortened only then).
    /// </summary>
    private static Dictionary<Guid, ItemSuggestionDto> SuggestEducations(IReadOnlyList<EducationDto> educations, string stage, bool newField, bool skipOldDegrees, int reference, int today)
    {
        var levels = educations.ToDictionary(e => e.Id, EducationLevel);
        var highest = levels.Count == 0 ? DegreeLevel.Unknown : levels.Values.Max();

        // How recent an education is: its end (a running one: today), else its start - for judging "newer", never for judging "old"
        int? Recency(EducationDto e) => e.IsCurrent ? today : Parse(e.EndDate, endOfPeriod: true) ?? Parse(e.StartDate, endOfPeriod: false);
        int? KnownEnd(EducationDto e) => e.IsCurrent ? null : Parse(e.EndDate, endOfPeriod: true);

        var result = new Dictionary<Guid, ItemSuggestionDto>();
        foreach (var e in educations)
        {
            var level = levels[e.Id];
            var recency = Recency(e);
            // The newest of the highest level is "the" highest degree; an equally high one that is older is not (when unsure, no date: it counts as one too)
            var isTop = level == highest && !educations.Any(o => o.Id != e.Id && levels[o.Id] == highest && Recency(o) > recency && recency is not null);
            var end = KnownEnd(e);
            var olderThanTen = end is not null && reference - end > OlderStationMonths;
            var newerExists = end is not null && educations.Any(o => o.Id != e.Id && Recency(o) > end);

            if (!isTop && !skipOldDegrees && olderThanTen && newerExists)
            {
                result[e.Id] = level == DegreeLevel.School
                    ? new(e.Id, HiddenLevel, "below_highest_degree")
                    : new(e.Id, HiddenLevel, "older_earlier_degree");
            }
            else if (isTop) result[e.Id] = new(e.Id, Full, "highest");
            else if (level == highest) result[e.Id] = new(e.Id, Full, "other");
            else if (level == DegreeLevel.School)
            {
                // After a long career a school below the highest degree is suggested to be left out. Without any usable date the entry stays (short).
                var dated = Parse(e.StartDate, endOfPeriod: false) is not null || Parse(e.EndDate, endOfPeriod: true) is not null;
                result[e.Id] = stage == StageLong && dated ? new(e.Id, HiddenLevel, "below_highest_degree") : new(e.Id, ShortLevel, "school");
            }
            else if (stage == StageLong && !newField) result[e.Id] = new(e.Id, ShortLevel, "earlier_degree");
            else result[e.Id] = new(e.Id, Full, "other");
        }
        return result;
    }

    // ---------- certificates ----------

    /// <summary>
    /// Old certificates go after a career has begun: the age is counted from the issue date (a bare year counts as its last month, so the
    /// certificate looks as recent as it can). A starter keeps everything, and so does a change of field (what is relevant for the new goal
    /// cannot be told without the goal); the reason still names the age, so the person sees why it is old. No usable date: it stays.
    /// </summary>
    private static Dictionary<Guid, ItemSuggestionDto> SuggestCertificates(IReadOnlyList<CertificateDto> certificates, int reference, string stage, bool newField)
    {
        var result = new Dictionary<Guid, ItemSuggestionDto>();
        foreach (var c in certificates)
        {
            if (Parse(c.IssueDate, endOfPeriod: true) is not { } issued) { result[c.Id] = new(c.Id, Full, "no_date"); continue; }
            var older = reference - issued > OlderCertificateMonths;
            result[c.Id] = older && stage != StageEntry && !newField
                ? new(c.Id, HiddenLevel, "older_than_10_years")
                : new(c.Id, Full, older ? "older_than_10_years" : "recent");
        }
        return result;
    }

    private static DegreeLevel EducationLevel(EducationDto e)
    {
        // The institution is only a fallback: "Ausbildung ... Universitätsklinikum" is no university degree
        var level = LevelOf($"{e.Degree} {e.FieldOfStudy}");
        if (level == DegreeLevel.Unknown)
        {
            if (SchoolRegex().IsMatch(e.Institution) && !NotSchoolRegex().IsMatch(e.Institution)) level = DegreeLevel.School;
            else if (UniversityRegex().IsMatch(e.Institution)) level = DegreeLevel.Higher;
        }
        // Nothing recognisable: an education that is not a school is taken as a vocational one
        return level == DegreeLevel.Unknown ? DegreeLevel.Vocational : level;
    }

    // ---------- attachments ----------

    private static List<Classified> Classify(IReadOnlyList<Attachment> attachments, List<Station> stations, int today)
    {
        return [.. attachments.Select(a =>
        {
            var kind = KindOf(a, out var level);
            return new Classified(a, kind, level, kind == Kind.SchoolReport && GrundschuleRegex().IsMatch(a.Title), DateOf(a, stations, today));
        })];
    }

    private static Kind KindOf(Attachment a, out DegreeLevel level)
    {
        var category = a.Category?.Trim();
        var title = a.Title;
        level = DegreeLevel.Unknown;
        if (Is(category, "Referenz")) return Kind.WorkReference;
        if (Is(category, "Arbeitsprobe")) return Kind.None;

        // There is no category for school reports: they are found by their title (a heuristic, German and English). A title that names a
        // work reference ("Arbeitszeugnis Gymnasium Musterstadt" is a teacher's) is never taken for a school report.
        var workReference = WorkReferenceRegex().IsMatch(title);
        if (!workReference && !Is(category, "Zertifikat") && IsSchoolText(title)) return Kind.SchoolReport;

        if (Is(category, "Abschluss")) { level = LevelOf(title); return Kind.Degree; }
        if (Is(category, "Zertifikat")) return Kind.Certificate;
        if (Is(category, "Zeugnis"))
        {
            // A degree certificate that was filed as "Zeugnis" is recognised by its title; everything else in this category is a work reference
            level = LevelOf(title);
            return !workReference && level >= DegreeLevel.Vocational ? Kind.Degree : Kind.WorkReference;
        }
        return Kind.None;
    }

    private static bool Is(string? category, string name) => string.Equals(category, name, StringComparison.OrdinalIgnoreCase);

    private static List<AttachmentSuggestionDto> SuggestAttachments(List<Classified> items, string stage, int years)
    {
        var result = new List<(int Group, bool Included, AttachmentSuggestionDto Dto, int Level, int Date)>();

        // Degrees: only the highest. A degree whose level cannot be read from the title is never dropped.
        var degrees = items.Where(i => i.Kind == Kind.Degree).ToList();
        var known = degrees.Where(d => d.Level != DegreeLevel.Unknown).Select(d => d.Level).DefaultIfEmpty(DegreeLevel.Unknown).Max();
        foreach (var d in degrees)
        {
            var id = d.Attachment.Id;
            if (d.Level == DegreeLevel.Unknown) result.Add((0, true, new AttachmentSuggestionDto(id, Include, degrees.Count == 1 ? "highest_degree" : "degree"), 0, d.Date));
            else if (d.Level == known) result.Add((0, true, new AttachmentSuggestionDto(id, Include, "highest_degree"), (int)d.Level, d.Date));
            else result.Add((0, false, new AttachmentSuggestionDto(id, Omit, "lower_degree"), (int)d.Level, d.Date));
        }

        // Work references: the three newest
        var references = items.Where(i => i.Kind == Kind.WorkReference).OrderByDescending(i => i.Date).ThenByDescending(i => i.Attachment.CreatedAt).ThenBy(i => i.Attachment.Id).ToList();
        for (var n = 0; n < references.Count; n++)
        {
            var r = references[n];
            result.Add(n < MaxWorkReferences
                ? (1, true, new AttachmentSuggestionDto(r.Attachment.Id, Include, "recent_reference"), 0, r.Date)
                : (1, false, new AttachmentSuggestionDto(r.Attachment.Id, Omit, "older_reference"), 0, r.Date));
        }

        foreach (var c in items.Where(i => i.Kind == Kind.Certificate))
        {
            result.Add((2, true, new AttachmentSuggestionDto(c.Attachment.Id, Include, "certificate"), 0, c.Date));
        }

        // School reports: for a career starter the last two; around two years of experience only if nothing better exists; later none
        var reports = items.Where(i => i.Kind == Kind.SchoolReport).OrderByDescending(i => i.Date).ThenByDescending(i => i.Attachment.CreatedAt).ThenBy(i => i.Attachment.Id).ToList();
        var nothingBetter = !items.Any(i => i.Kind is Kind.Degree or Kind.WorkReference);
        var offered = 0;
        foreach (var r in reports)
        {
            var include = !r.Grundschule && (stage == StageEntry
                ? offered < MaxSchoolReportsAtEntry
                : years < SchoolReportsFallbackBelowYears && nothingBetter && offered < MaxSchoolReportsAtEntry);
            if (include) offered++;
            result.Add(include
                ? (3, true, new AttachmentSuggestionDto(r.Attachment.Id, Include, "school_report"), 0, r.Date)
                : (3, false, new AttachmentSuggestionDto(r.Attachment.Id, Omit, r.Grundschule || stage != StageEntry && !(years < SchoolReportsFallbackBelowYears && nothingBetter) ? "school_report" : "older_school_report"), 0, r.Date));
        }

        // The order is the suggested order in the dossier: degree, work references (newest first), certificates, school reports.
        // What is left out comes after what is offered within its group.
        return [.. result.OrderBy(x => x.Group).ThenByDescending(x => x.Included).ThenByDescending(x => x.Level).ThenByDescending(x => x.Date).Select(x => x.Dto)];
    }

    /// <summary>
    /// The month a document belongs to, for putting the newest first. Documents are usually uploaded in one go, so the upload date alone
    /// says little: first the end of the station whose employer the title names, then a year in the title, last the upload date.
    /// </summary>
    private static int DateOf(Attachment a, List<Station> stations, int today)
    {
        var fromEmployer = stations
            .Where(s => s.Item.Employer.Trim().Length >= 3 && a.Title.Contains(s.Item.Employer.Trim(), StringComparison.OrdinalIgnoreCase))
            .Select(s => s.SortKey).Where(k => k is not null).Select(k => k!.Value).DefaultIfEmpty(int.MinValue).Max();
        if (fromEmployer != int.MinValue) return fromEmployer;

        var years = YearRegex().Matches(a.Title).Select(m => int.Parse(m.Value)).Where(y => y <= today / 12 + 1).ToList();
        if (years.Count > 0) return MonthIndex(years.Max(), 12);

        return MonthIndex(a.CreatedAt.Year, a.CreatedAt.Month);
    }

    // ---------- checklist ----------

    private static List<ChecklistItemDto> BuildChecklist(ProfileResponse profile, List<Station> stations, List<Classified> items,
        bool hasCoverLetter, string stage, string region, int today)
    {
        var abroad = region is GuideAnswers.RegionUk or GuideAnswers.RegionUs;
        var references = items.Count(i => i.Kind == Kind.WorkReference);
        var degreeDocs = items.Count(i => i.Kind == Kind.Degree);
        var schoolDocs = items.Count(i => i.Kind == Kind.SchoolReport);

        // In the UK and the USA documents are not enclosed, references are given on request: a lack there is nothing to warn about
        string Needed(bool present) => present ? "ok" : abroad ? "optional" : "missing";

        var anyContent = profile.Experiences.Count + profile.Educations.Count + profile.Skills.Count + profile.Languages.Count
            + profile.Certificates.Count + profile.Interests.Count + profile.CustomSections.Count > 0 || !string.IsNullOrWhiteSpace(profile.Bio);

        var nonMinor = stations.Where(s => !s.Minor).ToList();
        string workReferences;
        if (stations.Count == 0) workReferences = "not_needed";
        else if (nonMinor.Count == 0) workReferences = references > 0 ? "ok" : "optional";
        else if (references > 0) workReferences = "ok";
        // Only the current job: a reference can be asked for from the employer, but it cannot be missing yet
        else if (nonMinor.All(s => s.Open)) workReferences = "optional";
        else workReferences = Needed(false);

        // What counts is the highest education that is finished; the document of one that is still running does not exist yet
        var finished = profile.Educations.Where(e => !IsOngoing(e, today)).Select(EducationLevel).ToList();
        string highestDegree;
        if (profile.Educations.Count == 0) highestDegree = degreeDocs > 0 ? "ok" : "optional";
        else if (finished.Count == 0) highestDegree = "optional";
        else if (finished.Max() == DegreeLevel.School) highestDegree = stage == StageEntry ? Needed(schoolDocs > 0) : "not_needed";
        else highestDegree = Needed(degreeDocs > 0);

        return
        [
            new("cover_letter", hasCoverLetter ? "ok" : "missing"),
            new("cv", anyContent ? "ok" : "missing"),
            new("work_references", workReferences),
            new("highest_degree", highestDegree),
            new("certificates", items.Any(i => i.Kind == Kind.Certificate) ? "ok" : "optional"),
            new("photo", abroad ? "not_needed" : profile.HasPhoto ? "ok" : "optional"),
        ];
    }

    private static bool IsOngoing(EducationDto e, int today)
    {
        if (e.IsCurrent) return true;
        return Parse(e.EndDate, endOfPeriod: true) is { } end && end > today;
    }

    // ---------- text and date helpers ----------

    private static int MonthIndex(int year, int month) => year * 12 + month - 1;

    /// <summary>Month index of "2018", "2018-03" or "2018-03-15"; a year alone is its first month for a start and its last month for an end (when unsure, the person looks more recent). Null when unreadable.</summary>
    private static int? Parse(string? value, bool endOfPeriod)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var m = DatePrefixRegex().Match(value);
        if (!m.Success) return null;
        var year = int.Parse(m.Groups[1].Value);
        if (year is < 1900 or > 2200) return null;
        var month = m.Groups[2].Success && int.Parse(m.Groups[2].Value) is >= 1 and <= 12 ? int.Parse(m.Groups[2].Value) : endOfPeriod ? 12 : 1;
        return MonthIndex(year, month);
    }

    private static DegreeLevel LevelOf(string text)
    {
        if (DoctorateRegex().IsMatch(text)) return DegreeLevel.Doctorate;
        if (MasterRegex().IsMatch(text)) return DegreeLevel.Master;
        if (HigherRegex().IsMatch(text)) return DegreeLevel.Higher;
        if (VocationalRegex().IsMatch(text)) return DegreeLevel.Vocational;
        if (IsSchoolText(text)) return DegreeLevel.School;
        return DegreeLevel.Unknown;
    }

    private static bool IsSchoolText(string text) => SchoolRegex().IsMatch(text) && !NotSchoolRegex().IsMatch(text);

    /// <summary>Internship, side job and the like. Free text in two fields; werkstudent, Minijob and Aushilfe are left out on purpose because they can be a real job.</summary>
    private static bool IsMinorEngagement(ExperienceDto e) =>
        MinorRegex().IsMatch(e.EmploymentType ?? "") || MinorRegex().IsMatch(e.JobTitle);

    [GeneratedRegex(@"^\s*(\d{4})(?:-(\d{1,2}))?", RegexOptions.CultureInvariant)]
    private static partial Regex DatePrefixRegex();

    [GeneratedRegex(@"(?<!\d)(?:19|20)\d{2}(?!\d)", RegexOptions.CultureInvariant)]
    private static partial Regex YearRegex();

    [GeneratedRegex(@"praktik(um|a|ant)|(?<!\p{L})(internships?|intern|nebenjobs?|ferienjobs?|ferienarbeit|sch[üu]lerjobs?|studentenjobs?|side job|summer job|holiday job)(?!\p{L})",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MinorRegex();

    [GeneratedRegex(@"promotion|doktor|doctorate|ph\.?\s?d(?!\p{L})|habilitation", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex DoctorateRegex();

    [GeneratedRegex(@"(?<!\p{L})master(?!\p{L})|(?<!\p{L})master(urkunde|zeugnis|abschluss|studium|arbeit)|(?<!\p{L})m\.\s?(sc|a|eng|ed)\.?(?!\p{L})|(?<!\p{L})msc(?!\p{L})|(?<!\p{L})mba(?!\p{L})|diplom(?!a)|magister|staatsexamen|state exam",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex MasterRegex();

    // Meister, Techniker, Fachwirt and Betriebswirt are on the level of a bachelor in the German qualification framework
    [GeneratedRegex(@"bachelor|(?<!\p{L})b\.\s?(sc|a|eng|ed)\.?(?!\p{L})|(?<!\p{L})bsc(?!\p{L})|studium|universit|hochschul(?!reife)|fachhochschul(?!reife)|(?<!\p{L})fh(?!\p{L})|university|meister|techniker|fachwirt|betriebswirt",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex HigherRegex();

    [GeneratedRegex(@"universit|hochschul(?!reife)|fachhochschul(?!reife)|university|(?<!\p{L})fh(?!\p{L})", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex UniversityRegex();

    [GeneratedRegex(@"ausbildung|(?<!\p{L})lehre(?!\p{L})|geselle|gesellen|facharbeiter|apprentice|vocational|berufsschul|berufskolleg|umschulung|(?<!\p{L})(ihk|hwk)(?!\p{L})",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex VocationalRegex();

    // Heuristic: there is no category "school report", so school is recognised by words in the title. German and English.
    [GeneratedRegex(@"(grund|haupt|real|gesamt|ober|mittel|sekundar|gemeinschafts|regel|f[öo]rder|fachober)schul|gymnasi|abitur|mittlere reife|hochschulreife|schulzeugnis|schulabschluss|schulabgang|abgangszeugnis|halbjahreszeugnis|jahreszeugnis|(?<!\p{L})schule(?!\p{L})|school report|high school|primary school|elementary school|secondary school|middle school|grammar school|(?<!\p{L})gcses?(?!\p{L})|a-levels?|school leaving|school certificate|(?<!\p{L})school(?!\p{L})",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SchoolRegex();

    // "School" in these is a college or a course, not a school report. Vocational schools are no general school either.
    [GeneratedRegex(@"(business|law|graduate|medical|summer|winter|driving|language|dental|film|art|management|culinary|flight|night)\s+school|school\s+of\b|berufsschul|berufskolleg|berufsfachschul|vocational",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex NotSchoolRegex();

    [GeneratedRegex(@"grundschul|primary school|elementary school", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex GrundschuleRegex();

    [GeneratedRegex(@"arbeitszeugnis|zwischenzeugnis|dienstzeugnis|arbeitsbescheinigung|praktikumszeugnis|work reference|employment reference|reference letter|letter of reference",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex WorkReferenceRegex();
}
