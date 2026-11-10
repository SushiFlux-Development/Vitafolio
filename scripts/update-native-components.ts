/**
 * Maintenance tool (needs the network): lists the Rust libraries that are compiled into the native Typst library of the NuGet package typstsharp,
 * with licence and licence text, and writes scripts/native-components/typstsharp-<version>.json. THIRD-PARTY-NOTICES.md is generated from it by
 * scripts/generate-third-party-notices.ts; the normal build and the release check never touch the network.
 *
 *   node scripts/update-native-components.ts <typstsharp-version> <commit> [cache-folder]
 *
 * <commit> is the commit of github.com/evolvedlight/typstsharp the NuGet package was built from (the <repository commit="..."> in its .nuspec).
 *
 * What it does:
 *   1. reads src/typst_core/Cargo.lock of that commit and follows the dependencies from the crate "typst_core" - leaving out the build-only
 *      subtree of csbindgen (it generates the C# bindings and is not part of the library);
 *   2. asks crates.io for the licence of each crate and downloads the crate archives to read their licence files; where an archive has none,
 *      the licence files of the crate's GitHub repository are used;
 *   3. adds what is bundled without being a crate: the Typst notices, the fonts and data embedded by typst-assets (listed in its NOTICE file), and
 *      the vendored OpenSSL of the Linux build.
 * The cache folder (default: none) keeps the answers of steps 2, so a rerun does not ask the servers again.
 *
 * Not determined (and said so in the output): crates whose upstream repository carries no licence file. The licence is then the one crates.io
 * names, and the text says so instead of inventing a copyright line.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const [version, commit, cacheArg] = process.argv.slice(2)
if (!version || !commit) {
  console.error('usage: node scripts/update-native-components.ts <typstsharp-version> <commit> [cache-folder]')
  process.exit(2)
}
const root = resolve(import.meta.dirname, '..')
const cache = cacheArg ? resolve(cacheArg) : null
if (cache) mkdirSync(cache, { recursive: true })
const agent = { 'User-Agent': 'licence audit of an open-source project (see the repository)' }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function text(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: agent })
  return res.status === 200 ? await res.text() : null
}

function readCache<T>(name: string): Record<string, T> {
  const file = cache ? join(cache, name) : null
  return file && existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, T>) : {}
}
function writeCache(name: string, data: unknown) {
  if (cache) writeFileSync(join(cache, name), JSON.stringify(data))
}

// ---- 1. the crates ----
interface Pkg {
  name: string
  version: string
  deps: string[]
}
const base = `https://raw.githubusercontent.com/evolvedlight/typstsharp/${commit}`
const lock = await text(`${base}/src/typst_core/Cargo.lock`)
if (!lock) throw new Error('Cargo.lock not found at that commit.')
const pkgs: Pkg[] = lock
  .split('[[package]]')
  .slice(1)
  .map((block) => ({
    name: /^name = "([^"]+)"/m.exec(block)![1]!,
    version: /^version = "([^"]+)"/m.exec(block)![1]!,
    deps: [...(/^dependencies = \[([\s\S]*?)^\]/m.exec(block)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]!),
  }))
const byKey = new Map(pkgs.map((p) => [`${p.name} ${p.version}`, p]))
const byName = new Map<string, Pkg>()
for (const p of pkgs) if (!byName.has(p.name)) byName.set(p.name, p)
const resolveDep = (dep: string) => {
  const [n, v] = dep.split(' ')
  return (v ? byKey.get(`${n} ${v}`) : undefined) ?? byName.get(n!)
}
const seen = new Set<string>()
const stack = [pkgs.find((p) => p.name === 'typst_core')!]
while (stack.length > 0) {
  const p = stack.pop()!
  const key = `${p.name} ${p.version}`
  if (seen.has(key)) continue
  seen.add(key)
  for (const d of p.deps) {
    const q = resolveDep(d)
    if (q && q.name !== 'csbindgen') stack.push(q)
  }
}
seen.delete('typst_core 0.0.1')
const keys = [...seen].sort()
console.log(`${keys.length} crates`)

// ---- 2. licences and texts ----
const meta = readCache<{ license: string; repository: string | null }>('crates.json')
for (const key of keys) {
  if (meta[key]?.license) continue
  const [name, v] = key.split(' ')
  const res = await fetch(`https://crates.io/api/v1/crates/${name}/${v}`, { headers: agent })
  if (res.status !== 200) throw new Error(`crates.io: ${key} -> HTTP ${res.status}`)
  const version_ = ((await res.json()) as { version: { license: string } }).version
  const crateRes = await fetch(`https://crates.io/api/v1/crates/${name}`, { headers: agent })
  const crate = crateRes.status === 200 ? ((await crateRes.json()) as { crate: { repository?: string; homepage?: string } }).crate : {}
  meta[key] = { license: version_.license, repository: crate.repository ?? crate.homepage ?? null }
  writeCache('crates.json', meta)
  await sleep(1100)
}

type TextFile = { file: string; text: string }
const texts = readCache<{ files: TextFile[] }>('crate-texts.json')
const wanted = /^(licen[cs]e|copying|notice|unlicense|copyright)([-_.].*)?$/i
const work = join(tmpdir(), 'native-components-work')
mkdirSync(work, { recursive: true })
for (const key of keys) {
  if (texts[key]) continue
  const [name, v] = key.split(' ')
  const res = await fetch(`https://static.crates.io/crates/${name}/${name}-${v}.crate`, { headers: agent })
  if (res.status !== 200) throw new Error(`crate archive: ${key} -> HTTP ${res.status}`)
  const archive = join(work, `${name}-${v}.crate`)
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
  const prefix = `${name}-${v}/`
  const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean)
  const files = listing
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/') && wanted.test(p.slice(prefix.length)))
    .map((p) => ({ file: p.slice(prefix.length), text: execFileSync('tar', ['-xzOf', archive, p], { encoding: 'utf8', maxBuffer: 1 << 26 }) }))
  rmSync(archive, { force: true })
  texts[key] = { files }
  writeCache('crate-texts.json', texts)
}

// An archive without licence files: the licence files of the crate's repository (or, for the typst crates, of the Typst repository)
const typstLicense = await text('https://raw.githubusercontent.com/typst/typst/v0.15.1/LICENSE')
const typstNotice = await text('https://raw.githubusercontent.com/typst/typst/v0.15.1/NOTICE')
const assetsNotice = await text('https://raw.githubusercontent.com/typst/typst-assets/v0.15.1/NOTICE')
if (!typstLicense || !typstNotice || !assetsNotice) throw new Error('Typst licence files not found.')
const fileNames = ['LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'LICENSE_MIT', 'LICENSE_APACHE', 'LICENCE.rst', 'LICENSE.md', 'LICENSE-MIT.md', 'LICENSE-APACHE.md', 'LICENSE.txt', 'COPYING']
const missing: string[] = []
for (const key of keys) {
  if (texts[key]!.files.length > 0) continue
  if (key.startsWith('typst')) {
    texts[key]!.files = [{ file: 'LICENSE (Typst repository)', text: typstLicense }]
    continue
  }
  const m = /github\.com\/([^/]+)\/([^/.]+)/.exec(meta[key]!.repository ?? '')
  if (m) {
    for (const name of fileNames) {
      const body = await text(`https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/${name}`)
      if (body) texts[key]!.files.push({ file: `${name} (${m[1]}/${m[2]})`, text: body })
    }
  }
  if (texts[key]!.files.length === 0) missing.push(key)
}
writeCache('crate-texts.json', texts)

// ---- 3. assemble ----
const pool: string[] = []
const indexOf = (value: string): number => {
  const clean = value.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim()
  const found = pool.indexOf(clean)
  if (found >= 0) return found
  pool.push(clean)
  return pool.length - 1
}
const noFile = (key: string) =>
  `Im Quelltext dieses Pakets (${meta[key]!.repository ?? 'ohne Repository-Angabe'}) liegt keine Lizenzdatei. Die Lizenz laut crates.io ist ${meta[key]!.license}; ein Urheberrechtsvermerk ist nicht ermittelbar.`

const crates = keys.map((key): [string, string, string, string, number[]] => {
  const [name, v] = key.split(' ')
  const info = meta[key]!
  const own = texts[key]!.files.map((f) => indexOf(f.text))
  return [name!, v!, info.license, info.repository ?? `https://crates.io/crates/${name}/${v}`, own.length > 0 ? [...new Set(own)] : [indexOf(noFile(key))]]
})

const assets = indexOf(assetsNotice)
const bundled = [
  { name: 'Typst', version: '0.15.1', license: 'Apache-2.0', url: 'https://github.com/typst/typst', text: [indexOf(typstLicense), indexOf(typstNotice)] },
  { name: 'Libertinus Serif (in typst-assets)', version: '0.15.1', license: 'OFL-1.1', url: 'https://github.com/typst/typst-assets', text: [assets] },
  { name: 'New Computer Modern, ohne NewCM10-Regular (in typst-assets)', version: '0.15.1', license: 'GUST-FONT-LICENSE', url: 'https://github.com/typst/typst-assets', text: [assets] },
  { name: 'New Computer Modern 10 Regular, mit Font- und Distribution-Exception (in typst-assets)', version: '0.15.1', license: 'GPL-3.0-or-later WITH Font-exception-2.0', url: 'https://github.com/typst/typst-assets', text: [assets] },
  { name: 'DejaVu Sans Mono (in typst-assets)', version: '0.15.1', license: 'Bitstream-Vera', url: 'https://github.com/typst/typst-assets', text: [assets] },
  { name: 'Foxit-PDF-Standardschriften (in typst-assets)', version: '0.15.1', license: 'BSD-3-Clause', url: 'https://github.com/typst/typst-assets', text: [assets] },
  { name: 'ICC-Farbprofile (in typst-assets)', version: '0.15.1', license: 'CC0-1.0', url: 'https://github.com/typst/typst-assets', text: [assets] },
  { name: 'WHATWG HTML- und Fetch-Daten (in typst-assets)', version: '0.15.1', license: 'CC-BY-4.0', url: 'https://github.com/typst/typst-assets', text: [assets] },
  { name: 'W3C-Dokumentdaten (in typst-assets)', version: '0.15.1', license: 'W3C-20150513', url: 'https://github.com/typst/typst-assets', text: [assets] },
]
// The vendored OpenSSL of the Linux build (crate openssl-src); Windows uses the system's TLS
const openssl = /^openssl-src (\d+\.\d+\.\d+\+(\d+\.\d+\.\d+))$/.exec(keys.find((k) => k.startsWith('openssl-src '))!)
if (openssl) {
  const tag = `openssl-${openssl[2]}`
  const licenseText = (await text(`https://raw.githubusercontent.com/openssl/openssl/${tag}/LICENSE.txt`)) ?? (await text('https://raw.githubusercontent.com/openssl/openssl/master/LICENSE.txt'))
  if (licenseText) bundled.push({ name: 'OpenSSL (Linux-Build, über openssl-src eingebunden)', version: openssl[2]!, license: 'Apache-2.0', url: 'https://github.com/openssl/openssl', text: [indexOf(licenseText)] })
  else missing.push('OpenSSL LICENSE.txt')
}

const out = {
  parent: `typstsharp ${version}`,
  component: 'Server (Typst-Bibliothek)',
  source: `Cargo.lock von github.com/evolvedlight/typstsharp@${commit.slice(0, 7)}, Lizenzangaben von crates.io, Lizenztexte aus den crates.io-Archiven bzw. den Repositories`,
  retrieved: new Date().toISOString().slice(0, 10),
  texts: pool,
  bundled,
  crates,
}
const file = join(root, 'scripts', 'native-components', `typstsharp-${version}.json`)
mkdirSync(join(root, 'scripts', 'native-components'), { recursive: true })
writeFileSync(file, JSON.stringify(out))
console.log(`${file}: ${crates.length} crates, ${bundled.length} bundled parts, ${pool.length} distinct texts`)
if (missing.length > 0) console.log(`No licence file found upstream (note written instead): ${missing.join(', ')}`)
