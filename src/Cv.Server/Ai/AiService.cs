// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Data;
using Cv.Server.Errors;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace Cv.Server.Ai;

public sealed partial class AiService(
    AppDbContext db,
    IAiClient client,
    IDataProtectionProvider protection,
    AiOutboundGuard guard,
    AiUsageLimiter usage,
    ILogger<AiService> logger
)
{
    // Column widths of user_ai_configs
    private const int MaxModelLength = 64;
    private const int MaxBaseUrlLength = 512;
    private const int MaxApiKeyLength = 4096;

    private readonly IDataProtector _protector = protection.CreateProtector("Cv.Server.AiApiKey.v1");

    [System.Text.RegularExpressions.GeneratedRegex(@"^[A-Za-z0-9._:/\-]+\z")]
    private static partial System.Text.RegularExpressions.Regex ModelRegex();

    public async Task<AiConfigDto> GetConfigAsync(Guid userId, CancellationToken ct)
    {
        var config = await db.AiConfigs.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        var serverConfig = await GetAdminServerConfigAsync(ct);
        bool hasServerFallback = serverConfig.Enabled && (!string.IsNullOrEmpty(serverConfig.Provider) && (AiProviders.IsLocal(serverConfig.Provider) || serverConfig.HasApiKey));
        string? fallbackProvider = hasServerFallback ? serverConfig.Provider : null;

        if (config is null)
        {
            return new AiConfigDto(
                Provider: AiProviders.CopyPaste,
                Model: "gpt-4o-mini",
                BaseUrl: null,
                HasApiKey: false,
                Pseudonymize: true,
                HasServerFallback: hasServerFallback,
                ServerFallbackProvider: fallbackProvider
            );
        }

        return new AiConfigDto(
            Provider: config.Provider,
            Model: config.Model,
            BaseUrl: config.BaseUrl,
            HasApiKey: !string.IsNullOrEmpty(config.ApiKeyProtected),
            Pseudonymize: config.Pseudonymize,
            HasServerFallback: hasServerFallback,
            ServerFallbackProvider: fallbackProvider
        );
    }

    public async Task<AdminServerAiConfigDto> GetAdminServerConfigAsync(CancellationToken ct)
    {
        var enabledSetting = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == "ai.server_enabled", ct);
        var providerSetting = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == "ai.server_provider", ct);
        var modelSetting = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == "ai.server_model", ct);
        var baseUrlSetting = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == "ai.server_base_url", ct);
        var keySetting = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == "ai.server_api_key", ct);

        return new AdminServerAiConfigDto(
            Enabled: enabledSetting?.Value.Equals("true", StringComparison.OrdinalIgnoreCase) ?? false,
            Provider: providerSetting?.Value ?? AiProviders.CopyPaste,
            Model: modelSetting?.Value ?? "gpt-4o-mini",
            BaseUrl: baseUrlSetting?.Value,
            HasApiKey: !string.IsNullOrEmpty(keySetting?.Value)
        );
    }

    public async Task<AdminServerAiConfigDto> SaveAdminServerConfigAsync(UpdateAdminServerAiConfigRequest req, CancellationToken ct)
    {
        var errors = new FieldErrors();
        ValidateConfigFields(errors, req.Provider, req.Model, req.BaseUrl, req.ApiKey);
        errors.ThrowIfAny();

        await SetAppSettingAsync("ai.server_enabled", req.Enabled ? "true" : "false", ct);
        if (req.Provider is not null) await SetAppSettingAsync("ai.server_provider", req.Provider, ct);
        if (req.Model is not null) await SetAppSettingAsync("ai.server_model", req.Model, ct);
        if (req.BaseUrl is not null) await SetAppSettingAsync("ai.server_base_url", req.BaseUrl.Trim(), ct);
        if (req.ApiKey is not null)
        {
            var protectedKey = string.IsNullOrWhiteSpace(req.ApiKey) ? "" : _protector.Protect(req.ApiKey.Trim());
            await SetAppSettingAsync("ai.server_api_key", protectedKey, ct);
        }

        await db.SaveChangesAsync(ct);
        return await GetAdminServerConfigAsync(ct);
    }

    private async Task SetAppSettingAsync(string key, string value, CancellationToken ct)
    {
        var existing = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == key, ct);
        if (existing is null)
        {
            db.AppSettings.Add(new AppSetting { Key = key, Value = value });
        }
        else
        {
            existing.Value = value;
        }
    }

    private static void ValidateConfigFields(FieldErrors errors, string? provider, string? model, string? baseUrl, string? apiKey)
    {
        if (provider is not null && !AiProviders.IsValid(provider))
        {
            errors.Add("provider", "validation.one_of", new()
            {
                ["allowed"] = new[] { AiProviders.CopyPaste, AiProviders.OpenAi, AiProviders.Anthropic, AiProviders.Gemini, AiProviders.Ollama, AiProviders.LmStudio, AiProviders.Custom },
            });
        }
        if (model is not null)
        {
            InputRules.Optional(errors, "model", model.Trim(), MaxModelLength);
            if (model.Trim().Length > 0 && model.Trim().Length <= MaxModelLength && !ModelRegex().IsMatch(model.Trim())) errors.Add("model", "validation.pattern");
        }
        if (baseUrl is not null)
        {
            InputRules.Optional(errors, "baseUrl", baseUrl, MaxBaseUrlLength);
            if (!string.IsNullOrWhiteSpace(baseUrl) && baseUrl.Length <= MaxBaseUrlLength && !AiClient.TryParseBaseUrl(baseUrl, out _)) errors.Add("baseUrl", "validation.url");
        }
        InputRules.Optional(errors, "apiKey", apiKey, MaxApiKeyLength);
    }

    private async Task<(string provider, string model, string? baseUrl, string? apiKey, bool pseudonymize, bool usesServerKey)> ResolveActiveConfigAsync(Guid userId, CancellationToken ct)
    {
        var config = await db.AiConfigs.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        var pseudonymize = config?.Pseudonymize ?? true;

        if (config != null && config.Provider != AiProviders.CopyPaste && (!string.IsNullOrEmpty(config.ApiKeyProtected) || AiProviders.IsLocal(config.Provider)))
        {
            return (config.Provider, config.Model, config.BaseUrl, UnprotectApiKey(config.ApiKeyProtected), pseudonymize, false);
        }

        var serverConfig = await GetAdminServerConfigAsync(ct);
        if (serverConfig.Enabled && (serverConfig.HasApiKey || AiProviders.IsLocal(serverConfig.Provider)))
        {
            var serverKeySetting = await db.AppSettings.FirstOrDefaultAsync(s => s.Key == "ai.server_api_key", ct);
            var serverApiKey = UnprotectApiKey(serverKeySetting?.Value);
            return (serverConfig.Provider ?? AiProviders.CopyPaste, serverConfig.Model ?? "gpt-4o-mini", serverConfig.BaseUrl, serverApiKey, pseudonymize, true);
        }

        return (config?.Provider ?? AiProviders.CopyPaste, config?.Model ?? "gpt-4o-mini", config?.BaseUrl, UnprotectApiKey(config?.ApiKeyProtected), pseudonymize, false);
    }

    public async Task<AiConfigDto> SaveConfigAsync(Guid userId, UpdateAiConfigRequest req, CancellationToken ct)
    {
        var errors = new FieldErrors();
        ValidateConfigFields(errors, req.Provider, req.Model, req.BaseUrl, req.ApiKey);
        errors.ThrowIfAny();

        // Say it at once, not only at the first request: the base URL's host must be released on a server
        if (!string.IsNullOrWhiteSpace(req.BaseUrl) && AiClient.TryParseBaseUrl(req.BaseUrl, out var parsedUrl))
        {
            var effectiveProvider = req.Provider ?? (await db.AiConfigs.AsNoTracking().FirstOrDefaultAsync(c => c.UserId == userId, ct))?.Provider ?? AiProviders.CopyPaste;
            if (!await guard.IsBaseUrlAllowedAsync(parsedUrl, effectiveProvider, ct))
            {
                throw ApiException.Field("baseUrl", "ai.host_not_allowed", "This server address is not released. An administrator can add its host in App-Administration.");
            }
        }

        var config = await db.AiConfigs.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        var now = DateTime.UtcNow;

        if (config is null)
        {
            config = new UserAiConfig
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Provider = req.Provider ?? AiProviders.CopyPaste,
                Model = req.Model ?? "gpt-4o-mini",
                BaseUrl = req.BaseUrl,
                Pseudonymize = req.Pseudonymize ?? true,
                CreatedAt = now,
                UpdatedAt = now
            };
            db.AiConfigs.Add(config);
        }
        else
        {
            if (req.Provider is not null) config.Provider = req.Provider;
            if (req.Model is not null) config.Model = req.Model;
            if (req.BaseUrl is not null) config.BaseUrl = string.IsNullOrWhiteSpace(req.BaseUrl) ? null : req.BaseUrl.Trim();
            if (req.Pseudonymize.HasValue) config.Pseudonymize = req.Pseudonymize.Value;
            config.UpdatedAt = now;
        }

        if (req.ApiKey is not null)
        {
            config.ApiKeyProtected = string.IsNullOrWhiteSpace(req.ApiKey)
                ? null
                : _protector.Protect(req.ApiKey.Trim());
        }

        await db.SaveChangesAsync(ct);

        return new AiConfigDto(
            Provider: config.Provider,
            Model: config.Model,
            BaseUrl: config.BaseUrl,
            HasApiKey: !string.IsNullOrEmpty(config.ApiKeyProtected),
            Pseudonymize: config.Pseudonymize
        );
    }

    public async Task<TestAiConnectionResponse> TestConnectionAsync(Guid userId, CancellationToken ct)
    {
        var (provider, model, baseUrl, apiKey, _, usesServerKey) = await ResolveActiveConfigAsync(userId, ct);
        if (provider == AiProviders.CopyPaste)
        {
            return new TestAiConnectionResponse(true, "Copy and paste needs no server connection.");
        }

        if (usesServerKey) usage.ConsumeServerKey(userId);

        return await client.TestConnectionAsync(provider, model, baseUrl, apiKey, ct);
    }

    public async Task<AiPromptResponse> BuildPromptAsync(Guid userId, AiPromptRequest req, CancellationToken ct)
    {
        if (!AiTasks.IsValid(req.Task))
        {
            throw ApiException.BadRequest("ai.invalid_task", $"Ungültige KI-Aufgabe '{req.Task}'.");
        }

        var profile = await LoadFullProfileAsync(userId, ct);
        var config = await db.AiConfigs.FirstOrDefaultAsync(c => c.UserId == userId, ct);
        var pseudonymize = config?.Pseudonymize ?? true;

        var (sys, user, copyPaste) = AiPromptBuilder.Build(req.Task, profile, req, pseudonymize);

        return new AiPromptResponse(
            Task: req.Task,
            SystemPrompt: sys,
            UserPrompt: user,
            FullCopyPasteText: copyPaste,
            Pseudonymized: pseudonymize
        );
    }

    public async Task<object> ParseResponseAsync(Guid userId, AiParseRequest req, CancellationToken ct)
    {
        if (!AiTasks.IsValid(req.Task))
        {
            throw ApiException.BadRequest("ai.invalid_task", $"Ungültige KI-Aufgabe '{req.Task}'.");
        }

        var profile = await LoadFullProfileAsync(userId, ct);
        return AiResponseParser.ParseAndDePseudonymize(req.Task, req.RawResponse, profile, req.Pseudonymized);
    }

    public async Task<object> GenerateAsync(Guid userId, AiGenerateRequest req, CancellationToken ct)
    {
        if (!AiTasks.IsValid(req.Task))
        {
            throw ApiException.BadRequest("ai.invalid_task", $"Ungültige KI-Aufgabe '{req.Task}'.");
        }

        var (provider, model, baseUrl, apiKey, pseudonymize, usesServerKey) = await ResolveActiveConfigAsync(userId, ct);
        if (provider == AiProviders.CopyPaste)
        {
            throw ApiException.BadRequest(
                "ai.copy_paste_only",
                "Aktuell ist der Modus 'Kopieren & Einfügen' aktiv. Bitte nutzen Sie die Schaltfläche 'Prompt kopieren' oder hinterlegen Sie einen API-Key in den Einstellungen."
            );
        }

        if (usesServerKey) usage.ConsumeServerKey(userId);

        var profile = await LoadFullProfileAsync(userId, ct);

        var promptReq = new AiPromptRequest(
            Task: req.Task,
            JobTitle: req.JobTitle,
            Company: req.Company,
            JobDescription: req.JobDescription,
            RecipientPerson: req.RecipientPerson,
            Tone: req.Tone,
            Language: req.Language,
            InputText: req.InputText,
            CoverLetterId: req.CoverLetterId
        );

        var (sys, user, _) = AiPromptBuilder.Build(req.Task, profile, promptReq, pseudonymize);

        var rawResponse = await client.CompleteAsync(
            provider,
            model,
            baseUrl,
            apiKey,
            sys,
            user,
            ct
        );

        return AiResponseParser.ParseAndDePseudonymize(req.Task, rawResponse, profile, pseudonymize);
    }

    /// <summary>
    /// The stored key in clear text. A key that exists but cannot be decrypted is an error of its own: the key ring is not part of a backup, so after
    /// a move to a new data folder this happens, and sending the request without a key would only produce a misleading answer from the provider.
    /// </summary>
    private string? UnprotectApiKey(string? protectedKey)
    {
        if (string.IsNullOrWhiteSpace(protectedKey)) return null;
        try
        {
            return _protector.Unprotect(protectedKey);
        }
        catch (System.Security.Cryptography.CryptographicException ex)
        {
            logger.LogWarning(ex, "Ein gespeicherter KI-Schlüssel kann nicht entschlüsselt werden (der Schlüsselbund im Ordner keys/ fehlt oder ist neu, z. B. nach dem Einspielen einer Sicherung in einen neuen Datenordner). Er muss neu eingetragen werden.");
            throw new ApiException(StatusCodes.Status409Conflict, "ai.key_unavailable",
                "The stored API key cannot be decrypted any more, for example after restoring a backup into a new data folder. Enter it again in the AI settings.");
        }
    }

    private async Task<UserProfile?> LoadFullProfileAsync(Guid userId, CancellationToken ct)
    {
        return await db.Profiles
            .Include(p => p.Experiences)
            .Include(p => p.Educations)
            .Include(p => p.Skills)
            .Include(p => p.Languages)
            .Include(p => p.Certificates)
            .Include(p => p.Interests)
            .Include(p => p.CustomSections)
                .ThenInclude(s => s.Items)
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);
    }
}
