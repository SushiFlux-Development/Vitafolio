using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using Cv.Server.Configuration;
using Cv.Server.Data;
using Cv.Server.Errors;
using Cv.Server.Services;

namespace Cv.Server.Ai;

/// <summary>A connection was refused because the target is internal and its host is not released by an admin.</summary>
public sealed class AiHostBlockedException(string host) : Exception($"The connection to '{host}' is not allowed.")
{
    public string Host { get; } = host;
}

/// <summary>
/// Decides where the AI client may connect to. The Windows program belongs to one person and may reach everything, a local model above all.
/// In server mode any signed-in user can enter a base URL, so a request must not become a way into the operator's own network (SSRF): own
/// base URLs need a host the admin released, and an unreleased host may only ever resolve to public addresses. The address check happens
/// while connecting, on the address actually used, so a name that changes its answer between check and use (DNS rebinding) gains nothing.
/// </summary>
public sealed class AiOutboundGuard(ServerSettings settings, SettingsService instanceSettings)
{
    private static readonly IReadOnlyDictionary<string, string> PublicProviderHosts = new Dictionary<string, string>(StringComparer.Ordinal)
    {
        [AiProviders.OpenAi] = "api.openai.com",
        [AiProviders.Anthropic] = "api.anthropic.com",
        [AiProviders.Gemini] = "generativelanguage.googleapis.com",
    };

    /// <summary>The name lookup; tests replace it so they never depend on a real DNS server.</summary>
    internal Func<string, CancellationToken, Task<IPAddress[]>> Resolve { get; set; } = Dns.GetHostAddressesAsync;

    /// <summary>The handler of the AI client: no redirects (a public host must not forward the request inwards), no proxy, connections through <see cref="ConnectAsync"/>.</summary>
    public SocketsHttpHandler CreateHandler() => new()
    {
        AllowAutoRedirect = false,
        UseProxy = false,
        UseCookies = false,
        PooledConnectionLifetime = TimeSpan.FromMinutes(2),
        ConnectCallback = ConnectAsync,
    };

    /// <summary>Whether an own base URL may be used by this provider at all. Server mode: the provider's own public host or a released host.</summary>
    public async Task<bool> IsBaseUrlAllowedAsync(Uri baseUrl, string provider, CancellationToken ct)
    {
        if (settings.IsDesktop) return true;
        if (PublicProviderHosts.TryGetValue(provider, out var own) && string.Equals(own, AiHostList.HostOf(baseUrl), StringComparison.Ordinal)) return true;
        return await IsReleasedAsync(AiHostList.HostOf(baseUrl), ct);
    }

    /// <summary>The addresses that may be connected to for this host; throws <see cref="AiHostBlockedException"/> when an internal address is not released.</summary>
    public async Task<IReadOnlyList<IPAddress>> ResolveAllowedAsync(string host, CancellationToken ct)
    {
        var name = AiHostList.Clean(host);
        var addresses = IPAddress.TryParse(name, out var literal) ? [literal] : await Resolve(name, ct);
        if (addresses.Length == 0) throw new AiHostBlockedException(name);
        if (settings.IsDesktop || await IsReleasedAsync(name, ct)) return addresses;
        // One internal answer among several is already suspicious: all of them must be public
        if (!addresses.All(IsPublicAddress)) throw new AiHostBlockedException(name);
        return addresses;
    }

    private async Task<bool> IsReleasedAsync(string host, CancellationToken ct) =>
        (await instanceSettings.GetAsync(ct)).AiAllowedHosts.Contains(host, StringComparer.Ordinal);

    private async ValueTask<Stream> ConnectAsync(SocketsHttpConnectionContext context, CancellationToken ct)
    {
        var addresses = await ResolveAllowedAsync(context.DnsEndPoint.Host, ct);
        Exception? last = null;
        foreach (var address in addresses)
        {
            // Connects to the checked address itself: no second name lookup that could answer differently
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                await socket.ConnectAsync(address, context.DnsEndPoint.Port, ct);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch (Exception ex) when (ex is SocketException or OperationCanceledException)
            {
                socket.Dispose();
                last = ex;
                if (ex is OperationCanceledException) throw;
            }
        }
        throw new HttpRequestException("The AI service cannot be reached.", last);
    }

    /// <summary>Only ordinary internet addresses; everything else (loopback, private, link-local, reserved, multicast, ...) is internal.</summary>
    public static bool IsPublicAddress(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();
        var bytes = address.GetAddressBytes();
        if (address.AddressFamily == AddressFamily.InterNetwork) return IsPublicV4(bytes);
        if (address.AddressFamily != AddressFamily.InterNetworkV6) return false;

        // NAT64 (64:ff9b::/96) carries an IPv4 address: judged by that address
        if (bytes[0] == 0x00 && bytes[1] == 0x64 && bytes[2] == 0xFF && bytes[3] == 0x9B && bytes.AsSpan(4, 8).IndexOfAnyExcept((byte)0) < 0)
        {
            return IsPublicV4(bytes[12..]);
        }
        // Only global unicast (2000::/3) is public; this also rules out ::1, ::, fe80::/10, fc00::/7, ff00::/8 and the old IPv4-compatible form
        if ((bytes[0] & 0xE0) != 0x20) return false;
        if (bytes[0] == 0x20 && bytes[1] == 0x01 && bytes[2] == 0x0D && bytes[3] == 0xB8) return false; // 2001:db8::/32, documentation
        if (bytes[0] == 0x20 && bytes[1] == 0x01 && bytes[2] == 0x00 && bytes[3] == 0x00) return false; // 2001::/32, Teredo tunnels
        if (bytes[0] == 0x20 && bytes[1] == 0x02) return false; // 2002::/16, 6to4 tunnels to an arbitrary IPv4 address
        return true;
    }

    private static bool IsPublicV4(ReadOnlySpan<byte> b) => b[0] switch
    {
        0 or 10 or 127 => false,
        >= 224 => false, // multicast and reserved
        100 when b[1] is >= 64 and <= 127 => false, // carrier-grade NAT
        169 when b[1] == 254 => false, // link-local, cloud metadata
        172 when b[1] is >= 16 and <= 31 => false,
        192 when b[1] == 168 => false,
        192 when b[1] == 0 && b[2] is 0 or 2 => false, // protocol assignments, documentation
        192 when b[1] == 88 && b[2] == 99 => false, // 6to4 relay
        198 when b[1] is 18 or 19 => false, // benchmarking
        198 when b[1] == 51 && b[2] == 100 => false, // documentation
        203 when b[1] == 0 && b[2] == 113 => false, // documentation
        _ => true,
    };
}

/// <summary>The list of hosts an admin released for own AI base URLs: host names or IP addresses, without scheme, port or path.</summary>
public static partial class AiHostList
{
    public const int MaxEntries = 32;
    public const int MaxEntryLength = 253;

    [GeneratedRegex(@"^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?)*\z")]
    private static partial Regex HostRegex();

    /// <summary>The host of a URL in the form the list stores (punycode, lower case, IPv6 without brackets).</summary>
    public static string HostOf(Uri url) => Clean(url.IdnHost);

    internal static string Clean(string host) => host.Trim().Trim('[', ']').TrimEnd('.').ToLowerInvariant();

    /// <summary>Normalises the entries (duplicates and empty lines removed) and reports the first invalid one.</summary>
    public static IReadOnlyList<string> Normalize(FieldErrors errors, string field, IReadOnlyList<string> entries)
    {
        var result = new List<string>();
        foreach (var entry in entries)
        {
            if (string.IsNullOrWhiteSpace(entry)) continue;
            var host = Clean(entry);
            if (host.Length > MaxEntryLength || !IsHost(host))
            {
                errors.Add(field, "validation.host", new() { ["value"] = entry.Length > 64 ? entry[..64] : entry });
                return result;
            }
            if (!result.Contains(host, StringComparer.Ordinal)) result.Add(host);
        }
        if (result.Count > MaxEntries) errors.Add(field, "validation.max_items", new() { ["max"] = MaxEntries });
        return result;
    }

    private static bool IsHost(string host) =>
        IPAddress.TryParse(host, out var address) ? !host.Contains('%', StringComparison.Ordinal) && address.ToString().Length > 0 : HostRegex().IsMatch(host);
}
