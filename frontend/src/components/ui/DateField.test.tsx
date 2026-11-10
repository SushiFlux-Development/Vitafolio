import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import type { User } from '../../api/types'
import { ADMIN } from '../../test/fixtures'
import { renderInApp } from '../../test/render'
import type { DateFormatPreference, DateSpec } from '../../validation/dates'
import { DateField } from './DateField'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

const userWith = (dateFormat: DateFormatPreference): User => ({ ...ADMIN, dateFormat })

/** A form around the field that holds what the field hands over, like the real forms do, and shows it for the tests. */
function Harness({ spec, initial = '', attempted = false, onChange }: { spec: DateSpec; initial?: string; attempted?: boolean; onChange?: (stored: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <DateField
        label="Datum"
        spec={spec}
        value={value}
        attempted={attempted}
        onValueChange={(stored) => {
          setValue(stored)
          onChange?.(stored)
        }}
      />
      <output data-testid="stored">{value}</output>
      <button type="button" onClick={() => setValue('2000-01-31')}>
        von außen
      </button>
    </>
  )
}

const DAY: DateSpec = { kind: 'day' }
const MONTH: DateSpec = { kind: 'month' }
const REQUIRED_MONTH: DateSpec = { kind: 'month', required: true }

const field = () => screen.getByLabelText(/^Datum/)
const stored = () => screen.getByTestId('stored').textContent

function renderField(props: Parameters<typeof Harness>[0], dateFormat: DateFormatPreference = 'dmy') {
  return renderInApp(<Harness {...props} />, { user: userWith(dateFormat) })
}

describe('DateField: typing', () => {
  it.each([
    ['dmy', '23041990', '23.04.1990', 'TT.MM.JJJJ'],
    ['ymd_slash', '19900423', '1990/04/23', 'JJJJ/MM/TT'],
    ['iso', '19900423', '1990-04-23', 'JJJJ-MM-TT'],
  ] as const)('shows the %s notation while only digits are typed, and hands the form ISO text', async (format, digits, shown, placeholder) => {
    const user = userEvent.setup()
    renderField({ spec: DAY }, format)
    expect(field()).toHaveAttribute('placeholder', placeholder)
    expect(field()).toHaveAttribute('inputmode', 'numeric')
    await user.type(field(), digits)
    expect(field()).toHaveValue(shown)
    expect(stored()).toBe('1990-04-23')
    expect(field()).not.toHaveAttribute('aria-invalid')
  })

  it('follows the interface language when the setting is "auto"', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY }, 'auto')
    await user.type(field(), '23041990')
    expect(field()).toHaveValue('23.04.1990')
    await i18n.changeLanguage('en')
    // The language changed under the field: the same stored date, now in the English default notation.
    expect(await screen.findByDisplayValue('1990-04-23')).toBeInTheDocument()
    expect(field()).toHaveAttribute('placeholder', 'YYYY-MM-DD')
    await i18n.changeLanguage('de')
  })

  it('puts the separators in by itself, and keeps an unfinished date as typed in the form (never lost, never valid)', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY })
    await user.type(field(), '2304')
    expect(field()).toHaveValue('23.04.')
    expect(stored()).toBe('23.04.')
    await user.type(field(), '1990')
    expect(stored()).toBe('1990-04-23')
    await user.type(field(), '5')
    expect(field()).toHaveValue('23.04.1990')
  })

  it('ignores letters and other characters', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY })
    await user.type(field(), '2a3-x')
    expect(field()).toHaveValue('23.')
  })

  it('pads a day typed with a separator behind it', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY })
    await user.type(field(), '5.3.2024')
    expect(field()).toHaveValue('05.03.2024')
    expect(stored()).toBe('2024-03-05')
  })

  it('deletes with Backspace from the end, also over the separator that was put in', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY, initial: '1990-04-23' })
    await user.click(field())
    await user.keyboard('{End}{Backspace}')
    expect(field()).toHaveValue('23.04.199')
    expect(stored()).toBe('23.04.199')
    await user.keyboard('{Backspace}{Backspace}{Backspace}')
    expect(field()).toHaveValue('23.04.')
    await user.keyboard('{Backspace}')
    expect(field()).toHaveValue('23.0')
  })

  it('edits in the middle: the caret stays behind the digit that was changed', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY, initial: '1990-04-23' })
    const input = field() as HTMLInputElement
    await user.click(input)
    input.setSelectionRange(1, 1)
    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('30.41.990')
    expect(input.selectionStart).toBe(0)
    input.setSelectionRange(0, 0)
    await user.keyboard('1')
    expect(input).toHaveValue('13.04.1990')
    expect(input.selectionStart).toBe(1)
    await user.keyboard('2')
    expect(input).toHaveValue('12.30.4199')
    expect(input.selectionStart).toBe(2)
  })

  it('steps over a separator in the middle instead of eating a digit', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY, initial: '1990-04-23' })
    const input = field() as HTMLInputElement
    await user.click(input)
    input.setSelectionRange(3, 3)
    await user.keyboard('{Backspace}')
    expect(input).toHaveValue('23.04.1990')
    expect(input.selectionStart).toBe(2)
  })

  it('replaces a selection', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY, initial: '1990-04-23' })
    await user.click(field())
    await user.keyboard('{Control>}a{/Control}')
    await user.keyboard('1')
    expect(field()).toHaveValue('1')
    expect(stored()).toBe('1')
  })
})

describe('DateField: months and years', () => {
  it.each([
    ['dmy', '032024', '03.2024', 'MM.JJJJ'],
    ['ymd_slash', '202403', '2024/03', 'JJJJ/MM'],
    ['iso', '202403', '2024-03', 'JJJJ-MM'],
  ] as const)('takes a month in the %s notation', async (format, digits, shown, placeholder) => {
    const user = userEvent.setup()
    renderField({ spec: MONTH }, format)
    expect(field()).toHaveAttribute('placeholder', placeholder)
    await user.type(field(), digits)
    expect(field()).toHaveValue(shown)
    expect(stored()).toBe('2024-03')
  })

  it('does not cut a bare year into a month and a year (two leading digits above 12 are a year)', async () => {
    const user = userEvent.setup()
    renderField({ spec: MONTH })
    await user.type(field(), '2024')
    expect(field()).toHaveValue('2024')
    expect(stored()).toBe('2024')
    expect(field()).not.toHaveAttribute('aria-invalid')
  })

  it('still cuts a month when the first two digits are a month', async () => {
    const user = userEvent.setup()
    renderField({ spec: MONTH })
    await user.type(field(), '12')
    expect(field()).toHaveValue('12.')
    await user.type(field(), '1999')
    expect(field()).toHaveValue('12.1999')
    expect(stored()).toBe('1999-12')
  })

  it('takes a year alone in a year-first notation, and drops the waiting separator when the field is left', async () => {
    const user = userEvent.setup()
    renderField({ spec: MONTH }, 'iso')
    await user.type(field(), '2024')
    expect(field()).toHaveValue('2024-')
    expect(stored()).toBe('2024')
    expect(field()).not.toHaveAttribute('aria-invalid')
    await user.tab()
    expect(field()).toHaveValue('2024')
    expect(stored()).toBe('2024')
    expect(field()).not.toHaveAttribute('aria-invalid')
  })
})

describe('DateField: pasting', () => {
  it.each(['23.04.1990', '1990/04/23', '1990-04-23', '23.4.1990'])('takes %s and writes it in the active notation', async (pasted) => {
    const user = userEvent.setup()
    renderField({ spec: DAY })
    await user.click(field())
    await user.paste(pasted)
    expect(field()).toHaveValue('23.04.1990')
    expect(stored()).toBe('1990-04-23')
  })

  it('writes the same paste in another active notation', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY }, 'iso')
    await user.click(field())
    await user.paste('23.04.1990')
    expect(field()).toHaveValue('1990-04-23')
    expect(stored()).toBe('1990-04-23')
  })

  it('replaces what was there, also for a month field and a lone year', async () => {
    const user = userEvent.setup()
    renderField({ spec: MONTH, initial: '2020-05' })
    await user.click(field())
    await user.keyboard('{Control>}a{/Control}')
    await user.paste('2024-03')
    expect(field()).toHaveValue('03.2024')
    expect(stored()).toBe('2024-03')
    await user.keyboard('{Control>}a{/Control}')
    await user.paste('2019')
    expect(field()).toHaveValue('2019')
    expect(stored()).toBe('2019')
  })

  it('takes other pasted text digit by digit, like typing', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY })
    await user.click(field())
    await user.paste('am 23. April')
    expect(field()).toHaveValue('23.')
  })
})

describe('DateField: live validation', () => {
  it('stays calm while nobody typed, and for a start that can still become valid', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY })
    expect(field()).not.toHaveAttribute('aria-invalid')
    await user.type(field(), '23.04.19'.replaceAll('.', ''))
    expect(field()).not.toHaveAttribute('aria-invalid')
  })

  it('names a day that does not exist, on the keystroke that makes it so - before any blur', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY })
    await user.type(field(), '3002')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Diesen Tag gibt es im Kalender nicht.')).toBeInTheDocument()
    await user.type(field(), '1990')
    expect(screen.getByText('Diesen Tag gibt es im Kalender nicht.')).toBeInTheDocument()
    expect(stored()).toBe('30.02.1990')
    // 29 February needs a leap year
    await user.clear(field())
    await user.type(field(), '29022000')
    expect(field()).not.toHaveAttribute('aria-invalid')
    expect(stored()).toBe('2000-02-29')
    await user.clear(field())
    await user.type(field(), '29021900')
    expect(screen.getByText('Diesen Tag gibt es im Kalender nicht.')).toBeInTheDocument()
  })

  it('says what is expected in the active notation, with an example', async () => {
    const user = userEvent.setup()
    const { unmount } = renderField({ spec: DAY })
    await user.type(field(), '45')
    expect(screen.getByText('Bitte als TT.MM.JJJJ angeben, z. B. 23.04.1990.')).toBeInTheDocument()
    unmount()
    renderField({ spec: MONTH }, 'ymd_slash')
    await user.type(field(), '202413')
    expect(screen.getByText('Bitte als JJJJ/MM angeben, z. B. 2024/03 (oder nur das Jahr).')).toBeInTheDocument()
  })

  it('does not call an unfinished date wrong until the field is left', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY })
    await user.type(field(), '2304')
    expect(field()).not.toHaveAttribute('aria-invalid')
    await user.tab()
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Bitte als TT.MM.JJJJ angeben, z. B. 23.04.1990.')).toBeInTheDocument()
  })

  it('says "required" after typing and emptying, and shows it at once after a submit attempt', async () => {
    const user = userEvent.setup()
    const { unmount } = renderField({ spec: REQUIRED_MONTH })
    expect(field()).not.toHaveAttribute('aria-invalid')
    await user.type(field(), '1')
    await user.clear(field())
    expect(screen.getByText('Bitte den Monat angeben, z. B. 03.2024.')).toBeInTheDocument()
    unmount()
    renderField({ spec: REQUIRED_MONTH, attempted: true })
    expect(screen.getByText('Bitte den Monat angeben, z. B. 03.2024.')).toBeInTheDocument()
  })

  it('reports a year the field does not allow while it is typed', async () => {
    const user = userEvent.setup()
    renderField({ spec: { kind: 'day', minYear: 2000, maxYear: 2100 } })
    await user.type(field(), '01011999')
    expect(screen.getByText('Bitte ein Jahr zwischen 2000 und 2100 angeben.')).toBeInTheDocument()
    expect(stored()).toBe('1999-01-01')
    await user.clear(field())
    await user.type(field(), '010120')
    expect(field()).not.toHaveAttribute('aria-invalid')
  })

  it('reserves the room of the longest message up front, so nothing moves when one appears', async () => {
    const user = userEvent.setup()
    const { container } = renderField({ spec: { kind: 'day', minYear: 2000, maxYear: 2100, required: true } })
    const reserved = () => [...container.querySelectorAll('[data-reserved]')].map((node) => node.getAttribute('data-reserved'))
    const before = reserved()
    expect(before).toEqual(expect.arrayContaining(['Bitte das Datum angeben, z. B. 23.04.1990.', 'Bitte als TT.MM.JJJJ angeben, z. B. 23.04.1990.', 'Diesen Tag gibt es im Kalender nicht.', 'Bitte ein Jahr zwischen 2000 und 2100 angeben.']))
    await user.type(field(), '45')
    expect(reserved()).toEqual(before)
    // The reserved copies are no text in the page.
    expect(screen.getAllByText('Bitte als TT.MM.JJJJ angeben, z. B. 23.04.1990.')).toHaveLength(1)
  })
})

describe('DateField: what is there already', () => {
  it('shows a stored ISO date in the active notation, and a stored month and year too', () => {
    renderField({ spec: DAY, initial: '1990-04-23' })
    expect(field()).toHaveValue('23.04.1990')
    expect(stored()).toBe('1990-04-23')
  })

  it('shows an old value that fits no pattern as it is, marks it as wrong, and does not touch it', async () => {
    const onChange = vi.fn()
    renderField({ spec: MONTH, initial: 'Sommer 2019', onChange })
    expect(field()).toHaveValue('Sommer 2019')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Bitte als MM.JJJJ angeben, z. B. 03.2024 (oder nur das Jahr).')).toBeInTheDocument()
    expect(stored()).toBe('Sommer 2019')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('lets an old value be fixed by editing, one character at a time', async () => {
    const user = userEvent.setup()
    renderField({ spec: MONTH, initial: 'Q3 2019' })
    await user.click(field())
    await user.keyboard('{Control>}a{/Control}{Backspace}')
    expect(field()).toHaveValue('')
    await user.type(field(), '092019')
    expect(field()).toHaveValue('09.2019')
    expect(stored()).toBe('2019-09')
    expect(field()).not.toHaveAttribute('aria-invalid')
  })

  it('marks an ISO value that is no real date, in the notation, and keeps it', () => {
    renderField({ spec: DAY, initial: '1990-02-30' })
    expect(field()).toHaveValue('30.02.1990')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(stored()).toBe('1990-02-30')
  })

  it('turns an old finished date in a known notation into ISO text', () => {
    renderField({ spec: DAY, initial: '23.04.1990' })
    expect(field()).toHaveValue('23.04.1990')
    expect(stored()).toBe('1990-04-23')
    expect(field()).not.toHaveAttribute('aria-invalid')
  })

  it('shows a value that changes from outside (another entry, a quick fill, a reset)', async () => {
    const user = userEvent.setup()
    renderField({ spec: DAY, initial: '1990-04-23' })
    await user.click(screen.getByRole('button', { name: 'von außen' }))
    expect(field()).toHaveValue('31.01.2000')
  })

  it('works with change events that carry a whole text (autofill, tests, scripted input)', () => {
    renderField({ spec: DAY })
    fireEvent.change(field(), { target: { value: '23041990' } })
    expect(field()).toHaveValue('23.04.1990')
    expect(stored()).toBe('1990-04-23')
    fireEvent.change(field(), { target: { value: '' } })
    expect(field()).toHaveValue('')
    expect(stored()).toBe('')
  })

  it('stays disabled when told to, with its value', () => {
    renderInApp(<DateField label="Datum" spec={MONTH} value="2024-03" onValueChange={() => undefined} disabled />, { user: userWith('dmy') })
    expect(field()).toBeDisabled()
    expect(field()).toHaveValue('03.2024')
  })
})
