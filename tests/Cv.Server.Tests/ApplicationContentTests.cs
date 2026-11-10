// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Net;
using System.Text.Json;
using Cv.Server.Applications;
using Cv.Server.Controllers;
using Cv.Server.Tests.Support;

namespace Cv.Server.Tests;

/// <summary>
/// What an application takes from the profile (<c>cvSelection</c>), the suggestion endpoint and the answers of the guide - through the API,
/// and what ends up in the PDF text.
/// </summary>
public sealed class ApplicationContentTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<JsonElement> Json(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        Assert.True(response.StatusCode == expected, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync(Ct)}");
        return await response.JsonAsync();
    }

    private static async Task<string> Id(HttpResponseMessage response) =>
        (await Json(response, HttpStatusCode.Created)).GetProperty("id").GetString()!;

    private sealed record Seed(TestClient Client, string StationA, string StationB, string School, string Certificate, string Section);

    /// <summary>A profile whose every part has a unique word, so the PDF text shows exactly what was left in.</summary>
    private async Task<Seed> SeedAsync(string name)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, name);
        await user.PutAsync("/api/profile", new { firstName = "Erika", lastName = "Muster", bio = "BIOTOKEN Profil" });
        var a = await Id(await user.PostAsync("/api/profile/experiences", new { jobTitle = "Leitung", employer = "ALPHAFIRMA", startDate = "2022-01", isCurrent = true, description = "ALPHABESCHREIBUNG" }));
        var b = await Id(await user.PostAsync("/api/profile/experiences", new { jobTitle = "Sachbearbeitung", employer = "BRAVOFIRMA", startDate = "2015-01", endDate = "2021-12", description = "BRAVOBESCHREIBUNG" }));
        var school = await Id(await user.PostAsync("/api/profile/educations", new { degree = "Abitur", institution = "GAMMASCHULE", startDate = "2000", endDate = "2009", description = "GAMMABESCHREIBUNG" }));
        var certificate = await Id(await user.PostAsync("/api/profile/certificates", new { title = "ZULUZERTIFIKAT", issuer = "Kammer" }));
        await user.PostAsync("/api/profile/skills", new { name = "YANKEEKENNTNIS", category = "Technik", level = 3 });
        await user.PostAsync("/api/profile/languages", new { language = "XRAYSPRACHE", level = "B2" });
        await user.PostAsync("/api/profile/interests", new { name = "WHISKYINTERESSE" });
        var section = await Id(await user.PostAsync("/api/profile/custom-sections", new { title = "VICTORABSCHNITT" }));
        await user.PostAsync($"/api/profile/custom-sections/{section}/items", new { title = "VICTOREINTRAG" });
        return new Seed(user, a, b, school, certificate, section);
    }

    private static async Task<string> PreviewText(TestClient user, string applicationId, string query = "?version=current") =>
        PdfText.All(await (await user.GetAsync($"/api/applications/{applicationId}/dossier/preview{query}")).Content.ReadAsByteArrayAsync(Ct));

    private static async Task<string> NewApplication(TestClient user, object? cvSelection = null, string status = "draft") =>
        await Id(await user.PostAsync("/api/applications", new { jobTitle = "Lead", company = "Firma", status, cvSelection }));

    // ---------- applying the selection ----------

    [Fact]
    public async Task Without_a_selection_the_whole_profile_is_rendered_and_the_api_says_null()
    {
        var seed = await SeedAsync("sel-null");
        var id = await NewApplication(seed.Client);

        var text = await PreviewText(seed.Client, id);

        foreach (var token in new[] { "ALPHABESCHREIBUNG", "BRAVOBESCHREIBUNG", "GAMMABESCHREIBUNG", "ZULUZERTIFIKAT", "YANKEEKENNTNIS", "XRAYSPRACHE", "WHISKYINTERESSE", "VICTORABSCHNITT", "BIOTOKEN" })
        {
            Assert.Contains(token, text);
        }
        Assert.Equal(JsonValueKind.Null, (await Json(await seed.Client.GetAsync($"/api/applications/{id}"))).GetProperty("cvSelection").ValueKind);
    }

    [Fact]
    public async Task Short_drops_the_description_and_hidden_drops_the_entry()
    {
        var seed = await SeedAsync("sel-levels");
        var selection = new
        {
            experiences = new Dictionary<string, string> { [seed.StationA] = "short", [seed.StationB] = "hidden" },
            educations = new Dictionary<string, string> { [seed.School] = "short" },
            certificates = new Dictionary<string, string> { [seed.Certificate] = "hidden" },
        };
        var id = await NewApplication(seed.Client, selection);

        var text = await PreviewText(seed.Client, id);

        // Short: title, employer and period stay, the description goes
        Assert.Contains("ALPHAFIRMA", text);
        Assert.Contains("Leitung", text);
        Assert.DoesNotContain("ALPHABESCHREIBUNG", text);
        Assert.Contains("GAMMASCHULE", text);
        Assert.DoesNotContain("GAMMABESCHREIBUNG", text);
        // Hidden: the entry is gone
        Assert.DoesNotContain("BRAVOFIRMA", text);
        Assert.DoesNotContain("BRAVOBESCHREIBUNG", text);
        Assert.DoesNotContain("ZULUZERTIFIKAT", text);
        // The master profile itself is untouched
        var profile = await Json(await seed.Client.GetAsync("/api/profile"));
        Assert.Equal(2, profile.GetProperty("experiences").GetArrayLength());
        Assert.Contains(profile.GetProperty("experiences").EnumerateArray(), e => e.GetProperty("description").GetString() == "ALPHABESCHREIBUNG");
    }

    [Fact]
    public async Task Hidden_sections_drop_the_summary_skills_languages_interests_and_one_custom_section()
    {
        var seed = await SeedAsync("sel-sections");
        var id = await NewApplication(seed.Client, new { hiddenSections = new[] { "summary", "skills", "languages", "interests", $"custom:{seed.Section}" } });

        var text = await PreviewText(seed.Client, id);

        foreach (var token in new[] { "BIOTOKEN", "YANKEEKENNTNIS", "XRAYSPRACHE", "WHISKYINTERESSE", "VICTORABSCHNITT", "VICTOREINTRAG" })
        {
            Assert.DoesNotContain(token, text);
        }
        Assert.Contains("ALPHAFIRMA", text);
        Assert.Contains("ZULUZERTIFIKAT", text);
    }

    [Fact]
    public async Task Ids_of_other_accounts_and_of_deleted_entries_do_nothing()
    {
        var seed = await SeedAsync("sel-foreign");
        var other = await SeedAsync("sel-foreign-other");
        var gone = await Id(await seed.Client.PostAsync("/api/profile/experiences", new { jobTitle = "Weg", employer = "WEGFIRMA", startDate = "2001-01", endDate = "2002-01" }));
        await seed.Client.DeleteAsync($"/api/profile/experiences/{gone}");
        var selection = new
        {
            experiences = new Dictionary<string, string> { [other.StationA] = "hidden", [gone] = "hidden", [Guid.NewGuid().ToString()] = "short" },
            certificates = new Dictionary<string, string> { [other.Certificate] = "hidden" },
            hiddenSections = new[] { $"custom:{other.Section}", $"custom:{Guid.NewGuid()}" },
        };
        var id = await NewApplication(seed.Client, selection);

        var text = await PreviewText(seed.Client, id);

        Assert.Contains("ALPHAFIRMA", text);
        Assert.Contains("ALPHABESCHREIBUNG", text);
        Assert.Contains("ZULUZERTIFIKAT", text);
        Assert.Contains("VICTORABSCHNITT", text);
    }

    [Fact]
    public async Task An_entry_added_later_appears_in_an_application_that_has_a_selection()
    {
        var seed = await SeedAsync("sel-later");
        var id = await NewApplication(seed.Client, new { experiences = new Dictionary<string, string> { [seed.StationB] = "hidden" } });

        await seed.Client.PostAsync("/api/profile/experiences", new { jobTitle = "Neu", employer = "NACHTRAGFIRMA", startDate = "2023-01", description = "NACHTRAGTEXT" });

        var text = await PreviewText(seed.Client, id);
        Assert.Contains("NACHTRAGFIRMA", text);
        Assert.Contains("NACHTRAGTEXT", text);
        Assert.DoesNotContain("BRAVOFIRMA", text);
    }

    [Fact]
    public async Task The_frozen_snapshot_does_not_change_when_the_selection_or_the_profile_changes_later()
    {
        var seed = await SeedAsync("sel-frozen");
        var id = await NewApplication(seed.Client, new { experiences = new Dictionary<string, string> { [seed.StationB] = "hidden" } });

        // Sending freezes the dossier as it is now
        Assert.Equal(HttpStatusCode.OK, (await seed.Client.PostAsync($"/api/applications/{id}/status", new { status = "applied" })).StatusCode);
        Assert.True((await Json(await seed.Client.GetAsync($"/api/applications/{id}"))).GetProperty("hasArchivedPdf").GetBoolean());

        // Show everything again afterwards, and change the master profile
        var put = await seed.Client.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", status = "applied", cvSelection = new { } });
        Assert.Equal(JsonValueKind.Null, (await Json(put)).GetProperty("cvSelection").ValueKind);
        await seed.Client.PutAsync($"/api/profile/experiences/{seed.StationA}", new { jobTitle = "Leitung", employer = "GEAENDERTEFIRMA", startDate = "2022-01", isCurrent = true });

        var filed = await PreviewText(seed.Client, id, "");
        var current = await PreviewText(seed.Client, id);

        Assert.DoesNotContain("BRAVOFIRMA", filed);
        Assert.Contains("ALPHAFIRMA", filed);
        Assert.DoesNotContain("GEAENDERTEFIRMA", filed);
        Assert.Contains("BRAVOFIRMA", current);
        Assert.Contains("GEAENDERTEFIRMA", current);
    }

    // ---------- reading and writing the field ----------

    [Fact]
    public async Task The_selection_is_returned_normalised_kept_when_left_out_and_reset_by_an_empty_object()
    {
        var seed = await SeedAsync("sel-roundtrip");
        var upper = seed.StationA.ToUpperInvariant();
        var created = await Json(await seed.Client.PostAsync("/api/applications", new
        {
            jobTitle = "Lead",
            company = "Firma",
            cvSelection = new { experiences = new Dictionary<string, string> { [upper] = " SHORT " }, hiddenSections = new[] { "Skills" } },
        }), HttpStatusCode.Created);
        var id = created.GetProperty("id").GetString()!;

        var selection = created.GetProperty("cvSelection");
        Assert.Equal("short", selection.GetProperty("experiences").GetProperty(seed.StationA).GetString());
        Assert.Equal(["skills"], selection.GetProperty("hiddenSections").EnumerateArray().Select(s => s.GetString()));

        // A request without the field keeps it (like the attachments)
        var kept = await Json(await seed.Client.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma" }));
        Assert.Equal("short", kept.GetProperty("cvSelection").GetProperty("experiences").GetProperty(seed.StationA).GetString());

        // An empty object (or one with only empty groups) means "everything in full" again
        var reset = await Json(await seed.Client.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", cvSelection = new { experiences = new Dictionary<string, string>(), hiddenSections = Array.Empty<string>() } }));
        Assert.Equal(JsonValueKind.Null, reset.GetProperty("cvSelection").ValueKind);
        Assert.Equal(JsonValueKind.Null, (await Json(await seed.Client.GetAsync($"/api/applications/{id}"))).GetProperty("cvSelection").ValueKind);
    }

    public static TheoryData<string, object> InvalidSelections => new()
    {
        { "cvSelection.experiences", new { experiences = new Dictionary<string, string> { [Guid.NewGuid().ToString()] = "full" } } },
        { "cvSelection.experiences", new { experiences = new Dictionary<string, string> { [Guid.NewGuid().ToString()] = "weg" } } },
        { "cvSelection.experiences", new { experiences = new Dictionary<string, string> { ["keine-id"] = "short" } } },
        { "cvSelection.educations", new { educations = new Dictionary<string, string> { [Guid.NewGuid().ToString()] = "" } } },
        { "cvSelection.certificates", new { certificates = new Dictionary<string, string> { [Guid.NewGuid().ToString()] = "short" } } },
        { "cvSelection.hiddenSections", new { hiddenSections = new[] { "experience" } } },
        { "cvSelection.hiddenSections", new { hiddenSections = new[] { "custom:keine-id" } } },
        { "cvSelection.hiddenSections", new { hiddenSections = new[] { "skills", "SKILLS" } } },
        { "cvSelection.experiences", new { experiences = Enumerable.Range(0, CvSelectionRules.MaxEntriesPerGroup + 1).ToDictionary(_ => Guid.NewGuid().ToString(), _ => "short") } },
        { "cvSelection.hiddenSections", new { hiddenSections = Enumerable.Range(0, CvSelectionRules.MaxHiddenSections + 1).Select(_ => $"custom:{Guid.NewGuid()}").ToArray() } },
    };

    [Theory]
    [MemberData(nameof(InvalidSelections))]
    public async Task Unknown_values_are_refused_with_the_field_named(string field, object selection)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "sel-bad-" + Guid.NewGuid().ToString("N")[..8]);

        var created = await user.PostAsync("/api/applications", new { jobTitle = "Lead", company = "Firma", cvSelection = selection });

        Assert.Equal(HttpStatusCode.BadRequest, created.StatusCode);
        var problem = await created.JsonAsync();
        Assert.Equal("validation.failed", problem.GetProperty("code").GetString());
        Assert.True(problem.GetProperty("errors").TryGetProperty(field, out _), problem.ToString());

        var id = await NewApplication(user);
        Assert.Equal(HttpStatusCode.BadRequest, (await user.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", cvSelection = selection })).StatusCode);
    }

    // ---------- the suggestion endpoint ----------

    [Fact]
    public async Task The_suggestion_needs_a_sign_in_and_reads_only_the_own_data()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await server.Client().GetAsync("/api/applications/content-suggestion")).StatusCode);

        var seed = await SeedAsync("sug-own");
        var other = await SeedAsync("sug-other");
        var attachment = await UploadAttachment(other.Client, "Arbeitszeugnis Fremd", "Zeugnis");

        var json = await Json(await seed.Client.GetAsync("/api/applications/content-suggestion"));

        Assert.Equal(["recent", "recent"], json.GetProperty("experiences").EnumerateArray().Select(e => e.GetProperty("reason").GetString()));
        var ids = json.GetProperty("experiences").EnumerateArray().Select(e => e.GetProperty("id").GetString()).ToList();
        Assert.Contains(seed.StationA, ids);
        Assert.DoesNotContain(other.StationA, ids);
        Assert.Empty(json.GetProperty("attachments").EnumerateArray());
        Assert.DoesNotContain(attachment, json.ToString());
        Assert.Equal(6, json.GetProperty("checklist").GetArrayLength());
        // Every certificate of the profile has a suggestion (the seed has one, without a date)
        var certificate = json.GetProperty("certificates").EnumerateArray().Single();
        Assert.Equal(seed.Certificate, certificate.GetProperty("id").GetString());
        Assert.Equal(("full", "no_date"), (certificate.GetProperty("suggestion").GetString(), certificate.GetProperty("reason").GetString()));
        Assert.Equal("long", (await Json(await other.Client.GetAsync("/api/applications/content-suggestion"))).GetProperty("stage").GetString());
    }

    [Fact]
    public async Task The_suggestion_uses_the_saved_answers_of_the_guide()
    {
        var seed = await SeedAsync("sug-guide");

        var before = await Json(await seed.Client.GetAsync("/api/applications/content-suggestion"));
        Assert.Equal(JsonValueKind.Null, before.GetProperty("situation").ValueKind);
        Assert.Equal(JsonValueKind.Null, before.GetProperty("plan").ValueKind);
        Assert.Equal("optional", Checklist(before, "photo"));

        await Json(await seed.Client.PutAsync("/api/profile/guide-answers", new { situation = "working", yearsOfExperience = 25, plan = "new_field", explain = Array.Empty<string>(), region = "uk" }));
        var after = await Json(await seed.Client.GetAsync("/api/applications/content-suggestion"));

        Assert.Equal(25, after.GetProperty("yearsOfExperience").GetInt32());
        Assert.Equal("long", after.GetProperty("stage").GetString());
        Assert.Equal("working", after.GetProperty("situation").GetString());
        Assert.Equal("new_field", after.GetProperty("plan").GetString());
        Assert.Equal("not_needed", Checklist(after, "photo"));
    }

    [Fact]
    public async Task The_suggestion_names_attachments_by_their_id_and_leaves_nothing_out_by_itself()
    {
        var seed = await SeedAsync("sug-attach");
        var reference = await UploadAttachment(seed.Client, "Arbeitszeugnis BRAVOFIRMA", "Zeugnis");
        var school = await UploadAttachment(seed.Client, "Abiturzeugnis", "Zeugnis");

        var json = await Json(await seed.Client.GetAsync("/api/applications/content-suggestion"));
        var attachments = json.GetProperty("attachments").EnumerateArray().ToDictionary(a => a.GetProperty("id").GetString()!, a => (a.GetProperty("suggestion").GetString(), a.GetProperty("reason").GetString()));

        Assert.Equal(("include", "recent_reference"), attachments[reference]);
        Assert.Equal(("omit", "school_report"), attachments[school]);
        Assert.Equal("ok", Checklist(json, "work_references"));
        // A suggestion changes nothing: the application list and the attachments are as they were
        Assert.Equal(2, (await Json(await seed.Client.GetAsync("/api/attachments"))).GetArrayLength());
    }

    private static string Checklist(JsonElement suggestion, string key) =>
        suggestion.GetProperty("checklist").EnumerateArray().Single(c => c.GetProperty("key").GetString() == key).GetProperty("state").GetString()!;

    private static async Task<string> UploadAttachment(TestClient user, string title, string category)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(DocumentSamples.Pdf());
        file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
        form.Add(file, "file", "datei.pdf");
        form.Add(new StringContent(title), "title");
        form.Add(new StringContent(category), "category");
        return await Id(await user.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/attachments") { Content = form }));
    }

    // ---------- the answers of the guide ----------

    [Fact]
    public async Task Guide_answers_are_null_until_saved_then_normalised_and_kept_per_account()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "guide-a");
        var (other, _) = await server.UserAsync(admin, "guide-b");
        Assert.Equal(HttpStatusCode.Unauthorized, (await server.Client().GetAsync("/api/profile/guide-answers")).StatusCode);

        var empty = await user.GetAsync("/api/profile/guide-answers");
        Assert.Equal(HttpStatusCode.OK, empty.StatusCode);
        Assert.Equal(JsonValueKind.Null, (await empty.JsonAsync()).ValueKind);

        var saved = await Json(await user.PutAsync("/api/profile/guide-answers", new
        {
            situation = " Returning ",
            yearsOfExperience = 12,
            plan = "NEW_FIELD",
            explain = new[] { "Illness", "gap", "illness", " parental_leave " },
            region = "UK",
        }));

        Assert.Equal("returning", saved.GetProperty("situation").GetString());
        Assert.Equal(12, saved.GetProperty("yearsOfExperience").GetInt32());
        Assert.Equal("new_field", saved.GetProperty("plan").GetString());
        Assert.Equal("uk", saved.GetProperty("region").GetString());
        // Fixed order, no duplicates
        Assert.Equal(["gap", "parental_leave", "illness"], saved.GetProperty("explain").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal(saved.ToString(), (await Json(await user.GetAsync("/api/profile/guide-answers"))).ToString());
        Assert.Equal(JsonValueKind.Null, (await (await other.GetAsync("/api/profile/guide-answers")).JsonAsync()).ValueKind);

        // The number may be null again (no answer), and every field may be left out
        var cleared = await Json(await user.PutAsync("/api/profile/guide-answers", new { situation = "school", yearsOfExperience = (int?)null }));
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("yearsOfExperience").ValueKind);
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("plan").ValueKind);
        Assert.Equal(0, cleared.GetProperty("explain").GetArrayLength());
    }

    public static TheoryData<string, object> InvalidAnswers => new()
    {
        { "situation", new { situation = "retired" } },
        { "situation", new { situation = "" } },
        { "plan", new { plan = "somewhere" } },
        { "region", new { region = "fr" } },
        { "explain", new { explain = new[] { "gap", "boredom" } } },
        { "explain", new { explain = Enumerable.Repeat("gap", 13).ToArray() } },
        { "yearsOfExperience", new { yearsOfExperience = -1 } },
        { "yearsOfExperience", new { yearsOfExperience = GuideAnswers.MaxYears + 1 } },
    };

    [Theory]
    [MemberData(nameof(InvalidAnswers))]
    public async Task Unknown_guide_answers_are_refused_with_the_field_named(string field, object body)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "guide-bad-" + Guid.NewGuid().ToString("N")[..8]);

        var response = await user.PutAsync("/api/profile/guide-answers", body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.Equal("validation.failed", problem.GetProperty("code").GetString());
        Assert.True(problem.GetProperty("errors").TryGetProperty(field, out _), problem.ToString());
        // Nothing was saved
        Assert.Equal(JsonValueKind.Null, (await (await user.GetAsync("/api/profile/guide-answers")).JsonAsync()).ValueKind);
    }

    [Fact]
    public void Stored_answers_with_a_removed_option_read_as_not_answered()
    {
        var read = GuideAnswers.Parse("""{"situation":"astronaut","yearsOfExperience":999,"plan":"same_field","explain":["gap","x"],"region":"de"}""")!;

        Assert.Null(read.Situation);
        Assert.Null(read.YearsOfExperience);
        Assert.Equal("same_field", read.Plan);
        Assert.Equal(["gap"], read.Explain);
        Assert.Null(GuideAnswers.Parse("kein json"));
        Assert.Null(GuideAnswers.Parse(null));
    }

    [Fact]
    public void A_stored_selection_that_cannot_be_read_renders_in_full()
    {
        var profile = DocumentSamples.Empty() with { Experiences = [DocumentSamples.Experience(description: "Text")] };

        Assert.Same(profile, CvSelectionRules.Apply(profile, CvSelectionRules.Parse("{kaputt")));
        Assert.Null(CvSelectionRules.Parse("   "));
    }

    // ---------- "Preview and export" of the profile ----------

    private sealed record Trainings(TestClient Client, string Old, string Recent, string Station, string Certificate);

    /// <summary>The example of the user: two trainings (2002 to 2005 and 2017 to 2020) and a job, and a certificate from 2001.</summary>
    private async Task<Trainings> SeedTrainingsAsync(string name)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, name);
        await user.PutAsync("/api/profile", new { firstName = "Erika", lastName = "Muster" });
        var old = await Id(await user.PostAsync("/api/profile/educations", new { degree = "Bürokaufmann", institution = "ALTINSTITUT", startDate = "2002-09", endDate = "2005-06" }));
        var recent = await Id(await user.PostAsync("/api/profile/educations", new { degree = "Fachinformatiker", institution = "NEUINSTITUT", startDate = "2017-09", endDate = "2020-06" }));
        var station = await Id(await user.PostAsync("/api/profile/experiences", new { jobTitle = "Entwicklung", employer = "STATIONFIRMA", startDate = "2020-07", isCurrent = true }));
        var certificate = await Id(await user.PostAsync("/api/profile/certificates", new { title = "ALTZERTIFIKAT", issueDate = "2001-05" }));
        return new Trainings(user, old, recent, station, certificate);
    }

    private static async Task<string> ExportPdfText(TestClient user, object options) =>
        PdfText.All(await (await user.PostAsync("/api/profile/preview/pdf", options)).Content.ReadAsByteArrayAsync(Ct));

    private static async Task<string> ExportDocxText(TestClient user, object options)
    {
        var response = await user.PostAsync("/api/profile/export/docx", options);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = DocumentFormat.OpenXml.Packaging.WordprocessingDocument.Open(new MemoryStream(await response.Content.ReadAsByteArrayAsync(Ct)), false);
        return document.MainDocumentPart!.Document!.Body!.InnerText;
    }

    private static Task<HttpResponseMessage> Save(TestClient user, object settings) => user.PutAsync("/api/profile/cv-content-settings", settings);

    [Fact]
    public async Task The_profile_carries_the_settings_with_the_defaults_until_something_is_saved()
    {
        var t = await SeedTrainingsAsync("set-default");

        var settings = (await Json(await t.Client.GetAsync("/api/profile"))).GetProperty("cvContentSettings");

        Assert.True(settings.GetProperty("useSuggestion").GetBoolean());
        var overrides = settings.GetProperty("overrides");
        Assert.Empty(overrides.GetProperty("experiences").EnumerateObject());
        Assert.Empty(overrides.GetProperty("educations").EnumerateObject());
        Assert.Empty(overrides.GetProperty("certificates").EnumerateObject());
        Assert.Equal(0, overrides.GetProperty("hiddenSections").GetArrayLength());
    }

    [Fact]
    public async Task The_settings_are_saved_normalised_and_come_back_with_the_profile()
    {
        var t = await SeedTrainingsAsync("set-save");

        var saved = await Json(await Save(t.Client, new
        {
            useSuggestion = false,
            overrides = new
            {
                educations = new Dictionary<string, string> { [t.Old.ToUpperInvariant()] = " FULL " },
                certificates = new Dictionary<string, string> { [t.Certificate] = "hidden" },
                hiddenSections = new[] { "Interests" },
            },
        }));

        Assert.False(saved.GetProperty("useSuggestion").GetBoolean());
        Assert.Equal("full", saved.GetProperty("overrides").GetProperty("educations").GetProperty(t.Old).GetString());
        Assert.Empty(saved.GetProperty("overrides").GetProperty("experiences").EnumerateObject());
        Assert.Equal(["interests"], saved.GetProperty("overrides").GetProperty("hiddenSections").EnumerateArray().Select(x => x.GetString()));
        var again = (await Json(await t.Client.GetAsync("/api/profile"))).GetProperty("cvContentSettings");
        Assert.Equal(saved.ToString(), again.ToString());

        // Everything optional: an empty body is "suggestion on, nothing overridden"
        var reset = await Json(await Save(t.Client, new { }));
        Assert.True(reset.GetProperty("useSuggestion").GetBoolean());
        Assert.Empty(reset.GetProperty("overrides").GetProperty("educations").EnumerateObject());
    }

    public static TheoryData<string, object> InvalidSettings => new()
    {
        { "overrides.educations", new { overrides = new { educations = new Dictionary<string, string> { [Guid.NewGuid().ToString()] = "weg" } } } },
        { "overrides.experiences", new { overrides = new { experiences = new Dictionary<string, string> { ["keine-id"] = "full" } } } },
        { "overrides.certificates", new { overrides = new { certificates = new Dictionary<string, string> { [Guid.NewGuid().ToString()] = "short" } } } },
        { "overrides.hiddenSections", new { overrides = new { hiddenSections = new[] { "experience" } } } },
        { "overrides.educations", new { overrides = new { educations = Enumerable.Range(0, CvSelectionRules.MaxEntriesPerGroup + 1).ToDictionary(_ => Guid.NewGuid().ToString(), _ => "full") } } },
    };

    [Theory]
    [MemberData(nameof(InvalidSettings))]
    public async Task Invalid_settings_are_refused_with_the_field_named_and_nothing_changes(string field, object body)
    {
        var t = await SeedTrainingsAsync("set-bad-" + Guid.NewGuid().ToString("N")[..8]);

        var response = await Save(t.Client, body);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.Equal("validation.failed", problem.GetProperty("code").GetString());
        Assert.True(problem.GetProperty("errors").TryGetProperty(field, out _), problem.ToString());
        Assert.True((await Json(await t.Client.GetAsync("/api/profile"))).GetProperty("cvContentSettings").GetProperty("useSuggestion").GetBoolean());
    }

    [Fact]
    public async Task Without_apply_selection_the_documents_show_the_whole_profile_with_apply_selection_what_is_still_relevant()
    {
        var t = await SeedTrainingsAsync("set-render");

        // Pdf and Word: the old training, its institution and the old certificate are in as before, when nothing is asked for
        foreach (var options in new object[] { new { }, new { applySelection = false } })
        {
            var pdf = await ExportPdfText(t.Client, options);
            Assert.Contains("ALTINSTITUT", pdf);
            Assert.Contains("ALTZERTIFIKAT", pdf);
            var word = await ExportDocxText(t.Client, options);
            Assert.Contains("ALTINSTITUT", word);
            Assert.Contains("ALTZERTIFIKAT", word);
        }

        var asked = new { applySelection = true };
        var selectedPdf = await ExportPdfText(t.Client, asked);
        Assert.DoesNotContain("ALTINSTITUT", selectedPdf);
        Assert.DoesNotContain("ALTZERTIFIKAT", selectedPdf);
        Assert.Contains("NEUINSTITUT", selectedPdf);
        Assert.Contains("STATIONFIRMA", selectedPdf);
        var selectedWord = await ExportDocxText(t.Client, asked);
        Assert.DoesNotContain("ALTINSTITUT", selectedWord);
        Assert.DoesNotContain("ALTZERTIFIKAT", selectedWord);
        Assert.Contains("NEUINSTITUT", selectedWord);

        // The master profile itself is untouched
        Assert.Equal(2, (await Json(await t.Client.GetAsync("/api/profile"))).GetProperty("educations").GetArrayLength());
    }

    [Fact]
    public async Task An_own_decision_to_keep_beats_the_suggestion_and_switching_the_suggestion_off_shows_everything()
    {
        var t = await SeedTrainingsAsync("set-override");
        await Save(t.Client, new { overrides = new { educations = new Dictionary<string, string> { [t.Old] = "full" } } });

        var kept = await ExportPdfText(t.Client, new { applySelection = true });
        // "full" beats "hidden" for the training; the certificate still follows the suggestion
        Assert.Contains("ALTINSTITUT", kept);
        Assert.DoesNotContain("ALTZERTIFIKAT", kept);

        await Save(t.Client, new { useSuggestion = false });
        var all = await ExportPdfText(t.Client, new { applySelection = true });
        Assert.Contains("ALTINSTITUT", all);
        Assert.Contains("ALTZERTIFIKAT", all);

        // Only the own decisions count when the suggestion is off
        await Save(t.Client, new { useSuggestion = false, overrides = new { educations = new Dictionary<string, string> { [t.Recent] = "hidden" }, hiddenSections = new[] { "skills" } } });
        var own = await ExportPdfText(t.Client, new { applySelection = true });
        Assert.DoesNotContain("NEUINSTITUT", own);
        Assert.Contains("ALTINSTITUT", own);
    }

    [Fact]
    public async Task Ids_that_do_not_belong_to_the_profile_change_no_document()
    {
        var t = await SeedTrainingsAsync("set-foreign");
        var other = await SeedTrainingsAsync("set-foreign-other");
        await Save(t.Client, new { overrides = new { educations = new Dictionary<string, string> { [other.Recent] = "hidden", [Guid.NewGuid().ToString()] = "hidden" }, experiences = new Dictionary<string, string> { [other.Station] = "hidden" } } });

        var text = await ExportPdfText(t.Client, new { applySelection = true });

        Assert.Contains("NEUINSTITUT", text);
        Assert.Contains("STATIONFIRMA", text);
    }

    [Fact]
    public async Task The_suggestion_reports_what_counts_and_the_own_decision_for_every_entry()
    {
        var t = await SeedTrainingsAsync("set-effective");
        await Save(t.Client, new { overrides = new { educations = new Dictionary<string, string> { [t.Old] = "full" }, certificates = new Dictionary<string, string> { [t.Certificate] = "full" } } });

        var json = await Json(await t.Client.GetAsync("/api/applications/content-suggestion"));
        JsonElement Entry(string group, string id) => json.GetProperty(group).EnumerateArray().Single(e => e.GetProperty("id").GetString() == id);

        var old = Entry("educations", t.Old);
        Assert.Equal("hidden", old.GetProperty("suggestion").GetString());
        Assert.Equal("full", old.GetProperty("override").GetString());
        Assert.Equal("full", old.GetProperty("effective").GetString());
        var recent = Entry("educations", t.Recent);
        Assert.Equal(JsonValueKind.Null, recent.GetProperty("override").ValueKind);
        Assert.Equal(recent.GetProperty("suggestion").GetString(), recent.GetProperty("effective").GetString());
        var certificate = Entry("certificates", t.Certificate);
        Assert.Equal(("hidden", "full", "full"), (certificate.GetProperty("suggestion").GetString(), certificate.GetProperty("override").GetString(), certificate.GetProperty("effective").GetString()));
        Assert.Equal(JsonValueKind.Null, Entry("experiences", t.Station).GetProperty("override").ValueKind);

        // A new application is pre-filled from this: the training that stays in stays in
        await Save(t.Client, new { useSuggestion = false });
        var off = await Json(await t.Client.GetAsync("/api/applications/content-suggestion"));
        Assert.All(off.GetProperty("educations").EnumerateArray(), e => Assert.Equal("full", e.GetProperty("effective").GetString()));
        Assert.Equal("hidden", off.GetProperty("educations").EnumerateArray().Single(e => e.GetProperty("id").GetString() == t.Old).GetProperty("suggestion").GetString());
    }

    [Fact]
    public async Task The_dossier_of_an_application_keeps_using_its_own_selection_not_the_profile_settings()
    {
        var t = await SeedTrainingsAsync("set-dossier");
        await Save(t.Client, new { overrides = new { educations = new Dictionary<string, string> { [t.Old] = "hidden" } } });
        var id = await NewApplication(t.Client);

        var text = await PreviewText(t.Client, id);

        Assert.Contains("ALTINSTITUT", text);
    }
}
