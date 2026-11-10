// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Cv.Server.Data;
using Cv.Server.Tests.Support;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace Cv.Server.Tests;

/// <summary>The choices on "Preview and export" are kept per account on the master profile.</summary>
public sealed class PreviewOptionsTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static readonly object Credentials = new { password = ServerFixture.AdminPassword };
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<TestClient> NewUser(string name)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, name);
        return user;
    }

    private async Task SetStored(string username, string? json)
    {
        using var scope = server.Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var profile = await db.Profiles.SingleAsync(p => p.User!.Username == username, Ct);
        profile.PreviewOptionsJson = json;
        await db.SaveChangesAsync(Ct);
    }

    [Fact]
    public async Task Nothing_is_saved_at_first_and_the_choices_come_back_with_the_profile()
    {
        var user = await NewUser("preview-basic");
        var first = await (await user.GetAsync("/api/profile")).JsonAsync();
        Assert.Equal(JsonValueKind.Null, first.GetProperty("previewOptions").ValueKind);

        var saved = await user.PutAsync("/api/profile/preview-options", new
        {
            design = "modern", language = "en", accentColor = "#aa2200", font = "Lora", showPhoto = false, photoShape = "round",
        });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var echoed = await saved.JsonAsync();
        Assert.Equal("modern", echoed.GetProperty("design").GetString());
        Assert.False(echoed.GetProperty("showPhoto").GetBoolean());

        var loaded = (await (await user.GetAsync("/api/profile")).JsonAsync()).GetProperty("previewOptions");
        Assert.Equal("modern", loaded.GetProperty("design").GetString());
        Assert.Equal("en", loaded.GetProperty("language").GetString());
        Assert.Equal("#aa2200", loaded.GetProperty("accentColor").GetString());
        Assert.Equal("Lora", loaded.GetProperty("font").GetString());
        Assert.False(loaded.GetProperty("showPhoto").GetBoolean());
        Assert.Equal("round", loaded.GetProperty("photoShape").GetString());

        // Saving the personal data later does not touch the choices
        await user.PutAsync("/api/profile", new { firstName = "Eva", lastName = "Muster" });
        var after = (await (await user.GetAsync("/api/profile")).JsonAsync()).GetProperty("previewOptions");
        Assert.Equal("modern", after.GetProperty("design").GetString());
    }

    [Fact]
    public async Task Values_are_normalised_like_the_render_options()
    {
        var user = await NewUser("preview-normalise");
        var result = await (await user.PutAsync("/api/profile/preview-options", new
        {
            design = " SCHLICHT ", language = "English", accentColor = "336699", font = "roboto", photoShape = "square",
        })).JsonAsync();

        Assert.Equal("plain", result.GetProperty("design").GetString());
        Assert.Equal("en", result.GetProperty("language").GetString());
        Assert.Equal("#336699", result.GetProperty("accentColor").GetString());
        Assert.Equal("Roboto", result.GetProperty("font").GetString());
        Assert.True(result.GetProperty("showPhoto").GetBoolean());
        Assert.Equal("rect", result.GetProperty("photoShape").GetString());
    }

    [Fact]
    public async Task Unknown_values_fall_back_to_the_defaults_and_bad_input_is_refused()
    {
        var user = await NewUser("preview-invalid");
        var result = await (await user.PutAsync("/api/profile/preview-options", new
        {
            design = "futuristic", language = "xx", accentColor = "not-a-colour", font = "Comic Sans", photoShape = "star",
        })).JsonAsync();
        Assert.Equal("classic", result.GetProperty("design").GetString());
        Assert.Equal("de", result.GetProperty("language").GetString());
        Assert.Equal("Liberation Sans", result.GetProperty("font").GetString());
        Assert.Equal("rounded", result.GetProperty("photoShape").GetString());
        Assert.Matches("^#[0-9a-fA-F]{6}$", result.GetProperty("accentColor").GetString()!);

        var tooLong = await user.PutAsync("/api/profile/preview-options", new { font = new string('x', 500) });
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal("validation.failed", await tooLong.CodeAsync());

        var wrongType = await user.PutAsync("/api/profile/preview-options", new { showPhoto = "maybe" });
        Assert.Equal(HttpStatusCode.BadRequest, wrongType.StatusCode);

        var huge = await user.PutAsync("/api/profile/preview-options", new { font = new string('x', 5000) });
        Assert.False(huge.IsSuccessStatusCode);

        var anonymous = await server.Client().PutAsync("/api/profile/preview-options", new { design = "modern" });
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
    }

    [Fact]
    public async Task A_stored_value_that_no_longer_exists_reads_as_the_default()
    {
        var user = await NewUser("preview-stale");
        await user.GetAsync("/api/profile"); // creates the profile row
        await SetStored("preview-stale", "{\"design\":\"modern\",\"font\":\"Removed Font\",\"photoShape\":\"round\"}");

        var loaded = (await (await user.GetAsync("/api/profile")).JsonAsync()).GetProperty("previewOptions");
        Assert.Equal("Liberation Sans", loaded.GetProperty("font").GetString());
        Assert.Equal("modern", loaded.GetProperty("design").GetString());
        Assert.Equal("round", loaded.GetProperty("photoShape").GetString());

        await SetStored("preview-stale", "{broken");
        var broken = await (await user.GetAsync("/api/profile")).JsonAsync();
        Assert.Equal(JsonValueKind.Null, broken.GetProperty("previewOptions").ValueKind);
    }

    [Fact]
    public async Task Every_account_has_its_own_choices()
    {
        var one = await NewUser("preview-one");
        var two = await NewUser("preview-two");
        await one.PutAsync("/api/profile/preview-options", new { design = "modern", language = "en" });

        var other = await (await two.GetAsync("/api/profile")).JsonAsync();
        Assert.Equal(JsonValueKind.Null, other.GetProperty("previewOptions").ValueKind);

        await two.PutAsync("/api/profile/preview-options", new { design = "plain" });
        var mine = (await (await one.GetAsync("/api/profile")).JsonAsync()).GetProperty("previewOptions");
        Assert.Equal("modern", mine.GetProperty("design").GetString());
        Assert.Equal("en", mine.GetProperty("language").GetString());
    }

    [Fact]
    public async Task The_choices_survive_a_backup_and_its_restore()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "preview-backup");
        await user.PutAsync("/api/profile/preview-options", new { design = "modern" });
        var created = await admin.PostAsync("/api/admin/backups");
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.JsonAsync()).GetProperty("id").GetString();

        await user.PutAsync("/api/profile/preview-options", new { design = "plain" });
        var restored = await admin.PostAsync($"/api/admin/backups/{id}/restore", Credentials);
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);

        var again = server.Client();
        (await again.PostAsync("/api/auth/login", new { username = "preview-backup", password = "user-password-123" })).EnsureSuccessStatusCode();
        var loaded = (await (await again.GetAsync("/api/profile")).JsonAsync()).GetProperty("previewOptions");
        Assert.Equal("modern", loaded.GetProperty("design").GetString());
    }
}

public sealed class PreviewOptionsMigrationTests : IDisposable
{
    private const string Previous = "20261109123215_AddUserDateFormat";

    private readonly string _file = Path.Combine(Path.GetTempPath(), $"cv-migration-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var path in new[] { _file, _file + "-wal", _file + "-shm" }) File.Delete(path);
    }

    [Fact]
    public void Existing_profiles_keep_their_data_and_start_without_saved_choices()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(SqliteDatabase.ConnectionString(_file, pooling: false)).Options;
        using var db = new AppDbContext(options);
        db.GetService<IMigrator>().Migrate(Previous);

        using (var connection = new SqliteConnection($"Data Source={_file};Pooling=False;Foreign Keys=False"))
        {
            connection.Open();
            using var insert = connection.CreateCommand();
            insert.CommandText = "INSERT INTO profiles (\"Id\", \"UserId\", \"FirstName\", \"LastName\", \"CreatedAt\", \"UpdatedAt\") VALUES ('1', 'u', 'Eva', 'Muster', '2026-01-01', '2026-01-01')";
            insert.ExecuteNonQuery();
        }

        db.GetService<IMigrator>().Migrate();

        using var check = new SqliteConnection($"Data Source={_file};Pooling=False");
        check.Open();
        using var select = check.CreateCommand();
        select.CommandText = "SELECT \"FirstName\", \"PreviewOptionsJson\" FROM profiles WHERE \"Id\" = '1'";
        using var reader = select.ExecuteReader();
        Assert.True(reader.Read());
        Assert.Equal("Eva", reader.GetString(0));
        Assert.True(reader.IsDBNull(1));
    }
}

public sealed class JsonResumeMonthImportTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Full_days_are_cut_to_the_month_and_other_values_stay()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "resume-months");
        var resume = new
        {
            basics = new { name = "Eva Muster" },
            work = new[]
            {
                new { name = "Firma", position = "Lead", startDate = "2020-01-01", endDate = "2021-12-31" },
                new { name = "Zweite", position = "Dev", startDate = "2018-03", endDate = "2019-02" },
                new { name = "Dritte", position = "Ops", startDate = "2017-05-01T08:00:00Z", endDate = "2017-13-40" },
            },
            education = new[] { new { institution = "Uni", studyType = "B.Sc.", startDate = "2010-10-01", endDate = "2013-09-30" } },
        };
        var response = await user.PostAsync("/api/profile/json-resume/import?replace=true", resume);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync(Ct));

        var profile = await (await user.GetAsync("/api/profile")).JsonAsync();
        var work = profile.GetProperty("experiences").EnumerateArray().ToDictionary(e => e.GetProperty("employer").GetString()!);
        Assert.Equal("2020-01", work["Firma"].GetProperty("startDate").GetString());
        Assert.Equal("2021-12", work["Firma"].GetProperty("endDate").GetString());
        Assert.Equal("2018-03", work["Zweite"].GetProperty("startDate").GetString());
        Assert.Equal("2019-02", work["Zweite"].GetProperty("endDate").GetString());
        Assert.Equal("2017-05", work["Dritte"].GetProperty("startDate").GetString());
        Assert.Equal("2017-13-40", work["Dritte"].GetProperty("endDate").GetString());
        var education = profile.GetProperty("educations")[0];
        Assert.Equal("2010-10", education.GetProperty("startDate").GetString());
        Assert.Equal("2013-09", education.GetProperty("endDate").GetString());

        // Export and import again stays lossless
        var exported = JsonNode.Parse(await (await user.GetAsync("/api/profile/json-resume")).Content.ReadAsStringAsync(Ct))!;
        var (other, _) = await server.UserAsync(admin, "resume-months-2");
        Assert.True((await other.PostAsync("/api/profile/json-resume/import?replace=true", exported)).IsSuccessStatusCode);
        var again = JsonNode.Parse(await (await other.GetAsync("/api/profile/json-resume")).Content.ReadAsStringAsync(Ct))!;
        Assert.True(JsonNode.DeepEquals(exported, again));
    }
}
