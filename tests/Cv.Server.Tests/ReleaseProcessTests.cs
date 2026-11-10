// Copyright (c) 2026 SushiFlux Development
using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Cv.Server.Configuration;
using Cv.Server.Updates;

namespace Cv.Server.Tests;

/// <summary>The shell scripts and files of the release process, run for real with stand-in values (nothing is built or published).</summary>
internal static class ReleaseFiles
{
    public static string Root => RepoRoot.Find()!;

    public static string Read(params string[] path) => File.ReadAllText(Path.Combine([Root, .. path])).ReplaceLineEndings("\n");

    public static string? Shell() =>
        new[] { @"C:\Program Files\Git\bin\sh.exe", @"C:\Program Files\Git\usr\bin\sh.exe" }.FirstOrDefault(File.Exists)
        ?? (OperatingSystem.IsWindows() ? null : "/bin/sh");

    public static string Slashes(string path) => path.Replace('\\', '/');

    public sealed record Result(int ExitCode, string Output, string Error)
    {
        public IReadOnlyDictionary<string, string> Values =>
            Output.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(line => line.TrimEnd('\r')).Where(line => line.Contains('=')).ToDictionary(line => line[..line.IndexOf('=')], line => line[(line.IndexOf('=') + 1)..]);
    }

    public static Result Run(string shell, string workingDirectory, string script, params string[] arguments)
    {
        var info = new ProcessStartInfo(shell)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
        };
        info.ArgumentList.Add(Slashes(Path.Combine(Root, "scripts", script)));
        foreach (var argument in arguments) info.ArgumentList.Add(argument);
        return Start(info);
    }

    /// <summary>Starts the process and waits for it; standard output and error must be redirected.</summary>
    public static Result Start(ProcessStartInfo info)
    {
        using var process = Process.Start(info)!;
        var error = process.StandardError.ReadToEndAsync();
        var output = process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        return new Result(process.ExitCode, output, error.GetAwaiter().GetResult().ReplaceLineEndings("\n"));
    }
}

public sealed class ReleaseMetaTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "cv-release-meta", Guid.NewGuid().ToString("N"));

    private ReleaseFiles.Result Meta(string tag, string versionTxt)
    {
        var shell = ReleaseFiles.Shell();
        Assert.SkipUnless(shell is not null, "no POSIX shell on this machine");
        Directory.CreateDirectory(_folder);
        File.WriteAllText(Path.Combine(_folder, "version.txt"), versionTxt);
        File.Copy(Path.Combine(ReleaseFiles.Root, "branding.json"), Path.Combine(_folder, "branding.json"), overwrite: true);
        return ReleaseFiles.Run(shell!, _folder, "release-meta.sh", tag, ReleaseFiles.Slashes(_folder));
    }

    private const string Commit = "v2026.11.12\nv2026.11.12.13.557\n";

    private static string Image => "ghcr.io/" + Branding.Repository.ToLowerInvariant();

    [Fact]
    public void A_release_tag_sets_all_three_moving_tags_and_a_public_release()
    {
        var result = Meta("v2026.11.12", Commit);
        Assert.Equal(0, result.ExitCode);
        var values = result.Values;
        Assert.Equal("release", values["channel"]);
        Assert.Equal("false", values["is_prerelease"]);
        Assert.Equal("2026.11.12", values["image_tag"]);
        Assert.Equal("v2026.11.12.13.557", values["display"]);
        Assert.Equal("latest", values["template_tag"]);
        Assert.Equal($"{Image}:2026.11.12,{Image}:latest,{Image}:beta,{Image}:nightly", values["docker_tags"]);
    }

    [Fact]
    public void A_beta_tag_moves_only_beta()
    {
        var result = Meta("v2026.11.12.13.557-beta", Commit);
        Assert.Equal(0, result.ExitCode);
        var values = result.Values;
        Assert.Equal("beta", values["channel"]);
        Assert.Equal("true", values["is_prerelease"]);
        Assert.Equal("2026.11.12.13.557-beta", values["image_tag"]);
        Assert.Equal("v2026.11.12.13.557 (β)", values["display"]);
        Assert.Equal("beta", values["template_tag"]);
        Assert.Equal($"{Image}:2026.11.12.13.557-beta,{Image}:beta", values["docker_tags"]);
    }

    [Fact]
    public void A_nightly_tag_moves_only_nightly()
    {
        var result = Meta("v2026.11.12.13.557-nightly", Commit);
        Assert.Equal(0, result.ExitCode);
        var values = result.Values;
        Assert.Equal("nightly", values["channel"]);
        Assert.Equal("true", values["is_prerelease"]);
        Assert.Equal("v2026.11.12.13.557 (α)", values["display"]);
        Assert.Equal("nightly", values["template_tag"]);
        Assert.Equal($"{Image}:2026.11.12.13.557-nightly,{Image}:nightly", values["docker_tags"]);
        Assert.DoesNotContain(":latest", values["docker_tags"]);
        Assert.DoesNotContain(":beta", values["docker_tags"]);
    }

    [Fact]
    public void The_title_never_carries_the_platform()
    {
        var shell = ReleaseFiles.Shell();
        Assert.SkipUnless(shell is not null, "no POSIX shell on this machine");
        var workflow = ReleaseFiles.Read(".github", "workflows", "release.yml");
        Assert.Contains("name: ${{ needs.inspect.outputs.display }}", workflow);
        Assert.DoesNotContain("platform_label }}", workflow[workflow.IndexOf("Create the release as a draft", StringComparison.Ordinal)..]);
    }

    [Theory]
    [InlineData("v2026.11.13", Commit)]                      // release tag of another commit
    [InlineData("v2026.11.12.13.558-beta", Commit)]          // right commit, other counters
    [InlineData("v2026.11.12.13.557-beta", "v2026.11.12\n")] // version.txt without the build id: a beta needs the five segments
    [InlineData("v2026.11.11.13.557-nightly", Commit)]
    public void A_tag_that_does_not_belong_to_the_commit_stops_the_run(string tag, string versionTxt)
    {
        var result = Meta(tag, versionTxt);
        Assert.Equal(1, result.ExitCode);
        Assert.Contains("does not match the commit", result.Error);
        Assert.Equal(string.Empty, result.Output);
    }

    [Theory]
    [InlineData("v2026.11.12.13.557-dev", "development builds are never tagged")]
    [InlineData("v2026.11.12-rc1", "replaced by betas")]
    [InlineData("v2026.11.12.13.557-alpha", "-nightly")]
    [InlineData("v2026.11.12.13.557", "no valid form")]
    [InlineData("v2026.11.12-beta", "no valid form")]
    [InlineData("release-1", "no valid form")]
    public void A_tag_with_no_channel_of_ours_is_refused(string tag, string reason)
    {
        var result = Meta(tag, Commit);
        Assert.Equal(1, result.ExitCode);
        Assert.Contains(reason, result.Error);
    }

    [Fact]
    public void The_image_name_follows_branding_json()
    {
        var result = Meta("v2026.11.12", Commit);
        Assert.Equal(Branding.Repository, result.Values["repository"]);
        Assert.Equal(Image, result.Values["image"]);
        Assert.Equal(Branding.ProductName, result.Values["product"]);
        Assert.Equal(Branding.Company, result.Values["company"]);
    }

    public void Dispose()
    {
        if (Directory.Exists(_folder)) Directory.Delete(_folder, recursive: true);
    }
}

public sealed class ReleaseNotesTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "cv-release-notes", Guid.NewGuid().ToString("N"));

    private const string Changelog = """
        # Changelog

        **[English](#english) · [Deutsch](#deutsch)**

        ---

        <a name="english"></a>
        ## English

        ## v2026.11.20.5.100 (β) · Unraid

        Beta intro EN.

        ### ✨ New

        - Beta feature EN

        ## v2026.11.19.4.50 (α)

        ### 🔧 Fix

        - Nightly fix EN

        ## v2026.11.18.3.20

        Release intro EN.

        ### ✨ New

        - Release feature EN

        ## v2026.11.12 (13.557)

        Older release form EN.

        ## v2026.11.7 (0.11 α)

        Old nightly form EN.

        ## v2026.11.1 (19.31258 β)

        Old beta form EN.

        ---

        <a name="deutsch"></a>
        ## Deutsch

        ## v2026.11.20.5.100 (β) · Unraid

        Beta Einleitung DE.

        ### ✨ Neu

        - Beta Funktion DE

        ## v2026.11.19.4.50 (α)

        - Nightly Fehler DE

        ## v2026.11.18.3.20

        Release Einleitung DE.

        ## v2026.11.12 (13.557)

        Aeltere Release-Form DE.

        ## v2026.11.7 (0.11 α)

        Alte Nightly-Form DE.

        ## v2026.11.1 (19.31258 β)

        Alte Beta-Form DE.
        """;

    private ReleaseFiles.Result Notes(string tag, string text = Changelog)
    {
        var shell = ReleaseFiles.Shell();
        Assert.SkipUnless(shell is not null, "no POSIX shell on this machine");
        Directory.CreateDirectory(_folder);
        var file = Path.Combine(_folder, "CHANGELOG.md");
        File.WriteAllText(file, text.ReplaceLineEndings("\n"));
        return ReleaseFiles.Run(shell!, _folder, "release-notes.sh", tag, ReleaseFiles.Slashes(file));
    }

    [Fact]
    public void A_beta_gets_exactly_its_own_entry_in_both_languages()
    {
        var result = Notes("v2026.11.20.5.100-beta");
        Assert.Equal(0, result.ExitCode);
        Assert.StartsWith("## English\n\nBeta intro EN.", result.Output);
        Assert.Contains("- Beta feature EN", result.Output);
        Assert.Contains("\n## Deutsch\n\nBeta Einleitung DE.", result.Output);
        Assert.Contains("- Beta Funktion DE", result.Output);
        Assert.DoesNotContain("Nightly", result.Output);
        Assert.DoesNotContain("Release", result.Output);
        Assert.DoesNotContain("## v2026", result.Output);
        Assert.DoesNotContain("---", result.Output);
    }

    [Fact]
    public void A_release_gets_the_release_entry_not_the_beta_or_nightly_of_other_commits()
    {
        var result = Notes("v2026.11.18");
        Assert.Equal(0, result.ExitCode);
        Assert.Contains("Release intro EN.", result.Output);
        Assert.Contains("Release Einleitung DE.", result.Output);
        Assert.DoesNotContain("Beta", result.Output);
    }

    [Theory]
    [InlineData("v2026.11.19.4.50-nightly", "Nightly fix EN", "Nightly Fehler DE")]
    [InlineData("v2026.11.12", "Older release form EN.", "Aeltere Release-Form DE.")]
    [InlineData("v2026.11.7.0.11-nightly", "Old nightly form EN.", "Alte Nightly-Form DE.")]
    [InlineData("v2026.11.1.19.31258-beta", "Old beta form EN.", "Alte Beta-Form DE.")]
    public void The_headings_of_older_forms_are_found_too(string tag, string english, string german)
    {
        var result = Notes(tag);
        Assert.Equal(0, result.ExitCode);
        Assert.Contains(english, result.Output);
        Assert.Contains(german, result.Output);
    }

    [Theory]
    [InlineData("v2026.11.20.5.100-nightly")]   // the entry is a beta
    [InlineData("v2026.11.20.5.100")]           // ... not a release
    [InlineData("v2026.11.20.5.101-beta")]      // other counters
    [InlineData("v2026.11.99")]                 // no entry at all
    [InlineData("v2026.11.7")]                  // only a nightly entry of that version exists
    public void A_missing_entry_stops_the_run_with_a_clear_message(string tag)
    {
        var result = Notes(tag);
        Assert.Equal(1, result.ExitCode);
        Assert.Equal(string.Empty, result.Output);
        Assert.Contains("no English entry for " + tag, result.Error);
    }

    [Fact]
    public void An_entry_missing_in_one_language_stops_the_run()
    {
        var text = Changelog.ReplaceLineEndings("\n");
        var germanRelease = "## v2026.11.18.3.20\n\nRelease Einleitung DE.\n\n";
        Assert.Contains(germanRelease, text);

        var result = Notes("v2026.11.18", text.Replace(germanRelease, string.Empty, StringComparison.Ordinal));

        Assert.Equal(1, result.ExitCode);
        Assert.Contains("no German entry", result.Error);
    }

    [Fact]
    public void A_changelog_without_language_blocks_is_refused()
    {
        var result = Notes("v2026.11.18", "# Changelog\n\n## v2026.11.18.3.20\n\n- x\n");
        Assert.Equal(1, result.ExitCode);
        Assert.Contains("one block per language", result.Error);
    }

    [Fact]
    public void Windows_line_endings_make_no_difference()
    {
        var shell = ReleaseFiles.Shell();
        Assert.SkipUnless(shell is not null, "no POSIX shell on this machine");
        var lf = Notes("v2026.11.20.5.100-beta").Output;
        Directory.CreateDirectory(_folder);
        var file = Path.Combine(_folder, "CHANGELOG-crlf.md");
        File.WriteAllText(file, Changelog.ReplaceLineEndings("\r\n"));
        var crlf = ReleaseFiles.Run(shell!, _folder, "release-notes.sh", "v2026.11.20.5.100-beta", ReleaseFiles.Slashes(file));
        Assert.Equal(0, crlf.ExitCode);
        Assert.Equal(lf, crlf.Output);
        Assert.DoesNotContain("\r", crlf.Output);
    }

    [Theory]
    [InlineData("v2026.11.20.5.100-beta", "v2026.11.20", "v2026.11.20.5.100", "beta", true)]
    [InlineData("v2026.11.20.5.100-nightly", "v2026.11.20", "v2026.11.20.5.100", "nightly", false)]
    [InlineData("v2026.11.20.5.100", "v2026.11.20", "v2026.11.20.5.100", "release", false)]
    [InlineData("v2026.11.18", "v2026.11.18", "v2026.11.18.3.20", "release", true)]
    [InlineData("v2026.11.19.4.50-nightly", "v2026.11.19", "v2026.11.19.4.50", "nightly", true)]
    [InlineData("v2026.11.12", "v2026.11.12", "v2026.11.12.13.557", "release", true)]
    [InlineData("v2026.11.7.0.11-nightly", "v2026.11.7", "v2026.11.7.0.11", "nightly", true)]
    [InlineData("v2026.11.1.19.31258-beta", "v2026.11.1", "v2026.11.1.19.31258", "beta", true)]
    [InlineData("v2026.11.7", "v2026.11.7", "v2026.11.7.0.11", "release", false)]
    public void The_script_and_the_apps_changelog_parser_agree_on_what_belongs_to_a_version(string tag, string shortVersion, string buildId, string channel, bool found)
    {
        var script = Notes(tag).ExitCode == 0;
        var parsed = ChangelogParser.FindEntry(Changelog, "en", shortVersion, buildId, channel) is not null;
        Assert.Equal(found, parsed);
        Assert.Equal(parsed, script);
    }

    [Fact]
    public void The_real_changelog_is_understood()
    {
        var shell = ReleaseFiles.Shell();
        Assert.SkipUnless(shell is not null, "no POSIX shell on this machine");
        var real = Path.Combine(ReleaseFiles.Root, "CHANGELOG.md");
        foreach (var tag in new[] { "v2026.11.7.0.11-nightly", "v2026.11.1.19.31258-beta" })
        {
            var result = ReleaseFiles.Run(shell!, ReleaseFiles.Root, "release-notes.sh", tag, ReleaseFiles.Slashes(real));
            Assert.True(result.ExitCode == 0, result.Error);
            Assert.Contains("## English", result.Output);
            Assert.Contains("## Deutsch", result.Output);
        }
    }

    public void Dispose()
    {
        if (Directory.Exists(_folder)) Directory.Delete(_folder, recursive: true);
    }
}

public sealed class ReleasePlatformTests : IDisposable
{
    private readonly string _repo = Path.Combine(Path.GetTempPath(), "cv-release-platform", Guid.NewGuid().ToString("N"));

    private static bool Git(string workingDirectory, params string[] arguments)
    {
        var info = new ProcessStartInfo("git") { WorkingDirectory = workingDirectory, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        foreach (var argument in new[] { "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false" }.Concat(arguments)) info.ArgumentList.Add(argument);
        try
        {
            using var process = Process.Start(info)!;
            process.StandardOutput.ReadToEnd();
            process.StandardError.ReadToEnd();
            process.WaitForExit();
            return process.ExitCode == 0;
        }
        catch (System.ComponentModel.Win32Exception)
        {
            return false;
        }
    }

    private ReleaseFiles.Result Platform(string? tagMessage, string tag = "v2026.11.12.13.557-beta", bool lightweight = false, string commitMessage = "Commit")
    {
        var shell = ReleaseFiles.Shell();
        Assert.SkipUnless(shell is not null, "no POSIX shell on this machine");
        Directory.CreateDirectory(_repo);
        Assert.SkipUnless(Git(_repo, "init", "-q"), "git is not available");
        File.WriteAllText(Path.Combine(_repo, "a.txt"), "a");
        Assert.True(Git(_repo, "add", "a.txt"));
        Assert.True(Git(_repo, "commit", "-q", "-m", commitMessage));
        if (lightweight) Assert.True(Git(_repo, "tag", tag));
        else if (tagMessage is null) Assert.True(Git(_repo, "tag", "-a", tag, "-m", "Beta"));
        else Assert.True(Git(_repo, "tag", "-a", tag, "-m", "Beta", "-m", tagMessage));
        return ReleaseFiles.Run(shell!, _repo, "release-platform.sh", tag, ReleaseFiles.Slashes(_repo));
    }

    [Theory]
    [InlineData("platform: unraid", "true", "false", "Unraid")]
    [InlineData("platform: windows-desktop", "false", "true", "Windows Desktop")]
    [InlineData("platform: unraid, windows-desktop", "true", "true", "Unraid, Windows Desktop")]
    [InlineData("platform: Unraid,Windows-Desktop", "true", "true", "Unraid, Windows Desktop")]
    [InlineData("platform: all", "true", "true", "All")]
    public void The_platform_line_of_the_annotated_tag_selects_the_targets(string line, string unraid, string windows, string label)
    {
        var result = Platform(line);
        Assert.Equal(0, result.ExitCode);
        Assert.Equal(unraid, result.Values["builds_unraid"]);
        Assert.Equal(windows, result.Values["builds_windows"]);
        Assert.Equal(label, result.Values["label"]);
    }

    [Fact]
    public void No_platform_line_means_all_targets()
    {
        var result = Platform(null);
        Assert.Equal(0, result.ExitCode);
        Assert.Equal("true", result.Values["builds_unraid"]);
        Assert.Equal("true", result.Values["builds_windows"]);
    }

    [Fact]
    public void A_lightweight_tag_has_no_message_of_its_own_so_the_commit_message_is_not_read()
    {
        var result = Platform(null, lightweight: true, commitMessage: "Fix\n\nplatform: unraid");
        Assert.Equal(0, result.ExitCode);
        Assert.Equal("true", result.Values["builds_windows"]);
    }

    [Theory]
    [InlineData("platform: android")]
    [InlineData("platform: unraid, windows-server")]
    public void A_typo_stops_the_run_instead_of_building_nothing(string line)
    {
        var result = Platform(line);
        Assert.Equal(1, result.ExitCode);
        Assert.Contains("unknown platform", result.Error);
    }

    public void Dispose()
    {
        if (!Directory.Exists(_repo)) return;
        // Git marks object files read-only
        foreach (var file in Directory.EnumerateFiles(_repo, "*", SearchOption.AllDirectories)) File.SetAttributes(file, FileAttributes.Normal);
        Directory.Delete(_repo, recursive: true);
    }
}

public sealed class UnraidTemplateTests
{
    private static string Render(string tag)
    {
        var shell = ReleaseFiles.Shell();
        Assert.SkipUnless(shell is not null, "no POSIX shell on this machine");
        var result = ReleaseFiles.Run(shell!, ReleaseFiles.Root, "render-unraid-template.sh", tag, ReleaseFiles.Slashes(ReleaseFiles.Root));
        Assert.True(result.ExitCode == 0, result.Error);
        return result.Output;
    }

    [Fact]
    public void The_tracked_feed_file_is_the_rendered_template_for_latest()
    {
        Assert.Equal(Render("latest").TrimEnd('\n'), ReleaseFiles.Read("unraid", "vitafolio.xml").TrimEnd('\n'));
    }

    [Theory]
    [InlineData("latest")]
    [InlineData("beta")]
    [InlineData("nightly")]
    public void Each_rendered_template_is_valid_xml_that_starts_on_its_own_tag(string tag)
    {
        var text = Render(tag);
        var xml = XDocument.Parse(text);
        Assert.Equal($"ghcr.io/{Branding.Repository.ToLowerInvariant()}:{tag}", xml.Root!.Element("Repository")!.Value);
        Assert.DoesNotMatch(new Regex("__[A-Z_]+__"), text);
        Assert.Equal(["beta", "nightly"], xml.Root.Elements("Branch").Select(b => b.Element("Tag")!.Value).ToArray());
    }

    [Fact]
    public void Latest_beta_and_nightly_are_explained_in_both_languages()
    {
        var root = XDocument.Parse(Render("latest")).Root!;
        Assert.Contains("Full releases only", root.Element("DefaultTagDescription")!.Value);
        Assert.Contains("Nur Voll-Releases", root.Element("DefaultTagDescription")!.Value);
        var branches = root.Elements("Branch").ToDictionary(b => b.Element("Tag")!.Value, b => b.Element("TagDescription")!.Value);
        Assert.Contains("Beta builds", branches["beta"]);
        Assert.Contains("full releases", branches["beta"]);
        Assert.Contains("Beta-Versionen", branches["beta"]);
        Assert.Contains("Voll-Releases", branches["beta"]);
        Assert.Contains("Nightly builds", branches["nightly"]);
        Assert.Contains("Betas are skipped", branches["nightly"]);
        Assert.Contains("Betas werden übersprungen", branches["nightly"]);
    }

    [Fact]
    public void The_texts_are_english_first_then_german_without_technical_numbers()
    {
        var root = XDocument.Parse(Render("latest")).Root!;
        foreach (var name in new[] { "Overview", "Requires" })
        {
            var text = root.Element(name)!.Value;
            Assert.StartsWith("English:", text);
            Assert.True(text.IndexOf("English:", StringComparison.Ordinal) < text.IndexOf("Deutsch:", StringComparison.Ordinal), name);
            Assert.DoesNotMatch(new Regex(@"\d+\s?(ms|MB|GB|%)"), text);
        }
        // What the app does today: blocks of the CV, cover letters, attachments, PDF and Word, tracker, optional AI, accounts, backups
        var overview = root.Element("Overview")!.Value;
        foreach (var word in new[] { "cover letters", "attachments", "Word", "tracker", "AI help", "Backups", "Anschreiben", "Anlagen", "Tracker", "KI-Hilfe", "Sicherungen" })
        {
            Assert.Contains(word, overview);
        }
        Assert.StartsWith("https://github.com/", root.Element("ReadMe")!.Value);
    }

    [Fact]
    public void The_container_is_hardened_and_given_time_to_make_its_backup()
    {
        var extra = XDocument.Parse(Render("latest")).Root!.Element("ExtraParams")!.Value;
        foreach (var flag in new[] { "--cap-drop ALL", "--cap-add CHOWN", "--cap-add DAC_OVERRIDE", "--cap-add FOWNER", "--cap-add SETUID", "--cap-add SETGID", "--security-opt no-new-privileges:true", "--read-only", "--tmpfs /tmp:rw,noexec,nosuid,size=64m", "--restart=unless-stopped" })
        {
            Assert.Contains(flag, extra);
        }
        // The app finishes its backup within its 30 seconds shutdown limit; Docker's default of 10 seconds would kill it first
        Assert.Contains("--stop-timeout 40", extra);
        Assert.Contains("stop_grace_period: 40s", ReleaseFiles.Read("docker-compose.yml"));
        Assert.True(ServerApp.ShutdownTimeout < TimeSpan.FromSeconds(40));
    }

    [Fact]
    public void Every_variable_of_the_template_is_one_the_server_or_the_entrypoint_reads()
    {
        var root = XDocument.Parse(Render("latest")).Root!;
        var server = ReleaseFiles.Read("src", "Cv.Server", "Configuration", "ServerSettings.cs") + ReleaseFiles.Read("deploy", "docker-entrypoint.sh");
        var configs = root.Elements("Config").ToList();
        var variables = configs.Where(c => c.Attribute("Type")!.Value == "Variable").Select(c => c.Attribute("Target")!.Value).ToList();
        Assert.Equal(["PUID", "PGID", "TZ", "ALLOWED_HOSTS", "TRUSTED_PROXIES"], variables);
        foreach (var name in variables.Where(v => v != "TZ")) Assert.Contains(name, server);
        // TZ is read by the .NET runtime itself and the image installs the time zone database (Dockerfile)
        Assert.Contains("zoneinfo", ReleaseFiles.Read("Dockerfile"));

        var port = configs.Single(c => c.Attribute("Type")!.Value == "Port");
        Assert.Equal("8080", port.Attribute("Target")!.Value);
        var data = configs.Single(c => c.Attribute("Type")!.Value == "Path");
        Assert.Equal("/data", data.Attribute("Target")!.Value);
        // SQLite on the FUSE path /mnt/user can corrupt: the default is a cache or pool path
        Assert.StartsWith("/mnt/cache/", data.Attribute("Default")!.Value);
        // The most likely stumbling block: opening the app by a server name instead of an IP address is refused unless the name is allowed
        Assert.Contains("Allowed host names", root.Element("Requires")!.Value);
        Assert.Equal("ALLOWED_HOSTS", configs.Single(c => c.Attribute("Name")!.Value == "Allowed host names").Attribute("Target")!.Value);
    }
}

public sealed class ReleaseWorkflowTests
{
    private static readonly Regex Uses = new(@"^\s*(?:-\s+)?uses:\s*(?<action>\S+)", RegexOptions.Multiline);

    [Theory]
    [InlineData("release.yml")]
    [InlineData("ci.yml")]
    public void Every_action_is_pinned_to_a_commit(string file)
    {
        var text = ReleaseFiles.Read(".github", "workflows", file);
        var uses = Uses.Matches(text).Select(m => m.Groups["action"].Value).ToList();
        Assert.NotEmpty(uses);
        // A reusable workflow of this repository is referenced by path (it is versioned with the caller); every other action is pinned
        foreach (var action in uses.Where(a => !a.StartsWith("./.github/workflows/", StringComparison.Ordinal)))
            Assert.Matches(@"^[\w.-]+/[\w./-]+@[0-9a-f]{40}$", action);
    }

    [Fact]
    public void Nothing_is_built_or_published_unless_the_tests_passed()
    {
        var ci = ReleaseFiles.Read(".github", "workflows", "ci.yml");
        var release = ReleaseFiles.Read(".github", "workflows", "release.yml");
        // The checks live in ci.yml only; the tag run calls them and a tag push does not start them a second time
        Assert.Matches(@"(?m)^  workflow_call:", ci);
        Assert.Matches(@"(?m)^  push:\n    tags-ignore:\n      - ""v\*""", ci);
        Assert.Matches(@"(?m)^  tests:\n(?:    [^\n]*\n)*?    uses: \./\.github/workflows/ci\.yml\n", release);

        var jobs = Regex.Split(release[release.IndexOf("\njobs:\n", StringComparison.Ordinal)..], @"\n  (?=[a-z_]+:\n)").Skip(1).ToList();
        foreach (var name in new[] { "licenses", "windows", "docker", "publish" })
        {
            var job = jobs.Single(j => j.StartsWith(name + ":", StringComparison.Ordinal));
            var chain = new HashSet<string>();
            Collect(name);
            Assert.Contains("tests", chain);

            void Collect(string current)
            {
                var text = jobs.Single(j => j.StartsWith(current + ":", StringComparison.Ordinal));
                var needs = Regex.Match(text, @"(?m)^    needs: (?:\[(?<list>[^\]]*)\]|(?<one>\S+))");
                foreach (var dep in (needs.Groups["list"].Success ? needs.Groups["list"].Value : needs.Groups["one"].Value).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    if (chain.Add(dep)) Collect(dep);
            }
            // A job that overrides the default success check (!cancelled()) must test the result of the tests itself
            var condition = Regex.Match(job, @"(?m)^    if: (?<c>.*)$");
            if (condition.Success && condition.Groups["c"].Value.Contains("!cancelled()", StringComparison.Ordinal))
                Assert.Contains("needs.tests.result == 'success'", condition.Groups["c"].Value);
        }
    }

    [Fact]
    public void There_is_no_development_path_any_more()
    {
        var workflow = ReleaseFiles.Read(".github", "workflows", "release.yml");
        Assert.DoesNotMatch(new Regex(@"is_dev|:dev\b|-dev\b|-Dev\b"), workflow.Replace("development build", string.Empty, StringComparison.OrdinalIgnoreCase));
        var script = ReleaseFiles.Read("scripts", "build-windows.ps1");
        Assert.DoesNotContain("$Dev", script);
        Assert.DoesNotMatch(new Regex(@"\[switch\]\$Dev|-Dev\b"), script);
    }

    [Fact]
    public void The_run_uses_the_shared_scripts_and_the_strict_licence_check()
    {
        var workflow = ReleaseFiles.Read(".github", "workflows", "release.yml");
        Assert.Contains("scripts/release-meta.sh", workflow);
        Assert.Contains("scripts/release-notes.sh", workflow);
        Assert.Contains("scripts/release-platform.sh", workflow);
        Assert.Contains("scripts/render-unraid-template.sh", workflow);
        Assert.Contains("generate-third-party-notices.ts --check --strict", workflow);
        Assert.Contains("body_path:", workflow);
        Assert.Contains("platforms: linux/amd64", workflow);
        // The image labels get the same facts as the title: version, repository, company, date
        foreach (var arg in new[] { "REPOSITORY=", "APP_COMPANY=", "APP_VERSION=", "APP_VERSION_DETAIL=", "APP_CHANNEL=", "IMAGE_TAG=", "BUILD_DATE=", "VCS_REF=" }) Assert.Contains(arg, workflow);
        // The moving tags come from the script, not from a hand-written expression
        Assert.Contains("tags: ${{ needs.inspect.outputs.docker_tags }}", workflow);
    }

    [Fact]
    public void The_windows_feed_file_names_are_the_ones_the_update_check_looks_for()
    {
        var workflow = ReleaseFiles.Read(".github", "workflows", "release.yml");
        Assert.Equal("releases.win.json", UpdateChannels.PackageFeedName(ReleaseVersion.Parse("v2026.11.12")!.Value));
        Assert.Equal("releases.beta.json", UpdateChannels.PackageFeedName(ReleaseVersion.Parse("v2026.11.12.13.557-beta")!.Value));
        Assert.Equal("releases.nightly.json", UpdateChannels.PackageFeedName(ReleaseVersion.Parse("v2026.11.12.13.557-nightly")!.Value));
        Assert.Contains("releases.win.json", workflow);
        Assert.Contains("releases.${CHANNEL}.json", workflow);
        Assert.Contains("releases.$($env:CHANNEL).json", workflow);
    }

    [Fact]
    public void The_nightly_package_label_matches_the_nightly_tag()
    {
        // Package version 2026.11.12-alpha.13.557 <-> tag v2026.11.12.13.557-nightly: the build script packs nightlies as "alpha" (SemVer sorts
        // alpha < beta < none, like the app ranks nightly < beta < release of one commit), the update check parses the tag
        var script = ReleaseFiles.Read("scripts", "build-windows.ps1");
        Assert.Contains("$label = if ($channel -eq 'nightly') { 'alpha' } else { $channel }", script);
        Assert.Contains("'--channel', $channel", script);
        var nightly = ReleaseVersion.Parse("v2026.11.12.13.557-nightly")!.Value;
        var beta = ReleaseVersion.Parse("v2026.11.12.13.557-beta")!.Value;
        var release = ReleaseVersion.Parse("v2026.11.12")!.Value;
        Assert.True(nightly < beta && beta < release);
        Assert.Equal("nightly", UpdateChannels.PackageChannel(nightly));
    }

    [Fact]
    public void Dockerfile_defaults_equal_branding_json_and_carry_the_new_company_name()
    {
        var dockerfile = ReleaseFiles.Read("Dockerfile");
        Assert.Contains($"ARG APP_COMPANY=\"{Branding.Company}\"", dockerfile);
        Assert.Contains($"ARG REPOSITORY={Branding.Repository}", dockerfile);
        Assert.Contains("org.opencontainers.image.source=\"https://github.com/${REPOSITORY}\"", dockerfile);
        Assert.Contains("org.opencontainers.image.vendor=\"${APP_COMPANY}\"", dockerfile);
        Assert.Equal("SushiFlux Development", Branding.Company);
    }

    [Fact]
    public void Every_artifact_carries_the_licence_texts()
    {
        Assert.Contains("THIRD-PARTY-NOTICES.md", ReleaseFiles.Read("Dockerfile"));
        Assert.Contains("THIRD-PARTY-NOTICES.md", ReleaseFiles.Read("src", "Cv.Desktop", "Cv.Desktop.csproj"));
        Assert.Contains("THIRD-PARTY-NOTICES.md", ReleaseFiles.Read("scripts", "build-windows.ps1"));
        Assert.DoesNotContain("THIRD-PARTY", ReleaseFiles.Read(".dockerignore"));
    }
}

public sealed class EntrypointTempTests : IDisposable
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "cv-entrypoint", Guid.NewGuid().ToString("N"));

    [Fact]
    public void Uploads_and_working_copies_go_to_a_temp_folder_inside_the_data_folder_which_is_emptied_at_every_start()
    {
        var shell = ReleaseFiles.Shell();
        Assert.SkipUnless(shell is not null, "no POSIX shell on this machine");
        var data = Path.Combine(_folder, "data");
        var bin = Path.Combine(_folder, "bin");
        Directory.CreateDirectory(Path.Combine(data, "tmp", "left-over"));
        File.WriteAllText(Path.Combine(data, "tmp", "left-over", "upload.tmp"), "x");
        File.WriteAllText(Path.Combine(data, "app.db"), "database");
        Directory.CreateDirectory(bin);
        // A stand-in for the dotnet command that reports what the app would see
        File.WriteAllText(Path.Combine(bin, "dotnet"), "#!/bin/sh\necho \"ASPNETCORE_TEMP=$ASPNETCORE_TEMP\"\necho \"TMPDIR=$TMPDIR\"\n");
        if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(Path.Combine(bin, "dotnet"), UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);

        var info = new ProcessStartInfo(shell!) { RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false };
        info.ArgumentList.Add(ReleaseFiles.Slashes(Path.Combine(ReleaseFiles.Root, "deploy", "docker-entrypoint.sh")));
        info.Environment["DATA_DIR"] = ReleaseFiles.Slashes(data);
        info.Environment["PATH"] = ReleaseFiles.Slashes(bin) + Path.PathSeparator + info.Environment["PATH"];
        var run = ReleaseFiles.Start(info);
        var output = run.Output.ReplaceLineEndings("\n");

        Assert.True(run.ExitCode == 0, run.Error + output);
        var expected = Normal(ReleaseFiles.Slashes(data) + "/tmp");
        var values = output.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(l => l.TrimEnd('\r')).ToDictionary(l => l[..l.IndexOf('=')], l => l[(l.IndexOf('=') + 1)..]);
        Assert.Equal(expected, Normal(values["ASPNETCORE_TEMP"]));
        Assert.Equal(expected, Normal(values["TMPDIR"]));
        Assert.True(Directory.Exists(Path.Combine(data, "tmp")));
        Assert.Empty(Directory.EnumerateFileSystemEntries(Path.Combine(data, "tmp")));
        Assert.Equal("database", File.ReadAllText(Path.Combine(data, "app.db")));
    }

    // Git's shell may hand a drive path on as /c/...: compare both forms alike
    private static string Normal(string path) => Regex.Replace(path.Replace('\\', '/'), "^/([A-Za-z])/", m => m.Groups[1].Value + ":/").ToLowerInvariant();

    [Fact]
    public void The_entrypoint_sets_the_temp_folder_for_both_ways_it_can_start()
    {
        var script = ReleaseFiles.Read("deploy", "docker-entrypoint.sh");
        Assert.Equal(2, Regex.Matches(script, @"^\s+use_data_temp$|^use_data_temp$", RegexOptions.Multiline).Count);
    }

    public void Dispose()
    {
        if (Directory.Exists(_folder)) Directory.Delete(_folder, recursive: true);
    }
}

public sealed class BrandingNamesTests
{
    [Theory]
    [InlineData(null, 0)]
    [InlineData("", 0)]
    [InlineData("   ", 0)]
    [InlineData("\"SushiFlux Develop\"", 1)]
    [InlineData("\n    \"SushiFlux Develop\",\n    \"Old Name\"\n  ", 2)]
    [InlineData("\"A\", \"a\"", 1)]
    public void The_names_in_the_raw_list_text_are_read(string? raw, int count) => Assert.Equal(count, Branding.ParseNames(raw).Count);

    [Fact]
    public void The_company_has_its_final_name_and_the_earlier_one_is_remembered()
    {
        Assert.Equal("SushiFlux Development", Branding.Company);
        Assert.Contains("SushiFlux Develop", Branding.PreviousCompanies);
    }
}
