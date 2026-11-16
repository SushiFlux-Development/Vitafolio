/**
 * Erzeugt die Drittanbieter-Lizenzhinweise aus den TATSAECHLICH ausgelieferten Abhaengigkeiten:
 *   - THIRD-PARTY-NOTICES.md                     (Repo-Wurzel, inkl. Lizenztexte; kommt in jedes Artefakt: Docker-Image, Windows-Installer)
 *   - frontend/public/third-party-licenses.json  (fuer die Lizenzansicht der App)
 *
 * Frontend: alles, was von den Paketen in "dependencies" aus erreichbar ist (Build-Werkzeuge landen nicht im Produkt).
 * Backend: alle NuGet-Pakete (Server & Desktop) inkl. transitiver Pakete, Lizenz aus der .nuspec.
 * Native Teile: scripts/native-components/*.json (die in typstsharp gebuendelte Rust-Bibliothek, mit scripts/update-native-components.ts erzeugt).
 * Schriften: src/Cv.Server/Documents/Fonts (SIL OFL).
 *
 *   node scripts/generate-third-party-notices.ts                 schreibt die beiden Dateien
 *   node scripts/generate-third-party-notices.ts --check         schreibt nichts; scheitert bei unbekannter oder nicht erlaubter Lizenz, bei
 *                                                                fehlendem Lizenztext und wenn die beiden Dateien nicht mehr aktuell sind
 *                                                                (Lizenzen, die der Inhaber noch freigeben muss, sind dabei nur eine Warnung)
 *   node scripts/generate-third-party-notices.ts --check --strict   wie --check, aber auch "noch freizugeben" ist ein Fehler (Release-Workflow)
 *
 * Die Regeln stehen in scripts/license-policy.json, die Auswertung in scripts/license-policy.ts. Lizenztexte, die ein Paket nicht selbst mitbringt,
 * liegen in scripts/license-texts/ (Herkunft in sources.json).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { evaluateLicense, findIssues, type LicensePolicy } from './license-policy.ts'

interface Entry {
  name: string
  version: string
  license: string
  url: string | null
  component: string
  text: string | null
}

const args = new Set(process.argv.slice(2))
const check = args.has('--check')
const strict = args.has('--strict')

const root = resolve(import.meta.dirname, '..')
const branding = JSON.parse(readFileSync(join(root, 'branding.json'), 'utf8')) as { name: string; company: string }
const policy = JSON.parse(readFileSync(join(root, 'scripts', 'license-policy.json'), 'utf8')) as LicensePolicy
const product = branding.name
const entries: Entry[] = []
const problems: string[] = []
const warnings: string[] = []

const WEB = 'Web-Oberfläche'
const SERVER = 'Server'
const DESKTOP = 'Windows-App'

// ---------- Lizenztexte, die ein Paket nicht selbst mitbringt (mit Herkunft in scripts/license-texts/sources.json) ----------
interface TextSource {
  match: string
  files: string[]
  source: string
}
const textSources = JSON.parse(readFileSync(join(root, 'scripts', 'license-texts', 'sources.json'), 'utf8')) as { nuget: TextSource[]; npm: TextSource[] }

function fallbackText(kind: 'nuget' | 'npm', id: string): string | null {
  const rule = textSources[kind].find((r) => new RegExp(r.match, 'i').test(id))
  if (!rule) return null
  return rule.files.map((f) => readFileSync(join(root, 'scripts', 'license-texts', f), 'utf8').replace(/^﻿/, '').trim()).join('\n\n----\n\n')
}

function licenseText(dir: string, preferred?: string): string | null {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir)
  const file = (preferred && files.find((f) => f.toLowerCase() === preferred.toLowerCase())) || files.find((f) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(f))
  return file ? readFileSync(join(dir, file), 'utf8').replace(/^﻿/, '').trim() : null
}

// ---------- Frontend (npm): the packages the shipped web UI is built from ----------
interface LockPackage {
  version?: string
  license?: string
  link?: boolean
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}
const lockPath = join(root, 'frontend', 'package-lock.json')
const npmShipped = new Set<string>()
if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { packages: Record<string, LockPackage> }
  const packages = lock.packages

  // Node's own lookup: node_modules of the package, then of every folder above it
  const resolveDependency = (from: string, name: string): string | null => {
    let base = from
    for (;;) {
      const candidate = `${base ? base + '/' : ''}node_modules/${name}`
      if (packages[candidate]) return candidate
      if (base === '') return null
      const cut = base.lastIndexOf('/node_modules/')
      base = cut >= 0 ? base.slice(0, cut) : ''
    }
  }
  const queue: string[] = ['']
  const reached = new Set<string>()
  while (queue.length > 0) {
    const path = queue.pop()!
    if (reached.has(path)) continue
    reached.add(path)
    const info = packages[path]
    if (!info) continue
    // The root's devDependencies are deliberately not followed (build tools), nor are peer dependencies: a peer that the product really needs
    // (react for react-dom) is one of its own dependencies anyway, and optional peers such as typescript are never installed for the product
    for (const group of [info.dependencies, info.optionalDependencies]) {
      for (const name of Object.keys(group ?? {})) {
        const found = resolveDependency(path, name)
        if (found) queue.push(found)
      }
    }
  }
  for (const path of reached) {
    if (path === '') continue
    const info = packages[path]!
    if (info.link) continue
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
    npmShipped.add(name)
    const dir = join(root, 'frontend', path)
    let license: string | null = info.license ?? null
    let url: string | null = null
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      license ??= typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? null)
      url = pkg.homepage ?? (typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? null))
    }
    entries.push({
      name,
      version: info.version ?? '?',
      license: license ?? 'UNKNOWN',
      url,
      component: WEB,
      text: licenseText(dir) ?? fallbackText('npm', name),
    })
  }
} else {
  problems.push('frontend/package-lock.json fehlt.')
}

// ---------- Backend (NuGet) ----------
// Pulled in only by Microsoft.EntityFrameworkCore.Design (PrivateAssets=all, used by "dotnet ef"); none of them is part of the published server or
// the Windows program. Microsoft.NET.StringTools comes with Microsoft.Build.Framework since EF Core 11.
const buildOnly = /^(Microsoft\.EntityFrameworkCore\.Design|Microsoft\.CodeAnalysis.*|Humanizer.*|Microsoft\.Build.*|Microsoft\.NET\.StringTools|Mono\.TextTemplating|System\.CodeDom|System\.Composition.*|Microsoft\.VisualStudio\.SolutionPersistence)$/
type NugetListing = {
  projects: {
    frameworks?: {
      topLevelPackages?: { id: string; resolvedVersion: string }[]
      transitivePackages?: { id: string; resolvedVersion: string }[]
    }[]
  }[]
}
const nugetRoot = join(homedir(), '.nuget', 'packages')
const seen = new Set<string>()

const nugetProjects = [
  { csproj: join(root, 'src', 'Cv.Server', 'Cv.Server.csproj'), component: SERVER },
  { csproj: join(root, 'src', 'Cv.Desktop', 'Cv.Desktop.csproj'), component: DESKTOP },
]

for (const project of nugetProjects) {
  if (!existsSync(project.csproj)) continue
  let listing: NugetListing
  try {
    listing = JSON.parse(execFileSync('dotnet', ['list', project.csproj, 'package', '--include-transitive', '--format', 'json'], { encoding: 'utf8', maxBuffer: 1 << 26 })) as NugetListing
  } catch (err) {
    problems.push(`dotnet list package ist für ${project.csproj} fehlgeschlagen (erst "dotnet restore" ausführen): ${String(err).split('\n')[0]}`)
    continue
  }
  for (const fw of listing.projects[0]?.frameworks ?? []) {
    for (const p of [...(fw.topLevelPackages ?? []), ...(fw.transitivePackages ?? [])]) {
      if (seen.has(p.id) || buildOnly.test(p.id)) continue
      seen.add(p.id)
      const dir = join(nugetRoot, p.id.toLowerCase(), p.resolvedVersion)
      let license = 'UNKNOWN'
      let url = `https://www.nuget.org/packages/${p.id}/${p.resolvedVersion}`
      let fileName: string | undefined
      const nuspec = existsSync(dir) ? readdirSync(dir).find((f) => f.endsWith('.nuspec')) : undefined
      if (nuspec) {
        const xml = readFileSync(join(dir, nuspec), 'utf8')
        const expr = /<license\s+type="expression"\s*>([^<]+)<\/license>/i.exec(xml)
        const file = /<license\s+type="file"\s*>([^<]+)<\/license>/i.exec(xml)
        const legacy = /<licenseUrl>([^<]+)<\/licenseUrl>/i.exec(xml)
        fileName = file?.[1]
        license = expr ? expr[1]! : file ? `Siehe Lizenzdatei (${file[1]})` : legacy ? `Siehe ${legacy[1]}` : license
        url = /<projectUrl>([^<]+)<\/projectUrl>/i.exec(xml)?.[1] ?? /<repository[^>]*\burl="([^"]+)"/i.exec(xml)?.[1] ?? url
      }
      const override = policy.overrides[p.id.toLowerCase()]
      if (override && (license === 'UNKNOWN' || license.startsWith('Siehe'))) license = override
      entries.push({
        name: p.id,
        version: p.resolvedVersion,
        license,
        url,
        component: project.component,
        text: licenseText(dir, fileName) ?? fallbackText('nuget', p.id),
      })
    }
  }
}

// ---------- Native parts (the Rust library inside typstsharp) ----------
interface NativeFile {
  parent: string
  component: string
  source: string
  retrieved: string
  /** Distinct licence texts; entries point to them by index. */
  texts: string[]
  /** Parts without their own crate: embedded fonts, the vendored OpenSSL, the Typst notices. */
  bundled: { name: string; version: string; license: string; url: string; text: number[] }[]
  /** [name, version, licence, url, text indexes] */
  crates: [string, string, string, string, number[]][]
}
const nativeDir = join(root, 'scripts', 'native-components')
const nativeNotes: string[] = []
// The licence texts of the Rust libraries are large (several MB); the app's licence list gets the link, the complete texts are in THIRD-PARTY-NOTICES.md
const nativeEntries = new Set<Entry>()
if (existsSync(nativeDir)) {
  for (const file of readdirSync(nativeDir).filter((f) => f.endsWith('.json')).sort()) {
    const data = JSON.parse(readFileSync(join(nativeDir, file), 'utf8')) as NativeFile
    const join_ = (indexes: number[]) => (indexes.length === 0 ? null : indexes.map((i) => data.texts[i]!).join('\n\n----\n\n'))
    for (const b of data.bundled) {
      const entry: Entry = { name: b.name, version: b.version, license: b.license, url: b.url, component: data.component, text: join_(b.text) }
      entries.push(entry)
      nativeEntries.add(entry)
    }
    for (const [name, version, license, url, text] of data.crates) {
      const entry: Entry = { name, version, license, url, component: data.component, text: join_(text) }
      entries.push(entry)
      nativeEntries.add(entry)
    }
    nativeNotes.push(`${data.component}: ${data.crates.length} Rust-Crates und ${data.bundled.length} weitere Teile der nativen Bibliothek von ${data.parent}. Quelle: ${data.source} (Stand ${data.retrieved}).`)
  }
}

// ---------- Schriften fuer Dokumente (mitgeliefert, SIL Open Font License) ----------
// Die Schriftdateien liegen im Repo unter src/Cv.Server/Documents/Fonts; fonts.json nennt Version und Quelle, der Lizenztext liegt je Schrift daneben.
const fontsDir = join(root, 'src', 'Cv.Server', 'Documents', 'Fonts')
const fontManifest = join(fontsDir, 'fonts.json')
if (existsSync(fontManifest)) {
  const fonts = JSON.parse(readFileSync(fontManifest, 'utf8')) as { folder: string; name: string; version: string; license: string; source: string }[]
  for (const font of fonts) {
    const licenseFile = join(fontsDir, font.folder, 'OFL.txt')
    entries.push({
      name: `${font.name} (Schrift)`,
      version: font.version,
      license: font.license,
      url: font.source,
      component: SERVER,
      text: existsSync(licenseFile) ? readFileSync(licenseFile, 'utf8').trim() : null,
    })
  }
}

const normal = (text: string) => text.replace(/\r\n/g, '\n')
const byText = (a: string, b: string) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0)
entries.sort((a, b) => byText(a.component, b.component) || byText(a.name, b.name) || byText(a.version, b.version))

// ---------- Ausgabe ----------
/** A code fence longer than any run of backticks inside the text, so a licence text can never end the block early. */
function fenced(text: string): string[] {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length))
  const fence = '`'.repeat(longest + 1)
  return [fence, text, fence]
}

// The same text for many parts (e.g. the MIT licence of many crates) is printed once, with the list of the parts it belongs to
const groups = new Map<string, Entry[]>()
for (const entry of entries) {
  if (!entry.text) continue
  const list = groups.get(entry.text) ?? []
  list.push(entry)
  groups.set(entry.text, list)
}

const md = normal([
  '# Third-Party Notices / Drittanbieter-Lizenzen',
  '',
  `${product} enthält die folgenden Open-Source-Komponenten. Für sie gelten ausschließlich ihre eigenen Lizenzen.`,
  `${product} includes the following open-source components, each governed solely by its own license.`,
  '',
  `© 2026 ${branding.company} · Hauptlizenz: [GNU Affero General Public License v3.0](LICENSE)`,
  '',
  '_Automatisch erzeugt von `scripts/generate-third-party-notices.ts` – nicht von Hand bearbeiten._',
  '',
  ...nativeNotes.flatMap((note) => [`_${note}_`, '']),
  '| Komponente | Paket | Version | Lizenz | Website / Repository |',
  '|---|---|---|---|---|',
  ...entries.map((e) => `| ${e.component} | ${e.name} | ${e.version} | ${e.license} | ${e.url ? `[Link](${e.url})` : '-'} |`),
  '',
  '## Lizenztexte / License Texts',
  '',
  ...[...groups.entries()].flatMap(([text, members]) => {
    const [first, ...rest] = members as [Entry, ...Entry[]]
    const licenses = [...new Set(members.map((m) => m.license))].join('; ')
    const names = members.map((m) => `${m.name} ${m.version}`)
    return [
      `### ${first.name} (${first.version})${rest.length > 0 ? ` und ${rest.length} weitere` : ''} - ${licenses}`,
      '',
      ...(rest.length > 0 ? [`Gilt für / applies to: ${names.join(', ')}`, ''] : []),
      ...fenced(text),
      '',
    ]
  }),
].join('\n'))

const json = JSON.stringify(entries.map((e) => (nativeEntries.has(e) ? { ...e, text: null } : e)), null, 2)

// ---------- Prüfung ----------
// 1. every part has an acceptable licence
// (grouped by the licence that decides, so a library family with one licence is one line)
const grouped = new Map<string, { verdict: string; reason: string; parts: string[] }>()
for (const issue of findIssues(entries, policy)) {
  const reason = issue.reasons.join(' + ')
  const key = `${issue.verdict}|${reason}`
  const group = grouped.get(key) ?? { verdict: issue.verdict, reason, parts: [] }
  group.parts.push(`${issue.name} ${issue.version}`)
  grouped.set(key, group)
}
for (const group of grouped.values()) {
  const line = `Lizenz "${group.reason}" bei ${group.parts.length} Komponente(n): ${group.parts.join(', ')}`
  if (group.verdict === 'denied') problems.push(`nicht erlaubte oder unbekannte ${line}`)
  else (strict ? problems : warnings).push(`noch vom Inhaber freizugeben (scripts/license-policy.json): ${line}`)
}
// 2. the full licence text is shipped
for (const entry of entries) {
  if (!entry.text) problems.push(`kein Lizenztext: ${entry.name} ${entry.version} (${entry.license}) - Text nach scripts/license-texts/ legen und in sources.json eintragen`)
}
// 3. approved build tools must not be part of what is shipped
for (const tool of Object.keys(policy.buildToolsNotShipped)) {
  if (npmShipped.has(tool)) problems.push(`${tool} ist als Build-Werkzeug freigegeben, steckt aber im ausgelieferten Teil`)
}
// 4. a licence the policy cannot read is an error already caught above; make sure the policy itself is sane
for (const id of policy.allowed) {
  if (evaluateLicense(id, policy).verdict !== 'allowed') problems.push(`license-policy.json: "${id}" wird nicht als erlaubt erkannt`)
}

const mdPath = join(root, 'THIRD-PARTY-NOTICES.md')
const jsonPath = join(root, 'frontend', 'public', 'third-party-licenses.json')

if (check) {
  if (!existsSync(mdPath) || normal(readFileSync(mdPath, 'utf8')) !== md) problems.push('THIRD-PARTY-NOTICES.md ist nicht aktuell (scripts/build-notices.ps1 ausführen)')
  if (!existsSync(jsonPath) || normal(readFileSync(jsonPath, 'utf8')) !== json) problems.push('frontend/public/third-party-licenses.json ist nicht aktuell (scripts/build-notices.ps1 ausführen)')
  for (const warning of warnings) console.warn(`Warnung: ${warning}`)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`FEHLER: ${problem}`)
    console.error(`${problems.length} Problem(e), ${entries.length} Komponenten geprüft.`)
    process.exit(1)
  }
  console.log(`Lizenzen in Ordnung: ${entries.length} Komponenten geprüft${warnings.length > 0 ? `, ${warnings.length} noch vom Inhaber freizugeben` : ''}.`)
} else {
  writeFileSync(mdPath, md, 'utf8')
  writeFileSync(jsonPath, json, 'utf8')
  console.log(`${entries.length} Komponenten erfasst -> THIRD-PARTY-NOTICES.md & frontend/public/third-party-licenses.json`)
  for (const warning of warnings) console.warn(`Warnung: ${warning}`)
  for (const problem of problems) console.error(`FEHLER: ${problem}`)
  if (problems.length > 0) process.exit(1)
}
