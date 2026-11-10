// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Auth;
using Cv.Server.Configuration;
using Cv.Server.Data;
using Cv.Server.Errors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Text;
using Microsoft.EntityFrameworkCore;

namespace Cv.Server.Controllers;

/// <summary>
/// Job application tracking and portfolio dossier management.
/// Scoped to the authenticated user.
/// </summary>
[ApiController]
[Route("api/applications")]
[Authorize]
public sealed class ApplicationsController(
    AppDbContext db,
    ServerSettings settings,
    Storage.DataFiles files,
    TimeProvider time,
    Documents.TypstRenderer renderer,
    Documents.RenderGate renderGate,
    ILogger<ApplicationsController> logger) : ControllerBase
{
    private const int MaxEventNote = 2048;
    private const int MaxJobDescription = 32768;

    // Column width of applications.AttachmentIds: 36 characters per id plus the comma
    private const int MaxAttachments = 27;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ApplicationListItemDto>>> List(
        [FromQuery] string? status,
        [FromQuery] string? search,
        CancellationToken ct)
    {
        var userId = User.RequiredUserId();
        var now = time.GetUtcNow().UtcDateTime;

        var query = db.Applications
            .Include(a => a.CoverLetter)
            .Where(a => a.UserId == userId);

        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("all", StringComparison.OrdinalIgnoreCase))
        {
            var normalizedStatus = status.Trim().ToLowerInvariant();
            query = query.Where(a => a.Status == normalizedStatus);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(a =>
                a.JobTitle.Contains(term) ||
                a.Company.Contains(term) ||
                (a.Location != null && a.Location.Contains(term)));
        }

        var apps = await query
            .OrderByDescending(a => a.UpdatedAt)
            .ToListAsync(ct);

        return Ok(apps.Select(a => ApplicationListItemDto.From(a, now)).ToList());
    }

    [HttpGet("stats")]
    public async Task<ActionResult<ApplicationStatsDto>> GetStats(CancellationToken ct)
    {
        var userId = User.RequiredUserId();
        var now = time.GetUtcNow().UtcDateTime;

        var apps = await db.Applications
            .Where(a => a.UserId == userId)
            .Select(a => new { a.Status, a.AppliedAt, a.FollowUpAt })
            .ToListAsync(ct);

        int total = apps.Count;
        int draft = apps.Count(a => a.Status == ApplicationStatuses.Draft);
        int applied = apps.Count(a => a.Status == ApplicationStatuses.Applied);
        int acknowledged = apps.Count(a => a.Status == ApplicationStatuses.Acknowledged);
        int interview = apps.Count(a => a.Status == ApplicationStatuses.Interview);
        int offer = apps.Count(a => a.Status == ApplicationStatuses.Offer);
        int rejected = apps.Count(a => a.Status == ApplicationStatuses.Rejected);
        int withdrawn = apps.Count(a => a.Status == ApplicationStatuses.Withdrawn);

        int due = apps.Count(a => FollowUp.IsDue(a.Status, a.AppliedAt, a.FollowUpAt, now));

        return Ok(new ApplicationStatsDto(
            total,
            draft,
            applied,
            acknowledged,
            interview,
            offer,
            rejected,
            withdrawn,
            due));
    }

    /// <summary>
    /// What the app suggests to put into an application, for this person's situation (see <see cref="Applications.ContentSuggestionRules"/>).
    /// A suggestion only: nothing is stored or changed. Reads the signed-in user's own data.
    /// </summary>
    [HttpGet("content-suggestion")]
    public async Task<ActionResult<Applications.ContentSuggestionDto>> GetContentSuggestion(CancellationToken ct)
    {
        var userId = User.RequiredUserId();
        var profile = await GetOrCreateProfileAsync(userId, ct);
        var attachments = await db.Attachments.AsNoTracking().Where(a => a.UserId == userId).ToListAsync(ct);
        var hasLetter = await db.CoverLetters.AnyAsync(c => c.UserId == userId, ct);
        var answers = Applications.GuideAnswers.Parse(profile.GuideAnswersJson);

        var data = ProfileResponse.From(profile);

        return Ok(new Applications.ContentSuggestionRules(time).Suggest(data, attachments, hasLetter, answers, data.CvContentSettings));
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApplicationDto>> Get(Guid id, CancellationToken ct)
    {
        var userId = User.RequiredUserId();
        var now = time.GetUtcNow().UtcDateTime;

        var app = await db.Applications
            .Include(a => a.CoverLetter)
            .Include(a => a.Events)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);

        if (app is null) return NotFound();

        return Ok(ApplicationDto.From(app, now));
    }

    [HttpPost]
    public async Task<ActionResult<ApplicationDto>> Create([FromBody] ApplicationRequest body, CancellationToken ct)
    {
        var errors = new FieldErrors();
        ValidateApplicationBody(errors, body);
        errors.ThrowIfAny();

        var userId = User.RequiredUserId();
        var now = time.GetUtcNow().UtcDateTime;

        var letter = await FindOwnLetterAsync(body.CoverLetterId, userId, ct);
        await EnsureOwnAttachmentsAsync(body.AttachmentIds, userId, ct);

        var status = !string.IsNullOrWhiteSpace(body.Status) && ApplicationStatuses.All.Contains(body.Status.Trim().ToLowerInvariant())
            ? body.Status.Trim().ToLowerInvariant()
            : ApplicationStatuses.Draft;

        DateTime? appliedAt = RequestDates.AsUtc(body.AppliedAt);
        if (status == ApplicationStatuses.Applied && !appliedAt.HasValue)
        {
            appliedAt = now;
        }

        var app = new JobApplication
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            JobTitle = body.JobTitle!.Trim(),
            Company = body.Company!.Trim(),
            Location = body.Location?.Trim(),
            ContactPerson = body.ContactPerson?.Trim(),
            ContactEmail = body.ContactEmail?.Trim(),
            ContactPhone = body.ContactPhone?.Trim(),
            JobPostingUrl = body.JobPostingUrl?.Trim(),
            JobDescription = body.JobDescription?.Trim(),
            SalaryExpectation = body.SalaryExpectation?.Trim(),
            Status = status,
            AppliedAt = appliedAt,
            FollowUpAt = RequestDates.AsUtc(body.FollowUpAt),
            CoverLetterId = letter?.Id,
            CoverLetter = letter,
            CvDesign = Pick(body.CvDesign, Documents.DocumentDesigns.Default),
            CvAccentColor = string.IsNullOrWhiteSpace(body.CvAccentColor) ? Documents.DocumentText.DefaultAccentColor : body.CvAccentColor.Trim(),
            CvFont = Documents.DocumentFonts.Normalize(body.CvFont),
            CvLanguage = Pick(body.CvLanguage, "de"),
            CvShowPhoto = body.CvShowPhoto ?? true,
            CvPhotoShape = Pick(body.CvPhotoShape, "rounded"),
            IncludeCoverSheet = body.IncludeCoverSheet ?? true,
            AttachmentIds = body.AttachmentIds != null && body.AttachmentIds.Count > 0 ? string.Join(",", body.AttachmentIds) : null,
            CvSelectionJson = Applications.CvSelectionRules.ToJson(Applications.CvSelectionRules.Normalize(body.CvSelection)),
            Notes = body.Notes?.Trim(),
            CreatedAt = now,
            UpdatedAt = now
        };

        var initialEvent = new ApplicationEvent
        {
            Id = Guid.NewGuid(),
            ApplicationId = app.Id,
            Status = status,
            Date = appliedAt ?? now,
            Title = status == ApplicationStatuses.Applied ? "Bewerbung eingereicht" : "Bewerbung angelegt",
            Note = null,
            CreatedAt = now
        };
        db.ApplicationEvents.Add(initialEvent);

        db.Applications.Add(app);
        await db.SaveChangesAsync(ct);

        string? archiveWarning = null;
        if (status == ApplicationStatuses.Applied)
        {
            archiveWarning = await ArchiveDossierSnapshotAsync(app, userId, ct);
            await db.SaveChangesAsync(ct);
        }

        return CreatedAtAction(nameof(Get), new { id = app.Id }, ApplicationDto.From(app, now, archiveWarning));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ApplicationDto>> Update(Guid id, [FromBody] ApplicationRequest body, CancellationToken ct)
    {
        var errors = new FieldErrors();
        ValidateApplicationBody(errors, body);
        errors.ThrowIfAny();

        var userId = User.RequiredUserId();
        var now = time.GetUtcNow().UtcDateTime;

        var app = await db.Applications
            .Include(a => a.CoverLetter)
            .Include(a => a.Events)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);

        if (app is null) return NotFound();

        var letter = await FindOwnLetterAsync(body.CoverLetterId, userId, ct);
        await EnsureOwnAttachmentsAsync(body.AttachmentIds, userId, ct);

        var oldStatus = app.Status;
        var newStatus = !string.IsNullOrWhiteSpace(body.Status) && ApplicationStatuses.All.Contains(body.Status.Trim().ToLowerInvariant())
            ? body.Status.Trim().ToLowerInvariant()
            : app.Status;

        app.JobTitle = body.JobTitle!.Trim();
        app.Company = body.Company!.Trim();
        app.Location = body.Location?.Trim();
        app.ContactPerson = body.ContactPerson?.Trim();
        app.ContactEmail = body.ContactEmail?.Trim();
        app.ContactPhone = body.ContactPhone?.Trim();
        app.JobPostingUrl = body.JobPostingUrl?.Trim();
        app.JobDescription = body.JobDescription?.Trim();
        app.SalaryExpectation = body.SalaryExpectation?.Trim();
        // A full replacement of the editable fields: a follow-up date that is left out is cleared (the 14-day rule applies again), and so is the cover letter
        app.FollowUpAt = RequestDates.AsUtc(body.FollowUpAt);
        app.CoverLetterId = letter?.Id;
        app.CoverLetter = letter;
        app.CvDesign = Pick(body.CvDesign, app.CvDesign);
        app.CvAccentColor = string.IsNullOrWhiteSpace(body.CvAccentColor) ? app.CvAccentColor : body.CvAccentColor.Trim();
        app.CvFont = string.IsNullOrWhiteSpace(body.CvFont) ? app.CvFont : Documents.DocumentFonts.Normalize(body.CvFont);
        app.CvLanguage = Pick(body.CvLanguage, app.CvLanguage);
        app.CvShowPhoto = body.CvShowPhoto ?? app.CvShowPhoto;
        app.CvPhotoShape = Pick(body.CvPhotoShape, app.CvPhotoShape);
        app.IncludeCoverSheet = body.IncludeCoverSheet ?? app.IncludeCoverSheet;
        if (body.AttachmentIds is not null)
        {
            app.AttachmentIds = body.AttachmentIds.Count > 0 ? string.Join(",", body.AttachmentIds) : null;
        }
        // Like the attachments: a request that leaves the selection out keeps it. {} (or all groups empty) puts the application back to "everything in full".
        if (body.CvSelection is not null)
        {
            app.CvSelectionJson = Applications.CvSelectionRules.ToJson(Applications.CvSelectionRules.Normalize(body.CvSelection));
        }
        app.Notes = body.Notes?.Trim();
        app.UpdatedAt = now;

        // The day an application was sent can be corrected but not removed: leaving it out keeps it
        if (body.AppliedAt.HasValue)
        {
            app.AppliedAt = RequestDates.AsUtc(body.AppliedAt);
        }

        string? archiveWarning = null;
        if (newStatus != oldStatus)
        {
            app.Status = newStatus;
            if (newStatus == ApplicationStatuses.Applied && !app.AppliedAt.HasValue)
            {
                app.AppliedAt = now;
            }

            var statusEvent = new ApplicationEvent
            {
                Id = Guid.NewGuid(),
                ApplicationId = app.Id,
                Status = newStatus,
                Date = now,
                Title = GetDefaultEventTitle(newStatus),
                Note = null,
                CreatedAt = now
            };
            db.ApplicationEvents.Add(statusEvent);

            if (newStatus == ApplicationStatuses.Applied && string.IsNullOrEmpty(app.ArchivedPdfPath))
            {
                archiveWarning = await ArchiveDossierSnapshotAsync(app, userId, ct);
            }
        }

        await db.SaveChangesAsync(ct);
        return Ok(ApplicationDto.From(app, now, archiveWarning));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var userId = User.RequiredUserId();

        var app = await db.Applications
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);

        if (app is null) return NotFound();

        var archived = app.ArchivedPdfPath;
        db.Applications.Remove(app);
        await db.SaveChangesAsync(ct);
        files.Delete(Storage.DataArea.Applications, archived);

        return NoContent();
    }

    [HttpPost("{id:guid}/status")]
    public async Task<ActionResult<ApplicationDto>> UpdateStatus(
        Guid id,
        [FromBody] ApplicationStatusUpdateRequest body,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body.Status) || !ApplicationStatuses.All.Contains(body.Status.Trim().ToLowerInvariant()))
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "status.invalid", "Invalid application status.");
        }

        var noteErrors = new FieldErrors();
        InputRules.Optional(noteErrors, "note", body.Note, MaxEventNote);
        noteErrors.ThrowIfAny();

        var userId = User.RequiredUserId();
        var now = time.GetUtcNow().UtcDateTime;

        var app = await db.Applications
            .Include(a => a.CoverLetter)
            .Include(a => a.Events)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);

        if (app is null) return NotFound();

        var newStatus = body.Status.Trim().ToLowerInvariant();
        var eventDate = RequestDates.AsUtc(body.Date) ?? now;

        app.Status = newStatus;
        app.UpdatedAt = now;

        if (newStatus == ApplicationStatuses.Applied && !app.AppliedAt.HasValue)
        {
            app.AppliedAt = eventDate;
        }

        var ev = new ApplicationEvent
        {
            Id = Guid.NewGuid(),
            ApplicationId = app.Id,
            Status = newStatus,
            Date = eventDate,
            Title = GetDefaultEventTitle(newStatus),
            Note = body.Note?.Trim(),
            CreatedAt = now
        };
        db.ApplicationEvents.Add(ev);

        string? archiveWarning = null;
        if (newStatus == ApplicationStatuses.Applied && string.IsNullOrEmpty(app.ArchivedPdfPath))
        {
            archiveWarning = await ArchiveDossierSnapshotAsync(app, userId, ct);
        }

        await db.SaveChangesAsync(ct);
        return Ok(ApplicationDto.From(app, now, archiveWarning));
    }

    [HttpPost("{id:guid}/events")]
    public async Task<ActionResult<ApplicationEventDto>> AddEvent(
        Guid id,
        [FromBody] ApplicationEventRequest body,
        CancellationToken ct)
    {
        var errors = new FieldErrors();
        InputRules.Required(errors, "title", body.Title, 128);
        InputRules.Optional(errors, "note", body.Note, 2048);
        InputRules.Optional(errors, "status", body.Status, 32);
        errors.ThrowIfAny();

        var userId = User.RequiredUserId();
        var now = time.GetUtcNow().UtcDateTime;

        var app = await db.Applications
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);

        if (app is null) return NotFound();

        var status = !string.IsNullOrWhiteSpace(body.Status) && ApplicationStatuses.All.Contains(body.Status.Trim().ToLowerInvariant())
            ? body.Status.Trim().ToLowerInvariant()
            : app.Status;

        var ev = new ApplicationEvent
        {
            Id = Guid.NewGuid(),
            ApplicationId = app.Id,
            Status = status,
            Date = RequestDates.AsUtc(body.Date) ?? now,
            Title = body.Title!.Trim(),
            Note = body.Note?.Trim(),
            CreatedAt = now
        };

        db.ApplicationEvents.Add(ev);
        app.UpdatedAt = now;
        await db.SaveChangesAsync(ct);

        return Ok(ApplicationEventDto.From(ev));
    }

    [HttpDelete("{id:guid}/events/{eventId:guid}")]
    public async Task<IActionResult> DeleteEvent(Guid id, Guid eventId, CancellationToken ct)
    {
        var userId = User.RequiredUserId();

        var ev = await db.ApplicationEvents
            .Include(e => e.Application)
            .FirstOrDefaultAsync(e => e.Id == eventId && e.ApplicationId == id && e.Application != null && e.Application.UserId == userId, ct);

        if (ev is null) return NotFound();

        db.ApplicationEvents.Remove(ev);
        if (ev.Application != null)
        {
            ev.Application.UpdatedAt = time.GetUtcNow().UtcDateTime;
        }
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    /// <summary>Header of the preview answer: which version the PDF is, <see cref="DossierSourceArchived"/> or <see cref="DossierSourceCurrent"/>.</summary>
    public const string DossierSourceHeader = "X-Dossier-Source";

    public const string DossierSourceArchived = "archived";
    public const string DossierSourceCurrent = "current";

    /// <summary>
    /// The dossier as an inline preview. With an archived snapshot that is the filed version (what was sent), otherwise the current state
    /// rendered live; the header <see cref="DossierSourceHeader"/> says which one it is. <c>?version=current</c> asks for the live
    /// state explicitly, e.g. to compare it with the filed one. A snapshot whose file is gone is reported (409 <c>archive.missing</c>), exactly
    /// like in the download, and never replaced by a render without telling.
    /// </summary>
    [HttpGet("{id:guid}/dossier/preview")]
    [EnableRateLimiting(RateLimitPolicies.Render)]
    public async Task<IActionResult> PreviewDossier(Guid id, [FromQuery] string? version, CancellationToken ct)
    {
        var wantCurrent = false;
        if (!string.IsNullOrWhiteSpace(version))
        {
            var requested = version.Trim().ToLowerInvariant();
            if (requested != "auto" && requested != DossierSourceCurrent)
            {
                var errors = new FieldErrors();
                errors.Add("version", "validation.one_of", new() { ["allowed"] = new[] { "auto", DossierSourceCurrent } });
                errors.ThrowIfAny();
            }
            wantCurrent = requested == DossierSourceCurrent;
        }

        var userId = User.RequiredUserId();
        var app = await db.Applications
            .Include(a => a.CoverLetter)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);

        if (app is null) return NotFound();

        byte[] pdf;
        string source;
        if (wantCurrent || string.IsNullOrEmpty(app.ArchivedPdfPath))
        {
            pdf = (await RenderDossierAsync(app, userId, ct)).Pdf;
            source = DossierSourceCurrent;
        }
        else
        {
            pdf = await ReadArchivedDossierAsync(app, ct);
            source = DossierSourceArchived;
        }

        Response.Headers[DossierSourceHeader] = source;
        return File(pdf, "application/pdf");
    }

    /// <summary>
    /// The filed snapshot of an application. If its file is gone, saying so is the only honest answer - a silent new render would hand out
    /// a different document than the one that was sent.
    /// </summary>
    private async Task<byte[]> ReadArchivedDossierAsync(JobApplication app, CancellationToken ct)
    {
        var archivedPath = files.Resolve(Storage.DataArea.Applications, app.ArchivedPdfPath);
        if (archivedPath is null)
        {
            logger.LogError("Das archivierte Dossier der Bewerbung {ApplicationId} fehlt im Datenordner.", app.Id);
            throw ApiException.Conflict("archive.missing", "The archived dossier of this application is no longer available.");
        }
        return await System.IO.File.ReadAllBytesAsync(archivedPath, ct);
    }

    [HttpGet("{id:guid}/dossier/download")]
    [EnableRateLimiting(RateLimitPolicies.Render)]
    public async Task<IActionResult> DownloadDossier(Guid id, CancellationToken ct)
    {
        var userId = User.RequiredUserId();
        var app = await db.Applications
            .Include(a => a.CoverLetter)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);

        if (app is null) return NotFound();

        return File(await DossierBytesAsync(app, userId, ct), "application/pdf", Applications.DossierFileNames.For(app.Company, app.JobTitle, app.CvLanguage));
    }

    /// <summary>
    /// What a download of the dossier hands out - for one application and for every file of the ZIP: the frozen snapshot if there is one,
    /// otherwise (a draft, say) the current state rendered live with the application's own selection.
    /// </summary>
    private async Task<byte[]> DossierBytesAsync(JobApplication app, Guid userId, CancellationToken ct) =>
        string.IsNullOrEmpty(app.ArchivedPdfPath)
            ? (await RenderDossierAsync(app, userId, ct)).Pdf
            : await ReadArchivedDossierAsync(app, ct);

    private const int MaxDossiersInArchive = 100;

    /// <summary>
    /// Several dossiers as one ZIP, one PDF per application named like the single download. One that cannot be made (its archive file is gone,
    /// say) does not stop the others: it is listed in <c>Nicht-erstellt.txt</c> / <c>Not-created.txt</c> and counted in the header
    /// <c>X-Dossiers-Failed</c>. Foreign and unknown ids are treated alike: not there. The ZIP is built on disk, not in memory (up to 100 dossiers
    /// with attachments can be hundreds of megabytes): in a temporary file of the data folder that disappears when the response is closed, and at any time
    /// only one dossier is in memory. The dossiers are made one after the other through the render gate.
    /// </summary>
    [HttpPost("dossiers/archive")]
    [EnableRateLimiting(RateLimitPolicies.Render)]
    public async Task<IActionResult> DownloadDossiersArchive([FromBody] DossierArchiveRequest? body, CancellationToken ct)
    {
        var errors = new FieldErrors();
        if (body?.Ids is not { Count: > 0 }) errors.Add("ids", "validation.required");
        else if (body.Ids.Count > MaxDossiersInArchive) errors.Add("ids", "validation.max_items", new() { ["max"] = MaxDossiersInArchive });
        var english = false;
        if (!string.IsNullOrWhiteSpace(body?.Language))
        {
            InputRules.OneOf(errors, "language", body.Language.Trim().ToLowerInvariant(), "de", "en");
            english = body.Language.Trim().Equals("en", StringComparison.OrdinalIgnoreCase);
        }
        errors.ThrowIfAny();

        var userId = User.RequiredUserId();
        var requested = body!.Ids!.Distinct().ToList();
        var found = (await db.Applications.Where(a => a.UserId == userId && requested.Contains(a.Id)).ToListAsync(ct)).ToDictionary(a => a.Id);
        // Nothing of what was asked for is there (or none of it is the user's): the same answer as for a single unknown application
        if (found.Count == 0) return NotFound();

        var directory = Path.Combine(settings.DataDirectory, Storage.DataAreas.ApplicationsFolder);
        Directory.CreateDirectory(directory);
        // The prefix keeps backups and file listings away from it; DeleteOnClose removes it when the response has been sent (or the build failed)
        var path = Path.Combine(directory, Storage.DataFiles.TempPrefix + Guid.NewGuid().ToString("N") + ".zip");
        var stream = new FileStream(path, FileMode.CreateNew, FileAccess.ReadWrite, FileShare.None, 81920, FileOptions.Asynchronous | FileOptions.DeleteOnClose);
        try
        {
            var failures = new List<string>();
            ApiException? firstFailure = null;
            var created = 0;
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var zip = new System.IO.Compression.ZipArchive(stream, System.IO.Compression.ZipArchiveMode.Create, leaveOpen: true))
            {
                foreach (var id in requested)
                {
                    ct.ThrowIfCancellationRequested();
                    if (!found.TryGetValue(id, out var app))
                    {
                        failures.Add($"{id}: {(english ? "not found" : "nicht gefunden")}");
                        continue;
                    }

                    try
                    {
                        var bytes = await DossierBytesAsync(app, userId, ct);
                        var entry = zip.CreateEntry(Applications.DossierFileNames.Unique(Applications.DossierFileNames.For(app.Company, app.JobTitle, app.CvLanguage), names), System.IO.Compression.CompressionLevel.Fastest);
                        await using var entryStream = entry.Open();
                        await entryStream.WriteAsync(bytes, ct);
                        created++;
                    }
                    catch (OperationCanceledException)
                    {
                        throw;
                    }
                    catch (Exception ex)
                    {
                        logger.LogError(ex, "Die Mappe der Bewerbung {ApplicationId} konnte für die ZIP-Datei nicht erstellt werden.", app.Id);
                        if (ex is ApiException api) firstFailure ??= api;
                        failures.Add($"{OneLine(app.Company)} / {OneLine(app.JobTitle)} ({app.Id}): {FailureReason(ex, english)}");
                    }
                }

                if (created == 0)
                {
                    // Nothing could be made: an ordinary error, with the cause of the first one if it had a code of its own (like the single download)
                    throw firstFailure ?? new ApiException(StatusCodes.Status500InternalServerError, "dossiers.failed", "None of the dossiers could be created.");
                }

                if (failures.Count > 0)
                {
                    var note = zip.CreateEntry(english ? "Not-created.txt" : "Nicht-erstellt.txt", System.IO.Compression.CompressionLevel.Fastest);
                    await using var noteStream = note.Open();
                    var text = (english ? "These applications could not be created:" : "Diese Bewerbungen konnten nicht erstellt werden:") + "\r\n\r\n" + string.Join("\r\n", failures) + "\r\n";
                    await noteStream.WriteAsync(new UTF8Encoding(encoderShouldEmitUTF8Identifier: true).GetBytes(text), ct);
                }
            }

            stream.Position = 0;
            Response.Headers["X-Dossiers-Failed"] = failures.Count.ToString(System.Globalization.CultureInfo.InvariantCulture);
            var date = time.GetLocalNow().ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
            return File(stream, "application/zip", $"{(english ? "Applications" : "Bewerbungen")}-{date}.zip");
        }
        catch
        {
            await stream.DisposeAsync();
            throw;
        }
    }

    /// <summary>What went wrong for one application, in words for the note in the ZIP; the technical text stays in the log.</summary>
    private static string FailureReason(Exception ex, bool english) => ex is ApiException { Code: "archive.missing" }
        ? english ? "the filed version of the dossier is missing in the data folder." : "die abgelegte Fassung der Mappe fehlt im Datenordner."
        : english ? "the dossier could not be created (details are in the server log)." : "die Mappe konnte nicht erstellt werden (Einzelheiten im Protokoll des Servers).";

    [HttpPost("{id:guid}/dossier/archive")]
    [EnableRateLimiting(RateLimitPolicies.Render)]
    public async Task<ActionResult<ApplicationDto>> ArchiveDossierSnapshot(Guid id, [FromQuery] bool replace = false, CancellationToken ct = default)
    {
        var userId = User.RequiredUserId();
        var now = time.GetUtcNow().UtcDateTime;

        var app = await db.Applications
            .Include(a => a.CoverLetter)
            .Include(a => a.Events)
            .FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);

        if (app is null) return NotFound();

        // A new snapshot replaces the one that was frozen when the application was sent. That is only done on purpose (the UI asks first)
        if (!string.IsNullOrEmpty(app.ArchivedPdfPath) && !replace)
        {
            throw ApiException.Conflict("archive.exists", "A snapshot already exists. Confirm that it should be replaced.");
        }

        var warning = await ArchiveDossierSnapshotAsync(app, userId, ct);
        app.UpdatedAt = now;
        await db.SaveChangesAsync(ct);

        return Ok(ApplicationDto.From(app, now, warning));
    }

    /// <summary>
    /// Freezes the dossier as it is now. Returns null when the snapshot is stored, otherwise a code that tells the caller what went wrong
    /// (shown to the user); the application itself is never lost because of it. A dossier with an attachment that could not be
    /// embedded is not archived: the snapshot is the record of what was sent, so it must be complete.
    /// </summary>
    private async Task<string?> ArchiveDossierSnapshotAsync(JobApplication app, Guid userId, CancellationToken ct)
    {
        try
        {
            var rendered = await RenderDossierAsync(app, userId, ct);
            if (rendered.Problems.Count > 0)
            {
                logger.LogWarning("Das Dossier der Bewerbung {ApplicationId} wurde nicht archiviert, weil Anlagen fehlen oder nicht lesbar sind: {Attachments}",
                    app.Id, string.Join(", ", rendered.Problems.Select(OneLine)));
                return "archive.attachments_unavailable";
            }

            // A new name for every snapshot: the old file stays untouched until the database points at the new one
            var name = $"{userId}_{app.Id}_{Guid.NewGuid():N}.pdf";
            await files.SaveAsync(Storage.DataArea.Applications, name, rendered.Pdf, app.ArchivedPdfPath, async stored =>
            {
                app.ArchivedPdfPath = stored;
                await db.SaveChangesAsync(ct);
            }, ct);
            return null;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Das Dossier der Bewerbung {ApplicationId} konnte nicht archiviert werden.", app.Id);
            return "archive.failed";
        }
    }

    // Titles come from the user: one line in the log, no control characters
    private static string OneLine(string value) => new(value.Select(c => char.IsControl(c) ? ' ' : c).ToArray());

    private async Task<Documents.DossierRenderResult> RenderDossierAsync(JobApplication app, Guid userId, CancellationToken ct)
    {
        var profile = await GetOrCreateProfileAsync(userId, ct);

        CoverLetter? coverLetter = null;
        if (app.CoverLetterId.HasValue)
        {
            coverLetter = await db.CoverLetters
                .FirstOrDefaultAsync(c => c.Id == app.CoverLetterId.Value && c.UserId == userId, ct);
        }

        var photoPath = files.Resolve(Storage.DataArea.Photos, profile.PhotoPath);
        var sigPath = files.Resolve(Storage.DataArea.Signatures, coverLetter?.SignaturePath);

        List<Documents.DossierAttachmentItem>? attachmentItems = null;
        if (!string.IsNullOrWhiteSpace(app.AttachmentIds))
        {
            var requestedGuids = app.AttachmentIds.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(s => Guid.TryParse(s, out var g) ? g : Guid.Empty)
                .Where(g => g != Guid.Empty)
                .ToList();

            if (requestedGuids.Count > 0)
            {
                var attachments = await db.Attachments
                    .Where(a => a.UserId == userId && requestedGuids.Contains(a.Id))
                    .ToListAsync(ct);

                var ordered = requestedGuids
                    .Select(gid => attachments.FirstOrDefault(a => a.Id == gid))
                    .Where(a => a != null)
                    .Cast<Attachment>()
                    .ToList();

                // A file that is gone is not dropped: its place in the dossier gets a note page (empty FilePath), so nobody sends
                // an application believing the attachment is in it
                attachmentItems = ordered.Select(a => new Documents.DossierAttachmentItem(
                    Title: a.Title,
                    FilePath: files.Resolve(Storage.DataArea.Attachments, a.StoragePath) is not null ? a.StoragePath : "",
                    ContentType: a.ContentType)).ToList();
            }
        }

        var options = new Documents.DossierRenderOptions(
            Design: app.CvDesign,
            AccentColor: app.CvAccentColor,
            Font: app.CvFont,
            ShowPhoto: app.CvShowPhoto,
            PhotoShape: app.CvPhotoShape,
            Language: app.CvLanguage,
            IncludeCoverSheet: app.IncludeCoverSheet,
            TargetJob: app.JobTitle,
            TargetCompany: app.Company,
            Contents: null,
            Attachments: attachmentItems);

        // The one place where the selection of this application is applied: preview, download and the frozen snapshot all render from here
        var profileData = Applications.CvSelectionRules.Apply(ProfileResponse.From(profile), Applications.CvSelectionRules.Parse(app.CvSelectionJson));
        var letterData = coverLetter != null ? CoverLetterDto.From(coverLetter) : null;
        var dataDirectory = settings.DataDirectory;
        var result = await renderGate.RunAsync(() => renderer.RenderDossier(profileData, letterData, options, photoPath, sigPath, dataDirectory: dataDirectory), ct);
        if (result.Problems.Count > 0)
        {
            logger.LogWarning("Im Dossier der Bewerbung {ApplicationId} fehlen oder sind nicht lesbar: {Attachments}", app.Id, string.Join(", ", result.Problems.Select(OneLine)));
        }
        return result;
    }

    private async Task<UserProfile> GetOrCreateProfileAsync(Guid userId, CancellationToken ct)
    {
        var profile = await db.Profiles
            .Include(p => p.Experiences)
            .Include(p => p.Educations)
            .Include(p => p.Skills)
            .Include(p => p.Languages)
            .Include(p => p.Certificates)
            .Include(p => p.Interests)
            .Include(p => p.CustomSections)
                .ThenInclude(cs => cs.Items)
            .FirstOrDefaultAsync(p => p.UserId == userId, ct);

        if (profile is not null) return profile;

        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new ApiException(StatusCodes.Status401Unauthorized, "auth.invalid", "The account no longer exists.");

        var words = user.DisplayName.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        var firstName = words.Length > 0 ? words[0] : "";
        var lastName = words.Length > 1 ? string.Join(" ", words.Skip(1)) : "";

        return new UserProfile
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            FirstName = firstName,
            LastName = lastName,
            CreatedAt = time.GetUtcNow().UtcDateTime,
            UpdatedAt = time.GetUtcNow().UtcDateTime
        };
    }

    // The values the UI offers. Anything else is refused instead of being stored and silently shown as the default later.
    private static readonly string[] CvPhotoShapes = ["round", "rounded", "rect"];
    private static readonly string[] CvLanguages = ["de", "en"];

    // Dates the UI can reasonably send; anything outside is a typo (year 0026) or an overflow, not a plan
    private static readonly DateTime EarliestDate = new(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime LatestDate = new(2100, 12, 31, 23, 59, 59, DateTimeKind.Utc);

    /// <summary>A lower-case, trimmed choice value, or <paramref name="fallback"/> when the request leaves it out.</summary>
    private static string Pick(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Trim().ToLowerInvariant();

    /// <summary>The cover letter an application points at; it has to belong to the signed-in user. Null when none is chosen.</summary>
    private async Task<CoverLetter?> FindOwnLetterAsync(Guid? coverLetterId, Guid userId, CancellationToken ct)
    {
        if (!coverLetterId.HasValue) return null;
        var letter = await db.CoverLetters.FirstOrDefaultAsync(c => c.Id == coverLetterId.Value && c.UserId == userId, ct);
        return letter ?? throw new ApiException(StatusCodes.Status400BadRequest, "coverLetter.not_found", "The specified cover letter does not exist.");
    }

    /// <summary>Every attachment of a dossier has to be one of the user's own; the dossier would silently leave a foreign one out.</summary>
    private async Task EnsureOwnAttachmentsAsync(IReadOnlyList<Guid>? ids, Guid userId, CancellationToken ct)
    {
        if (ids is not { Count: > 0 }) return;
        var distinct = ids.Distinct().ToList();
        var owned = await db.Attachments.CountAsync(a => a.UserId == userId && distinct.Contains(a.Id), ct);
        if (owned != distinct.Count)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "attachment.not_found", "One of the specified attachments does not exist.");
        }
    }

    private static void ValidateApplicationBody(FieldErrors errors, ApplicationRequest body)
    {
        // Measured after trimming: a title of blanks is empty, and the stored value is the trimmed one
        InputRules.Required(errors, "jobTitle", body.JobTitle?.Trim(), 128);
        InputRules.Required(errors, "company", body.Company?.Trim(), 128);
        InputRules.Optional(errors, "location", body.Location?.Trim(), 128);
        InputRules.Optional(errors, "contactPerson", body.ContactPerson?.Trim(), 128);
        InputRules.Optional(errors, "contactEmail", body.ContactEmail?.Trim(), 128);
        if (!string.IsNullOrWhiteSpace(body.ContactEmail) && !IsPlausibleEmail(body.ContactEmail.Trim())) errors.Add("contactEmail", "validation.pattern");
        InputRules.Optional(errors, "contactPhone", body.ContactPhone?.Trim(), 64);
        InputRules.Link(errors, "jobPostingUrl", body.JobPostingUrl, 512);
        InputRules.Optional(errors, "jobDescription", body.JobDescription, MaxJobDescription);
        InputRules.Optional(errors, "salaryExpectation", body.SalaryExpectation?.Trim(), 64);
        InputRules.Optional(errors, "status", body.Status, 32);
        if (!string.IsNullOrWhiteSpace(body.Status) && !ApplicationStatuses.IsValid(body.Status)) errors.Add("status", "validation.one_of", new() { ["allowed"] = ApplicationStatuses.All });
        InputRules.Optional(errors, "cvDesign", body.CvDesign, 32);
        if (!string.IsNullOrWhiteSpace(body.CvDesign)) InputRules.OneOf(errors, "cvDesign", body.CvDesign.Trim().ToLowerInvariant(), Documents.DocumentDesigns.Ids);
        InputRules.Optional(errors, "cvAccentColor", body.CvAccentColor, 16);
        Documents.DocumentText.ValidateColor(errors, "cvAccentColor", body.CvAccentColor);
        InputRules.Optional(errors, "cvFont", body.CvFont, 64);
        InputRules.Optional(errors, "cvLanguage", body.CvLanguage, 8);
        if (!string.IsNullOrWhiteSpace(body.CvLanguage)) InputRules.OneOf(errors, "cvLanguage", body.CvLanguage.Trim().ToLowerInvariant(), CvLanguages);
        InputRules.Optional(errors, "cvPhotoShape", body.CvPhotoShape, 16);
        if (!string.IsNullOrWhiteSpace(body.CvPhotoShape)) InputRules.OneOf(errors, "cvPhotoShape", body.CvPhotoShape.Trim().ToLowerInvariant(), CvPhotoShapes);
        InputRules.Optional(errors, "notes", body.Notes, 16384);
        ValidateDate(errors, "appliedAt", body.AppliedAt);
        ValidateDate(errors, "followUpAt", body.FollowUpAt);
        if (body.AttachmentIds is { Count: > MaxAttachments }) errors.Add("attachmentIds", "validation.max_items", new() { ["max"] = MaxAttachments });
        else if (body.AttachmentIds is not null && body.AttachmentIds.Distinct().Count() != body.AttachmentIds.Count) errors.Add("attachmentIds", "validation.duplicates");
        Applications.CvSelectionRules.Validate(errors, body.CvSelection);
    }

    private static void ValidateDate(FieldErrors errors, string field, DateTime? value)
    {
        if (value is null) return;
        var utc = RequestDates.AsUtc(value)!.Value;
        if (utc < EarliestDate || utc > LatestDate) errors.Add(field, "validation.invalid_value");
    }

    // Deliberately lenient (the mail server decides what exists): one @, text on both sides, a dot in the domain, no blanks or control characters
    private static bool IsPlausibleEmail(string value)
    {
        if (value.Any(c => char.IsControl(c) || char.IsWhiteSpace(c))) return false;
        var at = value.IndexOf('@');
        if (at <= 0 || at != value.LastIndexOf('@')) return false;
        var domain = value[(at + 1)..];
        return domain.Contains('.') && !domain.StartsWith('.') && !domain.EndsWith('.');
    }

    private static string GetDefaultEventTitle(string status) => status switch
    {
        ApplicationStatuses.Draft => "Entwurf gespeichert",
        ApplicationStatuses.Applied => "Bewerbung eingereicht",
        ApplicationStatuses.Acknowledged => "Eingangsbestätigung erhalten",
        ApplicationStatuses.Interview => "Vorstellungsgespräch",
        ApplicationStatuses.Offer => "Angebot erhalten",
        ApplicationStatuses.Rejected => "Absage erhalten",
        ApplicationStatuses.Withdrawn => "Bewerbung zurückgezogen",
        _ => "Status geändert"
    };

}
