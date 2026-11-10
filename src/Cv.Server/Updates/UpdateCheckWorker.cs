using Cv.Server.Configuration;
using Cv.Server.Data;
using Cv.Server.Services;

namespace Cv.Server.Updates;

/// <summary>
/// Runs once at every start of the program. A beta or nightly build saves its own channel when nothing is saved yet: a full release later arrives
/// under the same image tag (the channel stays) instead of silently dropping the person out of the channel. Then it checks for updates once;
/// everything after that is the button and the cache of <see cref="UpdateService"/>. A development build does neither.
/// </summary>
public sealed class UpdateCheckWorker(
    UpdateService updates,
    SettingsService instanceSettings,
    AppVersion appVersion,
    IServiceScopeFactory scopes,
    ILogger<UpdateCheckWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (updates.IsDevelopmentBuild) return;
        try
        {
            if ((await instanceSettings.GetAsync(stoppingToken)).UpdateChannel is null
                && UpdateChannels.FromBuild(appVersion.Current.Channel) is var channel and not UpdateChannels.None)
            {
                using var scope = scopes.CreateScope();
                await instanceSettings.SaveUpdateChannelAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>(), channel, stoppingToken);
            }

            // The first status after the start fetches: the cache starts empty
            await updates.GetStatusAsync(forceManualCheck: false, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Closed while checking
        }
        catch (Exception ex)
        {
            // A failed check must never stop the server; GetStatusAsync already records GitHub errors for the UI
            logger.LogWarning(ex, "Update-Prüfung beim Start nicht möglich.");
        }
    }
}
