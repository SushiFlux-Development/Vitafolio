import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLanguage } from '../../i18n'
import { IntroTour } from './IntroTour'

beforeEach(async () => {
  await applyLanguage('de')
})

afterEach(() => {
  cleanup()
})

function renderIntro() {
  render(<IntroTour open onClose={vi.fn()} onGoToProfile={vi.fn()} onOpenHandbook={vi.fn()} />)
}

/** (jsdom writes a shift of 0 on the second axis as just the first value: '16px 0px' reads back as '16px'.) */
/** jsdom has no layout: the dialog sits at (300, 100), 400 x 300, and its translate moves it like the browser would. */
function lay(dialog: HTMLElement) {
  dialog.getBoundingClientRect = () => {
    const [x = 0, y = 0] = (dialog.style.translate || '0px 0px').split(' ').map((value) => Number.parseFloat(value))
    const box = { left: 300 + x, top: 100 + y, width: 400, height: 300 }
    return { ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON: () => ({}) }
  }
}

describe('IntroTour, moving the dialog', () => {
  it('has a grip and a hidden reset, and moves with the arrow keys on the grip without changing the step', async () => {
    renderIntro()
    const dialog = await screen.findByRole('dialog')
    lay(dialog)
    const grip = within(dialog).getByTestId('drag-grip')
    expect(grip).toHaveAccessibleName(/Fenster verschieben/)
    expect(within(dialog).getByTestId('drag-reset').className).toContain('invisible')

    fireEvent.keyDown(grip, { key: 'ArrowRight' })
    expect(dialog.style.translate).toBe('16px')
    fireEvent.keyDown(grip, { key: 'ArrowDown', shiftKey: true })
    expect(dialog.style.translate).toBe('16px 64px')
    // The arrow keys were for the dialog, not for the steps
    expect(screen.getByText('Schritt 1 von 6')).toBeInTheDocument()
    expect(within(dialog).getByTestId('drag-reset').className).not.toContain('invisible')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Position zurücksetzen' }))
    expect(dialog.style.translate).toBe('0px')
  })

  it('still steps with the arrow keys when the focus is not on the grip', async () => {
    renderIntro()
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(await screen.findByText('Schritt 2 von 6')).toBeInTheDocument()
  })

  it('keeps the position from step to step', async () => {
    renderIntro()
    const dialog = await screen.findByRole('dialog')
    lay(dialog)
    fireEvent.keyDown(within(dialog).getByTestId('drag-grip'), { key: 'ArrowRight', shiftKey: true })
    fireEvent.click(screen.getByRole('button', { name: /^Weiter/ }))
    expect(await screen.findByText('Schritt 2 von 6')).toBeInTheDocument()
    expect(screen.getByRole('dialog').style.translate).toBe('64px')
  })

  it('is dragged by its head, but not by the close button in it', async () => {
    renderIntro()
    const dialog = await screen.findByRole('dialog')
    lay(dialog)
    expect(within(dialog).getByTestId('drag-head').className).toContain('cursor-grab')
    expect(within(dialog).getByRole('button', { name: 'Schließen' })).toHaveAttribute('data-no-drag')
  })
})
