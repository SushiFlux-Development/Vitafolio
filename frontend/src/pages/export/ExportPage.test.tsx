import { fireEvent, screen } from '@testing-library/react'
import i18n from 'i18next'
import { Route, Routes } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { applicationsApi, profileApi } from '../../api/endpoints'
import { renderInApp } from '../../test/render'
import { ExportPage } from './ExportPage'

vi.mock('../../api/endpoints', async (original) => ({
  ...(await original<typeof import('../../api/endpoints')>()),
  applicationsApi: { list: vi.fn() },
  profileApi: { get: vi.fn() },
}))

// The CV tab embeds the preview of the master profile as it is; this page only has to hand it the saved options.
vi.mock('../profile/PreviewTab', () => ({
  PreviewTab: ({ saved }: { saved?: { design?: string } | null }) => <p data-testid="cv-preview">{saved?.design ?? 'no options'}</p>,
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(applicationsApi.list).mockResolvedValue([])
  vi.mocked(profileApi.get).mockResolvedValue({ previewOptions: { design: 'modern' } } as Awaited<ReturnType<typeof profileApi.get>>)
})

function renderPage(route: string) {
  return renderInApp(
    <Routes>
      <Route path="/export" element={<ExportPage />} />
    </Routes>,
    { route },
  )
}

describe('the export page', () => {
  it('opens on the applications tab by default', async () => {
    renderPage('/export')
    expect(screen.getByRole('tab', { name: 'Bewerbungen', selected: true })).toBeInTheDocument()
    expect(await screen.findByText('Noch keine Bewerbungen zum Exportieren')).toBeInTheDocument()
    expect(screen.queryByTestId('cv-preview')).toBeNull()
  })

  it('shows the CV preview with the saved options of the profile on the tab named in the address', async () => {
    renderPage('/export?tab=cv')
    expect(screen.getByRole('tab', { name: 'Nur Lebenslauf', selected: true })).toBeInTheDocument()
    expect(await screen.findByTestId('cv-preview')).toHaveTextContent('modern')
    expect(applicationsApi.list).not.toHaveBeenCalled()
  })

  it('switches the tab with the tab bar', async () => {
    renderPage('/export')
    fireEvent.click(screen.getByRole('tab', { name: 'Nur Lebenslauf' }))
    expect(await screen.findByTestId('cv-preview')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Nur Lebenslauf', selected: true })).toBeInTheDocument()
  })
})
