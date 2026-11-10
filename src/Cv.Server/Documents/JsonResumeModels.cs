// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text.Json.Serialization;
using Cv.Server.Controllers;
using Cv.Server.Data;
using Cv.Server.Errors;

namespace Cv.Server.Documents;

/// <summary>
/// Models conforming to the open standard JSON Resume Schema (v1.0.0), https://jsonresume.org/schema/ .
/// Every object except the root allows additional properties. Whatever the standard has no place for (first and last name apart,
/// employment type, credential id, ...) travels in properties starting with "x-", and the own sections in <c>meta</c>, so an export read
/// back in loses nothing, while other tools simply ignore the extras.
/// </summary>
public sealed class JsonResumeDto
{
    [JsonPropertyName("$schema")]
    public string? Schema { get; set; } = "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json";

    [JsonPropertyName("basics")]
    public JsonResumeBasics? Basics { get; set; }

    [JsonPropertyName("work")]
    public List<JsonResumeWork>? Work { get; set; }

    [JsonPropertyName("education")]
    public List<JsonResumeEducation>? Education { get; set; }

    [JsonPropertyName("skills")]
    public List<JsonResumeSkill>? Skills { get; set; }

    [JsonPropertyName("languages")]
    public List<JsonResumeLanguage>? Languages { get; set; }

    [JsonPropertyName("certificates")]
    public List<JsonResumeCertificate>? Certificates { get; set; }

    [JsonPropertyName("interests")]
    public List<JsonResumeInterest>? Interests { get; set; }

    [JsonPropertyName("meta")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonResumeMeta? Meta { get; set; }
}

/// <summary>The standard's place for tool-specific data (it allows any property here).</summary>
public sealed class JsonResumeMeta
{
    [JsonPropertyName("version")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Version { get; set; }

    [JsonPropertyName("x-customSections")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<JsonResumeCustomSection>? CustomSections { get; set; }
}

public sealed class JsonResumeCustomSection
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("items")]
    public List<JsonResumeCustomItem>? Items { get; set; }
}

public sealed class JsonResumeCustomItem
{
    [JsonPropertyName("title")]
    public string? Title { get; set; }

    [JsonPropertyName("subtitle")]
    public string? Subtitle { get; set; }

    [JsonPropertyName("dateRange")]
    public string? DateRange { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}

public sealed class JsonResumeBasics
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("label")]
    public string? Label { get; set; }

    [JsonPropertyName("image")]
    public string? Image { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("summary")]
    public string? Summary { get; set; }

    [JsonPropertyName("location")]
    public JsonResumeLocation? Location { get; set; }

    [JsonPropertyName("profiles")]
    public List<JsonResumeProfile>? Profiles { get; set; }

    // "name" is first and last name in one; these keep them apart where a name has several parts
    [JsonPropertyName("x-firstName")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? FirstName { get; set; }

    [JsonPropertyName("x-lastName")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? LastName { get; set; }

    [JsonPropertyName("x-academicTitle")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? AcademicTitle { get; set; }

    [JsonPropertyName("x-dateOfBirth")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DateOfBirth { get; set; }

    [JsonPropertyName("x-placeOfBirth")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? PlaceOfBirth { get; set; }

    [JsonPropertyName("x-nationality")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Nationality { get; set; }

    [JsonPropertyName("x-maritalStatus")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? MaritalStatus { get; set; }
}

public sealed class JsonResumeLocation
{
    [JsonPropertyName("address")]
    public string? Address { get; set; }

    [JsonPropertyName("postalCode")]
    public string? PostalCode { get; set; }

    [JsonPropertyName("city")]
    public string? City { get; set; }

    // Holds the country as the profile stores it (free text); the standard asks for an ISO code, a code is accepted as it is
    [JsonPropertyName("countryCode")]
    public string? CountryCode { get; set; }

    [JsonPropertyName("region")]
    public string? Region { get; set; }
}

public sealed class JsonResumeProfile
{
    [JsonPropertyName("network")]
    public string? Network { get; set; }

    [JsonPropertyName("username")]
    public string? Username { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }
}

public sealed class JsonResumeWork
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("location")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Location { get; set; }

    [JsonPropertyName("position")]
    public string? Position { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("startDate")]
    public string? StartDate { get; set; }

    [JsonPropertyName("endDate")]
    public string? EndDate { get; set; }

    [JsonPropertyName("summary")]
    public string? Summary { get; set; }

    [JsonPropertyName("highlights")]
    public List<string>? Highlights { get; set; }

    [JsonPropertyName("x-employmentType")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? EmploymentType { get; set; }

    [JsonPropertyName("x-country")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Country { get; set; }

    // Without it an entry with no end date counts as current, which is what the standard means by a missing end date
    [JsonPropertyName("x-isCurrent")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? IsCurrent { get; set; }
}

public sealed class JsonResumeEducation
{
    [JsonPropertyName("institution")]
    public string? Institution { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("area")]
    public string? Area { get; set; }

    [JsonPropertyName("studyType")]
    public string? StudyType { get; set; }

    [JsonPropertyName("startDate")]
    public string? StartDate { get; set; }

    [JsonPropertyName("endDate")]
    public string? EndDate { get; set; }

    [JsonPropertyName("score")]
    public string? Score { get; set; }

    [JsonPropertyName("courses")]
    public List<string>? Courses { get; set; }

    [JsonPropertyName("x-city")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? City { get; set; }

    [JsonPropertyName("x-country")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Country { get; set; }

    // The description exactly as written; "courses" only carries its lines for tools that understand nothing else
    [JsonPropertyName("x-description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; set; }

    [JsonPropertyName("x-isCurrent")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? IsCurrent { get; set; }
}

public sealed class JsonResumeSkill
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("level")]
    public string? Level { get; set; }

    [JsonPropertyName("keywords")]
    public List<string>? Keywords { get; set; }

    // The rating 0-5 as it is stored; the word in "level" is only its description
    [JsonPropertyName("x-level")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? NumericLevel { get; set; }
}

public sealed class JsonResumeLanguage
{
    [JsonPropertyName("language")]
    public string? Language { get; set; }

    [JsonPropertyName("fluency")]
    public string? Fluency { get; set; }
}

public sealed class JsonResumeCertificate
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("date")]
    public string? Date { get; set; }

    [JsonPropertyName("issuer")]
    public string? Issuer { get; set; }

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [JsonPropertyName("x-expiryDate")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ExpiryDate { get; set; }

    [JsonPropertyName("x-credentialId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CredentialId { get; set; }
}

public sealed class JsonResumeInterest
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("keywords")]
    public List<string>? Keywords { get; set; }

    [JsonPropertyName("x-category")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Category { get; set; }

    [JsonPropertyName("x-description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; set; }
}

/// <summary>What a file contains, as the same request records the profile forms send. The import checks and stores these - nothing else.</summary>
internal sealed record ImportPlan(
    bool NameGiven,
    PersonalDataRequest Personal,
    IReadOnlyList<ExperienceRequest> Experiences,
    IReadOnlyList<EducationRequest> Educations,
    IReadOnlyList<SkillRequest> Skills,
    IReadOnlyList<LanguageRequest> Languages,
    IReadOnlyList<CertificateRequest> Certificates,
    IReadOnlyList<InterestRequest> Interests,
    IReadOnlyList<(CustomSectionRequest Section, IReadOnlyList<CustomSectionItemRequest> Items)>? CustomSections);

/// <summary>
/// The same rules as the profile forms, for data that arrives as a file: the file is turned into the form requests and each one is
/// checked by <see cref="ProfileRules"/>; errors are reported under the file's own field names (<c>work[2].position</c>).
/// </summary>
public static class JsonResumeValidator
{
    private const int MaxItems = 200;

    public static void Validate(FieldErrors errors, JsonResumeDto resume)
    {
        CheckCounts(errors, resume);
        if (errors.Any) return;
        var plan = JsonResumeConverter.Plan(resume);

        // Without a name in the file the profile keeps its own; stand-in names keep the other personal rules checkable
        var personal = plan.NameGiven ? plan.Personal : plan.Personal with { FirstName = "-", LastName = "-" };
        var personalErrors = new FieldErrors();
        ProfileRules.Personal(personalErrors, personal);
        errors.MergeFrom(personalErrors, PersonalField);

        Each(errors, plan.Experiences, ProfileRules.Experience, "work", ExperienceField);
        Each(errors, plan.Educations, ProfileRules.Education, "education", EducationField);
        Each(errors, plan.Skills, ProfileRules.Skill, "skills", SkillField);
        Each(errors, plan.Languages, ProfileRules.Language, "languages", LanguageField);
        Each(errors, plan.Certificates, ProfileRules.Certificate, "certificates", CertificateField);
        Each(errors, plan.Interests, ProfileRules.Interest, "interests", InterestField);

        if (plan.CustomSections is { } sections)
        {
            for (var i = 0; i < sections.Count; i++)
            {
                var sectionErrors = new FieldErrors();
                ProfileRules.CustomSection(sectionErrors, sections[i].Section);
                errors.MergeFrom(sectionErrors, f => $"meta.x-customSections[{i}].{f}");
                Each(errors, sections[i].Items, ProfileRules.CustomSectionItem, $"meta.x-customSections[{i}].items", f => f);
            }
        }
    }

    private static void CheckCounts(FieldErrors errors, JsonResumeDto resume)
    {
        void Count<T>(string field, List<T>? list)
        {
            if (list is { Count: > MaxItems }) errors.Add(field, "validation.max_items", new() { ["max"] = MaxItems });
        }
        Count("work", resume.Work);
        Count("education", resume.Education);
        Count("skills", resume.Skills);
        Count("languages", resume.Languages);
        Count("certificates", resume.Certificates);
        Count("interests", resume.Interests);
        Count("basics.profiles", resume.Basics?.Profiles);
        Count("meta.x-customSections", resume.Meta?.CustomSections);
        if (resume.Meta?.CustomSections is { } sections)
        {
            for (var i = 0; i < sections.Count; i++) Count($"meta.x-customSections[{i}].items", sections[i].Items);
        }
    }

    private static void Each<T>(FieldErrors errors, IReadOnlyList<T> items, Action<FieldErrors, T> rule, string path, Func<string, string> rename)
    {
        for (var i = 0; i < items.Count; i++)
        {
            var itemErrors = new FieldErrors();
            rule(itemErrors, items[i]);
            var index = i;
            errors.MergeFrom(itemErrors, field => $"{path}[{index}].{rename(field)}");
        }
    }

    // Form field name -> the file's field name
    private static string PersonalField(string field) => field switch
    {
        "firstName" or "lastName" => "basics.name",
        "academicTitle" => "basics.x-academicTitle",
        "professionalTitle" => "basics.label",
        "email" => "basics.email",
        "phone" => "basics.phone",
        "street" => "basics.location.address",
        "postalCode" => "basics.location.postalCode",
        "city" => "basics.location.city",
        "country" => "basics.location.countryCode",
        "dateOfBirth" => "basics.x-dateOfBirth",
        "placeOfBirth" => "basics.x-placeOfBirth",
        "nationality" => "basics.x-nationality",
        "maritalStatus" => "basics.x-maritalStatus",
        "website" => "basics.url",
        "linkedIn" => "basics.profiles.linkedIn",
        "gitHub" => "basics.profiles.gitHub",
        "xing" => "basics.profiles.xing",
        "bio" => "basics.summary",
        _ => "basics." + field,
    };

    private static string ExperienceField(string field) => field switch
    {
        "jobTitle" => "position",
        "employer" => "name",
        "employmentType" => "x-employmentType",
        "city" => "location",
        "country" => "x-country",
        "description" => "summary",
        _ => field,
    };

    private static string EducationField(string field) => field switch
    {
        "degree" => "studyType",
        "fieldOfStudy" => "area",
        "city" => "x-city",
        "country" => "x-country",
        "grade" => "score",
        "description" => "x-description",
        _ => field,
    };

    private static string SkillField(string field) => field switch
    {
        "category" => "keywords",
        "level" => "x-level",
        _ => field,
    };

    private static string LanguageField(string field) => field == "level" ? "fluency" : field;

    private static string CertificateField(string field) => field switch
    {
        "title" => "name",
        "issueDate" => "date",
        "expiryDate" => "x-expiryDate",
        "credentialUrl" => "url",
        "credentialId" => "x-credentialId",
        _ => field,
    };

    private static string InterestField(string field) => field switch
    {
        "category" => "x-category",
        "description" => "x-description",
        _ => field,
    };
}

/// <summary>
/// Bi-directional mapper between the profile and the JSON Resume standard format. An export read back in gives the same profile.
/// </summary>
public static class JsonResumeConverter
{
    private static readonly (string Label, int Level)[] SkillLevels =
    [
        ("master", 5), ("expert", 4), ("advanced", 3), ("intermediate", 2), ("beginner", 1),
    ];

    private static string LevelLabel(int level) => level switch
    {
        5 => "Master",
        4 => "Expert",
        3 => "Advanced",
        2 => "Intermediate",
        1 => "Beginner",
        _ => "",
    };

    public static JsonResumeDto ToJsonResume(ProfileResponse profile)
    {
        var resume = new JsonResumeDto
        {
            Basics = new JsonResumeBasics
            {
                Name = $"{profile.FirstName} {profile.LastName}".Trim(),
                FirstName = profile.FirstName,
                LastName = profile.LastName,
                AcademicTitle = Blank(profile.AcademicTitle),
                Label = profile.ProfessionalTitle,
                Email = profile.Email,
                Phone = profile.Phone,
                Url = profile.Website,
                Summary = profile.Bio,
                DateOfBirth = Blank(profile.DateOfBirth),
                PlaceOfBirth = Blank(profile.PlaceOfBirth),
                Nationality = Blank(profile.Nationality),
                MaritalStatus = Blank(profile.MaritalStatus),
                Location = new JsonResumeLocation
                {
                    Address = profile.Street,
                    PostalCode = profile.PostalCode,
                    City = profile.City,
                    CountryCode = profile.Country
                },
                Profiles = []
            },
            Work = [],
            Education = [],
            Skills = [],
            Languages = [],
            Certificates = [],
            Interests = [],
            Meta = new JsonResumeMeta { Version = "v1.0.0" },
        };

        if (!string.IsNullOrWhiteSpace(profile.LinkedIn)) resume.Basics.Profiles.Add(new JsonResumeProfile { Network = "LinkedIn", Url = profile.LinkedIn });
        if (!string.IsNullOrWhiteSpace(profile.GitHub)) resume.Basics.Profiles.Add(new JsonResumeProfile { Network = "GitHub", Url = profile.GitHub });
        if (!string.IsNullOrWhiteSpace(profile.Xing)) resume.Basics.Profiles.Add(new JsonResumeProfile { Network = "XING", Url = profile.Xing });

        foreach (var exp in profile.Experiences)
        {
            resume.Work.Add(new JsonResumeWork
            {
                Name = exp.Employer,
                Position = exp.JobTitle,
                Location = Blank(exp.City),
                StartDate = exp.StartDate,
                EndDate = exp.IsCurrent ? null : exp.EndDate,
                Summary = exp.Description,
                EmploymentType = Blank(exp.EmploymentType),
                Country = Blank(exp.Country),
                IsCurrent = exp.IsCurrent,
            });
        }

        foreach (var edu in profile.Educations)
        {
            resume.Education.Add(new JsonResumeEducation
            {
                Institution = edu.Institution,
                StudyType = edu.Degree,
                Area = edu.FieldOfStudy,
                StartDate = Blank(edu.StartDate),
                EndDate = edu.IsCurrent ? null : edu.EndDate,
                Score = edu.Grade,
                Courses = string.IsNullOrWhiteSpace(edu.Description)
                    ? []
                    : edu.Description.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
                Description = Blank(edu.Description),
                City = Blank(edu.City),
                Country = Blank(edu.Country),
                IsCurrent = edu.IsCurrent,
            });
        }

        foreach (var skill in profile.Skills)
        {
            resume.Skills.Add(new JsonResumeSkill
            {
                Name = skill.Name,
                Level = LevelLabel(skill.Level) is { Length: > 0 } label ? label : null,
                Keywords = string.IsNullOrWhiteSpace(skill.Category) ? [] : [skill.Category],
                NumericLevel = skill.Level,
            });
        }

        foreach (var lang in profile.Languages)
        {
            resume.Languages.Add(new JsonResumeLanguage { Language = lang.Language, Fluency = lang.Level });
        }

        foreach (var cert in profile.Certificates)
        {
            resume.Certificates.Add(new JsonResumeCertificate
            {
                Name = cert.Title,
                Issuer = cert.Issuer,
                Date = cert.IssueDate,
                Url = cert.CredentialUrl,
                ExpiryDate = Blank(cert.ExpiryDate),
                CredentialId = Blank(cert.CredentialId),
            });
        }

        foreach (var interest in profile.Interests)
        {
            resume.Interests.Add(new JsonResumeInterest
            {
                Name = interest.Name,
                Keywords = string.IsNullOrWhiteSpace(interest.Category) ? [] : [interest.Category],
                Category = Blank(interest.Category),
                Description = Blank(interest.Description),
            });
        }

        if (profile.CustomSections.Count > 0)
        {
            resume.Meta.CustomSections = [.. profile.CustomSections.Select(section => new JsonResumeCustomSection
            {
                Title = section.Title,
                Items = [.. section.Items.Select(item => new JsonResumeCustomItem
                {
                    Title = item.Title,
                    Subtitle = item.Subtitle,
                    DateRange = item.DateRange,
                    Description = item.Description,
                })],
            })];
        }

        return resume;
    }

    // ---------- import ----------

    /// <summary>Text from a file: control characters removed, trimmed, nothing instead of an empty string.</summary>
    private static string? T(string? value)
    {
        var clean = DocumentText.Clean(value).Trim();
        return clean.Length == 0 ? null : clean;
    }

    /// <summary>
    /// A date for a month field. JSON Resume files carry full days ("2020-01-01"), the forms only know "YYYY-MM"; a complete ISO day (optionally
    /// with a time) is cut to its month, every other value stays as it is so the normal validation can judge it.
    /// </summary>
    internal static string? Month(string? value)
    {
        var text = T(value);
        if (text is null) return null;
        var m = System.Text.RegularExpressions.Regex.Match(text, @"^(\d{4}-(?:0[1-9]|1[0-2]))-(?:0[1-9]|[12]\d|3[01])(?:[T ].*)?$");
        return m.Success ? m.Groups[1].Value : text;
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;

    /// <summary>The non-empty texts, one per line.</summary>
    private static string? Joined(IEnumerable<string?> parts) => T(string.Join("\n", parts.Select(T).Where(t => t is not null)));

    internal static ImportPlan Plan(JsonResumeDto resume)
    {
        var basics = resume.Basics;
        var first = T(basics?.FirstName);
        var last = T(basics?.LastName);
        var nameGiven = first is not null || last is not null || T(basics?.Name) is not null;
        if (first is null && last is null && T(basics?.Name) is { } fullName)
        {
            // Files from other tools only have "name": the first word is the first name
            var parts = fullName.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            first = parts[0];
            last = parts.Length > 1 ? parts[1] : null;
        }

        string? Profile(string network) =>
            T(basics?.Profiles?.FirstOrDefault(p => string.Equals(p.Network?.Trim(), network, StringComparison.OrdinalIgnoreCase))?.Url);

        var personal = new PersonalDataRequest(
            FirstName: first,
            LastName: last,
            AcademicTitle: T(basics?.AcademicTitle),
            ProfessionalTitle: T(basics?.Label),
            Email: T(basics?.Email),
            Phone: T(basics?.Phone),
            Street: T(basics?.Location?.Address),
            PostalCode: T(basics?.Location?.PostalCode),
            City: T(basics?.Location?.City),
            Country: T(basics?.Location?.CountryCode),
            DateOfBirth: T(basics?.DateOfBirth),
            PlaceOfBirth: T(basics?.PlaceOfBirth),
            Nationality: T(basics?.Nationality),
            MaritalStatus: T(basics?.MaritalStatus),
            Website: T(basics?.Url),
            LinkedIn: Profile("LinkedIn"),
            GitHub: Profile("GitHub"),
            Xing: Profile("Xing"),
            Bio: T(basics?.Summary));

        var experiences = new List<ExperienceRequest>();
        foreach (var w in resume.Work ?? [])
        {
            var description = Joined([w.Summary, .. w.Highlights ?? []]);
            // An entry with nothing in it is not an entry; one with a little is checked like a form
            if (T(w.Name) is null && T(w.Position) is null && T(w.StartDate) is null && T(w.EndDate) is null && description is null) continue;
            var end = Month(w.EndDate);
            var current = w.IsCurrent ?? end is null;
            experiences.Add(new ExperienceRequest(T(w.Position), T(w.Name), T(w.EmploymentType), T(w.Location), T(w.Country), Month(w.StartDate),
                current ? null : end, current, description, experiences.Count));
        }

        var educations = new List<EducationRequest>();
        foreach (var e in resume.Education ?? [])
        {
            var description = T(e.Description) ?? Joined(e.Courses ?? []);
            if (T(e.Institution) is null && T(e.StudyType) is null && T(e.Area) is null && T(e.StartDate) is null && T(e.EndDate) is null && description is null) continue;
            var end = Month(e.EndDate);
            // Without a date at all it is not "still running" just because nothing was said: the entry then fails the period rule like a form
            var current = e.IsCurrent ?? (end is null && T(e.StartDate) is not null);
            educations.Add(new EducationRequest(T(e.StudyType), T(e.Area), T(e.Institution), T(e.City), T(e.Country), Month(e.StartDate),
                current ? null : end, current, T(e.Score), description, educations.Count));
        }

        var skills = new List<SkillRequest>();
        foreach (var s in resume.Skills ?? [])
        {
            if (T(s.Name) is null && T(s.Level) is null && !(s.Keywords?.Any(k => T(k) is not null) ?? false)) continue;
            // The rating is the stored number; from other tools the word is mapped, and what it does not know counts as "not rated"
            var level = s.NumericLevel ?? SkillLevels.FirstOrDefault(l => l.Label == T(s.Level)?.ToLowerInvariant()).Level;
            skills.Add(new SkillRequest(T(s.Name), T(s.Keywords?.FirstOrDefault(k => T(k) is not null)), level, skills.Count));
        }

        var languages = new List<LanguageRequest>();
        foreach (var l in resume.Languages ?? [])
        {
            if (T(l.Language) is null && T(l.Fluency) is null) continue;
            languages.Add(new LanguageRequest(T(l.Language), T(l.Fluency), languages.Count));
        }

        var certificates = new List<CertificateRequest>();
        foreach (var c in resume.Certificates ?? [])
        {
            if (T(c.Name) is null && T(c.Issuer) is null && T(c.Date) is null && T(c.Url) is null) continue;
            certificates.Add(new CertificateRequest(T(c.Name), T(c.Issuer), T(c.Date), T(c.ExpiryDate), T(c.Url), T(c.CredentialId), certificates.Count));
        }

        var interests = new List<InterestRequest>();
        foreach (var i in resume.Interests ?? [])
        {
            if (T(i.Name) is null && T(i.Category) is null && T(i.Description) is null) continue;
            var category = T(i.Category) ?? T(i.Keywords?.FirstOrDefault(k => T(k) is not null));
            interests.Add(new InterestRequest(T(i.Name), category, T(i.Description), interests.Count));
        }

        List<(CustomSectionRequest, IReadOnlyList<CustomSectionItemRequest>)>? sections = null;
        if (resume.Meta?.CustomSections is { } fileSections)
        {
            sections = [];
            foreach (var section in fileSections)
            {
                var items = new List<CustomSectionItemRequest>();
                foreach (var item in section.Items ?? [])
                {
                    items.Add(new CustomSectionItemRequest(T(item.Title), T(item.Subtitle), T(item.DateRange), T(item.Description), items.Count));
                }
                sections.Add((new CustomSectionRequest(T(section.Title), sections.Count), items));
            }
        }

        return new ImportPlan(nameGiven, personal, experiences, educations, skills, languages, certificates, interests, sections);
    }

    /// <summary>Stores a file that passed <see cref="JsonResumeValidator"/>. The profile keeps what the file does not mention.</summary>
    public static void ApplyJsonResume(AppDbContext db, UserProfile profile, JsonResumeDto resume, TimeProvider time, bool replaceExisting = false)
    {
        var now = time.GetUtcNow().UtcDateTime;
        var plan = Plan(resume);
        var p = plan.Personal;

        if (plan.NameGiven)
        {
            profile.FirstName = p.FirstName ?? string.Empty;
            profile.LastName = p.LastName ?? string.Empty;
        }
        if (p.AcademicTitle is not null) profile.AcademicTitle = p.AcademicTitle;
        if (p.ProfessionalTitle is not null) profile.ProfessionalTitle = p.ProfessionalTitle;
        if (p.Email is not null) profile.Email = p.Email;
        if (p.Phone is not null) profile.Phone = p.Phone;
        if (p.Street is not null) profile.Street = p.Street;
        if (p.PostalCode is not null) profile.PostalCode = p.PostalCode;
        if (p.City is not null) profile.City = p.City;
        if (p.Country is not null) profile.Country = p.Country;
        if (p.DateOfBirth is not null) profile.DateOfBirth = p.DateOfBirth;
        if (p.PlaceOfBirth is not null) profile.PlaceOfBirth = p.PlaceOfBirth;
        if (p.Nationality is not null) profile.Nationality = p.Nationality;
        if (p.MaritalStatus is not null) profile.MaritalStatus = p.MaritalStatus;
        if (p.Website is not null) profile.Website = p.Website;
        if (p.LinkedIn is not null) profile.LinkedIn = p.LinkedIn;
        if (p.GitHub is not null) profile.GitHub = p.GitHub;
        if (p.Xing is not null) profile.Xing = p.Xing;
        if (p.Bio is not null) profile.Bio = p.Bio;

        if (replaceExisting)
        {
            db.Experiences.RemoveRange(profile.Experiences);
            profile.Experiences.Clear();
            db.Educations.RemoveRange(profile.Educations);
            profile.Educations.Clear();
            db.Skills.RemoveRange(profile.Skills);
            profile.Skills.Clear();
            db.Languages.RemoveRange(profile.Languages);
            profile.Languages.Clear();
            db.Certificates.RemoveRange(profile.Certificates);
            profile.Certificates.Clear();
            db.Interests.RemoveRange(profile.Interests);
            profile.Interests.Clear();
            // Own sections only exist in files from this program; a file from another tool must not wipe them
            if (plan.CustomSections is not null)
            {
                db.CustomSections.RemoveRange(profile.CustomSections);
                profile.CustomSections.Clear();
            }
        }

        var order = profile.Experiences.Count;
        foreach (var e in plan.Experiences)
        {
            db.Experiences.Add(new Experience
            {
                Id = Guid.NewGuid(),
                ProfileId = profile.Id,
                JobTitle = e.JobTitle!,
                Employer = e.Employer!,
                EmploymentType = e.EmploymentType,
                City = e.City,
                Country = e.Country,
                StartDate = e.StartDate!,
                EndDate = e.EndDate,
                IsCurrent = e.IsCurrent,
                Description = e.Description,
                SortOrder = order++,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        order = profile.Educations.Count;
        foreach (var e in plan.Educations)
        {
            db.Educations.Add(new Education
            {
                Id = Guid.NewGuid(),
                ProfileId = profile.Id,
                Degree = e.Degree!,
                FieldOfStudy = e.FieldOfStudy,
                Institution = e.Institution!,
                City = e.City,
                Country = e.Country,
                StartDate = e.StartDate ?? "",
                EndDate = e.EndDate,
                IsCurrent = e.IsCurrent,
                Grade = e.Grade,
                Description = e.Description,
                SortOrder = order++,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        order = profile.Skills.Count;
        foreach (var s in plan.Skills)
        {
            db.Skills.Add(new Skill
            {
                Id = Guid.NewGuid(),
                ProfileId = profile.Id,
                Name = s.Name!,
                Category = s.Category,
                Level = s.Level,
                SortOrder = order++,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        order = profile.Languages.Count;
        foreach (var l in plan.Languages)
        {
            db.Languages.Add(new LanguageSkill
            {
                Id = Guid.NewGuid(),
                ProfileId = profile.Id,
                Language = l.Language!,
                Level = l.Level!,
                SortOrder = order++,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        order = profile.Certificates.Count;
        foreach (var c in plan.Certificates)
        {
            db.Certificates.Add(new Certificate
            {
                Id = Guid.NewGuid(),
                ProfileId = profile.Id,
                Title = c.Title!,
                Issuer = c.Issuer,
                IssueDate = c.IssueDate,
                ExpiryDate = c.ExpiryDate,
                CredentialUrl = c.CredentialUrl,
                CredentialId = c.CredentialId,
                SortOrder = order++,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        order = profile.Interests.Count;
        foreach (var i in plan.Interests)
        {
            db.Interests.Add(new Interest
            {
                Id = Guid.NewGuid(),
                ProfileId = profile.Id,
                Name = i.Name!,
                Category = i.Category,
                Description = i.Description,
                SortOrder = order++,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }

        if (plan.CustomSections is { } sections)
        {
            order = profile.CustomSections.Count;
            foreach (var (section, items) in sections)
            {
                var entity = new CustomSection
                {
                    Id = Guid.NewGuid(),
                    ProfileId = profile.Id,
                    Title = section.Title!,
                    SortOrder = order++,
                    CreatedAt = now,
                    UpdatedAt = now,
                };
                var itemOrder = 0;
                foreach (var item in items)
                {
                    entity.Items.Add(new CustomSectionItem
                    {
                        Id = Guid.NewGuid(),
                        SectionId = entity.Id,
                        Title = item.Title!,
                        Subtitle = item.Subtitle,
                        DateRange = item.DateRange,
                        Description = item.Description,
                        SortOrder = itemOrder++,
                        CreatedAt = now,
                        UpdatedAt = now,
                    });
                }
                db.CustomSections.Add(entity);
            }
        }

        profile.UpdatedAt = now;
    }
}
