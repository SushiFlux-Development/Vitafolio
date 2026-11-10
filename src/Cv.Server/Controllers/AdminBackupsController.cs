using System.Globalization;
using System.Text;
using Cv.Server.Auth;
using Cv.Server.Backups;
using Cv.Server.Configuration;
using Cv.Server.Errors;
using Cv.Server.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;

namespace Cv.Server.Controllers;

/// <summary>
/// Backups for admins (desktop: the local owner): settings with schedule, list, backup now, download, upload and restore.
/// Download, upload and restore contain everyone's data, so in server mode they need the step-up check (password + 2FA code).
/// </summary>
[ApiController]
[Route("api/admin/backups")]
[Authorize(Policy = AuthConstants.AdminPolicy)]
public sealed class AdminBackupsController(
    BackupService backups,
    BackupSettingsStore store,
    ActivityLogger activity,
    ServerSettings settings,
    TimeProvider time,
    ILogger<AdminBackupsController> logger) : ControllerBase
{
    // Generous: only the step-up fields travel next to the file
    private const int MaxFormFieldChars = 4096;

    /// <summary>At most this many uploaded backups are kept (uploads are never pruned automatically; delete old ones first).</summary>
    public const int MaxUploadedBackups = 10;

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken ct) => Ok(Describe(await store.GetAsync(ct)));

    [HttpPut("settings")]
    public async Task<IActionResult> PutSettings([FromBody] BackupSettings? body, CancellationToken ct)
    {
        BackupSettings.Validate(body);
        var before = await store.GetAsync(ct);
        var after = await store.SaveAsync(body!, ct);
        if (!BackupSettingsStore.SameSettings(before, after)) await activity.RecordNowAsync(HttpContext, "backup.settings_changed", null, new { before, after }, ct: ct);
        return Ok(Describe(after));
    }

    [HttpGet]
    public IReadOnlyList<BackupEntry> List() => backups.List();

    [HttpPost]
    public async Task<IActionResult> BackupNow(CancellationToken ct)
    {
        var result = await backups.RunAsync(BackupKinds.Manual, force: false, ct);
        if (result.Outcome == BackupOutcome.Unchanged)
        {
            throw ApiException.Conflict("backup.unchanged", "Nothing has changed since the last backup, so no new backup was made.");
        }
        var entry = Created(result);
        await activity.RecordNowAsync(HttpContext, "backup.created", entry.File, new { kind = entry.Kind, sizeBytes = entry.SizeBytes }, ct: ct);
        return StatusCode(StatusCodes.Status201Created, entry);
    }

    [HttpPost("current/download")]
    [EnableRateLimiting(RateLimitPolicies.StepUp)]
    public async Task<IActionResult> DownloadCurrent([FromBody] StepUpRequest? body, [FromServices] StepUp stepUp, CancellationToken ct)
    {
        await stepUp.VerifyAsync(HttpContext, body?.Password, body?.Code, "backup.download", ct);
        var result = await backups.RunAsync(BackupKinds.Manual, force: false, ct);
        // Unchanged: the newest backup already holds exactly the current state
        var entry = result.Outcome == BackupOutcome.Unchanged ? backups.Latest() ?? Created(await backups.RunAsync(BackupKinds.Manual, true, ct)) : Created(result);
        return await FileAsync(entry, ct);
    }

    [HttpPost("{id}/download")]
    [EnableRateLimiting(RateLimitPolicies.StepUp)]
    public async Task<IActionResult> Download(string id, [FromBody] StepUpRequest? body, [FromServices] StepUp stepUp, CancellationToken ct)
    {
        var entry = backups.Find(id) ?? throw ApiException.NotFound("backup.not_found", "This backup does not exist.");
        await stepUp.VerifyAsync(HttpContext, body?.Password, body?.Code, "backup.download", ct);
        return await FileAsync(entry, ct);
    }

    /// <summary>
    /// The body is streamed straight into the backup folder instead of being buffered by the framework: buffered form files land in the system
    /// temp folder, which is a small tmpfs in the container, and a backup can be gigabytes.
    /// </summary>
    [HttpPost("upload")]
    [EnableRateLimiting(RateLimitPolicies.StepUp)]
    [DisableRequestSizeLimit]
    [DisableFormValueBinding]
    public async Task<IActionResult> Upload([FromServices] StepUp stepUp, CancellationToken ct)
    {
        var incoming = Path.Combine(backups.Root, "incoming");
        Directory.CreateDirectory(incoming);
        var temp = Path.Combine(incoming, $"upload-{Guid.NewGuid():N}.part");
        try
        {
            var form = await ReceiveAsync(temp, ct);
            await stepUp.VerifyAsync(HttpContext, form.Password, form.Code, "backup.upload", ct);
            if (backups.List().Count(e => e.Tier == BackupService.TierUploaded) >= MaxUploadedBackups)
            {
                throw new ApiException(StatusCodes.Status409Conflict, "backup.upload_limit",
                    $"There are already {MaxUploadedBackups} uploaded backups. Delete one before uploading another.",
                    new Dictionary<string, object?> { ["max"] = MaxUploadedBackups });
            }
            if (form.FileBytes == 0) throw ApiException.Field("file", "validation.required", "Choose a backup file to upload.");

            var (check, entry, detail) = await backups.StoreUploadAsync(temp, KnownMigrations.All, ct);
            RestoreService.ThrowIfUnusable(check, detail, logger, settings.BackupLimits);
            await activity.RecordNowAsync(HttpContext, "backup.uploaded", entry!.File,
                new { originalName = Truncate(form.FileName, 128), sizeBytes = entry.SizeBytes }, ct: ct);
            return StatusCode(StatusCodes.Status201Created, entry);
        }
        finally
        {
            BackupService.TryDelete(temp);
        }
    }

    private sealed record UploadForm(long FileBytes, string? FileName, string? Password, string? Code);

    /// <summary>Reads the multipart body by hand: the file goes to <paramref name="target"/> with its size enforced while it arrives.</summary>
    private async Task<UploadForm> ReceiveAsync(string target, CancellationToken ct)
    {
        var boundary = Request.ContentType is { } contentType && MediaTypeHeaderValue.TryParse(contentType, out var media) && media.MediaType.Equals("multipart/form-data", StringComparison.OrdinalIgnoreCase)
            ? HeaderUtilities.RemoveQuotes(media.Boundary).Value
            : null;
        if (string.IsNullOrEmpty(boundary)) throw ApiException.Field("file", "validation.required", "Choose a backup file to upload.");

        long fileBytes = 0;
        string? fileName = null, password = null, code = null;
        var reader = new MultipartReader(boundary, Request.Body);
        while (await reader.ReadNextSectionAsync(ct) is { } section)
        {
            if (!ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var disposition)) continue;
            var name = HeaderUtilities.RemoveQuotes(disposition.Name).Value;
            if (disposition.IsFileDisposition() && string.Equals(name, "file", StringComparison.Ordinal) && fileName is null)
            {
                fileName = disposition.FileNameStar.Value ?? HeaderUtilities.RemoveQuotes(disposition.FileName).Value ?? "";
                await using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None);
                var buffer = new byte[81920];
                int read;
                while ((read = await section.Body.ReadAsync(buffer, ct)) > 0)
                {
                    fileBytes += read;
                    if (fileBytes > settings.BackupLimits.MaxBytes) RestoreService.ThrowIfUnusable(BackupCheck.TooLarge, "upload", logger, settings.BackupLimits);
                    await output.WriteAsync(buffer.AsMemory(0, read), ct);
                }
            }
            else if (string.Equals(name, "password", StringComparison.Ordinal))
            {
                password = await ReadFieldAsync(section, ct);
            }
            else if (string.Equals(name, "code", StringComparison.Ordinal))
            {
                code = await ReadFieldAsync(section, ct);
            }
        }
        return new UploadForm(fileBytes, fileName, password, code);
    }

    private static async Task<string> ReadFieldAsync(MultipartSection section, CancellationToken ct)
    {
        using var reader = new StreamReader(section.Body, Encoding.UTF8, leaveOpen: true);
        var buffer = new char[MaxFormFieldChars + 1];
        var length = await reader.ReadBlockAsync(buffer.AsMemory(), ct);
        return new string(buffer, 0, Math.Min(length, MaxFormFieldChars));
    }

    /// <summary>Deletes one backup file (step-up like a restore). Refused while a backup or restore is running.</summary>
    [HttpDelete("{id}")]
    [EnableRateLimiting(RateLimitPolicies.StepUp)]
    public async Task<IActionResult> Delete(string id, [FromBody] StepUpRequest? body, [FromServices] StepUp stepUp, CancellationToken ct)
    {
        var entry = backups.Find(id) ?? throw ApiException.NotFound("backup.not_found", "This backup does not exist.");
        await stepUp.VerifyAsync(HttpContext, body?.Password, body?.Code, "backup.delete", ct);
        if (!await backups.TryDeleteAsync(entry))
        {
            throw ApiException.Conflict("backup.busy", "A backup or a restore is running right now. Please try again in a moment.");
        }
        await activity.RecordNowAsync(HttpContext, "backup.deleted", entry.File, new { backup = entry.Id, kind = entry.Kind, tier = entry.Tier }, ct: ct);
        return NoContent();
    }

    [HttpPost("{id}/restore")]
    [EnableRateLimiting(RateLimitPolicies.StepUp)]
    public async Task<IActionResult> Restore(string id, [FromBody] StepUpRequest? body, [FromServices] StepUp stepUp,
        [FromServices] RestoreService restore, CancellationToken ct)
    {
        var entry = backups.Find(id) ?? throw ApiException.NotFound("backup.not_found", "This backup does not exist.");
        await stepUp.VerifyAsync(HttpContext, body?.Password, body?.Code, "backup.restore", ct);
        await restore.RestoreAsync(entry, HttpContext, ct);
        if (!settings.IsDesktop) SessionService.ClearCookies(HttpContext);
        return Ok(new { restored = true });
    }

    private object Describe(BackupSettings value)
    {
        var now = time.GetUtcNow().UtcDateTime;
        // The week preview has one row per calendar day: the list ends with the seventh day, not 168 hours from now
        var runs = BackupSchedule.NextRunsInDays(value, now, time.LocalTimeZone, 7);
        return new
        {
            value.AutomaticEnabled,
            value.OnStart,
            value.BeforeShutdown,
            value.Schedule,
            value.CatchUpMissed,
            value.KeepRecent,
            value.KeepDailyDays,
            nextRuns = runs,
            timeZone = BackupSchedule.BrowserZoneId(time.LocalTimeZone),
            directory = settings.BackupDirectory,
            maxUploadBytes = settings.BackupLimits.MaxBytes,
        };
    }

    private static BackupEntry Created(BackupResult result) =>
        result.Outcome == BackupOutcome.Created && result.Entry is not null
            ? result.Entry
            : throw new ApiException(StatusCodes.Status500InternalServerError, "backup.failed",
                "The backup could not be created. The server log has the details.");

    private async Task<IActionResult> FileAsync(BackupEntry entry, CancellationToken ct)
    {
        await activity.RecordNowAsync(HttpContext, "backup.downloaded", entry.File, new { backup = entry.Id }, ct: ct);
        var local = TimeZoneInfo.ConvertTimeFromUtc(entry.CreatedAt, time.LocalTimeZone);
        var database = entry.Format == BackupService.FormatDatabase;
        var name = $"{Slug(Branding.ProductName)}-backup-{local.ToString("yyyy-MM-dd-HHmm", CultureInfo.InvariantCulture)}{(database ? BackupService.DatabaseExtension : BackupService.ArchiveExtension)}";
        return PhysicalFile(entry.FullPath, database ? "application/vnd.sqlite3" : "application/zip", name);
    }

    private static string Slug(string name)
    {
        var builder = new StringBuilder();
        foreach (var c in name.ToLowerInvariant()) if (char.IsAsciiLetterOrDigit(c)) builder.Append(c);
        return builder.Length == 0 ? "app" : builder.ToString();
    }

    private static string? Truncate(string? value, int max) => value is null || value.Length <= max ? value : value[..max];
}

/// <summary>MVC would otherwise read (and buffer) the whole form before the action starts, which is exactly what a streaming upload must avoid.</summary>
[AttributeUsage(AttributeTargets.Method)]
internal sealed class DisableFormValueBindingAttribute : Attribute, IResourceFilter
{
    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        context.ValueProviderFactories.RemoveType<FormValueProviderFactory>();
        context.ValueProviderFactories.RemoveType<FormFileValueProviderFactory>();
        context.ValueProviderFactories.RemoveType<JQueryFormValueProviderFactory>();
    }

    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }
}
