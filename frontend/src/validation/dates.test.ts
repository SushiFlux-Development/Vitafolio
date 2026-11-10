import { describe, expect, it } from 'vitest'
import {
  analyseDateText,
  applyDateInput,
  digitsOfPastedDate,
  displayOfStored,
  formatDayParts,
  formatMonthDay,
  formatStoredDate,
  maskDigits,
  normalizeStored,
  resolveDateFormat,
  storedOfText,
} from './dates'
import type { DateFormatId, DateKind, DateSpec } from './dates'

/** A tiny stand-in for the browser: the text and the caret, edited the way a keyboard edits an input. */
class Typist {
  text = ''
  caret = 0
  constructor(
    private readonly format: DateFormatId,
    private readonly kind: DateKind,
    start = '',
  ) {
    this.text = start
    this.caret = start.length
  }

  private edit(raw: string, caret: number, inputType?: string) {
    const result = applyDateInput({ previous: this.text, raw, caret, inputType, format: this.format, kind: this.kind })
    this.text = result.text
    this.caret = result.caret
    return this
  }

  type(chars: string) {
    for (const char of chars) this.edit(this.text.slice(0, this.caret) + char + this.text.slice(this.caret), this.caret + 1, 'insertText')
    return this
  }

  backspace(times = 1) {
    for (let i = 0; i < times; i++) {
      if (this.caret === 0) break
      this.edit(this.text.slice(0, this.caret - 1) + this.text.slice(this.caret), this.caret - 1, 'deleteContentBackward')
    }
    return this
  }

  deleteForward() {
    return this.edit(this.text.slice(0, this.caret) + this.text.slice(this.caret + 1), this.caret, 'deleteContentForward')
  }

  moveTo(position: number) {
    this.caret = position
    return this
  }

  /** Replaces the selection [from, to) with some text (typing over a selection, or pasting without a date notation). */
  replace(from: number, to: number, chars: string) {
    return this.edit(this.text.slice(0, from) + chars + this.text.slice(to), from + chars.length, 'insertText')
  }
}

const day = (format: DateFormatId, start = '') => new Typist(format, 'day', start)
const month = (format: DateFormatId, start = '') => new Typist(format, 'month', start)

describe('resolving the format', () => {
  it('follows the interface language for "auto" and the choice otherwise', () => {
    expect(resolveDateFormat('auto', 'de')).toBe('dmy')
    expect(resolveDateFormat('auto', 'de-AT')).toBe('dmy')
    expect(resolveDateFormat('auto', 'en')).toBe('iso')
    expect(resolveDateFormat(null, 'de')).toBe('dmy')
    expect(resolveDateFormat(undefined, 'en')).toBe('iso')
    expect(resolveDateFormat('ymd_slash', 'de')).toBe('ymd_slash')
    expect(resolveDateFormat('dmy', 'en')).toBe('dmy')
    expect(resolveDateFormat('iso', 'de')).toBe('iso')
  })
})

describe('the mask: digits in, separators by themselves', () => {
  it('builds a day in every notation', () => {
    expect(day('dmy').type('23041990').text).toBe('23.04.1990')
    expect(day('ymd_slash').type('19900423').text).toBe('1990/04/23')
    expect(day('iso').type('19900423').text).toBe('1990-04-23')
  })

  it('puts the next separator as soon as a part is finished, so nobody types one', () => {
    const typed = day('dmy')
    expect(typed.type('2').text).toBe('2')
    expect(typed.type('3').text).toBe('23.')
    expect(typed.type('0').text).toBe('23.0')
    expect(typed.type('4').text).toBe('23.04.')
    expect(typed.type('1990').text).toBe('23.04.1990')
    expect(day('iso').type('1990').text).toBe('1990-')
    expect(day('ymd_slash').type('199004').text).toBe('1990/04/')
  })

  it('takes no more digits than the date has', () => {
    expect(day('dmy').type('2304199012345').text).toBe('23.04.1990')
    expect(month('iso').type('202403999').text).toBe('2024-03')
    expect(month('dmy').type('0320249999').text).toBe('03.2024')
  })

  it('drops everything that is no digit', () => {
    expect(day('dmy').type('2a3x0b4').text).toBe('23.04.')
    expect(day('dmy').type('23 04').text).toBe('23.04.')
    expect(day('iso').type('1990-04-23').text).toBe('1990-04-23')
    // the caret stays where it was when a letter is typed
    const typist = day('dmy', '23.04.1990').moveTo(2).type('x')
    expect(typist.text).toBe('23.04.1990')
    expect(typist.caret).toBe(2)
  })

  it('builds a month, and keeps a bare year a year (two leading digits above 12 are a year)', () => {
    expect(month('dmy').type('032024').text).toBe('03.2024')
    expect(month('iso').type('202403').text).toBe('2024-03')
    expect(month('ymd_slash').type('202403').text).toBe('2024/03')
    expect(month('dmy').type('2024').text).toBe('2024')
    expect(month('dmy').type('1999').text).toBe('1999')
    expect(month('dmy').type('13').text).toBe('13')
    expect(month('dmy').type('12').text).toBe('12.')
    expect(month('dmy').type('01').text).toBe('01.')
    expect(month('dmy').type('00').text).toBe('00.')
    // a year first needs no decision
    expect(month('iso').type('2024').text).toBe('2024-')
    expect(month('ymd_slash').type('2024').text).toBe('2024/')
  })

  it('maskDigits is the same thing without a keyboard', () => {
    expect(maskDigits('', 'dmy', 'day')).toBe('')
    expect(maskDigits('2304', 'dmy', 'day')).toBe('23.04.')
    expect(maskDigits('19900', 'iso', 'day')).toBe('1990-0')
    expect(maskDigits('0320', 'dmy', 'month')).toBe('03.20')
    expect(maskDigits('2024', 'dmy', 'month')).toBe('2024')
  })

  it('pads a lone digit when a separator is typed behind it', () => {
    expect(day('dmy').type('5.').text).toBe('05.')
    expect(day('dmy').type('5.3.').text).toBe('05.03.')
    expect(day('dmy').type('5.3.2024').text).toBe('05.03.2024')
    expect(day('dmy').type('5/3-2024').text).toBe('05.03.2024')
    expect(month('dmy').type('5.').text).toBe('05.')
    expect(month('dmy').type('5.2024').text).toBe('05.2024')
    expect(day('iso').type('1990-4-').text).toBe('1990-04-')
    // never a year: "199-" stays what it is
    expect(day('iso').type('199-').text).toBe('199')
    // a separator with nothing before it, or behind a finished part, changes nothing
    expect(day('dmy').type('.').text).toBe('')
    expect(day('dmy').type('23..').text).toBe('23.')
  })
})

describe('deleting and editing in the middle', () => {
  it('deletes digit by digit from the end', () => {
    const typist = day('dmy', '23.04.1990')
    expect(typist.backspace().text).toBe('23.04.199')
    expect(typist.backspace(3).text).toBe('23.04.')
  })

  it('takes the digit before a trailing separator along, so Backspace never gets stuck on it', () => {
    const typist = day('dmy', '23.04.')
    expect(typist.backspace().text).toBe('23.0')
    expect(day('dmy', '23.').backspace().text).toBe('2')
    expect(day('iso', '1990-').backspace().text).toBe('199')
    expect(day('dmy', '23.04.1990').backspace(10).text).toBe('')
  })

  it('steps over a separator in the middle instead of shifting everything', () => {
    const typist = day('dmy', '23.04.1990').moveTo(3)
    typist.backspace()
    expect(typist.text).toBe('23.04.1990')
    expect(typist.caret).toBe(2)
    const forward = day('dmy', '23.04.1990').moveTo(2)
    forward.deleteForward()
    expect(forward.text).toBe('23.04.1990')
    expect(forward.caret).toBe(3)
  })

  it('changes a digit in the middle and keeps the caret behind it', () => {
    const typist = day('dmy', '23.04.1990').moveTo(1)
    typist.backspace()
    expect(typist.text).toBe('30.41.990')
    expect(typist.caret).toBe(0)
    const edit = day('dmy', '23.04.1990').moveTo(7)
    edit.backspace()
    expect(edit.text).toBe('23.04.990')
    // typing a digit in the middle of a full date pushes the last digit out
    const insert = day('dmy', '23.04.1990').moveTo(1)
    insert.type('5')
    expect(insert.text).toBe('25.30.4199')
    expect(insert.caret).toBe(2)
  })

  it('replaces a selection', () => {
    const typist = day('dmy', '23.04.1990')
    expect(typist.replace(0, 10, '1').text).toBe('1')
    expect(day('dmy', '23.04.1990').replace(3, 5, '12').text).toBe('23.12.1990')
    expect(day('dmy', '23.04.1990').replace(0, 10, '').text).toBe('')
  })

  it('moves the caret past the separator that follows a finished part, and not further', () => {
    const typist = day('dmy').type('23')
    expect(typist.caret).toBe(3)
    expect(typist.type('04').caret).toBe(6)
    expect(day('dmy').type('2').caret).toBe(1)
  })
})

describe('old values that fit no pattern are edited freely, never cleaned up', () => {
  it('leaves the text alone while it is not made of digits and the separator', () => {
    const typist = day('dmy', 'irgendwann')
    typist.backspace()
    expect(typist.text).toBe('irgendwan')
    typist.type('x')
    expect(typist.text).toBe('irgendwanx')
  })

  it('takes over as soon as the text is clean again', () => {
    expect(day('dmy', 'Q3').moveTo(1).backspace().type('4').text).toBe('43.')
    expect(month('dmy', 'ab12').moveTo(2).backspace(2).text).toBe('12.')
  })
})

describe('a pasted date', () => {
  it('is recognised in all three notations and written in the active one', () => {
    expect(digitsOfPastedDate('23.04.1990', 'dmy', 'day')).toBe('23041990')
    expect(digitsOfPastedDate('1990/04/23', 'dmy', 'day')).toBe('23041990')
    expect(digitsOfPastedDate('1990-04-23', 'dmy', 'day')).toBe('23041990')
    expect(digitsOfPastedDate('23.04.1990', 'iso', 'day')).toBe('19900423')
    expect(digitsOfPastedDate('1990/04/23', 'ymd_slash', 'day')).toBe('19900423')
    expect(digitsOfPastedDate(' 1990-04-23 ', 'iso', 'day')).toBe('19900423')
  })

  it('takes a one-digit day or month, and a time behind an ISO date', () => {
    expect(digitsOfPastedDate('5.3.2024', 'dmy', 'day')).toBe('05032024')
    expect(digitsOfPastedDate('2024-3-5', 'iso', 'day')).toBe('20240305')
    expect(digitsOfPastedDate('2024-03-05T00:00:00Z', 'dmy', 'day')).toBe('05032024')
    expect(digitsOfPastedDate('2024-03-05 14:30', 'dmy', 'day')).toBe('05032024')
  })

  it('reads a month field the same way, also from a whole day, and a lone year', () => {
    expect(digitsOfPastedDate('03.2024', 'dmy', 'month')).toBe('032024')
    expect(digitsOfPastedDate('2024/03', 'dmy', 'month')).toBe('032024')
    expect(digitsOfPastedDate('2024-03', 'iso', 'month')).toBe('202403')
    expect(digitsOfPastedDate('03.2024', 'iso', 'month')).toBe('202403')
    expect(digitsOfPastedDate('2024', 'dmy', 'month')).toBe('2024')
    expect(digitsOfPastedDate('2024', 'iso', 'month')).toBe('2024')
    expect(digitsOfPastedDate('23.04.1990', 'dmy', 'month')).toBe('041990')
    expect(digitsOfPastedDate('1990-04-23', 'iso', 'month')).toBe('199004')
  })

  it('is no date when it is none of the three, or a month where a day is asked for', () => {
    expect(digitsOfPastedDate('Mai 2024', 'dmy', 'month')).toBeNull()
    expect(digitsOfPastedDate('04/23/1990', 'dmy', 'day')).toBeNull()
    expect(digitsOfPastedDate('03.2024', 'dmy', 'day')).toBeNull()
    expect(digitsOfPastedDate('2024', 'iso', 'day')).toBeNull()
    expect(digitsOfPastedDate('', 'iso', 'day')).toBeNull()
  })
})

describe('between the form and the field', () => {
  it('shows ISO text in the chosen notation', () => {
    expect(displayOfStored('1990-04-23', 'dmy', 'day')).toBe('23.04.1990')
    expect(displayOfStored('1990-04-23', 'ymd_slash', 'day')).toBe('1990/04/23')
    expect(displayOfStored('1990-04-23', 'iso', 'day')).toBe('1990-04-23')
    expect(displayOfStored('2024-03', 'dmy', 'month')).toBe('03.2024')
    expect(displayOfStored('2024-03', 'ymd_slash', 'month')).toBe('2024/03')
    expect(displayOfStored('2024-03', 'iso', 'month')).toBe('2024-03')
    expect(displayOfStored('2024', 'dmy', 'month')).toBe('2024')
    expect(displayOfStored('', 'dmy', 'month')).toBe('')
  })

  it('shows what is no ISO text exactly as it is, so an old value stays visible', () => {
    expect(displayOfStored('Q3 2024', 'dmy', 'month')).toBe('Q3 2024')
    expect(displayOfStored('03/2024', 'iso', 'month')).toBe('03/2024')
    expect(displayOfStored('2024-03', 'dmy', 'day')).toBe('2024-03')
    expect(displayOfStored('1990-04-23', 'dmy', 'month')).toBe('1990-04-23')
  })

  it('shows an ISO value that is no real date as typed, in the notation, so the field can mark it', () => {
    expect(displayOfStored('1990-02-30', 'dmy', 'day')).toBe('30.02.1990')
    expect(displayOfStored('2024-13', 'dmy', 'month')).toBe('13.2024')
  })

  it('turns a finished, existing date into ISO and keeps everything else as typed', () => {
    const dayDmy: DateSpec = { kind: 'day' }
    const monthSpec: DateSpec = { kind: 'month' }
    expect(storedOfText('23.04.1990', 'dmy', dayDmy)).toBe('1990-04-23')
    expect(storedOfText('1990/04/23', 'ymd_slash', dayDmy)).toBe('1990-04-23')
    expect(storedOfText('03.2024', 'dmy', monthSpec)).toBe('2024-03')
    expect(storedOfText('2024', 'dmy', monthSpec)).toBe('2024')
    expect(storedOfText('2024-', 'iso', monthSpec)).toBe('2024')
    expect(storedOfText('2024-03', 'iso', monthSpec)).toBe('2024-03')
    expect(storedOfText('23.04.', 'dmy', dayDmy)).toBe('23.04.')
    expect(storedOfText('30.02.1990', 'dmy', dayDmy)).toBe('30.02.1990')
    expect(storedOfText('Q3 2024', 'dmy', monthSpec)).toBe('Q3 2024')
    expect(storedOfText('', 'dmy', monthSpec)).toBe('')
  })

  it('round-trips every format: stored -> shown -> typed again -> stored', () => {
    for (const format of ['dmy', 'ymd_slash', 'iso'] as const) {
      for (const [stored, kind] of [['1990-04-23', 'day'], ['2024-03', 'month'], ['2024', 'month'], ['2000-02-29', 'day']] as const) {
        const spec: DateSpec = { kind }
        const shown = displayOfStored(stored, format, kind)
        expect(storedOfText(shown, format, spec)).toBe(stored)
        // typing the digits of the shown text gives the same text back (a bare year may keep a waiting separator)
        const typed = new Typist(format, kind).type(shown).text.replace(/[^\d]$/, '')
        expect(storedOfText(typed, format, spec)).toBe(stored)
      }
    }
  })

  it('does not hand out ISO for a day that does not exist, and keeps one outside the allowed years visible as ISO', () => {
    expect(analyseDateText('31.04.1990', 'dmy', { kind: 'day' })).toEqual({ state: 'nonexistent' })
    expect(analyseDateText('01.01.1999', 'dmy', { kind: 'day', minYear: 2000, maxYear: 2100 })).toEqual({ state: 'range', iso: '1999-01-01' })
    expect(analyseDateText('01.01.2026', 'dmy', { kind: 'day', minYear: 2000, maxYear: 2100 })).toEqual({ state: 'valid', iso: '2026-01-01' })
  })

  it('turns an old, finished date in a known notation into ISO, and leaves the rest', () => {
    const spec: DateSpec = { kind: 'day' }
    expect(normalizeStored('23.04.1990', 'dmy', spec)).toBe('1990-04-23')
    expect(normalizeStored('1990/04/23', 'iso', spec)).toBe('1990-04-23')
    expect(normalizeStored('1990-04-23', 'dmy', spec)).toBe('1990-04-23')
    expect(normalizeStored('1990-02-30', 'dmy', spec)).toBe('1990-02-30')
    expect(normalizeStored('30.02.1990', 'dmy', spec)).toBe('30.02.1990')
    expect(normalizeStored('irgendwann', 'dmy', spec)).toBe('irgendwann')
    // an unfinished text the field itself keeps in the form is never taken for an old value
    expect(normalizeStored('1990-04-2', 'iso', spec)).toBe('1990-04-2')
    expect(normalizeStored('2024-1', 'iso', { kind: 'month' })).toBe('2024-1')
    expect(normalizeStored('2024/1', 'ymd_slash', { kind: 'month' })).toBe('2024/1')
    expect(normalizeStored('5.3.2024', 'dmy', spec)).toBe('5.3.2024')
    expect(normalizeStored('', 'dmy', spec)).toBe('')
    expect(normalizeStored('03.2024', 'dmy', { kind: 'month' })).toBe('2024-03')
  })
})

describe('reading a typed text', () => {
  const spec: DateSpec = { kind: 'day' }

  it('knows empty, unfinished, valid and wrong', () => {
    expect(analyseDateText('', 'dmy', spec).state).toBe('empty')
    expect(analyseDateText('   ', 'dmy', spec).state).toBe('empty')
    expect(analyseDateText('2', 'dmy', spec).state).toBe('incomplete')
    expect(analyseDateText('23.0', 'dmy', spec).state).toBe('incomplete')
    expect(analyseDateText('23.04.19', 'dmy', spec).state).toBe('incomplete')
    expect(analyseDateText('23.04.1990', 'dmy', spec).state).toBe('valid')
    expect(analyseDateText('00.04.1990', 'dmy', spec).state).toBe('invalid')
    expect(analyseDateText('23.13.1990', 'dmy', spec).state).toBe('invalid')
    expect(analyseDateText('23.04.0000', 'dmy', spec).state).toBe('invalid')
    expect(analyseDateText('23.04.1990.', 'dmy', spec).state).toBe('invalid')
    expect(analyseDateText('23.04.19900', 'dmy', spec).state).toBe('invalid')
    expect(analyseDateText('1.04.1990', 'dmy', spec).state).toBe('invalid')
    expect(analyseDateText('23-04-1990', 'dmy', spec).state).toBe('invalid')
  })

  it('knows a month, a year alone, and the year waiting for a month', () => {
    const monthSpec: DateSpec = { kind: 'month' }
    expect(analyseDateText('2024', 'dmy', monthSpec)).toEqual({ state: 'valid', iso: '2024' })
    expect(analyseDateText('1050', 'dmy', monthSpec)).toEqual({ state: 'valid', iso: '1050' })
    expect(analyseDateText('2024-', 'iso', monthSpec)).toEqual({ state: 'valid', iso: '2024' })
    expect(analyseDateText('2024/0', 'ymd_slash', monthSpec).state).toBe('incomplete')
    expect(analyseDateText('03.', 'dmy', monthSpec).state).toBe('incomplete')
    expect(analyseDateText('20', 'dmy', monthSpec).state).toBe('incomplete')
    expect(analyseDateText('03.2024', 'dmy', monthSpec)).toEqual({ state: 'valid', iso: '2024-03' })
    expect(analyseDateText('2024-13', 'iso', monthSpec).state).toBe('invalid')
  })
})

describe('showing a stored date or an instant', () => {
  it('writes a stored date, a month and a year in each notation', () => {
    expect(formatStoredDate('1990-04-23', 'dmy')).toBe('23.04.1990')
    expect(formatStoredDate('1990-04-23', 'ymd_slash')).toBe('1990/04/23')
    expect(formatStoredDate('1990-04-23', 'iso')).toBe('1990-04-23')
    expect(formatStoredDate('2024-03', 'dmy')).toBe('03.2024')
    expect(formatStoredDate('2024-03', 'ymd_slash')).toBe('2024/03')
    expect(formatStoredDate('2024-03', 'iso')).toBe('2024-03')
    expect(formatStoredDate('2024', 'dmy')).toBe('2024')
  })

  it('shows an old value as it is, and nothing for nothing', () => {
    expect(formatStoredDate('Q3 2024', 'dmy')).toBe('Q3 2024')
    expect(formatStoredDate('', 'dmy')).toBe('')
    expect(formatStoredDate(null, 'dmy')).toBe('')
    expect(formatStoredDate(undefined, 'iso')).toBe('')
  })

  it('writes a day from its numbers, and month and day without a year', () => {
    expect(formatDayParts(2026, 11, 9, 'dmy')).toBe('09.11.2026')
    expect(formatDayParts(2026, 11, 9, 'ymd_slash')).toBe('2026/11/09')
    expect(formatDayParts(2026, 11, 9, 'iso')).toBe('2026-11-09')
    expect(formatMonthDay(11, 9, 'dmy')).toBe('09.11.')
    expect(formatMonthDay(11, 9, 'ymd_slash')).toBe('11/09')
    expect(formatMonthDay(11, 9, 'iso')).toBe('11-09')
  })
})
