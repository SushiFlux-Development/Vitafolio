// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text.Json;
using System.Text.RegularExpressions;
using Cv.Server.Controllers;
using Cv.Server.Documents;
using Cv.Server.Tests.Support;

namespace Cv.Server.Tests;

/// <summary>The one list of CV designs and what every design has to hold: complete content, reading order, headings that stay with their content, and the shared rendering rules.</summary>
public sealed class DocumentDesignTests
{
    private readonly TypstRenderer _renderer = new();

    public static TheoryData<string> Designs => new(DocumentDesigns.Ids);

    // Text without any white space, lower case: a word can wrap in a narrow column or be set in capitals, which says nothing about the content
    private static string Flat(string text) => Regex.Replace(text, @"\s", "").ToLowerInvariant();

    private static CvRenderOptions Options(string design, string language = "de", string? color = null) =>
        new(design, color, null, ShowPhoto: false, PhotoShape: null, language);

    private static ProfileResponse RichProfile() => DocumentSamples.Empty() with
    {
        ProfessionalTitle = "Teamleiterin Logistik",
        Email = "erika@example.org",
        Phone = "+49 555 0100200",
        City = "Beispielstadt",
        Website = "https://erika.example.org",
        Bio = "Erfahrung in Lieferketten und Einkauf.",
        Experiences = [DocumentSamples.Experience("Teamleiterin Disposition", "Muster GmbH", "Vollzeit", "Musterstadt", "2020-01", "2024-06", description: "Aufgabe eins\nAufgabe zwei")],
        Educations = [DocumentSamples.Education("Fachwirtin", "Logistik", "Muster-Akademie", "Musterstadt", "2015-10", "2018-06", grade: "2,0")],
        Skills = [DocumentSamples.Skill("Excel", "Werkzeuge", 4), DocumentSamples.Skill("SAP", "Werkzeuge", 3)],
        Languages = [DocumentSamples.Language("Deutsch", "native"), DocumentSamples.Language("Englisch", "C1")],
        Certificates = [DocumentSamples.Certificate("Staplerschein", "IHK", "2019-05", "XY-1")],
        Interests = [DocumentSamples.Interest("Klettern", "Sport") with { Description = "Trainerin im Verein" }],
        CustomSections = [DocumentSamples.Section("Auszeichnungen", DocumentSamples.SectionItem("Bestpreis", "Fachmesse", "2021", "Für Lieferketten."))],
    };

    // ---------- the one list ----------

    [Fact]
    public void An_unknown_or_empty_design_falls_back_to_the_default()
    {
        Assert.Equal(DocumentDesigns.Default, DocumentDesigns.Normalize("bunt"));
        Assert.Equal(DocumentDesigns.Default, DocumentDesigns.Normalize("  "));
        Assert.Equal(DocumentDesigns.Default, DocumentDesigns.Normalize(null));
        Assert.Equal("plain", DocumentDesigns.Normalize("Schlicht"));
        Assert.Equal("modern", DocumentDesigns.Normalize(" Modern "));
        Assert.Equal("classic", new CvRenderOptions("gibt-es-nicht", null, null, null, null, null).NormalizedDesign);
        Assert.Equal("timeline", new DossierRenderOptions("TIMELINE", null, null, null, null, null, null, null, null, null).NormalizedDesign);
    }

    [Fact]
    public void Every_design_of_the_list_has_a_template_and_no_template_is_left_over()
    {
        var resources = typeof(DocumentDesigns).Assembly.GetManifestResourceNames();
        var designFiles = resources
            .Select(name => name.Replace("Cv.Server.Documents.Templates.", ""))
            .Where(name => name.StartsWith("cv_", StringComparison.Ordinal) && name.EndsWith(".typ", StringComparison.Ordinal))
            .Select(name => name["cv_".Length..^".typ".Length])
            .Where(name => name is not ("kit" or "render"))
            .OrderBy(name => name, StringComparer.Ordinal);

        Assert.Equal(DocumentDesigns.Ids.OrderBy(id => id, StringComparer.Ordinal), designFiles);
    }

    public static TheoryData<string> Languages => new("de", "en");

    [Theory]
    [MemberData(nameof(Languages))]
    public void The_web_ui_has_a_name_a_description_and_a_picture_for_exactly_the_designs_of_the_list(string language)
    {
        var root = ReleaseFiles.Root;
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "frontend", "src", "i18n", "locales", language + ".json")));
        var designs = document.RootElement.GetProperty("profile").GetProperty("preview").GetProperty("designs");

        var expected = DocumentDesigns.Ids.SelectMany(id => new[] { id, id + "Desc" }).OrderBy(k => k, StringComparer.Ordinal);
        var actual = designs.EnumerateObject().Select(p => p.Name).OrderBy(k => k, StringComparer.Ordinal);
        Assert.Equal(expected, actual);
        Assert.All(designs.EnumerateObject(), p => Assert.False(string.IsNullOrWhiteSpace(p.Value.GetString()), p.Name));
        Assert.All(DocumentDesigns.Ids, id => Assert.True(File.Exists(Path.Combine(root, "frontend", "public", "designs", id + ".png")), $"no preview picture for {id}"));

        var groups = document.RootElement.GetProperty("profile").GetProperty("preview").GetProperty("designGroups");
        Assert.All(DocumentDesigns.All.Select(d => d.Group).Distinct(), group => Assert.False(string.IsNullOrWhiteSpace(groups.GetProperty(group).GetString()), group));
    }

    // ---------- what every design holds ----------

    [Theory]
    [MemberData(nameof(Designs))]
    public void Everything_in_the_profile_is_in_the_document(string design)
    {
        var text = Flat(PdfText.StreamAll(_renderer.RenderPdf(RichProfile(), Options(design))));

        foreach (var expected in new[]
        {
            "Erika Musterfrau", "Teamleiterin Logistik", "erika@example.org", "+49 555 0100200", "erika.example.org",
            "Erfahrung in Lieferketten und Einkauf.", "Teamleiterin Disposition", "Muster GmbH", "(Vollzeit)", "01/2020 – 06/2024", "Aufgabe eins", "Aufgabe zwei",
            "Fachwirtin – Logistik", "Muster-Akademie", "(Note: 2,0)", "Excel", "SAP", "Deutsch", "Englisch", "Staplerschein", "IHK", "(ID: XY-1)",
            "Klettern (Sport)", "Trainerin im Verein", "Bestpreis", "Fachmesse", "Für Lieferketten.",
        })
        {
            Assert.Contains(Flat(expected), text);
        }
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void The_text_is_read_in_a_sensible_order(string design)
    {
        var stream = Flat(PdfText.StreamPages(_renderer.RenderPdf(RichProfile(), Options(design)))[0]);

        // The name comes first, sections stay in their order and the parts of an entry stay together
        int At(string value)
        {
            var index = stream.IndexOf(Flat(value), StringComparison.Ordinal);
            Assert.True(index >= 0, $"'{value}' is missing in {design}");
            return index;
        }

        Assert.True(At("Erika Musterfrau") < At("Berufserfahrung"), $"{design}: the name does not come before the career");
        Assert.True(At("Berufserfahrung") < At("Teamleiterin Disposition"));
        Assert.True(At("Teamleiterin Disposition") < At("Muster GmbH"));
        Assert.True(At("Muster GmbH") < At("Aufgabe eins"));
        Assert.True(At("Aufgabe eins") < At("Aufgabe zwei"));
        Assert.True(At("Berufserfahrung") < At("Muster-Akademie"));
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void A_section_heading_is_never_alone_at_the_end_of_a_page(string design)
    {
        // Longer and longer careers move the heading "Ausbildung" through every position on the page
        foreach (var jobs in Enumerable.Range(6, 15))
        {
            foreach (var extraLines in new[] { 0, 1 })
            {
                var description = string.Join("\n", Enumerable.Repeat("Eine Aufgabe in dieser Station", 2 + extraLines));
                var profile = DocumentSamples.Empty() with
                {
                    Experiences = [.. Enumerable.Range(0, jobs).Select(i => DocumentSamples.Experience("Station", employer: $"Arbeitgeber {i}", description: description))],
                    Educations = [DocumentSamples.Education("Fachinformatik")],
                };

                var pages = PdfText.StreamPages(_renderer.RenderPdf(profile, Options(design)));
                var page = pages.First(p => p.Contains("Ausbildung", StringComparison.OrdinalIgnoreCase));

                Assert.Contains("Fachinformatik", page);
            }
        }
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void The_lines_of_a_description_are_points_and_markers_the_user_typed_are_not_printed_twice(string design)
    {
        var profile = DocumentSamples.Empty() with
        {
            Experiences = [DocumentSamples.Experience(description: "- Erster Punkt\n• Zweiter Punkt\n* Dritter Punkt\nVierter Punkt")],
        };

        var pdf = _renderer.RenderPdf(profile, Options(design));
        var text = Flat(PdfText.StreamAll(pdf));

        foreach (var point in new[] { "Erster Punkt", "Zweiter Punkt", "Dritter Punkt", "Vierter Punkt" })
        {
            Assert.Contains(Flat("• " + point), text);
        }
        Assert.DoesNotContain("•-", text);
        Assert.DoesNotContain("••", text);
        Assert.DoesNotContain("•*", text);
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void One_line_of_description_stays_running_text(string design)
    {
        var profile = DocumentSamples.Empty() with { Experiences = [DocumentSamples.Experience(description: "Nur ein Satz ohne Aufzählung.")] };

        var text = Flat(PdfText.StreamAll(_renderer.RenderPdf(profile, Options(design))));

        Assert.Contains(Flat("Nur ein Satz ohne Aufzählung."), text);
        Assert.DoesNotContain("•", text);
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void A_stored_language_level_is_printed_in_the_language_of_the_document(string design)
    {
        var profile = DocumentSamples.Empty() with { Languages = [DocumentSamples.Language("Deutsch", "native"), DocumentSamples.Language("Latein", "Großes Latinum")] };

        var german = Flat(PdfText.StreamAll(_renderer.RenderPdf(profile, Options(design))));
        var english = Flat(PdfText.StreamAll(_renderer.RenderPdf(profile, Options(design, "en"))));

        Assert.Contains("muttersprache", german);
        Assert.DoesNotContain("native", german, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("nativespeaker", english);
        Assert.Contains(Flat("Großes Latinum"), german); // free text stays as typed
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void The_description_of_an_interest_is_printed(string design)
    {
        var profile = DocumentSamples.Empty() with { Interests = [DocumentSamples.Interest("Klettern", "Sport") with { Description = "Trainerin im Verein" }, DocumentSamples.Interest("Lesen")] };

        var text = Flat(PdfText.StreamAll(_renderer.RenderPdf(profile, Options(design))));

        Assert.Contains(Flat("Klettern (Sport)"), text);
        Assert.DoesNotContain(Flat("(Sport):"), text);
        Assert.Contains(Flat("Trainerin im Verein"), text);
        Assert.Contains("lesen", text);
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void No_skill_name_runs_into_its_level_marks(string design)
    {
        var profile = DocumentSamples.Empty() with
        {
            Skills =
            [
                DocumentSamples.Skill("Warenwirtschaftssysteme", "Fachkenntnisse", 4),
                DocumentSamples.Skill("Preis- und Vertragsverhandlung", "Fachkenntnisse", 5),
                DocumentSamples.Skill(new string('x', 120), "Fachkenntnisse", 3),
                DocumentSamples.Skill("Excel", "Methoden", 2),
            ],
        };

        Assert.Empty(PdfText.WordsOverlappingMarks(_renderer.RenderPdf(profile, Options(design))));
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void Postal_code_and_city_stay_together(string design)
    {
        var profile = RichProfile() with { Street = "Sehr lange Musterstraße am Rand der Stadt 12", PostalCode = "12345", City = "Beispielstadt", Country = "Deutschland" };

        Assert.Contains(PdfText.Lines(_renderer.RenderPdf(profile, Options(design))), line => line.Contains("12345 Beispielstadt", StringComparison.Ordinal));
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void A_long_certificate_title_leaves_no_dash_at_the_end_of_a_line(string design)
    {
        var profile = DocumentSamples.Empty() with
        {
            Certificates = [DocumentSamples.Certificate("Strategischer Einkauf und Lieferantenmanagement für internationale Beschaffungsmärkte", "Muster Akademie", "2025-09")],
        };

        var lines = PdfText.Lines(_renderer.RenderPdf(profile, Options(design)));

        Assert.Contains("Muster Akademie", string.Join(" ", lines));
        Assert.DoesNotContain(lines, line => line.TrimEnd().EndsWith('—'));
    }

    [Theory]
    [MemberData(nameof(Designs))]
    public void An_empty_profile_and_a_very_long_one_both_render(string design)
    {
        Assert.Contains("erika", Flat(PdfText.StreamAll(_renderer.RenderPdf(DocumentSamples.Empty(), Options(design)))));

        var longWord = new string('x', 200);
        var profile = DocumentSamples.Empty() with
        {
            ProfessionalTitle = longWord,
            Email = longWord + "@example.org",
            Bio = string.Join(' ', Enumerable.Repeat("Ein langer Text für die Profilbeschreibung.", 60)),
            Experiences = [.. Enumerable.Range(0, 30).Select(i => DocumentSamples.Experience($"Station {i}", description: string.Join("\n", Enumerable.Repeat("Noch eine lange Zeile mit einer Aufgabe darin.", 4))))],
            Skills = [DocumentSamples.Skill(longWord)],
        };

        var pdf = _renderer.RenderPdf(profile, Options(design));

        Assert.True(PdfText.PageCount(pdf) > 1);
        Assert.Contains("station29", Flat(PdfText.StreamAll(pdf)));
    }

    [Theory]
    [InlineData("#FEF08A")]
    [InlineData("#000000")]
    [InlineData("#F97316")]
    public void Light_and_dark_accent_colours_render_in_every_design(string color)
    {
        foreach (var design in DocumentDesigns.Ids)
        {
            var pdf = _renderer.RenderPdf(RichProfile(), Options(design, color: color));
            Assert.Contains("erika", Flat(PdfText.StreamAll(pdf)));
        }
    }

    // ---------- the shared photo frame: a round photo is a circle ----------

    [Theory]
    [MemberData(nameof(Designs))]
    public void A_design_renders_with_every_photo_shape(string design)
    {
        var folder = Path.Combine(Path.GetTempPath(), "cv-design-photo", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        try
        {
            var photo = Path.Combine(folder, "p.png");
            File.WriteAllBytes(photo, DocumentSamples.Png());
            foreach (var shape in new[] { "round", "rounded", "rect" })
            {
                var pdf = _renderer.RenderPdf(RichProfile(), new CvRenderOptions(design, null, null, true, shape, "de"), photo);
                Assert.Equal(1, PdfText.ImagesPerPage(pdf)[0]);
            }
        }
        finally
        {
            Directory.Delete(folder, recursive: true);
        }
    }
}
