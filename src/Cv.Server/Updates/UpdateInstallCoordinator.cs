using Cv.Server.Backups;
using Cv.Server.Configuration;
using Cv.Server.Errors;

namespace Cv.Server.Updates;

/// <summary>Everything the host has to do to install a Windows update; the server does not know how an installer works.</summary>
public interface IUpdateInstaller
{
    /// <summary>Whether this copy can replace itself at all: not in a development run, not in a copy the setup program did not install.</summary>
    bool IsAvailable { get; }

    /// <summary>Downloads and verifies the package of the release (<see cref="UpdateInstallException"/> on failure). Nothing on disk or in the running program changes.</summary>
    Task PrepareAsync(UpdateTarget target, Action<int> progress, CancellationToken ct);

    /// <summary>Asks the host to close (the server stops gracefully) and to run the prepared update afterwards. Does not wait for that.</summary>
    void CloseAndApply();
}

/// <summary><see cref="Tag"/> is the GitHub tag of the release, <see cref="PackageChannel"/> the Velopack channel it was packed into.</summary>
public sealed record UpdateTarget(string Tag, string PackageChannel);

/// <summary>A failed step of the update, with a stable code for the UI and the full technical text.</summary>
public sealed class UpdateInstallException(string code, string message, Exception? inner = null) : Exception(message, inner)
{
    public string Code { get; } = code;
}

/// <summary>Used by hosts that cannot update themselves (Docker, development).</summary>
public sealed class NoUpdateInstaller : IUpdateInstaller
{
    public bool IsAvailable => false;

    public Task PrepareAsync(UpdateTarget target, Action<int> progress, CancellationToken ct) =>
        throw new UpdateInstallException("updates.not_supported", "This program cannot install updates itself.");

    public void CloseAndApply() => throw new UpdateInstallException("updates.not_supported", "This program cannot install updates itself.");
}

/// <summary>
/// The one-click update of the Windows program: download and verify, then a database backup of its own (<see cref="BackupKinds.PreUpdate"/>),
/// and only when both worked the program closes and the installer takes over. A failure stops the run where it is: the installed
/// version and the data stay untouched and the complete error text stays available to the UI. The download happens in the background
/// (it can take minutes); the UI follows it through the status.
/// </summary>
public sealed class UpdateInstallCoordinator(
    IUpdateInstaller installer,
    UpdateService updates,
    BackupService backups,
    MaintenanceGate maintenance,
    ServerSettings settings,
    IHostApplicationLifetime lifetime,
    ILogger<UpdateInstallCoordinator> logger)
{
    private readonly Lock _lock = new();
    private UpdateInstallDto _state = UpdateInstallDto.Idle;
    private Task? _run;

    public bool CanInstall => settings.IsDesktop && !updates.IsDevelopmentBuild && installer.IsAvailable;

    public UpdateInstallDto State
    {
        get
        {
            lock (_lock) return _state;
        }
    }

    /// <summary>The status endpoints add the install state to what the update service knows.</summary>
    public UpdateStatusDto Decorate(UpdateStatusDto status) => status with { CanInstall = CanInstall, Install = State };

    /// <summary>The running work of a started install; tests wait for it.</summary>
    internal Task Completion
    {
        get
        {
            lock (_lock) return _run ?? Task.CompletedTask;
        }
    }

    /// <summary>
    /// Starts the update of the available version. Everything that can be checked at once is refused here with a clear answer, before anything happens:
    /// not this kind of program, another run in progress, a backup or restore running, nothing to install.
    /// </summary>
    public async Task StartAsync(CancellationToken ct)
    {
        if (!settings.IsDesktop) throw Conflict("updates.not_supported", "Only the Windows program installs updates itself.");
        if (updates.IsDevelopmentBuild) throw Conflict("updates.dev_build", "A development build does not install updates.");
        if (!installer.IsAvailable) throw Conflict("updates.not_supported", "This copy of the program was not installed by the setup program and cannot update itself.");

        var status = await updates.GetStatusAsync(forceManualCheck: false, ct);
        if (status.Available is not { } release || ReleaseVersion.Parse(release.Tag) is not { } version)
        {
            throw Conflict("updates.none", "There is no update to install.");
        }
        var target = new UpdateTarget(release.Tag, UpdateChannels.PackageChannel(version));

        lock (_lock)
        {
            if (_state.State is not (UpdateInstallState.Idle or UpdateInstallState.Failed)) throw Conflict("updates.in_progress", "An update is already running.");
            ThrowIfBusy();
            _state = new UpdateInstallDto(UpdateInstallState.Downloading, 0, release.Tag, release.Display, null, null, null, null);
            _run = Task.Run(() => RunAsync(target, release, lifetime.ApplicationStopping), CancellationToken.None);
        }
    }

    /// <summary>A running backup or restore must not be cut off by the closing program; the caller says so instead of closing.</summary>
    private void ThrowIfBusy()
    {
        if (maintenance.Active) throw Conflict("updates.busy", "A backup is being restored right now. Install the update afterwards.", "restore");
        if (backups.Gate.CurrentCount == 0) throw Conflict("updates.busy", "A backup is running right now. Install the update afterwards.", "backup");
    }

    private async Task RunAsync(UpdateTarget target, UpdateReleaseDto release, CancellationToken ct)
    {
        string? backupFile = null;
        try
        {
            await installer.PrepareAsync(target, progress => Report(p => p with { Progress = Math.Clamp(progress, 0, 100) }), ct);

            Report(p => p with { State = UpdateInstallState.BackingUp, Progress = null });
            if (maintenance.Active) throw new UpdateInstallException("updates.busy", "A backup is being restored right now. Install the update afterwards.");

            var result = await backups.RunAsync(BackupKinds.PreUpdate, force: true, ct);
            if (result.Outcome != BackupOutcome.Created || result.Entry is null)
            {
                throw new UpdateInstallException("updates.backup_failed", "The backup before the update failed: " + (result.Problem ?? result.Outcome.ToString()));
            }
            backupFile = result.Entry.File;
            await backups.KeepOnlyPreUpdateAsync(result.Entry);

            if (maintenance.Active) throw new UpdateInstallException("updates.busy", "A backup is being restored right now. Install the update afterwards.");
            Report(p => p with { State = UpdateInstallState.Restarting, BackupFile = backupFile });
            logger.LogInformation("Update auf {Tag}: Paket geprüft, Sicherung {File} angelegt, das Programm wird beendet und installiert.", release.Tag, backupFile);
            installer.CloseAndApply();
        }
        catch (UpdateInstallException ex)
        {
            Fail(ex.Code, ex.Message, ex.ToString(), backupFile);
        }
        catch (OperationCanceledException)
        {
            // The program closes during the download: nothing was changed and nothing needs saying
            logger.LogInformation("Update auf {Tag} abgebrochen, weil das Programm beendet wird.", release.Tag);
            Report(_ => UpdateInstallDto.Idle);
        }
        catch (Exception ex)
        {
            Fail("updates.failed", ex.Message, ex.ToString(), backupFile);
        }
    }

    private void Fail(string code, string message, string details, string? backupFile)
    {
        logger.LogError("Update fehlgeschlagen ({Code}): {Details}", code, details);
        Report(p => p with { State = UpdateInstallState.Failed, Progress = null, ErrorCode = code, Error = message, ErrorDetails = details, BackupFile = backupFile });
    }

    private void Report(Func<UpdateInstallDto, UpdateInstallDto> change)
    {
        lock (_lock) _state = change(_state);
    }

    private static ApiException Conflict(string code, string detail, string? reason = null) =>
        new(StatusCodes.Status409Conflict, code, detail, reason is null ? null : new Dictionary<string, object?> { ["reason"] = reason });
}
