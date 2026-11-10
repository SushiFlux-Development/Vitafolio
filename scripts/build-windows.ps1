<#
  Builds the Windows program and its installer:

    artifacts\windows\<Product>-win-Setup.exe      the installer (Velopack; installs per user, no administrator rights needed)
    artifacts\windows\<Product>-<version>-full.nupkg, releases.win.json, RELEASES   the update feed files
    artifacts\windows\<Product>-win-Portable.zip                                    the program as a plain ZIP (no installation)

  Steps: "dotnet publish" of src\Cv.Desktop (win-x64, self-contained; the built web UI from frontend\dist is part of it), the channel marker
  next to the program, then Velopack's "vpk pack" (the vpk tool is pinned in .config\dotnet-tools.json and restored on the first run).
  The product name is read from branding.json - it is never typed here. The version comes from version.txt (written by the pre-commit hook);
  without it (before the first commit) 0.0.1 is used and a warning is printed.

  Switches: -Beta     channel "beta"     (package version 2026.11.12-beta.13.557, release tag v2026.11.12.13.557-beta)
            -Nightly  channel "nightly"  (package version 2026.11.12-alpha.13.557, release tag v2026.11.12.13.557-nightly)
            -SkipFrontend  do not run "npm run build" first (frontend\dist must exist then)
  Without a switch the channel is "release" (package version 2026.11.12, release tag v2026.11.12). There is no installer for a development build:
  that runs from the source folder. "alpha" is the package label of a nightly on purpose: the package version is compared as a SemVer, which sorts
  pre-release labels alphabetically (alpha < beta < none), and the program's own update rule ranks a nightly below the beta and the release of the
  same commit in the same way.
  The program folder carries LICENSE, THIRD-PARTY-NOTICES.md and CHANGELOG.md (checked below), so every installer contains the licence texts.
  Not signed: the exe and the installer carry no code signature, so Windows SmartScreen warns on first start. Signing needs a certificate
  and is a separate step of the release process.

  Windows PowerShell 5.1 compatible. Console output is German and ASCII-only.
  Aufruf:  .\scripts\build-windows.ps1 [-Beta | -Nightly] [-SkipFrontend]
#>
param(
    [switch]$Beta,
    [switch]$Nightly,
    [switch]$SkipFrontend
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$artifacts = Join-Path $root 'artifacts'
$publish = Join-Path $artifacts 'windows-cache\publish'
$out = Join-Path $artifacts 'windows'

function Invoke-Native([string]$File, [string[]]$Arguments) {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$File $($Arguments -join ' ') ist fehlgeschlagen (Exitcode $LASTEXITCODE)." }
}

if ($Beta -and $Nightly) { throw 'Nur einer der Schalter -Beta oder -Nightly darf gesetzt sein.' }
$channel = if ($Beta) { 'beta' } elseif ($Nightly) { 'nightly' } else { 'release' }

# ---- product name (branding.json is the only place) -----------------------------------------------------------------------------
$branding = Get-Content -LiteralPath (Join-Path $root 'branding.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$product = $branding.name
if (-not $product) { throw 'branding.json enthaelt keinen Namen.' }
$company = $branding.company
if (-not $company) { throw 'branding.json enthaelt keine Firma.' }

# ---- version: version.txt line 1 = vYear.Month.Commit, line 2 = vYear.Month.Commit.Prompts.Lines --------------------------------
$versionFile = Join-Path $root 'version.txt'
$semver = '0.0.1'
if (Test-Path -LiteralPath $versionFile) {
    $lines = @(Get-Content -LiteralPath $versionFile | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($lines.Count -gt 0 -and $lines[0] -match '^v?(\d+\.\d+\.\d+)$') {
        $semver = $Matches[1]
        if ($channel -ne 'release') {
            $counters = ''
            if ($lines.Count -gt 1 -and $lines[1] -match ('^v?' + [regex]::Escape($semver) + '\.(\d+)\.(\d+)$')) { $counters = ".$($Matches[1]).$($Matches[2])" }
            # SemVer sorts pre-release labels alphabetically: "alpha" makes a nightly older than the beta of the same commit, as the app's update rule says.
            # (The Velopack channel stays "nightly": only the package version carries the label.)
            $label = if ($channel -eq 'nightly') { 'alpha' } else { $channel }
            $semver = "$semver-$label$counters"
        }
    }
    else { Write-Warning "version.txt Zeile 1 hat nicht die Form vJahr.Monat.Commit - es wird $semver verwendet." }
}
else { Write-Warning "version.txt fehlt (vor dem ersten Commit) - es wird die Version $semver verwendet." }
Write-Host "== $product $semver (Kanal $channel)"

# ---- 1. web UI --------------------------------------------------------------------------------------------------------------------
$dist = Join-Path $root 'frontend\dist'
if (-not $SkipFrontend) {
    Push-Location (Join-Path $root 'frontend')
    try {
        if (-not (Test-Path -LiteralPath 'node_modules')) { Invoke-Native 'npm' @('ci', '--no-fund', '--no-audit') }
        Write-Host '== Baue die Oberflaeche (npm run build) ...'
        Invoke-Native 'npm' @('run', 'build')
    }
    finally { Pop-Location }
}
if (-not (Test-Path -LiteralPath (Join-Path $dist 'index.html'))) { throw 'frontend\dist\index.html fehlt (Oberflaeche nicht gebaut).' }

# ---- 2. program -------------------------------------------------------------------------------------------------------------------
if (Test-Path -LiteralPath $publish) { Remove-Item -LiteralPath $publish -Recurse -Force }
Write-Host '== Veroeffentliche das Programm (win-x64, eigenstaendig) ...'
$numeric = ($semver -split '-')[0]
Invoke-Native 'dotnet' @('publish', (Join-Path $root 'src\Cv.Desktop\Cv.Desktop.csproj'), '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true',
    '-o', $publish, '-p:DebugType=none', "-p:Version=$numeric")
$exeName = "$product.exe"
if (-not (Test-Path -LiteralPath (Join-Path $publish $exeName))) { throw "$exeName wurde nicht erzeugt." }
# Development settings of the server are not part of the program
Remove-Item -LiteralPath (Join-Path $publish 'appsettings.Development.json') -Force -ErrorAction SilentlyContinue
# Every installer carries the licence texts and the changelog of this version
foreach ($legal in @('LICENSE', 'THIRD-PARTY-NOTICES.md', 'CHANGELOG.md', 'version.txt')) {
    if (-not (Test-Path -LiteralPath (Join-Path $publish $legal))) { throw "$legal fehlt im Programmordner (der Installer muss die Lizenztexte enthalten)." }
}
# The channel marker the program reads (release / beta / nightly)
[IO.File]::WriteAllText((Join-Path $publish 'release-channel.txt'), $channel, (New-Object System.Text.UTF8Encoding($false)))

# ---- 3. installer -----------------------------------------------------------------------------------------------------------------
Write-Host '== Erzeuge den Installer (Velopack) ...'
Push-Location $root
try {
    Invoke-Native 'dotnet' @('tool', 'restore')
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    $pack = @('tool', 'run', 'vpk', 'pack',
        '--packId', $product, '--packTitle', $product, '--packAuthors', $company,
        '--packVersion', $semver, '--packDir', $publish, '--mainExe', $exeName,
        '--icon', (Join-Path $root 'src\Cv.Desktop\Assets\app.ico'), '--outputDir', $out, '--runtime', 'win-x64')
    if ($channel -ne 'release') { $pack += @('--channel', $channel) }
    Invoke-Native 'dotnet' $pack
}
finally { Pop-Location }

Write-Host "== Fertig: $out"
Get-ChildItem -LiteralPath $out | ForEach-Object { Write-Host ("   {0}  ({1} MB)" -f $_.Name, [math]::Round($_.Length / 1MB, 1)) }
Write-Warning 'Nicht signiert: Windows SmartScreen warnt beim ersten Start. Die Signatur ist ein eigener Schritt des Release-Prozesses.'
