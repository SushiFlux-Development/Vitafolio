using System.Net;
using Cv.Server.Configuration;
using Cv.Server.Tests.Support;
using Cv.Server.Updates;

namespace Cv.Server.Tests;

public sealed class ChangelogParserTests
{
    private const string Changelog = """
        # Changelog

        **[English](#english) · [Deutsch](#deutsch)**

        ---

        <a name="english"></a>
        ## English

        ## v2026.11.12.13.557 (β)

        What this beta is about, in a short paragraph
        over two lines.

        ### ✨ New

        - **First thing:** does something
          and goes on on a second line.
        - Second thing.

        ### 🔧 Fix

        - Crash fixed.

        ## v2026.11.11.2.9

        ### 🔒 Security

        - Hardened.

        ## v2026.11.7 (0.11 α)

        ### ✨ New

        - Older nightly.

        ## v2026.11.1 (19.31258 β)

        Old beta.

        ### ✨ New

        - Old beta thing.

        ## v2026.11.0 (4.7)

        ### 🔄 Changed

        - Old release heading form.

        ---

        <a name="deutsch"></a>
        ## Deutsch

        ## v2026.11.12.13.557 (β)

        Worum es in dieser Beta geht.

        ### ✨ Neu

        - **Erstes:** tut etwas.

        ### 🔧 Behoben

        - Absturz behoben.
        """;

    [Fact]
    public void The_new_heading_form_is_found_with_summary_categories_and_continued_bullets()
    {
        var entry = ChangelogParser.FindEntry(Changelog, "en", "v2026.11.12", "v2026.11.12.13.557", "beta");
        Assert.NotNull(entry);
        Assert.Equal("What this beta is about, in a short paragraph over two lines.", entry.Summary);
        Assert.Equal(["new", "fixed"], entry.Sections.Select(s => s.Category));
        Assert.Equal("New", entry.Sections[0].Title);
        Assert.Equal("**First thing:** does something and goes on on a second line.", entry.Sections[0].Items[0]);
        Assert.Equal(2, entry.Sections[0].Items.Count);
    }

    [Fact]
    public void The_language_block_decides()
    {
        var entry = ChangelogParser.FindEntry(Changelog, "de", "v2026.11.12", "v2026.11.12.13.557", "beta");
        Assert.NotNull(entry);
        Assert.Equal("Worum es in dieser Beta geht.", entry.Summary);
        Assert.Equal(["new", "fixed"], entry.Sections.Select(s => s.Category));
        Assert.Equal("Neu", entry.Sections[0].Title);
    }

    [Theory]
    // Stamped by the earlier format and left as they are
    [InlineData("v2026.11.7", "v2026.11.7.0.11", "nightly", "Older nightly.")]
    [InlineData("v2026.11.1", "v2026.11.1.19.31258", "beta", "Old beta thing.")]
    [InlineData("v2026.11.0", "v2026.11.0.4.7", "release", "Old release heading form.")]
    // The new release form, and a build without counters
    [InlineData("v2026.11.11", "v2026.11.11.2.9", "release", "Hardened.")]
    [InlineData("v2026.11.11", null, "release", "Hardened.")]
    public void Headings_of_every_form_are_found(string shortVersion, string? buildId, string channel, string firstItem)
    {
        var entry = ChangelogParser.FindEntry(Changelog, "en", shortVersion, buildId, channel);
        Assert.NotNull(entry);
        Assert.Equal(firstItem, entry.Sections[0].Items[0]);
    }

    [Theory]
    [InlineData("v2026.11.99", "v2026.11.99.1.1", "release")]
    [InlineData("v2026.11.11", "v2026.11.11.2.9", "beta")]
    [InlineData("v2026.11.12", "v2026.11.12.13.557", "nightly")]
    [InlineData("v2026.11.11", "v2026.11.11.7.7", "release")]
    public void A_version_without_a_matching_entry_finds_nothing(string shortVersion, string buildId, string channel) =>
        Assert.Null(ChangelogParser.FindEntry(Changelog, "en", shortVersion, buildId, channel));

    [Fact]
    public void The_real_changelog_of_this_repository_is_found()
    {
        var file = Path.Combine(RepoRoot.Find()!, "CHANGELOG.md");
        var entry = ChangelogParser.FindEntry(File.ReadAllText(file), "en", "v2026.11.7", "v2026.11.7.0.11", "nightly");
        Assert.NotNull(entry);
        Assert.Contains(entry.Sections, s => s.Category == "new" && s.Items.Count > 3);
    }
}

public sealed class WhatsNewFixture : ServerFixture
{
    public string VersionFile => Path.Combine(DataDir, "version.txt");

    public string ChangelogFile => Path.Combine(DataDir, "CHANGELOG.md");

    public string HandbookDir => Path.Combine(DataDir, "docs-handbuch");

    public void SetVersion(string shortVersion, string buildId) => File.WriteAllText(VersionFile, $"{shortVersion}\n{buildId}\n");

    public const string Changelog = """
        <a name="english"></a>
        ## English

        ## v2026.11.20.5.5 (β)

        Second beta notes.

        ### ✨ New

        - Newer feature.

        ## v2026.11.10.5.5 (β)

        ### ✨ New

        - Earlier feature.

        <a name="deutsch"></a>
        ## Deutsch

        ## v2026.11.20.5.5 (β)

        Zweite Beta.

        ### ✨ Neu

        - Neuere Funktion.
        """;

    protected override Dictionary<string, string?> Settings
    {
        get
        {
            Directory.CreateDirectory(DataDir);
            File.WriteAllText(ChangelogFile, Changelog);
            SetVersion("v2026.11.10", "v2026.11.10.5.5");
            var settings = base.Settings;
            settings["APP_CHANNEL"] = "beta";
            settings["VERSION_FILE"] = VersionFile;
            settings["CHANGELOG_FILE"] = ChangelogFile;
            settings["HANDBOOK_DIR"] = HandbookDir;
            return settings;
        }
    }
}

public sealed class WhatsNewEndpointTests(WhatsNewFixture server) : IClassFixture<WhatsNewFixture>
{
    private static async Task<bool> ShowAsync(TestClient client, string lang = "en") =>
        (await (await client.GetAsync($"/api/whats-new?lang={lang}")).JsonAsync()).GetProperty("show").GetBoolean();

    [Fact]
    public async Task A_new_account_sees_nothing_the_update_shows_once_and_the_mark_is_per_person()
    {
        server.SetVersion("v2026.11.10", "v2026.11.10.5.5");
        // Two accounts made for this test: the mark lives in the account, and the other tests of this class move the mark of the first
        // (the order of the tests of a class is not fixed), so the first is not "a new account" here
        var (first, _) = await server.UserAsync(await server.AdminAsync(), "whatsnew-first");
        var (other, _) = await server.UserAsync(await server.AdminAsync(), "whatsnew-other");

        Assert.False(await ShowAsync(first));
        Assert.False(await ShowAsync(other));

        // The first contact set the mark; now an update arrives
        server.SetVersion("v2026.11.20", "v2026.11.20.5.5");
        var body = await (await first.GetAsync("/api/whats-new?lang=en")).JsonAsync();
        Assert.True(body.GetProperty("show").GetBoolean());
        Assert.Equal("v2026.11.20.5.5 (β)", body.GetProperty("version").GetString());
        Assert.Equal("Second beta notes.", body.GetProperty("summary").GetString());
        Assert.Equal("Newer feature.", body.GetProperty("sections")[0].GetProperty("items")[0].GetString());

        // Language of the UI
        var german = await (await first.GetAsync("/api/whats-new?lang=de")).JsonAsync();
        Assert.Equal("Zweite Beta.", german.GetProperty("summary").GetString());

        (await first.PostAsync("/api/whats-new/seen")).EnsureSuccessStatusCode();
        Assert.False(await ShowAsync(first));
        // Another person has not seen it yet
        Assert.True(await ShowAsync(other));
    }

    [Fact]
    public async Task A_version_without_an_entry_shows_nothing_but_the_later_call_answers_for_a_version_with_one()
    {
        var admin = await server.AdminAsync();
        server.SetVersion("v2026.11.10", "v2026.11.10.5.5");
        await ShowAsync(admin);

        server.SetVersion("v2026.11.30", "v2026.11.30.5.5");
        Assert.False(await ShowAsync(admin));
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/whats-new/current?lang=en")).StatusCode);

        server.SetVersion("v2026.11.20", "v2026.11.20.5.5");
        var later = await admin.GetAsync("/api/whats-new/current?lang=en");
        Assert.Equal(HttpStatusCode.OK, later.StatusCode);
        var body = await later.JsonAsync();
        Assert.False(body.GetProperty("show").GetBoolean());
        Assert.Equal("Newer feature.", body.GetProperty("sections")[0].GetProperty("items")[0].GetString());
    }

    [Fact]
    public async Task An_older_version_after_a_restore_does_not_bring_back_old_notes()
    {
        var admin = await server.AdminAsync();
        server.SetVersion("v2026.11.20", "v2026.11.20.5.5");
        await ShowAsync(admin);
        (await admin.PostAsync("/api/whats-new/seen")).EnsureSuccessStatusCode();

        server.SetVersion("v2026.11.10", "v2026.11.10.5.5");
        Assert.False(await ShowAsync(admin));
    }

    [Fact]
    public async Task The_language_is_checked_and_signing_in_is_required()
    {
        var admin = await server.AdminAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/whats-new?lang=fr")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await server.Client().GetAsync("/api/whats-new")).StatusCode);
    }

    [Fact]
    public async Task The_manual_is_reported_missing_until_it_exists_then_served_inline()
    {
        var admin = await server.AdminAsync();
        Directory.CreateDirectory(Path.Combine(server.HandbookDir, "de"));
        foreach (var file in Directory.GetFiles(Path.Combine(server.HandbookDir, "de"), "*.pdf")) File.Delete(file);

        var missing = await admin.GetAsync("/api/docs/handbook?lang=de");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal("handbook.not_available", await missing.CodeAsync());

        var about = await (await server.Client().GetAsync("/api/about")).JsonAsync();
        Assert.False(about.GetProperty("handbook").GetProperty("de").GetBoolean());
        Assert.StartsWith("https://github.com/", about.GetProperty("sourceUrl").GetString(), StringComparison.Ordinal);
        Assert.Equal("/third-party-licenses.json", about.GetProperty("thirdPartyLicensesUrl").GetString());
        Assert.Equal("AGPL-3.0-only", about.GetProperty("license").GetString());

        await File.WriteAllBytesAsync(Path.Combine(server.HandbookDir, "de", "Vitafolio-Handbuch.pdf"), "%PDF-1.7 test"u8.ToArray(), TestContext.Current.CancellationToken);
        var present = await admin.GetAsync("/api/docs/handbook?lang=de");
        Assert.Equal(HttpStatusCode.OK, present.StatusCode);
        Assert.Equal("application/pdf", present.Content.Headers.ContentType!.MediaType);
        Assert.Equal("inline", present.Content.Headers.ContentDisposition!.DispositionType);
        Assert.StartsWith("%PDF", await present.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);

        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/docs/handbook?lang=en")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/docs/handbook?lang=../../")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await server.Client().GetAsync("/api/docs/handbook?lang=de")).StatusCode);
    }

    [Fact]
    public void The_public_repository_is_read_from_branding_json() => Assert.Contains('/', Branding.Repository);
}

public sealed class WhatsNewDevBuildTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    [Fact]
    public async Task A_development_build_shows_nothing_and_sets_no_mark()
    {
        var admin = await server.AdminAsync();
        Assert.False((await (await admin.GetAsync("/api/whats-new?lang=en")).JsonAsync()).GetProperty("show").GetBoolean());
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/whats-new/current?lang=en")).StatusCode);
        (await admin.PostAsync("/api/whats-new/seen")).EnsureSuccessStatusCode();
    }
}
