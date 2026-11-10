using Cv.Server.Errors;

namespace Cv.Server.Documents;

/// <summary>
/// Bounds document rendering: the Typst compiler is native code that cannot be interrupted, and a crafted document can keep it busy for a
/// long time. Only a few renders run at once, others wait briefly and are then refused (503 <c>render.busy</c>). A request stops waiting
/// after <see cref="Timeout"/> (503 <c>render.timeout</c>); the render itself keeps its slot until it really ends, so stuck renders
/// can never pile up beyond the limit.
/// </summary>
public sealed class RenderGate
{
    public static readonly TimeSpan DefaultTimeout = TimeSpan.FromSeconds(60);
    public static readonly TimeSpan DefaultQueueWait = TimeSpan.FromSeconds(10);

    private readonly SemaphoreSlim _slots;
    private readonly TimeSpan _timeout;
    private readonly TimeSpan _queueWait;

    // Half the cores, at least 2 (the live preview of a second user must not wait for an export) and at most 4
    public RenderGate() : this(Math.Clamp(Environment.ProcessorCount / 2, 2, 4), DefaultTimeout, DefaultQueueWait)
    {
    }

    internal RenderGate(int maxConcurrent, TimeSpan timeout, TimeSpan queueWait)
    {
        _slots = new SemaphoreSlim(maxConcurrent, maxConcurrent);
        _timeout = timeout;
        _queueWait = queueWait;
    }

    internal TimeSpan Timeout => _timeout;

    public async Task<T> RunAsync<T>(Func<T> render, CancellationToken ct)
    {
        if (!await _slots.WaitAsync(_queueWait, ct))
        {
            throw new ApiException(StatusCodes.Status503ServiceUnavailable, "render.busy", "Too many documents are being rendered at the moment. Please try again shortly.");
        }

        var work = Task.Run(() =>
        {
            try
            {
                return render();
            }
            finally
            {
                _slots.Release();
            }
        }, CancellationToken.None);

        try
        {
            return await work.WaitAsync(_timeout, ct);
        }
        catch (TimeoutException)
        {
            throw new ApiException(StatusCodes.Status503ServiceUnavailable, "render.timeout", "Rendering the document took too long.");
        }
    }
}

/// <summary>
/// Reads the pixel size from an image header. A small file can declare a gigantic canvas that a decoder then has to allocate (decompression
/// bomb), so uploads are refused on what they declare. A header without a readable size cannot be decoded either and is left to the renderer.
/// </summary>
public static class ImageDimensions
{
    public const int MaxEdge = 8000;
    public const long MaxPixels = 40_000_000;

    public static bool TooLarge(ReadOnlySpan<byte> image) =>
        TryRead(image, out var width, out var height) && (width > MaxEdge || height > MaxEdge || (long)width * height > MaxPixels);

    public static bool TryRead(ReadOnlySpan<byte> b, out int width, out int height)
    {
        width = height = 0;
        if (b.Length >= 24 && b[0] == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' && b[12] == 'I' && b[13] == 'H' && b[14] == 'D' && b[15] == 'R')
        {
            width = BigEndian32(b[16..]);
            height = BigEndian32(b[20..]);
            return true;
        }
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return ReadJpeg(b, out width, out height);
        if (b.Length >= 30 && b[0] == 'R' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return ReadWebp(b, out width, out height);
        return false;
    }

    private static bool ReadJpeg(ReadOnlySpan<byte> b, out int width, out int height)
    {
        width = height = 0;
        var i = 2;
        while (i + 8 < b.Length)
        {
            if (b[i] != 0xFF) { i++; continue; }
            var marker = b[i + 1];
            if (marker == 0xFF) { i++; continue; }
            if (marker is 0x01 or (>= 0xD0 and <= 0xD9)) { i += 2; continue; }
            // Start-of-frame markers carry the size (C4, C8 and CC are something else)
            if (marker is >= 0xC0 and <= 0xCF && marker is not (0xC4 or 0xC8 or 0xCC))
            {
                height = b[i + 5] << 8 | b[i + 6];
                width = b[i + 7] << 8 | b[i + 8];
                return true;
            }
            var length = b[i + 2] << 8 | b[i + 3];
            if (length < 2) return false;
            i += 2 + length;
        }
        return false;
    }

    private static bool ReadWebp(ReadOnlySpan<byte> b, out int width, out int height)
    {
        width = height = 0;
        if (b[12] == 'V' && b[13] == 'P' && b[14] == '8' && b[15] == ' ' && b[23] == 0x9D && b[24] == 0x01 && b[25] == 0x2A)
        {
            width = (b[26] | b[27] << 8) & 0x3FFF;
            height = (b[28] | b[29] << 8) & 0x3FFF;
            return true;
        }
        if (b[12] == 'V' && b[13] == 'P' && b[14] == '8' && b[15] == 'L' && b[20] == 0x2F)
        {
            width = (b[21] | (b[22] & 0x3F) << 8) + 1;
            height = (b[22] >> 6 | b[23] << 2 | (b[24] & 0x0F) << 10) + 1;
            return true;
        }
        if (b[12] == 'V' && b[13] == 'P' && b[14] == '8' && b[15] == 'X')
        {
            width = (b[24] | b[25] << 8 | b[26] << 16) + 1;
            height = (b[27] | b[28] << 8 | b[29] << 16) + 1;
            return true;
        }
        return false;
    }

    private static int BigEndian32(ReadOnlySpan<byte> b)
    {
        var value = (long)b[0] << 24 | (long)b[1] << 16 | (long)b[2] << 8 | b[3];
        return value > int.MaxValue ? int.MaxValue : (int)value;
    }
}
