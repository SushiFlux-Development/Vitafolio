using Cv.Server.Auth;
using Cv.Server.Configuration;
using Cv.Server.Data;
using Cv.Server.Errors;
using Cv.Server.Services;
using Microsoft.EntityFrameworkCore;

namespace Cv.Server.Backups;

/// <summary>
/// Restores a backup into the live data. Order (never weakened):
/// <list type="number">
/// <item>The backup is unpacked into a work folder in the data directory and checked completely (archive rules, manifest against content, SQLite,
/// intact, this app, not from a newer schema - <c>backup.too_new</c>). Nothing live has been touched so far.</item>
/// <item>The API is closed (maintenance gate) and the requests in flight are waited for; if they do not finish within 15 seconds the
/// restore is abandoned with 503 <c>maintenance.busy</c> and nothing has changed.</item>
/// <item>A <c>pre-restore</c> safety backup of the current state; if it fails, nothing is restored.</item>
/// <item>A journal is written, the file trees are swapped by renames (an old database-only backup leaves the files alone), the content is written with
/// SQLite's online backup API into the live database (no file swap of an open database), and the migrations lift an older backup to the current
/// schema. If any of it fails, or the process dies, the previous state is put back completely - by this method or by the next start - and the answer
/// is <c>backup.restore_failed</c>.</item>
/// <item>All sessions are revoked and the token signing key is rotated, so everybody signs in again; an activity-log entry is written into
/// the restored database.</item>
/// </list>
/// </summary>
public sealed class RestoreService(
    BackupService backups,
    MaintenanceGate gate,
    ServerSettings settings,
    SigningKeyStore signingKeys,
    SettingsService instanceSettings,
    BackupSettingsStore backupSettings,
    IServiceScopeFactory scopes,
    TimeProvider time,
    ILogger<RestoreService> logger)
{
    public static readonly TimeSpan QuietTimeout = TimeSpan.FromSeconds(15);

    public async Task RestoreAsync(BackupEntry entry, HttpContext context, CancellationToken ct)
    {
        var workspace = RestoreWorkspace.Create(settings.DataDirectory);
        var keepWorkspace = false;
        var actorId = context.User.UserId();
        var actorName = context.User.Username();
        var ip = ClientInfo.Ip(context);
        try
        {
            var replaceFiles = await PrepareAsync(entry, workspace, ct);

            gate.Close();
            try
            {
                // The restore request itself is one of the requests in flight
                if (!await WaitForQuietAsync(gate, 1, QuietTimeout, time, ct))
                {
                    logger.LogWarning("Wiederherstellung abgebrochen: andere Anfragen liefen nach {Seconds} Sekunden noch. Nichts wurde verändert.",
                        QuietTimeout.TotalSeconds);
                    throw new ApiException(StatusCodes.Status503ServiceUnavailable, "maintenance.busy",
                        "Other requests were still running, so the restore was not started. Nothing was changed - please try again.");
                }

                await backups.Gate.WaitAsync(ct);
                try
                {
                    var safety = await backups.RunLockedAsync(BackupKinds.PreRestore, force: true, ct);
                    if (safety.Outcome != BackupOutcome.Created || safety.Entry is null)
                    {
                        throw new ApiException(StatusCodes.Status500InternalServerError, "backup.failed",
                            "The safety backup of the current state failed, so nothing was restored. The server log has the details.");
                    }

                    BackupService.Snapshot(settings.DatabaseFile, workspace.RollbackDatabase);
                    workspace.Begin(replaceFiles);
                    try
                    {
                        // From here on a client that hangs up must not stop the work halfway
                        if (replaceFiles) workspace.SwapFiles();
                        if (AfterSwapForTests is { } hook) await hook();
                        await WriteIntoLiveAsync(workspace.IncomingDatabase, CancellationToken.None);
                        await FinishAsync(entry, safety.Entry, actorId, actorName, ip, CancellationToken.None);
                        workspace.Complete();
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Wiederherstellung von {File} fehlgeschlagen - der Stand von vorher wird zurückgeholt (Sicherheitskopie: {Safety}).",
                            entry.File, safety.Entry.File);
                        var rolledBack = workspace.Revert(logger);
                        keepWorkspace = !rolledBack;
                        instanceSettings.Invalidate();
                        backupSettings.Invalidate();
                        throw new ApiException(StatusCodes.Status500InternalServerError, "backup.restore_failed",
                            rolledBack
                                ? $"The backup could not be restored. The previous state was put back. It is also saved as the safety backup {safety.Entry.File}. The server log has the details."
                                : $"The backup could not be restored, and putting back the previous state failed too. Restore the safety backup {safety.Entry.File} before using the app. The server log has the details.",
                            new Dictionary<string, object?>
                            {
                                ["safetyBackup"] = safety.Entry.File,
                                ["safetyBackupId"] = safety.Entry.Id,
                                ["rolledBack"] = rolledBack,
                            });
                    }

                    // Only reached when the restore succeeded; outside the try above so a failure here can never trigger a rollback
                    try
                    {
                        backups.RemoveOlderSafetyBackups(safety.Entry);
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                    {
                        logger.LogWarning("Ältere Sicherheitskopien konnten nicht aufgeräumt werden: {Message}", ex.Message);
                    }
                }
                finally
                {
                    backups.Gate.Release();
                }
            }
            finally
            {
                gate.Open();
            }
        }
        finally
        {
            if (!keepWorkspace) workspace.Discard();
        }
    }

    /// <summary>Unpacks and checks the backup in the work folder. True when it carries files (an old database-only backup does not).</summary>
    private async Task<bool> PrepareAsync(BackupEntry entry, RestoreWorkspace workspace, CancellationToken ct)
    {
        BackupManifest? manifest = null;
        var isArchive = BackupArchive.LooksLikeArchive(entry.FullPath);
        if (isArchive)
        {
            var unpacked = BackupArchive.Extract(entry.FullPath, workspace.Incoming, settings.BackupLimits, ct);
            ThrowIfUnusable(unpacked.Check, unpacked.Detail, logger, settings.BackupLimits);
            manifest = unpacked.Manifest;
        }
        else
        {
            if (!BackupArchive.HasSpace(workspace.Root, new FileInfo(entry.FullPath).Length)) ThrowIfUnusable(BackupCheck.NoSpace, "copy of the database", logger, settings.BackupLimits);
            File.Copy(entry.FullPath, workspace.IncomingDatabase);
        }

        var (check, detail) = await BackupService.CheckAsync(workspace.IncomingDatabase, KnownMigrations.All, ct);
        ThrowIfUnusable(check, detail, logger, settings.BackupLimits);
        if (manifest is not null && BackupService.SchemaVersionMismatch(manifest, workspace.IncomingDatabase) is { } mismatch)
        {
            ThrowIfUnusable(BackupCheck.InvalidArchive, mismatch, logger, settings.BackupLimits);
        }
        return isArchive;
    }

    /// <summary>Waits until at most <paramref name="allowed"/> requests are in flight; false on timeout.</summary>
    internal static async Task<bool> WaitForQuietAsync(MaintenanceGate gate, int allowed, TimeSpan timeout, TimeProvider time, CancellationToken ct)
    {
        var deadline = time.GetUtcNow() + timeout;
        while (gate.InFlight > allowed)
        {
            if (time.GetUtcNow() >= deadline) return false;
            await Task.Delay(TimeSpan.FromMilliseconds(50), time, ct);
        }
        return true;
    }

    /// <summary>Sessions end, the signing key changes, the restore is logged into the restored database, caches are dropped.</summary>
    private async Task FinishAsync(BackupEntry entry, BackupEntry safety, Guid? actorId, string? actorName, string? ip, CancellationToken ct)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var now = time.GetUtcNow().UtcDateTime;
        await db.Sessions.Where(s => s.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.RevokedAt, now).SetProperty(x => x.RevokedReason, "restore"), ct);
        signingKeys.Rotate();
        db.ActivityLog.Add(new ActivityEntry
        {
            At = now,
            ActorId = actorId,
            ActorName = actorName,
            Action = "backup.restored",
            Target = entry.File,
            Ip = ip,
            Details = System.Text.Json.JsonSerializer.Serialize(new { backup = entry.Id, kind = entry.Kind, safetyBackup = safety.File },
                System.Text.Json.JsonSerializerOptions.Web),
        });
        await db.SaveChangesAsync(ct);

        instanceSettings.Invalidate();
        backupSettings.Invalidate();
        backups.ForgetLastHash();
        if (settings.IsDesktop) DesktopOwner.Ensure(scope.ServiceProvider, logger);
        logger.LogWarning("Sicherung {File} wiederhergestellt (vorher gesichert als {Safety}). Alle Sitzungen wurden beendet.", entry.File, safety.File);
    }

    /// <summary>Online backup API from a file into the live database, then the migrations. Throws on any failure.</summary>
    private async Task WriteIntoLiveAsync(string source, CancellationToken ct)
    {
        RestoreWorkspace.CopyDatabase(source, settings.DatabaseFile);
        if (AfterCopyForTests is { } hook) await hook();
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync(ct);
        // The schema was checked before, but the append-only triggers are always recreated from the app's own text
        AppendOnlyTriggers.Ensure(settings.DatabaseFile);
    }

    /// <summary>Tests only: runs after the copy into the live database, before the migrations (to simulate a failure there).</summary>
    internal Func<Task>? AfterCopyForTests { get; set; }

    /// <summary>Tests only: runs after the file trees are swapped, before the database is touched.</summary>
    internal Func<Task>? AfterSwapForTests { get; set; }

    /// <summary>The API answer for an unusable backup file. Technical details (SQLite messages) go to the German log only.</summary>
    public static void ThrowIfUnusable(BackupCheck check, string? detail, ILogger logger, BackupLimits limits)
    {
        if (check != BackupCheck.Ok) logger.LogWarning("Sicherungsdatei abgelehnt ({Check}): {Detail}", check, detail);
        switch (check)
        {
            case BackupCheck.Ok:
                return;
            case BackupCheck.TooNew:
                throw new ApiException(StatusCodes.Status409Conflict, "backup.too_new",
                    "This backup comes from a newer version of the app and cannot be used by this one. Update the app first.",
                    new Dictionary<string, object?> { ["migrations"] = detail });
            case BackupCheck.NotSqlite:
                throw new ApiException(StatusCodes.Status400BadRequest, "backup.invalid", "The file is not a database backup.",
                    new Dictionary<string, object?> { ["reason"] = "not_sqlite" });
            case BackupCheck.SchemaMismatch:
                throw new ApiException(StatusCodes.Status400BadRequest, "backup.invalid",
                    "The database structure of this file differs from what this app creates (for example additional triggers), so it is not used.",
                    new Dictionary<string, object?> { ["reason"] = "schema_mismatch" });
            case BackupCheck.InvalidArchive:
                throw new ApiException(StatusCodes.Status400BadRequest, "backup.invalid", "The file is not an intact backup of this app.",
                    new Dictionary<string, object?> { ["reason"] = "invalid_archive" });
            case BackupCheck.TooLarge:
                throw new ApiException(StatusCodes.Status413PayloadTooLarge, "backup.too_large", "The backup is larger than the limit of this server.",
                    new Dictionary<string, object?> { ["maxFiles"] = limits.MaxFiles, ["maxMegabytes"] = limits.MaxBytes / (1024 * 1024) });
            case BackupCheck.NoSpace:
                throw new ApiException(StatusCodes.Status507InsufficientStorage, "backup.no_space", "There is not enough free disk space to unpack this backup. Nothing was changed.");
            case BackupCheck.NotAppDatabase:
                throw new ApiException(StatusCodes.Status400BadRequest, "backup.invalid", "The file is a database, but not a backup of this app.",
                    new Dictionary<string, object?> { ["reason"] = "not_app_database" });
            default:
                throw new ApiException(StatusCodes.Status400BadRequest, "backup.invalid", "The backup file is damaged.",
                    new Dictionary<string, object?> { ["reason"] = "damaged" });
        }
    }
}
