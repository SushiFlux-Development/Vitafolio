using System.Text.Json;
using Cv.Server.Data;
using Cv.Server.Storage;
using Microsoft.Data.Sqlite;

namespace Cv.Server.Backups;

/// <summary>
/// The working folder of one restore, inside the data directory so that swapping the file trees is a plain rename on one volume. Layout:
/// <c>new/</c> (the unpacked backup), <c>old/</c> (the previous trees, once swapped) and <c>rollback.db</c>.
/// <para>A journal is written before the first change. Whoever finds it - the failing restore itself or the next server start after a crash -
/// puts the previous state back with the same code, so an interrupted restore can never leave a mix of old and new.</para>
/// </summary>
internal sealed class RestoreWorkspace
{
    internal const string WorkRootName = ".restore-work";
    private const string JournalName = "journal.json";

    private readonly string _dataDirectory;

    private RestoreWorkspace(string dataDirectory, string root)
    {
        _dataDirectory = dataDirectory;
        Root = root;
    }

    public string Root { get; }

    public string Incoming => Path.Combine(Root, "new");

    public string Outgoing => Path.Combine(Root, "old");

    public string IncomingDatabase => Path.Combine(Incoming, BackupArchive.DatabaseName);

    public string RollbackDatabase => Path.Combine(Root, "rollback.db");

    private static string WorkRoot(string dataDirectory) => Path.Combine(dataDirectory, WorkRootName);

    private static string JournalFile(string dataDirectory) => Path.Combine(WorkRoot(dataDirectory), JournalName);

    private string DatabaseFile => Path.Combine(_dataDirectory, BackupArchive.DatabaseName);

    public static RestoreWorkspace Create(string dataDirectory)
    {
        var workspace = new RestoreWorkspace(dataDirectory, Path.Combine(WorkRoot(dataDirectory), Guid.NewGuid().ToString("N")));
        Directory.CreateDirectory(workspace.Incoming);
        return workspace;
    }

    /// <summary>From here on the journal exists: every later step can be undone, also by the next start.</summary>
    public void Begin(bool replaceFiles)
    {
        var existing = replaceFiles ? DataAreas.Folders.Where(folder => Directory.Exists(Path.Combine(_dataDirectory, folder))).ToList() : [];
        var journal = new Journal(Path.GetFileName(Root), replaceFiles, existing);
        var file = JournalFile(_dataDirectory);
        var temp = file + DataFiles.TempPrefix;
        File.WriteAllText(temp, JsonSerializer.Serialize(journal, JsonSerializerOptions.Web));
        File.Move(temp, file, overwrite: true);
    }

    /// <summary>Moves the current trees to <c>old/</c> and the unpacked ones into place. Each move is atomic; an area without files simply stays absent.</summary>
    public void SwapFiles()
    {
        Directory.CreateDirectory(Outgoing);
        foreach (var folder in DataAreas.Folders)
        {
            var live = Path.Combine(_dataDirectory, folder);
            if (Directory.Exists(live)) Move(live, Path.Combine(Outgoing, folder));
            var incoming = Path.Combine(Incoming, folder);
            if (Directory.Exists(incoming)) Move(incoming, live);
        }
    }

    /// <summary>Finishes: the journal goes first, so a crash from now on keeps the restored state.</summary>
    public void Complete()
    {
        File.Delete(JournalFile(_dataDirectory));
        Discard();
    }

    /// <summary>Removes the working folder (nothing was changed, or everything is decided).</summary>
    public void Discard()
    {
        try
        {
            if (Directory.Exists(Root)) Directory.Delete(Root, recursive: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // The next restore or start clears it
        }
    }

    /// <summary>Puts the state from before back. False when that failed; the journal then stays, so the next start tries again.</summary>
    public bool Revert(ILogger logger) => Revert(_dataDirectory, Path.GetFileName(Root), logger);

    /// <summary>
    /// At every server start, before the database is opened: finishes the rollback of a restore that did not end, and clears leftovers.
    /// </summary>
    public static void RecoverIfNeeded(string dataDirectory, ILogger logger)
    {
        var workRoot = WorkRoot(dataDirectory);
        if (!Directory.Exists(workRoot)) return;
        var journal = JournalFile(dataDirectory);
        if (File.Exists(journal))
        {
            logger.LogWarning("Eine Wiederherstellung wurde nicht zu Ende geführt. Der Stand von vorher wird zurückgeholt.");
            var work = JsonSerializer.Deserialize<Journal>(File.ReadAllText(journal), JsonSerializerOptions.Web)?.Work
                ?? throw new InvalidDataException("The restore journal cannot be read.");
            if (!IsPlainName(work) || !Revert(dataDirectory, work, logger))
            {
                throw new InvalidOperationException("Der Stand von vor einer abgebrochenen Wiederherstellung konnte nicht zurückgeholt werden. Bitte die letzte Sicherung „Vor Wiederherstellung“ prüfen; das Protokoll nennt die Ursache.");
            }
        }
        try
        {
            Directory.Delete(workRoot, recursive: true);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning("Arbeitsordner einer früheren Wiederherstellung konnte nicht gelöscht werden: {Message}", ex.Message);
        }
    }

    private static bool Revert(string dataDirectory, string work, ILogger logger)
    {
        var journalFile = JournalFile(dataDirectory);
        var root = Path.Combine(WorkRoot(dataDirectory), work);
        try
        {
            if (!File.Exists(journalFile)) return true;
            var journal = JsonSerializer.Deserialize<Journal>(File.ReadAllText(journalFile), JsonSerializerOptions.Web)
                ?? throw new InvalidDataException("The restore journal is empty.");
            if (journal.ReplaceFiles)
            {
                var outgoing = Path.Combine(root, "old");
                foreach (var folder in DataAreas.Folders)
                {
                    var live = Path.Combine(dataDirectory, folder);
                    var previous = Path.Combine(outgoing, folder);
                    if (journal.ExistingAreas.Contains(folder, StringComparer.Ordinal))
                    {
                        // Not in old/: this area was never swapped
                        if (!Directory.Exists(previous)) continue;
                        if (Directory.Exists(live)) Directory.Delete(live, recursive: true);
                        Move(previous, live);
                    }
                    else if (Directory.Exists(live))
                    {
                        // Did not exist before: whatever is there came from the restore (the API was closed)
                        Directory.Delete(live, recursive: true);
                    }
                }
            }
            var rollback = Path.Combine(root, "rollback.db");
            if (File.Exists(rollback)) CopyDatabase(rollback, Path.Combine(dataDirectory, BackupArchive.DatabaseName));
            File.Delete(journalFile);
            logger.LogWarning("Der Stand von vor der Wiederherstellung wurde zurückgeholt.");
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SqliteException or JsonException or InvalidDataException)
        {
            logger.LogCritical(ex, "Der Stand von vor der Wiederherstellung konnte nicht zurückgeholt werden. Der Arbeitsordner {Root} bleibt erhalten.", root);
            return false;
        }
    }

    /// <summary>Writes a database file into the (possibly open) target through SQLite's online backup API, which is one transaction on the target.</summary>
    internal static void CopyDatabase(string source, string target)
    {
        SqliteConnection.ClearAllPools();
        using (var from = new SqliteConnection(SqliteDatabase.ConnectionString(source, pooling: false, SqliteOpenMode.ReadOnly)))
        using (var to = new SqliteConnection(SqliteDatabase.ConnectionString(target, pooling: false)))
        {
            from.Open();
            to.Open();
            SqliteDatabase.Execute(to, $"PRAGMA busy_timeout = {SqliteDatabase.BusyTimeoutMilliseconds};");
            from.BackupDatabase(to);
            SqliteDatabase.Scalar(to, "PRAGMA journal_mode = WAL;");
        }
        SqliteConnection.ClearAllPools();
    }

    // A scanner holding a file in the folder for a moment must not undo a whole restore
    private static void Move(string source, string destination)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                Directory.Move(source, destination);
                return;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException && attempt < 10)
            {
                Thread.Sleep(100);
            }
        }
    }

    private static bool IsPlainName(string name) => name.Length > 0 && name.All(char.IsAsciiLetterOrDigit);

    private sealed record Journal(string Work, bool ReplaceFiles, List<string> ExistingAreas);
}
