using System.Net;
using System.Text;
using Cv.Server.Updates;
using Velopack;
using Velopack.Exceptions;
using Velopack.Locators;
using Velopack.Logging;
using Velopack.Sources;

namespace Cv.Desktop.Hosting;

/// <summary>
/// Installs the update the server decided on. The server picks the release from the channel rules, this class only moves that one release: every GitHub
/// release carries its own package feed (<c>releases.&lt;channel&gt;.json</c>), so <see cref="TaggedReleaseSource"/> reads just that feed. Velopack's own
/// <see cref="GithubSource"/> looks at the 10 newest releases, which daily nightlies would fill, and only finds a channel's own feed; a nightly
/// user would then never see a full release. Downgrades stay off (<see cref="UpdateOptions.AllowVersionDowngrade"/> is false), so the running version
/// is only ever replaced by a newer one.
/// </summary>
internal sealed class VelopackInstaller(string repository, Action requestClose, IVelopackLocator? locator = null, IFileDownloader? downloader = null) : IUpdateInstaller
{
    private readonly Lazy<bool> _isInstalled = new(() => CheckInstalled(repository, locator, downloader));
    private UpdateManager? _manager;
    private VelopackAsset? _asset;

    public bool IsAvailable => _isInstalled.Value;

    private static bool CheckInstalled(string repository, IVelopackLocator? locator, IFileDownloader? downloader)
    {
        try
        {
            return new UpdateManager(new TaggedReleaseSource(repository, "none", downloader), new UpdateOptions(), locator).IsInstalled;
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            DesktopLog.Warn($"Die Installation konnte nicht erkannt werden: {ex.Message}");
            return false;
        }
    }

    public async Task PrepareAsync(UpdateTarget target, Action<int> progress, CancellationToken ct)
    {
        try
        {
            var manager = new UpdateManager(new TaggedReleaseSource(repository, target.Tag, downloader),
                new UpdateOptions { ExplicitChannel = target.PackageChannel, AllowVersionDowngrade = false }, locator);
            var update = await manager.CheckForUpdatesAsync().WaitAsync(ct)
                ?? throw new UpdateInstallException("updates.no_package", $"The package of {target.Tag} is not newer than the installed version.");
            if (update.IsDowngrade) throw new UpdateInstallException("updates.downgrade_refused", "Installing this package would be a downgrade, so it was refused.");

            await manager.DownloadUpdatesAsync(update, progress, ct);
            _manager = manager;
            _asset = update.TargetFullRelease;
        }
        catch (UpdateInstallException)
        {
            throw;
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw;
        }
        catch (ChecksumFailedException ex)
        {
            throw new UpdateInstallException("updates.checksum_failed", "The downloaded package did not match its checksum and was discarded.", ex);
        }
        catch (NotInstalledException ex)
        {
            throw new UpdateInstallException("updates.not_supported", "This copy of the program was not installed by the setup program and cannot update itself.", ex);
        }
        catch (AcquireLockFailedException ex)
        {
            throw new UpdateInstallException("updates.in_progress", "Another update of this program is already running.", ex);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            throw new UpdateInstallException("updates.no_package", $"The release {target.Tag} has no Windows package.", ex);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            throw new UpdateInstallException("updates.download_failed", $"The update could not be downloaded: {ex.Message}", ex);
        }
    }

    public void CloseAndApply()
    {
        if (_manager is null || _asset is null) throw new UpdateInstallException("updates.failed", "No update has been prepared.");
        requestClose();
    }

    /// <summary>
    /// Called by the window once the server has stopped: starts the installer, which waits for this process to end, replaces the program and starts it
    /// again. False when no update is prepared. Throws when the installer cannot be started; the program that is installed stays as it is.
    /// </summary>
    internal bool ApplyPrepared()
    {
        if (_manager is null || _asset is null) return false;
        _manager.WaitExitThenApplyUpdates(_asset, silent: false, restart: true, restartArgs: []);
        return true;
    }
}

/// <summary>
/// The package feed of exactly one GitHub release. Each release holds <c>releases.&lt;channel&gt;.json</c> and its packages side by side; the package
/// checksums in that feed are what Velopack verifies a download against.
/// </summary>
internal sealed class TaggedReleaseSource(string repository, string tag, IFileDownloader? downloader = null) : IUpdateSource
{
    private readonly IFileDownloader _downloader = downloader ?? new HttpClientFileDownloader();

    internal string BaseUrl => $"https://github.com/{repository}/releases/download/{Uri.EscapeDataString(tag)}/";

    public async Task<VelopackAssetFeed> GetReleaseFeed(IVelopackLogger logger, string? appId, string channel, Guid? stagingId = null, VelopackAsset? latestLocalRelease = null)
    {
        var bytes = await _downloader.DownloadBytes($"{BaseUrl}releases.{Uri.EscapeDataString(channel)}.json");
        return VelopackAssetFeed.FromJson(Encoding.UTF8.GetString(bytes).TrimStart('﻿'));
    }

    public Task DownloadReleaseEntry(IVelopackLogger logger, VelopackAsset releaseEntry, string localFile, Action<int> progress, CancellationToken cancelToken = default) =>
        _downloader.DownloadFile($"{BaseUrl}{Uri.EscapeDataString(releaseEntry.FileName)}", localFile, progress, cancelToken: cancelToken);
}
