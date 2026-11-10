import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { accountApi } from '../../api/endpoints'
import type { User } from '../../api/types'
import { AppStateProvider } from '../../auth/AppState'
import { ME_KEY } from '../../auth/useAuth'
import type { Session } from '../../auth/useAuth'
import { DateField } from '../../components/ui/DateField'
import { HINTS_KEY, INTRO_KEY, RESTART_EVENT } from '../../features/live-helper/storage'
import { useDateFormat } from '../../hooks/useDateFormat'
import { ADMIN, bootstrapOf } from '../../test/fixtures'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { AppearanceTab } from './AppearanceTab'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

beforeEach(() => {
  vi.spyOn(accountApi, 'savePreferences').mockResolvedValue(undefined as never)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** The app's session lives in the query cache (like in the real gate), so a saved choice reaches every component below. */
function Gate({ children }: { children: React.ReactNode }) {
  const session = useQuery<Session>({ queryKey: ME_KEY, queryFn: () => Promise.reject(new Error('never fetched')), staleTime: Infinity })
  if (!session.data) return null
  return <AppStateProvider value={{ bootstrap: bootstrapOf('server'), session: session.data }}>{children}</AppStateProvider>
}

function renderApp(ui: React.ReactNode, user: User = ADMIN) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData<Session>(ME_KEY, { user, twoFactorSetupRequired: false })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ThemeProvider>
          <Gate>{ui}</Gate>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const formatSelect = () => screen.getByRole('combobox', { name: 'Datumsformat' })

describe('Settings > Appearance: date format', () => {
  it('offers automatic and the three notations, each with an example', () => {
    renderApp(<AppearanceTab />)
    const options = [...formatSelect().querySelectorAll('option')].map((option) => [option.value, option.textContent])
    expect(options).toEqual([
      ['auto', 'Automatisch (nach Sprache) – 23.04.1990'],
      ['dmy', 'TT.MM.JJJJ – 23.04.1990'],
      ['ymd_slash', 'JJJJ/MM/TT – 1990/04/23'],
      ['iso', 'JJJJ-MM-TT – 1990-04-23'],
    ])
    // Without a choice of its own the account is on "auto".
    expect(formatSelect()).toHaveValue('auto')
  })

  it('shows the saved choice, and an example of today and of a month in it', () => {
    renderApp(<AppearanceTab />, { ...ADMIN, dateFormat: 'ymd_slash' })
    expect(formatSelect()).toHaveValue('ymd_slash')
    const today = new Date()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    expect(screen.getByText(`Beispiel: heute ist der ${today.getFullYear()}/${month}/${String(today.getDate()).padStart(2, '0')} (Monat: ${today.getFullYear()}/${month}).`)).toBeInTheDocument()
  })

  it('saves the choice like the language: shown at once, sent to the account', async () => {
    const user = userEvent.setup()
    renderApp(<AppearanceTab />)
    await user.selectOptions(formatSelect(), 'iso')
    expect(formatSelect()).toHaveValue('iso')
    expect(accountApi.savePreferences).toHaveBeenCalledWith({ dateFormat: 'iso' })
    expect(screen.getByText(/^Beispiel: heute ist der \d{4}-\d{2}-\d{2} \(Monat: \d{4}-\d{2}\)\.$/)).toBeInTheDocument()
  })

  it('changes every field and display of the app at once', async () => {
    const user = userEvent.setup()
    function Elsewhere() {
      const dates = useDateFormat()
      return (
        <>
          <DateField label="Beginn" spec={{ kind: 'month' }} value="2024-03" onValueChange={() => undefined} />
          <p data-testid="shown">{dates.date('2026-11-09T12:00:00')}</p>
          <p data-testid="card">{dates.stored('2024-03')}</p>
        </>
      )
    }
    renderApp(
      <>
        <AppearanceTab />
        <Elsewhere />
      </>,
    )
    expect(screen.getByLabelText('Beginn')).toHaveValue('03.2024')
    expect(screen.getByTestId('shown')).toHaveTextContent('09.11.2026')
    expect(screen.getByTestId('card')).toHaveTextContent('03.2024')

    await user.selectOptions(formatSelect(), 'ymd_slash')
    await waitFor(() => expect(screen.getByLabelText('Beginn')).toHaveValue('2024/03'))
    expect(screen.getByTestId('shown')).toHaveTextContent('2026/11/09')
    expect(screen.getByTestId('card')).toHaveTextContent('2024/03')
    expect(screen.getByLabelText('Beginn')).toHaveAttribute('placeholder', 'JJJJ/MM')

    await user.selectOptions(formatSelect(), 'auto')
    await waitFor(() => expect(screen.getByLabelText('Beginn')).toHaveValue('03.2024'))
  })

  it('"auto" follows the language of the interface', async () => {
    const user = userEvent.setup()
    renderApp(
      <>
        <AppearanceTab />
        <DateField label="Beginn" spec={{ kind: 'day' }} value="2024-03-05" onValueChange={() => undefined} />
      </>,
    )
    expect(screen.getByLabelText('Beginn')).toHaveValue('05.03.2024')
    await user.click(screen.getByRole('radio', { name: 'English' }))
    expect(await screen.findByLabelText('Beginn')).toHaveValue('2024-03-05')
    await i18n.changeLanguage('de')
  })
})

describe('useDateFormat', () => {
  it('works without a session (the sign-in page): by language', () => {
    const { result } = renderHook(() => useDateFormat())
    expect(result.current.preference).toBe('auto')
    expect(result.current.format).toBe('dmy')
    expect(result.current.stored('2024-03-05')).toBe('05.03.2024')
  })

  it('ignores a value of the server that it does not know', () => {
    function wrapper({ children }: { children: React.ReactNode }) {
      return (
        <AppStateProvider value={{ bootstrap: bootstrapOf('server'), session: { user: { ...ADMIN, dateFormat: 'us' as never }, twoFactorSetupRequired: false } }}>
          {children}
        </AppStateProvider>
      )
    }
    const { result } = renderHook(() => useDateFormat(), { wrapper })
    expect(result.current.preference).toBe('auto')
  })
})

describe('Settings > Appearance: introduction and hints', () => {
  it('starts the introduction and all hints again: everything seen is forgotten and the helper is told to open', async () => {
    const user = userEvent.setup()
    localStorage.setItem(INTRO_KEY, '1')
    localStorage.setItem(HINTS_KEY, JSON.stringify({ profile: true }))
    const heard = vi.fn()
    window.addEventListener(RESTART_EVENT, heard)
    renderApp(<AppearanceTab />)
    await user.click(screen.getByRole('button', { name: 'Einführung und Hinweise neu starten' }))
    window.removeEventListener(RESTART_EVENT, heard)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(INTRO_KEY)).toBeNull()
    expect(localStorage.getItem(HINTS_KEY)).toBeNull()
  })
})
