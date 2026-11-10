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
  const props = { onClose: vi.fn(), onGoToProfile: vi.fn(), onOpenHandbook: vi.fn() }
  render(<IntroTour open {...props} />)
  return props
}

const next = () => fireEvent.click(screen.getByRole('button', { name: /^Weiter|^Fertig/ }))

describe('IntroTour', () => {
  it('starts with what the product is, in a dialog that has the focus on "Weiter"', async () => {
    renderIntro()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAccessibleName('Willkommen bei Vitafolio')
    expect(within(dialog).getByRole('heading', { name: 'Bewerbungen, die gut aussehen' })).toBeInTheDocument()
    expect(within(dialog).getByText('Schritt 1 von 6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Weiter/ })).toHaveFocus()
    expect(screen.getByRole('button', { name: /^Zurück/ })).toBeDisabled()
  })

  it('walks through six steps and ends with the way to the profile and the manual', async () => {
    const { onClose, onGoToProfile, onOpenHandbook } = renderIntro()
    const titles = [
      'Bewerbungen, die gut aussehen',
      'Das Stammprofil: einmal pflegen',
      'Das Anschreiben',
      'Bewerbungen und Mappe',
      'Ratgeber: Was gehört in die Bewerbung?',
      'Hilfe, wenn Sie sie brauchen',
    ]
    for (const [position, title] of titles.entries()) {
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
      expect(screen.getByText(`Schritt ${position + 1} von 6`)).toBeInTheDocument()
      // Three points on every step: the frame never changes
      expect(document.querySelector('[data-live-helper] ul')!.querySelectorAll('li')).toHaveLength(3)
      if (position < titles.length - 1) next()
    }
    expect(screen.getByRole('button', { name: /^Fertig/ })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Zum Stammprofil' }))
    fireEvent.click(screen.getByRole('button', { name: 'Handbuch öffnen' }))
    expect(onGoToProfile).toHaveBeenCalledTimes(1)
    expect(onOpenHandbook).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    next()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('names the guide with the sentence that tells what it does', async () => {
    renderIntro()
    for (let i = 0; i < 4; i++) next()
    expect(await screen.findByText('In wenigen Klicks erfahren Sie, was in Ihrer Situation in die Bewerbung gehört.')).toBeInTheDocument()
  })

  it('goes back, and the dots and the arrow keys move too', async () => {
    renderIntro()
    next()
    expect(await screen.findByRole('heading', { name: 'Das Stammprofil: einmal pflegen' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Zurück/ }))
    expect(await screen.findByRole('heading', { name: 'Bewerbungen, die gut aussehen' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Schritt 3:/ }))
    expect(await screen.findByRole('heading', { name: 'Das Anschreiben' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(await screen.findByRole('heading', { name: 'Bewerbungen und Mappe' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(await screen.findByRole('heading', { name: 'Das Anschreiben' })).toBeInTheDocument()
  })

  it('can be skipped at any time: with the button, with Esc and with the close button', async () => {
    const first = renderIntro()
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Überspringen' }))
    expect(first.onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(first.onClose).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(first.onClose).toHaveBeenCalledTimes(3)
  })

  it('keeps the same frame on every step (fixed height, the marker for the helper)', async () => {
    renderIntro()
    await screen.findByRole('dialog')
    const frame = () => document.querySelector('[data-live-helper]') as HTMLElement
    expect(frame().className).toContain('h-[21rem]')
    for (let i = 0; i < 5; i++) next()
    expect(frame().className).toContain('h-[21rem]')
  })

  it('keeps the focus on the one button that is "Weiter" and then "Fertig"', async () => {
    renderIntro()
    await screen.findByRole('dialog')
    const button = screen.getByRole('button', { name: /^Weiter/ })
    for (let i = 0; i < 5; i++) next()
    expect(screen.getByRole('button', { name: /^Fertig/ })).toBe(button)
  })

  it('is in English as well', async () => {
    await applyLanguage('en')
    renderIntro()
    expect(await screen.findByRole('heading', { name: 'Applications that look good' })).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: /^Next/ }))
    expect(await screen.findByText('In a few clicks you find out what belongs in your application in your situation.')).toBeInTheDocument()
  })

  it('starts at the first step again when it is opened a second time', async () => {
    const props = { onClose: vi.fn(), onGoToProfile: vi.fn(), onOpenHandbook: vi.fn() }
    const view = render(<IntroTour open {...props} />)
    next()
    next()
    view.rerender(<IntroTour open={false} {...props} />)
    view.rerender(<IntroTour open {...props} />)
    expect(await screen.findByRole('heading', { name: 'Bewerbungen, die gut aussehen' })).toBeInTheDocument()
  })
})
