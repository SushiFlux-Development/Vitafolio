using Cv.Server.Backups;
using Cv.Server.Tests.Support;
using Microsoft.Extensions.DependencyInjection;

namespace Cv.Server.Tests;

/// <summary>
/// The default rotation keeps exactly two backups. The order is what matters: the new one is complete and verified first, only then does the
/// oldest surplus one go - and a failed run touches nothing. Uses the low-limits server so a run can be made to fail on purpose.
/// </summary>
public sealed class BackupRotationTests(LowBackupLimitsFixture server) : IClassFixture<LowBackupLimitsFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private BackupService Backups => server.Factory.Services.GetRequiredService<BackupService>();

    private string[] RecentFiles() =>
        Directory.GetFiles(Path.Combine(server.DataDir, "backups", "recent"), "app-*").Select(Path.GetFileName).Order(StringComparer.Ordinal).ToArray()!;

    /// <summary>A change of the content, so the next backup is not skipped as "unchanged".</summary>
    private async Task ChangeAsync(TestClient admin, string name) => await server.UserAsync(admin, name);

    [Fact]
    public async Task Three_backups_in_a_row_leave_the_two_newest_and_a_failed_third_leaves_both_old_ones()
    {
        var admin = await server.AdminAsync();
        var first = await Backups.RunAsync(BackupKinds.Manual, force: false, Ct);
        await ChangeAsync(admin, "rotation1");
        var second = await Backups.RunAsync(BackupKinds.Manual, force: false, Ct);
        Assert.Equal(BackupOutcome.Created, first.Outcome);
        Assert.Equal(BackupOutcome.Created, second.Outcome);
        Assert.Equal(2, RecentFiles().Length);

        // Fails while the archive is being made: the data is over the file limit (5). Nothing may be pruned for it
        var before = RecentFiles();
        var folder = Path.Combine(server.DataDir, "attachments", "rotation");
        Directory.CreateDirectory(folder);
        try
        {
            for (var i = 0; i < 10; i++) await File.WriteAllBytesAsync(Path.Combine(folder, $"{i}.pdf"), [1], Ct);
            var failed = await Backups.RunAsync(BackupKinds.Manual, force: true, Ct);
            Assert.Equal(BackupOutcome.Failed, failed.Outcome);
            Assert.Equal(before, RecentFiles());
            Assert.Empty(Directory.GetFiles(Path.Combine(server.DataDir, "backups", "recent"), ".tmp-*"));
        }
        finally
        {
            Directory.Delete(folder, recursive: true);
        }

        // A third that works replaces the oldest of the two
        await ChangeAsync(admin, "rotation2");
        var third = await Backups.RunAsync(BackupKinds.Manual, force: false, Ct);
        Assert.Equal(BackupOutcome.Created, third.Outcome);
        var after = RecentFiles();
        Assert.Equal(2, after.Length);
        Assert.Contains(second.Entry!.File, after);
        Assert.Contains(third.Entry!.File, after);
        Assert.DoesNotContain(first.Entry!.File, after);
        Assert.Empty(Directory.GetFiles(Path.Combine(server.DataDir, "backups", "daily")));
    }

    [Fact]
    public void Retention_ignores_safety_backups_when_counting_and_deleting()
    {
        var now = new DateTime(2026, 11, 8, 12, 0, 0);
        string Recent(int hoursAgo, string kind) => $"/b/recent/app-{now.AddHours(-hoursAgo):yyyyMMdd-HHmmss}-{kind}.zip";
        var recent = new[] { Recent(0, "manual"), Recent(1, "pre-restore"), Recent(2, "manual"), Recent(3, "manual") };

        var deleted = BackupService.Retention.ToDelete(recent, [], now, keepRecent: 2, keepDailyDays: 0).ToList();

        Assert.Equal([recent[3]], deleted);
    }
}

/// <summary>Own server, so the exact file list is known.</summary>
public sealed class BackupSafetyRotationTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private BackupService Backups => server.Factory.Services.GetRequiredService<BackupService>();

    private string[] RecentFiles() =>
        Directory.GetFiles(Path.Combine(server.DataDir, "backups", "recent"), "app-*").Select(Path.GetFileName).Order(StringComparer.Ordinal).ToArray()!;

    private async Task ChangeAsync(TestClient admin, string name) => await server.UserAsync(admin, name);

    [Fact]
    public async Task The_safety_backup_is_outside_the_rotation_and_older_ones_go_after_a_successful_restore()
    {
        var admin = await server.AdminAsync();
        await ChangeAsync(admin, "safety1");
        var a = await Backups.RunAsync(BackupKinds.Manual, force: false, Ct);
        await ChangeAsync(admin, "safety2");
        var b = await Backups.RunAsync(BackupKinds.Manual, force: false, Ct);
        var safety1 = await Backups.RunAsync(BackupKinds.PreRestore, force: true, Ct);
        await ChangeAsync(admin, "safety3");
        var c = await Backups.RunAsync(BackupKinds.Manual, force: false, Ct);

        // The safety copy neither counted (a was still there until c arrived) nor was it pruned
        var files = RecentFiles();
        Assert.Contains(safety1.Entry!.File, files);
        Assert.Contains(b.Entry!.File, files);
        Assert.Contains(c.Entry!.File, files);
        Assert.DoesNotContain(a.Entry!.File, files);
        Assert.Equal(3, files.Length);

        // A restore that succeeded keeps only its own safety backup
        var safety2 = await Backups.RunAsync(BackupKinds.PreRestore, force: true, Ct);
        Backups.RemoveOlderSafetyBackups(safety2.Entry!);
        files = RecentFiles();
        Assert.DoesNotContain(safety1.Entry.File, files);
        Assert.Contains(safety2.Entry!.File, files);
        Assert.Contains(b.Entry.File, files);
        Assert.Contains(c.Entry.File, files);
    }
}
