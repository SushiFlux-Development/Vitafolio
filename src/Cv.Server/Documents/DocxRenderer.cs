// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Controllers;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Cv.Server.Documents;

/// <summary>
/// Generates standard Open XML Word documents (.docx) for resumes and cover letters.
/// Word is one uniform layout (no choice between the three PDF designs) but carries the complete content of the profile. Compatible with
/// Microsoft Word, LibreOffice and Google Docs.
/// </summary>
public sealed class DocxRenderer
{
    private const int TwipsPerMm = 57; // 1 mm ~ 56.7 twips

    public byte[] RenderCvDocx(ProfileResponse profile, CvRenderOptions options)
    {
        using var stream = new MemoryStream();
        using (var wordDoc = WordprocessingDocument.Create(stream, WordprocessingDocumentType.Document, true))
        {
            var mainPart = wordDoc.AddMainDocumentPart();
            mainPart.Document = new Document();
            var body = mainPart.Document.AppendChild(new Body());

            var accentHex = ToWordColor(options.NormalizedAccentColor);
            var fontName = options.NormalizedFont;
            var isEn = options.NormalizedLanguage == "en";

            // Set document margins (20mm all around)
            var sectionProps = new SectionProperties();
            sectionProps.AppendChild(new PageMargin { Top = 20 * TwipsPerMm, Bottom = 20 * TwipsPerMm, Left = 20 * TwipsPerMm, Right = 20 * TwipsPerMm });

            // Name and title
            var fullName = JoinParts(" ", profile.AcademicTitle, profile.FirstName, profile.LastName);
            body.AppendChild(CreateParagraph(fullName, fontSize: 36, isBold: true, colorHex: accentHex, fontName: fontName, spaceAfter: 60));
            if (Has(profile.ProfessionalTitle))
            {
                body.AppendChild(CreateParagraph(profile.ProfessionalTitle, fontSize: 24, colorHex: "475569", fontName: fontName, spaceAfter: 120));
            }

            // Contact: one line for e-mail/phone/address, one for the links, one for the personal details
            var address = JoinParts(", ", profile.Street, JoinParts(" ", profile.PostalCode, profile.City), profile.Country);
            AddInfoLine(body, JoinParts("  •  ", profile.Email, profile.Phone, address), fontName, spaceAfter: 40);
            AddInfoLine(body, JoinParts("  •  ", profile.Website, profile.LinkedIn, profile.GitHub, profile.Xing), fontName, spaceAfter: 40);
            AddInfoLine(body, PersonalDetails(profile, isEn), fontName, spaceAfter: 200);

            // Bio / Summary
            if (Has(profile.Bio))
            {
                body.AppendChild(CreateSectionHeading(isEn ? "PROFESSIONAL SUMMARY" : "ÜBER MICH", accentHex, fontName));
                body.AppendChild(CreateParagraph(profile.Bio, fontSize: 20, fontName: fontName, spaceAfter: 160));
            }

            // Work Experience
            if (profile.Experiences.Count > 0)
            {
                body.AppendChild(CreateSectionHeading(isEn ? "WORK EXPERIENCE" : "BERUFSERFAHRUNG", accentHex, fontName));
                var table = CreateTwoColumnTable();
                foreach (var exp in profile.Experiences)
                {
                    var details = new List<Paragraph> { CreateParagraph(exp.JobTitle, fontSize: 21, isBold: true, colorHex: "0f172a", fontName: fontName, spaceAfter: 30) };
                    var employerLine = WithParen(JoinParts(", ", exp.Employer, exp.City), exp.EmploymentType);
                    if (employerLine.Length > 0) details.Add(CreateParagraph(employerLine, fontSize: 19, colorHex: "475569", fontName: fontName, spaceAfter: 40));
                    if (Has(exp.Description)) details.Add(CreateParagraph(exp.Description, fontSize: 19, colorHex: "334155", fontName: fontName, spaceAfter: 80));
                    table.AppendChild(CreateTableRow(Period(exp.StartDate, exp.EndDate, exp.IsCurrent, isEn), details, fontName));
                }
                body.AppendChild(table);
                body.AppendChild(CreateSpacer(120));
            }

            // Education
            if (profile.Educations.Count > 0)
            {
                body.AppendChild(CreateSectionHeading(isEn ? "EDUCATION" : "AUSBILDUNG & STUDIUM", accentHex, fontName));
                var table = CreateTwoColumnTable();
                foreach (var edu in profile.Educations)
                {
                    var details = new List<Paragraph>
                    {
                        CreateParagraph(JoinParts(" in ", edu.Degree, edu.FieldOfStudy), fontSize: 21, isBold: true, colorHex: "0f172a", fontName: fontName, spaceAfter: 30)
                    };
                    var grade = Has(edu.Grade) ? $"{(isEn ? "Grade" : "Note")}: {edu.Grade}" : "";
                    var instLine = WithParen(JoinParts(", ", edu.Institution, edu.City), grade);
                    if (instLine.Length > 0) details.Add(CreateParagraph(instLine, fontSize: 19, colorHex: "475569", fontName: fontName, spaceAfter: 40));
                    if (Has(edu.Description)) details.Add(CreateParagraph(edu.Description, fontSize: 19, colorHex: "334155", fontName: fontName, spaceAfter: 80));
                    table.AppendChild(CreateTableRow(Period(edu.StartDate, edu.EndDate, edu.IsCurrent, isEn), details, fontName));
                }
                body.AppendChild(table);
                body.AppendChild(CreateSpacer(120));
            }

            // Skills, grouped by category in the order they first appear (the same as in the PDF)
            if (profile.Skills.Count > 0)
            {
                body.AppendChild(CreateSectionHeading(isEn ? "SKILLS & COMPETENCES" : "FACHLICHE KOMPETENZEN", accentHex, fontName));
                var general = isEn ? "General" : "Allgemein";
                foreach (var group in profile.Skills.GroupBy(s => Has(s.Category) ? s.Category!.Trim() : general))
                {
                    var names = string.Join(", ", group.Select(s => s.Level > 0 ? $"{s.Name} ({s.Level}/5)" : s.Name).Where(Has));
                    var p = CreateParagraph($"{group.Key}: ", fontSize: 20, isBold: true, colorHex: "1e293b", fontName: fontName, spaceAfter: 60);
                    p.AppendChild(CreateRun(names, fontSize: 20, colorHex: "334155", fontName: fontName));
                    body.AppendChild(p);
                }
                body.AppendChild(CreateSpacer(80));
            }

            // Languages
            if (profile.Languages.Count > 0)
            {
                body.AppendChild(CreateSectionHeading(isEn ? "LANGUAGES" : "SPRACHEN", accentHex, fontName));
                var langList = string.Join("   •   ", profile.Languages.Select(l => WithParen(l.Language?.Trim() ?? "", LanguageLevel(l.Level, isEn))).Where(Has));
                body.AppendChild(CreateParagraph(langList, fontSize: 20, fontName: fontName, spaceAfter: 120));
            }

            // Certificates
            if (profile.Certificates.Count > 0)
            {
                body.AppendChild(CreateSectionHeading(isEn ? "CERTIFICATES" : "ZERTIFIKATE & WEITERBILDUNG", accentHex, fontName));
                foreach (var cert in profile.Certificates)
                {
                    var id = Has(cert.CredentialId) ? $"ID: {cert.CredentialId!.Trim()}" : "";
                    var certLine = JoinParts("  —  ", WithParen(cert.Title?.Trim() ?? "", cert.Issuer), DocumentDates.Format(cert.IssueDate, isEn), id);
                    body.AppendChild(CreateParagraph(certLine, fontSize: 20, fontName: fontName, spaceAfter: 50));
                }
                body.AppendChild(CreateSpacer(80));
            }

            // Interests
            if (profile.Interests.Count > 0)
            {
                body.AppendChild(CreateSectionHeading(isEn ? "INTERESTS" : "INTERESSEN & HOBBYS", accentHex, fontName));
                // Like the PDF: one line with bullets while no interest has a description, otherwise one paragraph per interest with
                // the name in bold, then ": " and the description
                var interests = profile.Interests
                    .Select(i => (Text: WithParen(i.Name?.Trim() ?? "", i.Category), Description: OneLine(i.Description)))
                    .Where(i => i.Text.Length > 0 || i.Description.Length > 0)
                    .ToList();
                if (interests.All(i => i.Description.Length == 0))
                {
                    body.AppendChild(CreateParagraph(string.Join("   •   ", interests.Select(i => i.Text)), fontSize: 20, fontName: fontName, spaceAfter: 120));
                }
                else
                {
                    foreach (var interest in interests)
                    {
                        var p = new Paragraph(new ParagraphProperties(new SpacingBetweenLines { After = "60" }));
                        if (interest.Text.Length > 0) p.AppendChild(CreateRun(interest.Description.Length > 0 ? $"{interest.Text}: " : interest.Text, fontSize: 20, isBold: true, fontName: fontName));
                        if (interest.Description.Length > 0) p.AppendChild(CreateRun(interest.Description, fontSize: 20, colorHex: "334155", fontName: fontName));
                        body.AppendChild(p);
                    }
                    body.AppendChild(CreateSpacer(60));
                }
            }

            // Own sections
            foreach (var section in profile.CustomSections)
            {
                body.AppendChild(CreateSectionHeading((Has(section.Title) ? section.Title : isEn ? "Custom Section" : "Zusatzabschnitt").ToUpperInvariant(), accentHex, fontName));
                if (section.Items.Count == 0) continue;
                var table = CreateTwoColumnTable();
                foreach (var item in section.Items)
                {
                    var details = new List<Paragraph>
                    {
                        CreateParagraph(JoinParts("  —  ", item.Title, item.Subtitle), fontSize: 21, isBold: true, colorHex: "0f172a", fontName: fontName, spaceAfter: 30)
                    };
                    if (Has(item.Description)) details.Add(CreateParagraph(item.Description, fontSize: 19, colorHex: "334155", fontName: fontName, spaceAfter: 80));
                    table.AppendChild(CreateTableRow(item.DateRange?.Trim() ?? "", details, fontName));
                }
                body.AppendChild(table);
                body.AppendChild(CreateSpacer(120));
            }

            body.AppendChild(sectionProps);
            mainPart.Document.Save();
        }

        return stream.ToArray();
    }

    public byte[] RenderCoverLetterDocx(CoverLetterDto coverLetter, CoverLetterRenderOptions options)
    {
        using var stream = new MemoryStream();
        using (var wordDoc = WordprocessingDocument.Create(stream, WordprocessingDocumentType.Document, true))
        {
            var mainPart = wordDoc.AddMainDocumentPart();
            mainPart.Document = new Document();
            var body = mainPart.Document.AppendChild(new Body());

            var accentHex = ToWordColor(options.NormalizedAccentColor);
            var fontName = options.NormalizedFont;

            var sectionProps = new SectionProperties();
            // DIN 5008: left margin 25 mm
            sectionProps.AppendChild(new PageMargin { Top = 20 * TwipsPerMm, Bottom = 20 * TwipsPerMm, Left = 25 * TwipsPerMm, Right = 20 * TwipsPerMm });

            // Sender at the top
            if (Has(coverLetter.SenderName))
            {
                body.AppendChild(CreateParagraph(coverLetter.SenderName, fontSize: 28, isBold: true, colorHex: accentHex, fontName: fontName, spaceAfter: 40));
            }
            var senderTown = JoinParts(" ", coverLetter.SenderPostalCode, coverLetter.SenderCity);
            var senderInfo = JoinParts("  •  ", coverLetter.SenderStreet, senderTown, coverLetter.SenderPhone, coverLetter.SenderEmail);
            if (senderInfo.Length > 0)
            {
                body.AppendChild(CreateParagraph(senderInfo, fontSize: 17, colorHex: "64748b", fontName: fontName, spaceAfter: 240));
            }

            // DIN 5008 return address line (small)
            var returnAddress = JoinParts(" • ", coverLetter.SenderName, coverLetter.SenderStreet, senderTown);
            if (returnAddress.Length > 0)
            {
                body.AppendChild(CreateParagraph(returnAddress, fontSize: 15, colorHex: "94a3b8", fontName: fontName, spaceAfter: 60));
            }

            // Recipient: only the lines that exist
            var country = coverLetter.RecipientCountry?.Trim() ?? "";
            var showCountry = country.Length > 0 && !country.Equals("Deutschland", StringComparison.OrdinalIgnoreCase) && !country.Equals("Germany", StringComparison.OrdinalIgnoreCase);
            var recipientLines = new List<(string Text, bool Bold)>
            {
                (coverLetter.RecipientCompany?.Trim() ?? "", true),
                (coverLetter.RecipientDepartment?.Trim() ?? "", false),
                (coverLetter.RecipientContactPerson?.Trim() ?? "", false),
                (coverLetter.RecipientStreet?.Trim() ?? "", false),
                (JoinParts(" ", coverLetter.RecipientPostalCode, coverLetter.RecipientCity), false),
                (showCountry ? country : "", false),
            };
            var recipientShown = recipientLines.Where(l => l.Text.Length > 0).ToList();
            for (var i = 0; i < recipientShown.Count; i++)
            {
                var last = i == recipientShown.Count - 1;
                body.AppendChild(CreateParagraph(recipientShown[i].Text, fontSize: 20, isBold: recipientShown[i].Bold, fontName: fontName, spaceAfter: last ? 200 : 20));
            }

            // Place and date, right aligned: both, or whichever exists
            var dateStr = JoinParts(", ", coverLetter.Place, DocumentDates.Format(coverLetter.Date, options.NormalizedLanguage == "en"));
            if (dateStr.Length > 0)
            {
                var dateP = CreateParagraph(dateStr, fontSize: 20, colorHex: "475569", fontName: fontName, spaceAfter: 200);
                dateP.ParagraphProperties ??= new ParagraphProperties();
                dateP.ParagraphProperties.Justification = new Justification { Val = JustificationValues.Right };
                body.AppendChild(dateP);
            }

            if (Has(coverLetter.Subject))
            {
                body.AppendChild(CreateParagraph(coverLetter.Subject, fontSize: 24, isBold: true, colorHex: accentHex, fontName: fontName, spaceAfter: 160));
            }
            if (Has(coverLetter.Salutation))
            {
                body.AppendChild(CreateParagraph(coverLetter.Salutation, fontSize: 21, isBold: true, fontName: fontName, spaceAfter: 120));
            }

            // Body: blank lines separate paragraphs, single line breaks stay line breaks
            var cleanBody = DocumentText.Clean(coverLetter.Body);
            foreach (var paragraph in cleanBody.Split("\n\n", StringSplitOptions.RemoveEmptyEntries))
            {
                var trimmed = paragraph.Trim();
                if (trimmed.Length > 0) body.AppendChild(CreateParagraph(trimmed, fontSize: 21, fontName: fontName, spaceAfter: 140));
            }

            if (Has(coverLetter.Closing))
            {
                body.AppendChild(CreateParagraph(coverLetter.Closing, fontSize: 21, fontName: fontName, spaceAfter: 280));
            }
            var sigName = Has(coverLetter.SignatureName) ? coverLetter.SignatureName : coverLetter.SenderName;
            if (Has(sigName))
            {
                body.AppendChild(CreateParagraph(sigName, fontSize: 21, isBold: true, fontName: fontName, spaceAfter: 240));
            }

            if (Has(coverLetter.AttachmentsNote))
            {
                body.AppendChild(CreateParagraph(options.NormalizedLanguage == "en" ? "Attachments" : "Anlagen", fontSize: 19, isBold: true, colorHex: "475569", fontName: fontName, spaceAfter: 40));
                body.AppendChild(CreateParagraph(coverLetter.AttachmentsNote, fontSize: 18, colorHex: "64748b", fontName: fontName, spaceAfter: 80));
            }

            body.AppendChild(sectionProps);
            mainPart.Document.Save();
        }

        return stream.ToArray();
    }

    // ---------- text rules (the same as in the PDF templates) ----------

    private static bool Has([System.Diagnostics.CodeAnalysis.NotNullWhen(true)] string? value) => !string.IsNullOrWhiteSpace(value);

    /// <summary>The non-empty, trimmed parts joined with a separator.</summary>
    internal static string JoinParts(string separator, params string?[] parts) =>
        string.Join(separator, parts.Where(Has).Select(p => p!.Trim()));

    /// <summary>
    /// The language level as stored by the app ("native" or a CEFR code like "C1") in the document language; free text stays as typed.
    /// The same rule as <c>language-level</c> in the PDF templates (lib.typ).
    /// </summary>
    internal static string LanguageLevel(string? level, bool english)
    {
        var trimmed = level?.Trim() ?? "";
        return trimmed.ToLowerInvariant() == "native" ? (english ? "Native speaker" : "Muttersprache") : trimmed;
    }

    /// <summary>Text on one line, trimmed: line breaks and runs of blanks become one space (the PDF sets such a description as running text).</summary>
    private static string OneLine(string? value) =>
        string.Join(" ", (value ?? "").Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    /// <summary>"base (extra)" - the brackets only when there is an extra text.</summary>
    internal static string WithParen(string baseText, string? extra)
    {
        var trimmed = baseText.Trim();
        if (!Has(extra)) return trimmed;
        return trimmed.Length == 0 ? $"({extra.Trim()})" : $"{trimmed} ({extra.Trim()})";
    }

    /// <summary>"01/2018 – 12/2021", "01/2022 – heute" for a current entry; one date alone (no dash) when the other is missing, "laufend" for a current entry without a start.</summary>
    internal static string Period(string? start, string? end, bool isCurrent, bool english) =>
        JoinParts(" – ", DocumentDates.Format(start, english),
            isCurrent ? (Has(start) ? (english ? "Present" : "heute") : (english ? "ongoing" : "laufend")) : DocumentDates.Format(end, english));

    private static string PersonalDetails(ProfileResponse p, bool english)
    {
        var parts = new List<string>();
        if (Has(p.DateOfBirth))
        {
            parts.Add((english ? "Born on " : "Geboren am ") + DocumentDates.Format(p.DateOfBirth.Trim(), english) + (Has(p.PlaceOfBirth) ? " in " + p.PlaceOfBirth.Trim() : ""));
        }
        else if (Has(p.PlaceOfBirth))
        {
            parts.Add((english ? "Place of birth: " : "Geburtsort: ") + p.PlaceOfBirth.Trim());
        }
        if (Has(p.Nationality)) parts.Add((english ? "Nationality: " : "Staatsangehörigkeit: ") + p.Nationality.Trim());
        if (Has(p.MaritalStatus)) parts.Add((english ? "Marital status: " : "Familienstand: ") + p.MaritalStatus.Trim());
        return string.Join("  |  ", parts);
    }

    /// <summary>Word colours are six hex digits; #rgb, #rgba and #rrggbbaa (valid in the PDF) are converted, the alpha part is dropped.</summary>
    internal static string ToWordColor(string hex)
    {
        var clean = hex.Trim().TrimStart('#');
        return clean.Length switch
        {
            3 or 4 => string.Concat(clean.Take(3).Select(c => $"{c}{c}")),
            6 or 8 => clean[..6],
            _ => "14213D",
        };
    }

    // ---------- Word building blocks ----------

    private static void AddInfoLine(Body body, string text, string fontName, int spaceAfter)
    {
        if (text.Length > 0) body.AppendChild(CreateParagraph(text, fontSize: 19, colorHex: "64748b", fontName: fontName, spaceAfter: spaceAfter));
    }

    private static Paragraph CreateSectionHeading(string title, string colorHex, string fontName)
    {
        var p = new Paragraph();
        p.AppendChild(new ParagraphProperties(
            new KeepNext(),
            new SpacingBetweenLines { Before = "240", After = "80" },
            new ParagraphBorders(new BottomBorder { Val = BorderValues.Single, Size = 6, Color = colorHex })));
        p.AppendChild(CreateRun(title, fontSize: 24, isBold: true, colorHex: colorHex, fontName: fontName));
        return p;
    }

    private static Paragraph CreateParagraph(string? text, int fontSize = 21, bool isBold = false, string? colorHex = null, string fontName = DocumentFonts.Default, int spaceAfter = 80)
    {
        var p = new Paragraph();
        p.AppendChild(new ParagraphProperties(new SpacingBetweenLines { After = spaceAfter.ToString() }));
        p.AppendChild(CreateRun(text, fontSize, isBold, colorHex, fontName));
        return p;
    }

    /// <summary>
    /// A run with the text. Line breaks in the text become real Word line breaks (a "\n" inside a Word text is just a space), and characters
    /// XML cannot hold are removed first - one stray control character would make the whole file unreadable.
    /// </summary>
    private static Run CreateRun(string? text, int fontSize = 21, bool isBold = false, string? colorHex = null, string fontName = DocumentFonts.Default)
    {
        var run = new Run();
        var rPr = new RunProperties(
            new RunFonts { Ascii = fontName, HighAnsi = fontName },
            new FontSize { Val = fontSize.ToString() });
        if (isBold) rPr.AppendChild(new Bold());
        if (!string.IsNullOrWhiteSpace(colorHex)) rPr.AppendChild(new Color { Val = colorHex });
        run.AppendChild(rPr);

        var lines = DocumentText.Clean(text).Split('\n');
        for (var i = 0; i < lines.Length; i++)
        {
            if (i > 0) run.AppendChild(new Break());
            run.AppendChild(new Text(lines[i]) { Space = SpaceProcessingModeValues.Preserve });
        }
        return run;
    }

    private static Paragraph CreateSpacer(int heightTwips)
    {
        var p = new Paragraph();
        p.AppendChild(new ParagraphProperties(new SpacingBetweenLines { After = heightTwips.ToString() }));
        return p;
    }

    private static Table CreateTwoColumnTable()
    {
        var table = new Table();
        table.AppendChild(new TableProperties(
            new TableWidth { Width = "5000", Type = TableWidthUnitValues.Pct },
            new TableBorders(
                new TopBorder { Val = BorderValues.None },
                new LeftBorder { Val = BorderValues.None },
                new RightBorder { Val = BorderValues.None },
                new BottomBorder { Val = BorderValues.None },
                new InsideHorizontalBorder { Val = BorderValues.None },
                new InsideVerticalBorder { Val = BorderValues.None })));
        return table;
    }

    private static TableRow CreateTableRow(string dateColumnText, IEnumerable<Paragraph> detailsParagraphs, string fontName)
    {
        var row = new TableRow();

        // Left column (date range, ~28% width)
        var dateCell = new TableCell();
        dateCell.AppendChild(new TableCellProperties(new TableCellWidth { Width = "1400", Type = TableWidthUnitValues.Pct }));
        dateCell.AppendChild(CreateParagraph(dateColumnText, fontSize: 19, isBold: true, colorHex: "475569", fontName: fontName, spaceAfter: 60));
        row.AppendChild(dateCell);

        // Right column (details, ~72% width)
        var detailsCell = new TableCell();
        detailsCell.AppendChild(new TableCellProperties(new TableCellWidth { Width = "3600", Type = TableWidthUnitValues.Pct }));
        foreach (var p in detailsParagraphs) detailsCell.AppendChild(p);
        row.AppendChild(detailsCell);

        return row;
    }
}
