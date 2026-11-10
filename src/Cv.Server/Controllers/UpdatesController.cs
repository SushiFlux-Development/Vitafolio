using Cv.Server.Auth;
using Cv.Server.Data;
using Cv.Server.Errors;
using Cv.Server.Services;
using Cv.Server.Updates;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Cv.Server.Controllers;

public sealed record UpdateChannelRequest(string? Channel);

[ApiController]
public sealed class UpdatesController(
    UpdateService updateService,
    UpdateInstallCoordinator install,
    SettingsService instanceSettings,
    AppDbContext db,
    ActivityLogger activity) : ControllerBase
{
    /// <summary>Signed-in users only (a version number tells an attacker which known holes apply); the failure text is for administrators.</summary>
    [HttpGet("/api/updates/status")]
    [Authorize]
    public async Task<ActionResult<UpdateStatusDto>> GetStatus(CancellationToken ct)
    {
        var status = install.Decorate(await updateService.GetStatusAsync(forceManualCheck: false, ct));
        return Ok(User.IsInRole(Roles.Admin) ? status : status with { Error = null });
    }

    [HttpPost("/api/admin/updates/check")]
    [Authorize(Policy = AuthConstants.AdminPolicy)]
    public async Task<ActionResult<UpdateStatusDto>> CheckForUpdates(CancellationToken ct)
    {
        var status = await updateService.GetStatusAsync(forceManualCheck: true, ct);
        return Ok(install.Decorate(status));
    }

    /// <summary>Administrators choose the channel; the Windows program's one user is the administrator of their own copy.</summary>
    [HttpPut("/api/admin/updates/channel")]
    [Authorize(Policy = AuthConstants.AdminPolicy)]
    public async Task<ActionResult<UpdateStatusDto>> SetChannel([FromBody] UpdateChannelRequest body, CancellationToken ct)
    {
        var errors = new FieldErrors();
        if (string.IsNullOrEmpty(body.Channel)) errors.Add("channel", "validation.required");
        else if (!UpdateChannels.IsValid(body.Channel)) errors.Add("channel", "validation.one_of", new() { ["allowed"] = UpdateChannels.All });
        errors.ThrowIfAny();

        var before = (await instanceSettings.GetAsync(ct)).UpdateChannel;
        if (before != body.Channel)
        {
            activity.Record(HttpContext, "updates.channel_changed", body.Channel, new { before, after = body.Channel });
        }
        await instanceSettings.SaveUpdateChannelAsync(db, body.Channel!, ct);
        return Ok(install.Decorate(await updateService.GetStatusAsync(forceManualCheck: false, ct)));
    }

    /// <summary>The one-click install. The UI follows the run through <c>install</c> in the status; it asks about unsaved work before calling this.</summary>
    [HttpPost("/api/admin/updates/install")]
    [Authorize(Policy = AuthConstants.AdminPolicy)]
    public async Task<ActionResult<UpdateStatusDto>> Install(CancellationToken ct)
    {
        await install.StartAsync(ct);
        return Accepted(install.Decorate(await updateService.GetStatusAsync(forceManualCheck: false, ct)));
    }
}
