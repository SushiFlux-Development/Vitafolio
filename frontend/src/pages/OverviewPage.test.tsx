import { fireEvent, screen, within } from '@testing-library/react'
import i18n from 'i18next'
import { Route, Routes, useLocation } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { applicationsApi, coverLettersApi, profileApi } from '../api/endpoints'
import type { Application, ApplicationListItem } from '../api/types'
import { ADMIN } from '../test/fixtures'
import { renderInApp } from '../test/render'
import { OverviewPage } from './OverviewPage'

vi.mock('../api/endpoints', async (original) => ({
  ...(await original<typeof import('../api/endpoints')>()),
  applicationsApi: { list: vi.fn(), get: vi.fn(), downloadDossier: vi.fn(), getPreview: vi.fn() },
  coverLettersApi: { list: vi.fn() },
  profileApi: { get: vi.fn() },
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

function item(id: string, overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  return { id, jobTitle: `Stelle ${id}`, company: `Firma ${id}`, status: 'applied', isFollowUpDue: false, hasArchivedPdf: false, updatedAt: '2026-11-01T00:00:00Z', ...overrides }
}

const LIST = [
  item('a', { isFollowUpDue: true, followUpAt: '2026-10-20T00:00:00Z' }),
  item('b', { status: 'interview' }),
  item('c', { status: 'draft' }),
  item('d', { status: 'rejected' }),
]

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

function renderOverview(options: Parameters<typeof renderInApp>[1] = {}) {
  return renderInApp(
    <Routes>
      <Route path="/" element={<OverviewPage />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    options,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(applicationsApi.list).mockResolvedValue(LIST)
  vi.mocked(coverLettersApi.list).mockResolvedValue([])
  vi.mocked(profileApi.get).mockRejectedValue(new Error('not needed here'))
})

describe('the board', () => {
  it('is the tracker board: all six columns with their cards and counts', async () => {
    renderOverview()
    const draft = await screen.findByRole('region', { name: 'Entwurf' })
    expect(within(draft).getByText('Stelle c')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Beworben' })).getByText('Stelle a')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Gespräch' })).getByText('Stelle b')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Abgeschlossen' })).getByText('Stelle d')).toBeInTheDocument()
    // The columns without a card are there too, with their count
    expect(within(screen.getByRole('region', { name: 'Angebot' })).getByLabelText('0 Bewerbungen in dieser Spalte')).toBeInTheDocument()
  })

  it('opens the details of a card, where the status is changed, as on the applications page', async () => {
    vi.mocked(applicationsApi.get).mockResolvedValue({ ...LIST[1]!, events: [], attachmentIds: [], cvDesign: 'classic', cvLanguage: 'de', cvShowPhoto: true, cvPhotoShape: 'rounded', includeCoverSheet: true, createdAt: '2026-10-01T00:00:00Z' } as Application)
    renderOverview()
    fireEvent.click(await screen.findByRole('button', { name: 'Stelle b' }))
    expect(await screen.findByRole('dialog', { name: 'Stelle b – Firma b' })).toBeInTheDocument()
    expect(applicationsApi.get).toHaveBeenCalledWith('b')
  })

  it('shows the empty board too, with the three first steps above it', async () => {
    vi.mocked(applicationsApi.list).mockResolvedValue([])
    renderOverview()
    const steps = await screen.findByTestId('getting-started')
    expect(within(steps).getByTestId('start-profile')).toHaveAttribute('href', '/profile')
    expect(within(steps).getByTestId('start-guide')).toHaveAttribute('href', '/guide')
    expect(within(steps).getByTestId('start-application')).toHaveAttribute('href', '/applications?new=1')
    expect(screen.getAllByRole('region', { name: /Entwurf|Beworben|Abgeschlossen/ })).toHaveLength(3)
  })

  it('has no first steps once there is an application', async () => {
    renderOverview()
    await screen.findByRole('region', { name: 'Entwurf' })
    expect(screen.queryByTestId('getting-started')).toBeNull()
  })

  it('says why the applications could not be loaded, completely', async () => {
    vi.mocked(applicationsApi.list).mockRejectedValue(new Error('Datenbank gesperrt'))
    renderOverview()
    expect(await screen.findByTestId('error-notice')).toHaveTextContent('Bewerbungen konnten nicht geladen werden')
  })
})

describe('the follow-up strip', () => {
  it('lists the applications whose follow-up is due, each leading to the application', async () => {
    renderOverview()
    const strip = await screen.findByRole('region', { name: 'Nachfassen fällig' })
    expect(within(strip).getAllByRole('link', { name: /Stelle/ }).map((link) => link.getAttribute('href'))).toEqual(['/applications?open=a'])
    expect(within(strip).getByText('Nachfassen fällig seit 20.10.2026')).toBeInTheDocument()
    expect(within(strip).getByRole('link', { name: 'Alle anzeigen' })).toHaveAttribute('href', '/applications?followUp=1')
  })

  it('is not there when nothing is due', async () => {
    vi.mocked(applicationsApi.list).mockResolvedValue([item('c', { status: 'draft' })])
    renderOverview()
    await screen.findByRole('region', { name: 'Entwurf' })
    expect(screen.queryByRole('region', { name: 'Nachfassen fällig' })).toBeNull()
  })
})

describe('the buttons', () => {
  it('lead to a new application', async () => {
    renderOverview()
    fireEvent.click(await screen.findByRole('button', { name: 'Neue Bewerbung' }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/applications?new=1')
  })

  it('lead to the export', async () => {
    renderOverview()
    fireEvent.click(await screen.findByRole('button', { name: 'Export' }))
    expect(await screen.findByTestId('where')).toHaveTextContent('/export')
  })
})

describe('the two-factor notice', () => {
  it('is a calm notice with a link to the settings, only on a server without it', async () => {
    renderOverview({ mode: 'server', user: { ...ADMIN, twoFactorEnabled: false } })
    expect(await screen.findByRole('link', { name: 'Jetzt einrichten' })).toHaveAttribute('href', '/settings?tab=security')
  })

  it('is not shown when it is active, and not in the Windows program', async () => {
    const { unmount } = renderOverview({ mode: 'server', user: { ...ADMIN, twoFactorEnabled: true } })
    await screen.findByRole('region', { name: 'Entwurf' })
    expect(screen.queryByRole('link', { name: 'Jetzt einrichten' })).toBeNull()
    unmount()
    renderOverview({ mode: 'desktop', user: { ...ADMIN, twoFactorEnabled: false } })
    await screen.findByRole('region', { name: 'Entwurf' })
    expect(screen.queryByRole('link', { name: 'Jetzt einrichten' })).toBeNull()
  })
})
