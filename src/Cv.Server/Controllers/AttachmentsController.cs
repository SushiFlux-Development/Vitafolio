// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Auth;
using Cv.Server.Configuration;
using Cv.Server.Data;
using Cv.Server.Errors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Cv.Server.Controllers;

public sealed record AttachmentDto(
    Guid Id,
    string Title,
    string FileName,
    string? Category,
    string ContentType,
    long SizeBytes,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static AttachmentDto From(Attachment a) =>
        new(a.Id, a.Title, a.FileName, a.Category, a.ContentType, a.SizeBytes, a.SortOrder, a.CreatedAt, a.UpdatedAt);
}

public sealed record UpdateAttachmentRequest(
    string? Title,
    string? Category,
    int? SortOrder);

[ApiController]
[Route("api/attachments")]
[Authorize]
public sealed class AttachmentsController(
    AppDbContext db,
    ServerSettings settings,
    Storage.DataFiles files,
    Documents.TypstRenderer renderer,
    Documents.RenderGate renderGate,
    TimeProvider time) : ControllerBase
{
    // One server process owns the database: quota check, next position and insert happen as one step, or parallel uploads would pass the
    // quota together and get the same position
    private static readonly SemaphoreSlim UploadGate = new(1, 1);

    private const int MaxAttachmentBytes = 20 * 1024 * 1024; // 20 MB
    private static readonly byte[] PdfMagic = [0x25, 0x50, 0x44, 0x46]; // %PDF
    private static readonly byte[] JpegMagic = [0xFF, 0xD8, 0xFF];
    private static readonly byte[] PngMagic = [0x89, 0x50, 0x4E, 0x47];

    // Column widths of the attachments table
    private const int MaxTitle = 128;
    private const int MaxCategory = 64;
    private const int MaxFileName = 256;

    private static void ValidateText(FieldErrors errors, string? title, string? category)
    {
        InputRules.Optional(errors, "title", title?.Trim(), MaxTitle);
        InputRules.Optional(errors, "category", category?.Trim(), MaxCategory);
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AttachmentDto>>> List(CancellationToken ct)
    {
        var userId = User.RequiredUserId();
        var attachments = await db.Attachments
            .Where(a => a.UserId == userId)
            .OrderBy(a => a.SortOrder)
            .ThenByDescending(a => a.CreatedAt)
            .ToListAsync(ct);

        return Ok(attachments.Select(AttachmentDto.From).ToList());
    }

    [HttpPost]
    [RequestSizeLimit(MaxAttachmentBytes)]
    public async Task<ActionResult<AttachmentDto>> Upload(
        [FromForm] IFormFile? file,
        [FromForm] string? title,
        [FromForm] string? category,
        CancellationToken ct)
    {
        if (file is null || file.Length == 0)
        {
            throw ApiException.BadRequest("file.required", "A file is required.");
        }

        if (file.Length > MaxAttachmentBytes)
        {
            throw ApiException.BadRequest("file.too_large", "The file exceeds the 20 MB limit.");
        }

        var errors = new FieldErrors();
        ValidateText(errors, title, category);
        InputRules.Optional(errors, "file", Path.GetFileName(file.FileName), MaxFileName);
        errors.ThrowIfAny();

        using var memory = new MemoryStream();
        await file.CopyToAsync(memory, ct);
        var bytes = memory.ToArray();

        string ext;
        string contentType;

        if (bytes.Length >= 4 && bytes.AsSpan(0, 4).SequenceEqual(PdfMagic))
        {
            ext = ".pdf";
            contentType = "application/pdf";
        }
        else if (bytes.Length >= 3 && bytes[0] == JpegMagic[0] && bytes[1] == JpegMagic[1] && bytes[2] == JpegMagic[2])
        {
            ext = ".jpg";
            contentType = "image/jpeg";
        }
        else if (bytes.Length >= 4 && bytes.AsSpan(0, 4).SequenceEqual(PngMagic))
        {
            ext = ".png";
            contentType = "image/png";
        }
        else if (bytes.Length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                 && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P')
        {
            ext = ".webp";
            contentType = "image/webp";
        }
        else
        {
            throw ApiException.BadRequest("file.invalid_format", "Only PDF, PNG, JPEG, and WebP files are supported.");
        }

        if (contentType.StartsWith("image/", StringComparison.Ordinal) && Documents.ImageDimensions.TooLarge(bytes))
        {
            throw ApiException.BadRequest("photo.too_many_pixels", "The image has too many pixels.");
        }

        // A file the dossier cannot embed is refused now, with a clear message, instead of breaking an application later. Done before the
        // upload gate: a render takes a moment and must not hold up other uploads.
        await EnsureEmbeddableAsync(bytes, ext, contentType, ct);

        var userId = User.RequiredUserId();
        await UploadGate.WaitAsync(ct);
        try
        {
            var used = await db.Attachments.Where(a => a.UserId == userId).SumAsync(a => (long?)a.SizeBytes, ct) ?? 0;
            if (used + file.Length > settings.AttachmentQuotaBytes)
            {
                throw new ApiException(StatusCodes.Status409Conflict, "file.quota_exceeded", "The storage quota for attachments of this account is used up.",
                    new Dictionary<string, object?> { ["quotaMegabytes"] = settings.AttachmentQuotaBytes / (1024 * 1024) });
            }

            var id = Guid.NewGuid();
            var now = time.GetUtcNow().UtcDateTime;
            // After the highest position, not the row count: a deletion would make the count collide with an existing position
            var position = (await db.Attachments.Where(a => a.UserId == userId).MaxAsync(a => (int?)a.SortOrder, ct) ?? -1) + 1;
            var attachment = new Attachment
            {
                Id = id,
                UserId = userId,
                Title = !string.IsNullOrWhiteSpace(title) ? title.Trim() : Path.GetFileNameWithoutExtension(file.FileName),
                FileName = Path.GetFileName(file.FileName),
                Category = category?.Trim(),
                ContentType = contentType,
                SizeBytes = file.Length,
                SortOrder = position,
                CreatedAt = now,
                UpdatedAt = now
            };

            await files.SaveAsync(Storage.DataArea.Attachments, $"{userId:N}/{id:N}{ext}", bytes, replaces: null, async stored =>
            {
                attachment.StoragePath = stored;
                db.Attachments.Add(attachment);
                await db.SaveChangesAsync(ct);
            }, ct);

            return Created($"/api/attachments/{attachment.Id}", AttachmentDto.From(attachment));
        }
        finally
        {
            UploadGate.Release();
        }
    }

    private async Task EnsureEmbeddableAsync(byte[] bytes, string ext, string contentType, CancellationToken ct)
    {
        var folder = Path.Combine(Path.GetTempPath(), "cv-attachment-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try
        {
            var name = "file" + ext;
            await System.IO.File.WriteAllBytesAsync(Path.Combine(folder, name), bytes, ct);
            var check = await renderGate.RunAsync(() => renderer.CheckAttachment(folder, name, contentType), ct);
            switch (check.Result)
            {
                case Documents.AttachmentCheckResult.Unreadable:
                    throw ApiException.BadRequest("file.unreadable_pdf", "The PDF file cannot be read.");
                case Documents.AttachmentCheckResult.TooManyPages:
                    throw new ApiException(StatusCodes.Status400BadRequest, "file.too_many_pages", "The PDF file has too many pages.",
                        new Dictionary<string, object?> { ["pages"] = check.Pages, ["max"] = Documents.PdfInfo.MaxPages });
                case Documents.AttachmentCheckResult.NotRenderable:
                    throw ApiException.BadRequest("file.not_renderable", "The file cannot be included in an application dossier.");
            }
        }
        finally
        {
            try { Directory.Delete(folder, recursive: true); }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { /* a leftover temp folder is harmless */ }
        }
    }

    [HttpGet("{id:guid}/file")]
    public async Task<IActionResult> DownloadFile(Guid id, CancellationToken ct)
    {
        var userId = User.RequiredUserId();
        var attachment = await db.Attachments.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);
        if (attachment is null) return NotFound();

        var fullPath = files.Resolve(Storage.DataArea.Attachments, attachment.StoragePath);
        if (fullPath is null) return NotFound();

        var bytes = await System.IO.File.ReadAllBytesAsync(fullPath, ct);
        return File(bytes, attachment.ContentType, attachment.FileName);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<AttachmentDto>> Update(
        Guid id,
        [FromBody] UpdateAttachmentRequest body,
        CancellationToken ct)
    {
        var errors = new FieldErrors();
        ValidateText(errors, body.Title, body.Category);
        errors.ThrowIfAny();

        var userId = User.RequiredUserId();
        var attachment = await db.Attachments.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);
        if (attachment is null) return NotFound();

        if (!string.IsNullOrWhiteSpace(body.Title)) attachment.Title = body.Title.Trim();
        if (body.Category is not null) attachment.Category = string.IsNullOrWhiteSpace(body.Category) ? null : body.Category.Trim();
        attachment.UpdatedAt = time.GetUtcNow().UtcDateTime;
        if (body.SortOrder is { } position)
        {
            var all = await OrderedAsync(userId, ct);
            all.Remove(attachment);
            all.Insert(Math.Clamp(position, 0, all.Count), attachment);
            Renumber(all);
        }

        await db.SaveChangesAsync(ct);
        return Ok(AttachmentDto.From(attachment));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var userId = User.RequiredUserId();
        var attachment = await db.Attachments.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, ct);
        if (attachment is null) return NotFound();

        var stored = attachment.StoragePath;
        db.Attachments.Remove(attachment);
        await db.SaveChangesAsync(ct);
        files.Delete(Storage.DataArea.Attachments, stored);

        return NoContent();
    }

    [HttpPut("reorder")]
    public async Task<IActionResult> Reorder([FromBody] ReorderRequest body, CancellationToken ct)
    {
        var userId = User.RequiredUserId();
        if (body.Ids is not null)
        {
            var attachments = await OrderedAsync(userId, ct);
            // Listed ones first in the given order, the rest behind them in their old order: a partial list must not leave two on one position
            var listed = body.Ids.Distinct().Select(id => attachments.FirstOrDefault(a => a.Id == id)).OfType<Attachment>().ToList();
            Renumber([.. listed, .. attachments.Except(listed)]);
            await db.SaveChangesAsync(ct);
        }
        return Ok();
    }

    private Task<List<Attachment>> OrderedAsync(Guid userId, CancellationToken ct) =>
        db.Attachments.Where(a => a.UserId == userId).OrderBy(a => a.SortOrder).ThenByDescending(a => a.CreatedAt).ToListAsync(ct);

    private static void Renumber(IReadOnlyList<Attachment> ordered)
    {
        for (var i = 0; i < ordered.Count; i++) ordered[i].SortOrder = i;
    }
}

