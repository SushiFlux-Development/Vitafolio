/**
 * Dates in the forms and in every display. A date is always STORED as ISO text (`YYYY-MM-DD`, `YYYY-MM` or `YYYY`); only
 * what the user types and reads follows the chosen format. This module holds the pure rules: the three formats, the input
 * mask (digits in, separators come by themselves), reading a typed or pasted text, and the way back to ISO. No React, no
 * translations - the field component and the rules module build on it, so everything here is unit tested on its own.
 */

/** The three notations: `23.04.1990`, `1990/04/23` and `1990-04-23`. */
export type DateFormatId = 'dmy' | 'ymd_slash' | 'iso'

/** What a user can choose: one of the notations, or "auto" (German interface: day.month.year, otherwise ISO). */
export type DateFormatPreference = 'auto' | DateFormatId

/** A full calendar day, or a month (with only a year allowed as well). */
export type DateKind = 'day' | 'month'

export const DATE_FORMAT_IDS: readonly DateFormatId[] = ['dmy', 'ymd_slash', 'iso']
export const DATE_FORMAT_PREFERENCES: readonly DateFormatPreference[] = ['auto', ...DATE_FORMAT_IDS]

export function isDateFormatPreference(value: unknown): value is DateFormatPreference {
  return typeof value === 'string' && (DATE_FORMAT_PREFERENCES as readonly string[]).includes(value)
}

/** The notation to use: the chosen one, or for "auto" (and for a user without a choice) the one of the interface language. */
export function resolveDateFormat(preference: DateFormatPreference | null | undefined, language: string): DateFormatId {
  if (preference && preference !== 'auto') return preference
  return language.toLowerCase().startsWith('de') ? 'dmy' : 'iso'
}

/** What a field has to accept besides the format. */
export interface DateSpec {
  kind: DateKind
  /** An empty value is a problem. */
  required?: boolean
  /** The years that are allowed (default 1 to 9999); a value outside is the "range" problem. */
  minYear?: number
  maxYear?: number
}

const SEPARATOR: Record<DateFormatId, string> = { dmy: '.', ymd_slash: '/', iso: '-' }

/** The character between the parts of a format. */
export function separatorOf(format: DateFormatId): string {
  return SEPARATOR[format]
}

type Part = 'd' | 'm' | 'y'

const PART_LENGTH: Record<Part, number> = { d: 2, m: 2, y: 4 }

const digitsOf = (text: string) => text.replace(/\D/g, '')

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

const two = (value: number | string) => String(value).padStart(2, '0')
const four = (value: number | string) => String(value).padStart(4, '0')

/** The order of the parts. A month with day-first notation is `MM.YYYY`, or a bare year (see `yearOnly`). */
function layoutOf(format: DateFormatId, kind: DateKind, yearOnly: boolean): readonly Part[] {
  if (kind === 'day') return format === 'dmy' ? ['d', 'm', 'y'] : ['y', 'm', 'd']
  if (format !== 'dmy') return ['y', 'm']
  return yearOnly ? ['y'] : ['m', 'y']
}

/**
 * Digits only (no separators yet): are they a bare year? Month first means 01 to 12, so two leading digits above 12 can only
 * be the start of a year - that is what keeps "2024" from being cut into "20.24".
 */
function digitsAreYearOnly(digits: string): boolean {
  return digits.length >= 2 && Number(digits.slice(0, 2)) > 12
}

/** Text with separators (or a finished one): is it a bare year? Without a separator, more than two digits cannot be a month. */
function textIsYearOnly(text: string, separator: string): boolean {
  if (text.includes(separator)) return false
  return text.length > 2 || digitsAreYearOnly(text)
}

/**
 * The text for a row of digits: the separators between the parts, and after a finished part (while more is expected) the
 * next separator at once, so the user never types one. Surplus digits are dropped.
 */
export function maskDigits(digits: string, format: DateFormatId, kind: DateKind): string {
  const layout = layoutOf(format, kind, digitsAreYearOnly(digits))
  const separator = SEPARATOR[format]
  const all = digits.slice(0, layout.reduce((sum, part) => sum + PART_LENGTH[part], 0))
  let out = ''
  let position = 0
  for (const [index, part] of layout.entries()) {
    const length = PART_LENGTH[part]
    const chunk = all.slice(position, position + length)
    if (chunk === '') break
    out += (index > 0 ? separator : '') + chunk
    position += chunk.length
    if (chunk.length < length) break
    if (position === all.length && index < layout.length - 1) out += separator
  }
  return out
}

/** The caret position right behind the n-th digit of a text (0 = the very start). */
function indexAfterDigits(text: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let index = 0; index < text.length; index++) {
    if (/\d/.test(text[index]!)) {
      seen++
      if (seen === count) return index + 1
    }
  }
  return text.length
}

/** Pads the unfinished part with a leading zero ("5" -> "05"), as when somebody types "5." for the fifth. A year is never padded. */
function padUnfinishedPart(digits: string, format: DateFormatId, kind: DateKind): string | null {
  const layout = layoutOf(format, kind, digitsAreYearOnly(digits))
  let position = 0
  for (const part of layout) {
    const length = PART_LENGTH[part]
    const left = digits.length - position
    if (left >= length) {
      position += length
      continue
    }
    return left >= 1 && part !== 'y' ? `${digits.slice(0, position)}0${digits.slice(position)}` : null
  }
  return null
}

/** What the field shows and where the caret goes after an edit. */
export interface MaskResult {
  text: string
  caret: number
}

export interface MaskInput {
  /** The text before the edit. */
  previous: string
  /** The text of the input right after the browser applied the edit. */
  raw: string
  /** The caret in `raw`. */
  caret: number
  /** The `inputType` of the edit (`deleteContentForward` and so on), when the browser tells. */
  inputType?: string | undefined
  format: DateFormatId
  kind: DateKind
}

/** Characters that only mean "next part" when somebody types them. */
const TYPED_SEPARATOR = /[.,/\- ]$/

/**
 * One edit of the field. Only digits count: other characters are dropped, the separators are put back by the mask. The
 * caret stays behind the digit it was behind (also in the middle of the text); deleting a separator at the end deletes the
 * digit before it, in the middle it only steps over it; a separator typed after a lone digit pads it ("5." gives "05.").
 *
 * An old value that is not made of digits and this format's separator (it is shown as it is, never cleaned up) is edited
 * freely until it is clean.
 */
export function applyDateInput({ previous, raw, caret, inputType, format, kind }: MaskInput): MaskResult {
  const separator = SEPARATOR[format]
  const isClean = (text: string) => [...text].every((char) => /\d/.test(char) || char === separator)
  if (!isClean(previous) && !isClean(raw)) return { text: raw, caret }

  const previousDigits = digitsOf(previous)
  const caretDigits = digitsOf(raw.slice(0, caret)).length
  const digits = digitsOf(raw)

  // A separator typed at the end of a part that is not finished.
  if (raw.length === previous.length + 1 && caret === raw.length && TYPED_SEPARATOR.test(raw) && raw.slice(0, -1) === previous) {
    const text = maskDigits(padUnfinishedPart(previousDigits, format, kind) ?? previousDigits, format, kind)
    return { text, caret: text.length }
  }

  if (digits === previousDigits && isClean(previous)) {
    // Something that is no digit was typed or pasted: it is dropped, the caret stays where it was.
    if (raw.length >= previous.length) return { text: previous, caret: Math.max(0, Math.min(previous.length, caret - (raw.length - previous.length))) }
    // Only a separator was deleted: at the end that takes the digit before it along, in the middle the caret steps over it.
    if (previous.endsWith(separator) && caret === raw.length && inputType !== 'deleteContentForward') {
      const text = maskDigits(previousDigits.slice(0, -1), format, kind)
      return { text, caret: text.length }
    }
    const behind = indexAfterDigits(previous, caretDigits)
    return { text: previous, caret: inputType === 'deleteContentForward' ? Math.min(previous.length, behind + 1) : behind }
  }

  const text = maskDigits(digits, format, kind)
  const kept = digitsOf(text)
  let position = indexAfterDigits(text, Math.min(caretDigits, kept.length))
  // After a typed digit the caret moves past the separator that follows (the mask put it there for the next part).
  if (kept.length > previousDigits.length) {
    while (position < text.length && !/\d/.test(text[position]!)) position++
  }
  return { text, caret: position }
}

interface Notation {
  pattern: RegExp
  order: readonly Part[]
}

const DAY_NOTATIONS: readonly Notation[] = [
  { pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: ['d', 'm', 'y'] },
  { pattern: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: ['y', 'm', 'd'] },
  { pattern: /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/, order: ['y', 'm', 'd'] },
]

const MONTH_NOTATIONS: readonly Notation[] = [
  { pattern: /^(\d{1,2})\.(\d{4})$/, order: ['m', 'y'] },
  { pattern: /^(\d{4})[/-](\d{1,2})$/, order: ['y', 'm'] },
  { pattern: /^(\d{4})$/, order: ['y'] },
]

/**
 * The digits (in the order of this format) of a pasted date written in any of the three notations (`23.04.1990`, `1990/04/23`,
 * `1990-04-23`; a one-digit day or month is fine, and so is a time behind an ISO date), or null when it is none of them. A
 * month field also takes a whole day (the month is kept); a day field does not take a month.
 */
export function digitsOfPastedDate(pasted: string, format: DateFormatId, kind: DateKind): string | null {
  const text = pasted.trim()
  for (const { pattern, order } of kind === 'day' ? DAY_NOTATIONS : [...MONTH_NOTATIONS, ...DAY_NOTATIONS]) {
    const match = pattern.exec(text)
    if (!match) continue
    const found: Partial<Record<Part, string>> = {}
    for (const [index, part] of order.entries()) found[part] = match[index + 1]
    const year = found.y!
    if (kind === 'month') {
      if (found.m === undefined) return year
      return format === 'dmy' ? two(found.m) + year : year + two(found.m)
    }
    return format === 'dmy' ? two(found.d!) + two(found.m!) + year : year + two(found.m!) + two(found.d!)
  }
  return null
}

/** The text of a notation that is written out: the three parts joined by the format's separator. */
function join(format: DateFormatId, kind: DateKind, year: string, month?: string, day?: string): string {
  const separator = SEPARATOR[format]
  if (kind === 'month') {
    if (month === undefined) return year
    return format === 'dmy' ? `${month}${separator}${year}` : `${year}${separator}${month}`
  }
  return format === 'dmy' ? `${day}${separator}${month}${separator}${year}` : `${year}${separator}${month}${separator}${day}`
}

/**
 * The shown text of a stored value: ISO text becomes the chosen notation (also when it is no real date - the field then marks
 * it). Whatever is not ISO text is returned unchanged, so an old value stays visible.
 */
export function displayOfStored(stored: string, format: DateFormatId, kind: DateKind): string {
  if (kind === 'day') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stored)
    return match ? join(format, 'day', match[1]!, match[2], match[3]) : stored
  }
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(stored)
  return match ? join(format, 'month', match[1]!, match[2]) : stored
}

/** The state of a typed text. */
export type DateState = 'empty' | 'incomplete' | 'valid' | 'invalid' | 'nonexistent' | 'range'

export interface DateAnalysis {
  state: DateState
  /** The ISO text, when the text is a finished, existing date (also one outside the allowed years - the state says so). */
  iso?: string
}

interface ParsedText {
  layout: readonly Part[]
  parts: { part: Part; digits: string }[]
}

/** Splits a typed text into its parts; null when it does not have the shape of the format at all. */
function parseText(text: string, format: DateFormatId, kind: DateKind): ParsedText | null {
  const separator = SEPARATOR[format]
  const layout = layoutOf(format, kind, kind === 'month' && format === 'dmy' && textIsYearOnly(text, separator))
  const tokens = text.split(separator)
  const trailing = tokens.length > 1 && tokens[tokens.length - 1] === ''
  if (trailing) tokens.pop()
  if (tokens.length > layout.length) return null
  const parts: ParsedText['parts'] = []
  for (const [index, token] of tokens.entries()) {
    const part = layout[index]!
    const length = PART_LENGTH[part]
    if (!/^\d+$/.test(token) || token.length > length) return null
    const last = index === tokens.length - 1
    // Every part before the last one is finished; so is the last one when a separator follows it.
    if ((!last || trailing) && token.length !== length) return null
    parts.push({ part, digits: token })
  }
  if (trailing && tokens.length === layout.length) return null
  return { layout, parts }
}

/** Reads a typed text: what state it is in, and its ISO form when it is a finished, existing date. */
export function analyseDateText(text: string, format: DateFormatId, spec: DateSpec): DateAnalysis {
  const trimmed = text.trim()
  if (trimmed === '') return { state: 'empty' }
  const parsed = parseText(trimmed, format, spec.kind)
  if (!parsed) return { state: 'invalid' }
  const minYear = spec.minYear ?? 1
  const maxYear = spec.maxYear ?? 9999

  const value: Partial<Record<Part, number>> = {}
  let yearStart: string | undefined
  for (const { part, digits } of parsed.parts) {
    if (digits.length < PART_LENGTH[part]) {
      if (part === 'y') yearStart = digits
      continue
    }
    const number = Number(digits)
    if ((part === 'd' && (number < 1 || number > 31)) || (part === 'm' && (number < 1 || number > 12)) || (part === 'y' && number < 1)) return { state: 'invalid' }
    value[part] = number
  }

  // The first digits of the year decide early: nothing in the allowed years starts like this any more.
  if (yearStart !== undefined) {
    const free = 10 ** (4 - yearStart.length)
    const lowest = Number(yearStart) * free
    if (lowest + free - 1 < minYear || lowest > maxYear) return { state: 'range' }
  }
  if (value.d !== undefined && value.m !== undefined && value.d > daysInMonth(value.y ?? 2000, value.m)) return { state: 'nonexistent' }

  const finished = parsed.layout.every((part) => value[part] !== undefined)
  // A year alone is a finished month value (and "2024-" is the year with the separator waiting for a month).
  const yearAlone = spec.kind === 'month' && value.y !== undefined && parsed.parts.length === 1
  if (!finished && !yearAlone) return { state: 'incomplete' }

  const year = four(value.y!)
  const iso = spec.kind === 'month' ? (value.m === undefined ? year : `${year}-${two(value.m)}`) : `${year}-${two(value.m!)}-${two(value.d!)}`
  if (value.y! < minYear || value.y! > maxYear) return { state: 'range', iso }
  return { state: 'valid', iso }
}

/** What goes into the form: the ISO text when the typed text is a finished, existing date; otherwise the typed text itself (it is never lost). */
export function storedOfText(text: string, format: DateFormatId, spec: DateSpec): string {
  return analyseDateText(text, format, spec).iso ?? text
}

/**
 * An old value that is a finished date in one of the three notations but not ISO text ("23.04.1990") becomes ISO; everything
 * else - also ISO text that is no real date - comes back unchanged.
 */
export function normalizeStored(stored: string, format: DateFormatId, spec: DateSpec): string {
  if (stored === '' || isoParts(stored) !== null) return stored
  // Only finished texts with two-digit parts: "2024-1" is a month on its way (the form holds unfinished input as typed), not an old value.
  if (/(^|\D)\d(\D|$)/.test(stored)) return stored
  const digits = digitsOfPastedDate(stored, format, spec.kind)
  if (digits === null) return stored
  return analyseDateText(maskDigits(digits, format, spec.kind), format, spec).iso ?? stored
}

/** The parts of a stored ISO value, or null when it is none. */
function isoParts(stored: string): { year: string; month?: string; day?: string } | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(stored)
  if (!match) return null
  const parts: { year: string; month?: string; day?: string } = { year: match[1]! }
  if (match[2] !== undefined) parts.month = match[2]
  if (match[3] !== undefined) parts.day = match[3]
  return parts
}

/**
 * A stored date for display (cards, lists): ISO text in the chosen notation. A month field shows `MM.YYYY`, `YYYY/MM` or
 * `YYYY-MM`; a lone year stays a year. Whatever is not ISO text is shown as it is.
 */
export function formatStoredDate(stored: string | null | undefined, format: DateFormatId): string {
  if (!stored) return ''
  const parts = isoParts(stored)
  if (!parts) return stored
  if (parts.day !== undefined) return join(format, 'day', parts.year, parts.month, parts.day)
  return join(format, 'month', parts.year, parts.month)
}

/** A calendar day (year, month 1-12, day) in the chosen notation. */
export function formatDayParts(year: number, month: number, day: number, format: DateFormatId): string {
  return join(format, 'day', four(year), two(month), two(day))
}

/** Month and day without a year (the week preview of the backups): `09.11.`, `11/09` or `11-09`. */
export function formatMonthDay(month: number, day: number, format: DateFormatId): string {
  if (format === 'dmy') return `${two(day)}.${two(month)}.`
  return `${two(month)}${SEPARATOR[format]}${two(day)}`
}
