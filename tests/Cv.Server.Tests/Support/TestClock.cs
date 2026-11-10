namespace Cv.Server.Tests.Support;

/// <summary>
/// The clock of a test server. It follows the system clock until a test freezes or moves it, so rules that depend on the time of day
/// (a TOTP code is valid for one 30-second step, challenges and tokens expire) can be tested at an exact moment instead of depending
/// on when the test happens to run. One instance per <see cref="ServerFixture"/>; the tests of a class run one after another, so a
/// frozen clock never leaks into another test as long as it is released (dispose the value returned by <see cref="Freeze"/>).
/// </summary>
public sealed class TestClock : TimeProvider
{
    // Ticks of the frozen moment; 0 means "not frozen, follow the system clock"
    private long _frozenTicks;

    public override DateTimeOffset GetUtcNow()
    {
        var frozen = Interlocked.Read(ref _frozenTicks);
        return frozen == 0 ? base.GetUtcNow() : new DateTimeOffset(frozen, TimeSpan.Zero);
    }

    /// <summary>Stops the clock at <paramref name="at"/> (default: now) until the returned value is disposed.</summary>
    public IDisposable Freeze(DateTimeOffset? at = null)
    {
        Interlocked.Exchange(ref _frozenTicks, (at ?? base.GetUtcNow()).UtcTicks);
        return new Release(this);
    }

    /// <summary>Moves a frozen clock forward.</summary>
    public void Advance(TimeSpan by)
    {
        if (Interlocked.Read(ref _frozenTicks) == 0) throw new InvalidOperationException("Only a frozen clock can be moved: call Freeze first.");
        Interlocked.Add(ref _frozenTicks, by.Ticks);
    }

    private sealed class Release(TestClock clock) : IDisposable
    {
        public void Dispose() => Interlocked.Exchange(ref clock._frozenTicks, 0);
    }
}
