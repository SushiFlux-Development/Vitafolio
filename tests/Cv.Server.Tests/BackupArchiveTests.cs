using System.Net;
using System.Net.Http.Headers;
using Cv.Server.Backups;
using Cv.Server.Configuration;
using Cv.Server.Data;
using Cv.Server.Storage;
using Cv.Server.Tests.Support;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Cv.Server.Tests;

/// <summary>Complete backups end to end: files and rows, rejected archives, old database-only backups, an interrupted restore.</summary>
public sealed class BackupArchiveTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private const string UserPassword = "user-password-123";
    private static readonly object Credentials = new { password = ServerFixture.AdminPassword };
    private static readonly byte[] Png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    private static readonly byte[] Pdf = DocumentSamples.Pdf();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record Account(TestClient Client, string Id, string Username, string AttachmentId, string LetterId, string ApplicationId);

    private async Task<Account> CreateAccountWithFilesAsync(TestClient admin, string username)
    {
        var (client, id) = await server.UserAsync(admin, username);
        await Created(await UploadFile(client, "/api/profile/photo", "photo", Png, "foto.png", "image/png"), HttpStatusCode.OK);
        var attachment = await (await Created(await UploadFile(client, "/api/attachments", "file", Pdf, "zeugnis.pdf", "application/pdf"), HttpStatusCode.Created)).JsonAsync();

        var letter = await (await Created(await client.PostAsync("/api/cover-letters", new { title = "T", recipientCompany = "A", recipientCity = "B", subject = "C", salutation = "D", body = "E" }), HttpStatusCode.Created)).JsonAsync();
        var letterId = letter.GetProperty("id").GetString()!;
        await Created(await UploadFile(client, $"/api/cover-letters/{letterId}/signature", "file", Png, "sig.png", "image/png"), HttpStatusCode.OK);

        var application = await (await Created(await client.PostAsync("/api/applications", new { jobTitle = "Lead", company = "Firma", status = "draft" }), HttpStatusCode.Created)).JsonAsync();
        var applicationId = application.GetProperty("id").GetString()!;
        await Created(await client.PostAsync($"/api/applications/{applicationId}/dossier/archive"), HttpStatusCode.OK);
        return new Account(client, id, username, attachment.GetProperty("id").GetString()!, letterId, applicationId);
    }

    private static async Task<HttpResponseMessage> Created(HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.True(response.StatusCode == expected, $"{response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return response;
    }

    private static async Task<HttpResponseMessage> UploadFile(TestClient client, string path, string field, byte[] content, string name, string type)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue(type);
        form.Add(file, field, name);
        return await client.SendAsync(new HttpRequestMessage(HttpMethod.Post, path) { Content = form });
    }

    private static Task<HttpResponseMessage> UploadBackup(TestClient admin, byte[] content) => UploadBackup(admin, content, "backup.zip");

    private static async Task<HttpResponseMessage> UploadBackup(TestClient admin, byte[] content, string name)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(file, "file", name);
        form.Add(new StringContent(ServerFixture.AdminPassword), "password");
        return await admin.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/admin/backups/upload") { Content = form });
    }

    private async Task<TestClient> SignInAsync(string username)
    {
        var client = server.Client();
        (await client.PostAsync("/api/auth/login", new { username, password = UserPassword })).EnsureSuccessStatusCode();
        return client;
    }

    private async Task<byte[]> CurrentArchiveAsync(TestClient admin)
    {
        var response = await Created(await admin.PostAsync("/api/admin/backups/current/download", Credentials), HttpStatusCode.OK);
        return await response.Content.ReadAsByteArrayAsync(Ct);
    }

    /// <summary>Every user file with its content, relative to the data folder.</summary>
    private Dictionary<string, byte[]> Tree()
    {
        var result = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var folder in DataAreas.Folders)
        {
            var directory = Path.Combine(server.DataDir, folder);
            if (!Directory.Exists(directory)) continue;
            foreach (var file in Directory.GetFiles(directory, "*", SearchOption.AllDirectories))
            {
                result[Path.GetRelativePath(server.DataDir, file).Replace('\\', '/')] = File.ReadAllBytes(file);
            }
        }
        return result;
    }

    private static void AssertSameTree(Dictionary<string, byte[]> expected, Dictionary<string, byte[]> actual)
    {
        Assert.Equal(expected.Keys.Order(StringComparer.Ordinal), actual.Keys.Order(StringComparer.Ordinal));
        foreach (var (name, content) in expected) Assert.True(content.SequenceEqual(actual[name]), name);
    }

    private async Task<List<string?>> UsernamesAsync(TestClient admin) =>
        (await (await admin.GetAsync("/api/admin/users")).JsonAsync()).EnumerateArray().Select(u => u.GetProperty("username").GetString()).ToList();

    private void AssertNoRestoreLeftovers()
    {
        var work = Path.Combine(server.DataDir, ".restore-work");
        if (Directory.Exists(work)) Assert.Empty(Directory.GetFileSystemEntries(work));
    }

    private void Sql(string sql)
    {
        using var connection = new SqliteConnection($"Data Source={Path.Combine(server.DataDir, "app.db")};Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    [Fact]
    public async Task The_selection_of_an_application_and_the_answers_of_the_guide_come_back_with_a_restore()
    {
        var admin = await server.AdminAsync();
        var account = await CreateAccountWithFilesAsync(admin, "auswahl");
        var station = await (await Created(await account.Client.PostAsync("/api/profile/experiences", new { jobTitle = "Leitung", employer = "Firma", startDate = "2020-01" }), HttpStatusCode.Created)).JsonAsync();
        var selection = new { experiences = new Dictionary<string, string> { [station.GetProperty("id").GetString()!] = "short" }, hiddenSections = new[] { "interests" } };
        await Created(await account.Client.PutAsync($"/api/applications/{account.ApplicationId}", new { jobTitle = "Lead", company = "Firma", cvSelection = selection }), HttpStatusCode.OK);
        await Created(await account.Client.PutAsync("/api/profile/guide-answers", new { situation = "working", yearsOfExperience = 7, plan = "same_field", region = "de" }), HttpStatusCode.OK);
        await Created(await account.Client.PutAsync("/api/profile/cv-content-settings", new { useSuggestion = false, overrides = new { hiddenSections = new[] { "skills" } } }), HttpStatusCode.OK);
        var applicationBefore = (await (await account.Client.GetAsync($"/api/applications/{account.ApplicationId}")).JsonAsync()).GetProperty("cvSelection").ToString();
        var created = await (await Created(await admin.PostAsync("/api/admin/backups"), HttpStatusCode.Created)).JsonAsync();

        // Change both after the backup was taken
        await Created(await account.Client.PutAsync($"/api/applications/{account.ApplicationId}", new { jobTitle = "Lead", company = "Firma", cvSelection = new { hiddenSections = new[] { "skills" } } }), HttpStatusCode.OK);
        await Created(await account.Client.PutAsync("/api/profile/guide-answers", new { situation = "school" }), HttpStatusCode.OK);
        await Created(await account.Client.PutAsync("/api/profile/cv-content-settings", new { useSuggestion = true }), HttpStatusCode.OK);

        await Created(await admin.PostAsync($"/api/admin/backups/{created.GetProperty("id").GetString()}/restore", Credentials), HttpStatusCode.OK);

        var user = await SignInAsync(account.Username);
        var applicationAfter = await (await Created(await user.GetAsync($"/api/applications/{account.ApplicationId}"), HttpStatusCode.OK)).JsonAsync();
        Assert.Equal(applicationBefore, applicationAfter.GetProperty("cvSelection").ToString());
        Assert.Equal("short", applicationAfter.GetProperty("cvSelection").GetProperty("experiences").GetProperty(station.GetProperty("id").GetString()!).GetString());
        var answers = await (await Created(await user.GetAsync("/api/profile/guide-answers"), HttpStatusCode.OK)).JsonAsync();
        Assert.Equal("working", answers.GetProperty("situation").GetString());
        Assert.Equal(7, answers.GetProperty("yearsOfExperience").GetInt32());
        var settings = (await (await Created(await user.GetAsync("/api/profile"), HttpStatusCode.OK)).JsonAsync()).GetProperty("cvContentSettings");
        Assert.False(settings.GetProperty("useSuggestion").GetBoolean());
        Assert.Equal(["skills"], settings.GetProperty("overrides").GetProperty("hiddenSections").EnumerateArray().Select(x => x.GetString()));
    }

    [Fact]
    public async Task Round_trip_brings_back_every_file_and_row()
    {
        var admin = await server.AdminAsync();
        var account = await CreateAccountWithFilesAsync(admin, "rundlauf");
        var tree = Tree();
        Assert.Contains(tree.Keys, k => k.StartsWith("photos/", StringComparison.Ordinal));
        Assert.Contains(tree.Keys, k => k.StartsWith("signatures/", StringComparison.Ordinal));
        Assert.Contains(tree.Keys, k => k.StartsWith("attachments/", StringComparison.Ordinal));
        Assert.Contains(tree.Keys, k => k.StartsWith("applications/", StringComparison.Ordinal));

        var created = await (await Created(await admin.PostAsync("/api/admin/backups"), HttpStatusCode.Created)).JsonAsync();
        Assert.Equal("archive", created.GetProperty("format").GetString());
        Assert.EndsWith(".zip", created.GetProperty("file").GetString());
        var id = created.GetProperty("id").GetString();

        // Delete through the API, take the rest away by hand, add something that must vanish again
        await Created(await account.Client.DeleteAsync($"/api/attachments/{account.AttachmentId}"), HttpStatusCode.NoContent);
        await Created(await account.Client.DeleteAsync("/api/profile/photo"), HttpStatusCode.NoContent);
        await Created(await account.Client.DeleteAsync($"/api/cover-letters/{account.LetterId}"), HttpStatusCode.NoContent);
        await Created(await account.Client.DeleteAsync($"/api/applications/{account.ApplicationId}"), HttpStatusCode.NoContent);
        await Created(await UploadFile(account.Client, "/api/attachments", "file", Pdf, "neu.pdf", "application/pdf"), HttpStatusCode.Created);
        await server.UserAsync(admin, "danach");

        await Created(await admin.PostAsync($"/api/admin/backups/{id}/restore", Credentials), HttpStatusCode.OK);

        AssertSameTree(tree, Tree());
        AssertNoRestoreLeftovers();
        var user = await SignInAsync(account.Username);
        Assert.Equal(Png, await (await Created(await user.GetAsync("/api/profile/photo"), HttpStatusCode.OK)).Content.ReadAsByteArrayAsync(Ct));
        Assert.Equal(Pdf, await (await Created(await user.GetAsync($"/api/attachments/{account.AttachmentId}/file"), HttpStatusCode.OK)).Content.ReadAsByteArrayAsync(Ct));
        Assert.Single((await (await user.GetAsync("/api/attachments")).JsonAsync()).EnumerateArray());
        Assert.Equal(HttpStatusCode.OK, (await user.GetAsync($"/api/cover-letters/{account.LetterId}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await user.GetAsync($"/api/applications/{account.ApplicationId}")).StatusCode);
        Assert.DoesNotContain("danach", await UsernamesAsync(await server.AdminAsync()));
    }

    [Fact]
    public async Task The_archive_holds_manifest_database_and_files_but_never_the_keys()
    {
        var admin = await server.AdminAsync();
        await CreateAccountWithFilesAsync(admin, "inhalt");
        var entries = BackupFiles.Entries(await CurrentArchiveAsync(admin));
        Assert.Contains(BackupFiles.Manifest, entries.Keys);
        Assert.Contains(BackupFiles.Database, entries.Keys);
        Assert.DoesNotContain(entries.Keys, k => k.StartsWith("keys", StringComparison.Ordinal) || k.StartsWith("backups", StringComparison.Ordinal));

        var manifest = System.Text.Json.JsonDocument.Parse(entries[BackupFiles.Manifest]).RootElement;
        Assert.Equal(1, manifest.GetProperty("formatVersion").GetInt32());
        Assert.False(string.IsNullOrEmpty(manifest.GetProperty("appVersion").GetString()));
        Assert.StartsWith("2026", manifest.GetProperty("schemaVersion").GetString());
        Assert.Equal(entries.Count - 1, manifest.GetProperty("files").GetArrayLength());
    }

    [Fact]
    public async Task A_changed_file_counts_as_a_change_even_when_the_database_is_the_same()
    {
        var admin = await server.AdminAsync();
        await server.UserAsync(admin, "aenderung");
        await admin.PostAsync("/api/admin/backups");
        Assert.Equal("backup.unchanged", await (await admin.PostAsync("/api/admin/backups")).CodeAsync());

        var folder = Path.Combine(server.DataDir, "attachments", "manuell");
        Directory.CreateDirectory(folder);
        var file = Path.Combine(folder, "neu.pdf");
        await File.WriteAllBytesAsync(file, Pdf, Ct);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsync("/api/admin/backups")).StatusCode);
        Assert.Equal("backup.unchanged", await (await admin.PostAsync("/api/admin/backups")).CodeAsync());

        await File.WriteAllBytesAsync(file, [.. Pdf, 1], Ct);
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsync("/api/admin/backups")).StatusCode);
    }

    [Theory]
    [InlineData("../evil.txt")]
    [InlineData("photos/../../evil.txt")]
    [InlineData("/etc/evil.txt")]
    [InlineData("C:/evil.txt")]
    [InlineData("photos\\..\\..\\evil.txt")]
    [InlineData("keys/jwt-signing.key")]
    [InlineData("backups/recent/x.zip")]
    [InlineData("anything.txt")]
    [InlineData("photos/nul.txt")]
    public async Task Archives_with_paths_outside_the_expected_folders_are_refused(string name)
    {
        var admin = await server.AdminAsync();
        var genuine = await CurrentArchiveAsync(admin);
        var before = Tree();
        var crafted = BackupFiles.Repack(genuine, entries => entries[name] = "boese"u8.ToArray());

        var response = await UploadBackup(admin, crafted);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.Equal("backup.invalid", problem.GetProperty("code").GetString());
        Assert.Equal("invalid_archive", problem.GetProperty("params").GetProperty("reason").GetString());
        Assert.False(File.Exists(Path.Combine(server.DataDir, "evil.txt")));
        Assert.False(File.Exists(Path.Combine(Path.GetDirectoryName(server.DataDir)!, "evil.txt")));
        AssertSameTree(before, Tree());
    }

    [Fact]
    public async Task Archives_with_links_or_a_manifest_that_does_not_match_are_refused()
    {
        var admin = await server.AdminAsync();
        var genuine = await CurrentArchiveAsync(admin);
        var uploadedBefore = (await (await admin.GetAsync("/api/admin/backups")).JsonAsync()).EnumerateArray().Count(e => e.GetProperty("tier").GetString() == "uploaded");

        var cases = new Dictionary<string, byte[]>
        {
            ["symlink"] = BackupFiles.Repack(genuine, e => e["photos/link.png"] = "keys/jwt-signing.key"u8.ToArray(), entryChange: entry =>
            {
                if (entry.FullName == "photos/link.png") entry.ExternalAttributes = unchecked((int)0xA1FF0000);
            }),
            ["wrong hash"] = BackupFiles.Repack(genuine, e => e["photos/a.png"] = Png, manifest: m => m["files"]!.AsArray().First(f => (string?)f!["path"] == "photos/a.png")!["sha256"] = new string('0', 64)),
            ["wrong size"] = BackupFiles.Repack(genuine, e => e["photos/a.png"] = Png, manifest: m => m["files"]!.AsArray().First(f => (string?)f!["path"] == "photos/a.png")!["size"] = 1),
            ["entry not in manifest"] = BackupFiles.Repack(genuine, e => e["photos/a.png"] = Png, manifest: m => m["files"]!.AsArray().Remove(m["files"]!.AsArray().First(f => (string?)f!["path"] == "photos/a.png"))),
            ["manifest names a missing entry"] = BackupFiles.Repack(genuine, manifest: m => m["files"]!.AsArray().Add(new System.Text.Json.Nodes.JsonObject { ["path"] = "photos/x.png", ["size"] = 1, ["sha256"] = new string('0', 64) })),
            ["wrong schema version"] = BackupFiles.Repack(genuine, manifest: m => m["schemaVersion"] = "20000101000000_Other"),
            ["no database"] = BackupFiles.Repack(genuine, e => e.Remove(BackupFiles.Database)),
            ["no manifest"] = RemoveManifest(genuine),
            ["bomb below its claimed size"] = BackupFiles.ClaimSize(
                BackupFiles.Repack(genuine, e => e["photos/bomb.bin"] = new byte[3 * 1024 * 1024], manifest: m => m["files"]!.AsArray().First(f => (string?)f!["path"] == "photos/bomb.bin")!["size"] = 10),
                "photos/bomb.bin", 10),
        };
        foreach (var (name, crafted) in cases)
        {
            var response = await UploadBackup(admin, crafted);
            Assert.True(response.StatusCode == HttpStatusCode.BadRequest, $"{name}: {response.StatusCode}");
            Assert.Equal("invalid_archive", (await response.JsonAsync()).GetProperty("params").GetProperty("reason").GetString());
        }
        Assert.Equal(uploadedBefore, (await (await admin.GetAsync("/api/admin/backups")).JsonAsync()).EnumerateArray().Count(e => e.GetProperty("tier").GetString() == "uploaded"));
    }

    private static byte[] RemoveManifest(byte[] archive)
    {
        var entries = BackupFiles.Entries(archive);
        using var output = new MemoryStream();
        using (var zip = new System.IO.Compression.ZipArchive(output, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, data) in entries.Where(e => e.Key != BackupFiles.Manifest))
            {
                using var stream = zip.CreateEntry(name).Open();
                stream.Write(data);
            }
        }
        return output.ToArray();
    }

    [Fact]
    public async Task An_archive_of_a_newer_format_or_schema_is_too_new_and_a_foreign_schema_is_refused()
    {
        var admin = await server.AdminAsync();
        var genuine = await CurrentArchiveAsync(admin);

        var format = await UploadBackup(admin, BackupFiles.Repack(genuine, manifest: m => m["formatVersion"] = 99));
        Assert.Equal(HttpStatusCode.Conflict, format.StatusCode);
        Assert.Equal("backup.too_new", await format.CodeAsync());

        var schema = await UploadBackup(admin, BackupFiles.Repack(genuine, e => e[BackupFiles.Database] = BackupFiles.EditDatabase(e[BackupFiles.Database],
            "INSERT INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\") VALUES ('29991231000000_Future', '99.0')")));
        Assert.Equal(HttpStatusCode.Conflict, schema.StatusCode);
        Assert.Equal("backup.too_new", await schema.CodeAsync());

        var trigger = await UploadBackup(admin, BackupFiles.Repack(genuine, e => e[BackupFiles.Database] = BackupFiles.EditDatabase(e[BackupFiles.Database],
            "CREATE TRIGGER evil AFTER INSERT ON sessions BEGIN UPDATE users SET \"Role\" = 'admin'; END")));
        Assert.Equal(HttpStatusCode.BadRequest, trigger.StatusCode);
        Assert.Equal("schema_mismatch", (await trigger.JsonAsync()).GetProperty("params").GetProperty("reason").GetString());
    }

    [Fact]
    public async Task An_old_database_only_backup_is_listed_as_such_and_restores_without_touching_the_files()
    {
        var admin = await server.AdminAsync();
        var account = await CreateAccountWithFilesAsync(admin, "altedb");
        var database = BackupFiles.DatabaseOf(await CurrentArchiveAsync(admin));

        var uploaded = await (await Created(await UploadBackup(admin, database, "alt.db"), HttpStatusCode.Created)).JsonAsync();
        Assert.Equal("database", uploaded.GetProperty("format").GetString());
        Assert.EndsWith(".db", uploaded.GetProperty("file").GetString());
        var id = uploaded.GetProperty("id").GetString();
        var listed = (await (await admin.GetAsync("/api/admin/backups")).JsonAsync()).EnumerateArray().Single(e => e.GetProperty("id").GetString() == id);
        Assert.Equal("database", listed.GetProperty("format").GetString());

        // A file that came after the backup, and one that went away: the restore must leave both situations as they are
        await Created(await UploadFile(account.Client, "/api/attachments", "file", Pdf, "spaeter.pdf", "application/pdf"), HttpStatusCode.Created);
        await Created(await account.Client.DeleteAsync("/api/profile/photo"), HttpStatusCode.NoContent);
        var tree = Tree();

        await Created(await admin.PostAsync($"/api/admin/backups/{id}/restore", Credentials), HttpStatusCode.OK);

        AssertSameTree(tree, Tree());
        var user = await SignInAsync(account.Username);
        Assert.Single((await (await user.GetAsync("/api/attachments")).JsonAsync()).EnumerateArray());
        // The row is back, its file is not: an ordinary missing file
        Assert.Equal(HttpStatusCode.NotFound, (await user.GetAsync("/api/profile/photo")).StatusCode);

        // The download keeps its own form
        var again = await server.AdminAsync();
        var download = await Created(await again.PostAsync($"/api/admin/backups/{id}/download", Credentials), HttpStatusCode.OK);
        Assert.Equal("application/vnd.sqlite3", download.Content.Headers.ContentType?.MediaType);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task A_failure_in_the_middle_of_a_restore_leaves_the_previous_state_complete(bool afterSwap)
    {
        var admin = await server.AdminAsync();
        var account = await CreateAccountWithFilesAsync(admin, afterSwap ? "abbruch1" : "abbruch2");
        var id = (await (await Created(await admin.PostAsync("/api/admin/backups"), HttpStatusCode.Created)).JsonAsync()).GetProperty("id").GetString();

        await Created(await UploadFile(account.Client, "/api/attachments", "file", Pdf, "danach.pdf", "application/pdf"), HttpStatusCode.Created);
        await Created(await account.Client.DeleteAsync("/api/profile/photo"), HttpStatusCode.NoContent);
        var tree = Tree();
        var attachments = (await (await account.Client.GetAsync("/api/attachments")).JsonAsync()).EnumerateArray().Count();

        var restore = server.Factory.Services.GetRequiredService<RestoreService>();
        Func<Task> fail = () => throw new IOException("simulated failure");
        if (afterSwap) restore.AfterSwapForTests = fail;
        else restore.AfterCopyForTests = fail;
        HttpResponseMessage response;
        try
        {
            response = await admin.PostAsync($"/api/admin/backups/{id}/restore", Credentials);
        }
        finally
        {
            restore.AfterSwapForTests = null;
            restore.AfterCopyForTests = null;
        }

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.Equal("backup.restore_failed", problem.GetProperty("code").GetString());
        Assert.True(problem.GetProperty("params").GetProperty("rolledBack").GetBoolean());
        AssertSameTree(tree, Tree());
        AssertNoRestoreLeftovers();
        Assert.Equal(attachments, (await (await account.Client.GetAsync("/api/attachments")).JsonAsync()).EnumerateArray().Count());
        Assert.Equal(HttpStatusCode.NotFound, (await account.Client.GetAsync("/api/profile/photo")).StatusCode);
        // The safety backup is complete as well
        var safety = problem.GetProperty("params").GetProperty("safetyBackupId").GetString();
        var bytes = await (await Created(await admin.PostAsync($"/api/admin/backups/{safety}/download", Credentials), HttpStatusCode.OK)).Content.ReadAsByteArrayAsync(Ct);
        Assert.Contains(BackupFiles.Entries(bytes).Keys, k => k.StartsWith("attachments/", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Deleting_an_account_removes_all_its_files_and_nobody_elses()
    {
        var admin = await server.AdminAsync();
        var other = await CreateAccountWithFilesAsync(admin, "bleibt");
        var doomed = await CreateAccountWithFilesAsync(admin, "geht");
        var compact = Guid.Parse(doomed.Id).ToString("N");
        bool Belongs(string path) => path.Contains(doomed.Id, StringComparison.OrdinalIgnoreCase) || path.Contains(compact, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(4, Tree().Keys.Count(Belongs));
        var others = Tree().Keys.Where(k => !Belongs(k)).ToList();

        await Created(await admin.DeleteAsync($"/api/admin/users/{doomed.Id}"), HttpStatusCode.NoContent);

        Assert.DoesNotContain(Tree().Keys, Belongs);
        Assert.False(Directory.Exists(Path.Combine(server.DataDir, "attachments", compact)));
        Assert.Equal(others.Order(StringComparer.Ordinal), Tree().Keys.Order(StringComparer.Ordinal));
        Assert.Equal(HttpStatusCode.OK, (await other.Client.GetAsync("/api/profile/photo")).StatusCode);
    }

    [Theory]
    [InlineData("../outside-marker.txt")]
    [InlineData("photos/../../outside-marker.txt")]
    [InlineData("photos/../keys/marker.txt")]
    [InlineData("keys/marker.txt")]
    [InlineData("app.db")]
    public async Task A_crafted_path_in_the_database_never_leaves_its_folder(string hostile)
    {
        var outside = Path.Combine(Path.GetDirectoryName(server.DataDir)!, "outside-marker.txt");
        var insideKeys = Path.Combine(server.DataDir, "keys", "marker.txt");
        await File.WriteAllTextAsync(outside, "geheim", Ct);
        await File.WriteAllTextAsync(insideKeys, "geheim", Ct);
        try
        {
            var admin = await server.AdminAsync();
            var account = await CreateAccountWithFilesAsync(admin, "pfad" + Guid.NewGuid().ToString("N")[..8]);
            var id = $"'{account.Id.ToUpperInvariant()}', '{account.Id}'";
            var stored = hostile.Replace("photos/", "PREFIX/", StringComparison.Ordinal);
            Sql($"UPDATE profiles SET \"PhotoPath\" = '{hostile}' WHERE \"UserId\" IN ({id})");
            Sql($"UPDATE attachments SET \"StoragePath\" = '{stored.Replace("PREFIX/", "attachments/", StringComparison.Ordinal)}' WHERE \"UserId\" IN ({id})");
            Sql($"UPDATE cover_letters SET \"SignaturePath\" = '{stored.Replace("PREFIX/", "signatures/", StringComparison.Ordinal)}' WHERE \"UserId\" IN ({id})");
            Sql($"UPDATE applications SET \"ArchivedPdfPath\" = '{stored.Replace("PREFIX/", "applications/", StringComparison.Ordinal)}' WHERE \"UserId\" IN ({id})");

            Assert.Equal(HttpStatusCode.NotFound, (await account.Client.GetAsync("/api/profile/photo")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await account.Client.GetAsync($"/api/attachments/{account.AttachmentId}/file")).StatusCode);
            // Documents render as if the file were missing
            Assert.Equal(HttpStatusCode.OK, (await account.Client.PostAsync($"/api/cover-letters/{account.LetterId}/preview/pdf", new { })).StatusCode);
            // The archive path is bad, so the archive counts as lost: the download says so instead of quietly handing out a new render
            var dossier = await account.Client.GetAsync($"/api/applications/{account.ApplicationId}/dossier/download");
            Assert.Equal(HttpStatusCode.Conflict, dossier.StatusCode);
            Assert.Equal("archive.missing", await dossier.CodeAsync());
            Assert.True((await dossier.Content.ReadAsByteArrayAsync(Ct)).AsSpan().IndexOf("geheim"u8) < 0);
            // The preview of the lost archive says so as well, and the live state renders as if the files were missing
            var lost = await account.Client.GetAsync($"/api/applications/{account.ApplicationId}/dossier/preview");
            Assert.Equal(HttpStatusCode.Conflict, lost.StatusCode);
            Assert.Equal("archive.missing", await lost.CodeAsync());
            var preview = await account.Client.GetAsync($"/api/applications/{account.ApplicationId}/dossier/preview?version=current");
            Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
            Assert.True((await preview.Content.ReadAsByteArrayAsync(Ct)).AsSpan().IndexOf("geheim"u8) < 0);

            // Deleting the rows must not delete what the paths point at
            Assert.Equal(HttpStatusCode.NoContent, (await account.Client.DeleteAsync("/api/profile/photo")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await account.Client.DeleteAsync($"/api/attachments/{account.AttachmentId}")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await account.Client.DeleteAsync($"/api/cover-letters/{account.LetterId}")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await account.Client.DeleteAsync($"/api/applications/{account.ApplicationId}")).StatusCode);
            Assert.True(File.Exists(outside));
            Assert.True(File.Exists(insideKeys));
            Assert.True(File.Exists(Path.Combine(server.DataDir, "app.db")));
        }
        finally
        {
            File.Delete(outside);
            File.Delete(insideKeys);
        }
    }

    [Fact]
    public async Task A_crafted_path_inside_a_restored_backup_stays_harmless()
    {
        var admin = await server.AdminAsync();
        var account = await CreateAccountWithFilesAsync(admin, "praepariert");
        var id = $"'{account.Id.ToUpperInvariant()}', '{account.Id}'";
        var crafted = BackupFiles.Repack(await CurrentArchiveAsync(admin), e => e[BackupFiles.Database] = BackupFiles.EditDatabase(e[BackupFiles.Database],
            $"UPDATE profiles SET \"PhotoPath\" = 'keys/jwt-signing.key' WHERE \"UserId\" IN ({id})"));
        var uploaded = await (await Created(await UploadBackup(admin, crafted), HttpStatusCode.Created)).JsonAsync();
        await Created(await admin.PostAsync($"/api/admin/backups/{uploaded.GetProperty("id").GetString()}/restore", Credentials), HttpStatusCode.OK);

        var user = await SignInAsync(account.Username);
        Assert.Equal(HttpStatusCode.NotFound, (await user.GetAsync("/api/profile/photo")).StatusCode);
    }

    [Fact]
    public async Task A_new_signature_is_stored_relative_and_still_renders()
    {
        var admin = await server.AdminAsync();
        var account = await CreateAccountWithFilesAsync(admin, "unterschrift");
        using var scope = server.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var userId = Guid.Parse(account.Id);
        var path = (await db.CoverLetters.SingleAsync(c => c.UserId == userId, Ct)).SignaturePath;
        Assert.StartsWith("signatures/", path);
        Assert.False(Path.IsPathRooted(path));
        var preview = await account.Client.PostAsync($"/api/cover-letters/{account.LetterId}/preview/pdf", new { });
        Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
    }

    [Fact]
    public async Task Replacing_a_photo_leaves_exactly_one_file()
    {
        var admin = await server.AdminAsync();
        var account = await CreateAccountWithFilesAsync(admin, "ersetzen");
        await Created(await UploadFile(account.Client, "/api/profile/photo", "photo", Png, "foto2.png", "image/png"), HttpStatusCode.OK);
        Assert.Single(Directory.GetFiles(Path.Combine(server.DataDir, "photos"), account.Id + "*"));
    }

    [Fact]
    public async Task An_api_key_that_cannot_be_decrypted_is_reported_instead_of_sent_empty()
    {
        var admin = await server.AdminAsync();
        var (user, id) = await server.UserAsync(admin, "kischluessel");
        var saved = await user.PutAsync("/api/ai/config", new { provider = "openai", model = "gpt-4o-mini", apiKey = "sk-test-key", pseudonymize = true });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Sql($"UPDATE user_ai_configs SET \"ApiKeyProtected\" = 'CfDJ8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' WHERE \"UserId\" IN ('{id.ToUpperInvariant()}', '{id}')");

        var test = await user.PostAsync("/api/ai/test-connection", new { });
        Assert.Equal(HttpStatusCode.Conflict, test.StatusCode);
        Assert.Equal("ai.key_unavailable", await test.CodeAsync());
    }

    [Fact]
    public async Task Parallel_first_requests_create_one_profile()
    {
        var admin = await server.AdminAsync();
        var (user, id) = await server.UserAsync(admin, "erstesprofil");
        var answers = await Task.WhenAll(Enumerable.Range(0, 24).Select(_ => user.GetAsync("/api/profile")));
        Assert.All(answers, a => Assert.Equal(HttpStatusCode.OK, a.StatusCode));

        using var scope = server.Factory.Services.CreateScope();
        var userId = Guid.Parse(id);
        Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<AppDbContext>().Profiles.CountAsync(p => p.UserId == userId, Ct));
    }

    [Fact]
    public async Task Parallel_first_requests_of_many_accounts_all_succeed()
    {
        // Ten accounts with thirty simultaneous first requests each: every loser of a race for the one-profile-per-account rule has to
        // find the winner's profile, whatever the load - never an error answer, never a second profile.
        var admin = await server.AdminAsync();
        var accounts = new List<(TestClient Client, string Id)>();
        for (var i = 0; i < 10; i++) accounts.Add(await server.UserAsync(admin, $"massenstart{i}"));
        var answers = await Task.WhenAll(accounts.SelectMany(a => Enumerable.Range(0, 30).Select(_ => a.Client.GetAsync("/api/profile"))));
        Assert.All(answers, a => Assert.Equal(HttpStatusCode.OK, a.StatusCode));

        using var scope = server.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        foreach (var (_, id) in accounts) Assert.Equal(1, await db.Profiles.CountAsync(p => p.UserId == Guid.Parse(id), Ct));
    }

    [Fact]
    public async Task Attachment_positions_stay_unique()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "reihenfolge");
        async Task<string> AddAsync(string name) => (await (await Created(await UploadFile(user, "/api/attachments", "file", Pdf, name, "application/pdf"), HttpStatusCode.Created)).JsonAsync()).GetProperty("id").GetString()!;
        async Task<List<int>> PositionsAsync() => (await (await user.GetAsync("/api/attachments")).JsonAsync()).EnumerateArray().Select(a => a.GetProperty("sortOrder").GetInt32()).ToList();

        var first = await AddAsync("a.pdf");
        await AddAsync("b.pdf");
        await AddAsync("c.pdf");
        await Created(await user.DeleteAsync($"/api/attachments/{first}"), HttpStatusCode.NoContent);
        await AddAsync("d.pdf");
        Assert.Equal(3, (await PositionsAsync()).Distinct().Count());

        var parallel = await Task.WhenAll(Enumerable.Range(0, 12).Select(i => UploadFile(user, "/api/attachments", "file", Pdf, $"p{i}.pdf", "application/pdf")));
        Assert.All(parallel, r => Assert.Equal(HttpStatusCode.Created, r.StatusCode));
        var all = await PositionsAsync();
        Assert.Equal(all.Count, all.Distinct().Count());

        // A partial reorder must not leave two on one position either
        var ids = (await (await user.GetAsync("/api/attachments")).JsonAsync()).EnumerateArray().Select(a => a.GetProperty("id").GetString()).ToList();
        await Created(await user.PutAsync("/api/attachments/reorder", new { ids = new[] { ids[^1], ids[0] } }), HttpStatusCode.OK);
        var afterReorder = await PositionsAsync();
        Assert.Equal(all.Count, afterReorder.Distinct().Count());
    }
}

/// <summary>A server with low limits: what a zip bomb would run into.</summary>
public sealed class LowBackupLimitsFixture : ServerFixture
{
    protected override Dictionary<string, string?> Settings
    {
        get
        {
            var settings = base.Settings;
            settings["Backups:MaxSizeMegabytes"] = "4";
            settings["Backups:MaxFiles"] = "5";
            return settings;
        }
    }
}

public sealed class BackupLimitTests(LowBackupLimitsFixture server) : IClassFixture<LowBackupLimitsFixture>
{
    private static readonly object Credentials = new { password = ServerFixture.AdminPassword };

    private static async Task<HttpResponseMessage> Upload(TestClient admin, byte[] content)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(file, "file", "backup.zip");
        form.Add(new StringContent(ServerFixture.AdminPassword), "password");
        return await admin.SendAsync(new HttpRequestMessage(HttpMethod.Post, "/api/admin/backups/upload") { Content = form });
    }

    private async Task<byte[]> GenuineAsync(TestClient admin)
    {
        var response = await admin.PostAsync("/api/admin/backups/current/download", Credentials);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
    }

    [Fact]
    public async Task An_archive_that_unpacks_beyond_the_limit_is_refused_before_unpacking()
    {
        var admin = await server.AdminAsync();
        var crafted = BackupFiles.Repack(await GenuineAsync(admin), e => e["attachments/x/bomb.bin"] = new byte[5 * 1024 * 1024]);
        Assert.True(crafted.Length < 2 * 1024 * 1024);

        var response = await Upload(admin, crafted);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        var problem = await response.JsonAsync();
        Assert.Equal("backup.too_large", problem.GetProperty("code").GetString());
        Assert.Equal(4, problem.GetProperty("params").GetProperty("maxMegabytes").GetInt32());
    }

    [Fact]
    public async Task An_archive_with_too_many_entries_is_refused()
    {
        var admin = await server.AdminAsync();
        var crafted = BackupFiles.Repack(await GenuineAsync(admin), e =>
        {
            for (var i = 0; i < 20; i++) e[$"photos/{i}.png"] = [1];
        });
        var response = await Upload(admin, crafted);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Equal("backup.too_large", await response.CodeAsync());
    }

    [Fact]
    public async Task An_upload_over_the_limit_is_cut_off_while_it_arrives()
    {
        var admin = await server.AdminAsync();
        var response = await Upload(admin, new byte[5 * 1024 * 1024]);
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Empty(Directory.GetFiles(Path.Combine(server.DataDir, "backups", "incoming")));
    }

    [Fact]
    public async Task A_backup_beyond_the_limits_fails_loudly_instead_of_being_unrestorable()
    {
        var admin = await server.AdminAsync();
        var folder = Path.Combine(server.DataDir, "attachments", "viel");
        Directory.CreateDirectory(folder);
        try
        {
            for (var i = 0; i < 10; i++) await File.WriteAllBytesAsync(Path.Combine(folder, $"{i}.pdf"), [1], TestContext.Current.CancellationToken);
            var response = await admin.PostAsync("/api/admin/backups");
            Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
            Assert.Equal("backup.failed", await response.CodeAsync());
        }
        finally
        {
            Directory.Delete(folder, recursive: true);
        }
    }
}

public sealed class DataFilesTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "cv-datafiles-tests", Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        TestFiles.DeleteDirectory(_root);
    }

    private DataFiles Files() => new(new ServerSettings { Mode = HostMode.Server, DataDirectory = _root, BackupDirectory = Path.Combine(_root, "backups"), Channel = "dev" }, NullLogger<DataFiles>.Instance);

    [Theory]
    [InlineData("photos/a.png", true)]
    [InlineData("attachments/abc/a.pdf", true)]
    [InlineData("", false)]
    [InlineData("/photos/a.png", false)]
    [InlineData("C:/photos/a.png", false)]
    [InlineData("photos\\a.png", false)]
    [InlineData("photos/../a.png", false)]
    [InlineData("photos/./a.png", false)]
    [InlineData("photos//a.png", false)]
    [InlineData("photos/a.png.", false)]
    [InlineData("photos/a.png ", false)]
    [InlineData("photos/a:b.png", false)]
    [InlineData("photos/CON", false)]
    [InlineData("photos/lpt1.txt", false)]
    [InlineData("photos/a\u0000.png", false)]
    public void Relative_paths_are_judged_by_their_form(string path, bool safe) => Assert.Equal(safe, PathRules.IsSafeRelative(path));

    [Theory]
    [InlineData("attachments/a.pdf")]
    [InlineData("photos")]
    [InlineData("photosx/a.png")]
    public void A_stored_path_has_to_be_inside_its_own_folder(string stored) => Assert.Null(PathRules.Confine(_root, DataAreas.PhotosFolder, stored));

    [Fact]
    public async Task A_failing_commit_removes_the_new_file_and_keeps_the_old_one()
    {
        var files = Files();
        var old = await files.SaveAsync(DataArea.Photos, "old.png", "alt"u8.ToArray(), null, _ => Task.CompletedTask, TestContext.Current.CancellationToken);
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            files.SaveAsync(DataArea.Photos, "new.png", "neu"u8.ToArray(), old, _ => throw new InvalidOperationException("commit failed"), TestContext.Current.CancellationToken));

        Assert.Equal(["old.png"], Directory.GetFiles(Path.Combine(_root, "photos")).Select(Path.GetFileName));
        Assert.Equal("alt", await File.ReadAllTextAsync(files.Resolve(DataArea.Photos, old)!, TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task After_the_commit_the_old_file_goes_and_no_temporary_file_stays()
    {
        var files = Files();
        var old = await files.SaveAsync(DataArea.Photos, "old.png", "alt"u8.ToArray(), null, _ => Task.CompletedTask, TestContext.Current.CancellationToken);
        string? seenDuringCommit = null;
        var stored = await files.SaveAsync(DataArea.Photos, "new.png", "neu"u8.ToArray(), old, value =>
        {
            // Both files exist while the database commits
            seenDuringCommit = files.Resolve(DataArea.Photos, value);
            Assert.NotNull(files.Resolve(DataArea.Photos, old));
            return Task.CompletedTask;
        }, TestContext.Current.CancellationToken);

        Assert.Equal("photos/new.png", stored);
        Assert.NotNull(seenDuringCommit);
        Assert.Equal(["new.png"], Directory.GetFiles(Path.Combine(_root, "photos")).Select(Path.GetFileName));
    }

    [Fact]
    public async Task Deletions_wait_while_a_backup_runs()
    {
        var files = Files();
        var stored = await files.SaveAsync(DataArea.Photos, "a.png", "x"u8.ToArray(), null, _ => Task.CompletedTask, TestContext.Current.CancellationToken);
        var path = files.Resolve(DataArea.Photos, stored)!;
        using (files.HoldDeletes())
        {
            files.Delete(DataArea.Photos, stored);
            Assert.True(File.Exists(path));
        }
        Assert.False(File.Exists(path));
    }

    [Fact]
    public async Task A_temporary_file_is_not_part_of_a_backup_and_a_link_is_not_followed()
    {
        var files = Files();
        var stored = await files.SaveAsync(DataArea.Photos, "a.png", "x"u8.ToArray(), null, _ => Task.CompletedTask, TestContext.Current.CancellationToken);
        await File.WriteAllTextAsync(Path.Combine(_root, "photos", DataFiles.TempPrefix + "halb"), "y", TestContext.Current.CancellationToken);
        var secret = Path.Combine(_root, "secret.txt");
        await File.WriteAllTextAsync(secret, "z", TestContext.Current.CancellationToken);
        var link = Path.Combine(_root, "photos", "link.png");
        var linked = true;
        try
        {
            File.CreateSymbolicLink(link, secret);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // Creating links needs a privilege on Windows; the rest of the test still holds
            linked = false;
        }

        var listed = files.ListForBackup(TestContext.Current.CancellationToken).Select(f => f.RelativePath).ToList();
        Assert.Equal([stored], listed);
        if (linked) Assert.Null(files.Resolve(DataArea.Photos, "photos/link.png"));
    }
}

public sealed class RestoreWorkspaceTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "cv-restore-tests", Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        TestFiles.DeleteDirectory(_root);
    }

    private static void CreateDatabase(string file, string value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        using var connection = new SqliteConnection($"Data Source={file};Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = $"CREATE TABLE t (x TEXT); INSERT INTO t VALUES ('{value}'); PRAGMA journal_mode = DELETE;";
        command.ExecuteNonQuery();
    }

    private static string Value(string file)
    {
        using var connection = new SqliteConnection($"Data Source={file};Pooling=False");
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT x FROM t";
        return (string)command.ExecuteScalar()!;
    }

    [Fact]
    public void A_restore_cut_off_by_a_crash_is_rolled_back_at_the_next_start()
    {
        var database = Path.Combine(_root, "app.db");
        CreateDatabase(database, "alt");
        Directory.CreateDirectory(Path.Combine(_root, "photos"));
        File.WriteAllText(Path.Combine(_root, "photos", "alt.png"), "alt");

        var workspace = RestoreWorkspace.Create(_root);
        CreateDatabase(workspace.IncomingDatabase, "neu");
        Directory.CreateDirectory(Path.Combine(workspace.Incoming, "photos"));
        File.WriteAllText(Path.Combine(workspace.Incoming, "photos", "neu.png"), "neu");
        Directory.CreateDirectory(Path.Combine(workspace.Incoming, "signatures"));
        File.WriteAllText(Path.Combine(workspace.Incoming, "signatures", "neu.png"), "neu");

        BackupService.Snapshot(database, workspace.RollbackDatabase);
        workspace.Begin(replaceFiles: true);
        workspace.SwapFiles();
        RestoreWorkspace.CopyDatabase(workspace.IncomingDatabase, database);
        Assert.Equal("neu", Value(database));
        Assert.True(File.Exists(Path.Combine(_root, "photos", "neu.png")));

        // The process dies here; the next start finds the journal
        RestoreWorkspace.RecoverIfNeeded(_root, NullLogger.Instance);

        Assert.Equal("alt", Value(database));
        Assert.Equal(["alt.png"], Directory.GetFiles(Path.Combine(_root, "photos")).Select(Path.GetFileName));
        Assert.False(Directory.Exists(Path.Combine(_root, "signatures")));
        Assert.False(Directory.Exists(Path.Combine(_root, RestoreWorkspace.WorkRootName)));
    }

    [Fact]
    public void Leftovers_without_a_journal_are_cleared_and_change_nothing()
    {
        var database = Path.Combine(_root, "app.db");
        CreateDatabase(database, "alt");
        var workspace = RestoreWorkspace.Create(_root);
        CreateDatabase(workspace.IncomingDatabase, "neu");

        RestoreWorkspace.RecoverIfNeeded(_root, NullLogger.Instance);

        Assert.Equal("alt", Value(database));
        Assert.False(Directory.Exists(Path.Combine(_root, RestoreWorkspace.WorkRootName)));
    }
}

public sealed class SignaturePathMigrationTests : IDisposable
{
    private const string Previous = "20261106175718_AddAttachments";

    private readonly string _file = Path.Combine(Path.GetTempPath(), $"cv-migration-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var path in new[] { _file, _file + "-wal", _file + "-shm" }) File.Delete(path);
    }

    [Fact]
    public void Absolute_signature_paths_become_relative_whatever_system_made_them()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(SqliteDatabase.ConnectionString(_file, pooling: false)).Options;
        using var db = new AppDbContext(options);
        db.GetService<IMigrator>().Migrate(Previous);

        using (var connection = new SqliteConnection($"Data Source={_file};Pooling=False;Foreign Keys=False"))
        {
            connection.Open();
            var rows = new (string Id, string? Path)[]
            {
                ("1", "/data/signatures/aaa_bbb.png"),
                ("2", @"C:\Users\someone\AppData\Local\Firma\Produkt\signatures\ccc_ddd.jpg"),
                ("3", "signatures/schon_relativ.png"),
                ("4", null),
                ("5", "/data/signatures/"),
            };
            foreach (var (id, path) in rows)
            {
                using var insert = connection.CreateCommand();
                insert.CommandText = "INSERT INTO cover_letters (\"Id\", \"UserId\", \"Title\", \"RecipientCompany\", \"RecipientCity\", \"Subject\", \"Salutation\", \"Body\", \"Closing\", \"Language\", \"CreatedAt\", \"UpdatedAt\", \"SignaturePath\") VALUES ($id, 'u', 't', 'c', 'c', 's', 's', 'b', 'c', 'de', '2026-01-01', '2026-01-01', $path)";
                insert.Parameters.AddWithValue("$id", id);
                insert.Parameters.AddWithValue("$path", (object?)path ?? DBNull.Value);
                insert.ExecuteNonQuery();
            }
        }

        db.GetService<IMigrator>().Migrate();

        using var check = new SqliteConnection($"Data Source={_file};Pooling=False");
        check.Open();
        using var select = check.CreateCommand();
        select.CommandText = "SELECT \"Id\", \"SignaturePath\" FROM cover_letters ORDER BY \"Id\"";
        using var reader = select.ExecuteReader();
        var result = new Dictionary<string, string?>();
        while (reader.Read()) result[reader.GetString(0)] = reader.IsDBNull(1) ? null : reader.GetString(1);

        Assert.Equal("signatures/aaa_bbb.png", result["1"]);
        Assert.Equal("signatures/ccc_ddd.jpg", result["2"]);
        Assert.Equal("signatures/schon_relativ.png", result["3"]);
        Assert.Null(result["4"]);
        Assert.Null(result["5"]);
    }
}
