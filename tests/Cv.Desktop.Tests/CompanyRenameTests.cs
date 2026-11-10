// Copyright (c) 2026 SushiFlux Development
using Cv.Desktop.Hosting;
using Cv.Server.Configuration;

namespace Cv.Desktop.Tests;

/// <summary>
/// The data folder of the Windows program is %LOCALAPPDATA%\&lt;Company&gt;\&lt;Product&gt;; when the company name changes (branding.json
/// "previousCompanies"), the folder of the earlier name is moved once - all at once, never merged, never lost.
/// </summary>
public sealed class CompanyRenameTests : IDisposable
{
    private readonly string _local = Path.Combine(Path.GetTempPath(), "cv-rename-tests", Guid.NewGuid().ToString("N"));

    private string OldFolder => Path.Combine(_local, "Old Company", "Product");

    private string NewFolder => Path.Combine(_local, "New Company", "Product");

    private DesktopPaths Paths(string? legacy = null) => new(NewFolder, legacy, [OldFolder]);

    private void FillOld()
    {
        Directory.CreateDirectory(Path.Combine(OldFolder, "keys"));
        Directory.CreateDirectory(Path.Combine(OldFolder, "backups"));
        Directory.CreateDirectory(Path.Combine(OldFolder, "webview", "EBWebView"));
        File.WriteAllText(Path.Combine(OldFolder, "app.db"), "database");
        File.WriteAllText(Path.Combine(OldFolder, "keys", "jwt-signing.key"), "key");
        File.WriteAllText(Path.Combine(OldFolder, "backups", "one.zip"), "backup");
        File.WriteAllText(Path.Combine(OldFolder, "webview", "EBWebView", "cookies"), "cookie");
        File.WriteAllText(Path.Combine(OldFolder, "window.json"), "{}");
    }

    [Fact]
    public void The_whole_folder_of_the_earlier_company_name_moves_once_and_the_empty_company_folder_goes()
    {
        FillOld();

        var result = Paths().PrepareDataFolder();

        Assert.Null(result.Problem);
        Assert.NotNull(result.LogMessage);
        Assert.Equal(NewFolder, result.Paths.DataDirectory);
        Assert.Equal("database", File.ReadAllText(Path.Combine(NewFolder, "app.db")));
        Assert.Equal("key", File.ReadAllText(Path.Combine(NewFolder, "keys", "jwt-signing.key")));
        Assert.Equal("backup", File.ReadAllText(Path.Combine(NewFolder, "backups", "one.zip")));
        Assert.Equal("cookie", File.ReadAllText(Path.Combine(NewFolder, "webview", "EBWebView", "cookies")));
        Assert.False(Directory.Exists(OldFolder));
        Assert.False(Directory.Exists(Path.GetDirectoryName(OldFolder)), "the company folder is empty and is removed");

        // The second start finds nothing to do
        Assert.Null(Paths().PrepareDataFolder().LogMessage);
    }

    [Fact]
    public void The_company_folder_stays_when_it_holds_something_else()
    {
        FillOld();
        File.WriteAllText(Path.Combine(Path.GetDirectoryName(OldFolder)!, "other.txt"), "x");

        Assert.Null(Paths().PrepareDataFolder().Problem);

        Assert.True(File.Exists(Path.Combine(Path.GetDirectoryName(OldFolder)!, "other.txt")));
    }

    [Fact]
    public void An_existing_new_folder_is_never_merged_or_overwritten()
    {
        FillOld();
        Directory.CreateDirectory(NewFolder);
        File.WriteAllText(Path.Combine(NewFolder, "app.db"), "newer database");

        var result = Paths().PrepareDataFolder();

        Assert.Null(result.Problem);
        Assert.Equal(NewFolder, result.Paths.DataDirectory);
        Assert.Contains(OldFolder, result.LogMessage);
        Assert.Contains(NewFolder, result.LogMessage);
        Assert.Equal("newer database", File.ReadAllText(Path.Combine(NewFolder, "app.db")));
        Assert.Equal("database", File.ReadAllText(Path.Combine(OldFolder, "app.db")));
        Assert.False(File.Exists(Path.Combine(NewFolder, "keys", "jwt-signing.key")));
    }

    [Fact]
    public void A_folder_without_data_is_left_alone()
    {
        Directory.CreateDirectory(Path.Combine(OldFolder, "logs"));

        var result = Paths().PrepareDataFolder();

        Assert.Null(result.LogMessage);
        Assert.Null(result.Problem);
        Assert.True(Directory.Exists(OldFolder));
        Assert.False(Directory.Exists(Path.GetDirectoryName(NewFolder)));
    }

    [Fact]
    public void A_failed_move_loses_nothing_and_the_program_runs_on_the_old_folder()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows refuses to rename a folder with an open file; other systems do not");
        FillOld();

        // Another program has the database open (no sharing): the rename of the folder cannot succeed
        using var held = new FileStream(Path.Combine(OldFolder, "app.db"), FileMode.Open, FileAccess.Read, FileShare.None);
        var result = Paths().PrepareDataFolder();

        Assert.NotNull(result.Problem);
        Assert.Equal(OldFolder, result.Problem.From);
        Assert.Equal(NewFolder, result.Problem.To);
        Assert.False(string.IsNullOrWhiteSpace(result.Problem.Reason));
        Assert.Equal(OldFolder, result.Paths.DataDirectory);
        Assert.False(Directory.Exists(NewFolder), "nothing arrived half-way");
        Assert.True(File.Exists(Path.Combine(OldFolder, "keys", "jwt-signing.key")));
        Assert.True(File.Exists(Path.Combine(OldFolder, "backups", "one.zip")));

        // After the other program let go, the next start moves everything
        held.Dispose();
        var again = Paths().PrepareDataFolder();
        Assert.Null(again.Problem);
        Assert.Equal("database", File.ReadAllText(Path.Combine(NewFolder, "app.db")));
    }

    [Fact]
    public void The_earlier_company_wins_over_the_old_installer_folder()
    {
        FillOld();
        var installerFolder = Path.Combine(_local, "Product");
        Directory.CreateDirectory(installerFolder);
        File.WriteAllText(Path.Combine(installerFolder, "app.db"), "very old database");
        File.WriteAllText(Path.Combine(installerFolder, "Update.exe"), "installer");

        var result = Paths(installerFolder).PrepareDataFolder();

        Assert.Null(result.Problem);
        Assert.Equal("database", File.ReadAllText(Path.Combine(NewFolder, "app.db")));
        Assert.Equal("very old database", File.ReadAllText(Path.Combine(installerFolder, "app.db")));
        Assert.True(File.Exists(Path.Combine(installerFolder, "Update.exe")));
    }

    [Fact]
    public void The_branding_names_the_earlier_company_and_the_folder_it_used()
    {
        Assert.Contains("SushiFlux Develop", Branding.PreviousCompanies);
        Assert.DoesNotContain(Branding.Company, Branding.PreviousCompanies);
        var directories = Branding.PreviousDesktopDataDirectories(@"C:\Users\someone\AppData\Local");
        Assert.Contains(Path.Combine(@"C:\Users\someone\AppData\Local", "SushiFlux Develop", Branding.ProductName), directories);
        Assert.DoesNotContain(Branding.DesktopDataDirectory(@"C:\Users\someone\AppData\Local"), directories);
    }

    public void Dispose()
    {
        if (Directory.Exists(_local)) Directory.Delete(_local, recursive: true);
    }
}
