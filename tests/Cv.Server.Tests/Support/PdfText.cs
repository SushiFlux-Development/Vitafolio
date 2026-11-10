using System.Text.RegularExpressions;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace Cv.Server.Tests.Support;

/// <summary>Reads the text and fonts out of a rendered PDF, so tests can check what a document really says.</summary>
public static partial class PdfText
{
    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    /// <summary>The text of every page with runs of white space collapsed to one space.</summary>
    public static IReadOnlyList<string> Pages(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return [.. document.GetPages().Select(PageText)];
    }

    /// <summary>The text line by line (words on the same baseline, left to right) - to check that a line break in the data is a line break in the document.</summary>
    public static IReadOnlyList<string> Lines(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return [.. document.GetPages().SelectMany(page => page.GetWords()
            .GroupBy(w => Math.Round(w.BoundingBox.Bottom, 0))
            .OrderByDescending(g => g.Key)
            .Select(g => string.Join(" ", g.OrderBy(w => w.BoundingBox.Left).Select(w => w.Text))))];
    }

    /// <summary>How many pictures each page shows (photo, signature, image attachments).</summary>
    public static IReadOnlyList<int> ImagesPerPage(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return [.. document.GetPages().Select(p => p.GetImages().Count())];
    }

    /// <summary>
    /// How many short drawn lines sit in the narrow strip at the left edge of a page (5 to 11 mm from the edge): the fold and punch marks of
    /// a cover letter. Text starts at 25 mm, so nothing else is drawn there.
    /// </summary>
    public static int FoldMarkLines(byte[] pdf)
    {
        const double PointsPerMm = 72 / 25.4;
        using var document = PdfDocument.Open(pdf);
        return document.GetPages().Sum(page => page.Paths.Count(path =>
        {
            var box = path.GetBoundingRectangle();
            return box is { } r && r.Left >= 4.5 * PointsPerMm && r.Right <= 11.5 * PointsPerMm;
        }));
    }

    /// <summary>The right edge of the right-most word on any page, in millimetres from the left page edge.</summary>
    public static double RightmostMm(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return document.GetPages().SelectMany(p => p.GetWords()).Max(w => w.BoundingBox.Right) * 25.4 / 72;
    }

    /// <summary>The text of every page in the order it is written into the file - the order a reader selects or copies it (spaces as they are in the page).</summary>
    public static IReadOnlyList<string> StreamPages(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return [.. document.GetPages().Select(page => string.Concat(page.Letters.Select(l => l.Value)))];
    }

    /// <summary>All pages in writing order in one string.</summary>
    public static string StreamAll(byte[] pdf) => string.Concat(StreamPages(pdf));

    /// <summary>
    /// The distances (in points) between the baselines of consecutive lines on page 1, from the line starting with <paramref name="fromLine"/>
    /// down to the line starting with <paramref name="toLine"/>. The largest one is the gap between two paragraphs.
    /// </summary>
    public static IReadOnlyList<double> BaselineGaps(byte[] pdf, string fromLine, string toLine)
    {
        using var document = PdfDocument.Open(pdf);
        var lines = document.GetPage(1).GetWords()
            .GroupBy(w => Math.Round(w.BoundingBox.Bottom, 0))
            .OrderByDescending(g => g.Key)
            .Select(g => (Y: g.Key, Text: string.Join(" ", g.OrderBy(w => w.BoundingBox.Left).Select(w => w.Text))))
            .ToList();
        var from = lines.FindIndex(l => l.Text.StartsWith(fromLine, StringComparison.Ordinal));
        var to = lines.FindIndex(l => l.Text.StartsWith(toLine, StringComparison.Ordinal));
        return [.. Enumerable.Range(from, to - from).Select(i => lines[i].Y - lines[i + 1].Y)];
    }

    /// <summary>All pages in one string.</summary>
    public static string All(byte[] pdf) => string.Join("\n", Pages(pdf));

    public static int PageCount(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return document.NumberOfPages;
    }

    /// <summary>The names of the fonts used for text (subset prefix removed).</summary>
    public static IReadOnlyCollection<string> FontNames(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        return [.. document.GetPages().SelectMany(p => p.Letters).Select(l => StripSubset(l.FontName ?? "")).Distinct().Order()];
    }

    /// <summary>The words whose box touches a small drawn mark (the dots of a skill level) on the same page.</summary>
    public static IReadOnlyList<string> WordsOverlappingMarks(byte[] pdf)
    {
        using var document = PdfDocument.Open(pdf);
        var found = new List<string>();
        foreach (var page in document.GetPages())
        {
            var marks = page.Paths.Select(path => path.GetBoundingRectangle()).OfType<UglyToad.PdfPig.Core.PdfRectangle>().Where(r => r.Width is > 1 and < 8 && r.Height is > 1 and < 8).ToList();
            foreach (var word in page.GetWords())
            {
                var box = word.BoundingBox;
                if (marks.Any(m => m.Left < box.Right && box.Left < m.Right && m.Bottom < box.Top && box.Bottom < m.Top)) found.Add(word.Text);
            }
        }
        return found;
    }

    /// <summary>The characters that were set in fonts whose name contains <paramref name="fontPart"/>.</summary>
    public static string CharactersIn(byte[] pdf, string fontPart)
    {
        using var document = PdfDocument.Open(pdf);
        return string.Concat(document.GetPages().SelectMany(p => p.Letters).Where(l => (l.FontName ?? "").Contains(fontPart, StringComparison.OrdinalIgnoreCase)).Select(l => l.Value));
    }

    private static string PageText(Page page) => Whitespace().Replace(string.Join(" ", page.GetWords().Select(w => w.Text)), " ").Trim();

    private static string StripSubset(string name) => name.Length > 7 && name[6] == '+' ? name[7..] : name;
}
