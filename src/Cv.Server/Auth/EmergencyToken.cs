using System.Security.Cryptography;
using System.Text;
using Cv.Server.Configuration;

namespace Cv.Server.Auth;

/// <summary>
/// One-time emergency code for resetting the password and two-factor authentication of the sole administrator. The code lives only in the
/// owner-only file &lt;data&gt;/emergency-token (whoever can read the data folder administers the server anyway); the log only says that one
/// was requested and where it is. It expires after <see cref="Lifetime"/> (the file's write time, so a restart does not extend it). A valid
/// code is never replaced by a new request, otherwise anybody could invalidate the operator's code by requesting another one.
/// </summary>
public sealed class EmergencyToken(ServerSettings settings, TimeProvider time, ILogger<EmergencyToken> logger)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    private const int Length = 28;

    private readonly Lock _gate = new();
    private bool _inUse;

    private string File => Path.Combine(settings.DataDirectory, "emergency-token");
    private string TriggerFile => Path.Combine(settings.DataDirectory, "emergency-reset");

    /// <summary>Checks if a trigger file &lt;data&gt;/emergency-reset exists on startup. If so, consumes it and creates a code.</summary>
    public void CheckTriggerFile()
    {
        lock (_gate)
        {
            if (!System.IO.File.Exists(TriggerFile)) return;
            try
            {
                System.IO.File.Delete(TriggerFile);
                logger.LogInformation("Notfall-Triggerdatei '{TriggerFile}' erkannt und verarbeitet.", TriggerFile);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                logger.LogWarning("Notfall-Triggerdatei '{TriggerFile}' konnte nicht gelöscht werden: {Message}", TriggerFile, ex.Message);
            }
            EnsureAndAnnounce();
        }
    }

    /// <summary>Creates a code unless a valid one exists, and tells the operator where it is. The code itself never reaches the log.</summary>
    public void EnsureAndAnnounce()
    {
        lock (_gate)
        {
            if (LoadValid() is not null) return;
            var chars = new char[Length];
            for (var i = 0; i < chars.Length; i++) chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
            if (System.IO.File.Exists(File)) System.IO.File.Delete(File);
            KeyStorage.WritePrivateFile(File, Format(new string(chars)));
            System.IO.File.SetLastWriteTimeUtc(File, time.GetUtcNow().UtcDateTime);
        }

        logger.LogWarning(
            "Ein Notfall-Code für das Administrator-Konto von {Product} wurde angefordert. Er steht in der Datei {File}, gilt {Minutes} Minuten und nur einmal.",
            Branding.ProductName, File, (int)Lifetime.TotalMinutes);
    }

    /// <summary>
    /// Constant-time check of an entered code (dashes, spaces and case do not matter). A match reserves the code: a second request with the
    /// same code is refused until <see cref="Complete"/> or <see cref="Release"/>, so it can only ever be redeemed once.
    /// </summary>
    public bool TryReserve(string? entered)
    {
        if (string.IsNullOrEmpty(entered) || entered.Length > 128) return false;
        var normalized = Encoding.ASCII.GetBytes(Normalize(entered));
        lock (_gate)
        {
            if (_inUse || LoadValid() is not { } expected) return false;
            if (!CryptographicOperations.FixedTimeEquals(normalized, Encoding.ASCII.GetBytes(expected))) return false;
            _inUse = true;
            return true;
        }
    }

    /// <summary>The reset failed before it was saved: the code stays valid for another try.</summary>
    public void Release()
    {
        lock (_gate) _inUse = false;
    }

    /// <summary>The reset is saved: the code is gone for good.</summary>
    public void Complete()
    {
        lock (_gate)
        {
            _inUse = false;
            Delete();
        }
    }

    /// <summary>Removes the code without it having been used.</summary>
    public void Consume()
    {
        lock (_gate) Delete();
    }

    internal static string Normalize(string code) =>
        new string(code.Where(c => c is not ('-' or ' ')).ToArray()).ToUpperInvariant();

    internal static string Format(string code) =>
        string.Join('-', Enumerable.Range(0, (code.Length + 3) / 4).Select(i => code.Substring(i * 4, Math.Min(4, code.Length - i * 4))));

    /// <summary>The current code; an expired one is removed. Caller holds the lock.</summary>
    private string? LoadValid()
    {
        if (!System.IO.File.Exists(File)) return null;
        var age = time.GetUtcNow().UtcDateTime - System.IO.File.GetLastWriteTimeUtc(File);
        if (age >= Lifetime || age < TimeSpan.FromMinutes(-1))
        {
            Delete();
            return null;
        }
        var code = Normalize(System.IO.File.ReadAllText(File).Trim());
        return code.Length == Length && code.All(c => Alphabet.Contains(c, StringComparison.Ordinal)) ? code : null;
    }

    private void Delete()
    {
        try
        {
            if (System.IO.File.Exists(File)) System.IO.File.Delete(File);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning("Notfall-Code-Datei {File} konnte nicht gelöscht werden: {Message}", File, ex.Message);
        }
    }
}
