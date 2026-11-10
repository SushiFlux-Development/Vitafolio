using Cv.Server.Auth;
using Cv.Server.Data;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Logging.Abstractions;

namespace Cv.Server.Tests;

/// <summary>
/// The one-time rule of authenticator codes across a 30-second boundary, with a clock the test moves itself (the end-to-end test of
/// the login cannot control the server's clock and must not depend on which side of a boundary it happens to run).
/// </summary>
public sealed class TwoFactorReplayTests : IDisposable
{
    private readonly string _file = Path.Combine(Path.GetTempPath(), $"cv-2fa-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var path in new[] { _file, _file + "-wal", _file + "-shm" }) File.Delete(path);
    }

    [Fact]
    public async Task A_code_used_in_one_step_stays_used_in_the_next_step_and_the_next_step_works_once()
    {
        var ct = TestContext.Current.CancellationToken;
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(SqliteDatabase.ConnectionString(_file, pooling: false)).Options;
        await using var db = new AppDbContext(options);
        db.GetService<IMigrator>().Migrate();

        // 12:00:10 is early in a step; the clock then moves into the following step (12:00:40 is in the step that starts at 12:00:30)
        var clock = new TestDoubles.FixedTime(new DateTimeOffset(2026, 11, 8, 12, 0, 10, TimeSpan.Zero));
        var service = new TwoFactorService(db, new EphemeralDataProtectionProvider(), clock, NullLogger<TwoFactorService>.Instance);
        var user = new User { Id = Guid.NewGuid(), Username = "replay", NormalizedUsername = "REPLAY", DisplayName = "Replay", PasswordHash = "x" };
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);

        var (base32, _) = service.BeginSetup(user);
        var secret = Base32.Decode(base32);
        var enabling = Totp.Step(clock.Now);
        Assert.NotNull(await service.ConfirmSetupAsync(user, Totp.Compute(secret, enabling), ct));

        // Same step again: refused as used
        Assert.Equal(SecondFactor.AlreadyUsed, await service.VerifyAsync(user, Totp.Compute(secret, enabling), ct));

        // The clock crosses into the next step: the code of the enabling step is STILL used (it is inside the accepted window), the new one works once
        clock.Now = clock.Now.AddSeconds(30);
        Assert.Equal(enabling + 1, Totp.Step(clock.Now));
        Assert.Equal(SecondFactor.AlreadyUsed, await service.VerifyAsync(user, Totp.Compute(secret, enabling), ct));
        Assert.Equal(SecondFactor.Totp, await service.VerifyAsync(user, Totp.Compute(secret, enabling + 1), ct));
        Assert.Equal(SecondFactor.AlreadyUsed, await service.VerifyAsync(user, Totp.Compute(secret, enabling + 1), ct));
    }
}
