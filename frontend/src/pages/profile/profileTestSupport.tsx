import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { Profile } from '../../api/types'
import { AppStateProvider } from '../../auth/AppState'
import { SidebarNavArea, SidebarNavProvider } from '../../components/layout/SidebarNav'
import { ConfirmProvider } from '../../components/ui/ConfirmDialog'
import { ErrorDialogProvider } from '../../components/ui/ErrorDialog'
import { ADMIN, bootstrapOf } from '../../test/fixtures'
import { ProfilePage } from './ProfilePage'

/** What the tests of the profile page share: a profile with invented data and the page rendered with everything around it. */

export const mockProfile: Profile = {
  id: 'p1',
  firstName: 'Max',
  lastName: 'Mustermann',
  academicTitle: 'Dr.',
  professionalTitle: 'Senior Architekt',
  email: 'max@example.com',
  phone: '+49 123 45678',
  street: 'Musterstr. 1',
  postalCode: '10115',
  city: 'Berlin',
  country: 'Deutschland',
  dateOfBirth: '1990-01-01',
  placeOfBirth: 'München',
  nationality: 'Deutsch',
  maritalStatus: 'Ledig',
  website: 'https://max.example.com',
  linkedIn: 'https://linkedin.com/in/max',
  gitHub: null,
  xing: null,
  bio: 'Passionierter Entwickler',
  hasPhoto: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  experiences: [
    {
      id: 'exp1',
      jobTitle: 'Senior Software Engineer',
      employer: 'Tech GmbH',
      employmentType: 'Vollzeit',
      city: 'Berlin',
      country: 'Deutschland',
      startDate: '2022-01',
      endDate: null,
      isCurrent: true,
      description: 'Leitung von Cloud-Projekten',
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  educations: [
    {
      id: 'edu1',
      degree: 'M.Sc. Informatik',
      fieldOfStudy: 'Softwaretechnik',
      institution: 'TU Berlin',
      city: 'Berlin',
      country: 'Deutschland',
      startDate: '2016-10',
      endDate: '2019-09',
      isCurrent: false,
      grade: '1.2',
      description: 'Schwerpunkt Verteilte Systeme',
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  skills: [
    {
      id: 'skill1',
      name: 'TypeScript',
      category: 'Programmiersprachen',
      level: 5,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  languages: [
    {
      id: 'lang1',
      language: 'Englisch',
      level: 'C1',
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
  certificates: [],
  interests: [],
  customSections: [],
}

/** The quiet time of the automatic saving plus a little: after it the request has gone out. */
export const SETTLE = 600
export const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, SETTLE))))

export function renderPage(initialTab = 'personal', { account = false }: { account?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const page = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/profile?tab=${initialTab}`]}>
        <ConfirmProvider>
          <ErrorDialogProvider>
            {/* The sections are in the sidebar: it is part of what is tested, so the page is rendered with it. */}
            <SidebarNavProvider titleOf={() => 'Übersicht'}>
              <SidebarNavArea main={null} />
              <ProfilePage />
            </SidebarNavProvider>
          </ErrorDialogProvider>
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
  // The signed-in account gives the local copy its key; without one (the default) there is no local copy.
  return {
    queryClient,
    ...render(account ? <AppStateProvider value={{ bootstrap: bootstrapOf('server'), session: { user: ADMIN, twoFactorSetupRequired: false } }}>{page}</AppStateProvider> : page),
  }
}

