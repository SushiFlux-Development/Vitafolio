// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Cv.Server.Data;
using Cv.Server.Errors;

namespace Cv.Server.Ai;

public interface IAiClient
{
    Task<string> CompleteAsync(
        string provider,
        string model,
        string? baseUrl,
        string? apiKey,
        string systemPrompt,
        string userPrompt,
        CancellationToken ct
    );

    Task<TestAiConnectionResponse> TestConnectionAsync(
        string provider,
        string model,
        string? baseUrl,
        string? apiKey,
        CancellationToken ct
    );
}

public sealed class AiClient : IAiClient
{
    /// <summary>A generated cover letter is a few kilobytes; anything near this limit is not an answer but an attack or a broken server.</summary>
    public const int MaxResponseBytes = 2 * 1024 * 1024;

    private const string DefaultOpenAiBaseUrl = "https://api.openai.com/v1";
    private const string DefaultAnthropicBaseUrl = "https://api.anthropic.com/v1";
    public const string DefaultOllamaBaseUrl = "http://localhost:11434";

    /// <summary>LM Studio's local server, port 1234 by default (see its documentation of the OpenAI-compatible endpoints).</summary>
    public const string DefaultLmStudioBaseUrl = "http://localhost:1234";

    private readonly HttpClient _http;
    private readonly ILogger<AiClient> _logger;
    private readonly AiOutboundGuard _guard;

    public AiClient(HttpClient http, ILogger<AiClient> logger, AiOutboundGuard guard)
    {
        http.MaxResponseContentBufferSize = MaxResponseBytes;
        _http = http;
        _logger = logger;
        _guard = guard;
    }

    public async Task<string> CompleteAsync(
        string provider,
        string model,
        string? baseUrl,
        string? apiKey,
        string systemPrompt,
        string userPrompt,
        CancellationToken ct
    )
    {
        return provider switch
        {
            AiProviders.OpenAi => await CallOpenAiCompatibleAsync(await BaseUrlAsync(baseUrl, DefaultOpenAiBaseUrl, provider, ct), model, apiKey, systemPrompt, userPrompt, ct),
            AiProviders.Custom => await CallOpenAiCompatibleAsync(await BaseUrlAsync(baseUrl, DefaultOpenAiBaseUrl, provider, ct), model, apiKey, systemPrompt, userPrompt, ct),
            AiProviders.Ollama => await CallOpenAiCompatibleAsync(LocalApiRoot(await BaseUrlAsync(baseUrl, DefaultOllamaBaseUrl, provider, ct)), model, apiKey ?? "ollama", systemPrompt, userPrompt, ct),
            AiProviders.LmStudio => await CallOpenAiCompatibleAsync(LocalApiRoot(await BaseUrlAsync(baseUrl, DefaultLmStudioBaseUrl, provider, ct)), model, apiKey, systemPrompt, userPrompt, ct),
            AiProviders.Anthropic => await CallAnthropicAsync(await BaseUrlAsync(baseUrl, DefaultAnthropicBaseUrl, provider, ct), model, apiKey, systemPrompt, userPrompt, ct),
            AiProviders.Gemini => await CallGeminiAsync(model, apiKey, systemPrompt, userPrompt, ct),
            _ => throw ApiException.BadRequest("ai.invalid_provider", "This provider does not support a direct connection.")
        };
    }

    public async Task<TestAiConnectionResponse> TestConnectionAsync(
        string provider,
        string model,
        string? baseUrl,
        string? apiKey,
        CancellationToken ct
    )
    {
        try
        {
            var ping = await CompleteAsync(
                provider,
                model,
                baseUrl,
                apiKey,
                "You are a helpful assistant.",
                "Reply with {\"status\":\"ok\"} in JSON.",
                ct
            );

            return string.IsNullOrWhiteSpace(ping)
                ? new TestAiConnectionResponse(false, "No answer from the provider.", "ai.empty_response")
                : new TestAiConnectionResponse(true, "Connected.");
        }
        catch (ApiException ex)
        {
            return new TestAiConnectionResponse(false, ex.Message, ex.Code);
        }
    }

    /// <summary>The OpenAI-compatible root of a local server: both Ollama and LM Studio expose it under /v1, whether or not the address was typed with it.</summary>
    internal static string LocalApiRoot(string baseUrl)
    {
        var url = baseUrl.TrimEnd('/');
        return url.EndsWith("/v1", StringComparison.OrdinalIgnoreCase) ? url : url + "/v1";
    }

    private async Task<string> CallOpenAiCompatibleAsync(
        string baseUri,
        string model,
        string? apiKey,
        string systemPrompt,
        string userPrompt,
        CancellationToken ct
    )
    {
        var endpoint = $"{baseUri.TrimEnd('/')}/chat/completions";
        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint);

        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey.Trim());
        }

        var bodyObj = new
        {
            model = string.IsNullOrWhiteSpace(model) ? "gpt-4o-mini" : model.Trim(),
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt }
            },
            temperature = 0.3
        };

        req.Content = new StringContent(JsonSerializer.Serialize(bodyObj), Encoding.UTF8, "application/json");

        var respContent = await SendAsync(req, ct);
        return ReadText(respContent, doc => doc?["choices"]?[0]?["message"]?["content"]);
    }

    private async Task<string> CallAnthropicAsync(
        string baseUri,
        string model,
        string? apiKey,
        string systemPrompt,
        string userPrompt,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw ApiException.BadRequest("ai.missing_key", "This provider needs an API key.");
        }

        var endpoint = $"{baseUri.TrimEnd('/')}/messages";
        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint);
        req.Headers.Add("x-api-key", apiKey.Trim());
        req.Headers.Add("anthropic-version", "2023-06-01");

        var bodyObj = new
        {
            model = string.IsNullOrWhiteSpace(model) ? "claude-3-5-haiku-20241022" : model.Trim(),
            max_tokens = 4096,
            system = systemPrompt,
            messages = new[]
            {
                new { role = "user", content = userPrompt }
            },
            temperature = 0.3
        };

        req.Content = new StringContent(JsonSerializer.Serialize(bodyObj), Encoding.UTF8, "application/json");

        var respContent = await SendAsync(req, ct);
        return ReadText(respContent, doc => doc?["content"]?[0]?["text"]);
    }

    private async Task<string> CallGeminiAsync(
        string model,
        string? apiKey,
        string systemPrompt,
        string userPrompt,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw ApiException.BadRequest("ai.missing_key", "This provider needs an API key.");
        }

        var chosenModel = string.IsNullOrWhiteSpace(model) ? "gemini-2.5-flash" : model.Trim();
        var endpoint = $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(chosenModel)}:generateContent";

        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint);
        // In a header, not the URL: URLs end up in logs and error texts
        req.Headers.Add("x-goog-api-key", apiKey.Trim());

        var bodyObj = new
        {
            systemInstruction = new
            {
                parts = new[] { new { text = systemPrompt } }
            },
            contents = new[]
            {
                new { parts = new[] { new { text = userPrompt } } }
            },
            generationConfig = new
            {
                temperature = 0.3,
                responseMimeType = "application/json"
            }
        };

        req.Content = new StringContent(JsonSerializer.Serialize(bodyObj), Encoding.UTF8, "application/json");

        var respContent = await SendAsync(req, ct);
        return ReadText(respContent, doc => doc?["candidates"]?[0]?["content"]?["parts"]?[0]?["text"]);
    }

    /// <summary>
    /// Sends the request and returns the body. Provider and network errors reach the user only as stable codes: their texts can repeat the
    /// prompt, name internal hosts or leak key fragments, so they stay out of the answer and out of the log.
    /// </summary>
    private async Task<string> SendAsync(HttpRequestMessage req, CancellationToken ct)
    {
        try
        {
            using var resp = await _http.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode)
            {
                _logger.LogWarning("KI-Dienst antwortete mit Status {Status}.", (int)resp.StatusCode);
                throw ApiException.BadRequest("ai.api_error", "The AI service returned an error.");
            }
            return await resp.Content.ReadAsStringAsync(ct);
        }
        catch (HttpRequestException ex) when (IsBlocked(ex))
        {
            throw HostNotAllowed();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning("KI-Dienst nicht erreichbar ({Error}).", ex.HttpRequestError);
            throw ApiException.BadRequest("ai.connection_failed", "The AI service cannot be reached.");
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            throw ApiException.BadRequest("ai.timeout", "The AI service did not answer in time.");
        }
    }

    private static bool IsBlocked(Exception? ex)
    {
        for (; ex is not null; ex = ex.InnerException)
        {
            if (ex is AiHostBlockedException) return true;
        }
        return false;
    }

    private static ApiException HostNotAllowed() => ApiException.Field("baseUrl", "ai.host_not_allowed",
        "This server address is not released. An administrator can add its host in App-Administration.");

    private static string ReadText(string body, Func<JsonNode?, JsonNode?> select)
    {
        try
        {
            return select(JsonNode.Parse(body))?.GetValue<string>() ?? "";
        }
        catch (Exception ex) when (ex is JsonException or InvalidOperationException or FormatException)
        {
            throw ApiException.BadRequest("ai.api_error", "The AI service returned an unreadable answer.");
        }
    }

    /// <summary>The base URL to use: the provider's own when none is set. An own one must parse and, in server mode, be released.</summary>
    private async Task<string> BaseUrlAsync(string? configured, string fallback, string provider, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(configured)) return fallback;
        if (!TryParseBaseUrl(configured, out var uri))
        {
            throw ApiException.BadRequest("ai.invalid_url", "The base URL is not valid.");
        }
        if (!await _guard.IsBaseUrlAllowedAsync(uri, provider, ct)) throw HostNotAllowed();
        return configured.Trim().TrimEnd('/');
    }

    /// <summary>An absolute http(s) URL without embedded credentials.</summary>
    public static bool TryParseBaseUrl(string value, out Uri uri)
    {
        if (Uri.TryCreate(value.Trim(), UriKind.Absolute, out var parsed)
            && (parsed.Scheme == Uri.UriSchemeHttp || parsed.Scheme == Uri.UriSchemeHttps)
            && string.IsNullOrEmpty(parsed.UserInfo))
        {
            uri = parsed;
            return true;
        }
        uri = null!;
        return false;
    }
}
