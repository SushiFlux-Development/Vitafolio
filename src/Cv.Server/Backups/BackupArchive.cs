using System.Buffers.Binary;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Cv.Server.Storage;

namespace Cv.Server.Backups;

/// <summary>Limits for one backup (configuration <c>Backups:MaxFiles</c>, <c>Backups:MaxSizeMegabytes</c>): uploaded file, and the sum of everything unpacked.</summary>
public sealed record BackupLimits(int MaxFiles, long MaxBytes);

public sealed record BackupManifestFile(string Path, long Size, string Sha256);

/// <summary>The table of contents of a backup archive. It proves completeness, not origin: it is not signed, so its claims are always compared with the content.</summary>
public sealed record BackupManifest(int FormatVersion, string? AppVersion, string? SchemaVersion, DateTime CreatedAt, IReadOnlyList<BackupManifestFile> Files);

/// <summary>A file that goes into a new archive.</summary>
internal sealed record ArchiveSource(string RelativePath, string FullPath);

internal readonly record struct ArchiveResult(BackupCheck Check, string? Detail, BackupManifest? Manifest);

/// <summary>
/// The backup file format: one ZIP archive with <c>manifest.json</c>, <c>app.db</c> (SQLite online backup) and the user file trees
/// <c>photos/</c>, <c>signatures/</c>, <c>attachments/</c>, <c>applications/</c>. <c>keys/</c> is deliberately absent, so the encrypted values and
/// the key material never travel in the same file.
/// <para>Reading treats every archive as hostile: entry names, links, entry count and sizes are checked before anything is unpacked, sizes are
/// enforced while unpacking (the numbers in a ZIP are only claims), and the manifest has to match the content exactly.</para>
/// </summary>
internal static partial class BackupArchive
{
    public const int FormatVersion = 1;
    public const string ManifestName = "manifest.json";
    public const string DatabaseName = "app.db";

    private const long MaxManifestBytes = 32 * 1024 * 1024;
    private const long FreeSpaceMargin = 64 * 1024 * 1024;

    // Upper 16 bits of the external attributes of a ZIP entry made on Unix: the file type
    private const int UnixTypeMask = 0xF000;
    private const int UnixRegularFile = 0x8000;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };

    [GeneratedRegex("^[0-9a-f]{64}$")]
    private static partial Regex Sha256Pattern();

    /// <summary>Does the file start like a ZIP archive? (Old backups are plain SQLite files.)</summary>
    public static bool LooksLikeArchive(string file)
    {
        Span<byte> header = stackalloc byte[4];
        using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
        return stream.ReadAtLeast(header, 4, throwOnEndOfStream: false) == 4 && header is [0x50, 0x4B, 0x03, 0x04];
    }

    /// <summary>Creates the archive: the entries first, the manifest last with the sizes and hashes of what really went in.</summary>
    public static BackupManifest Write(string target, string databaseFile, IEnumerable<ArchiveSource> files, string? appVersion, string? schemaVersion, DateTime createdAt, CancellationToken ct)
    {
        var entries = new List<BackupManifestFile>();
        using (var stream = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, leaveOpen: true))
        {
            entries.Add(WriteEntry(archive, DatabaseName, databaseFile, CompressionLevel.Fastest, ct));
            foreach (var file in files)
            {
                // Photos and PDFs are compressed already: storing them is faster and hardly any bigger
                try
                {
                    entries.Add(WriteEntry(archive, file.RelativePath, file.FullPath, CompressionLevel.NoCompression, ct));
                }
                catch (FileNotFoundException)
                {
                    // Deletions wait for the backup, so only an outside hand can do this; the rest of the backup is still worth having
                }
            }
            var manifest = new BackupManifest(FormatVersion, appVersion, schemaVersion, createdAt, entries);
            var entry = archive.CreateEntry(ManifestName, CompressionLevel.Fastest);
            using var output = entry.Open();
            JsonSerializer.Serialize(output, manifest, Json);
            return manifest;
        }
    }

    private static BackupManifestFile WriteEntry(ZipArchive archive, string name, string source, CompressionLevel level, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        using var input = new FileStream(source, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        var entry = archive.CreateEntry(name, level);
        using var output = entry.Open();
        var (length, sha256) = Copy(input, output, long.MaxValue, ct);
        return new BackupManifestFile(name, length, sha256);
    }

    /// <summary>Checks the whole archive and reads every entry once, without keeping anything except, on request, the database.</summary>
    public static ArchiveResult Verify(string file, BackupLimits limits, string? databaseTarget, CancellationToken ct) =>
        Process(file, limits, name => databaseTarget is not null && name == DatabaseName ? databaseTarget : null, null, ct);

    /// <summary>Unpacks into <paramref name="targetDirectory"/> after the checks; nothing outside that folder can be written.</summary>
    public static ArchiveResult Extract(string file, string targetDirectory, BackupLimits limits, CancellationToken ct) =>
        Process(file, limits, name =>
        {
            var full = Path.GetFullPath(Path.Combine([targetDirectory, .. name.Split('/')]));
            if (!PathRules.IsInside(targetDirectory, full)) throw new InvalidDataException("Entry leaves the target folder.");
            return full;
        }, targetDirectory, ct);

    private static ArchiveResult Process(string file, BackupLimits limits, Func<string, string?> targetFor, string? spaceCheckDirectory, CancellationToken ct)
    {
        try
        {
            // ZipArchive reads the whole central directory into memory when opened, so its claimed size is checked first
            var declared = DeclaredEntryCount(file);
            if (declared is null) return Invalid("no end-of-archive record");
            if (declared > limits.MaxFiles + 2L) return new ArchiveResult(BackupCheck.TooLarge, $"{declared} entries", null);

            using var archive = ZipFile.OpenRead(file);
            var entries = new Dictionary<string, ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
            long total = 0;
            foreach (var entry in archive.Entries)
            {
                ct.ThrowIfCancellationRequested();
                if (Describe(entry) is { } problem) return Invalid(problem);
                if (!entries.TryAdd(entry.FullName, entry)) return Invalid("duplicate entry");
                if (entry.Length < 0) return Invalid("negative size");
                total += entry.Length;
                if (total > limits.MaxBytes) return new ArchiveResult(BackupCheck.TooLarge, $"more than {limits.MaxBytes} bytes", null);
            }

            if (!entries.TryGetValue(ManifestName, out var manifestEntry) || manifestEntry.FullName != ManifestName) return Invalid("no manifest");
            if (manifestEntry.Length > MaxManifestBytes) return Invalid("manifest too large");
            BackupManifest? manifest;
            using (var stream = manifestEntry.Open())
            {
                manifest = JsonSerializer.Deserialize<BackupManifest>(stream, Json);
            }
            if (manifest?.Files is null) return Invalid("empty manifest");
            if (manifest.FormatVersion > FormatVersion) return new ArchiveResult(BackupCheck.TooNew, $"archive format {manifest.FormatVersion}", null);
            if (manifest.FormatVersion < 1) return Invalid("unknown archive format");
            if (manifest.Files.Count != entries.Count - 1) return Invalid("manifest and content differ in number");

            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var hasDatabase = false;
            foreach (var item in manifest.Files)
            {
                if (item is null || item.Path is null || item.Sha256 is null || !Sha256Pattern().IsMatch(item.Sha256) || item.Size < 0) return Invalid("malformed manifest entry");
                if (!seen.Add(item.Path)) return Invalid("duplicate manifest entry");
                if (!entries.TryGetValue(item.Path, out var entry) || entry.FullName != item.Path) return Invalid("manifest names a missing entry");
                if (entry.Length != item.Size) return Invalid("size differs from manifest");
                hasDatabase |= item.Path == DatabaseName;
            }
            if (!hasDatabase) return Invalid("no database");

            if (spaceCheckDirectory is not null && !HasSpace(spaceCheckDirectory, total)) return new ArchiveResult(BackupCheck.NoSpace, $"{total} bytes needed", null);

            foreach (var item in manifest.Files)
            {
                ct.ThrowIfCancellationRequested();
                using var input = entries[item.Path].Open();
                var target = targetFor(item.Path);
                using var output = target is null ? Stream.Null : CreateTarget(target);
                // The cap is what stops a deflate stream that expands beyond its declared size
                var (length, sha256) = Copy(input, output, item.Size, ct);
                if (length != item.Size || !string.Equals(sha256, item.Sha256, StringComparison.Ordinal)) return Invalid($"content differs from manifest: {item.Path}");
            }
            return new ArchiveResult(BackupCheck.Ok, null, manifest);
        }
        catch (Exception ex) when (ex is InvalidDataException or JsonException or NotSupportedException or ArgumentException or IOException or UnauthorizedAccessException)
        {
            return Invalid(ex.GetType().Name + ": " + ex.Message);
        }
    }

    private static ArchiveResult Invalid(string detail) => new(BackupCheck.InvalidArchive, detail, null);

    /// <summary>What is wrong with an entry itself, or null: only the expected names, no links, no folders.</summary>
    private static string? Describe(ZipArchiveEntry entry)
    {
        var name = entry.FullName;
        if (!PathRules.IsSafeRelative(name)) return "unsafe entry name";
        var unixType = (entry.ExternalAttributes >> 16) & UnixTypeMask;
        if (unixType != 0 && unixType != UnixRegularFile) return "entry is not a regular file";
        if (name is ManifestName or DatabaseName) return null;
        var firstSlash = name.IndexOf('/', StringComparison.Ordinal);
        if (firstSlash < 0 || !DataAreas.Folders.Contains(name[..firstSlash], StringComparer.Ordinal)) return "unexpected entry";
        return null;
    }

    private static FileStream CreateTarget(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        return new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
    }

    /// <summary>Copies at most <paramref name="limit"/> + 1 bytes (one more shows that the source was longer) and hashes what passed through.</summary>
    private static (long Length, string Sha256) Copy(Stream input, Stream output, long limit, CancellationToken ct)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = new byte[81920];
        long total = 0;
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var remaining = limit - total;
            var want = remaining >= buffer.Length ? buffer.Length : (int)remaining + 1;
            var read = input.Read(buffer, 0, want);
            if (read == 0) break;
            total += read;
            if (total > limit) return (total, "");
            hash.AppendData(buffer, 0, read);
            output.Write(buffer, 0, read);
        }
        return (total, Convert.ToHexStringLower(hash.GetHashAndReset()));
    }

    internal static bool HasSpace(string directory, long bytes)
    {
        try
        {
            return new DriveInfo(Path.GetFullPath(directory)).AvailableFreeSpace >= bytes + FreeSpaceMargin;
        }
        catch (Exception ex) when (ex is ArgumentException or IOException or UnauthorizedAccessException)
        {
            // Not determinable on this volume (e.g. a network path): the write itself will tell
            return true;
        }
    }

    /// <summary>The entry count the archive's end record claims (ZIP64 included); null when there is no end record.</summary>
    private static long? DeclaredEntryCount(string file)
    {
        const int EndRecordSize = 22;
        const int MaxComment = 65535;
        using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (stream.Length < EndRecordSize) return null;
        var length = (int)Math.Min(stream.Length, EndRecordSize + MaxComment);
        var tail = new byte[length];
        stream.Seek(-length, SeekOrigin.End);
        stream.ReadExactly(tail);

        for (var position = length - EndRecordSize; position >= 0; position--)
        {
            if (BinaryPrimitives.ReadUInt32LittleEndian(tail.AsSpan(position)) != 0x06054B50) continue;
            var count = BinaryPrimitives.ReadUInt16LittleEndian(tail.AsSpan(position + 10));
            if (count != 0xFFFF) return count;

            // ZIP64: the locator sits right before the end record and points at the real one
            var locator = position - 20;
            if (locator < 0 || BinaryPrimitives.ReadUInt32LittleEndian(tail.AsSpan(locator)) != 0x07064B50) return null;
            var offset = BinaryPrimitives.ReadInt64LittleEndian(tail.AsSpan(locator + 8));
            if (offset < 0 || offset > stream.Length - 56) return null;
            Span<byte> record = stackalloc byte[56];
            stream.Seek(offset, SeekOrigin.Begin);
            stream.ReadExactly(record);
            if (BinaryPrimitives.ReadUInt32LittleEndian(record) != 0x06064B50) return null;
            var total = BinaryPrimitives.ReadInt64LittleEndian(record[32..]);
            return total < 0 ? long.MaxValue : total;
        }
        return null;
    }
}
