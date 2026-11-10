using Cv.Server.Configuration;

namespace Cv.Desktop.Hosting;

/// <summary>
/// Where the program keeps its files: the data folder (database, keys, backups - the server's own layout inside it), the WebView2 profile
/// and the window state next to them. Normal use: <c>%LOCALAPPDATA%\&lt;Company&gt;\&lt;Product&gt;</c> (both from branding.json; the
/// environment variable <c>DATA_DIR</c> overrides it). Never <c>%LOCALAPPDATA%\&lt;Product&gt;</c>: the installer (Velopack, package id =
/// product) installs the program there, and an uninstall or reinstall deletes that folder with everything in it.
/// Development run: <c>.data/desktop</c> in the repository, so a test run never touches the data of an installed program.
/// </summary>
internal sealed class DesktopPaths(string dataDirectory, string? legacyDirectory = null, IReadOnlyList<string>? previousDirectories = null)
{
    /// <summary>The files and folders of the data folder (everything else in the old location belongs to the installer).</summary>
    internal static readonly string[] DataEntries =
        ["app.db", "app.db-wal", "app.db-shm", "keys", "backups", "webview", "logs", "window.json"];

    public string DataDirectory { get; } = dataDirectory;

    /// <summary>The data location of earlier builds (inside the installer's folder); null when not relevant (DATA_DIR, development).</summary>
    public string? LegacyDirectory { get; } = legacyDirectory;

    /// <summary>The data folders of earlier company names (the folder hangs on the company name); empty when not relevant (DATA_DIR, development).</summary>
    public IReadOnlyList<string> PreviousDirectories { get; } = previousDirectories ?? [];

    /// <summary>The WebView2 user data folder (cookies, cache) - the program's own profile, never the browser's.</summary>
    public string WebViewDirectory => Path.Combine(DataDirectory, "webview");

    public string WindowStateFile => Path.Combine(DataDirectory, "window.json");

    public string LogDirectory => Path.Combine(DataDirectory, "logs");

    public static DesktopPaths Resolve(DesktopOptions options)
    {
        var fromEnvironment = Environment.GetEnvironmentVariable("DATA_DIR");
        if (!string.IsNullOrWhiteSpace(fromEnvironment)) return new DesktopPaths(Path.GetFullPath(fromEnvironment.Trim()));

        if (options.Dev && FindRepositoryRoot() is { } root) return new DesktopPaths(Path.Combine(root, ".data", "desktop"));

        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return new DesktopPaths(Branding.DesktopDataDirectory(local), Branding.LegacyDesktopDataDirectory(local), Branding.PreviousDesktopDataDirectories(local));
    }

    /// <summary>
    /// Moves the data of an earlier build out of the installer's folder - once, only when the new data folder does not exist yet and the
    /// old place really holds data (a database or keys). Only the data entries are moved; the installer's own files stay. Returns a German
    /// line for the log, or null when there was nothing to do.
    /// </summary>
    public static string? MigrateLegacy(string? legacy, string target)
    {
        if (legacy is null || Directory.Exists(target) || !Directory.Exists(legacy)) return null;
        if (string.Equals(Path.GetFullPath(legacy), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase)) return null;
        if (!File.Exists(Path.Combine(legacy, "app.db")) && !Directory.Exists(Path.Combine(legacy, "keys"))) return null;

        Directory.CreateDirectory(target);
        var moved = new List<string>();
        foreach (var name in DataEntries)
        {
            var from = Path.Combine(legacy, name);
            var to = Path.Combine(target, name);
            if (Directory.Exists(from))
            {
                Directory.Move(from, to);
                moved.Add(name);
            }
            else if (File.Exists(from))
            {
                File.Move(from, to);
                moved.Add(name);
            }
        }
        return $"Daten aus dem alten Ort {legacy} nach {target} verschoben ({string.Join(", ", moved)}); der alte Ort war der Programmordner des Installers, den eine Neuinstallation löscht.";
    }

    /// <summary>What <see cref="PrepareDataFolder"/> did: the paths to use, a German line for the log, and - only when a move failed - the problem to tell the user.</summary>
    internal sealed record DataFolderResult(DesktopPaths Paths, string? LogMessage, DataMoveProblem? Problem);

    /// <summary>A move of the data folder that did not work: nothing was lost, the program runs on the old folder for now.</summary>
    internal sealed record DataMoveProblem(string From, string To, string Reason);

    /// <summary>
    /// Brings the data to its place before anything opens it: first the folder of an earlier company name, then the old place inside the installer's
    /// folder. Called at the start, after the single-instance check, so no other copy of the program is running. If a move fails the program runs
    /// on the old folder for this start (<see cref="DataFolderResult.Paths"/>) and the problem is reported; the next start tries again.
    /// </summary>
    public DataFolderResult PrepareDataFolder()
    {
        var messages = new List<string>();
        try
        {
            if (MovePreviousCompany(PreviousDirectories, DataDirectory) is { } moved) messages.Add(moved);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            var from = PreviousDirectories.FirstOrDefault(HoldsData) ?? PreviousDirectories.FirstOrDefault() ?? string.Empty;
            return new DataFolderResult(new DesktopPaths(from, LegacyDirectory, PreviousDirectories), $"Der Datenordner des früheren Firmennamens {from} ließ sich nicht nach {DataDirectory} verschieben: {ex.Message}. Das Programm benutzt vorerst den alten Ordner.", new DataMoveProblem(from, DataDirectory, ex.Message));
        }
        try
        {
            if (MigrateLegacy(LegacyDirectory, DataDirectory) is { } legacy) messages.Add(legacy);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // The old behaviour: a log line, the new (possibly partly filled) folder is used
            messages.Add($"Daten am alten Ort {LegacyDirectory} konnten nicht nach {DataDirectory} verschoben werden: {ex.Message}");
        }
        return new DataFolderResult(this, messages.Count == 0 ? null : string.Join(" ", messages), null);
    }

    /// <summary>A data folder holds data when it has a database or the keys.</summary>
    internal static bool HoldsData(string folder) => File.Exists(Path.Combine(folder, "app.db")) || Directory.Exists(Path.Combine(folder, "keys"));

    /// <summary>
    /// Moves the data folder of an earlier company name to <paramref name="target"/> - once and all or nothing: only when the target does not exist yet
    /// and an earlier folder really holds data, as ONE rename of the whole folder (same drive), so a failure leaves everything where it was. If the
    /// target exists as well it is never merged or overwritten; the old folder stays untouched and the message says so. Returns a German line for
    /// the log, null when there was nothing to do; throws <see cref="IOException"/> / <see cref="UnauthorizedAccessException"/> when the rename fails.
    /// </summary>
    public static string? MovePreviousCompany(IReadOnlyList<string> previous, string target)
    {
        var holders = previous.Where(folder => !SamePath(folder, target) && Directory.Exists(folder) && HoldsData(folder)).ToList();
        if (holders.Count == 0) return null;

        if (Directory.Exists(target))
        {
            return $"Es gibt Daten unter dem früheren Firmennamen ({holders[0]}) und einen neuen Datenordner ({target}). Verwendet wird der neue Ordner; der alte wurde nicht verändert. " +
                   "Wenn Ihre alten Daten gebraucht werden: Programm schließen, den neuen Ordner wegsichern und den alten Ordner an dessen Stelle verschieben.";
        }

        var source = holders[0];
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(target))!);
        Directory.Move(source, target);

        // The company folder is empty now (the product folder was its only content): tidy up, best effort
        try
        {
            var parent = Path.GetDirectoryName(Path.GetFullPath(source));
            if (parent is not null && !Directory.EnumerateFileSystemEntries(parent).Any()) Directory.Delete(parent);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // An empty folder left behind does no harm
        }
        return $"Daten vom Ordner des früheren Firmennamens {source} nach {target} verschoben (einmalig, der ganze Ordner auf einmal).";
    }

    private static bool SamePath(string a, string b) =>
        string.Equals(Path.GetFullPath(a).TrimEnd(Path.DirectorySeparatorChar), Path.GetFullPath(b).TrimEnd(Path.DirectorySeparatorChar), StringComparison.OrdinalIgnoreCase);

    /// <summary>The folder with Cv.slnx above the program, when it runs from a source checkout; null otherwise.</summary>
    public static string? FindRepositoryRoot()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            if (File.Exists(Path.Combine(dir.FullName, "Cv.slnx"))) return dir.FullName;
        }
        return null;
    }
}
