import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as plainRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { AlertSlot } from './AlertSlot'

// ErrorNotice reads the app version through a query.
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function render(ui: ReactElement) {
  const wrap = (node: ReactElement) => <QueryClientProvider client={client}>{node}</QueryClientProvider>
  const result = plainRender(wrap(ui))
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) }
}

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

const reservedTexts = (container: HTMLElement) => [...container.querySelectorAll('[data-reserved]')].map((element) => element.getAttribute('data-reserved'))

describe('AlertSlot reserved room', () => {
  it('reserves only the normal answers and nothing at all when there are none', () => {
    const { container, rerender } = render(<AlertSlot reserve={['Falsches Passwort.']} reservePlain={['Gespeichert.']} />)
    expect(reservedTexts(container)).toEqual(['Falsches Passwort.', 'Gespeichert.'])
    expect(container.querySelector('.notice-reserve')).not.toBeNull()
    expect(container.querySelector('.notice-reserve-plain')).not.toBeNull()
    rerender(<AlertSlot />)
    // No fixed minimum height either: an empty slot is no band.
    expect(reservedTexts(container)).toEqual([])
    expect(container.firstElementChild?.className).not.toMatch(/min-h/)
  })

  it('keeps the copies out of the page text', () => {
    render(<AlertSlot reserve={['Nur reserviert.']} />)
    expect(document.body.textContent).not.toContain('Nur reserviert.')
  })
})

describe('AlertSlot failures', () => {
  const normal = new ApiError(401, { code: 'auth.invalid_credentials' })
  const rare = new ApiError(500, { code: 'internal', traceId: 'trace-123' })

  it('shows a failure of the normal flow in the slot itself', () => {
    render(<AlertSlot reserve={['x']} error={normal} normalCodes={['auth.invalid_credentials']} />)
    expect(screen.getByTestId('error-notice')).toBeInTheDocument()
    expect(screen.queryByTestId('alert-overlay')).toBeNull()
  })

  it('lays a rare failure over the content: complete, selectable, copyable and dismissable', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<AlertSlot reserve={['x']} error={rare} errorTitle="Speichern fehlgeschlagen:" normalCodes={['auth.invalid_credentials']} onDismiss={onDismiss} />)
    const overlay = screen.getByTestId('alert-overlay')
    expect(overlay.className).toMatch(/absolute/)
    // It scrolls itself when it is taller than half the window, so it never runs out of it.
    expect(overlay.className).toMatch(/max-h-/)
    expect(overlay.className).toMatch(/overflow-y-auto/)
    const notice = screen.getByTestId('error-notice')
    expect(notice).toHaveTextContent('Speichern fehlgeschlagen:')
    expect(notice.querySelector('p')?.className).toMatch(/select-text/)
    expect(screen.getByTestId('copy-button')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('takes no room for a rare failure: the reserved copies are the same with and without it', () => {
    const { container, rerender } = render(<AlertSlot reserve={['Falsches Passwort.']} normalCodes={['auth.invalid_credentials']} />)
    const before = reservedTexts(container)
    rerender(<AlertSlot reserve={['Falsches Passwort.']} normalCodes={['auth.invalid_credentials']} error={rare} />)
    expect(reservedTexts(container)).toEqual(before)
    // The in-flow cell stays empty, the failure lives only in the absolutely placed layer.
    expect(container.querySelector('.col-start-1.row-start-1')?.textContent).toBe('')
  })

  it('grows upward in dialogs and downward on pages', () => {
    const { rerender } = render(<AlertSlot error={rare} />)
    expect(screen.getByTestId('alert-overlay').className).toMatch(/top-0/)
    rerender(<AlertSlot error={rare} grow="up" />)
    expect(screen.getByTestId('alert-overlay').className).toMatch(/bottom-0/)
  })

  it('treats a failure that is no ApiError as rare', () => {
    render(<AlertSlot error={new Error('boom')} normalCodes={['auth.invalid_credentials']} />)
    expect(screen.getByTestId('alert-overlay')).toBeInTheDocument()
  })
})
