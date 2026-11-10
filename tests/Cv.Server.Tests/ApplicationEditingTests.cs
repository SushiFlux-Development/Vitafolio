// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Cv.Server.Data;
using Cv.Server.Tests.Support;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace Cv.Server.Tests;

/// <summary>
/// Editing an application after it was created (fields, follow-up date, cover letter), the dossier preview that shows the filed version, and the
/// fold and punch marks saved per cover letter.
/// </summary>
public sealed class ApplicationEditingTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static readonly object Credentials = new { password = ServerFixture.AdminPassword };

    private async Task<TestClient> NewUser(string name)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, name);
        await user.PutAsync("/api/profile", new { firstName = "Erika", lastName = "Muster", email = "erika@example.org" });
        return user;
    }

    private static async Task<JsonElement> Json(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        Assert.True(response.StatusCode == expected, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync(Ct)}");
        return await response.JsonAsync();
    }

    private static async Task<(string Field, string Code)> FirstFieldError(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = await response.JsonAsync();
        Assert.Equal("validation.failed", json.GetProperty("code").GetString());
        var first = json.GetProperty("errors").EnumerateObject().First();
        return (first.Name, first.Value[0].GetProperty("code").GetString()!);
    }

    private static object Letter(string title = "T", bool? includeFoldMarks = null) =>
        new { title, recipientCompany = "Acme", recipientCity = "Berlin", subject = "Bewerbung", salutation = "Guten Tag,", body = "Text des Anschreibens.", includeFoldMarks };

    private static async Task<string> CreateLetter(TestClient user, string title = "T", bool? includeFoldMarks = null) =>
        (await Json(await user.PostAsync("/api/cover-letters", Letter(title, includeFoldMarks)), HttpStatusCode.Created)).GetProperty("id").GetString()!;

    private static async Task<string> CreateApplication(TestClient user, object body) =>
        (await Json(await user.PostAsync("/api/applications", body), HttpStatusCode.Created)).GetProperty("id").GetString()!;

    private static object Edit(string? company = "Firma", string? status = null, object? followUpAt = null, string? coverLetterId = null, object? appliedAt = null) =>
        new { jobTitle = "Lead", company, status, followUpAt, coverLetterId, appliedAt };

    // ---------- points 1 and 2: editing and the follow-up date ----------

    [Fact]
    public async Task A_follow_up_date_can_be_set_changed_and_cleared_and_drives_the_due_flag()
    {
        var user = await NewUser("followup-edit");
        var sent = DateTime.UtcNow.AddDays(-3);
        var id = await CreateApplication(user, new { jobTitle = "Lead", company = "Firma", status = "applied", appliedAt = sent });
        Assert.False((await Json(await user.GetAsync($"/api/applications/{id}"))).GetProperty("isFollowUpDue").GetBoolean());

        // A date in the past is due at once, even though only three days have passed since sending
        var due = await Json(await user.PutAsync($"/api/applications/{id}", Edit(status: "applied", followUpAt: DateTime.UtcNow.AddDays(-1), appliedAt: sent)));
        Assert.True(due.GetProperty("isFollowUpDue").GetBoolean());
        Assert.Equal(1, (await Json(await user.GetAsync("/api/applications/stats"))).GetProperty("followUpsDue").GetInt32());

        // A date in the future is not
        var later = await Json(await user.PutAsync($"/api/applications/{id}", Edit(status: "applied", followUpAt: DateTime.UtcNow.AddDays(30), appliedAt: sent)));
        Assert.False(later.GetProperty("isFollowUpDue").GetBoolean());
        Assert.Equal(0, (await Json(await user.GetAsync("/api/applications/stats"))).GetProperty("followUpsDue").GetInt32());

        // Leaving it out clears it: the 14-day rule applies again, and the list shows the same state as the detail view
        var cleared = await Json(await user.PutAsync($"/api/applications/{id}", Edit(status: "applied", appliedAt: sent)));
        Assert.Equal(JsonValueKind.Null, cleared.GetProperty("followUpAt").ValueKind);
        Assert.False(cleared.GetProperty("isFollowUpDue").GetBoolean());
        var listed = (await Json(await user.GetAsync("/api/applications"))).EnumerateArray().Single(a => a.GetProperty("id").GetString() == id);
        Assert.Equal(JsonValueKind.Null, listed.GetProperty("followUpAt").ValueKind);
        Assert.False(listed.GetProperty("isFollowUpDue").GetBoolean());

        // Cleared in a sent application that is older than 14 days: due by the default rule
        var old = await CreateApplication(user, new { jobTitle = "Alt", company = "Firma", status = "applied", appliedAt = DateTime.UtcNow.AddDays(-20), followUpAt = DateTime.UtcNow.AddDays(30) });
        Assert.False((await Json(await user.GetAsync($"/api/applications/{old}"))).GetProperty("isFollowUpDue").GetBoolean());
        var back = await Json(await user.PutAsync($"/api/applications/{old}", Edit(status: "applied", appliedAt: DateTime.UtcNow.AddDays(-20))));
        Assert.True(back.GetProperty("isFollowUpDue").GetBoolean());
    }

    [Fact]
    public async Task A_follow_up_date_is_stored_and_answered_as_utc_whatever_zone_it_was_sent_in()
    {
        var user = await NewUser("followup-zone");
        var id = await CreateApplication(user, new { jobTitle = "Lead", company = "Firma" });

        var withOffset = await Json(await user.PutAsync($"/api/applications/{id}", Edit(followUpAt: "2027-03-01T00:30:00+02:00")));
        Assert.Equal("2027-02-28T22:30:00Z", withOffset.GetProperty("followUpAt").GetString());
        Assert.Equal("2027-02-28T22:30:00Z", (await Json(await user.GetAsync($"/api/applications/{id}"))).GetProperty("followUpAt").GetString());

        // A date without a time or zone (what a date field sends) must not come back in another notation than a later read
        var dateOnly = await Json(await user.PutAsync($"/api/applications/{id}", Edit(followUpAt: "2027-06-15")));
        var answered = dateOnly.GetProperty("followUpAt").GetString()!;
        Assert.EndsWith("Z", answered);
        Assert.Equal(answered, (await Json(await user.GetAsync($"/api/applications/{id}"))).GetProperty("followUpAt").GetString());
    }

    [Theory]
    [InlineData("1999-12-31T00:00:00Z")]
    [InlineData("2101-01-01T00:00:00Z")]
    public async Task An_implausible_follow_up_date_is_refused_with_the_field_named(string value)
    {
        var user = await NewUser("followup-range-" + value[..4]);
        var id = await CreateApplication(user, new { jobTitle = "Lead", company = "Firma" });

        var (field, code) = await FirstFieldError(await user.PutAsync($"/api/applications/{id}", Edit(followUpAt: value)));

        Assert.Equal("followUpAt", field);
        Assert.Equal("validation.invalid_value", code);
        Assert.Equal(HttpStatusCode.BadRequest, (await user.PostAsync("/api/applications", new { jobTitle = "Lead", company = "Firma", followUpAt = value })).StatusCode);
    }

    [Fact]
    public void The_follow_up_rule_is_the_same_for_every_caller()
    {
        var now = new DateTime(2026, 11, 8, 12, 0, 0, DateTimeKind.Utc);

        Assert.True(FollowUp.IsDue(ApplicationStatuses.Applied, now.AddDays(-14), null, now));
        Assert.False(FollowUp.IsDue(ApplicationStatuses.Applied, now.AddDays(-13), null, now));
        Assert.True(FollowUp.IsDue(ApplicationStatuses.Applied, now.AddDays(-1), now.AddMinutes(-1), now));
        Assert.False(FollowUp.IsDue(ApplicationStatuses.Applied, now.AddDays(-40), now.AddDays(1), now));
        Assert.False(FollowUp.IsDue(ApplicationStatuses.Applied, null, null, now));
        // Only a sent application can be due
        Assert.False(FollowUp.IsDue(ApplicationStatuses.Draft, now.AddDays(-40), now.AddDays(-1), now));
        Assert.False(FollowUp.IsDue(ApplicationStatuses.Interview, now.AddDays(-40), null, now));
    }

    [Fact]
    public async Task All_editable_fields_are_taken_over_and_come_back_trimmed()
    {
        var user = await NewUser("edit-all");
        var id = await CreateApplication(user, new { jobTitle = "Lead", company = "Firma" });

        var saved = await Json(await user.PutAsync($"/api/applications/{id}", new
        {
            jobTitle = "  Teamleitung  ",
            company = " Neue Firma ",
            location = " Köln ",
            contactPerson = "Frau Beispiel",
            contactEmail = " jobs@firma.example ",
            contactPhone = "+49 221 1234",
            jobPostingUrl = "https://firma.example/jobs/1",
            jobDescription = "Beschreibung",
            salaryExpectation = "70.000 EUR",
            notes = "Notiz",
            cvDesign = "Modern",
            cvLanguage = "EN",
            cvPhotoShape = "round",
            cvShowPhoto = false,
            includeCoverSheet = false,
            followUpAt = "2027-01-10T08:00:00Z",
        }));

        Assert.Equal("Teamleitung", saved.GetProperty("jobTitle").GetString());
        Assert.Equal("Neue Firma", saved.GetProperty("company").GetString());
        Assert.Equal("Köln", saved.GetProperty("location").GetString());
        Assert.Equal("jobs@firma.example", saved.GetProperty("contactEmail").GetString());
        Assert.Equal("modern", saved.GetProperty("cvDesign").GetString());
        Assert.Equal("en", saved.GetProperty("cvLanguage").GetString());
        Assert.Equal("round", saved.GetProperty("cvPhotoShape").GetString());
        Assert.False(saved.GetProperty("cvShowPhoto").GetBoolean());
        Assert.False(saved.GetProperty("includeCoverSheet").GetBoolean());
        Assert.Equal("2027-01-10T08:00:00Z", saved.GetProperty("followUpAt").GetString());
        var reread = await Json(await user.GetAsync($"/api/applications/{id}"));
        Assert.Equal("Teamleitung", reread.GetProperty("jobTitle").GetString());
        Assert.Equal("70.000 EUR", reread.GetProperty("salaryExpectation").GetString());
    }

    [Fact]
    public async Task Values_the_server_cannot_use_are_refused_instead_of_being_stored()
    {
        var user = await NewUser("edit-invalid");
        var id = await CreateApplication(user, new { jobTitle = "Lead", company = "Firma" });

        // A title of blanks is empty: before, it passed the check and was stored as an empty title
        Assert.Equal(("jobTitle", "validation.required"), await FirstFieldError(await user.PutAsync($"/api/applications/{id}", new { jobTitle = "   ", company = "Firma" })));
        Assert.Equal(("company", "validation.required"), await FirstFieldError(await user.PostAsync("/api/applications", new { jobTitle = "Lead", company = "  " })));
        Assert.Equal(("status", "validation.one_of"), await FirstFieldError(await user.PutAsync($"/api/applications/{id}", Edit(status: "geheim"))));
        Assert.Equal(("cvDesign", "validation.one_of"), await FirstFieldError(await user.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", cvDesign = "bunt" })));
        Assert.Equal(("cvLanguage", "validation.one_of"), await FirstFieldError(await user.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", cvLanguage = "fr" })));
        Assert.Equal(("cvPhotoShape", "validation.one_of"), await FirstFieldError(await user.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", cvPhotoShape = "stern" })));
        Assert.Equal(("contactEmail", "validation.pattern"), await FirstFieldError(await user.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", contactEmail = "keine-adresse" })));
        Assert.Equal(("jobPostingUrl", "validation.url"), await FirstFieldError(await user.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", jobPostingUrl = "javascript:alert(1)" })));
        Assert.Equal(("notes", "validation.max_length"), await FirstFieldError(await user.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", notes = new string('x', 16385) })));

        // Nothing of the refused requests was stored
        var unchanged = await Json(await user.GetAsync($"/api/applications/{id}"));
        Assert.Equal("Lead", unchanged.GetProperty("jobTitle").GetString());
        Assert.Equal("draft", unchanged.GetProperty("status").GetString());
        Assert.Equal("classic", unchanged.GetProperty("cvDesign").GetString());
    }

    [Fact]
    public async Task A_cover_letter_can_be_chosen_replaced_and_removed_but_only_the_own_one()
    {
        var admin = await server.AdminAsync();
        var (owner, _) = await server.UserAsync(admin, "letter-owner");
        var (other, _) = await server.UserAsync(admin, "letter-other");
        var first = await CreateLetter(owner, "Erster Brief");
        var second = await CreateLetter(owner, "Zweiter Brief");
        var foreign = await CreateLetter(other, "Fremder Brief");
        var id = await CreateApplication(owner, new { jobTitle = "Lead", company = "Firma", coverLetterId = first });
        Assert.Equal("Erster Brief", (await Json(await owner.GetAsync($"/api/applications/{id}"))).GetProperty("coverLetterTitle").GetString());

        // Replaced: the answer already names the new letter, not the old one
        var replaced = await Json(await owner.PutAsync($"/api/applications/{id}", Edit(coverLetterId: second)));
        Assert.Equal(second, replaced.GetProperty("coverLetterId").GetString());
        Assert.Equal("Zweiter Brief", replaced.GetProperty("coverLetterTitle").GetString());
        Assert.Equal("Zweiter Brief", (await Json(await owner.GetAsync($"/api/applications/{id}"))).GetProperty("coverLetterTitle").GetString());

        // Somebody else's letter is refused on create and on edit, whatever the application pointed at before
        var onEdit = await owner.PutAsync($"/api/applications/{id}", Edit(coverLetterId: foreign));
        Assert.Equal(HttpStatusCode.BadRequest, onEdit.StatusCode);
        Assert.Equal("coverLetter.not_found", await onEdit.CodeAsync());
        var onCreate = await owner.PostAsync("/api/applications", new { jobTitle = "Lead", company = "Firma", coverLetterId = foreign });
        Assert.Equal("coverLetter.not_found", await onCreate.CodeAsync());
        Assert.Equal("coverLetter.not_found", await (await owner.PutAsync($"/api/applications/{id}", Edit(coverLetterId: Guid.NewGuid().ToString()))).CodeAsync());
        Assert.Equal(second, (await Json(await owner.GetAsync($"/api/applications/{id}"))).GetProperty("coverLetterId").GetString());

        // Removed
        var removed = await Json(await owner.PutAsync($"/api/applications/{id}", Edit()));
        Assert.Equal(JsonValueKind.Null, removed.GetProperty("coverLetterId").ValueKind);
        Assert.Equal(JsonValueKind.Null, removed.GetProperty("coverLetterTitle").ValueKind);
    }

    [Fact]
    public async Task Only_own_attachments_can_go_into_a_dossier_and_each_only_once()
    {
        var admin = await server.AdminAsync();
        var (owner, _) = await server.UserAsync(admin, "attach-owner");
        var (other, _) = await server.UserAsync(admin, "attach-other");
        var mine = await UploadPdf(owner);
        var theirs = await UploadPdf(other);
        var id = await CreateApplication(owner, new { jobTitle = "Lead", company = "Firma" });

        var refused = await owner.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", attachmentIds = new[] { mine, theirs } });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        Assert.Equal("attachment.not_found", await refused.CodeAsync());
        Assert.Equal(("attachmentIds", "validation.duplicates"), await FirstFieldError(await owner.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", attachmentIds = new[] { mine, mine } })));
        Assert.Empty((await Json(await owner.GetAsync($"/api/applications/{id}"))).GetProperty("attachmentIds").EnumerateArray());

        var saved = await Json(await owner.PutAsync($"/api/applications/{id}", new { jobTitle = "Lead", company = "Firma", attachmentIds = new[] { mine } }));
        Assert.Equal(mine, Assert.Single(saved.GetProperty("attachmentIds").EnumerateArray()).GetString());
    }

    private static async Task<string> UploadPdf(TestClient client)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(DocumentSamples.Pdf());
        file.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
        form.Add(file, "file", "zeugnis.pdf");
        var response = await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/attachments") { Content = form });
        return (await Json(response, HttpStatusCode.Created)).GetProperty("id").GetString()!;
    }

    [Fact]
    public async Task Another_users_application_cannot_be_edited_with_a_follow_up_date()
    {
        var admin = await server.AdminAsync();
        var (owner, _) = await server.UserAsync(admin, "edit-iso-owner");
        var (other, _) = await server.UserAsync(admin, "edit-iso-other");
        var id = await CreateApplication(owner, new { jobTitle = "Lead", company = "Firma" });

        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsync($"/api/applications/{id}", Edit(followUpAt: "2027-01-01T00:00:00Z"))).StatusCode);
        Assert.Equal(JsonValueKind.Null, (await Json(await owner.GetAsync($"/api/applications/{id}"))).GetProperty("followUpAt").ValueKind);
    }

    // ---------- point 3: the dossier preview shows the filed version ----------

    private const string SourceHeader = "X-Dossier-Source";

    private static string? Source(HttpResponseMessage response) =>
        response.Headers.TryGetValues(SourceHeader, out var values) ? values.Single() : null;

    private static async Task<byte[]> Bytes(HttpResponseMessage response)
    {
        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync(Ct)}");
        return await response.Content.ReadAsByteArrayAsync(Ct);
    }

    private string[] SnapshotFiles(string userId) =>
        Directory.GetFiles(Path.Combine(server.DataDir, "applications"), Guid.Parse(userId).ToString("D") + "*");

    [Fact]
    public async Task The_preview_of_a_sent_application_is_the_filed_version_and_says_so()
    {
        var user = await NewUser("preview-filed");
        var id = await CreateApplication(user, new { jobTitle = "Lead", company = "Alte Firma", status = "applied" });
        // Edited after sending: the current state differs from what was filed
        await Json(await user.PutAsync($"/api/applications/{id}", Edit(company: "Neue Firma", status: "applied")));

        var preview = await user.GetAsync($"/api/applications/{id}/dossier/preview");
        var previewBytes = await Bytes(preview);

        Assert.Equal("application/pdf", preview.Content.Headers.ContentType?.MediaType);
        Assert.NotEqual("attachment", preview.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal("archived", Source(preview));
        var text = PdfText.All(previewBytes);
        Assert.Contains("Alte Firma", text);
        Assert.DoesNotContain("Neue Firma", text);
        // It is exactly the filed file, the same bytes the download hands out
        Assert.Equal(await Bytes(await user.GetAsync($"/api/applications/{id}/dossier/download")), previewBytes);

        // The live state can be asked for on purpose, and is marked as such
        var current = await user.GetAsync($"/api/applications/{id}/dossier/preview?version=current");
        var currentText = PdfText.All(await Bytes(current));
        Assert.Equal("current", Source(current));
        Assert.Contains("Neue Firma", currentText);
        Assert.DoesNotContain("Alte Firma", currentText);
    }

    [Fact]
    public async Task Without_a_filed_version_the_preview_shows_the_current_state_and_says_so()
    {
        var user = await NewUser("preview-draft");
        var id = await CreateApplication(user, new { jobTitle = "Lead", company = "Entwurf GmbH" });

        var preview = await user.GetAsync($"/api/applications/{id}/dossier/preview");

        Assert.Equal("current", Source(preview));
        Assert.Contains("Entwurf GmbH", PdfText.All(await Bytes(preview)));
        // Asking for the automatic choice by name is the same as asking for nothing
        Assert.Equal("current", Source(await user.GetAsync($"/api/applications/{id}/dossier/preview?version=auto")));
    }

    [Fact]
    public async Task A_filed_version_whose_file_is_gone_is_reported_in_the_preview_too()
    {
        var admin = await server.AdminAsync();
        var (user, userId) = await server.UserAsync(admin, "preview-lost");
        var id = await CreateApplication(user, new { jobTitle = "Lead", company = "Firma", status = "applied" });
        File.Delete(Assert.Single(SnapshotFiles(userId)));

        var preview = await user.GetAsync($"/api/applications/{id}/dossier/preview");

        // The same answer as the download: the filed version is lost, and nothing else is shown in its place without saying so
        Assert.Equal(HttpStatusCode.Conflict, preview.StatusCode);
        Assert.Equal("archive.missing", await preview.CodeAsync());
        Assert.Null(Source(preview));
        Assert.Equal("archive.missing", await (await user.GetAsync($"/api/applications/{id}/dossier/download")).CodeAsync());
        // The current state stays reachable on purpose
        Assert.Equal("current", Source(await user.GetAsync($"/api/applications/{id}/dossier/preview?version=current")));
    }

    [Fact]
    public async Task The_preview_refuses_an_unknown_version_and_a_foreign_application()
    {
        var admin = await server.AdminAsync();
        var (owner, _) = await server.UserAsync(admin, "preview-iso-owner");
        var (other, _) = await server.UserAsync(admin, "preview-iso-other");
        var id = await CreateApplication(owner, new { jobTitle = "Lead", company = "Firma", status = "applied" });

        Assert.Equal(("version", "validation.one_of"), await FirstFieldError(await owner.GetAsync($"/api/applications/{id}/dossier/preview?version=old")));
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/applications/{id}/dossier/preview")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync($"/api/applications/{id}/dossier/preview?version=current")).StatusCode);
    }

    [Fact]
    public async Task A_path_outside_the_applications_folder_is_not_read_by_the_preview()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "preview-hostile");
        var id = await CreateApplication(user, new { jobTitle = "Lead", company = "Firma", status = "applied" });
        var outside = Path.Combine(server.DataDir, "app-marker.txt");
        await File.WriteAllTextAsync(outside, "geheim", Ct);
        using (var connection = new SqliteConnection($"Data Source={Path.Combine(server.DataDir, "app.db")};Pooling=False"))
        {
            connection.Open();
            using var command = connection.CreateCommand();
            command.CommandText = $"UPDATE applications SET \"ArchivedPdfPath\" = '../app-marker.txt' WHERE \"Id\" = '{id}' COLLATE NOCASE";
            Assert.Equal(1, command.ExecuteNonQuery());
        }

        var preview = await user.GetAsync($"/api/applications/{id}/dossier/preview");

        Assert.Equal(HttpStatusCode.Conflict, preview.StatusCode);
        Assert.Equal("archive.missing", await preview.CodeAsync());
        Assert.DoesNotContain("geheim", await preview.Content.ReadAsStringAsync(Ct));
    }

    // ---------- point 6: fold and punch marks are saved per letter ----------

    [Fact]
    public async Task Fold_marks_are_saved_with_the_letter_and_only_a_request_that_names_them_changes_them()
    {
        var user = await NewUser("marks-save");

        var created = await Json(await user.PostAsync("/api/cover-letters", Letter("Standard")), HttpStatusCode.Created);
        Assert.True(created.GetProperty("includeFoldMarks").GetBoolean());
        var id = created.GetProperty("id").GetString();
        var off = await CreateLetter(user, "Ohne", includeFoldMarks: false);
        Assert.False((await Json(await user.GetAsync($"/api/cover-letters/{off}"))).GetProperty("includeFoldMarks").GetBoolean());

        var switchedOff = await Json(await user.PutAsync($"/api/cover-letters/{id}", Letter("Standard", includeFoldMarks: false)));
        Assert.False(switchedOff.GetProperty("includeFoldMarks").GetBoolean());
        Assert.False((await Json(await user.GetAsync($"/api/cover-letters/{id}"))).GetProperty("includeFoldMarks").GetBoolean());

        // An edit that does not mention the option (an older client) must not switch the marks back on
        var untouched = await Json(await user.PutAsync($"/api/cover-letters/{id}", Letter("Neuer Titel")));
        Assert.False(untouched.GetProperty("includeFoldMarks").GetBoolean());

        var switchedOn = await Json(await user.PutAsync($"/api/cover-letters/{id}", Letter("Neuer Titel", includeFoldMarks: true)));
        Assert.True(switchedOn.GetProperty("includeFoldMarks").GetBoolean());
    }

    [Fact]
    public async Task Preview_and_export_print_the_marks_of_the_saved_letter_unless_the_request_overrides_them()
    {
        var user = await NewUser("marks-render");
        var withMarks = await CreateLetter(user, "Mit", includeFoldMarks: true);
        var withoutMarks = await CreateLetter(user, "Ohne", includeFoldMarks: false);

        int Marks(byte[] pdf) => PdfText.FoldMarkLines(pdf);

        Assert.True(Marks(await Bytes(await user.PostAsync($"/api/cover-letters/{withMarks}/preview/pdf", new { }))) >= 3);
        Assert.Equal(0, Marks(await Bytes(await user.PostAsync($"/api/cover-letters/{withoutMarks}/preview/pdf", new { }))));
        Assert.Equal(0, Marks(await Bytes(await user.PostAsync($"/api/cover-letters/{withoutMarks}/preview/pdf", new { font = "Liberation Sans", language = "de" }))));
        Assert.Equal(0, Marks(await Bytes(await user.PostAsync($"/api/cover-letters/{withoutMarks}/export/pdf", new { }))));
        Assert.True(Marks(await Bytes(await user.PostAsync($"/api/cover-letters/{withMarks}/export/pdf", new { language = "de" }))) >= 3);

        // An explicit value in the request wins (the editor can show the unsaved state)
        Assert.True(Marks(await Bytes(await user.PostAsync($"/api/cover-letters/{withoutMarks}/preview/pdf", new { includeFoldMarks = true }))) >= 3);
        Assert.Equal(0, Marks(await Bytes(await user.PostAsync($"/api/cover-letters/{withMarks}/preview/pdf", new { includeFoldMarks = false }))));
    }

    [Fact]
    public async Task The_word_export_has_no_marks_and_ignores_the_option()
    {
        var user = await NewUser("marks-docx");
        var off = await CreateLetter(user, "Ohne", includeFoldMarks: false);

        foreach (var body in new object[] { new { }, new { includeFoldMarks = true }, new { includeFoldMarks = false } })
        {
            var response = await user.PostAsync($"/api/cover-letters/{off}/export/docx", body);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.True((await response.Content.ReadAsByteArrayAsync(Ct)).Length > 1000);
        }
    }

    [Fact]
    public async Task The_dossier_prints_the_marks_the_letter_has_saved()
    {
        var user = await NewUser("marks-dossier");
        var withMarks = await CreateLetter(user, "Mit", includeFoldMarks: true);
        var withoutMarks = await CreateLetter(user, "Ohne", includeFoldMarks: false);
        var sameCv = new { jobTitle = "Lead", company = "Firma" };
        var a = await CreateApplication(user, new { sameCv.jobTitle, sameCv.company, coverLetterId = withMarks });
        var b = await CreateApplication(user, new { sameCv.jobTitle, sameCv.company, coverLetterId = withoutMarks });

        var marked = PdfText.FoldMarkLines(await Bytes(await user.GetAsync($"/api/applications/{a}/dossier/preview")));
        var unmarked = PdfText.FoldMarkLines(await Bytes(await user.GetAsync($"/api/applications/{b}/dossier/preview")));

        Assert.True(marked >= 3, $"marked: {marked}");
        Assert.Equal(marked - 3, unmarked);

        // The filed version keeps what the letter had when it was sent, even if the letter changes afterwards
        var sent = await CreateApplication(user, new { sameCv.jobTitle, sameCv.company, coverLetterId = withMarks, status = "applied" });
        await Json(await user.PutAsync($"/api/cover-letters/{withMarks}", Letter("Mit", includeFoldMarks: false)));
        var filed = PdfText.FoldMarkLines(await Bytes(await user.GetAsync($"/api/applications/{sent}/dossier/preview")));
        Assert.Equal(marked, filed);
    }

    [Fact]
    public async Task The_marks_survive_a_backup_and_its_restore()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "marks-backup");
        var id = await CreateLetter(user, "Ohne", includeFoldMarks: false);
        var backup = await Json(await admin.PostAsync("/api/admin/backups"), HttpStatusCode.Created);

        await Json(await user.PutAsync($"/api/cover-letters/{id}", Letter("Ohne", includeFoldMarks: true)));
        Assert.True((await Json(await user.GetAsync($"/api/cover-letters/{id}"))).GetProperty("includeFoldMarks").GetBoolean());
        await Json(await admin.PostAsync($"/api/admin/backups/{backup.GetProperty("id").GetString()}/restore", Credentials));

        var again = server.Client();
        (await again.PostAsync("/api/auth/login", new { username = "marks-backup", password = "user-password-123" })).EnsureSuccessStatusCode();
        Assert.False((await Json(await again.GetAsync($"/api/cover-letters/{id}"))).GetProperty("includeFoldMarks").GetBoolean());
    }
}

public sealed class FoldMarksMigrationTests : IDisposable
{
    private const string Previous = "20261108144248_AddWhatsNewSeenVersion";

    private readonly string _file = Path.Combine(Path.GetTempPath(), $"cv-migration-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var path in new[] { _file, _file + "-wal", _file + "-shm" }) File.Delete(path);
    }

    [Fact]
    public void Letters_from_before_the_choice_existed_keep_their_marks()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(SqliteDatabase.ConnectionString(_file, pooling: false)).Options;
        using var db = new AppDbContext(options);
        db.GetService<IMigrator>().Migrate(Previous);

        using (var connection = new SqliteConnection($"Data Source={_file};Pooling=False;Foreign Keys=False"))
        {
            connection.Open();
            using var insert = connection.CreateCommand();
            insert.CommandText = "INSERT INTO cover_letters (\"Id\", \"UserId\", \"Title\", \"RecipientCompany\", \"RecipientCity\", \"Subject\", \"Salutation\", \"Body\", \"Closing\", \"Language\", \"CreatedAt\", \"UpdatedAt\") VALUES ('1', 'u', 't', 'c', 'c', 's', 's', 'b', 'c', 'de', '2026-01-01', '2026-01-01')";
            insert.ExecuteNonQuery();
        }

        db.GetService<IMigrator>().Migrate();

        using var check = new SqliteConnection($"Data Source={_file};Pooling=False");
        check.Open();
        using var select = check.CreateCommand();
        select.CommandText = "SELECT \"IncludeFoldMarks\" FROM cover_letters WHERE \"Id\" = '1'";
        Assert.Equal(1L, select.ExecuteScalar());
    }
}
