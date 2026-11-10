// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Cv.Server.Documents;
using Cv.Server.Errors;
using Cv.Server.Tests.Support;

namespace Cv.Server.Tests;

/// <summary>The JSON Resume import follows the rules of the profile forms and loses nothing of what an export contains.</summary>
public sealed class JsonResumeTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task Created(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync(Ct)}");
    }

    private async Task<TestClient> NewUser(string name)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, name);
        return user;
    }

    /// <summary>Fills every field the profile has - including the ones JSON Resume has no place for.</summary>
    private static async Task FillCompletely(TestClient user)
    {
        await Created(await user.PutAsync("/api/profile", new
        {
            firstName = "Anna Maria",
            lastName = "von Beispiel",
            academicTitle = "Dr.",
            professionalTitle = "Architektin",
            email = "anna@example.org",
            phone = "+49 170 1234567",
            street = "Musterstraße 42",
            postalCode = "10115",
            city = "Berlin",
            country = "Deutschland",
            dateOfBirth = "1990-05-14",
            placeOfBirth = "Hamburg",
            nationality = "Deutsch",
            maritalStatus = "Ledig",
            website = "https://anna.example.org",
            linkedIn = "https://linkedin.com/in/anna",
            gitHub = "https://github.com/anna",
            xing = "https://xing.com/profile/anna",
            bio = "Erste Zeile\nZweite Zeile",
        }));
        await Created(await user.PostAsync("/api/profile/experiences", new
        {
            jobTitle = "Lead", employer = "TechCorp", employmentType = "Vollzeit", city = "Köln", country = "Deutschland",
            startDate = "2022-01", isCurrent = true, description = "Leitung\nCloud-Migration", sortOrder = 0,
        }));
        await Created(await user.PostAsync("/api/profile/experiences", new
        {
            jobTitle = "Entwicklerin", employer = "InnoSystems", startDate = "2018-03", endDate = "2021-12", isCurrent = false, sortOrder = 1,
        }));
        await Created(await user.PostAsync("/api/profile/educations", new
        {
            degree = "M.Sc.", fieldOfStudy = "Informatik", institution = "TU Berlin", city = "Berlin", country = "Deutschland",
            startDate = "2015-10", endDate = "2017-09", isCurrent = false, grade = "1,3", description = "Schwerpunkt Datenbanken\n\nund verteilte Systeme", sortOrder = 0,
        }));
        await Created(await user.PostAsync("/api/profile/educations", new
        {
            degree = "Promotion", institution = "Uni", startDate = "2018-01", isCurrent = false, sortOrder = 1,
        }));
        await Created(await user.PostAsync("/api/profile/skills", new { name = "Rust", category = "Backend", level = 4, sortOrder = 0 }));
        await Created(await user.PostAsync("/api/profile/skills", new { name = "Go", level = 0, sortOrder = 1 }));
        await Created(await user.PostAsync("/api/profile/skills", new { name = "SQL", category = "Daten", level = 1, sortOrder = 2 }));
        await Created(await user.PostAsync("/api/profile/languages", new { language = "Deutsch", level = "Muttersprache", sortOrder = 0 }));
        await Created(await user.PostAsync("/api/profile/certificates", new
        {
            title = "AWS Architect", issuer = "Amazon", issueDate = "2023-04", expiryDate = "2026-04",
            credentialUrl = "https://aws.example.org/c/1", credentialId = "AWS-12345", sortOrder = 0,
        }));
        await Created(await user.PostAsync("/api/profile/interests", new { name = "Klettern", category = "Sport", description = "Bouldern und Seil", sortOrder = 0 }));
        await Created(await user.PostAsync("/api/profile/interests", new { name = "Lesen", sortOrder = 1 }));
        var section = await (await user.PostAsync("/api/profile/custom-sections", new { title = "Auszeichnungen", sortOrder = 0 })).JsonAsync();
        var sectionId = section.GetProperty("id").GetString();
        await Created(await user.PostAsync($"/api/profile/custom-sections/{sectionId}/items", new
        {
            title = "Best Paper", subtitle = "Konferenz", dateRange = "2021", description = "Für Container-Sicherheit.\nZweite Zeile", sortOrder = 0,
        }));
    }

    private static async Task<JsonNode> Export(TestClient user) =>
        JsonNode.Parse(await (await user.GetAsync("/api/profile/json-resume")).Content.ReadAsStringAsync(Ct))!;

    [Fact]
    public async Task An_export_read_back_in_gives_the_same_export()
    {
        var source = await NewUser("resume-source");
        await FillCompletely(source);
        var exported = await Export(source);

        var target = await NewUser("resume-target");
        var import = await target.PostAsync("/api/profile/json-resume/import?replace=true", exported);
        Assert.Equal(HttpStatusCode.OK, import.StatusCode);
        var again = await Export(target);

        Assert.True(JsonNode.DeepEquals(exported, again), $"first:\n{exported.ToJsonString()}\nsecond:\n{again.ToJsonString()}");
    }

    [Fact]
    public async Task An_export_keeps_every_field_of_the_profile()
    {
        var user = await NewUser("resume-fields");
        await FillCompletely(user);

        var resume = await Export(user);

        var basics = resume["basics"]!;
        Assert.Equal("Anna Maria", (string?)basics["x-firstName"]);
        Assert.Equal("von Beispiel", (string?)basics["x-lastName"]);
        Assert.Equal("Dr.", (string?)basics["x-academicTitle"]);
        Assert.Equal("1990-05-14", (string?)basics["x-dateOfBirth"]);
        Assert.Equal("Hamburg", (string?)basics["x-placeOfBirth"]);
        Assert.Equal("Deutsch", (string?)basics["x-nationality"]);
        Assert.Equal("Ledig", (string?)basics["x-maritalStatus"]);
        Assert.Equal(3, basics["profiles"]!.AsArray().Count);

        var work = resume["work"]![0]!;
        Assert.Equal("Vollzeit", (string?)work["x-employmentType"]);
        Assert.Equal("Köln", (string?)work["location"]);
        Assert.Equal("Deutschland", (string?)work["x-country"]);
        Assert.True((bool)work["x-isCurrent"]!);

        Assert.Equal("Schwerpunkt Datenbanken\n\nund verteilte Systeme", (string?)resume["education"]![0]!["x-description"]);
        Assert.Equal(4, (int)resume["skills"]![0]!["x-level"]!);
        Assert.Equal(0, (int)resume["skills"]![1]!["x-level"]!);
        Assert.Equal("AWS-12345", (string?)resume["certificates"]![0]!["x-credentialId"]);
        Assert.Equal("2026-04", (string?)resume["certificates"]![0]!["x-expiryDate"]);
        Assert.Equal("https://aws.example.org/c/1", (string?)resume["certificates"]![0]!["url"]);
        Assert.Equal("Bouldern und Seil", (string?)resume["interests"]![0]!["x-description"]);
        Assert.Equal("Best Paper", (string?)resume["meta"]!["x-customSections"]![0]!["items"]![0]!["title"]);
        // The standard only allows extra properties below the root, and its own place for tool data is "meta"
        Assert.Null(resume["x-customSections"]);
    }

    [Fact]
    public async Task A_name_with_several_parts_comes_back_as_it_was()
    {
        var source = await NewUser("resume-name-source");
        await FillCompletely(source);
        var target = await NewUser("resume-name-target");

        await Created(await target.PostAsync("/api/profile/json-resume/import", await Export(source)));
        var profile = await (await target.GetAsync("/api/profile")).JsonAsync();

        Assert.Equal("Anna Maria", profile.GetProperty("firstName").GetString());
        Assert.Equal("von Beispiel", profile.GetProperty("lastName").GetString());
        Assert.Equal("Dr.", profile.GetProperty("academicTitle").GetString());
        Assert.Equal("1990-05-14", profile.GetProperty("dateOfBirth").GetString());
    }

    [Fact]
    public async Task An_entry_that_the_forms_would_refuse_is_refused_with_the_name_of_the_files_field()
    {
        var user = await NewUser("resume-rules");

        var response = await user.PostAsync("/api/profile/json-resume/import", new
        {
            basics = new { name = "Max Mustermann" },
            work = new object[]
            {
                new { name = "Firma", position = "Chef", startDate = "2020-01" },
                new { name = "Ohne Position", startDate = "2020-01" },
                new { position = "Ohne Firma", startDate = "2020-01" },
                new { name = "Ohne Start", position = "Chef" },
                new { name = new string('x', 129), position = "Chef", startDate = "2020-01" },
            },
            education = new object[] { new { institution = "Uni" } },
            languages = new object[] { new { language = "Deutsch" } },
            skills = new object[] { new { name = "Rust", extra = 1, level = "Expert" } },
            certificates = new object[] { new { name = "Zertifikat", url = "javascript:alert(1)" } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var errors = (await response.JsonAsync()).GetProperty("errors");
        string Code(string field) => errors.GetProperty(field)[0].GetProperty("code").GetString()!;
        Assert.Equal("validation.required", Code("work[1].position"));
        Assert.Equal("validation.required", Code("work[2].name"));
        Assert.Equal("validation.required", Code("work[3].startDate"));
        Assert.Equal("validation.max_length", Code("work[4].name"));
        Assert.Equal("validation.required", Code("education[0].studyType"));
        // An education needs a beginning or an end: with neither, the files own field is named with the period code
        Assert.Equal("validation.period_required", Code("education[0].startDate"));
        Assert.Equal("validation.required", Code("languages[0].fluency"));
        Assert.Equal("validation.url", Code("certificates[0].url"));
        Assert.False(errors.TryGetProperty("work[0].position", out _));
        Assert.False(errors.TryGetProperty("skills[0].name", out _));
    }

    [Fact]
    public async Task A_refused_import_changes_nothing()
    {
        var user = await NewUser("resume-atomic");
        await Created(await user.PostAsync("/api/profile/skills", new { name = "Bleibt", level = 2, sortOrder = 0 }));

        var response = await user.PostAsync("/api/profile/json-resume/import?replace=true", new
        {
            basics = new { name = "Neuer Name" },
            skills = new object[] { new { name = "Neu" } },
            languages = new object[] { new { language = "Deutsch" } },
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var profile = await (await user.GetAsync("/api/profile")).JsonAsync();
        Assert.NotEqual("Neuer", profile.GetProperty("firstName").GetString());
        Assert.Equal("Bleibt", Assert.Single(profile.GetProperty("skills").EnumerateArray()).GetProperty("name").GetString());
    }

    [Fact]
    public async Task Text_from_a_file_is_trimmed_and_free_of_control_characters()
    {
        var user = await NewUser("resume-clean");

        await Created(await user.PostAsync("/api/profile/json-resume/import", new
        {
            basics = new { name = "  Max\u0001   Mustermann  ", summary = "Hallo\u0007 Welt" },
            work = new object[] { new { name = " Firma ", position = "Chef\u0000", startDate = " 2020-01 ", summary = "Zeile\u0001 eins", highlights = new[] { "Punkt", "  ", "Zwei" } } },
        }));
        var profile = await (await user.GetAsync("/api/profile")).JsonAsync();

        Assert.Equal("Max", profile.GetProperty("firstName").GetString());
        Assert.Equal("Mustermann", profile.GetProperty("lastName").GetString());
        Assert.Equal("Hallo Welt", profile.GetProperty("bio").GetString());
        var job = Assert.Single(profile.GetProperty("experiences").EnumerateArray());
        Assert.Equal("Firma", job.GetProperty("employer").GetString());
        Assert.Equal("Chef", job.GetProperty("jobTitle").GetString());
        Assert.Equal("2020-01", job.GetProperty("startDate").GetString());
        Assert.Equal("Zeile eins\nPunkt\nZwei", job.GetProperty("description").GetString());
    }

    [Fact]
    public async Task Skill_levels_from_other_tools_are_mapped_and_unknown_ones_count_as_not_rated()
    {
        var user = await NewUser("resume-levels");

        await Created(await user.PostAsync("/api/profile/json-resume/import", new
        {
            basics = new { name = "Max Mustermann" },
            skills = new object[]
            {
                new { name = "A", level = "Master" },
                new { name = "B", level = "expert" },
                new { name = "C", level = "Fluent" },
                new { name = "D" },
                new { name = "E", level = "Beginner", keywords = new[] { "Kat", "Zwei" } },
            },
        }));
        var skills = (await (await user.GetAsync("/api/profile")).JsonAsync()).GetProperty("skills").EnumerateArray().ToList();

        Assert.Equal([5, 4, 0, 0, 1], skills.Select(s => s.GetProperty("level").GetInt32()));
        Assert.Equal("Kat", skills[4].GetProperty("category").GetString());
        Assert.Equal(JsonValueKind.Null, skills[0].GetProperty("category").ValueKind);
    }

    [Fact]
    public async Task A_level_outside_the_range_is_refused()
    {
        var user = await NewUser("resume-bad-level");

        var response = await user.PostAsync("/api/profile/json-resume/import", new { skills = new object[] { new Dictionary<string, object> { ["name"] = "Rust", ["x-level"] = 9 } } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation.range", (await response.JsonAsync()).GetProperty("errors").GetProperty("skills[0].x-level")[0].GetProperty("code").GetString());
    }

    [Fact]
    public async Task Replacing_with_a_file_from_another_tool_keeps_the_own_sections()
    {
        var user = await NewUser("resume-keep-sections");
        await FillCompletely(user);

        await Created(await user.PostAsync("/api/profile/json-resume/import?replace=true", new { basics = new { name = "Anna Beispiel" }, work = new object[] { new { name = "Neu", position = "Chefin", startDate = "2024-01" } } }));
        var profile = await (await user.GetAsync("/api/profile")).JsonAsync();

        Assert.Single(profile.GetProperty("experiences").EnumerateArray());
        Assert.Single(profile.GetProperty("customSections").EnumerateArray());
        Assert.Empty(profile.GetProperty("skills").EnumerateArray());
    }

    [Fact]
    public async Task Replacing_with_an_own_export_replaces_the_sections_too()
    {
        var user = await NewUser("resume-replace-sections");
        await FillCompletely(user);
        var export = await Export(user);
        export["meta"]!["x-customSections"] = JsonNode.Parse("""[{"title":"Andere","items":[{"title":"Eins"}]}]""");

        await Created(await user.PostAsync("/api/profile/json-resume/import?replace=true", export));
        var sections = (await (await user.GetAsync("/api/profile")).JsonAsync()).GetProperty("customSections").EnumerateArray().ToList();

        Assert.Equal("Andere", Assert.Single(sections).GetProperty("title").GetString());
    }

    [Fact]
    public async Task Too_many_entries_are_refused()
    {
        var user = await NewUser("resume-count");

        var response = await user.PostAsync("/api/profile/json-resume/import", new { work = Enumerable.Range(0, 201).Select(i => new { name = "F", position = "P", startDate = "2020" }).ToArray() });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("validation.max_items", (await response.JsonAsync()).GetProperty("errors").GetProperty("work")[0].GetProperty("code").GetString());
    }

    [Fact]
    public void The_converter_and_the_forms_share_their_rules()
    {
        // The import checks its entries with the very same methods the form endpoints call
        var errors = new FieldErrors();
        var resume = new JsonResumeDto { Work = [new JsonResumeWork { Name = "F", Position = new string('p', 129), StartDate = "2020" }] };

        JsonResumeValidator.Validate(errors, resume);

        Assert.True(errors.Any);
        Assert.Throws<ApiException>(errors.ThrowIfAny);
    }
}
