using System.Net;
using System.Text.Json;
using Cv.Server.Ai;
using Cv.Server.Data;
using Cv.Server.Services;
using Cv.Server.Tests.Support;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Cv.Server.Tests;

/// <summary>The project rule: AI always offers API key, copy and paste, Ollama and LM Studio.</summary>
public sealed class LmStudioTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private AiOutboundGuard ServerGuard() => new(TestDoubles.Settings(HostMode.Server), server.Factory.Services.GetRequiredService<SettingsService>()) { Resolve = (_, _) => Task.FromResult(new[] { IPAddress.Loopback }) };

    private static AiClient Client(AiOutboundGuard guard) => new(new HttpClient(guard.CreateHandler()) { Timeout = TimeSpan.FromSeconds(10) }, NullLogger<AiClient>.Instance, guard);

    [Fact]
    public void Lm_studio_is_a_provider_of_its_own_that_needs_no_key()
    {
        Assert.True(AiProviders.IsValid(AiProviders.LmStudio));
        Assert.True(AiProviders.IsLocal(AiProviders.LmStudio));
        Assert.True(AiProviders.IsLocal(AiProviders.Ollama));
        Assert.False(AiProviders.IsLocal(AiProviders.OpenAi));
    }

    [Theory]
    [InlineData("http://localhost:1234", "http://localhost:1234/v1")]
    [InlineData("http://localhost:1234/", "http://localhost:1234/v1")]
    [InlineData("http://localhost:1234/v1", "http://localhost:1234/v1")]
    [InlineData("http://localhost:1234/v1/", "http://localhost:1234/v1")]
    public void The_api_root_is_right_with_or_without_v1_in_the_address(string address, string expected) =>
        Assert.Equal(expected, AiClient.LocalApiRoot(address));

    [Fact]
    public void The_default_address_is_lm_studios_documented_port() => Assert.Equal("http://localhost:1234", AiClient.DefaultLmStudioBaseUrl);

    [Fact]
    public async Task On_a_server_lm_studio_is_refused_without_a_release_just_like_ollama()
    {
        await using var local = new TestDoubles.LocalServer(TestDoubles.LocalServer.Json("{}"));
        foreach (var provider in new[] { AiProviders.LmStudio, AiProviders.Ollama })
        {
            var error = await Assert.ThrowsAsync<Cv.Server.Errors.ApiException>(() => Client(ServerGuard()).CompleteAsync(provider, "m", $"http://127.0.0.1:{local.Port}", null, "s", "u", Ct));
            Assert.Equal("ai.host_not_allowed", error.Code);
        }
        Assert.Equal(0, local.Connections);
    }

    [Fact]
    public async Task On_a_server_the_default_address_is_blocked_while_connecting_when_not_released()
    {
        var error = await Assert.ThrowsAsync<Cv.Server.Errors.ApiException>(() => Client(ServerGuard()).CompleteAsync(AiProviders.LmStudio, "m", null, null, "s", "u", Ct));
        Assert.Equal("ai.host_not_allowed", error.Code);
    }

    [Fact]
    public async Task The_windows_program_reaches_lm_studio_without_a_key_and_a_saved_lm_studio_config_counts_as_ready()
    {
        var guard = new AiOutboundGuard(TestDoubles.Settings(HostMode.Desktop), server.Factory.Services.GetRequiredService<SettingsService>());
        await using var local = new TestDoubles.LocalServer(TestDoubles.LocalServer.Json("{\"choices\":[{\"message\":{\"content\":\"antwort\"}}]}"));
        var answer = await Client(guard).CompleteAsync(AiProviders.LmStudio, "model", $"http://127.0.0.1:{local.Port}", null, "s", "u", Ct);
        Assert.Equal("antwort", answer);
        Assert.Equal(1, local.Connections);
    }

    [Fact]
    public async Task The_provider_is_accepted_when_saving()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "lmstudio-user");
        var saved = await user.PutAsync("/api/ai/config", new { provider = "lmstudio", model = "qwen", pseudonymize = true });
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        Assert.Equal("lmstudio", (await saved.JsonAsync()).GetProperty("provider").GetString());
    }
}

/// <summary>Copy and paste needs no key: every one of the five tasks builds a prompt and reads the pasted answer back.</summary>
public sealed class CopyPasteTaskTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    public static TheoryData<string, string, string> Tasks() => new()
    {
        { AiTasks.GenerateCoverLetter, """{"subject":"Betreff","salutation":"Guten Tag","opening":"Einleitung","body":"Text","closing":"Schluss","keyMatches":["a"]}""", "body" },
        { AiTasks.AnalyzeJobPosting, """{"matchScore":80,"summary":"Passt","matchedRequirements":[],"missingRequirements":[],"tips":["Tipp"]}""", "matchScore" },
        { AiTasks.GenerateSummary, """{"shortSummary":"Kurzprofil","bulletPoints":["a","b","c"]}""", "shortSummary" },
        { AiTasks.ImproveBulletPoint, """{"improved":"Besser","alternatives":["x"],"explanation":"Darum"}""", "improved" },
        { AiTasks.TranslateContent, """{"translatedText":"Text","items":[{"key":"content","translation":"Text"}]}""", "translatedText" },
    };

    [Theory]
    [MemberData(nameof(Tasks))]
    public async Task A_copy_and_paste_user_can_run_every_task(string task, string answer, string expectedField)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "paste-" + task);

        var prompt = await user.PostAsync("/api/ai/prompt", new { task, jobTitle = "Entwickler", company = "Firma", jobDescription = "Anzeige", inputText = "Eingabe", language = "de" });
        Assert.Equal(HttpStatusCode.OK, prompt.StatusCode);
        var promptBody = await prompt.JsonAsync();
        Assert.False(string.IsNullOrWhiteSpace(promptBody.GetProperty("fullCopyPasteText").GetString()));

        var parsed = await user.PostAsync("/api/ai/parse", new { task, rawResponse = answer, pseudonymized = promptBody.GetProperty("pseudonymized").GetBoolean() });
        Assert.Equal(HttpStatusCode.OK, parsed.StatusCode);
        Assert.Equal(JsonValueKind.Object, (await parsed.JsonAsync()).ValueKind);
        Assert.Contains(expectedField, await parsed.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);
    }
}
