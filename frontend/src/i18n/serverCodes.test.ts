import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import de from './locales/de.json'
import en from './locales/en.json'

// The server's own source sits next to the frontend in the repository; a build that has only the frontend skips this check.
const SERVER = resolve(import.meta.dirname, '..', '..', '..', 'src', 'Cv.Server')

function csFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'Migrations' || name === 'obj' || name === 'bin' ? [] : csFiles(path)
    return name.endsWith('.cs') ? [path] : []
  })
}

/**
 * Every stable error code the server can answer with: `ApiException.X("code", ...)`, `new ApiException(status, "code", ...)` and the code
 * of a field problem (`ApiException.Field("field", "code", ...)`), plus the `validation.*` codes of field errors.
 */
function serverCodes(): string[] {
  const codes = new Set<string>()
  for (const path of csFiles(SERVER)) {
    const text = readFileSync(path, 'utf8')
    for (const match of text.matchAll(/ApiException\.Field\(\s*"[\w.]+",\s*"([\w.]+)"/g)) codes.add(match[1]!)
    for (const match of text.matchAll(/ApiException\.(?!Field|Validation)\w+\(\s*"([\w.]+)"/g)) codes.add(match[1]!)
    for (const match of text.matchAll(/new ApiException\(\s*(?:StatusCodes\.\w+|\d+),\s*"([\w.]+)"/g)) codes.add(match[1]!)
    for (const match of text.matchAll(/"(validation\.[a-z_]+)"/g)) codes.add(match[1]!)
  }
  return [...codes].sort()
}

function textOf(locale: unknown, code: string): unknown {
  let node: unknown = (locale as { errors: { codes: unknown } }).errors.codes
  for (const part of code.split('.')) node = node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined
  return node
}

describe.skipIf(!existsSync(SERVER))('error codes of the server', () => {
  const codes = existsSync(SERVER) ? serverCodes() : []

  it('finds the codes (guards against a broken pattern)', () => {
    expect(codes.length).toBeGreaterThan(60)
    expect(codes).toContain('attachment.not_found')
    expect(codes).toContain('archive.missing')
  })

  it.each([
    ['German', de],
    ['English', en],
  ])('every code has a text in the %s texts (so nobody sees the bare server sentence)', (_name, locale) => {
    const missing = codes.filter((code) => typeof textOf(locale, code) !== 'string')
    expect(missing).toEqual([])
  })
})
