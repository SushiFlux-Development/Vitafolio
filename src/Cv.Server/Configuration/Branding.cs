using System.Reflection;

namespace Cv.Server.Configuration;

/// <summary>
/// The product name, the company and the public source repository from branding.json (read at build time, see Directory.Build.props). The only source of
/// these values; the host, logs and window title read them from here.
/// </summary>
public static class Branding
{
    public static string ProductName { get; } =
        typeof(Branding).Assembly.GetCustomAttribute<AssemblyProductAttribute>()?.Product is { Length: > 0 } name ? name : "App";

    public static string Company { get; } =
        typeof(Branding).Assembly.GetCustomAttribute<AssemblyCompanyAttribute>()?.Company is { Length: > 0 } company ? company : "App";

    /// <summary>Owner and name of the public repository (<c>owner/name</c>): source code, releases and the Docker image hang off this one value.</summary>
    public static string Repository { get; } =
        typeof(Branding).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>().FirstOrDefault(a => a.Key == "Repository")?.Value is { Length: > 0 } repository ? repository : "";

    /// <summary>
    /// Earlier company names (<c>previousCompanies</c> in branding.json). The data folder of the Windows program
    /// hangs on the company name, so after a rename the program moves the folder of an earlier name once, see <c>DesktopPaths</c>.
    /// </summary>
    public static IReadOnlyList<string> PreviousCompanies { get; } = ParseNames(
        typeof(Branding).Assembly.GetCustomAttributes<AssemblyMetadataAttribute>().FirstOrDefault(a => a.Key == "PreviousCompanies")?.Value);

    /// <summary>The names in the raw list text of branding.json (<c>"A", "B"</c>); a name that equals the current company is not "previous".</summary>
    internal static IReadOnlyList<string> ParseNames(string? raw) =>
        string.IsNullOrWhiteSpace(raw)
            ? []
            : [.. System.Text.RegularExpressions.Regex.Matches(raw, "\"([^\"]+)\"").Select(m => m.Groups[1].Value.Trim()).Where(name => name.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase)];

    /// <summary>The public source code (AGPL: everyone who uses the app can get it).</summary>
    public static string SourceUrl => "https://github.com/" + Repository;

    public const string LicenseId = "AGPL-3.0-only";

    /// <summary>
    /// The data folder of the Windows program: <c>%LOCALAPPDATA%\&lt;Company&gt;\&lt;Product&gt;</c> (the Windows convention). Never
    /// <c>%LOCALAPPDATA%\&lt;Product&gt;</c>: that is the installer's program folder, which an uninstall or reinstall deletes.
    /// </summary>
    public static string DesktopDataDirectory(string localAppData) => Path.Combine(localAppData, Company, ProductName);

    /// <summary>The data folders the program used under an earlier company name (<c>%LOCALAPPDATA%\&lt;old company&gt;\&lt;Product&gt;</c>), in the order of branding.json.</summary>
    public static IReadOnlyList<string> PreviousDesktopDataDirectories(string localAppData) =>
        [.. PreviousCompanies.Where(name => !string.Equals(name, Company, StringComparison.OrdinalIgnoreCase)).Select(name => Path.Combine(localAppData, name, ProductName))];

    /// <summary>Where earlier test builds kept their data (inside the program folder) - only used to move it out once.</summary>
    public static string LegacyDesktopDataDirectory(string localAppData) => Path.Combine(localAppData, ProductName);
}
