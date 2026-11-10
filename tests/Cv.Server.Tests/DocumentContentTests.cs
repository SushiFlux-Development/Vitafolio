// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Controllers;
using Cv.Server.Documents;
using Cv.Server.Tests.Support;

namespace Cv.Server.Tests;

/// <summary>
/// Renders real documents and reads the text back out of the PDF: these tests check what a document says, not only that a PDF came out.
/// Fonts are the bundled ones only (the renderer does not look at the machine's fonts), so results are the same everywhere.
/// </summary>
public sealed class DocumentContentTests : IDisposable
{
    private static IReadOnlyList<string> Designs => DocumentDesigns.Ids;

    // Designs that list skills in a sidebar or a row: without any category they show no group title (the others say "General")
    private static readonly string[] FlatSkillDesigns = ["modern", "sidebar", "rail", "banner", "compact", "executive", "monogram"];

    private readonly TypstRenderer _renderer = new();
    private readonly string _data = Path.Combine(Path.GetTempPath(), "cv-doc-tests", Guid.NewGuid().ToString("N"));

    public DocumentContentTests() => Directory.CreateDirectory(Path.Combine(_data, "attachments"));

    public void Dispose()
    {
        try { Directory.Delete(_data, recursive: true); }
        catch (IOException) { /* temp folder */ }
    }

    private static CvRenderOptions Cv(string design, string language = "de", string? font = null, string? color = null) =>
        new(design, color, font, ShowPhoto: false, PhotoShape: null, language);

    private string Text(ProfileResponse profile, string design, string language = "de") =>
        PdfText.All(_renderer.RenderPdf(profile, Cv(design, language)));

    // ---------- missing and empty values ----------

    public static TheoryData<string, string> DesignsAndLanguages =>
        Build();

    private static TheoryData<string, string> Build()
    {
        var data = new TheoryData<string, string>();
        foreach (var design in Designs)
        {
            data.Add(design, "de");
            data.Add(design, "en");
        }
        return data;
    }

    [Theory]
    [MemberData(nameof(DesignsAndLanguages))]
    public void A_skill_without_a_category_renders_in_every_design(string design, string language)
    {
        // The category is null: it used to crash the Typst template ("cannot apply 'not in' to none and dictionary")
        var profile = DocumentSamples.Empty() with
        {
            Skills = [DocumentSamples.Skill("Rust", category: null, level: 4), DocumentSamples.Skill("Go", category: "Backend")],
        };

        var text = Text(profile, design, language);

        Assert.Contains("Rust", text);
        Assert.Contains("Go", text);
    }

    [Theory]
    [MemberData(nameof(DesignsAndLanguages))]
    public void Skills_without_a_category_are_grouped_under_General(string design, string language)
    {
        if (FlatSkillDesigns.Contains(design)) return;

        var profile = DocumentSamples.Empty() with { Skills = [DocumentSamples.Skill("Rust")] };

        Assert.Contains(language == "en" ? "General" : "Allgemein", Text(profile, design, language));
    }

    [Theory]
    [MemberData(nameof(DesignsAndLanguages))]
    public void Empty_optional_fields_leave_no_separators_or_brackets_behind(string design, string language)
    {
        foreach (var empty in new string?[] { null, "", "   " })
        {
            var profile = DocumentSamples.Empty() with
            {
                Experiences = [DocumentSamples.Experience(type: empty, city: empty, end: empty, description: empty)],
                Educations = [DocumentSamples.Education(field: empty, city: empty, end: empty, grade: empty, description: empty)],
                Certificates = [DocumentSamples.Certificate("Beispielzertifikat", "Stelle", issued: empty, credentialId: empty)],
                Interests = [DocumentSamples.Interest("Klettern", category: empty)],
                Languages = [DocumentSamples.Language("Deutsch", "Muttersprache")],
            };

            var text = Text(profile, design, language);

            Assert.Contains("Beispiel GmbH", text);
            Assert.DoesNotContain("GmbH,", text);
            Assert.DoesNotContain("()", text);
            Assert.DoesNotContain("(Note", text);
            Assert.DoesNotContain("(Grade", text);
            Assert.DoesNotContain("(ID", text);
            Assert.DoesNotContain("Berufsschule,", text);
            Assert.DoesNotContain("Fachinformatik –", text);
            Assert.DoesNotContain("01/2018 –", text);
            Assert.DoesNotContain("Klettern (", text);
            Assert.DoesNotContain("none", text, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Theory]
    [MemberData(nameof(DesignsAndLanguages))]
    public void Filled_optional_fields_show_with_their_separators(string design, string language)
    {
        var profile = DocumentSamples.Empty() with
        {
            Experiences = [DocumentSamples.Experience(type: "Vollzeit", city: "Köln", end: "2021-12")],
            Educations = [DocumentSamples.Education(field: "Informatik", city: "Aachen", end: "2020-06", grade: "1,3")],
        };

        var text = Text(profile, design, language);

        Assert.Contains("(Vollzeit)", text);
        Assert.Contains(language == "en" ? "(Grade: 1,3)" : "(Note: 1,3)", text);
        Assert.Contains("01/2018 – 12/2021", text);
    }

    [Theory]
    [MemberData(nameof(DesignsAndLanguages))]
    public void A_current_entry_ends_in_today_in_the_language_of_the_document(string design, string language)
    {
        var profile = DocumentSamples.Empty() with { Experiences = [DocumentSamples.Experience(start: "2022-01", current: true, end: "2099-01")] };

        var text = Text(profile, design, language);

        Assert.Contains(language == "en" ? "01/2022 – Present" : "01/2022 – heute", text);
        Assert.DoesNotContain("2099", text);
    }

    [Theory]
    [MemberData(nameof(DesignsAndLanguages))]
    public void Line_breaks_in_a_description_are_line_breaks_in_the_document(string design, string language)
    {
        var profile = DocumentSamples.Empty() with { Experiences = [DocumentSamples.Experience(description: "Zeile eins\nZeile zwei\r\nZeile drei")] };

        var lines = PdfText.Lines(_renderer.RenderPdf(profile, Cv(design, language)));

        Assert.Contains(lines, l => l.EndsWith("Zeile eins", StringComparison.Ordinal));
        Assert.Contains(lines, l => l.EndsWith("Zeile zwei", StringComparison.Ordinal));
        Assert.Contains(lines, l => l.EndsWith("Zeile drei", StringComparison.Ordinal));
    }

    [Fact]
    public void Control_characters_in_the_data_do_not_disturb_the_document()
    {
        var profile = DocumentSamples.Empty("Er\u0001ika", "Muster\u0000frau") with { Bio = "Hallo\u0007 Welt\u001b" };

        var text = Text(profile, "classic");

        Assert.Contains("Erika Musterfrau", text);
        Assert.Contains("Hallo Welt", text);
    }

    [Fact]
    public void Own_sections_appear_in_every_design()
    {
        var profile = DocumentSamples.Empty() with
        {
            CustomSections = [DocumentSamples.Section("Auszeichnungen", DocumentSamples.SectionItem("Best Paper", "Konferenz", "2021", "Für Container-Sicherheit."))],
        };

        foreach (var design in Designs)
        {
            var text = Text(profile, design);
            Assert.Contains("Auszeichnungen", text, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("Best Paper", text);
            Assert.Contains("Für Container-Sicherheit.", text);
        }
    }

    [Fact]
    public void Cover_letter_and_cover_sheet_survive_empty_values()
    {
        var letter = DocumentSamples.Letter() with { RecipientCity = "", Place = "", Date = "" , SenderStreet = null, SenderCity = null, SenderPostalCode = null };
        var letterText = PdfText.All(_renderer.RenderCoverLetterPdf(letter, new CoverLetterRenderOptions(null, null, "de", true)));
        Assert.Contains("Firma AG", letterText);
        Assert.Contains("Erster Absatz.", letterText);

        var sheet = PdfText.All(_renderer.RenderCoverSheetPdf(DocumentSamples.Empty(), new CoverSheetOptions(null, null, null, null, null, false, null, "en")));
        Assert.Contains("APPLICATION", sheet);
        Assert.DoesNotContain("E-Mail", sheet);
        Assert.DoesNotContain("-", sheet.Replace("Musterfrau", ""));
    }

    // ---------- dossier ----------

    private static DossierRenderOptions Dossier(string design, IReadOnlyList<DossierAttachmentItem>? attachments = null, string language = "de") =>
        new(design, null, null, ShowPhoto: false, PhotoShape: null, language, IncludeCoverSheet: true, TargetJob: "Entwicklerin", TargetCompany: "Firma AG", Contents: null, attachments);

    private ProfileResponse FullProfile() => DocumentSamples.Empty() with
    {
        ProfessionalTitle = "Entwicklerin",
        Email = "erika@example.org",
        Bio = "Eine kurze Beschreibung.",
        Experiences = [DocumentSamples.Experience(description: "Zeile eins\nZeile zwei")],
        Skills = [DocumentSamples.Skill("Rust")],
        Interests = [DocumentSamples.Interest("Klettern")],
        CustomSections = [DocumentSamples.Section("Auszeichnungen", DocumentSamples.SectionItem("Best Paper"))],
    };

    public static TheoryData<string> AllDesigns => new(DocumentDesigns.Ids);

    [Theory]
    [MemberData(nameof(AllDesigns))]
    public void The_dossier_contains_no_stray_pagebreak_text(string design)
    {
        var pdf = _renderer.RenderDossierPdf(FullProfile(), DocumentSamples.Letter(), Dossier(design));

        var pages = PdfText.Pages(pdf);

        Assert.DoesNotContain(pages, p => p.Contains("pagebreak", StringComparison.OrdinalIgnoreCase));
        // Cover sheet, cover letter and CV - and no page that only consists of a leftover
        Assert.All(pages, p => Assert.True(p.Length > 20, $"page is nearly empty: '{p}'"));
        Assert.Equal(3, pages.Count);
    }

    [Fact]
    public void The_dossier_uses_the_chosen_design()
    {
        var classic = PdfText.All(_renderer.RenderDossierPdf(FullProfile(), null, Dossier("classic")));
        var modern = PdfText.All(_renderer.RenderDossierPdf(FullProfile(), null, Dossier("modern")));
        var plain = PdfText.All(_renderer.RenderDossierPdf(FullProfile(), null, Dossier("plain")));

        Assert.Contains("KURZPROFIL", classic);
        Assert.DoesNotContain("KONTAKT", classic);

        Assert.Contains("KONTAKT", modern); // the sidebar only the modern design has
        Assert.Contains("PROFIL", modern);
        Assert.DoesNotContain("KURZPROFIL", modern);

        Assert.Contains("PROFIL", plain);
        Assert.DoesNotContain("KURZPROFIL", plain);
        Assert.DoesNotContain("KONTAKT", plain);
    }

    [Theory]
    [MemberData(nameof(AllDesigns))]
    public void The_dossier_has_the_same_cv_as_the_preview_with_every_section(string design)
    {
        var profile = FullProfile();
        var standalone = PdfText.All(_renderer.RenderPdf(profile, Cv(design)));
        var dossier = PdfText.All(_renderer.RenderDossierPdf(profile, null, Dossier(design)));

        // The stand-alone CV carries a page number in the footer; apart from that it is the same text
        var cv = standalone.EndsWith("1 / 1", StringComparison.Ordinal) ? standalone[..^"1 / 1".Length].TrimEnd() : standalone;
        Assert.Contains(cv, dossier);
        Assert.Contains("Klettern", dossier);
        Assert.Contains("Best Paper", dossier);
    }

    [Fact]
    public void The_cover_sheet_lists_only_what_the_dossier_contains()
    {
        var withLetter = PdfText.Pages(_renderer.RenderDossierPdf(FullProfile(), DocumentSamples.Letter(), Dossier("classic")))[0];
        var withoutLetter = PdfText.Pages(_renderer.RenderDossierPdf(FullProfile(), null, Dossier("classic")))[0];

        Assert.Contains("Anschreiben", withLetter);
        Assert.Contains("Lebenslauf", withLetter);
        Assert.DoesNotContain("Anschreiben", withoutLetter);
        Assert.Contains("Lebenslauf", withoutLetter);
        // No claim about documents that are not part of it
        Assert.DoesNotContain("Zeugnisse", withoutLetter);
    }

    private string WriteAttachment(string name, byte[] content)
    {
        File.WriteAllBytes(Path.Combine(_data, "attachments", name), content);
        return "attachments/" + name;
    }

    [Fact]
    public void A_multi_page_pdf_attachment_brings_in_all_its_pages()
    {
        var path = WriteAttachment("zeugnis.pdf", DocumentSamples.Pdf(pages: 3));
        var options = Dossier("classic", [new DossierAttachmentItem("Zeugnis", path, "application/pdf")]);

        var pdf = _renderer.RenderDossierPdf(FullProfile(), null, options, dataDirectory: _data);
        var pages = PdfText.Pages(pdf);

        Assert.Equal(2 + 3, pages.Count); // cover sheet, CV, three attachment pages
        Assert.Contains("Seite 1", pages[2]);
        Assert.Contains("Seite 2", pages[3]);
        Assert.Contains("Seite 3", pages[4]);
        Assert.Contains("Zeugnis (1 / 3)", pages[2]);
        Assert.Contains("Zeugnis (3 / 3)", pages[4]);
        // The attachment is listed on the cover sheet
        Assert.Contains("Zeugnis", pages[0]);
    }

    [Fact]
    public void An_image_attachment_takes_one_page()
    {
        var path = WriteAttachment("bild.png", DocumentSamples.Png());

        var pdf = _renderer.RenderDossierPdf(FullProfile(), null, Dossier("classic", [new("Zertifikat", path, "image/png")]), dataDirectory: _data);

        var pages = PdfText.Pages(pdf);
        Assert.Equal(3, pages.Count);
        Assert.Contains("Zertifikat", pages[2]);
    }

    [Theory]
    [InlineData("round")]
    [InlineData("rounded")]
    [InlineData("rect")]
    public void Photo_and_signature_come_from_the_data_folder_in_every_shape(string shape)
    {
        Directory.CreateDirectory(Path.Combine(_data, "photos"));
        Directory.CreateDirectory(Path.Combine(_data, "signatures"));
        var photo = Path.Combine(_data, "photos", "foto.png");
        var signature = Path.Combine(_data, "signatures", "unterschrift.png");
        File.WriteAllBytes(photo, DocumentSamples.Png());
        File.WriteAllBytes(signature, DocumentSamples.Png());
        var options = Dossier("classic") with { ShowPhoto = true, PhotoShape = shape };

        var pdf = _renderer.RenderDossierPdf(FullProfile(), DocumentSamples.Letter(), options, photo, signature, _data);

        // Cover sheet: photo; letter: signature; CV: photo
        Assert.Equal([1, 1, 1], PdfText.ImagesPerPage(pdf));
        // Photo off: no photo on the cover sheet and in the CV, the signature stays
        var withoutPhoto = _renderer.RenderDossierPdf(FullProfile(), DocumentSamples.Letter(), options with { ShowPhoto = false }, photo, signature, _data);
        Assert.Equal([0, 1, 0], PdfText.ImagesPerPage(withoutPhoto));
    }

    [Theory]
    [InlineData("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "bild.webp", "image/webp")]
    [InlineData("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "bild.png", "image/png")]
    public void Every_image_type_that_can_be_uploaded_can_be_embedded(string base64, string name, string type)
    {
        File.WriteAllBytes(Path.Combine(_data, "attachments", name), Convert.FromBase64String(base64));

        var check = _renderer.CheckAttachment(Path.Combine(_data, "attachments"), name, type);

        Assert.Equal(AttachmentCheckResult.Ok, check.Result);
    }

    [Fact]
    public void A_missing_attachment_does_not_break_the_dossier()
    {
        var good = WriteAttachment("gut.pdf", DocumentSamples.Pdf(pages: 2));
        var options = Dossier("classic",
        [
            new("Fehlt", "attachments/gibt-es-nicht.pdf", "application/pdf"),
            new("Ohne Datei", "", "application/pdf"),
            new("Gut", good, "application/pdf"),
        ]);

        var result = _renderer.RenderDossier(FullProfile(), null, options, dataDirectory: _data);
        var pages = PdfText.Pages(result.Pdf);

        Assert.Equal(["Fehlt", "Ohne Datei"], result.Problems);
        Assert.Equal(2 + 1 + 1 + 2, pages.Count); // cover sheet, CV, two note pages, the two real pages
        Assert.Contains(pages, p => p.Contains("Fehlt") && p.Contains("konnte nicht eingebunden werden"));
        Assert.Contains(pages, p => p.Contains("Seite 2"));
    }

    [Fact]
    public void A_damaged_attachment_is_replaced_by_a_note_and_the_rest_stays()
    {
        var damagedPdf = WriteAttachment("kaputt.pdf", "%PDF-1.4 das ist kein PDF"u8.ToArray());
        // Looks like a PNG by its name and type, but is none: the compiler fails on it, which exercises the retry without the bad file
        var damagedImage = WriteAttachment("kaputt.png", "kein Bild"u8.ToArray());
        var good = WriteAttachment("gut.pdf", DocumentSamples.Pdf());
        var options = Dossier("classic",
        [
            new("Defektes PDF", damagedPdf, "application/pdf"),
            new("Defektes Bild", damagedImage, "image/png"),
            new("Gut", good, "application/pdf"),
        ]);

        var result = _renderer.RenderDossier(FullProfile(), null, options, dataDirectory: _data);
        var pages = PdfText.Pages(result.Pdf);

        Assert.Equal(["Defektes PDF", "Defektes Bild"], result.Problems);
        Assert.Contains(pages, p => p.Contains("Defektes Bild") && p.Contains("konnte nicht eingebunden werden"));
        Assert.Contains(pages, p => p.Contains("Seite 1"));
    }

    [Fact]
    public void A_path_outside_the_data_folder_is_never_read()
    {
        var outside = Path.Combine(Path.GetDirectoryName(_data)!, "outside-" + Guid.NewGuid().ToString("N") + ".pdf");
        File.WriteAllBytes(outside, DocumentSamples.Pdf());
        try
        {
            var relative = "../" + Path.GetFileName(outside);
            var result = _renderer.RenderDossier(FullProfile(), null, Dossier("classic", [new("Draußen", relative, "application/pdf")]), dataDirectory: _data);

            Assert.Equal(["Draußen"], result.Problems);
            Assert.DoesNotContain("Seite 1", PdfText.All(result.Pdf));
        }
        finally
        {
            File.Delete(outside);
        }
    }

    // ---------- fonts ----------

    [Fact]
    public void Every_font_in_the_list_ships_with_all_four_styles_and_its_licence()
    {
        Assert.True(Directory.Exists(DocumentFonts.Directory), DocumentFonts.Directory);
        Assert.Empty(DocumentFonts.Missing());
        foreach (var font in DocumentFonts.All)
        {
            var folder = Path.Combine(DocumentFonts.Directory, font.Folder);
            Assert.True(File.Exists(Path.Combine(folder, "OFL.txt")), $"{font.Family}: licence text is missing");
            Assert.Equal(4, Directory.GetFiles(folder, "*.ttf").Length);
        }
    }

    [Fact]
    public void The_chosen_font_is_really_used_without_system_fonts()
    {
        foreach (var font in DocumentFonts.All)
        {
            var pdf = _renderer.RenderPdf(FullProfile(), Cv("classic", font: font.Family));

            var names = PdfText.FontNames(pdf);

            var expected = font.Family.Replace(" ", "");
            Assert.True(names.Count > 0 && names.All(n => n.StartsWith(expected, StringComparison.Ordinal)), $"{font.Family}: {string.Join(", ", names)}");
        }
    }

    [Fact]
    public void An_unknown_or_removed_font_falls_back_to_the_default()
    {
        foreach (var requested in new[] { "Papyrus", "Arial", "DejaVu Sans", "../../etc/passwd", "", null })
        {
            var names = PdfText.FontNames(_renderer.RenderPdf(FullProfile(), Cv("modern", font: requested)));

            Assert.All(names, n => Assert.StartsWith("LiberationSans", n, StringComparison.Ordinal));
        }
    }

    [Fact]
    public void Cover_letter_and_dossier_use_the_same_list_of_fonts()
    {
        var letter = _renderer.RenderCoverLetterPdf(DocumentSamples.Letter(), new CoverLetterRenderOptions("Merriweather", null, "de", true));
        Assert.All(PdfText.FontNames(letter), n => Assert.StartsWith("Merriweather", n, StringComparison.Ordinal));

        var options = Dossier("classic") with { Font = "Lora" };
        var dossier = _renderer.RenderDossierPdf(FullProfile(), DocumentSamples.Letter(), options);
        Assert.All(PdfText.FontNames(dossier), n => Assert.StartsWith("Lora", n, StringComparison.Ordinal));

        Assert.Equal("Roboto", new CoverLetterRenderOptions("roboto", null, null, null).NormalizedFont);
        Assert.Equal("Liberation Sans", new CoverLetterRenderOptions("DejaVu Serif", null, null, null).NormalizedFont);
    }

    // ---------- colours ----------

    [Theory]
    [InlineData("#abc", true)]
    [InlineData("#ABCD", true)]
    [InlineData("#14213D", true)]
    [InlineData("#14213d80", true)]
    [InlineData("14213D", false)]
    [InlineData("#12", false)]
    [InlineData("#12345", false)]
    [InlineData("#1234567", false)]
    [InlineData("#ggg", false)]
    [InlineData("red", false)]
    [InlineData("#14213D\n", false)]
    [InlineData(" #14213D", false)]
    [InlineData("#14213D; background: red", false)]
    [InlineData("", false)]
    public void Only_real_hex_colours_are_valid(string value, bool valid) => Assert.Equal(valid, DocumentText.IsHexColor(value));

    [Theory]
    [InlineData("#abc")]
    [InlineData("#abcd")]
    [InlineData("#aabbcc")]
    [InlineData("#aabbccdd")]
    public void Every_accepted_colour_renders(string color)
    {
        var pdf = _renderer.RenderPdf(FullProfile(), Cv("classic", color: color));

        Assert.Contains("Erika Musterfrau", PdfText.All(pdf));
    }

    [Fact]
    public void An_invalid_stored_colour_renders_with_the_default_instead_of_failing()
    {
        // Old rows may hold anything; the document must still render
        foreach (var bad in new[] { "red", "#12", "#zzzzzz", "\"); #panic(\"x\")" })
        {
            Assert.Contains("Erika", PdfText.All(_renderer.RenderPdf(FullProfile(), Cv("classic", color: bad))));
        }
        Assert.Equal("#14213D", new CvRenderOptions(null, "nonsense", null, null, null, null).NormalizedAccentColor);
        Assert.Equal("#aabbcc", new CvRenderOptions(null, "aabbcc", null, null, null, null).NormalizedAccentColor);
    }

    // ---------- Word ----------

    [Theory]
    [InlineData("#abc", "AABBCC")]
    [InlineData("#abcd", "AABBCC")]
    [InlineData("#aabbcc", "AABBCC")]
    [InlineData("#aabbccdd", "AABBCC")]
    public void Word_colours_are_six_hex_digits(string color, string expected) =>
        Assert.Equal(expected, DocxRenderer.ToWordColor(color).ToUpperInvariant());

    [Fact]
    public void Text_helpers_leave_no_separators_for_missing_parts()
    {
        Assert.Equal("Firma, Köln", DocxRenderer.JoinParts(", ", "Firma", null, "", "  ", "Köln"));
        Assert.Equal("Firma", DocxRenderer.WithParen("Firma", " "));
        Assert.Equal("Firma (Vollzeit)", DocxRenderer.WithParen("Firma", "Vollzeit"));
        Assert.Equal("01/2018", DocxRenderer.Period("2018-01", "", false, false));
        Assert.Equal("01/2018 – heute", DocxRenderer.Period("2018-01", "2020", true, false));
        Assert.Equal("01/2018 – Present", DocxRenderer.Period("2018-01", null, true, true));
    }
}
