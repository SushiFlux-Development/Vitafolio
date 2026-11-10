// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Errors;

namespace Cv.Server.Controllers;

/// <summary>
/// The rules of the profile forms - the single place. The form endpoints and the JSON Resume import both check the building blocks here, so
/// a file can never bring in something the forms would refuse. The numbers are the column widths of the database.
/// </summary>
public static class ProfileRules
{
    public const int MaxFirstName = 64;
    public const int MaxLastName = 64;

    public static void Personal(FieldErrors errors, PersonalDataRequest body)
    {
        InputRules.Required(errors, "firstName", body.FirstName, MaxFirstName);
        InputRules.Required(errors, "lastName", body.LastName, MaxLastName);
        InputRules.Optional(errors, "academicTitle", body.AcademicTitle, 32);
        InputRules.Optional(errors, "professionalTitle", body.ProfessionalTitle, 128);
        InputRules.Optional(errors, "email", body.Email, 128);
        InputRules.Optional(errors, "phone", body.Phone, 64);
        InputRules.Optional(errors, "street", body.Street, 128);
        InputRules.Optional(errors, "postalCode", body.PostalCode, 32);
        InputRules.Optional(errors, "city", body.City, 128);
        InputRules.Optional(errors, "country", body.Country, 64);
        InputRules.Optional(errors, "dateOfBirth", body.DateOfBirth, 32);
        InputRules.Optional(errors, "placeOfBirth", body.PlaceOfBirth, 128);
        InputRules.Optional(errors, "nationality", body.Nationality, 64);
        InputRules.Optional(errors, "maritalStatus", body.MaritalStatus, 64);
        InputRules.Link(errors, "website", body.Website, 256);
        InputRules.Link(errors, "linkedIn", body.LinkedIn, 256);
        InputRules.Link(errors, "gitHub", body.GitHub, 256);
        InputRules.Link(errors, "xing", body.Xing, 256);
        InputRules.Optional(errors, "bio", body.Bio, 4096);
    }

    /// <summary>Only lengths are checked; unknown values are normalised to the defaults, as in the render requests.</summary>
    public static void PreviewOptions(FieldErrors errors, PreviewOptionsRequest body)
    {
        InputRules.Optional(errors, "design", body.Design, 32);
        InputRules.Optional(errors, "language", body.Language, 32);
        InputRules.Optional(errors, "accentColor", body.AccentColor, 32);
        InputRules.Optional(errors, "font", body.Font, 64);
        InputRules.Optional(errors, "photoShape", body.PhotoShape, 32);
    }

    public static void Experience(FieldErrors errors, ExperienceRequest body)
    {
        InputRules.Required(errors, "jobTitle", body.JobTitle, 128);
        InputRules.Required(errors, "employer", body.Employer, 128);
        InputRules.Required(errors, "startDate", body.StartDate, 32);
        InputRules.Optional(errors, "employmentType", body.EmploymentType, 64);
        InputRules.Optional(errors, "city", body.City, 128);
        InputRules.Optional(errors, "country", body.Country, 64);
        InputRules.Optional(errors, "endDate", body.EndDate, 32);
        InputRules.Optional(errors, "description", body.Description, 4096);
    }

    public static void Education(FieldErrors errors, EducationRequest body)
    {
        InputRules.Required(errors, "degree", body.Degree, 128);
        InputRules.Required(errors, "institution", body.Institution, 128);
        // For school the year of graduation is enough: the period needs a beginning or an end (or "still running"), at least one of them
        InputRules.Optional(errors, "startDate", body.StartDate, 32);
        if (string.IsNullOrWhiteSpace(body.StartDate) && string.IsNullOrWhiteSpace(body.EndDate) && !body.IsCurrent)
        {
            errors.Add("startDate", "validation.period_required");
        }
        InputRules.Optional(errors, "fieldOfStudy", body.FieldOfStudy, 128);
        InputRules.Optional(errors, "city", body.City, 128);
        InputRules.Optional(errors, "country", body.Country, 64);
        InputRules.Optional(errors, "endDate", body.EndDate, 32);
        InputRules.Optional(errors, "grade", body.Grade, 32);
        InputRules.Optional(errors, "description", body.Description, 4096);
    }

    public static void Skill(FieldErrors errors, SkillRequest body)
    {
        InputRules.Required(errors, "name", body.Name, 128);
        InputRules.Optional(errors, "category", body.Category, 64);
        InputRules.Range(errors, "level", body.Level, 0, 5);
    }

    public static void Language(FieldErrors errors, LanguageRequest body)
    {
        InputRules.Required(errors, "language", body.Language, 64);
        InputRules.Required(errors, "level", body.Level, 32);
    }

    public static void Certificate(FieldErrors errors, CertificateRequest body)
    {
        InputRules.Required(errors, "title", body.Title, 128);
        InputRules.Optional(errors, "issuer", body.Issuer, 128);
        InputRules.Optional(errors, "issueDate", body.IssueDate, 32);
        InputRules.Optional(errors, "expiryDate", body.ExpiryDate, 32);
        InputRules.Link(errors, "credentialUrl", body.CredentialUrl, 256);
        InputRules.Optional(errors, "credentialId", body.CredentialId, 128);
    }

    public static void Interest(FieldErrors errors, InterestRequest body)
    {
        InputRules.Required(errors, "name", body.Name, 128);
        InputRules.Optional(errors, "category", body.Category, 64);
        InputRules.Optional(errors, "description", body.Description, 1024);
    }

    public static void CustomSection(FieldErrors errors, CustomSectionRequest body) =>
        InputRules.Required(errors, "title", body.Title, 128);

    public static void CustomSectionItem(FieldErrors errors, CustomSectionItemRequest body)
    {
        InputRules.Required(errors, "title", body.Title, 128);
        InputRules.Optional(errors, "subtitle", body.Subtitle, 128);
        InputRules.Optional(errors, "dateRange", body.DateRange, 64);
        InputRules.Optional(errors, "description", body.Description, 4096);
    }
}
