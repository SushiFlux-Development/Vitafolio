// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

using System.Text;
using System.Text.RegularExpressions;
using Cv.Server.Data;

namespace Cv.Server.Ai;

public static class AiPseudonymizer
{
    public const string TokenName = "[BEWERBER_NAME]";
    public const string TokenFirstName = "[BEWERBER_VORNAME]";
    public const string TokenLastName = "[BEWERBER_NACHNAME]";
    public const string TokenEmail = "[BEWERBER_EMAIL]";
    public const string TokenPhone = "[BEWERBER_TELEFON]";
    public const string TokenAddress = "[BEWERBER_ANSCHRIFT]";
    public const string TokenStreet = "[BEWERBER_STRASSE]";
    public const string TokenCityLine = "[BEWERBER_WOHNORT]";
    public const string TokenCity = "[BEWERBER_ORT]";
    public const string TokenBirthDate = "[BEWERBER_GEBURTSDATUM]";
    public const string TokenBirthPlace = "[BEWERBER_GEBURTSORT]";

    // Letters, digits or the underscore next to a match mean it is only part of a word ("Max" in "Maximilian") or of one of our own tokens
    private const string WordStart = @"(?<![\p{L}\p{N}_])";
    private const string WordEnd = @"(?![\p{L}\p{N}_])";

    /// <summary>Shorter values ("Li", an initial) would match ordinary text far too often to be worth replacing on their own.</summary>
    private const int MinPartLength = 2;

    /// <summary>A phone number shorter than this is not a phone number; matching it would hit ordinary numbers in the text.</summary>
    private const int MinPhoneDigits = 6;

    public sealed record ReplacementMap(
        string? Name,
        string? FirstName,
        string? LastName,
        string? Email,
        string? Phone,
        string? Address,
        string? Street,
        string? CityLine,
        string? City,
        string? BirthDate,
        string? BirthPlace
    );

    public static ReplacementMap ExtractMap(UserProfile? profile)
    {
        if (profile is null)
        {
            return new ReplacementMap(null, null, null, null, null, null, null, null, null, null, null);
        }

        var street = Value(profile.Street);
        var city = Value(profile.City);
        var cityLine = Value($"{profile.PostalCode} {profile.City}");
        var addressParts = new[] { street, cityLine }.Where(p => p is not null);
        var address = string.Join(", ", addressParts);

        return new ReplacementMap(
            Name: Value($"{profile.FirstName} {profile.LastName}"),
            FirstName: Value(profile.FirstName),
            LastName: Value(profile.LastName),
            Email: Value(profile.Email),
            Phone: Value(profile.Phone),
            Address: address.Length == 0 ? null : address,
            Street: street,
            CityLine: cityLine,
            City: city,
            BirthDate: Value(profile.DateOfBirth),
            BirthPlace: Value(profile.PlaceOfBirth)
        );
    }

    public static string Pseudonymize(string text, ReplacementMap map)
    {
        if (string.IsNullOrEmpty(text)) return text;

        var result = text;

        // Longest and most specific first: the mail address contains the name, the address the street and the city
        result = Replace(result, map.Email, TokenEmail, TextPattern);
        result = ReplacePhone(result, map.Phone);
        result = Replace(result, map.Address, TokenAddress, TextPattern);
        result = Replace(result, map.Street, TokenStreet, TextPattern);
        result = Replace(result, map.CityLine, TokenCityLine, TextPattern);
        result = Replace(result, map.City, TokenCity, TextPattern);
        result = Replace(result, map.Name, TokenName, TextPattern);
        result = Replace(result, map.LastName, TokenLastName, TextPattern);
        result = Replace(result, map.FirstName, TokenFirstName, TextPattern);
        result = Replace(result, map.BirthDate, TokenBirthDate, TextPattern);
        result = Replace(result, map.BirthPlace, TokenBirthPlace, TextPattern);

        return result;
    }

    public static string DePseudonymize(string text, ReplacementMap map)
    {
        if (string.IsNullOrEmpty(text)) return text;

        var result = text;

        result = Restore(result, map.Name, TokenName, "[CANDIDATE_NAME]", "[NAME]");
        result = Restore(result, map.FirstName, TokenFirstName, "[VORNAME]", "[FIRST_NAME]");
        result = Restore(result, map.LastName, TokenLastName, "[NACHNAME]", "[LAST_NAME]");
        result = Restore(result, map.Email, TokenEmail, "[CANDIDATE_EMAIL]", "[EMAIL]");
        result = Restore(result, map.Phone, TokenPhone, "[CANDIDATE_PHONE]", "[TELEFON]", "[PHONE]");
        result = Restore(result, map.Address, TokenAddress, "[CANDIDATE_ADDRESS]", "[ANSCHRIFT]");
        result = Restore(result, map.Street, TokenStreet, "[STRASSE]", "[STREET]");
        result = Restore(result, map.CityLine, TokenCityLine, "[WOHNORT]");
        result = Restore(result, map.City, TokenCity, "[ORT]", "[CITY]");
        result = Restore(result, map.BirthDate, TokenBirthDate, "[GEBURTSDATUM]");
        result = Restore(result, map.BirthPlace, TokenBirthPlace, "[GEBURTSORT]");

        return result;
    }

    private static string? Value(string? raw) => string.IsNullOrWhiteSpace(raw) ? null : raw.Trim();

    private static string Replace(string text, string? value, string token, Func<string, string> pattern) =>
        string.IsNullOrEmpty(value) || value.Length < MinPartLength
            ? text
            : Regex.Replace(text, pattern(value), token.Replace("$", "$$", StringComparison.Ordinal), RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>Any run of spaces in the value matches any whitespace in the text (a name split over a line break, a double space).</summary>
    private static string TextPattern(string value) =>
        WordStart + string.Join(@"\s+", value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).Select(Regex.Escape)) + WordEnd;

    private static string ReplacePhone(string text, string? phone)
    {
        if (string.IsNullOrEmpty(phone)) return text;
        foreach (var variant in PhoneVariants(phone))
        {
            text = Regex.Replace(text, PhonePattern(variant), TokenPhone, RegexOptions.CultureInvariant);
        }
        return text;
    }

    /// <summary>
    /// The digits as stored plus the usual ways to write the same number: "+49 170 1234567", "0049 170 1234567" and "0170 1234567" are one
    /// number. How long the country code is cannot be known from the number alone, so 1 to 3 digits are all tried; the long digit run makes
    /// an accidental match practically impossible. Longest first.
    /// </summary>
    internal static IReadOnlyList<string> PhoneVariants(string phone)
    {
        var digits = new string(phone.Where(char.IsAsciiDigit).ToArray());
        if (digits.Length < MinPhoneDigits) return [];

        var variants = new List<string> { digits };
        var international = phone.TrimStart().StartsWith('+') ? digits
            : digits.StartsWith("00", StringComparison.Ordinal) ? digits[2..]
            : null;
        if (international is not null)
        {
            variants.Add("00" + international);
            for (var codeLength = 1; codeLength <= 3 && international.Length - codeLength >= MinPhoneDigits; codeLength++)
            {
                variants.Add("0" + international[codeLength..]);
                variants.Add(international[..codeLength] + "0" + international[codeLength..]); // "+49 (0) 170 ..."
                variants.Add(international[codeLength..]);
            }
        }
        return variants.Distinct().OrderByDescending(v => v.Length).ToList();
    }

    /// <summary>Digits with any common separators in between, optionally a leading plus, never inside a longer digit run.</summary>
    private static string PhonePattern(string digits)
    {
        var pattern = new StringBuilder(@"(?<![\d])\+?");
        for (var i = 0; i < digits.Length; i++)
        {
            if (i > 0) pattern.Append(@"[\s\-/.()]*");
            pattern.Append(digits[i]);
        }
        return pattern.Append(@"(?![\d])").ToString();
    }

    private static string Restore(string text, string? value, string token, params string[] aliases)
    {
        if (string.IsNullOrEmpty(value)) return text;
        var result = text.Replace(token, value, StringComparison.OrdinalIgnoreCase);
        foreach (var alias in aliases)
        {
            result = result.Replace(alias, value, StringComparison.OrdinalIgnoreCase);
        }
        return result;
    }
}
