using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.Data.Sqlite;

namespace Cv.Server.Tests.Support;

/// <summary>Reads and crafts backup archives for the tests.</summary>
public static class BackupFiles
{
    public const string Manifest = "manifest.json";
    public const string Database = "app.db";

    public static bool IsArchive(byte[] backup) => backup.Length > 4 && backup[0] == 0x50 && backup[1] == 0x4B && backup[2] == 3 && backup[3] == 4;

    /// <summary>All entries of an archive by name.</summary>
    public static Dictionary<string, byte[]> Entries(byte[] archive)
    {
        using var zip = new ZipArchive(new MemoryStream(archive), ZipArchiveMode.Read);
        var result = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        foreach (var entry in zip.Entries)
        {
            using var stream = entry.Open();
            using var memory = new MemoryStream();
            stream.CopyTo(memory);
            result[entry.FullName] = memory.ToArray();
        }
        return result;
    }

    /// <summary>The SQLite file of a backup, in either form: what an old database-only backup looks like.</summary>
    public static byte[] DatabaseOf(byte[] backup) => IsArchive(backup) ? Entries(backup)[Database] : backup;

    /// <summary>
    /// A changed copy of an archive. Entries are edited by <paramref name="change"/>, the manifest is rebuilt to match them (so only the check named by the
    /// test can reject it) and can be falsified afterwards by <paramref name="manifest"/>.
    /// </summary>
    public static byte[] Repack(byte[] archive, Action<Dictionary<string, byte[]>>? change = null, Action<JsonObject>? manifest = null, Action<ZipArchiveEntry>? entryChange = null)
    {
        var entries = Entries(archive);
        var document = JsonNode.Parse(entries[Manifest])!.AsObject();
        entries.Remove(Manifest);
        change?.Invoke(entries);

        var files = new JsonArray();
        foreach (var (name, data) in entries) files.Add(new JsonObject { ["path"] = name, ["size"] = data.Length, ["sha256"] = Convert.ToHexStringLower(SHA256.HashData(data)) });
        document["files"] = files;
        manifest?.Invoke(document);

        using var output = new MemoryStream();
        using (var zip = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var (name, data) in entries)
            {
                var entry = zip.CreateEntry(name, CompressionLevel.Optimal);
                entryChange?.Invoke(entry);
                using var stream = entry.Open();
                stream.Write(data);
            }
            using var manifestStream = zip.CreateEntry(Manifest).Open();
            manifestStream.Write(Encoding.UTF8.GetBytes(document.ToJsonString()));
        }
        return output.ToArray();
    }

    /// <summary>Runs SQL on a copy of a database file and returns the copy.</summary>
    public static byte[] EditDatabase(byte[] database, string sql)
    {
        var file = Path.Combine(Path.GetTempPath(), $"cv-edit-{Guid.NewGuid():N}.db");
        File.WriteAllBytes(file, database);
        try
        {
            using (var connection = new SqliteConnection($"Data Source={file};Pooling=False"))
            {
                connection.Open();
                using var command = connection.CreateCommand();
                command.CommandText = sql;
                command.ExecuteNonQuery();
            }
            return File.ReadAllBytes(file);
        }
        finally
        {
            foreach (var path in new[] { file, file + "-wal", file + "-shm", file + "-journal" }) File.Delete(path);
        }
    }

    /// <summary>
    /// Falsifies the uncompressed size of one entry in the central directory: the archive then claims less than its deflate stream really expands to,
    /// which is what a zip bomb does.
    /// </summary>
    public static byte[] ClaimSize(byte[] archive, string entryName, uint size)
    {
        var result = (byte[])archive.Clone();
        var name = Encoding.UTF8.GetBytes(entryName);
        for (var i = 0; i < result.Length - 46; i++)
        {
            if (BitConverter.ToUInt32(result, i) != 0x02014B50) continue;
            var nameLength = BitConverter.ToUInt16(result, i + 28);
            if (nameLength == name.Length && result.AsSpan(i + 46, nameLength).SequenceEqual(name))
            {
                BitConverter.TryWriteBytes(result.AsSpan(i + 24), size);
                return result;
            }
        }
        throw new InvalidOperationException("Entry not found.");
    }
}
