// Copyright (c) 2026 SushiFlux Development
using Cv.Server.Updates;
using Velopack;

namespace Cv.Desktop.Tests;

/// <summary>
/// The tag of a release (v2026.11.12.13.557-nightly) and the version of its Windows package (2026.11.12-alpha.13.557, see scripts/build-windows.ps1)
/// are two spellings of one build. The app's update rule (ReleaseVersion) and Velopack's package order (SemVer) must rank any two builds the same
/// way, otherwise an offered update would be refused as a downgrade or a real update would never be offered.
/// </summary>
public sealed class PackageVersionTests
{
    /// <summary>The package version <c>build-windows.ps1</c> gives to the build of a tag.</summary>
    private static string PackageVersion(string tag)
    {
        var version = ReleaseVersion.Parse(tag)!.Value;
        var core = $"{version.Year}.{version.Month}.{version.Commit}";
        if (version.IsRelease) return core;
        var label = version.IsBeta ? "beta" : "alpha";
        return $"{core}-{label}.{version.Prompts}.{version.Lines}";
    }

    private static readonly string[] Tags =
    [
        "v2026.11.12",
        "v2026.11.12.13.557-beta",
        "v2026.11.12.13.557-nightly",
        "v2026.11.12.13.1000-nightly",
        "v2026.11.12.14.2-nightly",
        "v2026.11.13.1.1-nightly",
        "v2026.11.13.1.1-beta",
        "v2026.11.13",
        "v2026.12.20.9.9-beta",
        "v2027.1.1",
    ];

    public static TheoryData<string, string> Pairs()
    {
        var data = new TheoryData<string, string>();
        foreach (var a in Tags)
        {
            foreach (var b in Tags) data.Add(a, b);
        }
        return data;
    }

    [Theory]
    [MemberData(nameof(Pairs))]
    public void Two_builds_rank_the_same_by_tag_and_by_package_version(string a, string b)
    {
        var byTag = ReleaseVersion.Parse(a)!.Value.CompareTo(ReleaseVersion.Parse(b)!.Value);
        var packageA = SemanticVersion.Parse(PackageVersion(a));
        var packageB = SemanticVersion.Parse(PackageVersion(b));
        var byPackage = packageA > packageB ? 1 : packageA < packageB ? -1 : 0;
        Assert.Equal(Math.Sign(byTag), byPackage);
    }

    [Theory]
    [InlineData("v2026.11.12.13.557-nightly", "2026.11.12-alpha.13.557")]
    [InlineData("v2026.11.12.13.557-beta", "2026.11.12-beta.13.557")]
    [InlineData("v2026.11.12", "2026.11.12")]
    public void The_package_version_of_a_tag_is_the_one_the_build_script_writes(string tag, string package) => Assert.Equal(package, PackageVersion(tag));

    private static string FindRepositoryRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (File.Exists(Path.Combine(dir.FullName, "Cv.slnx"))) return dir.FullName;
        }
        throw new InvalidOperationException("Cv.slnx not found above the test folder.");
    }

    [Fact]
    public void The_build_script_packs_exactly_that_version_and_channel()
    {
        var script = File.ReadAllText(Path.Combine(FindRepositoryRoot(), "scripts", "build-windows.ps1"));
        Assert.Contains("$label = if ($channel -eq 'nightly') { 'alpha' } else { $channel }", script);
        Assert.Contains("$semver = \"$semver-$label$counters\"", script);
        Assert.Contains("'--channel', $channel", script);
    }
}
