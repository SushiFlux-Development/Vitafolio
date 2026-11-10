import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { formatDayParts, formatStoredDate, resolveDateFormat } from '../src/validation/dates'

export type Language = 'de' | 'en'

const cache = new Map<Language, Record<string, unknown>>()

function load(language: Language): Record<string, unknown> {
  let tree = cache.get(language)
  if (!tree) {
    tree = JSON.parse(readFileSync(fileURLToPath(new URL(`../src/i18n/locales/${language}.json`, import.meta.url)), 'utf8')) as Record<string, unknown>
    cache.set(language, tree)
  }
  return tree
}

/**
 * The text the app shows for a translation key, read from the same locale file the app ships. Tests look labels up here instead of
 * typing them, so one test body runs in every language and a reworded label never breaks a selector. A missing key is an error.
 */
export function labelsFor(language: Language) {
  return (key: string, values: Record<string, string | number> = {}): string => {
    let node: unknown = load(language)
    for (const part of key.split('.')) {
      if (typeof node !== 'object' || node === null || !(part in node)) throw new Error(`No translation "${key}" in ${language}.json`)
      node = (node as Record<string, unknown>)[part]
    }
    if (typeof node !== 'string') throw new Error(`Translation "${key}" in ${language}.json is not a text`)
    return node.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => String(values[name] ?? `{{${name}}}`))
  }
}

/** Puts the page into a language before anything renders. */
export const LANGUAGES: readonly Language[] = ['de', 'en']

/**
 * Dates in the notation a language starts with ("auto": German day.month.year, English ISO). The date fields take digits only and
 * add the separators themselves, so a test types `digits(...)` and expects `shown(...)`; one test body then runs in every language.
 */
export function dateIn(language: Language) {
  const format = resolveDateFormat('auto', language)
  const pad = (value: number) => String(value).padStart(2, '0')
  const month = (year: number, monthNumber: number) => formatStoredDate(`${year}-${pad(monthNumber)}`, format)
  return {
    format,
    /** A day as the field shows it: 23.04.1990 or 1990-04-23. */
    shown: (year: number, monthNumber: number, day: number) => formatDayParts(year, monthNumber, day, format),
    /** The digits to type for a day (an impossible one is fine - the field says so). */
    digits: (year: number, monthNumber: number, day: number) => formatDayParts(year, monthNumber, day, format).replace(/\D/g, ''),
    /** A month as the field shows it: 03.2024 or 2024-03. Month 0 is a month that does not exist. */
    shownMonth: month,
    monthDigits: (year: number, monthNumber: number) => month(year, monthNumber).replace(/\D/g, ''),
    /** The translation keys of the messages in this notation. */
    invalidDay: `rules.date.invalid.day.${format}`,
    invalidMonth: `rules.date.invalid.month.${format}`,
  }
}
