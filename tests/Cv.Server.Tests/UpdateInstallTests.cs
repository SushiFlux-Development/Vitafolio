using System.Net;
using System.Text.Json;
using Cv.Server.Backups;
using Cv.Server.Configuration;
using Cv.Server.Errors;
using Cv.Server.Tests.Support;
using Cv.Server.Updates;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;

namespace Cv.Server.Tests;

/// <summary>The one-click update of the Windows program: what happens in which order, and what stops it. The real backup service runs on the fixture's database.</summary>
public sealed class UpdateInstallTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private BackupService Backups => server.Factory.Services.GetRequiredService<BackupService>();

    private MaintenanceGate Maintenance => server.Factory.Services.GetRequiredService<MaintenanceGate>();

    private sealed class FakeInstaller(bool available = true, Exception? prepareFailure = null) : IUpdateInstaller
    {
        public bool IsAvailable => available;

        public List<string> Steps { get; } = [];

        public UpdateTarget? Target { get; private set; }

        public TaskCompletionSource? HoldPrepare { get; init; }

        public async Task PrepareAsync(UpdateTarget target, Action<int> progress, CancellationToken ct)
        {
            Steps.Add("prepare");
            Target = target;
            progress(40);
            if (HoldPrepare is not null) await HoldPrepare.Task.WaitAsync(ct);
            if (prepareFailure is not null) throw prepareFailure;
        }

        public void CloseAndApply() => Steps.Add("close");
    }

    private sealed class Lifetime : IHostApplicationLifetime
    {
        public CancellationToken ApplicationStarted => CancellationToken.None;

        public CancellationToken ApplicationStopping => CancellationToken.None;

        public CancellationToken ApplicationStopped => CancellationToken.None;

        public void StopApplication()
        {
        }
    }

    private static string Releases(params string[] tags) => "[" + string.Join(",", tags.Select(tag =>
        JsonSerializer.Serialize(new { tag_name = tag, draft = false, assets = new[] { new { name = UpdateChannels.PackageFeedName(ReleaseVersion.Parse(tag)!.Value) } } }))) + "]";

    private static UpdateService Updates(HostMode mode, string channel, string json)
    {
        var file = Path.Combine(Path.GetTempPath(), "cv-install-" + Guid.NewGuid().ToString("N") + ".txt");
        File.WriteAllText(file, "v2026.11.10\nv2026.11.10.3.50\n");
        var settings = new ServerSettings { Mode = mode, DataDirectory = Path.GetTempPath(), BackupDirectory = Path.GetTempPath(), Channel = channel, VersionFilePath = file };
        var handler = new TestDoubles.StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json) });
        return new UpdateService(new TestDoubles.StubFactory(handler), new AppVersion(settings), settings, new TestDoubles.NoChannelSaved(), TimeProvider.System, NullLogger<UpdateService>.Instance);
    }

    private UpdateInstallCoordinator Coordinator(IUpdateInstaller installer, UpdateService updates, BackupService? backups = null, HostMode mode = HostMode.Desktop) =>
        new(installer, updates, backups ?? Backups, Maintenance, TestDoubles.Settings(mode), new Lifetime(), NullLogger<UpdateInstallCoordinator>.Instance);

    private static string[] PreUpdateFiles(BackupService backups) =>
        Directory.GetFiles(backups.Dir(BackupService.TierRecent), "app-*-pre-update.*");

    private static async Task<string?> RefusedAsync(UpdateInstallCoordinator coordinator)
    {
        var error = await Assert.ThrowsAsync<ApiException>(() => coordinator.StartAsync(Ct));
        Assert.Equal(409, error.Status);
        return error.Code;
    }

    [Fact]
    public async Task One_click_downloads_verifies_makes_a_backup_and_only_then_closes()
    {
        var installer = new FakeInstaller();
        var coordinator = Coordinator(installer, Updates(HostMode.Desktop, "release", Releases("v2026.11.12")));

        await coordinator.StartAsync(Ct);
        await coordinator.Completion.WaitAsync(Ct);

        Assert.Equal(["prepare", "close"], installer.Steps);
        Assert.Equal("v2026.11.12", installer.Target!.Tag);
        Assert.Equal("win", installer.Target.PackageChannel);
        Assert.Equal(UpdateInstallState.Restarting, coordinator.State.State);
        Assert.NotNull(coordinator.State.BackupFile);
        Assert.True(File.Exists(Path.Combine(Backups.Dir(BackupService.TierRecent), coordinator.State.BackupFile!)));
    }

    [Fact]
    public async Task A_failed_download_leaves_everything_alone_and_keeps_the_complete_message()
    {
        var installer = new FakeInstaller(prepareFailure: new UpdateInstallException("updates.download_failed", "Nothing arrived.", new IOException("the wire broke")));
        var coordinator = Coordinator(installer, Updates(HostMode.Desktop, "release", Releases("v2026.11.12")));

        await coordinator.StartAsync(Ct);
        await coordinator.Completion.WaitAsync(Ct);

        Assert.DoesNotContain("close", installer.Steps);
        Assert.Equal(UpdateInstallState.Failed, coordinator.State.State);
        Assert.Equal("updates.download_failed", coordinator.State.ErrorCode);
        Assert.Equal("Nothing arrived.", coordinator.State.Error);
        Assert.Contains("the wire broke", coordinator.State.ErrorDetails, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Without_a_backup_the_program_does_not_close()
    {
        var installer = new FakeInstaller();
        // A backup service whose database file does not exist fails its run
        var noDatabase = TestDoubles.Settings(HostMode.Desktop, dataDir: Path.Combine(Path.GetTempPath(), "cv-no-db-" + Guid.NewGuid().ToString("N")));
        var failing = new BackupService(noDatabase, server.Factory.Services.GetRequiredService<BackupSettingsStore>(), server.Factory.Services.GetRequiredService<Storage.DataFiles>(),
            new AppVersion(noDatabase), NullLogger<BackupService>.Instance, TimeProvider.System);
        var coordinator = Coordinator(installer, Updates(HostMode.Desktop, "release", Releases("v2026.11.12")), failing);

        await coordinator.StartAsync(Ct);
        await coordinator.Completion.WaitAsync(Ct);

        Assert.DoesNotContain("close", installer.Steps);
        Assert.Equal(UpdateInstallState.Failed, coordinator.State.State);
        Assert.Equal("updates.backup_failed", coordinator.State.ErrorCode);
    }

    [Fact]
    public async Task A_running_backup_blocks_the_update_with_a_clear_answer()
    {
        var installer = new FakeInstaller();
        var coordinator = Coordinator(installer, Updates(HostMode.Desktop, "release", Releases("v2026.11.12")));
        await Backups.Gate.WaitAsync(Ct);
        try
        {
            var error = await Assert.ThrowsAsync<ApiException>(() => coordinator.StartAsync(Ct));
            Assert.Equal("updates.busy", error.Code);
            Assert.Equal("backup", error.Parameters!["reason"]);
        }
        finally
        {
            Backups.Gate.Release();
        }
        Assert.Empty(installer.Steps);
        Assert.Equal(UpdateInstallState.Idle, coordinator.State.State);
    }

    [Fact]
    public async Task A_running_restore_blocks_the_update_with_a_clear_answer()
    {
        var installer = new FakeInstaller();
        var coordinator = Coordinator(installer, Updates(HostMode.Desktop, "release", Releases("v2026.11.12")));
        Maintenance.Close();
        try
        {
            var error = await Assert.ThrowsAsync<ApiException>(() => coordinator.StartAsync(Ct));
            Assert.Equal("updates.busy", error.Code);
            Assert.Equal("restore", error.Parameters!["reason"]);
        }
        finally
        {
            Maintenance.Open();
        }
        Assert.Empty(installer.Steps);
    }

    [Fact]
    public async Task A_second_start_is_refused_while_one_is_running()
    {
        var hold = new TaskCompletionSource();
        var installer = new FakeInstaller { HoldPrepare = hold };
        var coordinator = Coordinator(installer, Updates(HostMode.Desktop, "release", Releases("v2026.11.12")));

        await coordinator.StartAsync(Ct);
        Assert.Equal("updates.in_progress", await RefusedAsync(coordinator));
        hold.SetResult();
        await coordinator.Completion.WaitAsync(Ct);
    }

    [Fact]
    public async Task Nothing_to_install_is_refused()
    {
        var coordinator = Coordinator(new FakeInstaller(), Updates(HostMode.Desktop, "release", Releases("v2026.11.1")));
        Assert.Equal("updates.none", await RefusedAsync(coordinator));
    }

    [Fact]
    public async Task A_development_run_never_installs()
    {
        var installer = new FakeInstaller();
        var coordinator = Coordinator(installer, Updates(HostMode.Desktop, "dev", Releases("v2030.1.1")));
        Assert.False(coordinator.CanInstall);
        Assert.Equal("updates.dev_build", await RefusedAsync(coordinator));
        Assert.Empty(installer.Steps);
    }

    [Fact]
    public async Task The_docker_version_does_not_install_itself()
    {
        var coordinator = Coordinator(new FakeInstaller(), Updates(HostMode.Server, "release", Releases("v2026.11.12")), mode: HostMode.Server);
        Assert.False(coordinator.CanInstall);
        Assert.Equal("updates.not_supported", await RefusedAsync(coordinator));
    }

    [Fact]
    public async Task A_copy_that_was_not_installed_cannot_update()
    {
        var coordinator = Coordinator(new FakeInstaller(available: false), Updates(HostMode.Desktop, "release", Releases("v2026.11.12")));
        Assert.False(coordinator.CanInstall);
        Assert.Equal("updates.not_supported", await RefusedAsync(coordinator));
    }

    [Fact]
    public async Task A_new_backup_before_an_update_replaces_the_previous_one_and_stays_outside_the_rotation()
    {
        var backups = Backups;
        var first = await backups.RunAsync(BackupKinds.PreUpdate, force: true, Ct);
        await backups.KeepOnlyPreUpdateAsync(first.Entry!);
        var second = await backups.RunAsync(BackupKinds.PreUpdate, force: true, Ct);
        await backups.KeepOnlyPreUpdateAsync(second.Entry!);

        var files = PreUpdateFiles(backups);
        Assert.Single(files);
        Assert.Equal(second.Entry!.File, Path.GetFileName(files[0]));

        // Ordinary rotation: a run with a keep count of 2 must not count or prune the safety copy
        var names = new[] { $"app-20261101-100000-manual{BackupService.ArchiveExtension}", $"app-20261102-100000-manual{BackupService.ArchiveExtension}", $"app-20261103-100000-manual{BackupService.ArchiveExtension}", $"app-20261103-110000-pre-update{BackupService.ArchiveExtension}" };
        var delete = BackupService.Retention.ToDelete(names, [], new DateTime(2026, 11, 8), 2, 0).ToArray();
        Assert.Equal([names[0]], delete);
    }
}
