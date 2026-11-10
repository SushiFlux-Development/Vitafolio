using Cv.Server.Data;

namespace Cv.Server.Controllers;

public sealed record PersonalDataRequest(
    string? FirstName,
    string? LastName,
    string? AcademicTitle,
    string? ProfessionalTitle,
    string? Email,
    string? Phone,
    string? Street,
    string? PostalCode,
    string? City,
    string? Country,
    string? DateOfBirth,
    string? PlaceOfBirth,
    string? Nationality,
    string? MaritalStatus,
    string? Website,
    string? LinkedIn,
    string? GitHub,
    string? Xing,
    string? Bio);

public sealed record ExperienceRequest(
    string? JobTitle,
    string? Employer,
    string? EmploymentType,
    string? City,
    string? Country,
    string? StartDate,
    string? EndDate,
    bool IsCurrent,
    string? Description,
    int SortOrder);

public sealed record ExperienceDto(
    Guid Id,
    string JobTitle,
    string Employer,
    string? EmploymentType,
    string? City,
    string? Country,
    string StartDate,
    string? EndDate,
    bool IsCurrent,
    string? Description,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static ExperienceDto From(Experience e) =>
        new(e.Id, e.JobTitle, e.Employer, e.EmploymentType, e.City, e.Country, e.StartDate, e.EndDate, e.IsCurrent, e.Description, e.SortOrder, e.CreatedAt, e.UpdatedAt);
}

public sealed record EducationRequest(
    string? Degree,
    string? FieldOfStudy,
    string? Institution,
    string? City,
    string? Country,
    string? StartDate,
    string? EndDate,
    bool IsCurrent,
    string? Grade,
    string? Description,
    int SortOrder);

public sealed record EducationDto(
    Guid Id,
    string Degree,
    string? FieldOfStudy,
    string Institution,
    string? City,
    string? Country,
    string StartDate,
    string? EndDate,
    bool IsCurrent,
    string? Grade,
    string? Description,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static EducationDto From(Education e) =>
        new(e.Id, e.Degree, e.FieldOfStudy, e.Institution, e.City, e.Country, e.StartDate, e.EndDate, e.IsCurrent, e.Grade, e.Description, e.SortOrder, e.CreatedAt, e.UpdatedAt);

    /// <summary>What orders educations by date: the start, or the end when the start is not known (a school: only the year of graduation).</summary>
    public string SortKey() => string.IsNullOrWhiteSpace(StartDate) ? EndDate ?? "" : StartDate;
}

public sealed record SkillRequest(
    string? Name,
    string? Category,
    int Level,
    int SortOrder);

public sealed record SkillDto(
    Guid Id,
    string Name,
    string? Category,
    int Level,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static SkillDto From(Skill s) =>
        new(s.Id, s.Name, s.Category, s.Level, s.SortOrder, s.CreatedAt, s.UpdatedAt);
}

public sealed record LanguageRequest(
    string? Language,
    string? Level,
    int SortOrder);

public sealed record LanguageDto(
    Guid Id,
    string Language,
    string Level,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static LanguageDto From(LanguageSkill l) =>
        new(l.Id, l.Language, l.Level, l.SortOrder, l.CreatedAt, l.UpdatedAt);
}

public sealed record CertificateRequest(
    string? Title,
    string? Issuer,
    string? IssueDate,
    string? ExpiryDate,
    string? CredentialUrl,
    string? CredentialId,
    int SortOrder);

public sealed record CertificateDto(
    Guid Id,
    string Title,
    string? Issuer,
    string? IssueDate,
    string? ExpiryDate,
    string? CredentialUrl,
    string? CredentialId,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static CertificateDto From(Certificate c) =>
        new(c.Id, c.Title, c.Issuer, c.IssueDate, c.ExpiryDate, c.CredentialUrl, c.CredentialId, c.SortOrder, c.CreatedAt, c.UpdatedAt);
}

public sealed record InterestRequest(
    string? Name,
    string? Category,
    string? Description,
    int SortOrder);

public sealed record InterestDto(
    Guid Id,
    string Name,
    string? Category,
    string? Description,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static InterestDto From(Interest i) =>
        new(i.Id, i.Name, i.Category, i.Description, i.SortOrder, i.CreatedAt, i.UpdatedAt);
}

public sealed record CustomSectionItemRequest(
    string? Title,
    string? Subtitle,
    string? DateRange,
    string? Description,
    int SortOrder);

public sealed record CustomSectionItemDto(
    Guid Id,
    string Title,
    string? Subtitle,
    string? DateRange,
    string? Description,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt)
{
    public static CustomSectionItemDto From(CustomSectionItem item) =>
        new(item.Id, item.Title, item.Subtitle, item.DateRange, item.Description, item.SortOrder, item.CreatedAt, item.UpdatedAt);
}

public sealed record CustomSectionRequest(
    string? Title,
    int SortOrder);

public sealed record CustomSectionDto(
    Guid Id,
    string Title,
    int SortOrder,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<CustomSectionItemDto> Items)
{
    public static CustomSectionDto From(CustomSection s) =>
        new(s.Id, s.Title, s.SortOrder, s.CreatedAt, s.UpdatedAt, s.Items.OrderBy(i => i.SortOrder).ThenBy(i => i.CreatedAt).Select(CustomSectionItemDto.From).ToList());
}

public sealed record ReorderRequest(IReadOnlyList<Guid>? Ids);

public sealed record ProfileResponse(
    Guid Id,
    string FirstName,
    string LastName,
    string? AcademicTitle,
    string? ProfessionalTitle,
    string? Email,
    string? Phone,
    string? Street,
    string? PostalCode,
    string? City,
    string? Country,
    string? DateOfBirth,
    string? PlaceOfBirth,
    string? Nationality,
    string? MaritalStatus,
    string? Website,
    string? LinkedIn,
    string? GitHub,
    string? Xing,
    string? Bio,
    bool HasPhoto,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<ExperienceDto> Experiences,
    IReadOnlyList<EducationDto> Educations,
    IReadOnlyList<SkillDto> Skills,
    IReadOnlyList<LanguageDto> Languages,
    IReadOnlyList<CertificateDto> Certificates,
    IReadOnlyList<InterestDto> Interests,
    IReadOnlyList<CustomSectionDto> CustomSections,
    PreviewOptionsDto? PreviewOptions = null,
    Applications.CvContentSettingsDto? CvContentSettings = null)
{
    public static ProfileResponse From(UserProfile p) =>
        new(
            p.Id,
            p.FirstName,
            p.LastName,
            p.AcademicTitle,
            p.ProfessionalTitle,
            p.Email,
            p.Phone,
            p.Street,
            p.PostalCode,
            p.City,
            p.Country,
            p.DateOfBirth,
            p.PlaceOfBirth,
            p.Nationality,
            p.MaritalStatus,
            p.Website,
            p.LinkedIn,
            p.GitHub,
            p.Xing,
            p.Bio,
            !string.IsNullOrEmpty(p.PhotoPath),
            p.CreatedAt,
            p.UpdatedAt,
            p.Experiences.OrderBy(e => e.SortOrder).ThenByDescending(e => e.StartDate).Select(ExperienceDto.From).ToList(),
            p.Educations.OrderBy(e => e.SortOrder).ThenByDescending(e => string.IsNullOrWhiteSpace(e.StartDate) ? e.EndDate ?? "" : e.StartDate).Select(EducationDto.From).ToList(),
            p.Skills.OrderBy(s => s.SortOrder).ThenBy(s => s.Name).Select(SkillDto.From).ToList(),
            p.Languages.OrderBy(l => l.SortOrder).ThenBy(l => l.Language).Select(LanguageDto.From).ToList(),
            p.Certificates.OrderBy(c => c.SortOrder).ThenByDescending(c => c.IssueDate).Select(CertificateDto.From).ToList(),
            p.Interests.OrderBy(i => i.SortOrder).ThenBy(i => i.Name).Select(InterestDto.From).ToList(),
            p.CustomSections.OrderBy(c => c.SortOrder).ThenBy(c => c.Title).Select(CustomSectionDto.From).ToList(),
            PreviewOptionsDto.Parse(p.PreviewOptionsJson),
            Applications.CvContentSettings.Parse(p.CvContentSettingsJson)
        );
}

/// <summary>The saved choices on "Preview and export". Values are always normalised by the same rules as <see cref="Documents.CvRenderOptions"/>.</summary>
public sealed record PreviewOptionsDto(string Design, string Language, string AccentColor, string Font, bool ShowPhoto, string PhotoShape)
{
    private static readonly System.Text.Json.JsonSerializerOptions Json = new(System.Text.Json.JsonSerializerDefaults.Web);

    /// <summary>Unknown values fall back to the default, so a removed font or design never breaks the page.</summary>
    public static PreviewOptionsDto Normalize(PreviewOptionsRequest r)
    {
        var o = new Documents.CvRenderOptions(r.Design, r.AccentColor, r.Font, r.ShowPhoto, r.PhotoShape, r.Language);
        return new(o.NormalizedDesign, o.NormalizedLanguage, o.NormalizedAccentColor, o.NormalizedFont, o.NormalizedShowPhoto, o.NormalizedPhotoShape);
    }

    public string ToJson() => System.Text.Json.JsonSerializer.Serialize(this, Json);

    /// <summary>Reads the stored column: null when nothing was saved or the text is unreadable, otherwise normalised again.</summary>
    public static PreviewOptionsDto? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            var raw = System.Text.Json.JsonSerializer.Deserialize<PreviewOptionsRequest>(json, Json);
            return raw is null ? null : Normalize(raw);
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }
}

public sealed record PreviewOptionsRequest(string? Design, string? Language, string? AccentColor, string? Font, bool? ShowPhoto, string? PhotoShape);

