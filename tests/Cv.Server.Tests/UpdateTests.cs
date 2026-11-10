using System.Net;
using Cv.Server.Tests.Support;
using Cv.Server.Updates;

namespace Cv.Server.Tests;

public sealed class UpdateTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    [Fact]
    public void ReleaseVersion_Parses_Correctly()
    {
        var rel = ReleaseVersion.Parse("v2026.11.7");
        Assert.NotNull(rel);
        Assert.Equal(2026, rel.Value.Year);
        Assert.Equal(11, rel.Value.Month);
        Assert.Equal(7, rel.Value.Commit);
        Assert.True(rel.Value.IsRelease);
        Assert.False(rel.Value.IsBeta);
        Assert.False(rel.Value.IsNightly);

        var beta = ReleaseVersion.Parse("v2026.11.7.0.11-beta");
        Assert.NotNull(beta);
        Assert.Equal(0, beta.Value.Prompts);
        Assert.Equal(11, beta.Value.Lines);
        Assert.True(beta.Value.IsBeta);

        var nightly = ReleaseVersion.Parse("v2026.11.7.0.11-nightly");
        Assert.NotNull(nightly);
        Assert.True(nightly.Value.IsNightly);

        var dev = ReleaseVersion.Parse("v2026.11.7.0.11-dev");
        Assert.Null(dev);
    }

    [Fact]
    public void ReleaseVersion_Compares_Correctly()
    {
        var v1 = ReleaseVersion.Parse("v2026.11.6");
        var v2 = ReleaseVersion.Parse("v2026.11.7");
        var v2Nightly = ReleaseVersion.Parse("v2026.11.7.0.10-nightly");
        var v2Beta = ReleaseVersion.Parse("v2026.11.7.0.11-beta");

        Assert.True(v2 > v1);
        Assert.True(v2Beta > v2Nightly);
        Assert.True(v2 > v2Beta);
    }

    [Fact]
    public async Task UpdatesEndpoint_ReturnsStatus()
    {
        var client = await server.AdminAsync();
        var res = await client.GetAsync("/api/updates/status");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var json = await res.JsonAsync();
        Assert.True(json.TryGetProperty("currentVersion", out var currentVersion));
        Assert.False(string.IsNullOrEmpty(currentVersion.GetString()));
        Assert.True(json.TryGetProperty("host", out var host));
        Assert.False(string.IsNullOrEmpty(host.GetString()));
    }
}
