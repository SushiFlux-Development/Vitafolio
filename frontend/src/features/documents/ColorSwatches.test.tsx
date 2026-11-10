import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { useState } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ColorSwatches } from './ColorSwatches'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

/** Holds the colour like the pages do (state that the control reports into) and records every report. */
function Harness({ initial, report }: { initial: string | null | undefined; report?: (hex: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <ColorSwatches
        value={value}
        label="Akzentfarbe"
        onChange={(hex) => {
          setValue(hex)
          report?.(hex)
        }}
      />
      <output data-testid="stored">{value}</output>
    </>
  )
}

const customButton = () => screen.getByRole('button', { name: /^Eigene Farbe/ })
const checkedSwatches = () => screen.getAllByRole('radio').filter((swatch) => swatch.getAttribute('aria-checked') === 'true')

describe('ColorSwatches: the eight fixed colours', () => {
  it('shows exactly one of them as chosen when the stored colour is one of them (any case), and the own colour as inactive', () => {
    render(<Harness initial="#0284c7" />)
    expect(checkedSwatches().map((swatch) => swatch.getAttribute('aria-label'))).toEqual(['Blue (#0284C7)'])
    expect(customButton()).toHaveAccessibleName('Eigene Farbe')
    expect(customButton()).not.toHaveTextContent('#')
  })

  it('moves the choice with the arrow keys, wrapping around', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#14213D" report={report} />)
    screen.getByRole('radio', { name: /Navy/ }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(report).toHaveBeenLastCalledWith('#334155')
    expect(screen.getByRole('radio', { name: /Slate/ })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(report).toHaveBeenLastCalledWith('#14213D')
  })
})

describe('ColorSwatches: a stored colour that is none of the eight', () => {
  it('appears as the own colour, with its value, and no swatch is chosen', () => {
    render(<Harness initial="#aa2200" />)
    expect(checkedSwatches()).toHaveLength(0)
    expect(customButton()).toHaveAccessibleName('Eigene Farbe #AA2200')
    expect(customButton()).toHaveTextContent('#AA2200')
    expect(customButton()).toHaveStyle({ backgroundColor: 'rgb(170, 34, 0)' })
  })

  it('recognises it without the hash and in a short form too', () => {
    const { unmount } = render(<Harness initial="aa2200" />)
    expect(customButton()).toHaveTextContent('#AA2200')
    unmount()
    render(<Harness initial="#a20" />)
    expect(customButton()).toHaveTextContent('#AA2200')
  })

  it('keeps a first tab stop in the group and takes the first arrow key to the first or the last swatch', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#aa2200" report={report} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([radios[0]])
    radios[3]!.focus()
    await user.keyboard('{ArrowLeft}')
    expect(report).toHaveBeenLastCalledWith('#334155')
  })

  it('goes back to inactive when one of the eight is chosen', async () => {
    const user = userEvent.setup()
    render(<Harness initial="#aa2200" />)
    await user.click(screen.getByRole('radio', { name: /Emerald/ }))
    expect(customButton()).toHaveAccessibleName('Eigene Farbe')
    expect(checkedSwatches()).toHaveLength(1)
  })

  it.each([null, undefined, '', 'red', '#12'])('treats %j as no colour at all: nothing chosen, own colour inactive, first swatch is the tab stop', (stored) => {
    render(<Harness initial={stored} />)
    expect(checkedSwatches()).toHaveLength(0)
    expect(customButton()).toHaveAccessibleName('Eigene Farbe')
    expect(screen.getAllByRole('radio')[0]!.tabIndex).toBe(0)
  })
})

describe('ColorSwatches: the own-colour picker', () => {
  it('opens as a dialog from the button, focuses its colour field and closes with Esc, giving the focus back', async () => {
    const user = userEvent.setup()
    render(<Harness initial="#14213D" />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(customButton())
    const dialog = screen.getByRole('dialog', { name: 'Eigene Farbe wählen' })
    expect(customButton()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('slider', { name: 'Sättigung und Helligkeit' })).toHaveFocus()
    expect(dialog).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(customButton()).toHaveFocus()
  })

  it('moves the focus in only when the popover is visible (a hidden element cannot take the focus in a real browser)', async () => {
    const user = userEvent.setup()
    const seen: { label: string | null; visibility: string | undefined }[] = []
    const original = HTMLElement.prototype.focus
    const spy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, ...args) {
      const panel = this.closest<HTMLElement>('[role="dialog"]')
      if (panel) seen.push({ label: this.getAttribute('aria-label'), visibility: panel.style.visibility })
      return original.apply(this, args)
    })
    try {
      render(<Harness initial="#14213D" />)
      await user.click(customButton())
    } finally {
      spy.mockRestore()
    }
    const area = seen.filter((call) => call.label === 'Sättigung und Helligkeit')
    expect(area.length).toBeGreaterThan(0)
    expect(area.every((call) => call.visibility === 'visible')).toBe(true)
    expect(screen.getByRole('slider', { name: 'Sättigung und Helligkeit' })).toHaveFocus()
  })

  it('closes on a click outside', async () => {
    const user = userEvent.setup()
    render(
      <>
        <button type="button">daneben</button>
        <Harness initial="#14213D" />
      </>,
    )
    await user.click(customButton())
    await user.click(screen.getByRole('button', { name: 'daneben' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opening it changes nothing in the stored colour', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#14213D" report={report} />)
    await user.click(customButton())
    expect(report).not.toHaveBeenCalled()
    expect(checkedSwatches()).toHaveLength(1)
  })

  it('stores a typed six-digit colour at once and shows it as the own colour', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#14213D" report={report} />)
    await user.click(customButton())
    const field = screen.getByLabelText('Farbwert (Hex)')
    await user.clear(field)
    await user.type(field, '#c026d3')
    expect(report).toHaveBeenLastCalledWith('#C026D3')
    expect(screen.getByTestId('stored')).toHaveTextContent('#C026D3')
    expect(checkedSwatches()).toHaveLength(0)
    expect(customButton()).toHaveAccessibleName('Eigene Farbe #C026D3')
  })

  it('does not report the colours on the way to a longer one (a short form waits for Enter or leaving the field)', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#14213D" report={report} />)
    await user.click(customButton())
    const field = screen.getByLabelText('Farbwert (Hex)')
    await user.clear(field)
    await user.type(field, '#c02')
    expect(report).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(report).toHaveBeenCalledOnce()
    expect(report).toHaveBeenLastCalledWith('#CC0022')
    expect(field).toHaveValue('#CC0022')
  })

  it('accepts the value without a hash and in lower case', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#14213D" report={report} />)
    await user.click(customButton())
    const field = screen.getByLabelText('Farbwert (Hex)')
    await user.clear(field)
    await user.type(field, 'c026d3')
    expect(report).toHaveBeenLastCalledWith('#C026D3')
  })

  it('accepts a colour with transparency like the server does, and says what it means', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#14213D" report={report} />)
    await user.click(customButton())
    const field = screen.getByLabelText('Farbwert (Hex)')
    await user.clear(field)
    await user.type(field, '#14213D80')
    expect(report).toHaveBeenLastCalledWith('#14213D80')
    expect(screen.getByText(/Mit Transparenz/)).toBeInTheDocument()
  })

  it('shows a wrong character and a too long value on the keystroke, reports nothing for them, and the message goes with the fix', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#14213D" report={report} />)
    await user.click(customButton())
    const field = screen.getByLabelText('Farbwert (Hex)')
    await user.clear(field)
    expect(screen.getByText('Bitte eine Farbe eingeben, zum Beispiel #14213D.')).toBeInTheDocument()
    await user.type(field, '#12g')
    expect(screen.getByText('Nur die Zeichen 0 bis 9 und A bis F sind erlaubt.')).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    await user.clear(field)
    await user.type(field, '#123456789')
    expect(screen.getByText('Zu lang: 9 von höchstens 8 Ziffern.')).toBeInTheDocument()
    await user.type(field, '{Backspace}')
    expect(screen.queryByText(/Zu lang/)).toBeNull()
    expect(field).not.toHaveAttribute('aria-invalid')
    expect(report).not.toHaveBeenCalledWith('#123456789')
  })

  it('calls an unfinished colour incomplete only when the field is left', async () => {
    const user = userEvent.setup()
    render(<Harness initial="#14213D" />)
    await user.click(customButton())
    const field = screen.getByLabelText('Farbwert (Hex)')
    await user.clear(field)
    await user.type(field, '#12345')
    expect(screen.queryByText(/Unvollständig/)).toBeNull()
    await user.tab()
    expect(screen.getByText('Unvollständig: 5 Ziffern, erlaubt sind 3, 4, 6 oder 8.')).toBeInTheDocument()
  })

  it('moves the colour with the arrow keys on the colour field and the hue slider, and reports every step', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#FF0000" report={report} />)
    await user.click(customButton())
    // The field starts at full saturation and brightness; one step left lowers the saturation by 1 %.
    expect(screen.getByRole('slider', { name: 'Sättigung und Helligkeit' })).toHaveAttribute('aria-valuetext', 'Sättigung 100 %, Helligkeit 100 %')
    await user.keyboard('{ArrowLeft}')
    expect(report).toHaveBeenLastCalledWith('#FF0303')
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    expect(screen.getByRole('slider', { name: 'Sättigung und Helligkeit' })).toHaveAttribute('aria-valuetext', 'Sättigung 99 %, Helligkeit 90 %')
    const hue = screen.getByRole('slider', { name: 'Farbton' })
    hue.focus()
    await user.keyboard('{End}')
    expect(hue).toHaveAttribute('aria-valuenow', '360')
    await user.keyboard('{Home}')
    expect(hue).toHaveAttribute('aria-valuenow', '0')
    await user.keyboard('{ArrowRight}')
    expect(hue).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByLabelText('Farbwert (Hex)')).toHaveValue(report.mock.lastCall![0])
  })

  it('keeps the hue when the colour gets grey or black on the way', async () => {
    const user = userEvent.setup()
    render(<Harness initial="#00FF00" />)
    await user.click(customButton())
    const hue = screen.getByRole('slider', { name: 'Farbton' })
    expect(hue).toHaveAttribute('aria-valuenow', '120')
    screen.getByRole('slider', { name: 'Sättigung und Helligkeit' }).focus()
    await user.keyboard('{Shift>}' + '{ArrowDown}'.repeat(10) + '{/Shift}')
    expect(screen.getByRole('slider', { name: 'Sättigung und Helligkeit' })).toHaveAttribute('aria-valuetext', 'Sättigung 100 %, Helligkeit 0 %')
    expect(hue).toHaveAttribute('aria-valuenow', '120')
  })

  it('keeps Tab inside while it is open', async () => {
    const user = userEvent.setup()
    render(<Harness initial="#14213D" />)
    await user.click(customButton())
    const area = screen.getByRole('slider', { name: 'Sättigung und Helligkeit' })
    const field = screen.getByLabelText('Farbwert (Hex)')
    expect(area).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('slider', { name: 'Farbton' })).toHaveFocus()
    await user.tab()
    expect(field).toHaveFocus()
    await user.tab()
    expect(area).toHaveFocus()
    await user.tab({ shift: true })
    expect(field).toHaveFocus()
  })
})

describe('ColorSwatches: a colour that is too light for headings', () => {
  it('shows a calm hint in the picker and a marker on the button, and blocks nothing', async () => {
    const user = userEvent.setup()
    const report = vi.fn()
    render(<Harness initial="#14213D" report={report} />)
    await user.click(customButton())
    expect(screen.queryByText(/Diese Farbe ist hell/)).toBeNull()
    const field = screen.getByLabelText('Farbwert (Hex)')
    await user.clear(field)
    await user.type(field, '#FDE68A')
    expect(screen.getByText(/Diese Farbe ist hell \(Kontrast 1,2 zu 1 auf Weiß, empfohlen sind mindestens 3 zu 1\)/)).toBeInTheDocument()
    expect(field).not.toHaveAttribute('aria-invalid')
    expect(report).toHaveBeenLastCalledWith('#FDE68A')
    expect(customButton()).toHaveAttribute('title', 'Helle Farbe: Überschriften sind auf Weiß schwer zu lesen')
    await user.clear(field)
    await user.type(field, '#334155')
    expect(screen.queryByText(/Diese Farbe ist hell/)).toBeNull()
    expect(customButton()).not.toHaveAttribute('title', 'Helle Farbe: Überschriften sind auf Weiß schwer zu lesen')
  })

  it('shows the hint for a light colour that was stored earlier, as soon as the picker opens', async () => {
    const user = userEvent.setup()
    render(<Harness initial="#FFEE88" />)
    expect(customButton()).toHaveAttribute('title', 'Helle Farbe: Überschriften sind auf Weiß schwer zu lesen')
    await user.click(customButton())
    expect(screen.getByText(/Diese Farbe ist hell/)).toBeInTheDocument()
  })

  it('never rounds a ratio below 3 up to 3,0', async () => {
    const user = userEvent.setup()
    // #959595 on white is 2.99 (just under): the text must say 2,9, not 3,0.
    render(<Harness initial="#959595" />)
    await user.click(customButton())
    expect(screen.getByText(/Diese Farbe ist hell/)).toHaveTextContent('Kontrast 2,9 zu 1')
  })
})

describe('ColorSwatches: rigid layout', () => {
  it('keeps the own-colour button in the same classes for the active and the inactive state, apart from colour and ring', () => {
    const { unmount } = render(<Harness initial="#14213D" />)
    const inactive = customButton().className
    unmount()
    render(<Harness initial="#aa2200" />)
    const active = customButton().className
    const sizes = (className: string) => className.split(' ').filter((c) => /^(h-|w-|px-|py-|gap-|flex|items-|text-sm|font-)/.test(c))
    expect(sizes(active)).toEqual(sizes(inactive))
  })

  it('reserves the room for the longest hint and field message, as text that is not in the page', async () => {
    const user = userEvent.setup()
    render(<Harness initial="#14213D" />)
    await user.click(customButton())
    const dialog = screen.getByRole('dialog')
    const reserved = [...dialog.querySelectorAll('[data-reserved]')].map((node) => node.getAttribute('data-reserved'))
    expect(reserved.some((text) => text?.startsWith('Diese Farbe ist hell'))).toBe(true)
    expect(reserved.some((text) => text?.startsWith('Mit Transparenz'))).toBe(true)
    expect(reserved.some((text) => text?.startsWith('Unvollständig'))).toBe(true)
    expect(screen.queryByText(/Unvollständig/)).toBeNull()
  })
})
