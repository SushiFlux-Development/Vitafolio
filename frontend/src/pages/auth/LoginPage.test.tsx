import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { authApi } from '../../api/endpoints'
import type { Bootstrap } from '../../api/types'
import { AppStateProvider } from '../../auth/AppState'
import { LoginPage } from './LoginPage'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => vi.restoreAllMocks())

const bootstrap: Bootstrap = {
  productName: 'Vitafolio',
  mode: 'server',
  setupRequired: false,
  setupTokenRequired: false,
  registrationOpen: true,
  rules: {
    username: { minLength: 3, maxLength: 32, pattern: '^[A-Za-z0-9._-]+$' },
    displayName: { minLength: 1, maxLength: 64 },
    password: { minLength: 12, maxLength: 128 },
  },
  languages: ['de', 'en'],
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppStateProvider value={{ bootstrap, session: { user: null, twoFactorSetupRequired: false } }}>
          <LoginPage />
        </AppStateProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LoginPage: too many attempts', () => {
  it('stands in the flow in reserved room and does not cover the links below the form', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError(429, { code: 'rate_limited' }, 42))
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText('Benutzername'), 'nobody')
    await user.type(screen.getByLabelText('Passwort'), 'whatever whatever')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))

    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('Zu viele Versuche')
    // In the slot, not in a layer over the content.
    expect(screen.queryByTestId('alert-overlay')).toBeNull()
    expect(notice.closest('.absolute')).toBeNull()
    // The too-many-attempts text is among the invisible reserved copies.
    const reserved = [...document.querySelectorAll('[data-reserved]')].map((element) => element.getAttribute('data-reserved') ?? '')
    expect(reserved.some((text) => text.includes('Zu viele Versuche'))).toBe(true)
    // The links of a locked-out person stay reachable.
    expect(screen.getByRole('link', { name: /Notfall/i })).toBeInTheDocument()
  })

  it('still lays an unexpected failure over the content', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError(500, { code: 'internal' }))
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText('Benutzername'), 'nobody')
    await user.type(screen.getByLabelText('Passwort'), 'whatever whatever')
    await user.click(screen.getByRole('button', { name: 'Anmelden' }))
    expect(await screen.findByTestId('alert-overlay')).toBeInTheDocument()
  })
})
