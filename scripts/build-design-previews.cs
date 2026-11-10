#!/usr/bin/env dotnet
#:project ../src/Cv.Server/Cv.Server.csproj
#:property PublishAot=false
#:property JsonSerializerIsReflectionEnabledByDefault=true
// Renders the preview pictures of the design gallery from the real templates with invented demo data, one PNG per design, and
// optionally a PDF per design plus an overview picture of all designs. The PNGs are committed, so a normal build needs none of this; run it
// again whenever a design changes:
//   dotnet run scripts/build-design-previews.cs -- frontend/public/designs [folder for the PDFs and the overview]
using System.Text;
using Cv.Server.Controllers;
using Cv.Server.Documents;
using typstsharp;

if (args.Length < 1)
{
    Console.Error.WriteLine("Aufruf: dotnet run scripts/build-design-previews.cs -- <zielordner-png> [ordner-pdf-und-uebersicht]");
    return 2;
}

var target = args[0];
Directory.CreateDirectory(target);
var extraFolder = args.Length > 1 ? args[1] : null;
if (extraFolder is not null) Directory.CreateDirectory(extraFolder);

// A neutral drawn portrait: no real person in any picture
var photoFolder = Path.Combine(Path.GetTempPath(), "vitafolio-design-previews-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(photoFolder);
var photoPath = Path.Combine(photoFolder, "photo.png");
var fonts = new Fonts(IncludeSystemFonts: false, FontPaths: [DocumentFonts.Directory]);
using (var drawing = TypstCompiler.FromSource("""
    #set page(width: 300pt, height: 400pt, margin: 0pt, fill: gradient.linear(rgb("#c9d6e3"), rgb("#9fb3c8"), angle: 90deg))
    #place(center + top, dy: 80pt, circle(radius: 75pt, fill: rgb("#e6bea0")))
    #place(center + top, dy: 70pt, ellipse(width: 180pt, height: 110pt, fill: rgb("#5b3a29")))
    #place(center + top, dy: 250pt, ellipse(width: 300pt, height: 300pt, fill: rgb("#20355a")))
    """, fonts: fonts, sysInputs: new Dictionary<string, string>(), root: null, packagePath: null, includeSystemPackages: false))
{
    File.WriteAllBytes(photoPath, drawing.CompilePng(ppi: 72)[0]);
}

var renderer = new TypstRenderer();
var profile = DemoProfile();
var overview = new List<(string Group, string Page)>();
foreach (var design in DocumentDesigns.All)
{
    var options = new CvRenderOptions(design.Id, "#1F4E79", DocumentFonts.Default, ShowPhoto: true, PhotoShape: "rounded", Language: "de");
    File.WriteAllBytes(Path.Combine(target, design.Id + ".png"), renderer.RenderFirstPagePng(profile, options, photoPath, ppi: 56));
    if (extraFolder is not null)
    {
        File.WriteAllBytes(Path.Combine(extraFolder, design.Id + ".pdf"), renderer.RenderPdf(profile, options, photoPath));
        var page = design.Id + ".png";
        File.WriteAllBytes(Path.Combine(photoFolder, page), renderer.RenderFirstPagePng(profile, options, photoPath, ppi: 65));
        overview.Add((design.Group, page));
    }
    Console.WriteLine(design.Id);
}

foreach (var (group, fileName) in new[] { (DocumentDesignGroups.Standard, "uebersicht.png"), (DocumentDesignGroups.Expressive, "ausdrucksstark-uebersicht.png") })
{
    if (extraFolder is null) break;
    var sheet = new StringBuilder("#set page(width: auto, height: auto, margin: 12pt, fill: rgb(\"#94a3b8\"))\n#set text(font: \"Liberation Sans\", size: 11pt, weight: \"bold\")\n#grid(columns: 4, gutter: 10pt,\n");
    foreach (var (_, page) in overview.Where(entry => entry.Group == group)) sheet.Append($"  [#image(\"{page}\", width: 537pt)],\n");
    sheet.Append(")\n");
    using var compiler = TypstCompiler.FromSource(sheet.ToString(), fonts: fonts, sysInputs: new Dictionary<string, string>(), root: photoFolder, packagePath: null, includeSystemPackages: false);
    File.WriteAllBytes(Path.Combine(extraFolder, fileName), compiler.CompilePng(ppi: 72)[0]);
}

Directory.Delete(photoFolder, recursive: true);
return 0;

static ProfileResponse DemoProfile()
{
    var now = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
    ExperienceDto Job(string title, string employer, string city, string start, string? end, bool current, string description) =>
        new(Guid.NewGuid(), title, employer, "Vollzeit", city, null, start, end, current, description, 0, now, now);
    EducationDto School(string degree, string field, string school, string city, string start, string end, string grade, string? description = null) =>
        new(Guid.NewGuid(), degree, field, school, city, null, start, end, false, grade, description, 0, now, now);
    SkillDto Skill(string name, string category, int level) => new(Guid.NewGuid(), name, category, level, 0, now, now);

    return new(
        Id: Guid.NewGuid(), FirstName: "Erika", LastName: "Mustermann", AcademicTitle: "Dr.", ProfessionalTitle: "Leiterin Softwareentwicklung",
        Email: "erika.mustermann@example.org", Phone: "+49 555 0100200", Street: "Musterweg 12", PostalCode: "12345", City: "Beispielstadt", Country: "Deutschland",
        DateOfBirth: "1985-09-20", PlaceOfBirth: "Köln", Nationality: "deutsch", MaritalStatus: null,
        Website: "https://erika.example.org", LinkedIn: "linkedin.example.org/erika", GitHub: null, Xing: null,
        Bio: "Erfahrene Softwareleiterin mit Schwerpunkt verteilte Systeme. Ich baue Teams auf, die zuverlässig liefern, und übersetze Unternehmensziele in eine technische Richtung, die alle verstehen.",
        HasPhoto: true, CreatedAt: now, UpdatedAt: now,
        Experiences:
        [
            Job("Leiterin Softwareentwicklung", "Beispiel Technik GmbH", "Köln", "2021-03", null, true,
                "Führung von vier Teams mit 28 Entwicklerinnen und Entwicklern\nEinführung einer gemeinsamen Plattform, Lieferzeit um 60 % gesenkt\nBudgetverantwortung über 3,2 Mio. € pro Jahr"),
            Job("Teamleiterin Backend", "Muster Software AG", "Bonn", "2016-01", "2021-02", false,
                "Verantwortung für die Zahlungsplattform mit 40 Millionen Buchungen pro Monat und der Umzug in die Cloud ohne Ausfallzeit."),
            Job("Softwareentwicklerin", "Probe Systeme KG", "Aachen", "2011-09", "2015-12", false, "Entwicklung von Datenbankdiensten für Kunden aus der Industrie."),
        ],
        Educations:
        [
            School("Promotion", "Informatik", "Beispiel-Universität", "Aachen", "2008-10", "2011-08", "magna cum laude"),
            School("Master of Science", "Informatik", "Beispiel-Universität", "Aachen", "2003-10", "2008-09", "1,3"),
        ],
        Skills: [Skill("C#", "Sprachen", 5), Skill("TypeScript", "Sprachen", 4), Skill("Rust", "Sprachen", 3), Skill("Team-Führung", "Führung", 5), Skill("Budgetplanung", "Führung", 4), Skill("Kubernetes", "Plattform", 4)],
        Languages: [new(Guid.NewGuid(), "Deutsch", "native", 0, now, now), new(Guid.NewGuid(), "Englisch", "C1", 0, now, now)],
        Certificates: [new(Guid.NewGuid(), "Zertifizierte Führungskraft", "IHK Beispielstadt", "2019-05", null, null, null, 0, now, now)],
        Interests: [new(Guid.NewGuid(), "Klettern", "Sport", null, 0, now, now), new(Guid.NewGuid(), "Open-Source-Arbeit", null, null, 0, now, now)],
        CustomSections: []);
}
