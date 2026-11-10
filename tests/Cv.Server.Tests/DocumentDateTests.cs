// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Net;
using Cv.Server.Controllers;
using Cv.Server.Documents;
using Cv.Server.Tests.Support;
using DocumentFormat.OpenXml.Packaging;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Cv.Server.Data;

namespace Cv.Server.Tests;

/// <summary>Stored dates are ISO; PDF and Word write them by the document language. Text is read back out of the real files.</summary>
public sealed class DocumentDateTests
{
    private readonly TypstRenderer _pdf = new();
    private readonly DocxRenderer _docx = new();

    public static TheoryData<string> DocumentDesignNames => new(DocumentDesigns.Ids);

    private static CvRenderOptions Options(string design, string language) =>
        new(design, null, null, ShowPhoto: false, PhotoShape: null, language);

    private static string DocxText(byte[] docx)
    {
        using var document = WordprocessingDocument.Open(new MemoryStream(docx), false);
        return document.MainDocumentPart!.Document!.Body!.InnerText;
    }

    private static ProfileResponse Profile(string dob, string start, string? end, string issued) => DocumentSamples.Empty() with
    {
        DateOfBirth = dob,
        Experiences = [DocumentSamples.Experience(start: start, end: end)],
        Certificates = [DocumentSamples.Certificate("AWS Architect", issued: issued)],
    };

    [Theory]
    [InlineData("2018", false, "2018")]
    [InlineData("2018-01", false, "01/2018")]
    [InlineData("2018-01", true, "01/2018")]
    [InlineData("1985-09-20", false, "20.09.1985")]
    [InlineData("1985-09-20", true, "20 Sep 1985")]
    [InlineData("2024-02-29", true, "29 Feb 2024")]
    [InlineData("2023-02-29", false, "2023-02-29")] // not a real day
    [InlineData("2018-13", false, "2018-13")]
    [InlineData("März 2018", false, "März 2018")]
    [InlineData("01.02.2026", true, "01.02.2026")]
    [InlineData("", false, "")]
    public void Format_follows_the_document_language_and_keeps_everything_else(string input, bool english, string expected) =>
        Assert.Equal(expected, DocumentDates.Format(input, english));

    [Theory]
    [MemberData(nameof(DocumentDesignNames))]
    public void The_german_pdf_writes_month_year_and_full_dates_the_german_way(string design)
    {
        var text = PdfText.All(_pdf.RenderPdf(Profile("1985-09-20", "2018-01", "2021-12", "2023-04"), Options(design, "de")));

        Assert.Contains("01/2018 – 12/2021", text);
        Assert.Contains("20.09.1985", text);
        Assert.Contains("04/2023", text);
        Assert.DoesNotContain("2018-01", text);
        Assert.DoesNotContain("1985-09-20", text);
    }

    [Theory]
    [MemberData(nameof(DocumentDesignNames))]
    public void The_english_pdf_writes_month_year_and_full_dates_the_english_way(string design)
    {
        var text = PdfText.All(_pdf.RenderPdf(Profile("1985-09-20", "2018-01", "2021-12", "2023-04"), Options(design, "en")));

        Assert.Contains("01/2018 – 12/2021", text);
        Assert.Contains("20 Sep 1985", text);
        Assert.Contains("04/2023", text);
        Assert.DoesNotContain("1985-09-20", text);
    }

    [Fact]
    public void A_year_alone_stays_a_year_and_an_old_free_text_value_stays_as_typed_in_the_pdf()
    {
        var text = PdfText.All(_pdf.RenderPdf(Profile("Frühjahr 1985", "2018", "März 2021", "2023"), Options("classic", "de")));

        Assert.Contains("2018 – März 2021", text);
        Assert.Contains("Frühjahr 1985", text);
        Assert.Contains("2023", text);
    }

    [Fact]
    public void An_impossible_iso_date_stays_unchanged_in_the_pdf()
    {
        var text = PdfText.All(_pdf.RenderPdf(Profile("2023-02-30", "2018-13", null, "2023"), Options("classic", "de")));

        Assert.Contains("2023-02-30", text);
        Assert.Contains("2018-13", text);
    }

    [Theory]
    [InlineData("de", "01/2018 – 12/2021", "20.09.1985", "04/2023")]
    [InlineData("en", "01/2018 – 12/2021", "20 Sep 1985", "04/2023")]
    public void The_word_cv_writes_dates_by_the_document_language(string language, string period, string born, string certificate)
    {
        var text = DocxText(_docx.RenderCvDocx(Profile("1985-09-20", "2018-01", "2021-12", "2023-04"), Options("classic", language)));

        Assert.Contains(period, text);
        Assert.Contains(born, text);
        Assert.Contains(certificate, text);
        Assert.DoesNotContain("2018-01", text);
    }

    [Fact]
    public void The_word_cv_keeps_a_year_and_unreadable_old_values()
    {
        var text = DocxText(_docx.RenderCvDocx(Profile("Frühjahr 1985", "2018", "März 2021", "2023-02-30"), Options("classic", "de")));

        Assert.Contains("2018 – März 2021", text);
        Assert.Contains("Frühjahr 1985", text);
        Assert.Contains("2023-02-30", text);
    }

    [Theory]
    [InlineData("de", "Köln, 20.09.2026")]
    [InlineData("en", "Köln, 20 Sep 2026")]
    public void The_cover_letter_date_follows_the_language_in_pdf_and_word(string language, string expected)
    {
        var letter = DocumentSamples.Letter(date: "2026-09-20");

        var pdf = PdfText.All(_pdf.RenderCoverLetterPdf(letter, new CoverLetterRenderOptions(null, null, language, true)));
        var docx = DocxText(_docx.RenderCoverLetterDocx(letter, new CoverLetterRenderOptions(null, null, language, true)));

        Assert.Contains(expected, pdf);
        Assert.Contains(expected, docx);
    }

    [Fact]
    public void A_free_text_cover_letter_date_stays_unchanged()
    {
        var letter = DocumentSamples.Letter(date: "01.02.2026");

        Assert.Contains("Köln, 01.02.2026", PdfText.All(_pdf.RenderCoverLetterPdf(letter, new CoverLetterRenderOptions(null, null, "en", true))));
        Assert.Contains("Köln, 01.02.2026", DocxText(_docx.RenderCoverLetterDocx(letter, new CoverLetterRenderOptions(null, null, "en", true))));
    }
}

public sealed class DateFormatPreferenceTests(ServerFixture server) : IClassFixture<ServerFixture>
{
    [Fact]
    public async Task A_new_account_starts_with_auto_and_the_choice_is_saved_and_returned()
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "datum-nutzerin");

        var me = await (await user.GetAsync("/api/auth/me")).JsonAsync();
        Assert.Equal("auto", me.GetProperty("user").GetProperty("dateFormat").GetString());

        foreach (var value in new[] { "dmy", "ymd_slash", "iso", "auto" })
        {
            var response = await user.PutAsync("/api/account/preferences", new { dateFormat = value });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal(value, (await response.JsonAsync()).GetProperty("user").GetProperty("dateFormat").GetString());
        }
        await user.PutAsync("/api/account/preferences", new { dateFormat = "iso" });
        // Another preference does not reset it
        var other = await (await user.PutAsync("/api/account/preferences", new { theme = "dark" })).JsonAsync();
        Assert.Equal("iso", other.GetProperty("user").GetProperty("dateFormat").GetString());
        Assert.Equal("iso", (await (await user.GetAsync("/api/auth/me")).JsonAsync()).GetProperty("user").GetProperty("dateFormat").GetString());
    }

    [Theory]
    [InlineData("us")]
    [InlineData("DMY")]
    [InlineData("")]
    public async Task Unknown_values_are_refused_and_nothing_is_stored(string value)
    {
        var admin = await server.AdminAsync();
        var (user, _) = await server.UserAsync(admin, "datum-fehler-" + (value.Length == 0 ? "leer" : value.ToLowerInvariant()));

        var response = await user.PutAsync("/api/account/preferences", new { dateFormat = value });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("dateFormat", await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("auto", (await (await user.GetAsync("/api/auth/me")).JsonAsync()).GetProperty("user").GetProperty("dateFormat").GetString());
    }
}

public sealed class DateFormatMigrationTests : IDisposable
{
    private const string Previous = "20261108171715_AddCoverLetterFoldMarks";

    private readonly string _file = Path.Combine(Path.GetTempPath(), $"cv-migration-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var path in new[] { _file, _file + "-wal", _file + "-shm" }) File.Delete(path);
    }

    [Fact]
    public void Accounts_from_before_the_setting_existed_get_auto()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(SqliteDatabase.ConnectionString(_file, pooling: false)).Options;
        using var db = new AppDbContext(options);
        db.GetService<IMigrator>().Migrate(Previous);

        using (var connection = new SqliteConnection($"Data Source={_file};Pooling=False;Foreign Keys=False"))
        {
            connection.Open();
            using var insert = connection.CreateCommand();
            insert.CommandText = "INSERT INTO users (\"Id\", \"Username\", \"NormalizedUsername\", \"DisplayName\", \"Role\", \"PasswordHash\", \"Disabled\", \"IsLocalOwner\", \"TotpEnabled\", \"Theme\", \"CreatedAt\", \"UpdatedAt\") VALUES ('1', 'alt', 'alt', 'Alt', 'user', 'x', 0, 0, 0, 'system', '2026-01-01', '2026-01-01')";
            insert.ExecuteNonQuery();
        }

        db.GetService<IMigrator>().Migrate();

        using var check = new SqliteConnection($"Data Source={_file};Pooling=False");
        check.Open();
        using var select = check.CreateCommand();
        select.CommandText = "SELECT \"DateFormat\" FROM users WHERE \"Id\" = '1'";
        Assert.Equal("auto", select.ExecuteScalar());
    }
}
