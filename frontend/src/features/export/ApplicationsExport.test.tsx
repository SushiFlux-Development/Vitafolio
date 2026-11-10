import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { Route, Routes } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { saveBlob } from '../../api/download'
import { applicationsApi } from '../../api/endpoints'
import type { ApplicationListItem } from '../../api/types'
import { renderInApp } from '../../test/render'
import { ApplicationsExport } from './ApplicationsExport'

vi.mock('../../api/endpoints', async (original) => ({
  ...(await original<typeof import('../../api/endpoints')>()),
  applicationsApi: { list: vi.fn(), downloadDossier: vi.fn(), downloadDossierArchive: vi.fn(), getPreview: vi.fn() },
  publicApi: { version: vi.fn().mockResolvedValue({ version: 'v2026.11.7', short: 'v2026.11.7', channel: 'dev' }) },
}))
vi.mock('../../api/download', async (original) => ({ ...(await original<typeof import('../../api/download')>()), saveBlob: vi.fn() }))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

function application(index: number, overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  return {
    id: `app${index}`,
    jobTitle: `Stelle ${index}`,
    company: `Firma ${index}`,
    status: 'applied',
    isFollowUpDue: false,
    hasArchivedPdf: false,
    dossierFileName: `Firma-${index}_Stelle-${index}.pdf`,
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

const THREE = [application(1, { hasArchivedPdf: true }), application(2), application(3, { dossierFileName: null })]

function renderExport() {
  return renderInApp(
    <Routes>
      <Route path="/" element={<ApplicationsExport />} />
      <Route path="/applications" element={<p>tracker page</p>} />
    </Routes>,
  )
}

const pdf = (filename: string) => ({ blob: new Blob(['%PDF']), filename })
const checkbox = (name: string) => screen.getByRole('checkbox', { name })
const bulk = () => screen.getByTestId('export-bulk')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(applicationsApi.list).mockResolvedValue(THREE)
  global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/dossier')
  global.URL.revokeObjectURL = vi.fn()
})

describe('the list', () => {
  it('shows company, job, state, file name and which version the PDF has, for every application', async () => {
    renderExport()
    const table = await screen.findByTestId('export-table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]!).getByText('Firma 1')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Stelle 1')).toBeInTheDocument()
    expect(within(rows[0]!).getByTestId('export-file-name')).toHaveTextContent('Firma-1_Stelle-1.pdf')
    expect(within(rows[0]!).getByText('Abgelegte Fassung')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Heutiger Stand')).toBeInTheDocument()
    // The server has no name for this one: a dash, never an empty cell.
    expect(within(rows[2]!).getByTestId('export-file-name')).toHaveTextContent('–')
  })

  it('leads the empty list to "new application", which opens the form there', async () => {
    vi.mocked(applicationsApi.list).mockResolvedValue([])
    renderExport()
    expect(await screen.findByText('Noch keine Bewerbungen zum Exportieren')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Neue Bewerbung' }))
    expect(await screen.findByText('tracker page')).toBeInTheDocument()
  })

  it('says why the list could not be loaded, completely', async () => {
    vi.mocked(applicationsApi.list).mockRejectedValue(new ApiError(500, { status: 500, code: 'internal', detail: 'Datenbank gesperrt' }))
    renderExport()
    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('Bewerbungen konnten nicht geladen werden')
    expect(within(notice).getByTestId('copy-button')).toBeInTheDocument()
  })
})

describe('the selection', () => {
  it('counts the chosen applications and names the download after them', async () => {
    renderExport()
    await screen.findByTestId('export-table')
    expect(bulk()).toBeDisabled()
    expect(bulk()).toHaveTextContent('Ausgewählte herunterladen (0)')

    fireEvent.click(checkbox('Firma 1 – Stelle 1 auswählen'))
    fireEvent.click(checkbox('Firma 3 – Stelle 3 auswählen'))
    expect(screen.getByTestId('export-count')).toHaveTextContent('2 von 3 ausgewählt')
    expect(bulk()).toBeEnabled()
    expect(bulk()).toHaveTextContent('Ausgewählte herunterladen (2)')
    expect((screen.getByTestId('export-select-all') as HTMLInputElement).indeterminate).toBe(true)
  })

  it('selects and clears everything with one box', async () => {
    renderExport()
    await screen.findByTestId('export-table')
    fireEvent.click(screen.getByTestId('export-select-all'))
    expect(screen.getByTestId('export-count')).toHaveTextContent('3 von 3 ausgewählt')
    expect(screen.getByTestId('export-select-all')).toBeChecked()
    fireEvent.click(screen.getByTestId('export-select-all'))
    expect(screen.getByTestId('export-count')).toHaveTextContent('0 von 3 ausgewählt')
  })

  it('blocks the download over 100 applications and says so in the room the hint already has', async () => {
    vi.mocked(applicationsApi.list).mockResolvedValue(Array.from({ length: 101 }, (_, index) => application(index + 1)))
    renderExport()
    await screen.findByTestId('export-table')
    fireEvent.click(screen.getByTestId('export-select-all'))

    expect(bulk()).toBeDisabled()
    const message = screen.getByText(/Zu viele ausgewählt: 101 Bewerbungen, erlaubt sind höchstens 100 auf einmal/)
    expect(bulk()).toHaveAttribute('aria-describedby', message.id)
    expect(message).toHaveClass('text-danger')

    // Taking one away makes it 100: allowed again, and the hint is back.
    fireEvent.click(checkbox('Firma 101 – Stelle 101 auswählen'))
    expect(bulk()).toBeEnabled()
    expect(screen.queryByText(/Zu viele ausgewählt/)).toBeNull()
  })
})

describe('the download', () => {
  it('gives the PDF itself for one application, from the row', async () => {
    vi.mocked(applicationsApi.downloadDossier).mockResolvedValue(pdf('Firma-2_Stelle-2.pdf'))
    renderExport()
    await screen.findByTestId('export-table')
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen: Firma 2 – Stelle 2' }))
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Firma-2_Stelle-2.pdf'))
    expect(applicationsApi.downloadDossier).toHaveBeenCalledWith('app2')
    expect(applicationsApi.downloadDossierArchive).not.toHaveBeenCalled()
  })

  it('gives the PDF itself when only one is chosen, and the ZIP from two on', async () => {
    vi.mocked(applicationsApi.downloadDossier).mockResolvedValue(pdf('Firma-1_Stelle-1.pdf'))
    vi.mocked(applicationsApi.downloadDossierArchive).mockResolvedValue({ blob: new Blob(['PK']), filename: 'Bewerbungen.zip', failed: 0 })
    renderExport()
    await screen.findByTestId('export-table')

    fireEvent.click(checkbox('Firma 1 – Stelle 1 auswählen'))
    fireEvent.click(bulk())
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Firma-1_Stelle-1.pdf'))
    expect(applicationsApi.downloadDossierArchive).not.toHaveBeenCalled()

    fireEvent.click(checkbox('Firma 3 – Stelle 3 auswählen'))
    await waitFor(() => expect(bulk()).toBeEnabled())
    fireEvent.click(bulk())
    await waitFor(() => expect(saveBlob).toHaveBeenLastCalledWith(expect.any(Blob), 'Bewerbungen.zip'))
    expect(applicationsApi.downloadDossierArchive).toHaveBeenCalledWith(['app1', 'app3'], 'de')
    expect(screen.queryByTestId('error-notice')).toBeNull()
  })

  it('shows "Wird erstellt …" on the button that was clicked and starts nothing a second time', async () => {
    let finish: (value: ReturnType<typeof pdf>) => void = () => undefined
    vi.mocked(applicationsApi.downloadDossier).mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderExport()
    await screen.findByTestId('export-table')

    const button = screen.getByRole('button', { name: 'PDF herunterladen: Firma 1 – Stelle 1' })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen: Firma 2 – Stelle 2' }))

    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
    expect(button).toHaveTextContent('Wird erstellt …')
    expect(screen.getByRole('button', { name: 'PDF herunterladen: Firma 2 – Stelle 2' })).toBeDisabled()
    expect(applicationsApi.downloadDossier).toHaveBeenCalledTimes(1)

    finish(pdf('a.pdf'))
    await waitFor(() => expect(button).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('button', { name: 'PDF herunterladen: Firma 2 – Stelle 2' })).toBeEnabled()
  })

  it('reports dossiers that could not be made, clearly and copyably, and still hands over the ZIP', async () => {
    vi.mocked(applicationsApi.downloadDossierArchive).mockResolvedValue({ blob: new Blob(['PK']), filename: 'Bewerbungen.zip', failed: 2 })
    renderExport()
    await screen.findByTestId('export-table')
    fireEvent.click(screen.getByTestId('export-select-all'))
    fireEvent.click(bulk())

    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('Das ZIP ist unvollständig.')
    expect(notice).toHaveTextContent('2 von 3 Bewerbungen konnten nicht erstellt werden.')
    expect(within(notice).getByTestId('copy-button')).toBeInTheDocument()
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'Bewerbungen.zip')

    fireEvent.click(within(notice).getByRole('button', { name: 'Schließen' }))
    expect(screen.queryByTestId('error-notice')).toBeNull()
  })

  it('tells a failed download in the error dialog, with the real reason', async () => {
    vi.mocked(applicationsApi.downloadDossier).mockRejectedValue(new ApiError(500, { status: 500, code: 'internal', detail: 'Anlage 3 nicht lesbar' }))
    renderExport()
    await screen.findByTestId('export-table')
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen: Firma 1 – Stelle 1' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Der Download konnte nicht erstellt werden.')
    expect(dialog).toHaveTextContent('Anlage 3 nicht lesbar')
    expect(saveBlob).not.toHaveBeenCalled()
  })

  it('opens the dossier preview from the row', async () => {
    vi.mocked(applicationsApi.getPreview).mockResolvedValue({ blob: new Blob(['%PDF']), source: 'archived' })
    renderExport()
    await screen.findByTestId('export-table')
    fireEvent.click(screen.getByRole('button', { name: 'Ansehen: Firma 1 – Stelle 1' }))
    expect(await screen.findByRole('dialog', { name: 'Firma 1 – Stelle 1' })).toBeInTheDocument()
    await waitFor(() => expect(applicationsApi.getPreview).toHaveBeenCalledWith('app1', expect.anything()))
  })
})
