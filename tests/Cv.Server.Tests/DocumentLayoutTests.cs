// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using Cv.Server.Controllers;
using Cv.Server.Documents;
using Cv.Server.Tests.Support;

namespace Cv.Server.Tests;

/// <summary>
/// Page layout of the cover letter and the cover sheet: how many pages a normal letter takes, what may stand alone on a page, and that
/// the cover sheet is always one page. Reads the real PDFs (text and position) with the bundled fonts only.
/// </summary>
public sealed class DocumentLayoutTests : IDisposable
{
    private readonly TypstRenderer _renderer = new();
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cv-layout-tests", Guid.NewGuid().ToString("N"));

    public DocumentLayoutTests() => Directory.CreateDirectory(_dir);

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); }
        catch (IOException) { /* temp folder */ }
    }

    private static readonly string[] GermanSentences =
    [
        "Ihre Anzeige beschreibt eine Aufgabe, die ich seit Jahren von der anderen Seite des Verhandlungstisches kenne: Lieferanten so zu steuern, dass Preis, Qualität und Termin zusammenpassen.",
        "Heute leite ich als Teamleiterin Disposition bei der Musterland Logistik GmbH die Beschaffungstransporte für rund 40 Lieferanten.",
        "Den Wechsel in den Einkauf habe ich nicht spontan beschlossen, sondern seit zwei Jahren vorbereitet.",
        "Bei vielen Preis- und Terminverhandlungen, die ich vorbereitet habe, fiel die Entscheidung im Einkauf, auf Basis von Zahlen, die ich geliefert hatte.",
        "Genau diese Entscheidung möchte ich künftig selbst treffen und Lieferantenbeziehungen langfristig aufbauen.",
        "Die Logistik bleibt dabei mein Fundament: Was ein unpünktlicher Lieferant kostet, weiß ich aus erster Hand.",
        "Bei der Neuausschreibung unserer Paketdienste habe ich die Angebote verglichen und die Verhandlungen geführt; die Kosten je Sendung sanken um 9 Prozent bei gleicher Zustellquote.",
        "Mit einem von mir aufgebauten Kennzahlenbericht stieg die Pünktlichkeit unserer zwei wichtigsten Lieferanten innerhalb eines Jahres von 87 auf 96 Prozent.",
        "Zu Brunnenhof passt das, weil Sie Ihre Möbel überwiegend mit Zulieferern aus der Region fertigen und deren Zahl künftig bündeln wollen.",
        "In den ersten Monaten möchte ich die Lieferantenbewertung auf eine einheitliche Grundlage stellen und die zehn größten Warengruppen auf Preis- und Terminrisiken prüfen.",
        "Ich kann zum 1. April 2027 bei Ihnen beginnen; meine Kündigungsfrist beträgt drei Monate.",
    ];

    private static readonly string[] EnglishSentences =
    [
        "Your advertisement describes a task I have known for years from the other side of the negotiating table: steering suppliers so that price, quality and delivery date fit together.",
        "Today I lead the dispatch team at Musterland Logistics and manage the procurement transport for around 40 suppliers.",
        "I did not decide on the move into purchasing on a whim, but have been preparing for it for two years.",
        "In many price and schedule negotiations that I prepared, the decision was made in purchasing, based on figures that I had supplied.",
        "This is exactly the decision I would like to make myself in future while building supplier relationships for the long term.",
        "Logistics remains my foundation: what an unreliable supplier costs, I know first hand.",
        "When our parcel services were put out to tender again, I compared the offers and led the negotiations; the cost per shipment fell by 9 percent at the same delivery rate.",
        "With a reporting tool I set up, the punctuality of our two most important suppliers rose within a year from 87 to 96 percent.",
        "That fits Brunnenhof because you build your furniture mostly with regional suppliers and want to bundle their number in future.",
        "In the first months I would like to put the supplier rating on a uniform basis and check the ten largest product groups for price and schedule risks.",
        "I can start with you on 1 April 2027; my notice period is three months.",
    ];

    /// <summary>A body of exactly <paramref name="words"/> words in five paragraphs (the last ones shorter), made of real-length sentences.</summary>
    private static string Body(int words, string language)
    {
        var pool = language == "en" ? EnglishSentences : GermanSentences;
        var all = new List<string>();
        for (var i = 0; all.Count < words; i++) all.AddRange(pool[i % pool.Length].Split(' '));
        all = all.Take(words).ToList();
        var parts = new List<string>();
        var sizes = new[] { 0.22, 0.24, 0.24, 0.18, 0.12 };
        var at = 0;
        for (var i = 0; i < sizes.Length; i++)
        {
            var count = i == sizes.Length - 1 ? all.Count - at : (int)Math.Round(words * sizes[i]);
            parts.Add(string.Join(' ', all.Skip(at).Take(count)));
            at += count;
        }
        return string.Join("\n\n", parts.Where(p => p != ""));
    }

    /// <summary>A complete letter: sender with phone and e-mail, recipient with department, contact person, street and a foreign country.</summary>
    private static CoverLetterDto FullLetter(string language, int words, string? attachments = "Lebenslauf, Zeugnisse") =>
        DocumentSamples.Letter(subject: language == "en" ? "Application as Team Lead Purchasing (m/f/d), reference EK-2026-114" : "Bewerbung als Teamleiterin Einkauf (m/w/d), Kennziffer EK-2026-114", body: Body(words, language)) with
        {
            Language = language,
            SenderName = "Katharina Muster",
            SenderStreet = "Musterstraße 1",
            SenderPostalCode = "12345",
            SenderCity = "Musterstadt",
            SenderPhone = "+49 555 0123456",
            SenderEmail = "katharina.muster@example.org",
            RecipientCompany = "Brunnenhof Möbelwerke GmbH",
            RecipientDepartment = "Abteilung Einkauf und Beschaffung",
            RecipientContactPerson = language == "en" ? "Mr Jonas Lindner" : "Herr Jonas Lindner",
            RecipientStreet = "Industrieallee 7",
            RecipientPostalCode = "54321",
            RecipientCity = "Beispielstadt",
            RecipientCountry = language == "en" ? "Switzerland" : "Schweiz",
            Place = "Musterstadt",
            Date = "2026-11-09",
            Salutation = language == "en" ? "Dear Mr Lindner," : "Sehr geehrter Herr Lindner,",
            Closing = language == "en" ? "Sincerely," : "Mit freundlichen Grüßen",
            SignatureName = "Katharina Muster",
            AttachmentsNote = attachments,
        };

    /// <summary>A usual letter: company, contact person, street and town as the address (no department, no foreign country), with signature and note.</summary>
    private static CoverLetterDto NormalLetter(string language, int words) =>
        FullLetter(language, words) with { RecipientDepartment = null, RecipientCountry = null };

    private string Signature()
    {
        var path = Path.Combine(_dir, "unterschrift.png");
        File.WriteAllBytes(path, DocumentSamples.Png());
        return path;
    }

    private byte[] Letter(CoverLetterDto letter, string? font = null, bool signature = true) =>
        _renderer.RenderCoverLetterPdf(letter, new CoverLetterRenderOptions(font, null, letter.Language, true), signature ? Signature() : null);

    // ---------- cover letter: one page ----------

    [Theory]
    [InlineData("de", 250)]
    [InlineData("de", 330)]
    [InlineData("en", 250)]
    [InlineData("en", 330)]
    public void A_normal_letter_with_full_address_signature_and_attachments_fits_one_page(string language, int words)
    {
        var pdf = Letter(FullLetter(language, words));

        Assert.Equal(1, PdfText.PageCount(pdf));
        Assert.Contains("Katharina Muster", PdfText.All(pdf));
    }

    [Fact]
    public void The_widest_font_fits_a_normal_letter_up_to_the_words_it_can_hold()
    {
        // Every shipped font: the most words (German, full address, signature, attachments) that still give one page
        var capacity = new Dictionary<string, int>();
        foreach (var font in DocumentFonts.All)
        {
            var words = 150;
            while (words < 700 && PdfText.PageCount(Letter(FullLetter("de", words + 10), font.Family)) == 1) words += 10;
            capacity[font.Family] = words;
        }

        var report = string.Join(", ", capacity.OrderBy(c => c.Value).Select(c => $"{c.Key}={c.Value}"));
        Assert.True(capacity.Values.Min() >= 250, $"Not every font holds 250 words on one page: {report}");
        // The default font has to hold the whole range of a normal letter
        Assert.True(capacity[DocumentFonts.Default] >= 330, report);
    }

    // ---------- cover letter: nothing alone on a page ----------

    [Theory]
    [InlineData("de", 700)]
    [InlineData("de", 1000)]
    [InlineData("en", 760)]
    public void With_a_very_long_text_the_closing_does_not_stand_alone_on_the_last_page(string language, int words)
    {
        var pages = PdfText.Pages(Letter(FullLetter(language, words)));

        Assert.True(pages.Count >= 2);
        var last = pages[^1];
        // The last page carries more than greeting, signature and note: at least the end of the text
        var closing = language == "en" ? "Sincerely," : "Mit freundlichen Grüßen";
        Assert.Contains(closing, last);
        var beforeClosing = last[..last.IndexOf(closing, StringComparison.Ordinal)].Trim();
        Assert.True(beforeClosing.Split(' ').Length >= 8, $"Only the closing is on the last page: '{last}'");
    }

    [Fact]
    public void The_attachment_note_never_stands_alone_on_a_new_page()
    {
        // Search a length at which the page break falls right behind the signature: the note must then take the closing along
        for (var words = 380; words <= 520; words += 4)
        {
            var pages = PdfText.Pages(Letter(FullLetter("de", words)));
            if (pages.Count < 2) continue;

            var last = pages[^1];
            Assert.True(last.Contains("Mit freundlichen Grüßen", StringComparison.Ordinal), $"Page break leaves the note alone at {words} words: '{last}'");
        }
    }

    // ---------- cover letter: ragged right, no hyphenation ----------

    [Fact]
    public void No_word_is_split_and_nothing_sticks_out_over_the_right_margin()
    {
        var pdf = Letter(FullLetter("de", 330));
        var text = PdfText.All(pdf);

        // Words that were hyphenated before ("Verhandlungsti-sches"): a hyphen at the end of a line is a split word
        Assert.DoesNotContain("Verhandlungsti", text.Replace("Verhandlungstisches", ""));
        var lines = PdfText.Lines(pdf);
        Assert.DoesNotContain(lines, l => l.EndsWith('-') && !l.EndsWith("Preis-", StringComparison.Ordinal)); // "Preis- und Terminverhandlungen" is spelled with the hyphen
        // The right edge of the text area is 195 mm
        Assert.True(PdfText.RightmostMm(pdf) <= 195.5, $"Text reaches {PdfText.RightmostMm(pdf):0.0} mm");
    }

    // ---------- cover letter: airy first, tighter only when needed ----------

    [Theory]
    [InlineData("de")]
    [InlineData("en")]
    public void A_letter_of_about_260_words_is_set_airy_and_a_longer_one_tighter(string language)
    {
        var salutation = language == "en" ? "Dear" : "Sehr geehrter";
        var closing = language == "en" ? "Sincerely," : "Mit freundlichen";
        double Gap(int words) => PdfText.BaselineGaps(Letter(NormalLetter(language, words)), salutation, closing).Max();

        var airy = Gap(260);
        var tight = Gap(350);

        // A paragraph gap is a line plus the space between paragraphs; the airy one is clearly bigger
        Assert.True(airy >= tight + 4, $"260 words: {airy:0.0} pt, 350 words: {tight:0.0} pt");
        Assert.Equal(1, PdfText.PageCount(Letter(NormalLetter(language, 260))));
    }

    [Fact]
    public void An_airy_letter_has_normal_page_margins()
    {
        var pdf = Letter(NormalLetter("de", 260));

        // Right margin 20 mm (text ends at 190 mm at the latest)
        Assert.True(PdfText.RightmostMm(pdf) <= 190.5, $"Text reaches {PdfText.RightmostMm(pdf):0.0} mm");
    }

    // ---------- cover letter: attachment note ----------

    [Theory]
    [InlineData("de", "Anlagen", "Anlagen")]
    [InlineData("de", "anlagen:", "anlagen:")]
    [InlineData("en", "Attachments", "Attachments")]
    [InlineData("en", "Enclosures: CV", "Enclosures")]
    public void An_attachment_note_that_starts_with_the_heading_is_printed_once(string language, string note, string heading)
    {
        var text = PdfText.All(Letter(FullLetter(language, 120, note)));

        Assert.Equal(1, Count(text, heading));
    }

    [Theory]
    [InlineData("de", "Lebenslauf, Zeugnisse", "Anlagen")]
    [InlineData("en", "CV, references", "Attachments")]
    public void An_attachment_note_without_the_heading_gets_it_once(string language, string note, string heading)
    {
        var text = PdfText.All(Letter(FullLetter(language, 120, note)));

        Assert.Equal(1, Count(text, heading));
        Assert.Contains(note, text);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Without_an_attachment_note_nothing_about_attachments_is_printed(string? note)
    {
        var text = PdfText.All(Letter(FullLetter("de", 120, note)));

        Assert.DoesNotContain("Anlagen", text);
    }

    private static int Count(string text, string part, StringComparison comparison = StringComparison.OrdinalIgnoreCase)
    {
        var count = 0;
        for (var at = text.IndexOf(part, comparison); at >= 0; at = text.IndexOf(part, at + part.Length, comparison)) count++;
        return count;
    }

    // ---------- cover sheet ----------

    private static IReadOnlyList<string> Contents(int count, bool longTitles) =>
        [.. Enumerable.Range(1, count).Select(i => longTitles
            ? $"Zeugnis Geprüfte Fachwirtin für Güterverkehr und Logistik der Industrie- und Handelskammer Musterstadt, Nummer {i}"
            : i == 1 ? "Anschreiben" : i == 2 ? "Lebenslauf" : $"Zeugnis Musterfirma {i} GmbH")];

    private byte[] Sheet(int entries, string language, bool longTitles = false, bool photo = false)
    {
        var photoPath = Path.Combine(_dir, "foto.png");
        File.WriteAllBytes(photoPath, DocumentSamples.Png());
        var profile = DocumentSamples.Empty("Katharina", "Muster") with
        {
            ProfessionalTitle = "Teamleiterin Disposition und Beschaffungslogistik",
            Email = "katharina.muster@example.org",
            Phone = "+49 555 0123456",
            Street = "Musterstraße 1",
            PostalCode = "12345",
            City = "Musterstadt",
            Country = "Deutschland",
        };
        var options = new CoverSheetOptions("Teamleiterin Einkauf (m/w/d)", "Brunnenhof Möbelwerke GmbH", Contents(entries, longTitles), null, null, photo, "rounded", language);
        return _renderer.RenderCoverSheetPdf(profile, options, photo ? photoPath : null);
    }

    [Theory]
    [InlineData(1, "de")]
    [InlineData(7, "de")]
    [InlineData(12, "de")]
    [InlineData(1, "en")]
    [InlineData(7, "en")]
    [InlineData(12, "en")]
    public void The_cover_sheet_is_exactly_one_page(int entries, string language)
    {
        foreach (var photo in new[] { false, true })
        {
            var pdf = Sheet(entries, language, photo: photo);

            Assert.Equal(1, PdfText.PageCount(pdf));
            Assert.Contains(entries == 12 ? "Zeugnis Musterfirma 12 GmbH" : "Anschreiben", PdfText.All(pdf));
        }
    }

    [Theory]
    [InlineData(12, "de")]
    [InlineData(12, "en")]
    [InlineData(20, "de")]
    [InlineData(30, "en")]
    public void The_cover_sheet_stays_one_page_with_many_entries_and_long_titles(int entries, string language)
    {
        var pdf = Sheet(entries, language, longTitles: true, photo: true);

        Assert.Equal(1, PdfText.PageCount(pdf));
        Assert.Contains($"Nummer {entries}", PdfText.All(pdf));
    }

    [Theory]
    [InlineData("de", "BEWERBUNG")]
    [InlineData("en", "APPLICATION")]
    public void The_cover_sheet_heading_is_short_in_both_languages(string language, string heading)
    {
        var text = PdfText.All(Sheet(3, language));

        Assert.Contains(heading, text);
        Assert.DoesNotContain("DOSSIER", text);
    }

    [Fact]
    public void The_cover_sheet_labels_sit_at_the_top_next_to_a_multi_line_address()
    {
        var pdf = Sheet(3, "de");

        // "Adresse:" and the first address line ("Musterstraße 1") are on one baseline, not centred beside the three lines
        var lines = PdfText.Lines(pdf);
        Assert.Contains(lines, l => l.Contains("Adresse:") && l.Contains("Musterstraße 1"));
    }
}
