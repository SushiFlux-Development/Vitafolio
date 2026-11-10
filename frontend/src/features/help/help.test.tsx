import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { docsApi, publicApi, whatsNewApi } from '../../api/endpoints'
import { ABOUT, versionOf } from '../../test/fixtures'
import { renderInApp } from '../../test/render'
import { AboutTab } from '../../pages/settings/AboutTab'
import { filterLicenses } from '../about/LicenseList'
import type { LicenseEntry } from '../about/LicenseList'
import { HandbookViewer } from './HandbookViewer'

vi.mock('../../api/endpoints', () => ({
  docsApi: { handbookPdf: vi.fn() },
  publicApi: { version: vi.fn(), about: vi.fn() },
  whatsNewApi: { current: vi.fn(), pending: vi.fn(), markSeen: vi.fn() },
}))

const get = vi.hoisted(() => vi.fn())
vi.mock('../../api/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../api/client')>()), get }))

const PDF = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })

const LICENSES: LicenseEntry[] = [
  { name: 'DocumentFormat.OpenXml', version: '3.5.1', license: 'MIT', url: 'https://example.com/openxml', component: 'Server', text: null },
  { name: 'Liberation Sans (Schrift)', version: '2.1.5', license: 'OFL-1.1', url: 'https://example.com/liberation', component: 'Server', text: 'SIL OPEN FONT LICENSE Version 1.1\n<b>kein html</b>' },
  { name: 'react', version: '19.3.1', license: 'MIT', url: 'javascript:alert(1)', component: 'Web-Oberfläche', text: 'MIT License text' },
]

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

beforeEach(() => {
  vi.clearAllMocks()
  global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/handbook')
  global.URL.revokeObjectURL = vi.fn()
  vi.mocked(publicApi.version).mockResolvedValue(versionOf('v2026.11.12 (13.557)'))
  vi.mocked(publicApi.about).mockResolvedValue(ABOUT)
  vi.mocked(docsApi.handbookPdf).mockResolvedValue(PDF())
  get.mockResolvedValue(LICENSES)
})

describe('manual in the app', () => {
  it('shows the manual in the language of the interface, in an embedded frame', async () => {
    renderInApp(<HandbookViewer open onClose={() => undefined} />)
    const frame = await screen.findByTitle('Handbuch als PDF')
    expect(frame).toHaveAttribute('src', 'blob:http://localhost/handbook#navpanes=0&view=FitH')
    expect(docsApi.handbookPdf).toHaveBeenCalledWith('de', expect.anything())
  })

  it('offers the download and "open in a new tab" as the way out when the embedded viewer does not show', async () => {
    renderInApp(<HandbookViewer open onClose={() => undefined} />)
    await screen.findByTitle('Handbuch als PDF')
    const download = await screen.findByTestId('handbook-download')
    expect(download).toHaveAttribute('href', 'blob:http://localhost/handbook')
    expect(download).toHaveAttribute('download', 'Vitafolio-Handbuch.pdf')
    const tab = screen.getByTestId('handbook-new-tab')
    expect(tab).toHaveAttribute('target', '_blank')
    expect(tab).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('switches the language of the manual', async () => {
    renderInApp(<HandbookViewer open onClose={() => undefined} />)
    await screen.findByTitle('Handbuch als PDF')
    fireEvent.click(await screen.findByRole('radio', { name: 'English' }))
    await waitFor(() => expect(docsApi.handbookPdf).toHaveBeenCalledWith('en', expect.anything()))
  })

  it('says plainly that the manual is missing when the server answers handbook.not_available', async () => {
    vi.mocked(docsApi.handbookPdf).mockRejectedValue(new ApiError(404, { code: 'handbook.not_available', detail: 'none' }))
    renderInApp(<HandbookViewer open onClose={() => undefined} />)
    expect(await screen.findByText('Das Handbuch ist in diesem Programm nicht enthalten')).toBeInTheDocument()
    expect(screen.queryByTitle('Handbuch als PDF')).toBeNull()
    expect(screen.queryByTestId('error-notice')).toBeNull()
    expect(screen.queryByTestId('handbook-download')).toBeNull()
  })

  it('knows from the build facts that the language is missing and does not even ask for the file', async () => {
    vi.mocked(publicApi.about).mockResolvedValue({ ...ABOUT, handbook: { de: false, en: true } })
    renderInApp(<HandbookViewer open onClose={() => undefined} />)
    expect(await screen.findByText('Das Handbuch ist in diesem Programm nicht enthalten')).toBeInTheDocument()
    expect(docsApi.handbookPdf).not.toHaveBeenCalled()
  })

  it('shows another failure in full and copyable, with a way to try again', async () => {
    vi.mocked(docsApi.handbookPdf).mockRejectedValue(new ApiError(500, { code: 'server.error', detail: 'disk read failed' }))
    renderInApp(<HandbookViewer open onClose={() => undefined} />)
    const notice = await screen.findByTestId('error-notice')
    expect(within(notice).getByTestId('copy-button')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Noch einmal|Erneut/ })).toBeInTheDocument()
  })

  it('asks for nothing while it is closed', async () => {
    renderInApp(<HandbookViewer open={false} onClose={() => undefined} />)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(docsApi.handbookPdf).not.toHaveBeenCalled()
  })
})

describe('license search', () => {
  it('finds by name, licence and part of the program, case-insensitively, all words must match', () => {
    expect(filterLicenses(LICENSES, 'openxml').map((entry) => entry.name)).toEqual(['DocumentFormat.OpenXml'])
    expect(filterLicenses(LICENSES, 'ofl').map((entry) => entry.name)).toEqual(['Liberation Sans (Schrift)'])
    expect(filterLicenses(LICENSES, 'MIT server').map((entry) => entry.name)).toEqual(['DocumentFormat.OpenXml'])
    expect(filterLicenses(LICENSES, 'oberfläche').map((entry) => entry.name)).toEqual(['react'])
    expect(filterLicenses(LICENSES, '  ')).toHaveLength(3)
    expect(filterLicenses(LICENSES, 'gibtsnicht')).toEqual([])
  })
})

describe('About page', () => {
  it('shows product, version, licence and the link to the source code', async () => {
    renderInApp(<AboutTab />)
    expect(await screen.findByTestId('about')).toBeInTheDocument()
    expect(await screen.findByTestId('about-version')).toHaveTextContent('v2026.11.12 (13.557)')
    expect(screen.getByText('AGPL-3.0-only')).toBeInTheDocument()
    const source = screen.getByTestId('about-source')
    expect(source).toHaveAttribute('href', 'https://example.com/org/vitafolio')
    expect(source).toHaveAttribute('target', '_blank')
  })

  it('lists the third-party components from the file the server names', async () => {
    renderInApp(<AboutTab />)
    expect(await screen.findByText('DocumentFormat.OpenXml')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/third-party-licenses.json')
    expect(screen.getByText('3 von 3 Komponenten')).toBeInTheDocument()
    expect(screen.getAllByTestId('license-row')).toHaveLength(3)
  })

  it('searches the list', async () => {
    renderInApp(<AboutTab />)
    await screen.findByText('DocumentFormat.OpenXml')
    fireEvent.change(screen.getByLabelText('Komponenten durchsuchen'), { target: { value: 'ofl' } })
    expect(screen.getByText('1 von 3 Komponenten')).toBeInTheDocument()
    expect(screen.getAllByTestId('license-row')).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Komponenten durchsuchen'), { target: { value: 'gibtsnicht' } })
    expect(screen.getByText('Keine Komponente passt zu dieser Suche.')).toBeInTheDocument()
  })

  it('opens a licence text on demand, as text and never as markup', async () => {
    renderInApp(<AboutTab />)
    const row = (await screen.findByText('Liberation Sans (Schrift)')).closest('[data-testid="license-row"]') as HTMLElement
    expect(within(row).queryByText(/SIL OPEN FONT LICENSE/)).toBeNull()

    const toggle = within(row).getByRole('button', { name: /Liberation Sans/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(within(row).getByText(/SIL OPEN FONT LICENSE/)).toBeInTheDocument()
    expect(row.querySelector('b')).toBeNull()
    expect(within(row).getByRole('link', { name: /example.com\/liberation/ })).toHaveAttribute('href', 'https://example.com/liberation')
  })

  it('says where to look when a component brings no text, and never links a foreign address', async () => {
    renderInApp(<AboutTab />)
    const openXml = (await screen.findByText('DocumentFormat.OpenXml')).closest('[data-testid="license-row"]') as HTMLElement
    fireEvent.click(within(openXml).getByRole('button', { name: /DocumentFormat/ }))
    expect(within(openXml).getByText(/Der Lizenztext liegt der Komponente selbst bei/)).toBeInTheDocument()

    const react = (await screen.findByText('react')).closest('[data-testid="license-row"]') as HTMLElement
    fireEvent.click(within(react).getByRole('button', { name: /react/ }))
    expect(within(react).queryByRole('link')).toBeNull()
  })

  it('shows a list that cannot be loaded in full and copyable', async () => {
    get.mockRejectedValue(new ApiError(404, { code: 'not_found', detail: 'missing file' }))
    renderInApp(<AboutTab />)
    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('Die Liste der Komponenten konnte nicht geladen werden.')
  })

  it('reaches "what is new" and the manual from here', async () => {
    vi.mocked(whatsNewApi.current).mockRejectedValue(new ApiError(404, { code: 'whats_new.not_available', detail: 'x' }))
    renderInApp(<AboutTab />)
    fireEvent.click(await screen.findByRole('button', { name: 'Neuerungen dieser Version' }))
    expect(await screen.findByText('Für diese Version gibt es keine Versionshinweise.')).toBeInTheDocument()
  })
})
