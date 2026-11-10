import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './format'

/** An instant built from the viewer's own wall clock, so the expectations hold in every time zone. */
const instant = (year: number, month: number, day: number, hour = 0, minute = 0) => new Date(year, month - 1, day, hour, minute).toISOString()

describe('formatDate', () => {
  it.each([
    ['dmy', '09.11.2026'],
    ['ymd_slash', '2026/11/09'],
    ['iso', '2026-11-09'],
  ] as const)('writes a day in the %s notation', (format, expected) => {
    expect(formatDate(instant(2026, 11, 9), format)).toBe(expected)
  })

  it('keeps single-digit days and months two digits wide', () => {
    expect(formatDate(instant(2026, 1, 2), 'dmy')).toBe('02.01.2026')
    expect(formatDate(instant(2026, 1, 2), 'iso')).toBe('2026-01-02')
  })

  it('shows a dash for nothing and the text itself when it is no date', () => {
    expect(formatDate(null, 'dmy')).toBe('-')
    expect(formatDate(undefined, 'iso')).toBe('-')
    expect(formatDate('', 'iso')).toBe('-')
    expect(formatDate('gestern', 'dmy')).toBe('gestern')
  })
})

describe('formatDateTime', () => {
  it.each([
    ['dmy', '09.11.2026, 14:05'],
    ['ymd_slash', '2026/11/09, 14:05'],
    ['iso', '2026-11-09, 14:05'],
  ] as const)('writes day and 24-hour time in the %s notation', (format, expected) => {
    expect(formatDateTime(instant(2026, 11, 9, 14, 5), format)).toBe(expected)
  })

  it('writes midnight and the afternoon the same way in every language (never 12-hour)', () => {
    expect(formatDateTime(instant(2026, 11, 9, 0, 0), 'iso')).toBe('2026-11-09, 00:00')
    expect(formatDateTime(instant(2026, 11, 9, 23, 59), 'iso')).toBe('2026-11-09, 23:59')
  })

  it('shows a dash for nothing and the text itself when it is no date', () => {
    expect(formatDateTime(null, 'dmy')).toBe('-')
    expect(formatDateTime('irgendwann', 'dmy')).toBe('irgendwann')
  })
})
