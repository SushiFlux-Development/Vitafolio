using Cv.Server.Auth;
using Cv.Server.Configuration;
using Cv.Server.Data;
using Cv.Server.Errors;
using Cv.Server.Updates;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Cv.Server.Controllers;

/// <summary>"What's new", the manual and the facts about the program (licence, source code).</summary>
[ApiController]
public sealed class AboutController(WhatsNewReader whatsNew, AppDbContext db, ServerSettings settings) : ControllerBase
{
    /// <summary>
    /// What the window after an update shows: the entry of the running version in the given language, once per person. First contact with this
    /// version number (a first installation, an account that was just created) sets the mark and shows nothing, because there is no earlier
    /// version to compare with. That is why this GET writes.
    /// </summary>
    [HttpGet("/api/whats-new")]
    [Authorize]
    public async Task<ActionResult<WhatsNewDto>> Pending([FromQuery] string? lang, CancellationToken ct)
    {
        var language = Language(lang);
        var nothing = new WhatsNewDto(false, null, null, language, null, []);
        if (whatsNew.IsDevelopmentBuild) return nothing;

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == User.RequiredUserId(), ct);
        if (user is null) return nothing;

        var currentTag = whatsNew.CurrentTag;
        if (user.WhatsNewSeenVersion is null)
        {
            user.WhatsNewSeenVersion = currentTag;
            await db.SaveChangesAsync(ct);
            return nothing;
        }

        // Only a newer version: a restored backup or an older image must not bring back old notes
        if (ReleaseVersion.Parse(user.WhatsNewSeenVersion) is not { } seen || ReleaseVersion.Parse(currentTag) is not { } current || current <= seen) return nothing;

        return whatsNew.Read(language, show: true) ?? nothing;
    }

    /// <summary>Marks the notes of the running version as seen by this person, so they are not shown again.</summary>
    [HttpPost("/api/whats-new/seen")]
    [Authorize]
    public async Task<IActionResult> MarkSeen(CancellationToken ct)
    {
        if (whatsNew.IsDevelopmentBuild) return NoContent();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == User.RequiredUserId(), ct);
        if (user is null) return NoContent();
        var currentTag = whatsNew.CurrentTag;
        if (user.WhatsNewSeenVersion != currentTag)
        {
            user.WhatsNewSeenVersion = currentTag;
            await db.SaveChangesAsync(ct);
        }
        return NoContent();
    }

    /// <summary>The same notes for reading later (version display, update settings), regardless of whether they have been seen.</summary>
    [HttpGet("/api/whats-new/current")]
    [Authorize]
    public ActionResult<WhatsNewDto> Current([FromQuery] string? lang)
    {
        var notes = whatsNew.Read(Language(lang), show: false);
        return notes is null ? throw new ApiException(StatusCodes.Status404NotFound, "whats_new.not_available", "There are no release notes for this version.") : notes;
    }

    /// <summary>Licence, source code and the third-party licences - public on purpose: AGPL users must be able to find the source before signing in.</summary>
    [HttpGet("/api/about")]
    [AllowAnonymous]
    public ActionResult<AboutDto> About() => new AboutDto(
        Branding.ProductName,
        Branding.LicenseId,
        Branding.SourceUrl,
        ThirdPartyLicensesFile,
        new HandbookAvailability(HandbookFile("de") is not null, HandbookFile("en") is not null));

    /// <summary>The manual as PDF from the files shipped with the program.</summary>
    [HttpGet("/api/docs/handbook")]
    [Authorize]
    public IActionResult Handbook([FromQuery] string? lang)
    {
        var language = Language(lang);
        var file = HandbookFile(language) ?? throw new ApiException(StatusCodes.Status404NotFound, "handbook.not_available", "The manual is not part of this version yet.");
        var name = language == "en" ? $"{Branding.ProductName}-Handbook.pdf" : $"{Branding.ProductName}-Handbuch.pdf";
        Response.Headers.ContentDisposition = $"inline; filename=\"{name}\"";
        return PhysicalFile(file, "application/pdf", enableRangeProcessing: true);
    }

    private const string ThirdPartyLicensesFile = "/third-party-licenses.json";

    /// <summary>The PDF in the language's folder; the name comes from the build, the folder from a fixed list, so the request cannot point anywhere else.</summary>
    private string? HandbookFile(string language)
    {
        if (settings.HandbookDirectory is not { } root) return null;
        var folder = Path.Combine(root, language);
        if (!Directory.Exists(folder)) return null;
        return Directory.GetFiles(folder, "*.pdf").OrderBy(f => f, StringComparer.Ordinal).FirstOrDefault();
    }

    private static string Language(string? value)
    {
        var language = ChangelogParser.NormalizeLanguage(value);
        if (language.Length > 0) return language;
        var errors = new FieldErrors();
        errors.Add("lang", "validation.one_of", new() { ["allowed"] = new[] { "de", "en" } });
        errors.ThrowIfAny();
        return language;
    }
}

public sealed record HandbookAvailability(bool De, bool En);

public sealed record AboutDto(string Product, string License, string SourceUrl, string ThirdPartyLicensesUrl, HandbookAvailability Handbook);
