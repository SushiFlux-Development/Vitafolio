using System.Net;
using System.Security.Cryptography;
using System.Text;
using Cv.Desktop.Hosting;
using Cv.Server.Updates;
using Velopack;
using Velopack.Locators;
using Velopack.Sources;

namespace Cv.Desktop.Tests;

/// <summary>
/// The installer against the real Velopack code (UpdateManager, feed parsing, checksum check, version order), with only the network replaced. The last
/// step, the actual swap of the program by Velopack's Update.exe, needs a really installed copy and a published release and is not covered here.
/// </summary>
public sealed class VelopackInstallerTests : IDisposable
{
    private readonly string _packages = Path.Combine(Path.GetTempPath(), "cv-velopack-tests", Guid.NewGuid().ToString("N"));

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed class FakeDownloader(string tag, IReadOnlyDictionary<string, byte[]> files) : IFileDownloader
    {
        public List<string> Urls { get; } = [];

        public Task DownloadFile(string url, string targetFile, Action<int> progress, IDictionary<string, string>? headers = null, double timeout = 30, CancellationToken cancelToken = default)
        {
            File.WriteAllBytes(targetFile, Bytes(url));
            progress(100);
            return Task.CompletedTask;
        }

        public Task<byte[]> DownloadBytes(string url, IDictionary<string, string>? headers = null, double timeout = 30) => Task.FromResult(Bytes(url));

        public Task<string> DownloadString(string url, IDictionary<string, string>? headers = null, double timeout = 30) => Task.FromResult(Encoding.UTF8.GetString(Bytes(url)));

        private byte[] Bytes(string url)
        {
            Urls.Add(url);
            var prefix = $"https://github.com/owner/repo/releases/download/{tag}/";
            if (!url.StartsWith(prefix, StringComparison.Ordinal)) throw new InvalidOperationException("Unexpected URL: " + url);
            var name = Uri.UnescapeDataString(url[prefix.Length..]);
            return files.TryGetValue(name, out var content) ? content : throw new HttpRequestException("not found", null, HttpStatusCode.NotFound);
        }
    }

    private static byte[] Feed(string version, string fileName, byte[] package, string? sha256 = null, string? sha1 = null) =>
        Encoding.UTF8.GetBytes(
            "{\"Assets\":[{\"PackageId\":\"Vitafolio\",\"Version\":\"" + version + "\",\"Type\":\"Full\",\"FileName\":\"" + fileName + "\",\"SHA1\":\"" + (sha1 ?? Convert.ToHexString(SHA1.HashData(package))) + "\",\"SHA256\":\"" + (sha256 ?? Convert.ToHexString(SHA256.HashData(package))) + "\",\"Size\":" + package.Length + "}]}");

    private (VelopackInstaller Installer, FakeDownloader Downloader) Create(string installedVersion, string tag, string channel, string version, string fileName, byte[] package, string? badHash = null)
    {
        Directory.CreateDirectory(_packages);
        var files = new Dictionary<string, byte[]> { [$"releases.{channel}.json"] = Feed(version, fileName, package, badHash), [fileName] = package };
        var downloader = new FakeDownloader(tag, files);
        var installer = new VelopackInstaller("owner/repo", () => { }, new TestVelopackLocator("Vitafolio", installedVersion, _packages), downloader);
        return (installer, downloader);
    }

    private static byte[] Package() => "package-content"u8.ToArray();

    [Fact]
    public void An_installed_copy_can_update()
    {
        var (installer, _) = Create("2026.11.10", "v2026.11.12", "win", "2026.11.12", "Vitafolio-2026.11.12-full.nupkg", Package());
        Assert.True(installer.IsAvailable);
    }

    [Fact]
    public async Task A_nightly_install_downloads_a_full_release_from_the_win_feed_of_that_release()
    {
        // The package channel is the release's, not the installed copy's: this is what lets a nightly user receive full releases
        var (installer, downloader) = Create("2026.11.10-alpha.3.50", "v2026.11.12", "win", "2026.11.12", "Vitafolio-2026.11.12-full.nupkg", Package());
        var reported = new List<int>();
        await installer.PrepareAsync(new UpdateTarget("v2026.11.12", "win"), reported.Add, Ct);
        Assert.Contains(downloader.Urls, u => u.EndsWith("/v2026.11.12/releases.win.json", StringComparison.Ordinal));
        Assert.Contains(downloader.Urls, u => u.EndsWith("/v2026.11.12/Vitafolio-2026.11.12-full.nupkg", StringComparison.Ordinal));
        Assert.True(File.Exists(Path.Combine(_packages, "Vitafolio-2026.11.12-full.nupkg")));
        Assert.Equal(100, reported[^1]);
    }

    [Fact]
    public async Task A_switch_to_the_beta_channel_loads_the_beta_feed()
    {
        var (installer, downloader) = Create("2026.11.10", "v2026.11.12.13.557-beta", "beta", "2026.11.12-beta.13.557", "Vitafolio-2026.11.12-beta.13.557-beta-full.nupkg", Package());
        await installer.PrepareAsync(new UpdateTarget("v2026.11.12.13.557-beta", "beta"), _ => { }, Ct);
        Assert.Contains(downloader.Urls, u => u.EndsWith("/releases.beta.json", StringComparison.Ordinal));
    }

    [Fact]
    public async Task A_package_that_is_not_newer_is_never_prepared()
    {
        var (installer, _) = Create("2026.11.12", "v2026.11.11", "win", "2026.11.11", "Vitafolio-2026.11.11-full.nupkg", Package());
        var error = await Assert.ThrowsAsync<UpdateInstallException>(() => installer.PrepareAsync(new UpdateTarget("v2026.11.11", "win"), _ => { }, Ct));
        Assert.Equal("updates.no_package", error.Code);
    }

    [Fact]
    public async Task A_wrong_checksum_stops_the_update()
    {
        var wrong = Convert.ToHexString(SHA256.HashData("something else"u8));
        var (installer, _) = Create("2026.11.10", "v2026.11.12", "win", "2026.11.12", "Vitafolio-2026.11.12-full.nupkg", Package(), badHash: wrong);
        var error = await Assert.ThrowsAsync<UpdateInstallException>(() => installer.PrepareAsync(new UpdateTarget("v2026.11.12", "win"), _ => { }, Ct));
        Assert.Equal("updates.checksum_failed", error.Code);
        Assert.False(File.Exists(Path.Combine(_packages, "Vitafolio-2026.11.12-full.nupkg")));
    }

    [Fact]
    public async Task A_release_without_a_windows_package_says_so()
    {
        Directory.CreateDirectory(_packages);
        var downloader = new FakeDownloader("v2026.11.12", new Dictionary<string, byte[]>());
        var installer = new VelopackInstaller("owner/repo", () => { }, new TestVelopackLocator("Vitafolio", "2026.11.10", _packages), downloader);
        var error = await Assert.ThrowsAsync<UpdateInstallException>(() => installer.PrepareAsync(new UpdateTarget("v2026.11.12", "win"), _ => { }, Ct));
        Assert.Equal("updates.no_package", error.Code);
    }

    [Fact]
    public async Task Closing_is_only_asked_for_after_a_successful_download()
    {
        var closed = 0;
        Directory.CreateDirectory(_packages);
        var files = new Dictionary<string, byte[]> { ["releases.win.json"] = Feed("2026.11.12", "Vitafolio-2026.11.12-full.nupkg", Package()), ["Vitafolio-2026.11.12-full.nupkg"] = Package() };
        var installer = new VelopackInstaller("owner/repo", () => closed++, new TestVelopackLocator("Vitafolio", "2026.11.10", _packages), new FakeDownloader("v2026.11.12", files));

        Assert.Throws<UpdateInstallException>(installer.CloseAndApply);
        Assert.Equal(0, closed);

        await installer.PrepareAsync(new UpdateTarget("v2026.11.12", "win"), _ => { }, Ct);
        installer.CloseAndApply();
        Assert.Equal(1, closed);
    }

    [Theory]
    [InlineData("2026.11.12", "2026.11.12-beta.13.557")]
    [InlineData("2026.11.12-beta.13.557", "2026.11.12-alpha.13.557")]
    [InlineData("2026.11.13-alpha.1.1", "2026.11.12")]
    public void Package_versions_sort_like_the_apps_update_rule(string newer, string older) =>
        Assert.True(SemanticVersion.Parse(newer) > SemanticVersion.Parse(older));

    [Theory]
    [InlineData("beta", "beta")]
    [InlineData("nightly", "nightly")]
    [InlineData("dev", "dev")]
    [InlineData("release", "release")]
    [InlineData(" Nightly\n", "nightly")]
    [InlineData("anything", "release")]
    [InlineData(null, "release")]
    public void The_channel_marker_knows_every_build(string? text, string expected) => Assert.Equal(expected, DesktopVersion.ParseChannel(text));

    public void Dispose()
    {
        if (Directory.Exists(_packages)) Directory.Delete(_packages, recursive: true);
    }
}
