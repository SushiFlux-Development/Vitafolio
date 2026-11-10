import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import de from './locales/de.json'
import en from './locales/en.json'

const SRC = resolve(import.meta.dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

const FILES = sourceFiles(SRC).map((path) => ({ file: relative(SRC, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }))

/** True when the dotted path is a text (or a plural pair of texts) in the locale. */
function hasText(locale: unknown, path: string): boolean {
  let node: unknown = locale
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return false
    node = (node as Record<string, unknown>)[part]
  }
  if (typeof node === 'string') return true
  const parent = path.split('.').slice(0, -1).reduce<unknown>((current, part) => (current as Record<string, unknown>)[part], locale) as Record<string, unknown>
  const last = path.split('.').at(-1)!
  return typeof parent[`${last}_one`] === 'string' || typeof parent[`${last}_other`] === 'string'
}

/** True when the dotted path is a group of texts (used for keys built as `group.${value}`). */
function hasGroup(locale: unknown, path: string): boolean {
  let node: unknown = locale
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return false
    node = (node as Record<string, unknown>)[part]
  }
  return node !== null && typeof node === 'object'
}

/** Every `t('literal.key')` call in the application code (also `i18n.t(...)`). */
const LITERAL_KEYS = FILES.flatMap(({ file, text }) =>
  [...text.matchAll(/\bt\(\s*(['"])([^'"\n]+)\1/g)].map((match) => ({ file, key: match[2]! })),
)

/** `t(`group.${value}`)`: the group has to exist. */
const GROUPS = FILES.flatMap(({ file, text }) =>
  [...text.matchAll(/\bt\(\s*`([\w.]+?)\.?\$\{/g)].map((match) => ({ file, group: match[1]!.replace(/\.$/, '') })),
)

/** Keys carried in data (`labelKey: 'ai.x'`, `key: 'validation.y'`): any property named like a key holding a dotted path. */
const TOP_LEVEL = new Set(Object.keys(de))
const DATA_KEYS = FILES.flatMap(({ file, text }) =>
  [...text.matchAll(/\b(?:labelKey|textKey|messageKey|titleKey|hintKey|key)\s*:\s*(['"])([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)\1/g)]
    .map((match) => ({ file, key: match[2]! }))
    .filter(({ key }) => TOP_LEVEL.has(key.split('.')[0]!)),
)

describe('translation keys used in the code', () => {
  it('finds a reasonable number of calls (guards against a broken pattern)', () => {
    expect(LITERAL_KEYS.length).toBeGreaterThan(200)
    expect(GROUPS.length).toBeGreaterThan(10)
    expect(DATA_KEYS.length).toBeGreaterThan(30)
  })

  it.each([
    ['German', de],
    ['English', en],
  ])('all literal t() keys exist in the %s texts', (_name, locale) => {
    const missing = LITERAL_KEYS.filter(({ key }) => !hasText(locale, key)).map(({ file, key }) => `${file}: ${key}`)
    expect([...new Set(missing)]).toEqual([])
  })

  it.each([
    ['German', de],
    ['English', en],
  ])('all key groups built with a template exist in the %s texts', (_name, locale) => {
    const missing = GROUPS.filter(({ group }) => !hasGroup(locale, group)).map(({ file, group }) => `${file}: ${group}.*`)
    expect([...new Set(missing)]).toEqual([])
  })

  it.each([
    ['German', de],
    ['English', en],
  ])('all keys carried in data exist in the %s texts', (_name, locale) => {
    const missing = DATA_KEYS.filter(({ key }) => !hasText(locale, key) && !hasGroup(locale, key)).map(({ file, key }) => `${file}: ${key}`)
    expect([...new Set(missing)]).toEqual([])
  })

  it('has no fallback text hidden inside t() (the texts live in the locale files only)', () => {
    const withDefault = FILES.flatMap(({ file, text }) =>
      [...text.matchAll(/\bt\(\s*(['"])[^'"\n]+\1\s*,\s*['"`]/g)].map((match) => `${file}: ${match[0]}`),
    )
    expect(withDefault).toEqual([])
  })
})
