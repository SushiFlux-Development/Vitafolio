using Cv.Server.Controllers;
using typstsharp;

namespace Cv.Server.Tests.Support;

/// <summary>Profiles and entries for document tests. <see cref="Empty"/> has nothing but a name; the builders add single entries.</summary>
public static class DocumentSamples
{
    private static readonly DateTime Now = new(2026, 11, 8, 12, 0, 0, DateTimeKind.Utc);

    /// <summary>
    /// A real PDF with the given number of pages ("Seite 1", "Seite 2", ...) - uploads are test-rendered now, so a fake header no longer passes.
    /// <paramref name="minimumBytes"/> pads the end of the file with zeros, which readers tolerate, for tests about sizes.
    /// </summary>
    public static byte[] Pdf(int pages = 1, int minimumBytes = 0)
    {
        using var compiler = TypstCompiler.FromSource(string.Join("\n#pagebreak()\n", Enumerable.Range(1, pages).Select(n => $"Seite {n}")));
        byte[] pdf = compiler.CompilePdf();
        if (pdf.Length >= minimumBytes) return pdf;
        var padded = new byte[minimumBytes];
        pdf.CopyTo(padded, 0);
        return padded;
    }

    public static CoverLetterDto Letter(string subject = "Bewerbung als Entwicklerin", string body = "Erster Absatz.\n\nZweiter Absatz.", string? place = "Köln", string? date = "01.02.2026") => new(
        Id: Guid.NewGuid(), Title: "Brief", SenderName: "Erika Musterfrau", SenderStreet: "Weg 1", SenderPostalCode: "12345", SenderCity: "Berlin",
        SenderPhone: null, SenderEmail: null, RecipientCompany: "Firma AG", RecipientDepartment: null, RecipientContactPerson: null, RecipientStreet: null,
        RecipientPostalCode: null, RecipientCity: "Köln", RecipientCountry: null, Place: place, Date: date, Subject: subject,
        Salutation: "Sehr geehrte Damen und Herren,", Body: body, Closing: "Mit freundlichen Grüßen", SignatureName: null, HasSignature: false,
        AttachmentsNote: null, Language: "de", Font: null, AccentColor: null, CreatedAt: Now, UpdatedAt: Now);

    /// <summary>A valid 1x1 PNG.</summary>
    public static byte[] Png() => Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");

    public static ProfileResponse Empty(string first = "Erika", string last = "Musterfrau") => new(
        Id: Guid.NewGuid(), FirstName: first, LastName: last,
        AcademicTitle: null, ProfessionalTitle: null, Email: null, Phone: null, Street: null, PostalCode: null, City: null, Country: null,
        DateOfBirth: null, PlaceOfBirth: null, Nationality: null, MaritalStatus: null, Website: null, LinkedIn: null, GitHub: null, Xing: null,
        Bio: null, HasPhoto: false, CreatedAt: Now, UpdatedAt: Now,
        Experiences: [], Educations: [], Skills: [], Languages: [], Certificates: [], Interests: [], CustomSections: []);

    public static ExperienceDto Experience(string job = "Entwicklerin", string employer = "Beispiel GmbH", string? type = null, string? city = null,
        string start = "2018-01", string? end = null, bool current = false, string? description = null) =>
        new(Guid.NewGuid(), job, employer, type, city, null, start, end, current, description, 0, Now, Now);

    public static EducationDto Education(string degree = "Fachinformatik", string? field = null, string institution = "Berufsschule", string? city = null,
        string start = "2018-01", string? end = null, bool current = false, string? grade = null, string? description = null) =>
        new(Guid.NewGuid(), degree, field, institution, city, null, start, end, current, grade, description, 0, Now, Now);

    public static SkillDto Skill(string name, string? category = null, int level = 0) => new(Guid.NewGuid(), name, category, level, 0, Now, Now);

    public static LanguageDto Language(string language, string level) => new(Guid.NewGuid(), language, level, 0, Now, Now);

    public static CertificateDto Certificate(string title, string? issuer = null, string? issued = null, string? credentialId = null) =>
        new(Guid.NewGuid(), title, issuer, issued, null, null, credentialId, 0, Now, Now);

    public static InterestDto Interest(string name, string? category = null, string? description = null) => new(Guid.NewGuid(), name, category, description, 0, Now, Now);

    public static CustomSectionDto Section(string title, params CustomSectionItemDto[] items) => new(Guid.NewGuid(), title, 0, Now, Now, items);

    public static CustomSectionItemDto SectionItem(string title, string? subtitle = null, string? range = null, string? description = null) =>
        new(Guid.NewGuid(), title, subtitle, range, description, 0, Now, Now);
}
