using Cv.Server.Configuration;

namespace Cv.Server.Updates;

/// <summary>
/// The update channels a person can choose and what each of them offers. Pure logic, the rules in one place:
/// <list type="bullet">
/// <item>No channel (default): full releases only.</item>
/// <item>Beta: betas and full releases, never nightlies.</item>
/// <item>Nightly: nightlies and full releases, never betas.</item>
/// </list>
/// Without a saved choice the channel of the running build applies: a nightly build stays in the nightly channel, anything else means no channel.
/// </summary>
public static class UpdateChannels
{
    public const string None = "none";
    public const string Beta = "beta";
    public const string Nightly = "nightly";

    /// <summary>Name of the Velopack channel a full release is packed into (<c>vpk pack</c> without <c>--channel</c> uses the short OS name).</summary>
    public const string WindowsReleasePackageChannel = "win";

    public static readonly IReadOnlyList<string> All = [None, Beta, Nightly];

    public static bool IsValid(string? channel) => channel is None or Beta or Nightly;

    /// <summary>The channel that applies while nothing is saved.</summary>
    public static string FromBuild(string? buildChannel) => VersionFormat.Kind(buildChannel) switch
    {
        "beta" => Beta,
        "nightly" => Nightly,
        _ => None,
    };

    public static bool Accepts(string channel, ReleaseVersion version) =>
        version.IsRelease || (channel == Beta && version.IsBeta) || (channel == Nightly && version.IsNightly);

    /// <summary>The Docker image tag a person on this channel needs. A full release is pushed under all three, so every channel still receives it.</summary>
    public static string DockerTag(string channel) => channel switch
    {
        Beta => "beta",
        Nightly => "nightly",
        _ => "latest",
    };

    /// <summary>The Velopack channel a release is packed into: its feed is <c>releases.&lt;channel&gt;.json</c> among the release's files.</summary>
    public static string PackageChannel(ReleaseVersion version) =>
        version.IsBeta ? Beta : version.IsNightly ? Nightly : WindowsReleasePackageChannel;

    public static string PackageFeedName(ReleaseVersion version) => $"releases.{PackageChannel(version)}.json";

    /// <summary>
    /// The newest published version this channel accepts and that is newer than the running one. An unknown running version is never
    /// updated: there is nothing to compare with, and offering "an update" could be a downgrade.
    /// </summary>
    public static T? NewestUpdate<T>(string channel, ReleaseVersion? current, IEnumerable<T> published, Func<T, ReleaseVersion> version) where T : class
    {
        if (current is null) return null;
        T? best = null;
        foreach (var item in published)
        {
            var candidate = version(item);
            if (!Accepts(channel, candidate) || candidate <= current.Value) continue;
            if (best is null || candidate > version(best)) best = item;
        }
        return best;
    }
}
