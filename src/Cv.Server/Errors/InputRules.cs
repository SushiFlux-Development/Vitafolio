using System.Text.RegularExpressions;

namespace Cv.Server.Errors;

/// <summary>
/// The form rules - the single source: the server checks them here and publishes the same numbers through <c>/api/bootstrap</c>, which is
/// the only place the UI takes them from.
/// </summary>
public static partial class InputRules
{
    public const int UsernameMin = 3;
    public const int UsernameMax = 32;

    /// <summary>The rule as published to the UI (JavaScript, where $ only matches at the very end). The server uses <see cref="UsernameRegex"/>.</summary>
    public const string UsernamePattern = "^[A-Za-z0-9._-]+$";

    public const int DisplayNameMin = 1;
    public const int DisplayNameMax = 64;
    public const int PasswordMin = 12;
    public const int PasswordMax = 128;

    /// <summary>Upper bound for login inputs: no rules are revealed there, this only stops absurd payloads.</summary>
    public const int LoginFieldMax = 1024;

    // .NET's $ also matches before a trailing line break ("bob" plus a newline would pass): \z = the very end of the text
    [GeneratedRegex(@"^[A-Za-z0-9._-]+\z")]
    private static partial Regex UsernameRegex();

    public static object Describe() => new
    {
        username = new { minLength = UsernameMin, maxLength = UsernameMax, pattern = UsernamePattern },
        displayName = new { minLength = DisplayNameMin, maxLength = DisplayNameMax },
        password = new { minLength = PasswordMin, maxLength = PasswordMax },
    };

    public static void Username(FieldErrors errors, string field, string? value)
    {
        if (string.IsNullOrEmpty(value)) { errors.Add(field, "validation.required"); return; }
        if (value.Length < UsernameMin) errors.Add(field, "validation.min_length", new() { ["min"] = UsernameMin, ["actual"] = value.Length });
        else if (value.Length > UsernameMax) errors.Add(field, "validation.max_length", new() { ["max"] = UsernameMax, ["actual"] = value.Length });
        else if (!UsernameRegex().IsMatch(value)) errors.Add(field, "validation.pattern");
    }

    public static void DisplayName(FieldErrors errors, string field, string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) { errors.Add(field, "validation.required"); return; }
        if (trimmed.Length < DisplayNameMin) errors.Add(field, "validation.min_length", new() { ["min"] = DisplayNameMin, ["actual"] = trimmed.Length });
        else if (trimmed.Length > DisplayNameMax) errors.Add(field, "validation.max_length", new() { ["max"] = DisplayNameMax, ["actual"] = trimmed.Length });
        else if (trimmed.Any(char.IsControl)) errors.Add(field, "validation.invalid_characters");
    }

    public static void Password(FieldErrors errors, string field, string? value)
    {
        if (string.IsNullOrEmpty(value)) { errors.Add(field, "validation.required"); return; }
        if (value.Length < PasswordMin) errors.Add(field, "validation.min_length", new() { ["min"] = PasswordMin, ["actual"] = value.Length });
        else if (value.Length > PasswordMax) errors.Add(field, "validation.max_length", new() { ["max"] = PasswordMax, ["actual"] = value.Length });
    }

    public static void Required(FieldErrors errors, string field, string? value, int max = LoginFieldMax)
    {
        if (string.IsNullOrEmpty(value)) errors.Add(field, "validation.required");
        else if (value.Length > max) errors.Add(field, "validation.max_length", new() { ["max"] = max, ["actual"] = value.Length });
    }

    public static void OneOf(FieldErrors errors, string field, string? value, params string[] allowed)
    {
        if (value is null || !allowed.Contains(value, StringComparer.Ordinal))
        {
            errors.Add(field, "validation.one_of", new() { ["allowed"] = allowed });
        }
    }

    public static void Optional(FieldErrors errors, string field, string? value, int max)
    {
        if (value is not null && value.Length > max)
        {
            errors.Add(field, "validation.max_length", new() { ["max"] = max, ["actual"] = value.Length });
        }
    }

    /// <summary>
    /// A link the user types (website, profile, posting): length, no control characters and - when it names a scheme at all - only http or
    /// https. A bare address ("example.org/me", "example.org:8080") stays allowed; "javascript:..." or "file:..." never gets stored.
    /// </summary>
    public static void Link(FieldErrors errors, string field, string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        var trimmed = value.Trim();
        if (trimmed.Length > max) { errors.Add(field, "validation.max_length", new() { ["max"] = max, ["actual"] = trimmed.Length }); return; }
        if (!IsAllowedLink(trimmed)) errors.Add(field, "validation.url");
    }

    /// <summary>The check behind <see cref="Link"/>, for importers that report differently.</summary>
    public static bool IsAllowedLink(string value)
    {
        if (value.Any(char.IsControl)) return false;
        var match = LinkSchemeRegex().Match(value);
        if (!match.Success) return true;
        var scheme = match.Groups[1].Value;
        if (scheme.Equals("http", StringComparison.OrdinalIgnoreCase) || scheme.Equals("https", StringComparison.OrdinalIgnoreCase))
        {
            return Uri.TryCreate(value, UriKind.Absolute, out _);
        }
        // "example.org:8080/path" reads like a scheme to the regex; a real scheme has no dot and is not followed by a port number
        var rest = value[match.Length..];
        return scheme.Contains('.', StringComparison.Ordinal) && rest.Length > 0 && char.IsAsciiDigit(rest[0]);
    }

    [GeneratedRegex(@"^([A-Za-z][A-Za-z0-9+.\-]*):")]
    private static partial Regex LinkSchemeRegex();

    public static void Range(FieldErrors errors, string field, int value, int min, int max)
    {
        if (value < min || value > max)
        {
            errors.Add(field, "validation.range", new() { ["min"] = min, ["max"] = max, ["actual"] = value });
        }
    }
}

/// <summary>Collects field errors and throws one <c>validation.failed</c> problem for all of them.</summary>
public sealed class FieldErrors
{
    private readonly Dictionary<string, List<FieldError>> _errors = new(StringComparer.Ordinal);

    public bool Any => _errors.Count > 0;

    /// <summary>Takes over the errors of another collection, under other field names (a file import reports the names of the file's own fields).</summary>
    public void MergeFrom(FieldErrors other, Func<string, string> rename)
    {
        foreach (var (field, list) in other._errors)
        {
            foreach (var error in list) Add(rename(field), error.Code, error.Params.ToDictionary(p => p.Key, p => p.Value));
        }
    }

    public void Add(string field, string code, Dictionary<string, object?>? parameters = null)
    {
        if (!_errors.TryGetValue(field, out var list)) _errors[field] = list = [];
        list.Add(new FieldError(code, parameters));
    }

    public void ThrowIfAny()
    {
        if (Any) throw ApiException.Validation(_errors.ToDictionary(e => e.Key, e => (IReadOnlyList<FieldError>)e.Value));
    }
}
