using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Cv.Server.Configuration;
using Cv.Server.Tests.Support;
using Cv.Server.Updates;
using Microsoft.Extensions.Logging.Abstractions;

namespace Cv.Server.Tests;

/// <summary>The channel rules: every combination of channel and published kind, the order of versions, and what a build shows.</summary>
public sealed class UpdateChannelRuleTests
{
    private static ReleaseVersion Version(string tag) => ReleaseVersion.Parse(tag) ?? throw new ArgumentException(tag);

    [Theory]
    // No channel: only full releases
    [InlineData("none", "v2026.11.9", true)]
    [InlineData("none", "v2026.11.9.1.2-beta", false)]
    [InlineData("none", "v2026.11.9.1.2-nightly", false)]
    // Beta channel: betas and full releases, never nightlies
    [InlineData("beta", "v2026.11.9", true)]
    [InlineData("beta", "v2026.11.9.1.2-beta", true)]
    [InlineData("beta", "v2026.11.9.1.2-nightly", false)]
    // Nightly channel: nightlies and full releases, never betas
    [InlineData("nightly", "v2026.11.9", true)]
    [InlineData("nightly", "v2026.11.9.1.2-beta", false)]
    [InlineData("nightly", "v2026.11.9.1.2-nightly", true)]
    // Old release candidates count as pre-releases
    [InlineData("none", "v2026.11.9-rc2", false)]
    [InlineData("beta", "v2026.11.9-rc2", true)]
    [InlineData("nightly", "v2026.11.9-rc2", false)]
    public void A_channel_accepts_exactly_its_kinds(string channel, string tag, bool accepted) =>
        Assert.Equal(accepted, UpdateChannels.Accepts(channel, Version(tag)));

    [Theory]
    [InlineData("v2026.11.7", "v2026.11.7.5.20-beta")]
    [InlineData("v2026.11.7", "v2026.11.7.5.20-nightly")]
    [InlineData("v2026.11.7.5.20-beta", "v2026.11.7.5.20-nightly")]
    [InlineData("v2026.11.8.0.1-nightly", "v2026.11.7")]
    [InlineData("v2027.1.1", "v2026.12.400")]
    [InlineData("v2026.11.7.5.21-nightly", "v2026.11.7.5.20-nightly")]
    [InlineData("v2026.11.7-rc2", "v2026.11.7-rc1")]
    public void Order_is_release_then_beta_then_nightly_on_the_same_commit(string newer, string older)
    {
        Assert.True(Version(newer) > Version(older));
        Assert.True(Version(older) < Version(newer));
    }

    [Theory]
    [InlineData("v2026.11.9-rc1", "beta")]
    [InlineData("v2026.11.9-alpha", "nightly")]
    [InlineData("v2026.11.9.1.2-nightly", "nightly")]
    public void Older_suffixes_keep_their_meaning(string tag, string channel)
    {
        Assert.Equal(channel, Version(tag).Channel);
        Assert.False(Version(tag).IsRelease);
    }

    [Theory]
    [InlineData("v2026.11.7.0.11-dev")]
    [InlineData("nonsense")]
    [InlineData("")]
    [InlineData("v2026.11.7.0.11-beta\nx")]
    public void Anything_else_does_not_parse(string tag) => Assert.Null(ReleaseVersion.Parse(tag));

    [Theory]
    [InlineData("v2026.11.12", "v2026.11.12.13.557", "release", "v2026.11.12")]
    [InlineData("v2026.11.12", "v2026.11.12.13.557", "beta", "v2026.11.12.13.557-beta")]
    [InlineData("v2026.11.12", "v2026.11.12.13.557", "nightly", "v2026.11.12.13.557-nightly")]
    public void The_running_version_in_tag_form_is_comparable(string shortVersion, string buildId, string channel, string expected)
    {
        var tag = VersionFormat.Tag(shortVersion, buildId, channel);
        Assert.Equal(expected, tag);
        Assert.Equal(channel, Version(tag).Channel);
    }

    [Theory]
    [InlineData("release", "none")]
    [InlineData("beta", "beta")]
    [InlineData("nightly", "nightly")]
    [InlineData("alpha", "nightly")]
    [InlineData("dev", "none")]
    public void Without_a_saved_choice_the_build_decides(string build, string expected) =>
        Assert.Equal(expected, UpdateChannels.FromBuild(build));

    [Theory]
    [InlineData("none", "latest")]
    [InlineData("beta", "beta")]
    [InlineData("nightly", "nightly")]
    public void The_docker_tag_follows_the_channel(string channel, string tag) => Assert.Equal(tag, UpdateChannels.DockerTag(channel));

    [Fact]
    public void Newest_update_takes_the_newest_accepted_version_that_is_newer_than_the_running_one()
    {
        string[] published = ["v2026.11.10", "v2026.11.12.1.1-beta", "v2026.11.14.1.1-nightly", "v2026.11.8"];
        Assert.Equal("v2026.11.14.1.1-nightly", UpdateChannels.NewestUpdate("nightly", Version("v2026.11.9"), published, Version));
        Assert.Equal("v2026.11.12.1.1-beta", UpdateChannels.NewestUpdate("beta", Version("v2026.11.9"), published, Version));
        Assert.Equal("v2026.11.10", UpdateChannels.NewestUpdate("none", Version("v2026.11.9"), published, Version));
        Assert.Null(UpdateChannels.NewestUpdate("none", Version("v2026.11.10"), published, Version));
    }

    [Fact]
    public void A_nightly_user_gets_the_full_release_of_the_same_commit_but_nothing_older()
    {
        string[] published = ["v2026.11.10"];
        Assert.Equal("v2026.11.10", UpdateChannels.NewestUpdate("nightly", Version("v2026.11.10.4.9-nightly"), published, Version));
        Assert.Null(UpdateChannels.NewestUpdate("nightly", Version("v2026.11.11.4.9-nightly"), published, Version));
    }

    [Fact]
    public void An_unknown_running_version_is_never_updated() =>
        Assert.Null(UpdateChannels.NewestUpdate("none", null, new[] { "v2026.11.10" }, Version));

    [Theory]
    [InlineData("v2026.11.9", "win")]
    [InlineData("v2026.11.9.1.2-beta", "beta")]
    [InlineData("v2026.11.9.1.2-nightly", "nightly")]
    public void The_package_feed_of_a_release_is_named_after_its_channel(string tag, string channel)
    {
        Assert.Equal(channel, UpdateChannels.PackageChannel(Version(tag)));
        Assert.Equal($"releases.{channel}.json", UpdateChannels.PackageFeedName(Version(tag)));
    }
}

/// <summary>The real program text of both sides: the shell script and the C# helper must give exactly the same, for every form.</summary>
public sealed class VersionDisplayScriptTests
{
    public static TheoryData<string, string?, string> Forms()
    {
        var data = new TheoryData<string, string?, string>();
        foreach (var channel in new[] { "release", "beta", "nightly", "dev" })
        {
            data.Add("v2026.11.12", "v2026.11.12.13.557", channel);
            data.Add("v2026.11.12", null, channel);
            data.Add("v2026.11.12", "v2026.11.11.13.557", channel);
            data.Add("v2026.11.12", "v2026.11.12.13", channel);
        }
        return data;
    }

    private static string? ShellPath() =>
        new[] { @"C:\Program Files\Git\bin\sh.exe", @"C:\Program Files\Git\usr\bin\sh.exe" }.FirstOrDefault(File.Exists)
        ?? (OperatingSystem.IsWindows() ? null : "/bin/sh");

    [Theory]
    [MemberData(nameof(Forms))]
    public void Display_and_tag_match_the_csharp_helper(string shortVersion, string? buildId, string channel)
    {
        var shell = ShellPath();
        Assert.SkipUnless(shell is not null, "no POSIX shell on this machine");
        var script = Path.Combine(RepoRoot.Find()!, "scripts", "version-display.sh");

        Assert.Equal(VersionFormat.Display(shortVersion, buildId, channel), Run(shell!, script, "display", shortVersion, buildId ?? "", channel));
        Assert.Equal(VersionFormat.Tag(shortVersion, buildId, channel), Run(shell!, script, "tag", shortVersion, buildId ?? "", channel));
    }

    private static string Run(string shell, params string[] arguments)
    {
        var info = new ProcessStartInfo(shell) { RedirectStandardOutput = true, StandardOutputEncoding = System.Text.Encoding.UTF8, UseShellExecute = false };
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        using var process = Process.Start(info)!;
        var output = process.StandardOutput.ReadToEnd().TrimEnd('\r', '\n');
        process.WaitForExit();
        Assert.Equal(0, process.ExitCode);
        return output;
    }
}

/// <summary>The check against a stand-in for the GitHub API: which release a given build sees.</summary>
public sealed class UpdateServiceTests
{
    private static string Release(string tag, bool draft = false, params string[] assets) =>
        JsonSerializer.Serialize(new { tag_name = tag, draft, html_url = $"https://example.invalid/{tag}", body = "notes", published_at = "2026-11-08T10:00:00Z", assets = assets.Select(name => new { name }).ToArray() });

    private static (UpdateService Service, TestDoubles.StubHandler Handler) Service(string channel, string? saved, string? json, HostMode mode = HostMode.Server, string shortVersion = "v2026.11.10", string? buildId = "v2026.11.10.3.50")
    {
        var handler = new TestDoubles.StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json ?? "[]") });
        return (Create(channel, saved, handler, mode, shortVersion, buildId), handler);
    }

    private static UpdateService Create(string channel, string? saved, HttpMessageHandler handler, HostMode mode, string shortVersion, string? buildId)
    {
        var file = Path.Combine(Path.GetTempPath(), "cv-update-" + Guid.NewGuid().ToString("N") + ".txt");
        File.WriteAllText(file, shortVersion + "\n" + buildId + "\n");
        var settings = new ServerSettings { Mode = mode, DataDirectory = Path.GetTempPath(), BackupDirectory = Path.GetTempPath(), Channel = channel, VersionFilePath = file };
        return new UpdateService(new TestDoubles.StubFactory(handler), new AppVersion(settings), settings, new TestDoubles.UpdateChannelStub(saved),
            new TestDoubles.FixedTime(new DateTimeOffset(2026, 11, 8, 12, 0, 0, TimeSpan.Zero)), NullLogger<UpdateService>.Instance);
    }

    private static string Json(params string[] releases) => "[" + string.Join(",", releases) + "]";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_beta_build_compares_with_its_real_suffix_and_sees_only_a_newer_release()
    {
        // Before the fix the running beta had no suffix and looked like the full release of its commit
        var (service, _) = Service("beta", null, Json(Release("v2026.11.10"), Release("v2026.11.10.3.50-beta")), shortVersion: "v2026.11.10", buildId: "v2026.11.10.3.50");
        var status = await service.GetStatusAsync(ct: Ct);
        Assert.Equal("v2026.11.10.3.50-beta", status.CurrentTag);
        Assert.True(status.HasUpdate);
        Assert.Equal("v2026.11.10", status.Available!.Tag);
        Assert.Equal("beta", status.Channel);
        Assert.False(status.ChannelSaved);
        Assert.Equal("beta", status.DockerTag);
    }

    [Fact]
    public async Task A_nightly_build_stays_on_the_nightly_channel_until_something_is_chosen()
    {
        var (service, _) = Service("nightly", null, Json(Release("v2026.11.12.1.1-nightly"), Release("v2026.11.11.1.1-beta")));
        var status = await service.GetStatusAsync(ct: Ct);
        Assert.Equal("nightly", status.Channel);
        Assert.Equal("v2026.11.12.1.1-nightly", status.Available!.Tag);
        Assert.Equal("v2026.11.12.1.1-nightly", status.LatestNightly!.Tag);
        Assert.Equal("v2026.11.11.1.1-beta", status.LatestBeta!.Tag);
    }

    [Fact]
    public async Task A_saved_channel_wins_over_the_build()
    {
        var (service, _) = Service("nightly", UpdateChannels.None, Json(Release("v2026.11.12.1.1-nightly"), Release("v2026.11.11")));
        var status = await service.GetStatusAsync(ct: Ct);
        Assert.Equal(UpdateChannels.None, status.Channel);
        Assert.True(status.ChannelSaved);
        Assert.Equal("v2026.11.11", status.Available!.Tag);
    }

    [Fact]
    public async Task A_release_without_a_choice_gets_only_releases()
    {
        var (service, _) = Service("release", null, Json(Release("v2026.11.13.1.1-beta"), Release("v2026.11.12.1.1-nightly")));
        var status = await service.GetStatusAsync(ct: Ct);
        Assert.Equal(UpdateChannels.None, status.Channel);
        Assert.Null(status.Available);
        Assert.Equal("upToDate", status.State);
        Assert.Equal("latest", status.DockerTag);
    }

    [Fact]
    public async Task Without_a_readable_version_nothing_is_offered()
    {
        var (service, _) = Service("release", null, Json(Release("v2026.11.99")), shortVersion: AppVersion.Fallback, buildId: null);
        var status = await service.GetStatusAsync(ct: Ct);
        Assert.False(status.HasUpdate);
        Assert.Equal("unknownVersion", status.State);
    }

    [Fact]
    public async Task A_development_build_never_asks_and_never_offers_even_when_a_release_exists()
    {
        var (service, handler) = Service("dev", null, Json(Release("v2030.1.1")));
        var first = await service.GetStatusAsync(forceManualCheck: true, Ct);
        await service.GetStatusAsync(forceManualCheck: false, Ct);
        Assert.Equal(0, handler.Calls);
        Assert.Equal("devBuild", first.State);
        Assert.False(first.HasUpdate);
        Assert.Null(first.Available);
        Assert.Null(first.LatestRelease);
    }

    [Fact]
    public async Task More_than_the_first_page_is_read_so_a_release_behind_many_nightlies_is_found()
    {
        // Daily nightlies: with one page of 30 the full release would be out of sight
        var nightlies = Enumerable.Range(1, 100).Select(i => Release($"v2026.11.{300 - i}.1.1-nightly")).ToArray();
        var page2 = Json(Release("v2026.11.100.1.1-beta"), Release("v2026.11.50"));
        var handler = new TestDoubles.StubHandler(request => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(request.RequestUri!.Query.Contains("page=2", StringComparison.Ordinal) ? page2 : Json(nightlies)),
        });
        var service = Create("release", null, handler, HostMode.Server, "v2026.11.10", "v2026.11.10.3.50");
        var status = await service.GetStatusAsync(ct: Ct);
        Assert.Equal(2, handler.Calls);
        Assert.Equal("v2026.11.50", status.LatestRelease!.Tag);
        Assert.Equal("v2026.11.50", status.Available!.Tag);
        Assert.Equal("v2026.11.100.1.1-beta", status.LatestBeta!.Tag);
    }

    [Fact]
    public async Task Paging_stops_once_each_kind_has_been_seen()
    {
        var page = Json(Enumerable.Range(1, 98).Select(i => Release($"v2026.11.{300 - i}.1.1-nightly")).Concat([Release("v2026.11.1.1.1-beta"), Release("v2026.11.2")]).ToArray());
        var handler = new TestDoubles.StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(page) });
        var service = Create("release", null, handler, HostMode.Server, "v2026.11.10", "v2026.11.10.3.50");
        await service.GetStatusAsync(ct: Ct);
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task Drafts_are_ignored()
    {
        var (service, _) = Service("release", null, Json(Release("v2026.11.99", draft: true)));
        Assert.Null((await service.GetStatusAsync(ct: Ct)).Available);
    }

    [Fact]
    public async Task The_windows_program_is_only_offered_releases_that_have_a_package()
    {
        var (service, _) = Service("release", null, Json(Release("v2026.11.20"), Release("v2026.11.15", false, "Vitafolio-2026.11.15-full.nupkg", "releases.win.json")), HostMode.Desktop);
        var status = await service.GetStatusAsync(ct: Ct);
        Assert.Equal("v2026.11.15", status.Available!.Tag);
    }

    [Fact]
    public async Task A_docker_host_is_told_about_a_release_without_a_windows_package()
    {
        var (service, _) = Service("release", null, Json(Release("v2026.11.20")));
        Assert.Equal("v2026.11.20", (await service.GetStatusAsync(ct: Ct)).Available!.Tag);
    }
}

/// <summary>Beta build, chosen channel and the endpoint: a release build on the real pipeline. The check fails harmlessly: the fixture has no network.</summary>
public sealed class NightlyBuildFixture : ServerFixture
{
    protected override Dictionary<string, string?> Settings
    {
        get
        {
            var settings = base.Settings;
            settings["APP_CHANNEL"] = "nightly";
            return settings;
        }
    }
}

public sealed class UpdateChannelPinTests(NightlyBuildFixture server) : IClassFixture<NightlyBuildFixture>
{
    [Fact]
    public async Task A_nightly_build_saves_its_channel_at_the_first_start_so_a_later_full_release_does_not_drop_it()
    {
        var admin = await server.AdminAsync();
        // The startup worker runs in the background
        JsonElement status = default;
        for (var i = 0; i < 100; i++)
        {
            status = await (await admin.GetAsync("/api/updates/status")).JsonAsync();
            if (status.GetProperty("channelSaved").GetBoolean()) break;
            await Task.Delay(50, TestContext.Current.CancellationToken);
        }
        Assert.True(status.GetProperty("channelSaved").GetBoolean());
        Assert.Equal("nightly", status.GetProperty("channel").GetString());
    }
}

public sealed class UpdateChannelEndpointTests(NightlyBuildFixture server) : IClassFixture<NightlyBuildFixture>
{
    [Fact]
    public async Task Only_an_admin_changes_the_channel_and_the_value_is_checked()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "channel-user");

        var forbidden = await user.PutAsync("/api/admin/updates/channel", new { channel = "beta" });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var wrong = await admin.PutAsync("/api/admin/updates/channel", new { channel = "rc" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);

        var saved = await admin.PutAsync("/api/admin/updates/channel", new { channel = "beta" });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var body = await saved.JsonAsync();
        Assert.Equal("beta", body.GetProperty("channel").GetString());
        Assert.True(body.GetProperty("channelSaved").GetBoolean());
        Assert.Equal("beta", body.GetProperty("dockerTag").GetString());

        var status = await (await admin.GetAsync("/api/updates/status")).JsonAsync();
        Assert.Equal("beta", status.GetProperty("channel").GetString());
        Assert.False(status.GetProperty("canInstall").GetBoolean());
    }
}
