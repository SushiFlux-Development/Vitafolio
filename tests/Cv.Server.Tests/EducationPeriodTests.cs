// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Cv.Server.Ai;
using Cv.Server.Applications;
using Cv.Server.Controllers;
using Cv.Server.Data;
using Cv.Server.Documents;
using Cv.Server.Tests.Support;

namespace Cv.Server.Tests;

/// <summary>
/// An education needs a beginning or an end (or "still running"): for school the year of graduation is enough. Work stations keep their
/// beginning as a must. Everything that shows or orders the period has to cope with an empty beginning.
/// </summary>
public sealed class EducationPeriodTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<TestClient> NewUser(string name)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, name);
        return user;
    }

    private static object Edu(string? start, string? end = null, bool current = false, string degree = "Abitur") =>
        new { degree, institution = "Gymnasium am Park", startDate = start, endDate = end, isCurrent = current };

    // ---------- the rule ----------

    [Theory]
    [InlineData("2005-08", null, false)]
    [InlineData(null, "2009", false)]
    [InlineData("", "2009-06", false)]
    [InlineData("2005", "2009", false)]
    [InlineData(null, null, true)]
    [InlineData("", "", true)]
    public async Task A_beginning_or_an_end_or_running_is_enough(string? start, string? end, bool current)
    {
        var user = await NewUser("edu-ok-" + Guid.NewGuid().ToString("N")[..8]);

        var response = await user.PostAsync("/api/profile/educations", Edu(start, end, current));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var saved = await response.JsonAsync();
        // The beginning is stored as the empty text it always was (no migration), never as null
        Assert.Equal(start?.Trim() ?? "", saved.GetProperty("startDate").GetString());
    }

    [Fact]
    public async Task Neither_beginning_nor_end_nor_running_is_refused_with_a_clear_code_on_the_start_field()
    {
        var user = await NewUser("edu-none");

        foreach (var (start, end) in new (string?, string?)[] { (null, null), ("", ""), ("  ", " ") })
        {
            var response = await user.PostAsync("/api/profile/educations", Edu(start, end));
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var problem = await response.JsonAsync();
            Assert.Equal("validation.failed", problem.GetProperty("code").GetString());
            Assert.Equal("validation.period_required", problem.GetProperty("errors").GetProperty("startDate")[0].GetProperty("code").GetString());
        }
        Assert.Equal(0, (await (await user.GetAsync("/api/profile")).JsonAsync()).GetProperty("educations").GetArrayLength());
    }

    [Fact]
    public async Task Changing_an_education_follows_the_same_rule_and_a_work_station_still_needs_its_beginning()
    {
        var user = await NewUser("edu-update");
        var id = (await (await user.PostAsync("/api/profile/educations", Edu("2005-08", "2009-06"))).JsonAsync()).GetProperty("id").GetString();

        var onlyEnd = await user.PutAsync($"/api/profile/educations/{id}", Edu(null, "2009-06"));
        Assert.Equal(HttpStatusCode.OK, onlyEnd.StatusCode);
        Assert.Equal("", (await onlyEnd.JsonAsync()).GetProperty("startDate").GetString());

        Assert.Equal(HttpStatusCode.BadRequest, (await user.PutAsync($"/api/profile/educations/{id}", Edu(null, null))).StatusCode);

        var station = await user.PostAsync("/api/profile/experiences", new { jobTitle = "Leitung", employer = "Firma", endDate = "2020-01" });
        Assert.Equal(HttpStatusCode.BadRequest, station.StatusCode);
        Assert.True((await station.JsonAsync()).GetProperty("errors").TryGetProperty("startDate", out _));
    }

    [Fact]
    public async Task Educations_are_ordered_by_their_start_or_else_by_their_end()
    {
        var user = await NewUser("edu-order");
        await user.PostAsync("/api/profile/educations", Edu("2010-10", "2013-09", degree: "Bachelor"));
        await user.PostAsync("/api/profile/educations", Edu(null, "2009", degree: "Abitur"));
        await user.PostAsync("/api/profile/educations", Edu("2014-10", null, current: true, degree: "Master"));
        await user.PostAsync("/api/profile/educations", Edu(null, "2016", degree: "Hauptschule"));

        var degrees = (await (await user.GetAsync("/api/profile")).JsonAsync()).GetProperty("educations").EnumerateArray().Select(e => e.GetProperty("degree").GetString());

        // Equal sort positions: newest first, a school with only an end year counts by that year
        Assert.Equal(["Hauptschule", "Master", "Bachelor", "Abitur"], degrees);
    }

    // ---------- showing the period ----------

    public static TheoryData<string, string> DesignsAndLanguages
    {
        get
        {
            var data = new TheoryData<string, string>();
            foreach (var design in DocumentDesigns.Ids)
            {
                data.Add(design, "de");
                data.Add(design, "en");
            }
            return data;
        }
    }

    private static string Pdf(ProfileResponse profile, string design, string language) =>
        PdfText.All(new TypstRenderer().RenderPdf(profile, new CvRenderOptions(design, null, null, ShowPhoto: false, PhotoShape: null, language)));

    [Theory]
    [MemberData(nameof(DesignsAndLanguages))]
    public void Only_an_end_is_shown_as_one_date_without_a_dash_in_every_design(string design, string language)
    {
        var profile = DocumentSamples.Empty() with
        {
            Educations = [DocumentSamples.Education("Abitur", institution: "Gymnasium am Park", start: "", end: "2009-06")],
        };

        var text = Pdf(profile, design, language);

        Assert.Contains("06/2009", text);
        Assert.DoesNotContain("– 06/2009", text);
        Assert.DoesNotContain("06/2009 –", text);
        Assert.DoesNotContain("–06/2009", text);
    }

    [Theory]
    [InlineData("de", "laufend")]
    [InlineData("en", "ongoing")]
    public void A_running_education_without_a_beginning_says_so(string language, string expected)
    {
        var profile = DocumentSamples.Empty() with
        {
            Educations = [DocumentSamples.Education("Studium", institution: "Uni", start: "", current: true)],
        };

        Assert.Contains(expected, Pdf(profile, "classic", language));
        Assert.Equal(expected, DocxRenderer.Period("", null, true, language == "en"));
    }

    [Fact]
    public void The_word_export_shows_one_date_alone_without_a_dash()
    {
        Assert.Equal("06/2009", DocxRenderer.Period("", "2009-06", false, false));
        Assert.Equal("2009", DocxRenderer.Period(null, "2009", false, true));
        Assert.Equal("09/2005", DocxRenderer.Period("2005-09", "", false, false));
        Assert.Equal("09/2005 – 06/2009", DocxRenderer.Period("2005-09", "2009-06", false, false));
        Assert.Equal("", DocxRenderer.Period("", "", false, false));
    }

    // ---------- JSON Resume ----------

    [Fact]
    public async Task The_json_resume_export_leaves_out_a_missing_beginning_and_reads_back_the_same()
    {
        var source = await NewUser("edu-resume-source");
        await source.PutAsync("/api/profile", new { firstName = "Erika", lastName = "Muster" });
        await source.PostAsync("/api/profile/educations", Edu(null, "2009-06"));
        await source.PostAsync("/api/profile/educations", Edu("2012-10", null, current: true, degree: "Studium"));
        var exported = JsonNode.Parse(await (await source.GetAsync("/api/profile/json-resume")).Content.ReadAsStringAsync(Ct))!;

        var education = exported["education"]!.AsArray();
        var school = education.Single(e => (string?)e!["studyType"] == "Abitur")!;
        Assert.Null(school["startDate"]);
        Assert.Equal("2009-06", (string?)school["endDate"]);

        var target = await NewUser("edu-resume-target");
        var imported = await target.PostAsync("/api/profile/json-resume/import?replace=true", exported);
        Assert.True(imported.StatusCode == HttpStatusCode.OK, await imported.Content.ReadAsStringAsync(Ct));
        var again = JsonNode.Parse(await (await target.GetAsync("/api/profile/json-resume")).Content.ReadAsStringAsync(Ct))!;
        Assert.True(JsonNode.DeepEquals(exported, again), $"{exported.ToJsonString()}\n{again.ToJsonString()}");
    }

    [Fact]
    public async Task The_json_resume_import_takes_an_education_with_only_an_end_and_refuses_one_without_any_date_naming_the_field()
    {
        var user = await NewUser("edu-resume-import");

        var ok = await user.PostAsync("/api/profile/json-resume/import", new { education = new object[] { new { institution = "Gymnasium", studyType = "Abitur", endDate = "2009-06-30" } } });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var saved = (await (await user.GetAsync("/api/profile")).JsonAsync()).GetProperty("educations")[0];
        Assert.Equal("", saved.GetProperty("startDate").GetString());
        Assert.Equal("2009-06", saved.GetProperty("endDate").GetString());
        Assert.False(saved.GetProperty("isCurrent").GetBoolean());

        // No date at all is not "still running" just because nothing was said: the import says what is missing
        var bad = await user.PostAsync("/api/profile/json-resume/import", new { education = new object[] { new { institution = "Gymnasium", studyType = "Abitur" } } });
        Assert.Equal(HttpStatusCode.BadRequest, bad.StatusCode);
        Assert.True((await bad.JsonAsync()).GetProperty("errors").TryGetProperty("education[0].startDate", out _));
    }

    // ---------- other readers of the period ----------

    [Fact]
    public void The_text_for_the_ai_shows_one_date_alone_and_orders_by_the_end_when_the_beginning_is_missing()
    {
        var profile = new UserProfile
        {
            FirstName = "Erika",
            LastName = "Muster",
            Educations =
            [
                new Education { Degree = "Abitur", Institution = "Gymnasium", StartDate = "", EndDate = "2009-06" },
                new Education { Degree = "Studium", Institution = "Uni", StartDate = "2010-10", IsCurrent = true },
                new Education { Degree = "Kurs", Institution = "Akademie", StartDate = "", IsCurrent = true },
            ],
        };

        var (_, user, _) = AiPromptBuilder.Build(AiTasks.GenerateSummary, profile, new AiPromptRequest(AiTasks.GenerateSummary, null, null, null, null, null, "de", null, null), pseudonymize: false);

        Assert.Contains("(2009-06)", user);
        Assert.DoesNotContain("- 2009-06", user);
        Assert.DoesNotContain("2009-06 -", user);
        Assert.Contains("(2010-10 - heute)", user);
        Assert.Contains("(laufend)", user);
        Assert.True(user.IndexOf("Studium", StringComparison.Ordinal) < user.IndexOf("Abitur", StringComparison.Ordinal));
    }

    [Fact]
    public void The_suggestion_copes_with_an_education_that_has_only_an_end()
    {
        var clock = new TestDoubles.FixedTime(new DateTimeOffset(2026, 11, 9, 12, 0, 0, TimeSpan.Zero));
        var school = DocumentSamples.Education("Abitur", institution: "Gymnasium am Park", start: "", end: "2009");
        var ongoing = DocumentSamples.Education("Bachelor of Science", institution: "Universität Köln", start: "", current: true);
        var profile = DocumentSamples.Empty() with { Educations = [school, ongoing] };

        var result = new ContentSuggestionRules(clock).Suggest(profile, [Attachment("Abiturzeugnis")], hasCoverLetter: true);

        Assert.Equal(("full", "highest"), (result.Educations.Single(e => e.Id == ongoing.Id).Suggestion, result.Educations.Single(e => e.Id == ongoing.Id).Reason));
        // The school ended long ago and a newer education is running beside it: left out
        Assert.Equal("hidden", result.Educations.Single(e => e.Id == school.Id).Suggestion);
        // The school is finished (2009), the degree is still running: the school report is what the starter needs and it is there
        Assert.Equal("ok", result.Checklist.Single(c => c.Key == "highest_degree").State);
    }

    private static Data.Attachment Attachment(string title) => new() { Id = Guid.NewGuid(), UserId = Guid.NewGuid(), Title = title, Category = "Zeugnis", CreatedAt = DateTime.UtcNow };

    [Fact]
    public void A_selection_shows_an_education_without_a_beginning_like_any_other()
    {
        var school = DocumentSamples.Education("Abitur", start: "", end: "2009", description: "Schwerpunkt Kunst");
        var profile = DocumentSamples.Empty() with { Educations = [school] };

        var shortened = CvSelectionRules.Apply(profile, new CvSelectionDto(null, new Dictionary<string, string?> { [school.Id.ToString()] = "short" }, null, null));

        Assert.Null(shortened.Educations[0].Description);
        Assert.Equal("", shortened.Educations[0].StartDate);
        Assert.Equal("2009", shortened.Educations[0].EndDate);
    }

    [Fact]
    public void A_stored_json_for_a_degree_roundtrips_through_the_api_dto()
    {
        var dto = DocumentSamples.Education("Abitur", start: "", end: "2009");

        Assert.Equal("2009", dto.SortKey());
        Assert.Equal("2005", DocumentSamples.Education("Abitur", start: "2005", end: "2009").SortKey());
        Assert.Equal("", DocumentSamples.Education("Abitur", start: "", current: true).SortKey());
        Assert.Equal(JsonValueKind.String, JsonSerializer.SerializeToElement(dto, JsonSerializerOptions.Web).GetProperty("startDate").ValueKind);
        Assert.False(JsonSerializer.SerializeToElement(dto, JsonSerializerOptions.Web).TryGetProperty("sortKey", out _));
    }
}
