// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.IO.Compression;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Cv.Server.Applications;
using Cv.Server.Tests.Support;

namespace Cv.Server.Tests;

/// <summary>Several dossiers at once as a ZIP, and the file names that go with it.</summary>
public sealed class DossierArchiveTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<TestClient> NewUser(string name)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, name);
        await user.PutAsync("/api/profile", new { firstName = "Erika", lastName = "Muster" });
        return user;
    }

    private static async Task<string> NewApplication(TestClient user, string company, string job, string? language = null, string status = "draft")
    {
        var response = await user.PostAsync("/api/applications", new { jobTitle = job, company, status, cvLanguage = language });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.JsonAsync()).GetProperty("id").GetString()!;
    }

    private static Task<HttpResponseMessage> Archive(TestClient user, IEnumerable<string> ids, string? language = null) =>
        user.PostAsync("/api/applications/dossiers/archive", new { ids, language });

    private static async Task<ZipArchive> Open(HttpResponseMessage response)
    {
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return new ZipArchive(new MemoryStream(await response.Content.ReadAsByteArrayAsync(Ct)), ZipArchiveMode.Read);
    }

    private static byte[] Read(ZipArchiveEntry entry)
    {
        using var stream = entry.Open();
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }

    private static string DownloadName(HttpResponseMessage response) =>
        response.Content.Headers.ContentDisposition!.FileNameStar ?? response.Content.Headers.ContentDisposition.FileName!.Trim('"');

    // ---------- the ZIP ----------

    [Fact]
    public async Task Several_applications_come_as_one_pdf_each_named_after_company_and_job()
    {
        var user = await NewUser("zip-several");
        var a = await NewApplication(user, "Nordwind AG", "Entwicklerin");
        var b = await NewApplication(user, "Brückner GmbH", "Teamleitung", language: "en");

        var response = await Archive(user, [a, b]);
        var name = DownloadName(response);
        using var zip = await Open(response);

        Assert.Equal("application/zip", response.Content.Headers.ContentType?.MediaType);
        Assert.Matches(@"^Bewerbungen-\d{4}-\d{2}-\d{2}\.zip$", name);
        Assert.Equal("0", response.Headers.GetValues("X-Dossiers-Failed").Single());
        Assert.Equal(["Bewerbung_NordwindAG_Entwicklerin.pdf", "Application_BrücknerGmbH_Teamleitung.pdf"], zip.Entries.Select(e => e.FullName));
        foreach (var entry in zip.Entries)
        {
            var pdf = Read(entry);
            Assert.True(pdf.AsSpan().StartsWith("%PDF"u8), entry.FullName);
            Assert.NotEmpty(PdfText.Pages(pdf));
        }
        Assert.Contains("Nordwind", PdfText.All(Read(zip.Entries[0])));
    }

    [Fact]
    public async Task The_zip_is_named_in_the_requested_language_with_the_date_of_the_server()
    {
        var user = await NewUser("zip-language");
        var id = await NewApplication(user, "Firma", "Stelle");

        var german = Archive(user, [id]);
        var english = Archive(user, [id], "en");
        var today = DateTimeOffset.Now.ToString("yyyy-MM-dd");
        var tomorrow = DateTimeOffset.Now.AddDays(1).ToString("yyyy-MM-dd");

        Assert.Contains(DownloadName(await german), new[] { $"Bewerbungen-{today}.zip", $"Bewerbungen-{tomorrow}.zip" });
        Assert.Contains(DownloadName(await english), new[] { $"Applications-{today}.zip", $"Applications-{tomorrow}.zip" });
    }

    [Fact]
    public async Task Equal_names_are_made_unique_inside_the_zip_whatever_the_case()
    {
        var user = await NewUser("zip-equal");
        var ids = new[]
        {
            await NewApplication(user, "Firma", "Stelle"),
            await NewApplication(user, "FIRMA", "stelle"),
            await NewApplication(user, "Firma", "Stelle"),
        };

        using var zip = await Open(await Archive(user, ids));

        Assert.Equal(["Bewerbung_Firma_Stelle.pdf", "Bewerbung_FIRMA_stelle (2).pdf", "Bewerbung_Firma_Stelle (3).pdf"], zip.Entries.Select(e => e.FullName));
    }

    [Fact]
    public async Task A_frozen_dossier_comes_out_exactly_as_it_was_filed_and_a_draft_is_rendered_now()
    {
        var user = await NewUser("zip-frozen");
        var sent = await NewApplication(user, "Gesendet GmbH", "Lead", status: "applied");
        var draft = await NewApplication(user, "Entwurf GmbH", "Lead");
        var filed = await (await user.GetAsync($"/api/applications/{sent}/dossier/download")).Content.ReadAsByteArrayAsync(Ct);
        // The profile changes after sending: the snapshot does not
        await user.PutAsync("/api/profile", new { firstName = "Geändert", lastName = "Muster" });

        using var zip = await Open(await Archive(user, [sent, draft]));

        Assert.Equal(filed, Read(zip.Entries[0]));
        Assert.DoesNotContain("Geändert", PdfText.All(Read(zip.Entries[0])));
        Assert.Contains("Geändert", PdfText.All(Read(zip.Entries[1])));
    }

    [Fact]
    public async Task A_missing_archive_file_does_not_stop_the_others_and_is_named_in_a_note()
    {
        var user = await NewUser("zip-missing");
        var good = await NewApplication(user, "Gut GmbH", "Lead");
        var lost = await NewApplication(user, "Verloren GmbH", "Lead", status: "applied");
        foreach (var file in Directory.GetFiles(Path.Combine(server.DataDir, "applications"), $"*{lost}*")) File.Delete(file);

        var response = await Archive(user, [lost, good]);
        using var zip = await Open(response);

        Assert.Equal("1", response.Headers.GetValues("X-Dossiers-Failed").Single());
        Assert.Equal(["Bewerbung_GutGmbH_Lead.pdf", "Nicht-erstellt.txt"], zip.Entries.Select(e => e.FullName).Order());
        var note = Encoding.UTF8.GetString(Read(zip.GetEntry("Nicht-erstellt.txt")!));
        Assert.Contains("Verloren GmbH", note);
        Assert.Contains(lost, note);
        Assert.Contains("abgelegte Fassung", note);
        Assert.DoesNotContain("Gut GmbH", note);

        // In English the note has an English name and text
        using var english = await Open(await Archive(user, [lost, good], "en"));
        Assert.Contains("Not-created.txt", english.Entries.Select(e => e.FullName));
        Assert.Contains("filed version", Encoding.UTF8.GetString(Read(english.GetEntry("Not-created.txt")!)));
    }

    [Fact]
    public async Task When_all_fail_it_is_an_ordinary_error_like_the_single_download()
    {
        var user = await NewUser("zip-allfail");
        var lost = await NewApplication(user, "Verloren GmbH", "Lead", status: "applied");
        foreach (var file in Directory.GetFiles(Path.Combine(server.DataDir, "applications"), $"*{lost}*")) File.Delete(file);

        var response = await Archive(user, [lost]);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("archive.missing", await response.CodeAsync());
    }

    [Fact]
    public async Task Foreign_and_unknown_ids_are_treated_alike_and_reveal_nothing()
    {
        var user = await NewUser("zip-own");
        var other = await NewUser("zip-foreign");
        var mine = await NewApplication(user, "Eigene GmbH", "Lead");
        var foreign = await NewApplication(other, "Fremde GmbH", "Geheim");
        var unknown = Guid.NewGuid().ToString();

        var mixed = await Archive(user, [mine, foreign, unknown]);
        using var zip = await Open(mixed);

        Assert.Equal("2", mixed.Headers.GetValues("X-Dossiers-Failed").Single());
        Assert.Equal(["Bewerbung_EigeneGmbH_Lead.pdf", "Nicht-erstellt.txt"], zip.Entries.Select(e => e.FullName).Order());
        var note = Encoding.UTF8.GetString(Read(zip.GetEntry("Nicht-erstellt.txt")!));
        // Both are "not found"; nothing of the foreign application (company, job) is in the answer, and the two cannot be told apart
        Assert.Contains($"{foreign}: nicht gefunden", note);
        Assert.Contains($"{unknown}: nicht gefunden", note);
        Assert.DoesNotContain("Fremde", note);
        Assert.DoesNotContain("Geheim", note);

        // Only ids that are not the user's: the same answer as for a single unknown application
        Assert.Equal(HttpStatusCode.NotFound, (await Archive(user, [foreign, unknown])).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await user.GetAsync($"/api/applications/{foreign}/dossier/download")).StatusCode);
    }

    [Fact]
    public async Task The_list_must_not_be_empty_nor_longer_than_100_and_the_language_must_be_known()
    {
        var user = await NewUser("zip-limits");
        var id = await NewApplication(user, "Firma", "Stelle");

        async Task<(string Field, string Code)> Refused(HttpResponseMessage response)
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var problem = await response.JsonAsync();
            Assert.Equal("validation.failed", problem.GetProperty("code").GetString());
            var first = problem.GetProperty("errors").EnumerateObject().First();
            return (first.Name, first.Value[0].GetProperty("code").GetString()!);
        }

        Assert.Equal(("ids", "validation.required"), await Refused(await Archive(user, [])));
        Assert.Equal(("ids", "validation.required"), await Refused(await user.PostAsync("/api/applications/dossiers/archive", new { })));
        Assert.Equal(("ids", "validation.max_items"), await Refused(await Archive(user, Enumerable.Range(0, 101).Select(_ => Guid.NewGuid().ToString()))));
        Assert.Equal(("language", "validation.one_of"), await Refused(await Archive(user, [id], "fr")));

        // Exactly 100 is fine (the same application many times is one file)
        using var zip = await Open(await Archive(user, Enumerable.Repeat(id, 100)));
        Assert.Single(zip.Entries);
    }

    [Fact]
    public async Task It_needs_a_sign_in()
    {
        Assert.Equal(HttpStatusCode.Unauthorized, (await server.Client().PostAsync("/api/applications/dossiers/archive", new { ids = new[] { Guid.NewGuid() } })).StatusCode);
    }

    [Fact]
    public async Task The_temporary_file_is_gone_once_the_zip_has_been_read()
    {
        var user = await NewUser("zip-temp");
        var id = await NewApplication(user, "Firma", "Stelle");

        using (var zip = await Open(await Archive(user, [id]))) Assert.Single(zip.Entries);
        // The failing request leaves nothing behind either
        Assert.Equal(HttpStatusCode.NotFound, (await Archive(user, [Guid.NewGuid().ToString()])).StatusCode);

        for (var attempt = 0; attempt < 20 && Directory.GetFiles(Path.Combine(server.DataDir, "applications"), ".tmp-*").Length > 0; attempt++) await Task.Delay(100, Ct);
        Assert.Empty(Directory.GetFiles(Path.Combine(server.DataDir, "applications"), ".tmp-*"));
    }

    // ---------- names ----------

    [Fact]
    public async Task Dangerous_characters_in_company_and_job_never_reach_the_file_name_and_letters_of_every_script_stay()
    {
        var user = await NewUser("zip-names");
        var evil = await NewApplication(user, "../..\\Windows:Evil*?\"<>|‮\0 CON", "NUL.txt\r\n/etc/passwd");
        var umlauts = await NewApplication(user, "Müller & Söhne – Straße", "Ärztin/Arzt (m/w/d) 日本語 Ωmega");

        using var zip = await Open(await Archive(user, [evil, umlauts]));
        var detail = await (await user.GetAsync($"/api/applications/{evil}")).JsonAsync();
        var listed = (await (await user.GetAsync("/api/applications")).JsonAsync()).EnumerateArray().ToDictionary(a => a.GetProperty("id").GetString()!, a => a.GetProperty("dossierFileName").GetString()!);

        Assert.Equal("Bewerbung_WindowsEvilCON_NULtxtetcpasswd.pdf", zip.Entries[0].FullName);
        Assert.Equal("Bewerbung_MüllerSöhneStraße_ÄrztinArztmwd日本語Ωmega.pdf", zip.Entries[1].FullName);
        // The single download, the detail and the list use the very same name
        Assert.Equal(zip.Entries[0].FullName, detail.GetProperty("dossierFileName").GetString());
        Assert.Equal(zip.Entries[0].FullName, listed[evil]);
        Assert.Equal(zip.Entries[1].FullName, listed[umlauts]);
        Assert.Equal(zip.Entries[1].FullName, DownloadName(await user.GetAsync($"/api/applications/{umlauts}/dossier/download")));
        foreach (var entry in zip.Entries)
        {
            Assert.DoesNotMatch(@"[\\/:*?""<>|\u0000-\u001f‮]", entry.FullName);
            Assert.Equal(entry.FullName, Path.GetFileName(entry.FullName));
        }
    }

    [Fact]
    public void Names_are_built_safely_and_short()
    {
        // The prefix means the name is never a reserved device name
        Assert.Equal("Bewerbung_CON_NUL.pdf", DossierFileNames.For("CON", "NUL", "de"));
        Assert.Equal("Bewerbung_AUX_x.pdf", DossierFileNames.For("AUX", "x", "de"));
        Assert.Equal("Application_Firma_Job.pdf", DossierFileNames.For("Firma", "Job", "en"));
        Assert.Equal("Bewerbung.pdf", DossierFileNames.For("", "  ", "de"));
        Assert.Equal("Bewerbung.pdf", DossierFileNames.For("???", "...", "de"));
        // Each part is cut, so the whole name stays short; a character outside the basic plane is never cut in two
        var long200 = new string('x', 200);
        Assert.Equal(DossierFileNames.MaxPartLength, DossierFileNames.Part(long200).Length);
        Assert.True(DossierFileNames.For(long200, long200, "de").Length <= 12 + 2 * DossierFileNames.MaxPartLength + 4);
        var astral = string.Concat(Enumerable.Repeat("\U00020BB7", 100));
        Assert.Equal(DossierFileNames.MaxPartLength, DossierFileNames.Part(astral).EnumerateRunes().Count());
        Assert.True(DossierFileNames.Part(astral).IsNormalized());
        // A letter written as "u" plus a combining diaeresis keeps its dots
        Assert.Equal("Müller", DossierFileNames.Part("Müller"));
        Assert.Equal("a-b_c", DossierFileNames.Part("a-b_c"));
    }

    [Fact]
    public void Unique_names_add_a_number_before_the_extension()
    {
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        Assert.Equal("a.pdf", DossierFileNames.Unique("a.pdf", used));
        Assert.Equal("a (2).pdf", DossierFileNames.Unique("a.pdf", used));
        Assert.Equal("A (3).PDF", DossierFileNames.Unique("A.PDF", used));
        Assert.Equal("b.pdf", DossierFileNames.Unique("b.pdf", used));
    }
}
