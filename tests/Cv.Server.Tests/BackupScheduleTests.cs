using Cv.Server.Backups;
using Cv.Server.Errors;

namespace Cv.Server.Tests;

public sealed class BackupScheduleTests
{
    private static readonly TimeZoneInfo Utc = TimeZoneInfo.Utc;

    // 2026-11-04 is a Wednesday
    private static readonly DateTime Now = new(2026, 11, 4, 7, 30, 0, DateTimeKind.Utc);

    private static BackupSettings Interval(int hours) => new() { Schedule = new BackupScheduleSettings { Kind = "interval", IntervalHours = hours } };

    private static BackupSettings Times(string[] times, int[] weekdays) =>
        new() { Schedule = new BackupScheduleSettings { Kind = "times", Times = times, Weekdays = weekdays } };

    [Fact]
    public void Interval_runs_are_aligned_to_midnight()
    {
        var runs = BackupSchedule.NextRuns(Interval(6), Now, Utc, TimeSpan.FromDays(7));
        Assert.Equal(new DateTime(2026, 11, 4, 12, 0, 0, DateTimeKind.Utc), runs[0]);
        Assert.Equal(new DateTime(2026, 11, 4, 18, 0, 0, DateTimeKind.Utc), runs[1]);
        Assert.Equal(28, runs.Count);
        Assert.All(runs.Zip(runs.Skip(1)), pair => Assert.Equal(TimeSpan.FromHours(6), pair.Second - pair.First));
    }

    [Fact]
    public void Weekly_interval_runs_on_monday_midnight()
    {
        var next = BackupSchedule.Next(Interval(168).Schedule, Now, Utc);
        Assert.Equal(new DateTime(2026, 11, 9, 0, 0, 0, DateTimeKind.Utc), next);
        Assert.Equal(DayOfWeek.Monday, next!.Value.DayOfWeek);
    }

    [Fact]
    public void Fixed_times_on_chosen_weekdays()
    {
        var now = new DateTime(2026, 11, 4, 10, 0, 0, DateTimeKind.Utc);
        var runs = BackupSchedule.NextRuns(Times(["14:30", "02:00"], [1, 3]), now, Utc, TimeSpan.FromDays(7));
        Assert.Equal(
        [
            new DateTime(2026, 11, 4, 14, 30, 0, DateTimeKind.Utc),
            new DateTime(2026, 11, 9, 2, 0, 0, DateTimeKind.Utc),
            new DateTime(2026, 11, 9, 14, 30, 0, DateTimeKind.Utc),
            new DateTime(2026, 11, 11, 2, 0, 0, DateTimeKind.Utc),
        ], runs);
    }

    private static readonly BackupSettings MondayWednesdayFriday = Times(["03:30"], [1, 3, 5]);

    private static DateTime At(int month, int day, int hour, int minute) => new(2026, month, day, hour, minute, 0, DateTimeKind.Utc);

    // The week preview has one row per calendar day (today first, seven rows). The list the server reports ends with the seventh day,
    // so that every reported run has a row: 7 x 24 hours from now would reach into the eighth day.
    [Fact]
    public void The_week_window_ends_with_the_seventh_calendar_day_not_after_168_hours()
    {
        // Monday 2026-11-09 10:00: Monday 03:30 has passed, the Monday of the next week is the eighth day
        var runs = BackupSchedule.NextRunsInDays(MondayWednesdayFriday, At(11, 9, 10, 0), Utc, 7);

        Assert.Equal([At(11, 11, 3, 30), At(11, 13, 3, 30)], runs);
        // The old window of 168 hours from now did include it
        Assert.Contains(At(11, 16, 3, 30), BackupSchedule.NextRuns(MondayWednesdayFriday, At(11, 9, 10, 0), Utc, TimeSpan.FromDays(7)));
    }

    [Fact]
    public void The_week_window_includes_the_same_weekday_when_it_is_still_ahead_today()
    {
        // Monday 02:00: today's 03:30 is still ahead, the next Monday is the eighth day
        var runs = BackupSchedule.NextRunsInDays(MondayWednesdayFriday, At(11, 9, 2, 0), Utc, 7);

        Assert.Equal([At(11, 9, 3, 30), At(11, 11, 3, 30), At(11, 13, 3, 30)], runs);
    }

    [Fact]
    public void The_week_window_is_cut_at_midnight_just_before_and_just_after_it()
    {
        // Sunday 23:50: the seven days are Sunday to Saturday, so Monday, Wednesday and Friday of this coming week all count
        var sunday = BackupSchedule.NextRunsInDays(MondayWednesdayFriday, At(11, 8, 23, 50), Utc, 7);
        Assert.Equal([At(11, 9, 3, 30), At(11, 11, 3, 30), At(11, 13, 3, 30)], sunday);

        // Monday 23:50: the window runs to the end of the next Sunday, the Monday after it is outside
        var monday = BackupSchedule.NextRunsInDays(MondayWednesdayFriday, At(11, 9, 23, 50), Utc, 7);
        Assert.Equal([At(11, 11, 3, 30), At(11, 13, 3, 30)], monday);

        // A run at 23:59 of the seventh day counts, one at 00:00 of the eighth does not
        var late = Times(["23:59", "00:00"], [1, 2, 3, 4, 5, 6, 7]);
        var runs = BackupSchedule.NextRunsInDays(late, At(11, 9, 23, 50), Utc, 7);
        Assert.Equal(At(11, 15, 23, 59), runs[^1]);
        Assert.DoesNotContain(At(11, 16, 0, 0), runs);
        Assert.Equal(At(11, 16, 0, 0), BackupSchedule.EndOfDay(At(11, 9, 23, 50), Utc, 7));
    }

    [Fact]
    public void The_week_window_starts_the_day_at_midnight_of_the_zone_not_of_utc()
    {
        // UTC+1: 23:30 UTC on Monday is already 00:30 on Tuesday, so the seven days are Tuesday to Monday and end at Tuesday 00:00 local
        var plusOne = TimeZoneInfo.CreateCustomTimeZone("Test+1", TimeSpan.FromHours(1), "Test+1", "Test+1");
        var now = At(11, 9, 23, 30);
        var daily = Times(["23:45"], [1, 2, 3, 4, 5, 6, 7]);

        var runs = BackupSchedule.NextRunsInDays(daily, now, plusOne, 7);

        Assert.Equal(7, runs.Count);
        Assert.Equal(At(11, 10, 22, 45), runs[0]);
        Assert.Equal(At(11, 16, 22, 45), runs[^1]);
        Assert.Equal(At(11, 16, 23, 0), BackupSchedule.EndOfDay(now, plusOne, 7));
    }

    [Fact]
    public void The_week_window_follows_the_calendar_across_a_daylight_saving_change()
    {
        // Berlin ends daylight saving on Sunday 2026-10-25 (a 25-hour day): the window still ends at local midnight, which is 23:00 UTC then
        var berlin = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");
        var now = At(10, 24, 12, 0);

        Assert.Equal(At(10, 30, 23, 0), BackupSchedule.EndOfDay(now, berlin, 7));
    }

    [Fact]
    public void The_zone_is_reported_under_a_name_the_browser_knows()
    {
        Assert.Equal("Europe/Berlin", BackupSchedule.BrowserZoneId(TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin")));
        Assert.Equal("UTC", BackupSchedule.BrowserZoneId(TimeZoneInfo.Utc));
        // The Windows name of the same zone (what a Windows server has as its local zone) becomes the IANA name
        Assert.Equal("Europe/Berlin", BackupSchedule.BrowserZoneId(TimeZoneInfo.FindSystemTimeZoneById("W. Europe Standard Time")));
    }

    [Fact]
    public void Fixed_times_are_local_times_of_the_zone()
    {
        var plusOne = TimeZoneInfo.CreateCustomTimeZone("Test+1", TimeSpan.FromHours(1), "Test+1", "Test+1");
        var next = BackupSchedule.Next(Times(["02:00"], [1, 2, 3, 4, 5, 6, 7]).Schedule, Now, plusOne);
        Assert.Equal(new DateTime(2026, 11, 5, 1, 0, 0, DateTimeKind.Utc), next);
    }

    [Fact]
    public void Missed_runs_are_caught_up_only_when_wanted()
    {
        var at = new DateTime(2026, 11, 4, 13, 0, 0, DateTimeKind.Utc);
        var settings = Interval(6);
        var lastBeforeDowntime = new DateTime(2026, 11, 4, 6, 0, 0, DateTimeKind.Utc);
        Assert.Equal(new DateTime(2026, 11, 4, 12, 0, 0, DateTimeKind.Utc), BackupSchedule.MissedRun(settings, lastBeforeDowntime, at, Utc));
        Assert.Null(BackupSchedule.MissedRun(settings, new DateTime(2026, 11, 4, 12, 0, 0, DateTimeKind.Utc), at, Utc));
        Assert.Null(BackupSchedule.MissedRun(settings, null, at, Utc));
        Assert.Null(BackupSchedule.MissedRun(settings with { CatchUpMissed = false }, lastBeforeDowntime, at, Utc));
        Assert.Null(BackupSchedule.MissedRun(settings with { AutomaticEnabled = false }, lastBeforeDowntime, at, Utc));

        // Fixed times: Monday 02:00 was missed when the server was off from Sunday to Wednesday
        var weekly = Times(["02:00"], [1]);
        Assert.Equal(new DateTime(2026, 11, 2, 2, 0, 0, DateTimeKind.Utc),
            BackupSchedule.MissedRun(weekly, new DateTime(2026, 11, 1, 20, 0, 0, DateTimeKind.Utc), at, Utc));
    }

    [Fact]
    public void Master_switch_and_kind_off_plan_nothing()
    {
        Assert.Empty(BackupSchedule.NextRuns(Interval(6) with { AutomaticEnabled = false }, Now, Utc, TimeSpan.FromDays(7)));
        Assert.Empty(BackupSchedule.NextRuns(new BackupSettings { Schedule = new BackupScheduleSettings { Kind = "off" } }, Now, Utc, TimeSpan.FromDays(7)));
    }

    [Fact]
    public void Validation_reports_every_wrong_field()
    {
        var bad = new BackupSettings
        {
            KeepRecent = 1,
            KeepDailyDays = -1,
            Schedule = new BackupScheduleSettings { Kind = "times", IntervalHours = 0, Times = ["25:00", "2:00"], Weekdays = [0] },
        };
        var ex = Assert.Throws<ApiException>(() => BackupSettings.Validate(bad));
        Assert.Equal("validation.failed", ex.Code);
        Assert.Equal(
            ["keepRecent", "keepDailyDays", "schedule.intervalHours", "schedule.times[0]", "schedule.times[1]", "schedule.weekdays"],
            ex.Errors!.Keys);
        BackupSettings.Validate(new BackupSettings());
    }
}
