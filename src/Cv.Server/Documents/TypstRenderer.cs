// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Cv.Server.Controllers;
using Cv.Server.Storage;
using typstsharp;
using UglyToad.PdfPig;

namespace Cv.Server.Documents;

/// <summary>
/// Renders CV, cover letters, cover sheets and application dossiers using embedded Typst templates and the in-process native typst
/// compiler. User inputs are passed strictly as JSON data, never concatenated into Typst markup. The CV is one set of designs
/// (<c>cv_*.typ</c>) that the stand-alone CV and the dossier both use, so a preview and the dossier always show the same CV.
/// </summary>
public sealed class TypstRenderer
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        // A missing value must stay missing in the template: with an explicit null, "no category" would crash the template and
        // an empty optional field would leave separators and brackets behind
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new CleanStringConverter() },
    };

    // The templates are put together from the shared parts; the result is the same for every render. The CV parts come from the one list
    // of designs (a design file per id) and a generated table id -> design, so a new design only needs its file and a line in the list.
    private const string DesignTable = "<design-table>";
    private static readonly string[] CvParts = ["cv_kit.typ", .. DocumentDesigns.All.Select(d => $"cv_{d.Id}.typ"), DesignTable, "cv_render.typ"];
    private static readonly Lazy<Dictionary<string, string>> Sources = new(() => new(StringComparer.Ordinal)
    {
        ["cv"] = Compose("doc_cv.typ", CvParts),
        ["coverSheet"] = Compose("doc_cover_sheet.typ", "parts.typ"),
        ["coverLetter"] = Compose("doc_cover_letter.typ", "parts.typ"),
        ["dossier"] = Compose("doc_dossier.typ", [.. CvParts, "parts.typ"]),
        ["attachment"] = Compose("doc_attachment.typ", "parts.typ"),
    });

    private static Fonts FontSetup => new(IncludeSystemFonts: false, FontPaths: [DocumentFonts.Directory]);

    public byte[] RenderPdf(ProfileResponse profile, CvRenderOptions options, string? photoFilePath = null)
    {
        var inputs = new Dictionary<string, string>
        {
            ["data"] = JsonSerializer.Serialize(profile, JsonOptions),
            ["options"] = JsonSerializer.Serialize(new
            {
                design = options.NormalizedDesign,
                accentColor = options.NormalizedAccentColor,
                font = options.NormalizedFont,
                showPhoto = options.NormalizedShowPhoto,
                photoShape = options.NormalizedPhotoShape,
                language = options.NormalizedLanguage,
            }, JsonOptions),
        };
        var root = AddSingleFile(inputs, "photo", options.NormalizedShowPhoto ? photoFilePath : null);
        return Compile(Sources.Value["cv"], inputs, root);
    }

    /// <summary>The first page of a CV as a PNG picture. Used by the script that makes the preview pictures of the design gallery.</summary>
    public byte[] RenderFirstPagePng(ProfileResponse profile, CvRenderOptions options, string? photoFilePath = null, int ppi = 60)
    {
        var inputs = new Dictionary<string, string>
        {
            ["data"] = JsonSerializer.Serialize(profile, JsonOptions),
            ["options"] = JsonSerializer.Serialize(new
            {
                design = options.NormalizedDesign,
                accentColor = options.NormalizedAccentColor,
                font = options.NormalizedFont,
                showPhoto = options.NormalizedShowPhoto,
                photoShape = options.NormalizedPhotoShape,
                language = options.NormalizedLanguage,
            }, JsonOptions),
        };
        var root = AddSingleFile(inputs, "photo", options.NormalizedShowPhoto ? photoFilePath : null);
        using var compiler = TypstCompiler.FromSource(Sources.Value["cv"], fonts: FontSetup, sysInputs: inputs, root: root, packagePath: null, includeSystemPackages: false);
        return compiler.CompilePng(ppi: ppi)[0];
    }

    public byte[] RenderCoverLetterPdf(CoverLetterDto coverLetter, CoverLetterRenderOptions options, string? signatureFilePath = null)
    {
        var inputs = new Dictionary<string, string>
        {
            ["data"] = JsonSerializer.Serialize(coverLetter, JsonOptions),
            ["options"] = JsonSerializer.Serialize(new
            {
                accentColor = options.NormalizedAccentColor,
                font = options.NormalizedFont,
                language = options.NormalizedLanguage,
                includeFoldMarks = options.NormalizedIncludeFoldMarks,
            }, JsonOptions),
        };
        var root = AddSingleFile(inputs, "signature", signatureFilePath);
        return Compile(Sources.Value["coverLetter"], inputs, root);
    }

    public byte[] RenderCoverSheetPdf(ProfileResponse profile, CoverSheetOptions options, string? photoFilePath = null)
    {
        var inputs = new Dictionary<string, string>
        {
            ["data"] = JsonSerializer.Serialize(new
            {
                profile.FirstName,
                profile.LastName,
                profile.AcademicTitle,
                profile.ProfessionalTitle,
                profile.Email,
                profile.Phone,
                profile.Street,
                profile.PostalCode,
                profile.City,
                profile.Country,
                profile.Website,
                TargetJob = options.TargetJob ?? profile.ProfessionalTitle,
                options.TargetCompany,
                Contents = options.Contents ?? [],
            }, JsonOptions),
            ["options"] = JsonSerializer.Serialize(new
            {
                accentColor = options.NormalizedAccentColor,
                font = options.NormalizedFont,
                showPhoto = options.NormalizedShowPhoto,
                photoShape = options.NormalizedPhotoShape,
                language = options.NormalizedLanguage,
            }, JsonOptions),
        };
        var root = AddSingleFile(inputs, "photo", options.NormalizedShowPhoto ? photoFilePath : null);
        return Compile(Sources.Value["coverSheet"], inputs, root);
    }

    /// <summary>The dossier as bytes only; see <see cref="RenderDossier"/> for the version that also reports attachments that were left out.</summary>
    public byte[] RenderDossierPdf(
        ProfileResponse profile,
        CoverLetterDto? coverLetter,
        DossierRenderOptions options,
        string? photoFilePath = null,
        string? signatureFilePath = null,
        string? dataDirectory = null) =>
        RenderDossier(profile, coverLetter, options, photoFilePath, signatureFilePath, dataDirectory).Pdf;

    /// <summary>
    /// Renders the dossier. An attachment that is missing or cannot be read never fails the whole dossier: its place gets a page that says
    /// so, and its title is returned in <see cref="DossierRenderResult.Problems"/> so the caller can report it.
    /// </summary>
    public DossierRenderResult RenderDossier(
        ProfileResponse profile,
        CoverLetterDto? coverLetter,
        DossierRenderOptions options,
        string? photoFilePath = null,
        string? signatureFilePath = null,
        string? dataDirectory = null)
    {
        var root = ResolveDossierRoot(options, photoFilePath, signatureFilePath, dataDirectory, out var photoArg, out var sigArg);
        var attachments = PlanAttachments(options.Attachments, dataDirectory);
        var hasLetter = coverLetter is not null && !string.IsNullOrWhiteSpace(coverLetter.Subject);
        var english = options.NormalizedLanguage == "en";

        // The cover sheet lists what the dossier really contains, unless the caller names the contents itself
        var contents = options.Contents is { Count: > 0 } ? options.Contents : DefaultContents(hasLetter, english, attachments);

        byte[] Build(IReadOnlyList<AttachmentPlan> plan) => Compile(Sources.Value["dossier"], new Dictionary<string, string>
        {
            ["data"] = JsonSerializer.Serialize(profile, JsonOptions),
            ["coverLetter"] = coverLetter is not null ? JsonSerializer.Serialize(coverLetter, JsonOptions) : "{}",
            ["options"] = JsonSerializer.Serialize(new
            {
                design = options.NormalizedDesign,
                accentColor = options.NormalizedAccentColor,
                font = options.NormalizedFont,
                showPhoto = options.NormalizedShowPhoto,
                photoShape = options.NormalizedPhotoShape,
                language = options.NormalizedLanguage,
                includeCoverSheet = options.NormalizedIncludeCoverSheet,
                targetJob = options.TargetJob ?? profile.ProfessionalTitle,
                targetCompany = options.TargetCompany,
                contents,
                attachments = plan.Select(a => new { title = a.Title, filePath = a.FilePath, kind = a.Kind, pages = a.Pages }),
            }, JsonOptions),
            ["photo"] = photoArg,
            ["signature"] = sigArg,
        }, root);

        try
        {
            return new DossierRenderResult(Build(attachments), [.. attachments.Where(a => a.Kind == AttachmentPlan.Missing).Select(a => a.Title)]);
        }
        catch (Exception) when (attachments.Any(a => a.Kind != AttachmentPlan.Missing))
        {
            // Something in the dossier broke the compile. Find out which attachments cannot be embedded, replace them by a note page and try
            // again; when the dossier fails without them, the cause is somewhere else and the error is thrown.
            var checkedPlan = attachments.Select(a => a.Kind == AttachmentPlan.Missing || TryCheck(a, root, options) ? a : a.AsMissing()).ToList();
            var problems = checkedPlan.Where(a => a.Kind == AttachmentPlan.Missing).Select(a => a.Title).ToList();
            if (checkedPlan.Zip(attachments).All(pair => ReferenceEquals(pair.First, pair.Second))) throw;
            return new DossierRenderResult(Build(checkedPlan), problems);
        }
    }

    private static List<string> DefaultContents(bool hasLetter, bool english, List<AttachmentPlan> attachments)
    {
        var list = new List<string>();
        if (hasLetter) list.Add(english ? "Cover Letter" : "Anschreiben");
        list.Add(english ? "Curriculum Vitae" : "Lebenslauf");
        list.AddRange(attachments.Select(a => a.Title).Where(t => !string.IsNullOrWhiteSpace(t)));
        return list;
    }

    /// <summary>
    /// Test-renders one attachment the way the dossier will embed it. Returns the number of pages; throws when the file cannot be read or
    /// embedded. Used on upload, so a broken file is refused with a clear message instead of breaking a dossier later.
    /// </summary>
    /// <param name="directory">Folder that holds the file (it becomes the Typst root).</param>
    public AttachmentCheck CheckAttachment(string directory, string fileName, string contentType)
    {
        var full = Path.Combine(directory, fileName);
        var isPdf = IsPdf(contentType, fileName);
        var pages = 1;
        if (isPdf)
        {
            if (!PdfInfo.TryCountPages(full, out pages)) return new AttachmentCheck(AttachmentCheckResult.Unreadable, 0);
            if (pages > PdfInfo.MaxPages) return new AttachmentCheck(AttachmentCheckResult.TooManyPages, pages);
        }
        try
        {
            RenderAttachment(new AttachmentPlan("check", fileName, isPdf ? AttachmentPlan.Pdf : AttachmentPlan.Image, pages), directory, DossierRenderOptions.ForCheck);
        }
        catch (Exception)
        {
            return new AttachmentCheck(AttachmentCheckResult.NotRenderable, pages);
        }
        return new AttachmentCheck(AttachmentCheckResult.Ok, pages);
    }

    private static bool TryCheck(AttachmentPlan plan, string? root, DossierRenderOptions options)
    {
        try
        {
            RenderAttachment(plan, root, options);
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }

    private static void RenderAttachment(AttachmentPlan plan, string? root, DossierRenderOptions options) =>
        Compile(Sources.Value["attachment"], new Dictionary<string, string>
        {
            ["options"] = JsonSerializer.Serialize(new
            {
                accentColor = options.NormalizedAccentColor,
                font = options.NormalizedFont,
                language = options.NormalizedLanguage,
            }, JsonOptions),
            ["attachment"] = JsonSerializer.Serialize(new { title = plan.Title, filePath = plan.FilePath, kind = plan.Kind, pages = plan.Pages }, JsonOptions),
        }, root);

    private static bool IsPdf(string? contentType, string? path) =>
        string.Equals(contentType, "application/pdf", StringComparison.OrdinalIgnoreCase)
        || (path?.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ?? false);

    /// <summary>Decides for every attachment how it is embedded: as PDF pages, as an image, or as a note because the file is not usable.</summary>
    private static List<AttachmentPlan> PlanAttachments(IReadOnlyList<DossierAttachmentItem>? items, string? dataDirectory)
    {
        var plans = new List<AttachmentPlan>();
        foreach (var item in items ?? [])
        {
            var title = item.Title ?? "";
            // Typst can only read below its root, which is the data directory; without one nothing can be embedded
            if (string.IsNullOrEmpty(item.FilePath) || string.IsNullOrEmpty(dataDirectory)) { plans.Add(AttachmentPlan.NotAvailable(title)); continue; }

            var full = Path.GetFullPath(Path.Combine(dataDirectory, item.FilePath));
            if (!PathRules.IsInside(dataDirectory, full) || !File.Exists(full)) { plans.Add(AttachmentPlan.NotAvailable(title)); continue; }

            var typstPath = Path.GetRelativePath(dataDirectory, full).Replace('\\', '/');
            if (IsPdf(item.ContentType, full))
            {
                plans.Add(PdfInfo.TryCountPages(full, out var pages) && pages <= PdfInfo.MaxPages
                    ? new AttachmentPlan(title, typstPath, AttachmentPlan.Pdf, pages)
                    : AttachmentPlan.NotAvailable(title));
            }
            else
            {
                plans.Add(new AttachmentPlan(title, typstPath, AttachmentPlan.Image, 1));
            }
        }
        return plans;
    }

    /// <summary>
    /// Typst can only read files below its root. Photo, signature and attachments are all below the data directory, so that one is the
    /// root when it is known; otherwise the common folder of photo and signature (stand-alone use, tests).
    /// </summary>
    private static string? ResolveDossierRoot(
        DossierRenderOptions options,
        string? photoFilePath,
        string? signatureFilePath,
        string? dataDirectory,
        out string photoArg,
        out string sigArg)
    {
        photoArg = string.Empty;
        sigArg = string.Empty;
        var hasPhoto = options.NormalizedShowPhoto && !string.IsNullOrEmpty(photoFilePath) && File.Exists(photoFilePath);
        var hasSig = !string.IsNullOrEmpty(signatureFilePath) && File.Exists(signatureFilePath);

        if (!string.IsNullOrEmpty(dataDirectory) && Directory.Exists(dataDirectory))
        {
            if (hasPhoto) photoArg = Path.GetRelativePath(dataDirectory, photoFilePath!).Replace('\\', '/');
            if (hasSig) sigArg = Path.GetRelativePath(dataDirectory, signatureFilePath!).Replace('\\', '/');
            return dataDirectory;
        }
        if (hasPhoto && hasSig)
        {
            var photoDir = Path.GetDirectoryName(Path.GetFullPath(photoFilePath!)) ?? Path.GetPathRoot(photoFilePath!) ?? string.Empty;
            var sigDir = Path.GetDirectoryName(Path.GetFullPath(signatureFilePath!)) ?? Path.GetPathRoot(signatureFilePath!) ?? string.Empty;
            var common = GetCommonDirectory(photoDir, sigDir);
            photoArg = Path.GetRelativePath(common, photoFilePath!).Replace('\\', '/');
            sigArg = Path.GetRelativePath(common, signatureFilePath!).Replace('\\', '/');
            return common;
        }
        if (hasPhoto)
        {
            photoArg = Path.GetFileName(photoFilePath!);
            return Path.GetDirectoryName(photoFilePath!);
        }
        if (hasSig)
        {
            sigArg = Path.GetFileName(signatureFilePath!);
            return Path.GetDirectoryName(signatureFilePath!);
        }
        return null;
    }

    /// <summary>Registers one file input (photo or signature) and returns the Typst root for it; empty input when the file does not exist.</summary>
    private static string? AddSingleFile(Dictionary<string, string> inputs, string key, string? filePath)
    {
        if (!string.IsNullOrEmpty(filePath) && File.Exists(filePath))
        {
            inputs[key] = Path.GetFileName(filePath);
            return Path.GetDirectoryName(filePath);
        }
        inputs[key] = string.Empty;
        return null;
    }

    private static byte[] Compile(string source, Dictionary<string, string> sysInputs, string? root)
    {
        using var compiler = TypstCompiler.FromSource(
            source: source,
            fonts: FontSetup,
            sysInputs: sysInputs,
            root: root,
            packagePath: null,
            includeSystemPackages: false);
        return compiler.CompilePdf();
    }

    private static string GetCommonDirectory(string pathA, string pathB)
    {
        var pA = Path.GetFullPath(pathA).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var pB = Path.GetFullPath(pathB).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        while (!string.IsNullOrEmpty(pA))
        {
            if (pB.Equals(pA, StringComparison.OrdinalIgnoreCase) || pB.StartsWith(pA + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                return pA;
            }
            var parent = Path.GetDirectoryName(pA);
            if (parent == null || parent == pA) break;
            pA = parent;
        }
        return Path.GetPathRoot(pathA) ?? pathA;
    }

    // The shared library comes first, then the building blocks, then the document that uses them
    private static string Compose(string entry, params string[] parts) =>
        string.Join("\n", new[] { "lib.typ" }.Concat(parts).Append(entry).Select(part => part == DesignTable ? DesignTableSource() : LoadTemplate(part)));

    private static string DesignTableSource() =>
        "#let cv-designs = (" + string.Join(", ", DocumentDesigns.All.Select(d => $"\"{d.Id}\": design-{d.Id}")) + ",)";

    private static string LoadTemplate(string name)
    {
        var resourceName = $"Cv.Server.Documents.Templates.{name}";
        using var stream = typeof(TypstRenderer).Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Embedded Typst template '{resourceName}' not found.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    /// <summary>How one attachment is embedded in the dossier.</summary>
    private sealed record AttachmentPlan(string Title, string FilePath, string Kind, int Pages)
    {
        public const string Pdf = "pdf";
        public const string Image = "image";
        public const string Missing = "missing";

        public static AttachmentPlan NotAvailable(string title) => new(title, "", Missing, 1);

        public AttachmentPlan AsMissing() => NotAvailable(Title);
    }

    /// <summary>Strings leave the server free of control characters (they would break Word files and show as boxes in a PDF).</summary>
    private sealed class CleanStringConverter : JsonConverter<string>
    {
        public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => reader.GetString();

        public override void Write(Utf8JsonWriter writer, string value, JsonSerializerOptions options) =>
            writer.WriteStringValue(DocumentText.Clean(value));
    }
}

/// <summary>The dossier and the titles of attachments that had to be replaced by a note page.</summary>
public sealed record DossierRenderResult(byte[] Pdf, IReadOnlyList<string> Problems);

public enum AttachmentCheckResult
{
    Ok,
    /// <summary>The PDF cannot be opened (damaged, encrypted).</summary>
    Unreadable,
    TooManyPages,
    /// <summary>The file opens, but cannot be embedded in a document.</summary>
    NotRenderable,
}

public sealed record AttachmentCheck(AttachmentCheckResult Result, int Pages);

/// <summary>Reads what the dossier needs to know about a PDF attachment.</summary>
public static class PdfInfo
{
    /// <summary>More pages than this are refused: every page becomes a page of the dossier.</summary>
    public const int MaxPages = 100;

    /// <summary>The number of pages, or false when the file is not a readable PDF.</summary>
    public static bool TryCountPages(string path, out int pages)
    {
        pages = 0;
        try
        {
            using var document = PdfDocument.Open(path);
            pages = document.NumberOfPages;
            return pages > 0;
        }
        catch (Exception)
        {
            pages = 0;
            return false;
        }
    }
}
