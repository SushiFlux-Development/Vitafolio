// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Net;
using System.Net.Http.Headers;
using Cv.Server.Documents;
using Cv.Server.Tests.Support;

namespace Cv.Server.Tests;

/// <summary>Documents through the HTTP API: what is refused when saving, what an upload must survive, how snapshots are kept.</summary>
public sealed class DocumentApiTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static async Task<HttpResponseMessage> Upload(TestClient client, byte[] content, string name, string type, string path = "/api/attachments")
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue(type);
        form.Add(file, "file", name);
        return await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, path) { Content = form });
    }

    private static async Task<JsonElementHolder> Ok(HttpResponseMessage response, HttpStatusCode expected = HttpStatusCode.OK)
    {
        Assert.True(response.StatusCode == expected, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync(Ct)}");
        return new JsonElementHolder(await response.JsonAsync());
    }

    private sealed record JsonElementHolder(System.Text.Json.JsonElement Json);

    private static async Task<string?> FieldCode(HttpResponseMessage response, string field)
    {
        var json = await response.JsonAsync();
        return json.GetProperty("errors").GetProperty(field)[0].GetProperty("code").GetString();
    }

    // ---------- fonts ----------

    [Fact]
    public async Task The_start_information_lists_exactly_the_shipped_fonts()
    {
        var response = await server.Client().GetAsync("/api/bootstrap");

        var fonts = (await response.JsonAsync()).GetProperty("documentFonts").EnumerateArray().Select(f => f.GetProperty("family").GetString()).ToList();

        Assert.Equal(DocumentFonts.All.Select(f => f.Family), fonts);
    }

    [Fact]
    public async Task A_saved_font_that_is_not_shipped_is_stored_as_the_default_and_never_fails_a_render()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "font-user");

        var created = await Ok(await user.PostAsync("/api/cover-letters", new { title = "T", recipientCompany = "A", recipientCity = "B", subject = "C", salutation = "D", body = "E", font = "Papyrus" }), HttpStatusCode.Created);
        var id = created.Json.GetProperty("id").GetString();

        Assert.Equal("Liberation Sans", created.Json.GetProperty("font").GetString());
        Assert.Equal(HttpStatusCode.OK, (await user.PostAsync($"/api/cover-letters/{id}/preview/pdf", new { font = "Papyrus" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await user.PostAsync("/api/profile/preview/pdf", new { font = "../../x" })).StatusCode);
    }

    // ---------- colours ----------

    [Theory]
    [InlineData("red")]
    [InlineData("#12")]
    [InlineData("14213D")]
    [InlineData("#14213D;")]
    [InlineData("#gggggg")]
    public async Task An_invalid_colour_is_refused_when_a_cover_letter_is_saved(string color)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "colour-" + Guid.NewGuid().ToString("N")[..8]);
        var body = new { title = "T", recipientCompany = "A", recipientCity = "B", subject = "C", salutation = "D", body = "E", accentColor = color };

        var create = await user.PostAsync("/api/cover-letters", body);
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Equal("validation.color", await FieldCode(create, "accentColor"));

        var valid = await Ok(await user.PostAsync("/api/cover-letters", body with { accentColor = "#aabbcc" }), HttpStatusCode.Created);
        var update = await user.PutAsync($"/api/cover-letters/{valid.Json.GetProperty("id").GetString()}", body);
        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);
        Assert.Equal("validation.color", await FieldCode(update, "accentColor"));
    }

    [Theory]
    [InlineData("red")]
    [InlineData("#12")]
    [InlineData("#14213D\u0000")]
    public async Task An_invalid_colour_is_refused_when_an_application_is_saved(string color)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "colour-app-" + Guid.NewGuid().ToString("N")[..8]);

        var create = await user.PostAsync("/api/applications", new { jobTitle = "J", company = "C", cvAccentColor = color });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Equal("validation.color", await FieldCode(create, "cvAccentColor"));

        var valid = await Ok(await user.PostAsync("/api/applications", new { jobTitle = "J", company = "C", cvAccentColor = "#abcd" }), HttpStatusCode.Created);
        Assert.Equal("#abcd", valid.Json.GetProperty("cvAccentColor").GetString());
        var update = await user.PutAsync($"/api/applications/{valid.Json.GetProperty("id").GetString()}", new { jobTitle = "J", company = "C", cvAccentColor = color });
        Assert.Equal("validation.color", await FieldCode(update, "cvAccentColor"));
    }

    // ---------- attachment upload test render ----------

    [Fact]
    public async Task A_multi_page_pdf_is_accepted_as_an_attachment()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "multipage-user");

        var response = await Upload(user, DocumentSamples.Pdf(pages: 5), "mappe.pdf", "application/pdf");

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task A_damaged_pdf_is_refused_with_a_clear_code_and_leaves_nothing_behind()
    {
        var admin = await server.AdminAsync();
        var (user, id) = await server.UserAsync(admin, "damaged-pdf-user");

        var response = await Upload(user, "%PDF-1.4 nothing but a header"u8.ToArray(), "kaputt.pdf", "application/pdf");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("file.unreadable_pdf", await response.CodeAsync());
        Assert.Empty((await (await user.GetAsync("/api/attachments")).JsonAsync()).EnumerateArray());
        var folder = Path.Combine(server.DataDir, "attachments", Guid.Parse(id).ToString("N"));
        Assert.True(!Directory.Exists(folder) || Directory.GetFiles(folder).Length == 0);
    }

    [Fact]
    public async Task A_picture_that_only_looks_like_one_is_refused()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "fake-png-user");
        // The header of a PNG followed by nothing a decoder could use
        byte[] fake = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5, 6, 7, 8];

        var response = await Upload(user, fake, "bild.png", "image/png");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("file.not_renderable", await response.CodeAsync());
    }

    [Fact]
    public async Task A_pdf_with_too_many_pages_is_refused_with_the_numbers()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "many-pages-user");

        var response = await Upload(user, DocumentSamples.Pdf(pages: PdfInfo.MaxPages + 1), "dick.pdf", "application/pdf");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("file.too_many_pages", await response.CodeAsync());
        var parameters = (await response.JsonAsync()).GetProperty("params");
        Assert.Equal(PdfInfo.MaxPages + 1, parameters.GetProperty("pages").GetInt32());
        Assert.Equal(PdfInfo.MaxPages, parameters.GetProperty("max").GetInt32());
    }

    // ---------- snapshot ----------

    private async Task<(TestClient User, string UserId)> NewUser(string name)
    {
        var admin = await server.AdminAsync();
        var (user, id) = await server.UserAsync(admin, name);
        await user.PutAsync("/api/profile", new { firstName = "Erika", lastName = "Muster", email = "erika@example.org" });
        return (user, id);
    }

    // The folder is created by the first snapshot that is stored; before that (e.g. when this test is the first of the class to run) there are no files
    private string[] SnapshotFiles(string userId)
    {
        var folder = Path.Combine(server.DataDir, "applications");
        return Directory.Exists(folder) ? Directory.GetFiles(folder, Guid.Parse(userId).ToString("D") + "*") : [];
    }

    [Fact]
    public async Task An_existing_snapshot_is_only_replaced_on_purpose_and_the_old_file_goes_afterwards()
    {
        var (user, userId) = await NewUser("snapshot-user");
        var app = await Ok(await user.PostAsync("/api/applications", new { jobTitle = "Lead", company = "Firma", status = "applied" }), HttpStatusCode.Created);
        var id = app.Json.GetProperty("id").GetString();
        Assert.True(app.Json.GetProperty("hasArchivedPdf").GetBoolean());
        var first = Assert.Single(SnapshotFiles(userId));

        // Without the confirmation nothing happens
        var refused = await user.PostAsync($"/api/applications/{id}/dossier/archive");
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("archive.exists", await refused.CodeAsync());
        Assert.Equal(first, Assert.Single(SnapshotFiles(userId)));

        // With it the snapshot is replaced: one file, a new one
        await Ok(await user.PostAsync($"/api/applications/{id}/dossier/archive?replace=true"));
        var second = Assert.Single(SnapshotFiles(userId));
        Assert.NotEqual(first, second);
        Assert.False(File.Exists(first));
        Assert.Equal(HttpStatusCode.OK, (await user.GetAsync($"/api/applications/{id}/dossier/download")).StatusCode);
    }

    [Fact]
    public async Task A_lost_archive_file_is_reported_and_not_quietly_rendered_anew()
    {
        var (user, userId) = await NewUser("lost-snapshot-user");
        var app = await Ok(await user.PostAsync("/api/applications", new { jobTitle = "Lead", company = "Firma", status = "applied" }), HttpStatusCode.Created);
        var id = app.Json.GetProperty("id").GetString();
        File.Delete(Assert.Single(SnapshotFiles(userId)));

        var download = await user.GetAsync($"/api/applications/{id}/dossier/download");

        Assert.Equal(HttpStatusCode.Conflict, download.StatusCode);
        Assert.Equal("archive.missing", await download.CodeAsync());
        // The preview says the same instead of showing the current state in its place; that state stays reachable on purpose, and a new
        // snapshot can be made
        var preview = await user.GetAsync($"/api/applications/{id}/dossier/preview");
        Assert.Equal(HttpStatusCode.Conflict, preview.StatusCode);
        Assert.Equal("archive.missing", await preview.CodeAsync());
        Assert.Equal(HttpStatusCode.OK, (await user.GetAsync($"/api/applications/{id}/dossier/preview?version=current")).StatusCode);
    }

    [Fact]
    public async Task A_draft_without_a_snapshot_downloads_the_current_state()
    {
        var (user, _) = await NewUser("draft-download-user");
        var app = await Ok(await user.PostAsync("/api/applications", new { jobTitle = "Lead", company = "Firma" }), HttpStatusCode.Created);

        var download = await user.GetAsync($"/api/applications/{app.Json.GetProperty("id").GetString()}/dossier/download");

        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal("application/pdf", download.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Sending_an_application_with_a_missing_attachment_keeps_the_status_and_reports_that_nothing_was_archived()
    {
        var (user, userId) = await NewUser("missing-attachment-user");
        var attachment = await Ok(await Upload(user, DocumentSamples.Pdf(), "zeugnis.pdf", "application/pdf"), HttpStatusCode.Created);
        var attachmentId = attachment.Json.GetProperty("id").GetString();
        var app = await Ok(await user.PostAsync("/api/applications", new { jobTitle = "Lead", company = "Firma", attachmentIds = new[] { attachmentId } }), HttpStatusCode.Created);
        var id = app.Json.GetProperty("id").GetString();
        // The file is gone from the disk
        foreach (var file in Directory.GetFiles(Path.Combine(server.DataDir, "attachments", Guid.Parse(userId).ToString("N")))) File.Delete(file);

        var sent = await Ok(await user.PostAsync($"/api/applications/{id}/status", new { status = "applied" }));

        Assert.Equal("applied", sent.Json.GetProperty("status").GetString());
        Assert.False(sent.Json.GetProperty("hasArchivedPdf").GetBoolean());
        Assert.Equal("archive.attachments_unavailable", sent.Json.GetProperty("archiveWarning").GetString());
        Assert.Empty(SnapshotFiles(userId));
        // The preview still renders, with a note page where the attachment would be
        var preview = await user.GetAsync($"/api/applications/{id}/dossier/preview");
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        Assert.Contains("konnte nicht eingebunden werden", PdfText.All(await preview.Content.ReadAsByteArrayAsync(Ct)));
    }

    [Fact]
    public async Task The_dossier_of_an_application_contains_the_attachment_pages()
    {
        var (user, _) = await NewUser("dossier-pages-user");
        var attachment = await Ok(await Upload(user, DocumentSamples.Pdf(pages: 3), "zeugnis.pdf", "application/pdf"), HttpStatusCode.Created);
        var app = await Ok(await user.PostAsync("/api/applications", new
        {
            jobTitle = "Lead",
            company = "Firma",
            cvDesign = "modern",
            attachmentIds = new[] { attachment.Json.GetProperty("id").GetString() },
        }), HttpStatusCode.Created);

        var preview = await user.GetAsync($"/api/applications/{app.Json.GetProperty("id").GetString()}/dossier/preview");
        var pages = PdfText.Pages(await preview.Content.ReadAsByteArrayAsync(Ct));

        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        Assert.Equal(2 + 3, pages.Count);
        Assert.Contains(pages, p => p.Contains("Seite 3"));
        // The chosen design is the one in the dossier: the sidebar of the modern design
        Assert.Contains(pages, p => p.Contains("KONTAKT") && p.Contains("erika@example.org"));
    }
}
