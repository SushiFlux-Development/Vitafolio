import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLanguage } from '../../i18n'
import { HintTour, placeCard } from './HintTour'

const RECT = { x: 20, y: 40, left: 20, top: 40, right: 140, bottom: 76, width: 120, height: 36, toJSON: () => ({}) }

function control(target: string, rect = RECT) {
  const element = document.createElement('button')
  element.setAttribute('data-hint', target)
  element.getBoundingClientRect = () => rect
  document.body.appendChild(element)
  return element
}

beforeEach(async () => {
  await applyLanguage('de')
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  Element.prototype.scrollIntoView = () => {}
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function renderHints(handlers: Partial<{ onClose: () => void; onShowIntro: () => void; onOpenHandbook: () => void }> = {}) {
  const props = { onClose: vi.fn(), onShowIntro: vi.fn(), onOpenHandbook: vi.fn(), ...handlers }
  render(<HintTour screen="applications" open {...props} />)
  return props
}

describe('HintTour', () => {
  it('shows one hint after the other, with the count, and ends with "Fertig"', async () => {
    control('applications-new')
    control('applications-views')
    const { onClose } = renderHints()

    expect(await screen.findByText('Hinweis 1 von 2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Neue Bewerbung' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    expect(await screen.findByText('Hinweis 2 von 2')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ansicht' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Fertig' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('skips a control that is not on the page instead of pointing at nothing', async () => {
    control('applications-new')
    control('applications-board')
    renderHints()
    expect(await screen.findByText('Hinweis 1 von 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    // Not "Anlagen & Zeugnisse" and not "Ansicht": those controls are absent
    expect(await screen.findByRole('heading', { name: 'Ihre Bewerbungen' })).toBeInTheDocument()
  })

  it('closes at once when none of its controls is left', async () => {
    const { onClose } = renderHints()
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('puts the light around the control, with room to breathe', async () => {
    control('applications-new')
    renderHints()
    const spot = await screen.findByTestId('hint-spot')
    expect(spot.style.left).toBe('14px')
    expect(spot.style.top).toBe('34px')
    expect(spot.style.width).toBe('132px')
    expect(spot.style.height).toBe('48px')
    expect(spot).toHaveAttribute('aria-hidden', 'true')
  })

  it('is a dialog of its own, named by its hint, with the keyboard focus on "Weiter"', async () => {
    control('applications-new')
    control('applications-views')
    renderHints()
    const card = await screen.findByRole('dialog')
    expect(card).toHaveAttribute('aria-modal', 'true')
    expect(card).toHaveAttribute('data-live-helper')
    expect(card).toHaveAccessibleName('Neue Bewerbung')
    expect(screen.getByRole('button', { name: 'Weiter' })).toHaveFocus()
  })

  it('keeps the focus inside the card when Tab runs past the ends', async () => {
    control('applications-new')
    control('applications-views')
    renderHints()
    const card = await screen.findByRole('dialog')
    const buttons = [...card.querySelectorAll('button')]
    buttons[buttons.length - 1]!.focus()
    fireEvent.keyDown(buttons[buttons.length - 1]!, { key: 'Tab' })
    expect(buttons[0]).toHaveFocus()
    fireEvent.keyDown(buttons[0]!, { key: 'Tab', shiftKey: true })
    expect(buttons[buttons.length - 1]).toHaveFocus()
  })

  it('closes on Esc, and "Ausblenden" closes as well', async () => {
    control('applications-new')
    const first = renderHints()
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(first.onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Ausblenden' }))
    expect(first.onClose).toHaveBeenCalledTimes(2)
  })

  it('leads to the introduction and to the manual', async () => {
    control('applications-new')
    const { onShowIntro, onOpenHandbook } = renderHints()
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Einführung zeigen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Handbuch öffnen' }))
    expect(onShowIntro).toHaveBeenCalledTimes(1)
    expect(onOpenHandbook).toHaveBeenCalledTimes(1)
  })

  it('speaks English as well', async () => {
    await applyLanguage('en')
    control('applications-new')
    renderHints()
    expect(await screen.findByText('Hint 1 of 1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'New Application' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('shows nothing while closed', () => {
    control('applications-new')
    render(<HintTour screen="applications" open={false} onClose={() => {}} onShowIntro={() => {}} onOpenHandbook={() => {}} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('placeCard', () => {
  const card = { w: 352, h: 200 }
  const view = { w: 1024, h: 768 }
  const inside = (position: { left: number; top: number }) => {
    expect(position.left).toBeGreaterThanOrEqual(12)
    expect(position.top).toBeGreaterThanOrEqual(12)
    expect(position.left + card.w).toBeLessThanOrEqual(view.w - 12)
    expect(position.top + card.h).toBeLessThanOrEqual(view.h - 12)
  }
  const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height })

  it('puts the card below the control when there is room', () => {
    const position = placeCard(box(100, 100, 120, 36), card, view)
    expect(position.top).toBeGreaterThan(136)
    inside(position)
  })

  it('puts it above when there is no room below', () => {
    const position = placeCard(box(100, 700, 120, 36), card, view)
    expect(position.top + card.h).toBeLessThanOrEqual(700)
    inside(position)
  })

  it('stays inside the window at every corner', () => {
    for (const [left, top] of [[0, 0], [900, 0], [0, 730], [900, 730], [450, 380]] as const) inside(placeCard(box(left, top, 120, 36), card, view))
  })

  it('serves a tall control (the sections in the sidebar) from the side', () => {
    const position = placeCard(box(0, 100, 256, 600), card, view)
    expect(position.left).toBeGreaterThanOrEqual(256)
    inside(position)
  })

  it('stays in the window even in a window smaller than the card', () => {
    const position = placeCard(box(10, 10, 50, 20), { w: 352, h: 200 }, { w: 300, h: 150 })
    expect(position.left).toBeGreaterThanOrEqual(12)
    expect(position.top).toBeGreaterThanOrEqual(12)
  })

  it('centres the card while the control is not measured yet', () => {
    expect(placeCard(null, card, view)).toEqual({ left: 336, top: 284 })
  })
})
