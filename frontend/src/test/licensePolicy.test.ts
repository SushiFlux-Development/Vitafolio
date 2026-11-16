// Copyright (c) 2026 SushiFlux Development
import { describe, expect, it } from 'vitest'
import licenses from '../../public/third-party-licenses.json'
import policyFile from '../../../scripts/license-policy.json'
import { evaluateLicense, findIssues, type LicensePolicy } from '../../../scripts/license-policy'

const policy = policyFile as LicensePolicy

// Small own policy for the "pending" logic: the real policy has no pending entries any more.
const testPolicy: LicensePolicy = {
  ...policy,
  allowed: ['0BSD', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC-BY-3.0', 'CC-BY-4.0', 'CC0-1.0', 'ISC', 'MIT', 'OFL-1.1', 'PSF-2.0', 'Unlicense', 'Zlib'],
  pendingOwnerDecision: { 'Unicode-3.0': 'test', 'MPL-2.0': 'test' },
}

interface Entry {
  name: string
  version: string
  license: string
  component: string
  text: string | null
}
const entries = licenses as Entry[]

describe('licence expressions', () => {
  it.each([
    ['MIT', 'allowed'],
    ['mit', 'allowed'],
    ['Apache-2.0', 'allowed'],
    ['BSD-3-Clause', 'allowed'],
    ['OFL-1.1', 'allowed'],
    ['CC-BY-4.0', 'allowed'],
    ['0BSD', 'allowed'],
    ['MIT OR Apache-2.0', 'allowed'],
    ['MIT/Apache-2.0', 'allowed'],
    ['Apache-2.0 / MIT', 'allowed'],
    ['Unlicense/MIT', 'allowed'],
    ['Apache-2.0 WITH LLVM-exception', 'allowed'],
    ['Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT', 'allowed'],
    ['(MIT OR Apache-2.0) AND Zlib', 'allowed'],
    ['MIT OR Apache-2.0 OR LGPL-2.1-or-later', 'allowed'],
    ['GPL-3.0-only OR MIT', 'allowed'],
    ['Unicode-3.0', 'pending'],
    ['MPL-2.0', 'pending'],
    ['(MIT OR Apache-2.0) AND Unicode-3.0', 'pending'],
    ['MIT AND GPL-3.0-only', 'denied'],
    ['GPL-3.0-only', 'denied'],
    ['AGPL-3.0-only', 'denied'],
    ['LGPL-2.1-or-later', 'denied'],
    ['SSPL-1.0', 'denied'],
    ['BUSL-1.1', 'denied'],
    ['CC-BY-NC-4.0', 'denied'],
    ['BlueOak-1.0.0', 'denied'],
    ['UNKNOWN', 'denied'],
    ['unknown', 'denied'],
    ['', 'denied'],
    ['Siehe https://aka.ms/deprecateLicenseUrl', 'denied'],
    ['Siehe Lizenzdatei (LICENSE.txt)', 'denied'],
    ['(MIT OR', 'denied'],
    ['MIT AND', 'denied'],
    ['MIT Apache-2.0', 'denied'],
  ])('%j is %s', (license, verdict) => {
    expect(evaluateLicense(license, testPolicy).verdict).toBe(verdict)
  })

  it('treats a missing licence as denied', () => {
    expect(evaluateLicense(null, policy).verdict).toBe('denied')
    expect(evaluateLicense(undefined, policy).verdict).toBe('denied')
  })

  it('names the licence that decides', () => {
    expect(evaluateLicense('MIT AND GPL-3.0-only', testPolicy).reasons).toEqual(['GPL-3.0-only'])
    expect(evaluateLicense('(MIT OR Apache-2.0) AND Unicode-3.0', testPolicy).reasons).toEqual(['Unicode-3.0'])
  })

  it('lists only the entries that are not plainly allowed', () => {
    const found = findIssues(
      [
        { name: 'a', version: '1', license: 'MIT' },
        { name: 'b', version: '1', license: 'GPL-3.0-only' },
        { name: 'c', version: '1', license: 'Unicode-3.0' },
      ],
      testPolicy,
    )
    expect(found.map((f) => [f.name, f.verdict])).toEqual([
      ['b', 'denied'],
      ['c', 'pending'],
    ])
  })

  it('has an allowed list that is exactly the one the owner released', () => {
    expect([...policy.allowed].sort()).toEqual(
      ['0BSD', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC-BY-3.0', 'CC-BY-4.0', 'CC0-1.0', 'ISC', 'MIT', 'OFL-1.1', 'PSF-2.0', 'Unlicense', 'Zlib', 'Unicode-3.0', 'MPL-2.0', 'GUST-FONT-LICENSE', 'GPL-3.0-or-later WITH Font-exception-2.0', 'Bitstream-Vera', 'W3C-20150513', 'blessing'].sort(),
    )
  })

  it('treats the six newly released licences as allowed in the real policy', () => {
    for (const id of ['Unicode-3.0', 'MPL-2.0', 'GUST-FONT-LICENSE', 'GPL-3.0-or-later WITH Font-exception-2.0', 'Bitstream-Vera', 'W3C-20150513']) {
      expect(evaluateLicense(id, policy).verdict, id).toBe('allowed')
    }
  })
})

describe('the committed licence list of the product', () => {
  it('has no unknown or not allowed licence', () => {
    const denied = findIssues(entries, policy).filter((issue) => issue.verdict === 'denied')
    expect(denied).toEqual([])
  })

  it('has no licence waiting for the owner', () => {
    expect(Object.keys(policy.pendingOwnerDecision)).toEqual([])
    const pending = findIssues(entries, policy).filter((issue) => issue.verdict === 'pending')
    expect(pending).toEqual([])
  })

  it('does not ship the approved build tools', () => {
    const names = new Set(entries.map((e) => e.name))
    for (const tool of Object.keys(policy.buildToolsNotShipped)) expect(names.has(tool)).toBe(false)
  })

  it('has no development-only packages in the web part', () => {
    const web = entries.filter((e) => e.component === 'Web-Oberfläche').map((e) => e.name)
    expect(web.some((name) => name.startsWith('@typescript/'))).toBe(false)
    expect(web).toContain('react')
    expect(web).toContain('i18next')
  })

  it('has the full licence text for everything that is not part of the native library', () => {
    const missing = entries.filter((e) => e.component !== 'Server (Typst-Bibliothek)' && !e.text).map((e) => `${e.name} ${e.version}`)
    expect(missing).toEqual([])
  })

  it.each([
    ['PdfPig', 'Apache License'],
    ['typstsharp', 'MIT License'],
    ['SQLitePCLRaw.core', 'Apache License'],
    ['SQLitePCLRaw.config.e_sqlite3', 'Apache License'],
    ['Velopack', 'Permission is hereby granted'],
    ['qrcode-generator', 'MIT License'],
    ['Microsoft.EntityFrameworkCore', 'MIT License'],
    ['DocumentFormat.OpenXml', 'MIT License'],
  ])('carries the full upstream text for %s', (name, phrase) => {
    const entry = entries.find((e) => e.name === name)
    expect(entry, name).toBeDefined()
    expect(entry!.text, name).toContain(phrase)
    expect(entry!.text!.length, name).toBeGreaterThan(900)
  })

  it('names the Rust libraries inside the native Typst library, including the vendored OpenSSL and the embedded fonts', () => {
    const native = entries.filter((e) => e.component === 'Server (Typst-Bibliothek)')
    expect(native.length).toBeGreaterThan(300)
    const names = native.map((e) => e.name)
    expect(names).toContain('typst-pdf')
    expect(names).toContain('krilla')
    expect(names.some((n) => n.startsWith('OpenSSL'))).toBe(true)
    expect(names.some((n) => n.startsWith('Libertinus Serif'))).toBe(true)
    expect(names.some((n) => n.startsWith('New Computer Modern 10 Regular'))).toBe(true)
  })

  it('has every shipped font family with its licence', () => {
    const fonts = entries.filter((e) => e.name.endsWith('(Schrift)')).map((e) => e.name.replace(' (Schrift)', ''))
    expect(fonts.sort()).toEqual([
      'EB Garamond',
      'IBM Plex Sans',
      'IBM Plex Serif',
      'Inter',
      'Lato',
      'Liberation Sans',
      'Liberation Serif',
      'Lora',
      'Merriweather',
      'Open Sans',
      'Roboto',
      'Source Sans 3',
      'Source Serif 4',
      'Work Sans',
    ])
  })
})
