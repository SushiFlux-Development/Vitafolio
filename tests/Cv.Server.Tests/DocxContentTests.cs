// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Controllers;
using Cv.Server.Documents;
using Cv.Server.Tests.Support;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Cv.Server.Tests;

/// <summary>Opens the generated Word files again and checks what is in them.</summary>
public sealed class DocxContentTests
{
    private readonly DocxRenderer _renderer = new();

    private static CvRenderOptions Options(string language = "de", string? color = null) =>
        new("classic", color, "Roboto", ShowPhoto: false, PhotoShape: null, language);

    private static Body Open(byte[] docx, out WordprocessingDocument document)
    {
        document = WordprocessingDocument.Open(new MemoryStream(docx), false);
        return document.MainDocumentPart!.Document!.Body!;
    }

    private static string TextOf(byte[] docx)
    {
        var body = Open(docx, out var document);
        using (document) return body.InnerText;
    }

    private static int BreaksIn(byte[] docx)
    {
        var body = Open(docx, out var document);
        using (document) return body.Descendants<Break>().Count();
    }

    private static ProfileResponse Full() => DocumentSamples.Empty() with
    {
        AcademicTitle = "Dr.",
        ProfessionalTitle = "Entwicklerin",
        Email = "erika@example.org",
        Phone = "+49 170 1234567",
        Street = "Musterstraße 42",
        PostalCode = "10115",
        City = "Berlin",
        Country = "Deutschland",
        DateOfBirth = "1990-05-14",
        PlaceOfBirth = "Hamburg",
        Nationality = "Deutsch",
        MaritalStatus = "Ledig",
        Website = "https://erika.example.org",
        LinkedIn = "https://linkedin.com/in/erika",
        GitHub = "https://github.com/erika",
        Xing = "https://xing.com/profile/erika",
        Bio = "Erste Zeile\nZweite Zeile",
        Experiences = [DocumentSamples.Experience(type: "Vollzeit", city: "Köln", description: "Punkt eins\nPunkt zwei")],
        Educations = [DocumentSamples.Education(field: "Informatik", grade: "1,3")],
        Skills = [DocumentSamples.Skill("Rust", "Backend", 4), DocumentSamples.Skill("Go")],
        Languages = [DocumentSamples.Language("Deutsch", "Muttersprache")],
        Certificates = [DocumentSamples.Certificate("AWS Architect", "Amazon", "2023-04", "AWS-12345")],
        Interests = [DocumentSamples.Interest("Klettern", "Sport")],
        CustomSections = [DocumentSamples.Section("Auszeichnungen", DocumentSamples.SectionItem("Best Paper", "Konferenz", "2021", "Für Container-Sicherheit."))],
    };

    [Fact]
    public void The_word_cv_carries_the_complete_profile()
    {
        var text = TextOf(_renderer.RenderCvDocx(Full(), Options()));

        // Own sections
        Assert.Contains("AUSZEICHNUNGEN", text);
        Assert.Contains("Best Paper", text);
        Assert.Contains("Für Container-Sicherheit.", text);
        // Contact fields: street, country, links, personal details
        Assert.Contains("Musterstraße 42", text);
        Assert.Contains("10115 Berlin", text);
        Assert.Contains("Deutschland", text);
        Assert.Contains("linkedin.com/in/erika", text);
        Assert.Contains("github.com/erika", text);
        Assert.Contains("xing.com/profile/erika", text);
        Assert.Contains("Geboren am 14.05.1990 in Hamburg", text);
        Assert.Contains("Staatsangehörigkeit: Deutsch", text);
        Assert.Contains("Familienstand: Ledig", text);
        // Employment type, grade, credential id, interest category, skill rating
        Assert.Contains("(Vollzeit)", text);
        Assert.Contains("(Note: 1,3)", text);
        Assert.Contains("ID: AWS-12345", text);
        Assert.Contains("Klettern (Sport)", text);
        Assert.Contains("Rust (4/5)", text);
        Assert.Contains("Dr. Erika Musterfrau", text);
    }

    [Fact]
    public void The_english_word_cv_speaks_english()
    {
        var text = TextOf(_renderer.RenderCvDocx(Full() with { Experiences = [DocumentSamples.Experience(start: "2022-01", current: true)] }, Options("en")));

        Assert.Contains("WORK EXPERIENCE", text);
        Assert.Contains("01/2022 – Present", text);
        Assert.Contains("Born on 14 May 1990 in Hamburg", text);
        Assert.Contains("(Grade: 1,3)", text);
        Assert.Contains("General", text);
    }

    private static List<string> ParagraphsOf(byte[] docx)
    {
        var body = Open(docx, out var document);
        using (document) return body.Descendants<Paragraph>().Select(p => p.InnerText).ToList();
    }

    [Theory]
    [InlineData("de", "native", "Deutsch (Muttersprache)")]
    [InlineData("en", "native", "Deutsch (Native speaker)")]
    [InlineData("de", "Native", "Deutsch (Muttersprache)")]
    [InlineData("en", " NATIVE ", "Deutsch (Native speaker)")]
    // A CEFR code and free text are shown as typed, in both languages
    [InlineData("de", "C1", "Deutsch (C1)")]
    [InlineData("en", "C1", "Deutsch (C1)")]
    [InlineData("de", "Muttersprache", "Deutsch (Muttersprache)")]
    [InlineData("en", "Muttersprache", "Deutsch (Muttersprache)")]
    [InlineData("de", "fließend in Wort und Schrift", "Deutsch (fließend in Wort und Schrift)")]
    public void The_stored_language_level_code_is_written_out_in_the_document_language(string language, string level, string expected)
    {
        var profile = DocumentSamples.Empty() with { Languages = [DocumentSamples.Language("Deutsch", level)] };

        var text = TextOf(_renderer.RenderCvDocx(profile, Options(language)));

        Assert.Contains(expected, text);
        Assert.DoesNotContain("(native)", text, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData("de")]
    [InlineData("en")]
    public void The_description_of_an_interest_is_in_the_word_file(string language)
    {
        var profile = DocumentSamples.Empty() with
        {
            Interests =
            [
                DocumentSamples.Interest("Klettern", "Sport", "Seit zehn Jahren\nam Wochenende"),
                DocumentSamples.Interest("Schach"),
            ],
        };

        var paragraphs = ParagraphsOf(_renderer.RenderCvDocx(profile, Options(language)));

        // The name (with its category) and the description in one paragraph, like in the PDF; an interest without one stands alone
        Assert.Contains("Klettern (Sport): Seit zehn Jahren am Wochenende", paragraphs);
        Assert.Contains("Schach", paragraphs);
    }

    [Fact]
    public void Interests_without_any_description_stay_one_line_and_a_description_alone_is_not_lost()
    {
        var plain = DocumentSamples.Empty() with { Interests = [DocumentSamples.Interest("Klettern", "Sport"), DocumentSamples.Interest("Schach")] };
        var onlyDescription = DocumentSamples.Empty() with { Interests = [DocumentSamples.Interest("", null, "Nur ein Text")] };

        Assert.Contains("Klettern (Sport)   •   Schach", ParagraphsOf(_renderer.RenderCvDocx(plain, Options())));
        Assert.Contains("Nur ein Text", ParagraphsOf(_renderer.RenderCvDocx(onlyDescription, Options())));
    }

    [Fact]
    public void Line_breaks_in_the_data_are_line_breaks_in_word()
    {
        var plain = _renderer.RenderCvDocx(DocumentSamples.Empty() with { Bio = "Eine Zeile" }, Options());
        var docx = _renderer.RenderCvDocx(Full(), Options());

        // Bio (1) + experience description (1) in the full profile, none without them
        Assert.Equal(0, BreaksIn(plain));
        Assert.Equal(2, BreaksIn(docx));
        var text = TextOf(docx);
        Assert.Contains("Erste Zeile", text);
        Assert.Contains("Zweite Zeile", text);
    }

    [Fact]
    public void Control_characters_do_not_make_the_word_file_unreadable()
    {
        var profile = DocumentSamples.Empty("Er\u0001ika", "Muster\u0000frau") with
        {
            Bio = "Hallo\u0007 Welt\u001b\u0008",
            Experiences = [DocumentSamples.Experience(description: "Zeile\u000b eins\u000c")],
        };

        var docx = _renderer.RenderCvDocx(profile, Options());
        var text = TextOf(docx); // opening it again would throw on invalid XML

        Assert.Contains("Erika Musterfrau", text);
        Assert.Contains("Hallo Welt", text);
        Assert.Contains("Zeile eins", text);
    }

    [Fact]
    public void An_empty_profile_gives_a_clean_word_cv_without_leftovers()
    {
        var profile = DocumentSamples.Empty() with
        {
            Experiences = [DocumentSamples.Experience(type: "", city: "", end: "", description: "")],
            Educations = [DocumentSamples.Education(field: "", city: "", end: "", grade: "")],
        };

        var text = TextOf(_renderer.RenderCvDocx(profile, Options()));

        Assert.DoesNotContain("()", text);
        Assert.DoesNotContain("Beispiel GmbH,", text);
        Assert.DoesNotContain("01/2018 –", text);
        Assert.DoesNotContain("Fachinformatik in", text);
        Assert.DoesNotContain("Note:", text);
    }

    [Theory]
    [InlineData("#abc")]
    [InlineData("#abcd")]
    [InlineData("#aabbccdd")]
    public void Short_and_alpha_colours_are_converted_for_word(string color)
    {
        using var stream = new MemoryStream(_renderer.RenderCvDocx(Full(), Options(color: color)));
        using var document = WordprocessingDocument.Open(stream, false);

        var colors = document.MainDocumentPart!.Document!.Body!.Descendants<Color>().Select(c => c.Val?.Value).Where(v => v is not null).ToList();

        Assert.Contains("AABBCC", colors.Select(c => c!.ToUpperInvariant()));
        Assert.All(colors, c => Assert.Equal(6, c!.Length));
    }

    [Fact]
    public void The_word_cover_letter_shows_the_place_when_the_date_is_empty()
    {
        var options = new CoverLetterRenderOptions(null, null, "de", true);

        var onlyPlace = TextOf(_renderer.RenderCoverLetterDocx(DocumentSamples.Letter(place: "Köln", date: ""), options));
        var both = TextOf(_renderer.RenderCoverLetterDocx(DocumentSamples.Letter(place: "Köln", date: "01.02.2026"), options));
        var onlyDate = TextOf(_renderer.RenderCoverLetterDocx(DocumentSamples.Letter(place: null, date: "01.02.2026"), options));

        Assert.Contains("Köln", onlyPlace);
        Assert.DoesNotContain("Köln,", onlyPlace);
        Assert.Contains("Köln, 01.02.2026", both);
        Assert.Contains("01.02.2026", onlyDate);
        Assert.DoesNotContain(", 01.02.2026", onlyDate);
    }

    [Fact]
    public void The_word_cover_letter_keeps_paragraphs_and_line_breaks_and_skips_empty_address_lines()
    {
        var letter = DocumentSamples.Letter(body: "Absatz eins\nzweite Zeile\n\nAbsatz zwei") with { RecipientCompany = "", RecipientCity = "" };

        var docx = _renderer.RenderCoverLetterDocx(letter, new CoverLetterRenderOptions(null, null, "de", true));
        var body = Open(docx, out var document);
        using (document)
        {
            Assert.Single(body.Descendants<Break>());
            var paragraphs = body.Descendants<Paragraph>().Select(p => p.InnerText).ToList();
            Assert.Contains(paragraphs, p => p == "Absatz eins" + "zweite Zeile");
            Assert.Contains("Absatz zwei", paragraphs);
            // No paragraph that is empty because a recipient field was empty
            Assert.DoesNotContain(paragraphs, string.IsNullOrWhiteSpace);
        }
    }
}
