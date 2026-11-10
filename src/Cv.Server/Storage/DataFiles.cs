using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Cv.Server.Configuration;

namespace Cv.Server.Storage;

/// <summary>The folders below the data directory that hold user files. Every path stored in the database belongs to exactly one of them.</summary>
public enum DataArea
{
    Photos,
    Signatures,
    Attachments,
    Applications,
}

public static class DataAreas
{
    public const string PhotosFolder = "photos";
    public const string SignaturesFolder = "signatures";
    public const string AttachmentsFolder = "attachments";
    public const string ApplicationsFolder = "applications";

    public static readonly IReadOnlyList<string> Folders = [PhotosFolder, SignaturesFolder, AttachmentsFolder, ApplicationsFolder];

    public static string Folder(DataArea area) => area switch
    {
        DataArea.Photos => PhotosFolder,
        DataArea.Signatures => SignaturesFolder,
        DataArea.Attachments => AttachmentsFolder,
        DataArea.Applications => ApplicationsFolder,
        _ => throw new ArgumentOutOfRangeException(nameof(area)),
    };
}

/// <summary>
/// Pure rules for relative paths from places that cannot be trusted: database rows (a restored backup can contain anything) and entries of an
/// uploaded archive. Kept free of disk access so they can be tested on their own.
/// </summary>
public static partial class PathRules
{
    private const int MaxLength = 512;

    // Names Windows maps to devices whatever the extension; a backup made on Linux must still be restorable on Windows and the other way round
    [GeneratedRegex(@"^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex ReservedName();

    /// <summary>
    /// True for a relative path with forward slashes whose segments are plain names: no root, drive or stream, no "." or "..", no empty
    /// segments, nothing Windows would silently change (a trailing dot or space) or refuse.
    /// </summary>
    public static bool IsSafeRelative(string? path)
    {
        if (string.IsNullOrEmpty(path) || path.Length > MaxLength) return false;
        foreach (var c in path)
        {
            if (char.IsControl(c) || c is '\\' or ':' or '<' or '>' or '"' or '|' or '?' or '*') return false;
        }
        foreach (var segment in path.Split('/'))
        {
            if (segment.Length == 0 || segment is "." or "..") return false;
            if (segment[^1] is '.' or ' ') return false;
            if (ReservedName().IsMatch(segment)) return false;
        }
        return true;
    }

    /// <summary>The full path of a stored value below <paramref name="root"/>/<paramref name="folder"/>; null when it does not belong there.</summary>
    public static string? Confine(string root, string folder, string? stored)
    {
        if (!IsSafeRelative(stored)) return null;
        var segments = stored!.Split('/');
        if (segments.Length < 2 || !string.Equals(segments[0], folder, StringComparison.Ordinal)) return null;
        var full = Path.GetFullPath(Path.Combine([root, .. segments]));
        return IsInside(Path.Combine(root, folder), full) ? full : null;
    }

    /// <summary>Is <paramref name="path"/> strictly below <paramref name="directory"/>? Only compares normalised text; links are the caller's concern.</summary>
    public static bool IsInside(string directory, string path)
    {
        var parent = Path.TrimEndingDirectorySeparator(Path.GetFullPath(directory)) + Path.DirectorySeparatorChar;
        var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
        return Path.GetFullPath(path).StartsWith(parent, comparison);
    }
}

/// <summary>One user file as a backup sees it.</summary>
public sealed record DataFile(string RelativePath, string FullPath, long Size, string Sha256);

/// <summary>
/// The one way the server touches user files. Every path that comes out of the database is resolved here and confined to its own folder,
/// and every write follows the same order: temporary file, move into place under a new name, database commit, and only then the old file goes.
/// A crash at any point leaves either the old or the new state, at worst an unreferenced file - never a row that points at nothing.
/// </summary>
public sealed class DataFiles(ServerSettings settings, ILogger<DataFiles> logger)
{
    /// <summary>Temporary files carry this prefix; backups and listings ignore them.</summary>
    internal const string TempPrefix = ".tmp-";

    private readonly object _holdLock = new();
    private readonly List<string> _deferred = [];
    private int _holds;

    private string Root => settings.DataDirectory;

    /// <summary>
    /// The full path of a stored value, or null when there is no such file. A value pointing outside its folder, or through a link, is treated
    /// exactly like a missing file and logged: a restored backup is not trustworthy, and a row must never become a way to read keys or the database.
    /// </summary>
    public string? Resolve(DataArea area, string? stored)
    {
        if (string.IsNullOrEmpty(stored)) return null;
        var folder = DataAreas.Folder(area);
        var full = PathRules.Confine(Root, folder, stored);
        if (full is null || PassesThroughLink(Path.Combine(Root, folder), full))
        {
            logger.LogWarning("Pfad aus der Datenbank gehört nicht in den Ordner {Folder} und wird wie eine fehlende Datei behandelt: {Path}", folder, Printable(stored));
            return null;
        }
        return File.Exists(full) ? full : null;
    }

    /// <summary>
    /// Writes a new file and commits the database in one step. <paramref name="commit"/> receives the value to store and must save it; when it
    /// fails the new file is removed and the previous one is untouched. After a successful commit <paramref name="replaces"/> is deleted.
    /// </summary>
    /// <param name="relativeName">Name inside the area; must be new (include a unique part), an existing file is never overwritten.</param>
    /// <returns>The stored value, e.g. <c>photos/abc.png</c>.</returns>
    public async Task<string> SaveAsync(DataArea area, string relativeName, ReadOnlyMemory<byte> content, string? replaces, Func<string, Task> commit, CancellationToken ct)
    {
        var stored = DataAreas.Folder(area) + "/" + relativeName;
        var full = PathRules.Confine(Root, DataAreas.Folder(area), stored)
            ?? throw new ArgumentException("The file name is not valid inside its folder.", nameof(relativeName));
        var directory = Path.GetDirectoryName(full)!;
        Directory.CreateDirectory(directory);

        var temp = Path.Combine(directory, TempPrefix + Guid.NewGuid().ToString("N"));
        try
        {
            await using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous))
            {
                await stream.WriteAsync(content, ct);
                await stream.FlushAsync(ct);
                stream.Flush(flushToDisk: true);
            }
            File.Move(temp, full);
        }
        catch
        {
            TryDeleteFile(temp);
            throw;
        }

        try
        {
            await commit(stored);
        }
        catch
        {
            TryDeleteFile(full);
            throw;
        }

        if (!string.Equals(replaces, stored, StringComparison.Ordinal)) Delete(area, replaces);
        return stored;
    }

    /// <summary>Removes the file of a stored value. Call it after the database commit; a failure only leaves an unreferenced file behind.</summary>
    public void Delete(DataArea area, string? stored)
    {
        if (Resolve(area, stored) is { } full) DeleteOrDefer(full);
    }

    /// <summary>
    /// Removes everything that belongs to an account: every file name the app writes starts with the account id, attachments live in a folder of their own.
    /// </summary>
    public void DeleteAllOfUser(Guid userId)
    {
        var id = userId.ToString("D");
        foreach (var folder in new[] { DataAreas.PhotosFolder, DataAreas.SignaturesFolder, DataAreas.ApplicationsFolder })
        {
            var directory = Path.Combine(Root, folder);
            if (!Directory.Exists(directory)) continue;
            foreach (var file in Directory.EnumerateFiles(directory, id + "*", SearchOption.TopDirectoryOnly).ToList()) DeleteOrDefer(file);
        }
        var attachments = Path.Combine(Root, DataAreas.AttachmentsFolder, userId.ToString("N"));
        if (Directory.Exists(attachments))
        {
            foreach (var file in Directory.EnumerateFiles(attachments, "*", SearchOption.AllDirectories).ToList()) DeleteOrDefer(file);
        }
    }

    /// <summary>
    /// While a backup runs, deletions wait: the database snapshot was taken first and may still reference the file. Replacements never touch the
    /// old file (new names), so with this every file the snapshot references stays readable until the archive is complete.
    /// </summary>
    internal IDisposable HoldDeletes()
    {
        lock (_holdLock) _holds++;
        return new Hold(this);
    }

    /// <summary>All user files with size and SHA-256, in a stable order. Links are not followed, temporary files are skipped.</summary>
    internal IReadOnlyList<DataFile> ListForBackup(CancellationToken ct)
    {
        var options = new EnumerationOptions
        {
            RecurseSubdirectories = true,
            AttributesToSkip = FileAttributes.ReparsePoint,
            IgnoreInaccessible = false,
            MatchType = MatchType.Simple,
        };
        var result = new List<DataFile>();
        foreach (var folder in DataAreas.Folders)
        {
            var directory = Path.Combine(Root, folder);
            if (!Directory.Exists(directory)) continue;
            foreach (var file in new DirectoryInfo(directory).EnumerateFiles("*", options))
            {
                ct.ThrowIfCancellationRequested();
                if (file.Name.StartsWith(TempPrefix, StringComparison.Ordinal)) continue;
                var relative = Path.GetRelativePath(Root, file.FullName).Replace('\\', '/');
                if (!PathRules.IsSafeRelative(relative))
                {
                    logger.LogWarning("Datei {Path} hat einen Namen, der nicht gesichert werden kann, und wird übersprungen.", Printable(relative));
                    continue;
                }
                result.Add(new DataFile(relative, file.FullName, file.Length, HashFile(file.FullName)));
            }
        }
        result.Sort((a, b) => string.CompareOrdinal(a.RelativePath, b.RelativePath));
        return result;
    }

    private static string HashFile(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        return Convert.ToHexStringLower(SHA256.HashData(stream));
    }

    private void DeleteOrDefer(string full)
    {
        lock (_holdLock)
        {
            if (_holds > 0)
            {
                _deferred.Add(full);
                return;
            }
        }
        TryDeleteFile(full);
    }

    private void Release()
    {
        List<string> due;
        lock (_holdLock)
        {
            if (--_holds > 0 || _deferred.Count == 0) return;
            due = [.. _deferred];
            _deferred.Clear();
        }
        foreach (var path in due) TryDeleteFile(path);
    }

    private void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
            RemoveEmptyParent(path);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning("Datei konnte nicht gelöscht werden und bleibt ohne Verweis liegen: {Message}", ex.Message);
        }
    }

    // Per-account attachment folders go away with their last file; the area folders themselves stay
    private void RemoveEmptyParent(string path)
    {
        var parent = Path.GetDirectoryName(path);
        if (parent is null || !PathRules.IsInside(Root, parent)) return;
        if (string.Equals(Path.GetDirectoryName(parent), Path.TrimEndingDirectorySeparator(Root), StringComparison.OrdinalIgnoreCase)) return;
        if (Directory.Exists(parent) && !Directory.EnumerateFileSystemEntries(parent).Any()) Directory.Delete(parent);
    }

    /// <summary>True when a part of the path below <paramref name="areaRoot"/> (or the area folder itself) is a symbolic link or junction.</summary>
    private static bool PassesThroughLink(string areaRoot, string full)
    {
        var stop = Path.TrimEndingDirectorySeparator(Path.GetFullPath(areaRoot));
        if (Directory.Exists(stop) && new DirectoryInfo(stop).LinkTarget is not null) return true;
        var file = new FileInfo(full);
        if (file.Exists && file.LinkTarget is not null) return true;
        for (var directory = file.Directory; directory is not null && PathRules.IsInside(stop, directory.FullName); directory = directory.Parent)
        {
            if (directory.Exists && directory.LinkTarget is not null) return true;
        }
        return false;
    }

    // The value can come from a crafted backup: keep log lines single and short
    private static string Printable(string value)
    {
        var clean = new string(value.Where(c => !char.IsControl(c)).ToArray());
        return clean.Length > 200 ? clean[..200] : clean;
    }

    private sealed class Hold(DataFiles owner) : IDisposable
    {
        private int _disposed;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 0) owner.Release();
        }
    }
}
