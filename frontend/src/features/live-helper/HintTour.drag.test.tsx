import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLanguage } from '../../i18n'
import { HintTour } from './HintTour'

// Moving the hint card: by the head with the pointer, by the arrow keys on the grip; it stays inside the window and stays where it
// was put from hint to hint, while the light moves on.

const NEAR = { x: 20, y: 40, left: 20, top: 40, right: 140, bottom: 76, width: 120, height: 36, toJSON: () => ({}) }
const FAR = { x: 800, y: 600, left: 800, top: 600, right: 920, bottom: 636, width: 120, height: 36, toJSON: () => ({}) }

function control(target: string, rect = NEAR) {
  const element = document.createElement('button')
  element.setAttribute('data-hint', target)
  element.getBoundingClientRect = () => rect
  document.body.appendChild(element)
}

function setWindow(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

beforeEach(async () => {
  await applyLanguage('de')
  // Real frames: the card glides and the light follows. jsdom has no layout, so the card measures 0 x 0 and the numbers below are exact.
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} })
  Element.prototype.scrollIntoView = () => {}
  setWindow(1024, 768)
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const props = () => ({ onClose: vi.fn(), onShowIntro: vi.fn(), onOpenHandbook: vi.fn() })
const left = (card: HTMLElement) => Number.parseFloat(card.style.left)
const grip = () => screen.getByTestId('drag-grip')
const reset = () => screen.getByTestId('drag-reset')

describe('HintTour, moving the card', () => {
  it('has a visible grip with a description; the reset has its room from the start and is hidden', async () => {
    control('applications-new')
    render(<HintTour screen="applications" open {...props()} />)
    expect(await screen.findByTestId('drag-grip')).toHaveAccessibleName(/Fenster verschieben/)
    expect(screen.getByTestId('hint-handle').className).toContain('cursor-grab')
    expect(reset().className).toContain('invisible')
  })

  it('moves with the arrow keys on the grip, and stays where it was put when the next hint comes while the light moves on', async () => {
    control('applications-new')
    control('applications-views', FAR)
    render(<HintTour screen="applications" open {...props()} />)
    const card = await screen.findByTestId('hint-card')
    await vi.waitFor(() => expect(left(card)).toBe(80))
    fireEvent.keyDown(grip(), { key: 'ArrowRight' })
    await vi.waitFor(() => expect(left(card)).toBe(96))
    fireEvent.keyDown(grip(), { key: 'ArrowRight', shiftKey: true })
    await vi.waitFor(() => expect(left(card)).toBe(160))
    expect(reset().className).not.toContain('invisible')

    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
    await screen.findByText('Hinweis 2 von 2')
    await vi.waitFor(() => expect(Number.parseFloat(screen.getByTestId('hint-spot').style.left)).toBe(794), { timeout: 4000 })
    expect(left(card)).toBe(160)
  })

  it('moves with the pointer on the head and never leaves the window', async () => {
    control('applications-new')
    render(<HintTour screen="applications" open {...props()} />)
    const card = await screen.findByTestId('hint-card')
    const handle = screen.getByTestId('hint-handle')
    await vi.waitFor(() => expect(left(card)).toBe(80))
    fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1, button: 0, pointerType: 'mouse' })
    fireEvent.pointerMove(handle, { clientX: 140, clientY: 130, pointerId: 1, pointerType: 'mouse' })
    await vi.waitFor(() => expect(left(card)).toBe(120))
    fireEvent.pointerMove(handle, { clientX: 99999, clientY: 99999, pointerId: 1, pointerType: 'mouse' })
    await vi.waitFor(() => expect(left(card)).toBe(1024 - 12))
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'mouse' })
    // After the drag nothing moves on its own
    fireEvent.pointerMove(handle, { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'mouse' })
    expect(left(card)).toBe(1024 - 12)
  })

  it('puts the card back inside when the window gets smaller', async () => {
    control('applications-new')
    render(<HintTour screen="applications" open {...props()} />)
    const card = await screen.findByTestId('hint-card')
    for (let i = 0; i < 3; i++) fireEvent.keyDown(grip(), { key: 'ArrowRight', shiftKey: true })
    await vi.waitFor(() => expect(left(card)).toBe(272))
    setWindow(200, 768)
    fireEvent(window, new Event('resize'))
    await vi.waitFor(() => expect(left(card)).toBeLessThanOrEqual(200 - 12))
  })

  it('"Position zurücksetzen" puts the card next to the control again; a new start places it by itself', async () => {
    control('applications-new')
    const handlers = props()
    const view = render(<HintTour screen="applications" open {...handlers} />)
    const card = await screen.findByTestId('hint-card')
    fireEvent.keyDown(grip(), { key: 'ArrowRight', shiftKey: true })
    await vi.waitFor(() => expect(left(card)).toBe(144))
    fireEvent.click(screen.getByRole('button', { name: 'Position zurücksetzen' }))
    await vi.waitFor(() => expect(left(card)).toBe(80), { timeout: 4000 })

    fireEvent.keyDown(grip(), { key: 'ArrowDown', shiftKey: true })
    await vi.waitFor(() => expect(reset().className).not.toContain('invisible'))
    view.rerender(<HintTour screen="applications" open={false} {...handlers} />)
    view.rerender(<HintTour screen="applications" open {...handlers} />)
    await vi.waitFor(() => expect(reset().className).toContain('invisible'))
  })

  it('keeps the focus inside the card while the arrow keys move it', async () => {
    control('applications-new')
    render(<HintTour screen="applications" open {...props()} />)
    const dialog = await screen.findByRole('dialog')
    grip().focus()
    fireEvent.keyDown(grip(), { key: 'ArrowDown' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })
})
