// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Applications;
using Cv.Server.Controllers;
using Cv.Server.Data;
using Cv.Server.Tests.Support;

namespace Cv.Server.Tests;

/// <summary>
/// The rules of thumb behind "what goes into this application", with a fixed clock (9 November 2026) and invented people. The yardstick is
/// professional experience, never age; everything here is a suggestion, so doubtful cases must come out as "full" / "include".
/// </summary>
public sealed class ContentSuggestionRulesTests
{
    private static readonly TestDoubles.FixedTime Clock = new(new DateTimeOffset(2026, 11, 9, 12, 0, 0, TimeSpan.Zero));

    private static ContentSuggestionDto Suggest(ProfileResponse profile, IReadOnlyList<Attachment>? attachments = null, bool letter = true, GuideAnswersDto? answers = null) =>
        new ContentSuggestionRules(Clock).Suggest(profile, attachments ?? [], letter, answers);

    private static Attachment Doc(string title, string? category, DateTime? uploaded = null) => new()
    {
        Id = Guid.NewGuid(),
        UserId = Guid.NewGuid(),
        Title = title,
        Category = category,
        CreatedAt = uploaded ?? new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc),
    };

    private static ProfileResponse With(IEnumerable<ExperienceDto>? experiences = null, IEnumerable<EducationDto>? educations = null, bool photo = false) =>
        DocumentSamples.Empty() with
        {
            Experiences = [.. experiences ?? []],
            Educations = [.. educations ?? []],
            HasPhoto = photo,
        };

    private static GuideAnswersDto Answers(string? situation = null, int? years = null, string? plan = null, string? region = null) =>
        new(situation, years, plan, [], region);

    private static (string Suggestion, string Reason) Of(IEnumerable<ItemSuggestionDto> list, Guid id) =>
        list.Where(x => x.Id == id).Select(x => (x.Suggestion, x.Reason)).Single();

    private static (string Suggestion, string Reason) Of(ContentSuggestionDto result, Attachment attachment) =>
        result.Attachments.Where(x => x.Id == attachment.Id).Select(x => (x.Suggestion, x.Reason)).Single();

    private static string State(ContentSuggestionDto result, string key) => result.Checklist.Single(c => c.Key == key).State;

    /// <summary>A 40-year-old with 14 years in the job: four stations, an old internship, school, an apprenticeship and a degree.</summary>
    private sealed record LongCareer(
        ProfileResponse Profile, ExperienceDto Current, ExperienceDto Second, ExperienceDto Third, ExperienceDto Oldest, ExperienceDto Internship,
        EducationDto School, EducationDto Apprenticeship, EducationDto Degree);

    private static LongCareer Career()
    {
        var current = DocumentSamples.Experience("Teamleiterin", "Nordwind AG", start: "2023-01", current: true);
        var second = DocumentSamples.Experience("Entwicklerin", "Brückner GmbH", start: "2019-01", end: "2022-12");
        var third = DocumentSamples.Experience("Entwicklerin", "Kranich Software", start: "2015-01", end: "2018-12");
        var oldest = DocumentSamples.Experience("Junior Entwicklerin", "Datenwerk", start: "2012-09", end: "2014-12");
        var internship = DocumentSamples.Experience("Praktikantin", "Fabrik 7", type: "Praktikum", start: "2012-01", end: "2012-06");
        var school = DocumentSamples.Education("Abitur", institution: "Gymnasium am Park", start: "2000-08", end: "2009-06");
        var apprenticeship = DocumentSamples.Education("Fachinformatikerin", institution: "IHK Köln", start: "2009-09", end: "2011-06");
        var degree = DocumentSamples.Education("Bachelor of Science", field: "Informatik", institution: "Universität Köln", start: "2009-10", end: "2012-08");
        return new(With([current, second, third, oldest, internship], [school, apprenticeship, degree]), current, second, third, oldest, internship, school, apprenticeship, degree);
    }

    // ---------- a long career ----------

    [Fact]
    public void A_long_career_keeps_the_three_newest_stations_and_shortens_the_old_one_and_hides_the_old_internship()
    {
        var c = Career();

        var result = Suggest(c.Profile);

        Assert.Equal(14, result.YearsOfExperience);
        Assert.Equal("long", result.Stage);
        Assert.Equal(("full", "recent"), Of(result.Experiences, c.Current.Id));
        Assert.Equal(("full", "recent"), Of(result.Experiences, c.Second.Id));
        Assert.Equal(("full", "recent"), Of(result.Experiences, c.Third.Id));
        Assert.Equal(("short", "older_than_10_years"), Of(result.Experiences, c.Oldest.Id));
        Assert.Equal(("hidden", "old_internship"), Of(result.Experiences, c.Internship.Id));
        Assert.Null(result.Situation);
        Assert.Null(result.Plan);
    }

    [Fact]
    public void A_long_career_shows_the_highest_degree_in_full_leaves_out_the_school_and_shortens_earlier_degrees()
    {
        var c = Career();

        var result = Suggest(c.Profile);

        Assert.Equal(("full", "highest"), Of(result.Educations, c.Degree.Id));
        Assert.Equal(("hidden", "below_highest_degree"), Of(result.Educations, c.School.Id));
        Assert.Equal(("hidden", "older_earlier_degree"), Of(result.Educations, c.Apprenticeship.Id));
    }

    [Fact]
    public void A_long_career_offers_three_references_and_the_highest_degree_but_no_school_report()
    {
        var c = Career();
        var references = new[]
        {
            Doc("Arbeitszeugnis Nordwind AG", "Zeugnis"),
            Doc("Arbeitszeugnis Brückner GmbH", "Zeugnis"),
            Doc("Arbeitszeugnis Kranich Software", "Zeugnis"),
            Doc("Arbeitszeugnis Datenwerk", "Zeugnis"),
        };
        var master = Doc("Masterurkunde Informatik", "Abschluss");
        var bachelor = Doc("Bachelorurkunde Informatik", "Abschluss");
        var certificate = Doc("Scrum Master Zertifikat", "Zertifikat");
        var schoolReport = Doc("Abiturzeugnis", "Zeugnis");
        var primary = Doc("Grundschulzeugnis 1994", "Sonstiges");
        var sample = Doc("Portfolio", "Arbeitsprobe");

        var result = Suggest(c.Profile, [.. references, master, bachelor, certificate, schoolReport, primary, sample]);

        Assert.Equal(("include", "recent_reference"), Of(result, references[0]));
        Assert.Equal(("include", "recent_reference"), Of(result, references[1]));
        Assert.Equal(("include", "recent_reference"), Of(result, references[2]));
        // The oldest reference is recognised by the employer named in its title, although all were uploaded on the same day
        Assert.Equal(("omit", "older_reference"), Of(result, references[3]));
        Assert.Equal(("include", "highest_degree"), Of(result, master));
        Assert.Equal(("omit", "lower_degree"), Of(result, bachelor));
        Assert.Equal(("include", "certificate"), Of(result, certificate));
        Assert.Equal(("omit", "school_report"), Of(result, schoolReport));
        Assert.Equal(("omit", "school_report"), Of(result, primary));
        // No rule for a work sample: no opinion
        Assert.DoesNotContain(result.Attachments, a => a.Id == sample.Id);
        // Suggested order: degree, references newest first, certificates, school reports
        Assert.Equal([master.Id, bachelor.Id, references[0].Id, references[1].Id, references[2].Id, references[3].Id, certificate.Id], result.Attachments.Take(7).Select(a => a.Id));
    }

    [Fact]
    public void A_long_career_needs_no_school_report_in_the_checklist()
    {
        var onlySchool = With([DocumentSamples.Experience(start: "2010-01", current: true)], [DocumentSamples.Education("Realschulabschluss", institution: "Realschule Nord", start: "1996-08", end: "2002-06")]);

        var result = Suggest(onlySchool, [Doc("Arbeitszeugnis Beispiel GmbH", "Zeugnis")]);

        Assert.Equal("long", result.Stage);
        Assert.Equal("not_needed", State(result, "highest_degree"));
        Assert.Equal("ok", State(result, "work_references"));
        // The only education is the school: it is the highest one and stays in full
        Assert.Equal(("full", "highest"), Of(result.Educations, onlySchool.Educations[0].Id));
    }

    [Fact]
    public void The_date_of_birth_has_no_influence()
    {
        var c = Career();
        var young = c.Profile with { DateOfBirth = "2005-01-01" };
        var old = c.Profile with { DateOfBirth = "1950-01-01" };

        Assert.Equivalent(Suggest(young), Suggest(old), strict: true);
    }

    // ---------- the start of a career ----------

    [Fact]
    public void A_career_starter_gets_the_last_two_school_reports_suggested_and_keeps_internships()
    {
        var internship = DocumentSamples.Experience("Praktikantin", "Fabrik 7", type: "Praktikum", start: "2019-01", end: "2019-02");
        var sideJob = DocumentSamples.Experience("Kellnerin", "Café Sonne", type: "Nebenjob", start: "2018-01", end: "2019-12");
        var profile = With([internship, sideJob], [DocumentSamples.Education("Abitur", institution: "Gymnasium am Park", start: "2012-08", end: "2020-06")]);
        var abitur = Doc("Abiturzeugnis 2020", "Zeugnis");
        var half = Doc("Halbjahreszeugnis Gymnasium 2019", "Sonstiges");
        var real = Doc("Zeugnis Realschule 2016", "Zeugnis");
        var primary = Doc("Grundschulzeugnis", "Sonstiges");

        var result = Suggest(profile, [real, primary, half, abitur]);

        Assert.Equal(0, result.YearsOfExperience);
        Assert.Equal("entry", result.Stage);
        Assert.Equal(("full", "entry"), Of(result.Experiences, internship.Id));
        Assert.Equal(("full", "entry"), Of(result.Experiences, sideJob.Id));
        Assert.Equal(("include", "school_report"), Of(result, abitur));
        Assert.Equal(("include", "school_report"), Of(result, half));
        Assert.Equal(("omit", "older_school_report"), Of(result, real));
        Assert.Equal(("omit", "school_report"), Of(result, primary));
        // Only internships: a reference would be nice but is not asked for
        Assert.Equal("optional", State(result, "work_references"));
        Assert.Equal("missing", State(Suggest(profile), "highest_degree"));
        Assert.Equal("ok", State(result, "highest_degree"));
    }

    [Fact]
    public void Without_any_station_the_person_is_a_starter_and_needs_no_work_reference()
    {
        var result = Suggest(DocumentSamples.Empty(), letter: false);

        Assert.Equal(0, result.YearsOfExperience);
        Assert.Equal("entry", result.Stage);
        Assert.Empty(result.Experiences);
        Assert.Empty(result.Educations);
        Assert.Empty(result.Attachments);
        Assert.Equal("missing", State(result, "cover_letter"));
        Assert.Equal("missing", State(result, "cv"));
        Assert.Equal("not_needed", State(result, "work_references"));
        Assert.Equal("optional", State(result, "highest_degree"));
        Assert.Equal("optional", State(result, "certificates"));
        Assert.Equal("optional", State(result, "photo"));
    }

    // ---------- counting the years ----------

    [Fact]
    public void An_open_current_station_counts_up_to_the_clock()
    {
        var result = Suggest(With([DocumentSamples.Experience(start: "2020-11", current: true)]));

        // November 2020 to November 2026 including both months: 73 months
        Assert.Equal(6, result.YearsOfExperience);
        Assert.Equal("some", result.Stage);
    }

    [Fact]
    public void Overlapping_stations_are_counted_once_and_a_gap_is_not_counted()
    {
        var overlap = With([
            DocumentSamples.Experience("A", "Eins", start: "2010-01", end: "2014-12"),
            DocumentSamples.Experience("B", "Zwei", start: "2013-01", end: "2015-12"),
            DocumentSamples.Experience("C", "Drei", start: "2018-01", end: "2018-12"),
        ]);

        // 2010-01 to 2015-12 is 72 months, plus 12 months in 2018
        Assert.Equal(7, Suggest(overlap).YearsOfExperience);
    }

    [Fact]
    public void A_station_inside_another_one_adds_nothing()
    {
        var nested = With([
            DocumentSamples.Experience("A", "Eins", start: "2010-01", end: "2019-12"),
            DocumentSamples.Experience("B", "Zwei", start: "2012-01", end: "2013-12"),
        ]);

        Assert.Equal(10, Suggest(nested).YearsOfExperience);
        Assert.Equal("long", Suggest(nested).Stage);
    }

    [Fact]
    public void An_internship_does_not_count_as_professional_experience()
    {
        var result = Suggest(With([DocumentSamples.Experience("Praktikant", "Firma", type: "Praktikum", start: "2020-01", end: "2022-12")]));

        Assert.Equal(0, result.YearsOfExperience);
        Assert.Equal("entry", result.Stage);
    }

    [Fact]
    public void A_station_without_dates_is_never_shortened_or_hidden()
    {
        var undated = DocumentSamples.Experience("Alt", "Firma", start: "", end: null);
        var noEnd = DocumentSamples.Experience("Ohne Ende", "Firma", start: "1999-01", end: null);
        var profile = With([
            DocumentSamples.Experience("A", "Eins", start: "2024-01", current: true),
            DocumentSamples.Experience("B", "Zwei", start: "2020-01", end: "2023-12"),
            DocumentSamples.Experience("C", "Drei", start: "2016-01", end: "2019-12"),
            DocumentSamples.Experience("D", "Vier", start: "2005-01", end: "2007-12"),
            undated, noEnd,
        ]);

        var result = Suggest(profile);

        Assert.Equal(("full", "recent"), Of(result.Experiences, undated.Id));
        Assert.Equal(("full", "recent"), Of(result.Experiences, noEnd.Id));
        Assert.Equal(("short", "older_than_10_years"), Of(result.Experiences, profile.Experiences[3].Id));
    }

    [Fact]
    public void An_end_date_in_the_future_is_a_running_station()
    {
        var future = DocumentSamples.Experience("A", "Eins", start: "2025-01", end: "2027-06");
        var result = Suggest(With([future]));

        Assert.Equal(("full", "recent"), Of(result.Experiences, future.Id));
        Assert.Equal(1, result.YearsOfExperience);
    }

    // ---------- the answers of the guide ----------

    [Fact]
    public void The_number_from_the_guide_replaces_the_calculated_years()
    {
        var profile = With([DocumentSamples.Experience(start: "2025-01", current: true)]);

        Assert.Equal(1, Suggest(profile).YearsOfExperience);
        var told = Suggest(profile, answers: Answers("working", years: 20));
        Assert.Equal(20, told.YearsOfExperience);
        Assert.Equal("long", told.Stage);
        Assert.Equal("working", told.Situation);
        // 0 is an answer too
        Assert.Equal("entry", Suggest(Career().Profile, answers: Answers("training_or_studies", years: 0)).Stage);
    }

    [Fact]
    public void A_school_leaver_is_a_starter_whatever_the_stations_say()
    {
        var profile = With([DocumentSamples.Experience(start: "2015-01", current: true)]);
        var report = Doc("Schulzeugnis Klasse 10", "Zeugnis");

        var result = Suggest(profile, [report], answers: Answers("school"));

        Assert.Equal("entry", result.Stage);
        Assert.Equal(("include", "school_report"), Of(result, report));
    }

    [Fact]
    public void Looking_for_a_first_job_is_the_start_of_a_career()
    {
        var result = Suggest(Career().Profile, answers: Answers("working", years: 8, plan: "first_job"));

        Assert.Equal("entry", result.Stage);
        Assert.Equal("first_job", result.Plan);
        Assert.All(result.Experiences, e => Assert.Equal("full", e.Suggestion));
    }

    [Fact]
    public void A_person_in_training_is_a_starter_and_the_unfinished_education_asks_for_no_document()
    {
        var ongoing = DocumentSamples.Education("Bachelor of Science", field: "Informatik", institution: "Universität Köln", start: "2024-10", current: true);
        var school = DocumentSamples.Education("Abitur", institution: "Gymnasium am Park", start: "2016-08", end: "2024-06");
        var profile = With(educations: [ongoing, school]);

        var withoutDocs = Suggest(profile, answers: Answers("training_or_studies", years: 0));
        var withReport = Suggest(profile, [Doc("Abiturzeugnis", "Zeugnis")], answers: Answers("training_or_studies", years: 0));

        Assert.Equal("entry", withoutDocs.Stage);
        Assert.Equal(("full", "highest"), Of(withoutDocs.Educations, ongoing.Id));
        Assert.Equal(("short", "school"), Of(withoutDocs.Educations, school.Id));
        // What exists is the school report: it is what the starter needs, so it is missing until it is there
        Assert.Equal("missing", State(withoutDocs, "highest_degree"));
        Assert.Equal("ok", State(withReport, "highest_degree"));
    }

    [Fact]
    public void A_person_whose_only_education_is_still_running_is_asked_for_no_degree()
    {
        var profile = With(educations: [DocumentSamples.Education("Bachelor of Science", institution: "Universität Köln", start: "2024-10", current: true)]);

        Assert.Equal("optional", State(Suggest(profile), "highest_degree"));
    }

    [Fact]
    public void Around_two_years_the_degree_and_the_reference_come_first_and_a_school_report_only_if_nothing_else_exists()
    {
        var profile = With(
            [DocumentSamples.Experience("Fachinformatikerin", "Nordwind AG", start: "2024-09", current: true)],
            [DocumentSamples.Education("Fachinformatikerin", institution: "IHK Köln", start: "2021-08", end: "2024-06")]);
        var degree = Doc("Abschlusszeugnis Ausbildung Fachinformatikerin", "Abschluss");
        var reference = Doc("Arbeitszeugnis Nordwind AG", "Zeugnis");
        var school = Doc("Abiturzeugnis", "Zeugnis");

        var both = Suggest(profile, [school, reference, degree]);
        var onlySchool = Suggest(profile, [school]);
        var withDegree = Suggest(profile, [school, degree]);

        Assert.Equal(2, both.YearsOfExperience);
        Assert.Equal("some", both.Stage);
        Assert.Equal(("omit", "school_report"), Of(both, school));
        Assert.Equal([degree.Id, reference.Id, school.Id], both.Attachments.Select(a => a.Id));
        Assert.Equal(("include", "school_report"), Of(onlySchool, school));
        Assert.Equal(("omit", "school_report"), Of(withDegree, school));
    }

    [Fact]
    public void From_three_years_on_a_school_report_is_never_suggested()
    {
        var profile = With([DocumentSamples.Experience(start: "2023-09", current: true)]);
        var school = Doc("Abiturzeugnis", "Zeugnis");

        var result = Suggest(profile, [school]);

        Assert.Equal(3, result.YearsOfExperience);
        Assert.Equal(("omit", "school_report"), Of(result, school));
    }

    [Fact]
    public void A_work_reference_that_mentions_a_school_is_no_school_report()
    {
        var profile = With([DocumentSamples.Experience(start: "2010-01", current: true)]);
        var teacher = Doc("Arbeitszeugnis Gymnasium Musterstadt", "Zeugnis");
        var vocational = Doc("Berufsschulzeugnis Fachinformatiker", "Abschluss");
        var business = Doc("Business School Zertifikat", "Zertifikat");

        var result = Suggest(profile, [teacher, vocational, business]);

        Assert.Equal(("include", "recent_reference"), Of(result, teacher));
        Assert.Equal(("include", "highest_degree"), Of(result, vocational));
        Assert.Equal(("include", "certificate"), Of(result, business));
    }

    [Fact]
    public void A_change_of_field_keeps_five_stations_and_the_older_side_jobs()
    {
        var stations = new[]
        {
            DocumentSamples.Experience("A", "Eins", start: "2024-01", current: true),
            DocumentSamples.Experience("B", "Zwei", start: "2020-01", end: "2023-12"),
            DocumentSamples.Experience("C", "Drei", start: "2016-01", end: "2019-12"),
            DocumentSamples.Experience("D", "Vier", start: "2008-01", end: "2010-12"),
            DocumentSamples.Experience("E", "Fünf", start: "2004-01", end: "2007-12"),
            DocumentSamples.Experience("F", "Sechs", start: "2000-01", end: "2003-12"),
            DocumentSamples.Experience("Kellner", "Café", type: "Nebenjob", start: "2018-01", end: "2018-12"),
        };
        var profile = With(stations);

        var same = Suggest(profile, answers: Answers("working", plan: "same_field"));
        var changed = Suggest(profile, answers: Answers("working", plan: "new_field"));

        Assert.Equal(("short", "older_than_10_years"), Of(same.Experiences, stations[3].Id));
        Assert.Equal(("hidden", "old_internship"), Of(same.Experiences, stations[6].Id));
        // The side job from 2018 is still within ten years and takes the fourth place, so five places carry D and the side job; E and F are
        // shortened as usual
        Assert.Equal(("full", "new_field"), Of(changed.Experiences, stations[3].Id));
        Assert.Equal(("short", "older_than_10_years"), Of(changed.Experiences, stations[4].Id));
        Assert.Equal(("short", "older_than_10_years"), Of(changed.Experiences, stations[5].Id));
        Assert.Equal(("full", "recent"), Of(changed.Experiences, stations[6].Id));
        Assert.Equal("new_field", changed.Plan);

        // Without the side job the fourth and the fifth station stay in full, the sixth is shortened
        var withoutSideJob = Suggest(With(stations.Take(6)), answers: Answers("working", plan: "new_field"));
        Assert.Equal(("full", "new_field"), Of(withoutSideJob.Experiences, stations[3].Id));
        Assert.Equal(("full", "new_field"), Of(withoutSideJob.Experiences, stations[4].Id));
        Assert.Equal(("short", "older_than_10_years"), Of(withoutSideJob.Experiences, stations[5].Id));
    }

    [Fact]
    public void A_change_of_field_keeps_the_earlier_degrees_in_full()
    {
        var c = Career();

        var same = Suggest(c.Profile, answers: Answers("working", plan: "same_field"));
        var changed = Suggest(c.Profile, answers: Answers("working", plan: "new_field"));

        Assert.Equal(("hidden", "older_earlier_degree"), Of(same.Educations, c.Apprenticeship.Id));
        Assert.Equal(("full", "other"), Of(changed.Educations, c.Apprenticeship.Id));
    }

    [Fact]
    public void Someone_coming_back_after_a_break_keeps_the_stations_before_the_break_visible()
    {
        var stations = new[]
        {
            DocumentSamples.Experience("A", "Eins", start: "2003-01", end: "2005-12"),
            DocumentSamples.Experience("B", "Zwei", start: "2000-01", end: "2002-12"),
            DocumentSamples.Experience("C", "Drei", start: "1997-01", end: "1999-12"),
            DocumentSamples.Experience("D", "Vier", start: "1993-01", end: "1996-12"),
            DocumentSamples.Experience("Ferienjob", "Laden", type: "Ferienjob", start: "1992-07", end: "1992-08"),
            DocumentSamples.Experience("Praktikum", "Büro", type: "Praktikum", start: "2003-01", end: "2003-02"),
        };
        var profile = With(stations);

        var working = Suggest(profile, answers: Answers("working", years: 12));
        var returning = Suggest(profile, answers: Answers("returning", years: 12));

        Assert.Equal(("short", "older_than_10_years"), Of(working.Experiences, stations[3].Id));
        Assert.Equal(("hidden", "old_internship"), Of(working.Experiences, stations[5].Id));
        // Seen from the day the break began (end of 2005) the oldest station is 9 years old and the internship 3
        Assert.Equal(("full", "before_break"), Of(returning.Experiences, stations[3].Id));
        Assert.Equal(("full", "before_break"), Of(returning.Experiences, stations[5].Id));
        Assert.Equal("returning", returning.Situation);
        // The Ferienjob (1992) was over 5 years before the break: hidden even so
        Assert.Equal(("hidden", "old_internship"), Of(returning.Experiences, stations[4].Id));
    }

    [Fact]
    public void Someone_who_is_working_again_is_judged_by_today()
    {
        var stations = new[]
        {
            DocumentSamples.Experience("Neu", "Heute AG", start: "2026-01", current: true),
            DocumentSamples.Experience("A", "Eins", start: "2003-01", end: "2005-12"),
            DocumentSamples.Experience("B", "Zwei", start: "2000-01", end: "2002-12"),
            DocumentSamples.Experience("C", "Drei", start: "1997-01", end: "1999-12"),
        };

        var result = Suggest(With(stations), answers: Answers("returning", years: 5));

        Assert.Equal(("short", "older_than_10_years"), Of(result.Experiences, stations[3].Id));
    }

    [Theory]
    [InlineData("uk")]
    [InlineData("us")]
    public void In_the_uk_and_the_usa_a_photo_is_not_needed_and_missing_documents_are_only_optional(string region)
    {
        var profile = With([DocumentSamples.Experience(start: "2010-01", end: "2020-12")], [DocumentSamples.Education("Bachelor of Science", institution: "Universität Köln", start: "2000-10", end: "2004-09")]);

        var abroad = Suggest(profile, answers: Answers("working", region: region));
        var germany = Suggest(profile, answers: Answers("working", region: "de"));

        Assert.Equal("not_needed", State(abroad, "photo"));
        Assert.Equal("optional", State(abroad, "work_references"));
        Assert.Equal("optional", State(abroad, "highest_degree"));
        Assert.Equal("optional", State(germany, "photo"));
        Assert.Equal("missing", State(germany, "work_references"));
        Assert.Equal("missing", State(germany, "highest_degree"));
    }

    [Fact]
    public void A_photo_in_the_profile_is_ok_in_germany()
    {
        Assert.Equal("ok", State(Suggest(With(photo: true)), "photo"));
        Assert.Equal("not_needed", State(Suggest(With(photo: true), answers: Answers(region: "uk")), "photo"));
    }

    [Fact]
    public void Only_the_current_job_makes_a_reference_optional_not_missing()
    {
        var current = With([DocumentSamples.Experience(start: "2022-01", current: true)]);
        var left = With([DocumentSamples.Experience(start: "2018-01", end: "2022-12")]);

        Assert.Equal("optional", State(Suggest(current), "work_references"));
        Assert.Equal("missing", State(Suggest(left), "work_references"));
        Assert.Equal("ok", State(Suggest(left, [Doc("Arbeitszeugnis", "Zeugnis")]), "work_references"));
    }

    [Fact]
    public void A_degree_filed_as_a_reference_category_is_recognised_by_its_title()
    {
        var profile = With([DocumentSamples.Experience(start: "2010-01", current: true)]);
        var degree = Doc("Masterzeugnis Universität Köln", "Zeugnis");
        var reference = Doc("Arbeitszeugnis Beispiel GmbH", "Zeugnis");

        var result = Suggest(profile, [degree, reference]);

        Assert.Equal(("include", "highest_degree"), Of(result, degree));
        Assert.Equal(("include", "recent_reference"), Of(result, reference));
    }

    [Fact]
    public void A_degree_whose_level_cannot_be_read_is_never_dropped()
    {
        var master = Doc("Masterurkunde", "Abschluss");
        var other = Doc("Urkunde 2019", "Abschluss");

        var result = Suggest(With(), [master, other]);

        Assert.Equal(("include", "highest_degree"), Of(result, master));
        Assert.Equal(("include", "degree"), Of(result, other));
        Assert.Equal(("include", "highest_degree"), Of(Suggest(With(), [other]), other));
    }

    [Fact]
    public void Without_a_year_or_an_employer_in_the_title_the_upload_date_orders_the_references()
    {
        var uploads = Enumerable.Range(0, 4).Select(n => Doc($"Zeugnis {n}", "Zeugnis", new DateTime(2026, 1 + n, 1, 0, 0, 0, DateTimeKind.Utc))).ToArray();

        var result = Suggest(With([DocumentSamples.Experience(start: "2010-01", end: "2020-12")]), uploads);

        Assert.Equal(("omit", "older_reference"), Of(result, uploads[0]));
        Assert.Equal(("include", "recent_reference"), Of(result, uploads[3]));
    }

    [Theory]
    [InlineData("Abiturzeugnis", true)]
    [InlineData("Zeugnis Realschule", true)]
    [InlineData("Hauptschulabschluss", true)]
    [InlineData("High School Diploma", true)]
    [InlineData("School report 2019", true)]
    [InlineData("Mittlere Reife", true)]
    [InlineData("Fachhochschulreife", true)]
    [InlineData("Arbeitszeugnis Gymnasium Nord", false)]
    [InlineData("Zeugnis Hochschule Köln Master", false)]
    [InlineData("Berufsschule Zeugnis", false)]
    [InlineData("Law School Certificate", false)]
    [InlineData("Teamleiter Seminar", false)]
    public void School_reports_are_recognised_by_words_in_the_title(string title, bool isSchoolReport)
    {
        var report = Doc(title, "Zeugnis");

        var result = Suggest(With(), [report]);

        // Entry stage without any station: a school report is included, anything else is a (work) reference or a degree and is included too,
        // so the reason tells them apart
        Assert.Equal(isSchoolReport, Of(result, report).Reason == "school_report");
    }

    // ---------- the steps of the guide ----------

    [Theory]
    [InlineData(0, "entry")]
    [InlineData(1, "some")]
    [InlineData(2, "some")]
    [InlineData(9, "some")]
    [InlineData(10, "long")]
    [InlineData(40, "long")]
    public void The_stage_follows_the_steps_of_the_guide(int years, string stage)
    {
        Assert.Equal(stage, Suggest(With(), answers: Answers("working", years: years)).Stage);
    }

    [Theory]
    [InlineData("school")]
    [InlineData("training_or_studies")]
    public void School_and_training_are_a_start_even_when_the_number_of_years_is_missing_or_high(string situation)
    {
        Assert.Equal("entry", Suggest(With(), answers: Answers(situation)).Stage);
        Assert.Equal("entry", Suggest(With(), answers: Answers(situation, years: 12)).Stage);
    }

    [Theory]
    [InlineData("working")]
    [InlineData("returning")]
    public void Somebody_who_works_without_saying_how_long_is_at_least_in_the_middle_step(string situation)
    {
        // Nothing in the stations to count: "some years" all the same, because the person said they work
        var unknown = Suggest(With(), answers: Answers(situation));
        Assert.Equal("some", unknown.Stage);
        Assert.Equal(0, unknown.YearsOfExperience);
        // With stations that add up to a long career the unknown number does not hold the stage down
        Assert.Equal("long", Suggest(Career().Profile, answers: Answers(situation)).Stage);
        // Saying 0 years is an answer
        Assert.Equal("entry", Suggest(With(), answers: Answers(situation, years: 0)).Stage);
    }

    [Fact]
    public void Without_any_answer_the_stations_decide_with_the_same_steps()
    {
        Assert.Equal("some", Suggest(With([DocumentSamples.Experience(start: "2025-05", current: true)])).Stage);
        Assert.Equal("entry", Suggest(With([DocumentSamples.Experience(start: "2026-05", current: true)])).Stage);
    }

    // ---------- certificates ----------

    private static CertificateDto Cert(string title, string? issued) => DocumentSamples.Certificate(title, issued: issued);

    private static ProfileResponse WithCertificates(IEnumerable<CertificateDto> certificates, IEnumerable<ExperienceDto>? experiences = null) =>
        With(experiences) with { Certificates = [.. certificates] };

    [Fact]
    public void A_certificate_older_than_ten_years_is_suggested_to_be_left_out_after_a_career_has_begun()
    {
        var recent = Cert("Scrum", "2024-03");
        var borderline = Cert("Cloud", "2016-12");
        var old = Cert("Delphi", "2015-12");
        var oldYear = Cert("Alt", "2010");
        var undated = Cert("Ohne Datum", null);
        var unreadable = Cert("Seltsam", "irgendwann");
        var profile = WithCertificates([recent, borderline, old, oldYear, undated, unreadable], Career().Profile.Experiences);

        var result = Suggest(profile);

        Assert.Equal(("full", "recent"), Of(result.Certificates, recent.Id));
        // November 2026: December 2016 is 119 months ago, December 2015 is 131
        Assert.Equal(("full", "recent"), Of(result.Certificates, borderline.Id));
        Assert.Equal(("hidden", "older_than_10_years"), Of(result.Certificates, old.Id));
        Assert.Equal(("hidden", "older_than_10_years"), Of(result.Certificates, oldYear.Id));
        Assert.Equal(("full", "no_date"), Of(result.Certificates, undated.Id));
        Assert.Equal(("full", "no_date"), Of(result.Certificates, unreadable.Id));
        Assert.Equal(profile.Certificates.Select(c => c.Id), result.Certificates.Select(c => c.Id));
    }

    [Fact]
    public void A_year_alone_counts_as_its_last_month_so_the_certificate_looks_as_recent_as_it_can()
    {
        // 2016 alone is December 2016: 119 months ago, still inside the ten years
        var result = Suggest(WithCertificates([Cert("Jahr", "2016")], Career().Profile.Experiences));

        Assert.Equal(("full", "recent"), (result.Certificates[0].Suggestion, result.Certificates[0].Reason));
    }

    [Fact]
    public void A_career_starter_keeps_old_certificates_and_the_reason_still_names_the_age()
    {
        var old = Cert("Alt", "2005-01");

        var result = Suggest(WithCertificates([old]), answers: Answers("training_or_studies", years: 0));

        Assert.Equal(("full", "older_than_10_years"), Of(result.Certificates, old.Id));
    }

    [Fact]
    public void A_change_of_field_keeps_old_certificates()
    {
        var old = Cert("Alt", "2005-01");

        var result = Suggest(WithCertificates([old], Career().Profile.Experiences), answers: Answers("working", plan: "new_field"));

        Assert.Equal(("full", "older_than_10_years"), Of(result.Certificates, old.Id));
    }

    [Fact]
    public void Somebody_coming_back_is_judged_by_the_start_of_the_break_also_for_certificates()
    {
        var stations = new[] { DocumentSamples.Experience("A", "Eins", start: "2003-01", end: "2010-12") };
        var certificate = Cert("Vor der Pause", "2004-06");
        var profile = WithCertificates([certificate], stations);

        Assert.Equal("hidden", Of(Suggest(profile, answers: Answers("working", years: 8)).Certificates, certificate.Id).Suggestion);
        // Seen from the end of 2010 the certificate is 6 years old
        Assert.Equal(("full", "recent"), Of(Suggest(profile, answers: Answers("returning", years: 8)).Certificates, certificate.Id));
    }

    // ---------- educations below the highest degree ----------

    [Fact]
    public void A_school_without_any_usable_date_is_only_shortened_never_suggested_to_be_left_out()
    {
        var degree = DocumentSamples.Education("Bachelor of Science", institution: "Universität Köln", start: "2009-10", end: "2012-08");
        var school = DocumentSamples.Education("Abitur", institution: "Gymnasium", start: "", end: null, current: false);
        var weird = DocumentSamples.Education("Realschulabschluss", institution: "Realschule", start: "damals", end: "früher");
        var profile = With(Career().Profile.Experiences, [degree, school, weird]);

        var result = Suggest(profile);

        Assert.Equal(("short", "school"), Of(result.Educations, school.Id));
        Assert.Equal(("short", "school"), Of(result.Educations, weird.Id));
    }

    [Fact]
    public void A_school_below_the_highest_degree_is_left_out_whatever_the_stage_unless_the_guide_says_school_or_training()
    {
        var c = Career();

        Assert.Equal(("hidden", "below_highest_degree"), Of(Suggest(c.Profile, answers: Answers("working", years: 3)).Educations, c.School.Id));
        // The guide wins over the stations: a school leaver is a starter, however many stations the profile has
        Assert.Equal(("short", "school"), Of(Suggest(c.Profile, answers: Answers("school")).Educations, c.School.Id));
        Assert.Equal(("short", "school"), Of(Suggest(c.Profile, answers: Answers("training_or_studies", years: 20)).Educations, c.School.Id));
        Assert.Equal(("hidden", "below_highest_degree"), Of(Suggest(c.Profile, answers: Answers("working", years: 20)).Educations, c.School.Id));
    }

    [Fact]
    public void Every_station_education_and_certificate_has_a_suggestion_and_nothing_is_invented_for_the_rest()
    {
        var c = Career();
        var profile = c.Profile with
        {
            Certificates = [Cert("Eins", "2020-01"), Cert("Zwei", null)],
            Skills = [DocumentSamples.Skill("Rust")],
            Languages = [DocumentSamples.Language("Englisch", "C1")],
            Interests = [DocumentSamples.Interest("Klettern")],
        };

        var result = Suggest(profile);

        Assert.Equal(profile.Experiences.Select(e => e.Id), result.Experiences.Select(e => e.Id));
        Assert.Equal(profile.Educations.Select(e => e.Id), result.Educations.Select(e => e.Id));
        Assert.Equal(profile.Certificates.Select(e => e.Id), result.Certificates.Select(e => e.Id));
    }

    // ---------- old educations next to a newer one ----------

    private sealed record TwoTrainings(ProfileResponse Profile, EducationDto Old, EducationDto New, ExperienceDto Station);

    /// <summary>The example of the user: two trainings (2002 to 2005 and 2017 to 2020) and a job.</summary>
    private static TwoTrainings Trainings(string oldEnd = "2005-06")
    {
        var old = DocumentSamples.Education("Bürokaufmann", institution: "IHK Köln", start: "2002-09", end: oldEnd);
        var recent = DocumentSamples.Education("Fachinformatiker", institution: "IHK Köln", start: "2017-09", end: "2020-06");
        var station = DocumentSamples.Experience("Entwickler", "Nordwind AG", start: "2020-07", current: true);
        return new(With([station], [old, recent]), old, recent, station);
    }

    [Fact]
    public void Of_two_trainings_the_old_one_is_suggested_to_be_left_out_and_the_newest_stays()
    {
        var t = Trainings();

        var result = Suggest(t.Profile);

        Assert.Equal(("hidden", "older_earlier_degree"), Of(result.Educations, t.Old.Id));
        Assert.Equal(("full", "highest"), Of(result.Educations, t.New.Id));
        // A stage "some years" (6 years of work) is enough: the rule does not depend on the stage
        Assert.Equal("some", result.Stage);
    }

    [Fact]
    public void The_ten_years_are_counted_from_the_end_of_the_education()
    {
        // November 2026: October 2016 is 121 months ago (more than ten years), November 2016 exactly 120 (not more), December 2016 119
        var over = Trainings("2016-10");
        Assert.Equal(("hidden", "older_earlier_degree"), Of(Suggest(over.Profile).Educations, over.Old.Id));
        var exactly = Trainings("2016-11");
        Assert.Equal(("full", "other"), Of(Suggest(exactly.Profile).Educations, exactly.Old.Id));
        var inside = Trainings("2016-12");
        Assert.Equal(("full", "other"), Of(Suggest(inside.Profile).Educations, inside.Old.Id));
        // A bare year counts as its last month, so that the education looks as recent as it can
        var year = Trainings("2016");
        Assert.Equal("full", Of(Suggest(year.Profile).Educations, year.Old.Id).Suggestion);
        var yearOver = Trainings("2015");
        Assert.Equal("hidden", Of(Suggest(yearOver.Profile).Educations, yearOver.Old.Id).Suggestion);
    }

    [Fact]
    public void An_old_education_with_no_end_or_nothing_newer_beside_it_stays()
    {
        var t = Trainings();
        var undated = With([t.Station], [DocumentSamples.Education("Bürokaufmann", institution: "IHK", start: "2002-09", end: ""), t.New]);
        Assert.Equal("full", Of(Suggest(undated).Educations, undated.Educations[0].Id).Suggestion);

        // Alone, or when it is the newest: nothing newer stands beside it
        var alone = With([t.Station], [t.Old]);
        Assert.Equal(("full", "highest"), Of(Suggest(alone).Educations, t.Old.Id));
        var oldIsNewest = With([t.Station], [DocumentSamples.Education("Bürokaufmann", institution: "IHK", start: "2002-09", end: "2005-06"), DocumentSamples.Education("Kurs", institution: "VHS", start: "1999-01", end: "2000-12")]);
        Assert.Equal("full", Of(Suggest(oldIsNewest).Educations, oldIsNewest.Educations[0].Id).Suggestion);
    }

    [Fact]
    public void A_running_education_beside_an_old_one_counts_as_newer()
    {
        var t = Trainings();
        var profile = With([t.Station], [t.Old, DocumentSamples.Education("Studium", institution: "Uni", start: "2024-10", current: true)]);

        Assert.Equal(("hidden", "older_earlier_degree"), Of(Suggest(profile).Educations, t.Old.Id));
    }

    [Theory]
    [InlineData("working", "new_field")]
    [InlineData("school", null)]
    [InlineData("training_or_studies", null)]
    public void The_new_rule_does_not_apply_to_a_change_of_field_or_to_school_and_training(string situation, string? plan)
    {
        var t = Trainings();

        var result = Suggest(t.Profile, answers: Answers(situation, years: situation == "working" ? 6 : null, plan: plan));

        Assert.NotEqual("hidden", Of(result.Educations, t.Old.Id).Suggestion);
    }

    [Fact]
    public void A_school_next_to_a_newer_degree_is_left_out_with_the_reason_below_the_highest_degree()
    {
        var t = Trainings();
        var school = DocumentSamples.Education("Realschulabschluss", institution: "Realschule Nord", start: "1996-08", end: "2002-06");
        var profile = With([t.Station], [school, t.Old, t.New]);

        var result = Suggest(profile);

        Assert.Equal(("hidden", "below_highest_degree"), Of(result.Educations, school.Id));
        Assert.Equal(("hidden", "older_earlier_degree"), Of(result.Educations, t.Old.Id));
    }

    // ---------- what counts: the person's own decisions ----------

    private static CvContentSettingsDto Settings(bool useSuggestion = true, Dictionary<string, string?>? experiences = null, Dictionary<string, string?>? educations = null,
        Dictionary<string, string?>? certificates = null, string[]? sections = null) =>
        new(useSuggestion, new CvSelectionDto(experiences ?? [], educations ?? [], certificates ?? [], sections ?? []));

    private static ContentSuggestionDto WithSettings(ProfileResponse profile, CvContentSettingsDto settings, GuideAnswersDto? answers = null) =>
        new ContentSuggestionRules(Clock).Suggest(profile, [], true, answers, settings);

    [Fact]
    public void Without_settings_what_counts_is_the_suggestion_and_there_is_no_own_decision()
    {
        var t = Trainings();

        var result = Suggest(t.Profile);

        var old = result.Educations.Single(e => e.Id == t.Old.Id);
        Assert.Equal("hidden", old.Effective);
        Assert.Null(old.Override);
        Assert.All(result.Experiences, e => Assert.Equal(e.Suggestion, e.Effective));
    }

    [Fact]
    public void An_own_decision_to_keep_an_entry_beats_the_suggestion_to_leave_it_out()
    {
        var t = Trainings();
        var settings = Settings(educations: new() { [t.Old.Id.ToString()] = "full" });

        var old = WithSettings(t.Profile, settings).Educations.Single(e => e.Id == t.Old.Id);

        Assert.Equal("hidden", old.Suggestion);
        Assert.Equal("full", old.Override);
        Assert.Equal("full", old.Effective);
    }

    [Fact]
    public void An_own_decision_can_also_take_an_entry_down_and_stale_or_unknown_ids_do_nothing()
    {
        var c = Career();
        var settings = Settings(
            experiences: new() { [c.Current.Id.ToString()] = "short", [Guid.NewGuid().ToString()] = "hidden", ["keine-id"] = "hidden" },
            certificates: new() { [Guid.NewGuid().ToString()] = "hidden" });

        var result = WithSettings(c.Profile, settings);

        var current = result.Experiences.Single(e => e.Id == c.Current.Id);
        Assert.Equal(("full", "short", "short"), (current.Suggestion, current.Override, current.Effective));
        Assert.Equal(c.Profile.Experiences.Count, result.Experiences.Count);
        Assert.All(result.Experiences.Where(e => e.Id != c.Current.Id), e => Assert.Null(e.Override));
    }

    [Fact]
    public void With_the_suggestion_switched_off_everything_is_in_full_except_the_own_decisions()
    {
        var t = Trainings();
        var settings = Settings(useSuggestion: false, experiences: new() { [t.Station.Id.ToString()] = "short" });

        var result = WithSettings(t.Profile, settings);

        // The suggestion itself is still reported, only what counts changes
        Assert.Equal("hidden", result.Educations.Single(e => e.Id == t.Old.Id).Suggestion);
        Assert.All(result.Educations, e => Assert.Equal("full", e.Effective));
        Assert.Equal("short", result.Experiences.Single().Effective);
    }

    [Fact]
    public void The_effective_selection_is_the_suggestion_plus_the_decisions_and_nothing_for_what_stays_in_full()
    {
        var t = Trainings();
        var rules = new ContentSuggestionRules(Clock);

        var plain = rules.EffectiveSelection(t.Profile, null, null);
        Assert.Equal([t.Old.Id.ToString()], plain.Educations!.Keys);
        Assert.Equal("hidden", plain.Educations![t.Old.Id.ToString()]);
        Assert.Empty(plain.Experiences!);

        var kept = rules.EffectiveSelection(t.Profile, null, Settings(educations: new() { [t.Old.Id.ToString()] = "full" }));
        Assert.Empty(kept.Educations!);

        var off = rules.EffectiveSelection(t.Profile, null, Settings(useSuggestion: false, sections: ["skills"]));
        Assert.Empty(off.Educations!);
        Assert.Equal(["skills"], off.HiddenSections!);
    }
}
