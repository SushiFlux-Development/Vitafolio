// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Ai;
using Cv.Server.Auth;
using Cv.Server.Errors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Cv.Server.Controllers;

[ApiController]
[Route("api/ai")]
[Authorize]
public sealed class AiController(AiService ai, StepUp stepUp) : ControllerBase
{
    // Column widths of the fields that end up in applications, and a generous limit for pasted free text
    private const int MaxShortField = 128;
    private const int MaxJobDescription = 32768;
    private const int MaxInputText = 16384;
    private const int MaxRawResponse = 200_000;

    // Enough for the largest allowed texts (a character can take up to four bytes); the framework default would be 30 MB
    private const int MaxRequestBytes = 1_000_000;

    private Guid CurrentUserId => User.RequiredUserId();

    [HttpGet("config")]
    public async Task<ActionResult<AiConfigDto>> GetConfig(CancellationToken ct)
    {
        var config = await ai.GetConfigAsync(CurrentUserId, ct);
        return Ok(config);
    }

    [HttpPut("config")]
    public async Task<ActionResult<AiConfigDto>> SaveConfig([FromBody] UpdateAiConfigRequest req, CancellationToken ct)
    {
        var updated = await ai.SaveConfigAsync(CurrentUserId, req, ct);
        return Ok(updated);
    }

    [HttpPost("test-connection")]
    [EnableRateLimiting(RateLimitPolicies.Ai)]
    public async Task<ActionResult<TestAiConnectionResponse>> TestConnection(CancellationToken ct)
    {
        var result = await ai.TestConnectionAsync(CurrentUserId, ct);
        return Ok(result);
    }

    [HttpPost("prompt")]
    [RequestSizeLimit(MaxRequestBytes)]
    [EnableRateLimiting(RateLimitPolicies.Ai)]
    public async Task<ActionResult<AiPromptResponse>> BuildPrompt([FromBody] AiPromptRequest req, CancellationToken ct)
    {
        ValidateTaskFields(req.Task, req.JobTitle, req.Company, req.JobDescription, req.RecipientPerson, req.Tone, req.Language, req.InputText);
        var response = await ai.BuildPromptAsync(CurrentUserId, req, ct);
        return Ok(response);
    }

    [HttpPost("parse")]
    [RequestSizeLimit(MaxRequestBytes)]
    [EnableRateLimiting(RateLimitPolicies.Ai)]
    public async Task<ActionResult<object>> ParseResponse([FromBody] AiParseRequest req, CancellationToken ct)
    {
        var errors = new FieldErrors();
        InputRules.Required(errors, "rawResponse", req.RawResponse, MaxRawResponse);
        InputRules.Optional(errors, "language", req.Language, 8);
        errors.ThrowIfAny();
        var parsed = await ai.ParseResponseAsync(CurrentUserId, req, ct);
        return Ok(parsed);
    }

    [HttpPost("generate")]
    [RequestSizeLimit(MaxRequestBytes)]
    [EnableRateLimiting(RateLimitPolicies.Ai)]
    public async Task<ActionResult<object>> Generate([FromBody] AiGenerateRequest req, CancellationToken ct)
    {
        ValidateTaskFields(req.Task, req.JobTitle, req.Company, req.JobDescription, req.RecipientPerson, req.Tone, req.Language, req.InputText);
        var generated = await ai.GenerateAsync(CurrentUserId, req, ct);
        return Ok(generated);
    }

    [HttpGet("admin-config")]
    [Authorize(Policy = AuthConstants.AdminPolicy)]
    public async Task<ActionResult<AdminServerAiConfigDto>> GetAdminConfig(CancellationToken ct)
    {
        var cfg = await ai.GetAdminServerConfigAsync(ct);
        return Ok(cfg);
    }

    [HttpPut("admin-config")]
    [Authorize(Policy = AuthConstants.AdminPolicy)]
    public async Task<ActionResult<AdminServerAiConfigDto>> SaveAdminConfig([FromBody] UpdateAdminServerAiConfigRequest req, CancellationToken ct)
    {
        // Decides where everybody's application data is sent and under whose key: not with a stolen session alone
        await stepUp.VerifyAsync(HttpContext, req.Password, req.Code, "ai_server_config", ct);
        var updated = await ai.SaveAdminServerConfigAsync(req, ct);
        return Ok(updated);
    }

    private static void ValidateTaskFields(string? task, string? jobTitle, string? company, string? jobDescription, string? recipient, string? tone, string? language, string? inputText)
    {
        var errors = new FieldErrors();
        InputRules.Optional(errors, "task", task, 64);
        InputRules.Optional(errors, "jobTitle", jobTitle, MaxShortField);
        InputRules.Optional(errors, "company", company, MaxShortField);
        InputRules.Optional(errors, "jobDescription", jobDescription, MaxJobDescription);
        InputRules.Optional(errors, "recipientPerson", recipient, MaxShortField);
        InputRules.Optional(errors, "tone", tone, MaxShortField);
        InputRules.Optional(errors, "language", language, 8);
        InputRules.Optional(errors, "inputText", inputText, MaxInputText);
        errors.ThrowIfAny();
    }
}
