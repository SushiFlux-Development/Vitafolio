import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { AppStateProvider } from '../auth/AppState'
import { ConfirmProvider } from '../components/ui/ConfirmDialog'
import { ErrorDialogProvider } from '../components/ui/ErrorDialog'
import type { User } from '../api/types'
import { ADMIN, bootstrapOf } from './fixtures'

interface Options {
  mode?: 'server' | 'desktop'
  user?: User
  route?: string
  client?: QueryClient
}

/** Renders a piece of the app with everything it needs around it: queries, router, the app's own dialogs and the signed-in state. */
export function renderInApp(ui: ReactElement, { mode = 'server', user = ADMIN, route = '/', client }: Options = {}) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AppStateProvider value={{ bootstrap: bootstrapOf(mode), session: { user, twoFactorSetupRequired: false } }}>
        <MemoryRouter initialEntries={[route]}>
          <ErrorDialogProvider>
            <ConfirmProvider>{ui}</ConfirmProvider>
          </ErrorDialogProvider>
        </MemoryRouter>
      </AppStateProvider>
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}
