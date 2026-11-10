import { useState } from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { applicationsApi, profileApi } from '../../api/endpoints'
import type { Bootstrap, ContentSuggestion, PreviewOptions, Profile } from '../../api/types'
import { BOOTSTRAP_KEY } from '../../auth/useAuth'
import { ErrorDialogProvider } from '../../components/ui/ErrorDialog'
import { PreviewTab } from './PreviewTab'
import { PREVIEW_OPTIONS_SAVE_DELAY_MS } from './usePreviewOptions'

vi.mock('../../api/endpoints', () => ({
  profileApi: {
    getPreviewPdf: vi.fn(),
    savePreviewOptions: vi.fn(),
    exportPdf: vi.fn(),
    exportDocx: vi.fn(),
    get: vi.fn(),
    saveCvContentSettings: vi.fn(),
  },
  applicationsApi: { contentSuggestion: vi.fn() },
  // The error notice and the error dialog read the app version for their copyable text.
  publicApi: { version: vi.fn().mockResolvedValue({ version: 'v2026.11.7 (1.2-dev)', short: 'v2026.11.7', channel: 'dev' }) },
}))

// The designs come from the server; three are enough for these tests
vi.mock('../../features/documents/useDocumentDesigns', async (original) => ({
  ...(await original<typeof import('../../features/documents/useDocumentDesigns')>()),
  useDocumentDesigns: () => [{ id: 'classic' }, { id: 'modern' }, { id: 'plain' }, { id: 'wave', group: 'expressive' }],
}))

// The gallery is folded away until asked for; a click picks a design like the user does
function chooseDesign(name: string) {
  if (!screen.queryByRole('radio', { name })) fireEvent.click(screen.getByTestId('design-gallery-toggle'))
  fireEvent.click(screen.getByRole('radio', { name }))
}

const PDF = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })

// Invented profile and suggestion for the "Content" block: an old job and a school certificate are left out by the suggestion.
const NO_ENTRIES = { experiences: [], educations: [], skills: [], languages: [], certificates: [], interests: [], customSections: [] }
const PROFILE = {
  ...NO_ENTRIES,
  experiences: [
    { id: 'e1', jobTitle: 'Teamleiterin IT', employer: 'Muster GmbH', startDate: '2020-01', isCurrent: true },
    { id: 'e2', jobTitle: 'Systemadministratorin', employer: 'Alt AG', startDate: '2001-03', endDate: '2004-06', isCurrent: false },
  ],
  educations: [{ id: 'd1', degree: 'Realschulabschluss', institution: 'Musterschule', startDate: '1990', endDate: '1996', isCurrent: false }],
} as unknown as Profile
const SUGGESTION: ContentSuggestion = {
  yearsOfExperience: 14,
  stage: 'long',
  experiences: [
    { id: 'e1', suggestion: 'full', reason: 'recent' },
    { id: 'e2', suggestion: 'short', reason: 'older_than_10_years' },
  ],
  educations: [{ id: 'd1', suggestion: 'hidden', reason: 'below_highest_degree' }],
  certificates: [],
  attachments: [],
  checklist: [],
}

// The tab reads the font list through the bootstrap query, so it needs a query client like in the app
function renderTab(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <ErrorDialogProvider>
        <PreviewTab />
      </ErrorDialogProvider>
    </QueryClientProvider>,
  )
}

describe('PreviewTab', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('de')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-pdf')
    global.URL.revokeObjectURL = vi.fn()
    vi.mocked(profileApi.getPreviewPdf).mockResolvedValue(PDF())
    vi.mocked(profileApi.exportPdf).mockResolvedValue({ blob: PDF(), filename: 'Lebenslauf_Max_Mustermann.pdf' })
    vi.mocked(profileApi.savePreviewOptions).mockImplementation(async (body) => body)
    vi.mocked(profileApi.get).mockResolvedValue(PROFILE)
    vi.mocked(applicationsApi.contentSuggestion).mockResolvedValue(SUGGESTION)
    vi.mocked(profileApi.saveCvContentSettings).mockImplementation(async (body) => body)
  })

  it('offers exactly the fonts the server publishes', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(BOOTSTRAP_KEY, {
      documentFonts: [
        { family: 'Liberation Sans', serif: false },
        { family: 'Merriweather', serif: true },
      ],
    } as Bootstrap)
    renderTab(client)

    const select = screen.getByRole('option', { name: 'Merriweather' }).closest('select') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['Liberation Sans', 'Merriweather'])
  })

  it('renders design options, controls and requests initial preview', async () => {
    renderTab()

    expect(screen.getByText('Lebenslauf-Vorschau')).toBeInTheDocument()
    expect(screen.getByText('Klassisch')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('design-gallery-toggle'))
    expect(screen.getByRole('radio', { name: 'Modern' })).toBeInTheDocument()
    expect(screen.getByText('PDF herunterladen')).toBeInTheDocument()

    await waitFor(() => {
      expect(profileApi.getPreviewPdf).toHaveBeenCalledWith(expect.objectContaining({ design: 'classic', accentColor: '#14213D' }), expect.any(AbortSignal))
    })
  })

  it('shows the preview as an embedded frame with a blob source (the content security policy allows exactly that)', async () => {
    const { container } = renderTab()

    await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull())
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe('blob:http://localhost/mock-pdf#navpanes=0&view=FitH')
    expect(container.querySelector('object, embed')).toBeNull()
  })

  it('allows switching to modern design', async () => {
    renderTab()

    chooseDesign('Modern')

    await waitFor(() => {
      expect(profileApi.getPreviewPdf).toHaveBeenCalledWith(expect.objectContaining({ design: 'modern' }), expect.any(AbortSignal))
    })
  })

  it('allows switching to plain design', async () => {
    renderTab()

    chooseDesign('Schlicht')

    await waitFor(() => {
      expect(profileApi.getPreviewPdf).toHaveBeenCalledWith(expect.objectContaining({ design: 'plain' }), expect.any(AbortSignal))
    })
  })

  it('shows the expressive designs under their own heading with the advice', () => {
    renderTab()
    fireEvent.click(screen.getByTestId('design-gallery-toggle'))

    expect(screen.getByText('Ausdrucksstark')).toBeInTheDocument()
    expect(screen.getByText(/In klassischen Branchen ist eine ruhige Vorlage/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Welle' })).toBeInTheDocument()
  })

  it('keeps room for the longest description and the longest name of the designs, so changing the design moves nothing', () => {
    const { container } = renderTab()

    const reserved = [...container.querySelectorAll('[data-reserved]')].filter((element) => !element.closest('[data-testid="preview-content"]')).map((element) => element.getAttribute('data-reserved'))

    // One reserved text per design for the description line and one for the name line (four designs in this test)
    expect(reserved).toContain('Fließende Farbfläche im Kopf, das Foto sitzt auf der Kante. Eher für kreative Bewerbungen.')
    for (const name of ['Klassisch', 'Modern', 'Schlicht', 'Welle']) expect(reserved, name).toContain(name)
    expect(reserved).toHaveLength(8)
  })

  it('moves the choice and the focus with the arrow keys in the gallery', async () => {
    renderTab()
    fireEvent.click(screen.getByTestId('design-gallery-toggle'))
    const classic = screen.getByRole('radio', { name: 'Klassisch' })
    expect(classic).toBeChecked()
    expect(classic).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(classic, { key: 'ArrowRight' })

    const modern = screen.getByRole('radio', { name: 'Modern' })
    await waitFor(() => expect(modern).toBeChecked())
    expect(modern).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Klassisch' })).toHaveAttribute('tabindex', '-1')
  })

  it('allows picking another accent color', async () => {
    renderTab()

    fireEvent.click(screen.getByTitle('Emerald (#059669)'))

    await waitFor(() => {
      expect(profileApi.getPreviewPdf).toHaveBeenCalledWith(expect.objectContaining({ accentColor: '#059669' }), expect.any(AbortSignal))
    })
  })

  it('triggers exportPdf on download click', async () => {
    renderTab()

    fireEvent.click(screen.getByText('PDF herunterladen'))

    await waitFor(() => {
      expect(profileApi.exportPdf).toHaveBeenCalled()
    })
  })

  it('aborts the render that is still running when an option changes, so a slow old answer cannot win', async () => {
    const signals: AbortSignal[] = []
    vi.mocked(profileApi.getPreviewPdf).mockImplementation(
      (_options, signal) =>
        new Promise((_resolve, reject) => {
          if (signal) {
            signals.push(signal)
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }
        }),
    )
    renderTab()

    await waitFor(() => expect(signals).toHaveLength(1))
    chooseDesign('Modern')
    await waitFor(() => expect(signals).toHaveLength(2))

    expect(signals[0]!.aborted).toBe(true)
    expect(signals[1]!.aborted).toBe(false)
  })

  it('shows the real error completely, with a retry that asks again', async () => {
    const failure = new ApiError(500, { status: 500, code: 'internal', detail: 'Typst konnte das Dokument nicht setzen: Zeile 12, Spalte 4', traceId: 'abc123' })
    vi.mocked(profileApi.getPreviewPdf).mockRejectedValueOnce(failure)
    renderTab()

    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('Die Vorschau konnte nicht erzeugt werden.')

    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    await waitFor(() => expect(profileApi.getPreviewPdf).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByTestId('error-notice')).toBeNull())
  })

  it('reports a failed download in the error dialog instead of swallowing it', async () => {
    vi.mocked(profileApi.exportPdf).mockRejectedValueOnce(new ApiError(500, { status: 500, code: 'internal', detail: 'Rendering failed' }))
    renderTab()

    fireEvent.click(screen.getByText('PDF herunterladen'))

    expect(await screen.findByTestId('error-dialog')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Der Export ist fehlgeschlagen.')
  })
})

describe('PreviewTab: remembered choice', () => {
  const SAVED: PreviewOptions = { design: 'modern', language: 'en', accentColor: '#059669', font: 'Liberation Sans', showPhoto: false, photoShape: 'round' }

  // Mounts and unmounts the tab like the profile page does when the section changes; reads the profile from the query like the page.
  function Harness() {
    const [shown, setShown] = useState(true)
    const profile = useQuery({ queryKey: ['profile'], queryFn: () => ({ ...NO_ENTRIES }) as unknown as Profile, staleTime: Infinity })
    return (
      <>
        <button onClick={() => setShown((value) => !value)}>toggle</button>
        {shown && <PreviewTab saved={profile.data?.previewOptions} />}
      </>
    )
  }

  function renderHarness(previewOptions: PreviewOptions | null) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['profile'], { ...NO_ENTRIES, previewOptions } as unknown as Profile)
    render(
      <QueryClientProvider client={client}>
        <ErrorDialogProvider>
          <Harness />
        </ErrorDialogProvider>
      </QueryClientProvider>,
    )
    return client
  }

  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  const lastRendered = () => vi.mocked(profileApi.getPreviewPdf).mock.lastCall![0]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-pdf')
    global.URL.revokeObjectURL = vi.fn()
    vi.mocked(profileApi.getPreviewPdf).mockResolvedValue(PDF())
    vi.mocked(profileApi.savePreviewOptions).mockImplementation(async (body) => body)
    vi.mocked(profileApi.get).mockResolvedValue(PROFILE)
    vi.mocked(applicationsApi.contentSuggestion).mockResolvedValue(SUGGESTION)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with the saved values, and renders the preview with them right away', async () => {
    renderHarness(SAVED)
    await advance(300)

    expect(lastRendered()).toEqual({ ...SAVED, applySelection: true })
    expect(screen.getByRole('radio', { name: 'Englisch' })).toBeChecked()
    expect(profileApi.getPreviewPdf).toHaveBeenCalledTimes(1)
    expect(profileApi.savePreviewOptions).not.toHaveBeenCalled()
  })

  it('starts with the old defaults when nothing is saved', async () => {
    renderHarness(null)
    await advance(300)

    expect(lastRendered()).toMatchObject({ design: 'classic', accentColor: '#14213D', font: 'Liberation Sans', showPhoto: true, photoShape: 'rounded', language: 'de' })
  })

  it('keeps the choice after leaving and coming back, even before the answer of the server', async () => {
    renderHarness(null)
    await advance(300)

    chooseDesign('Modern')
    fireEvent.click(screen.getByText('toggle')) // leave
    fireEvent.click(screen.getByText('toggle')) // come back
    await advance(300)

    expect(lastRendered()).toMatchObject({ design: 'modern' })
    fireEvent.click(screen.getByTestId('design-gallery-toggle'))
    expect(screen.getByRole('radio', { name: 'Modern' })).toBeChecked()
  })

  it('saves by itself after a delay, not at once', async () => {
    renderHarness(SAVED)
    await advance(300)

    chooseDesign('Schlicht')
    await advance(300)
    expect(profileApi.savePreviewOptions).not.toHaveBeenCalled()

    await advance(PREVIEW_OPTIONS_SAVE_DELAY_MS)
    expect(profileApi.savePreviewOptions).toHaveBeenCalledTimes(1)
    expect(profileApi.savePreviewOptions).toHaveBeenCalledWith({ ...SAVED, design: 'plain' })
  })

  it('sends one request only when switching quickly, with the final choice', async () => {
    renderHarness(SAVED)
    await advance(300)

    chooseDesign('Schlicht')
    await advance(100)
    fireEvent.click(screen.getByText('Klassisch'))
    await advance(100)
    fireEvent.click(screen.getByTitle('Emerald (#059669)'))
    chooseDesign('Modern')
    await advance(PREVIEW_OPTIONS_SAVE_DELAY_MS * 2)

    expect(profileApi.savePreviewOptions).toHaveBeenCalledTimes(1)
    expect(profileApi.savePreviewOptions).toHaveBeenCalledWith(SAVED)
  })

  it('sends a change that is still waiting when the section is left', async () => {
    renderHarness(SAVED)
    await advance(300)

    chooseDesign('Schlicht')
    fireEvent.click(screen.getByText('toggle'))
    await advance(0)

    expect(profileApi.savePreviewOptions).toHaveBeenCalledTimes(1)
    expect(profileApi.savePreviewOptions).toHaveBeenCalledWith({ ...SAVED, design: 'plain' })
  })

  it('never lets an older answer overwrite a newer choice, and sends the newer one after it', async () => {
    const resolvers: Array<(value: PreviewOptions) => void> = []
    vi.mocked(profileApi.savePreviewOptions).mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)))
    const client = renderHarness(SAVED)
    await advance(300)

    chooseDesign('Schlicht')
    await advance(PREVIEW_OPTIONS_SAVE_DELAY_MS)
    expect(resolvers).toHaveLength(1)

    fireEvent.click(screen.getByText('Klassisch')) // while the first request is still running
    await advance(PREVIEW_OPTIONS_SAVE_DELAY_MS)
    expect(resolvers).toHaveLength(1) // one at a time

    await act(async () => resolvers[0]!({ ...SAVED, design: 'plain' }))
    await advance(0)
    expect(client.getQueryData<Profile>(['profile'])?.previewOptions?.design).toBe('classic')
    expect(resolvers).toHaveLength(2)
    expect(vi.mocked(profileApi.savePreviewOptions).mock.calls[1]![0].design).toBe('classic')
  })

  it('shows a failure completely in the error dialog, without a message on success', async () => {
    renderHarness(SAVED)
    await advance(300)

    chooseDesign('Schlicht')
    await advance(PREVIEW_OPTIONS_SAVE_DELAY_MS)
    expect(screen.queryByRole('alertdialog')).toBeNull()

    vi.mocked(profileApi.savePreviewOptions).mockRejectedValueOnce(
      new ApiError(500, { status: 500, code: 'internal', detail: 'Datenbank ist schreibgeschützt', traceId: 'abc123' }),
    )
    fireEvent.click(screen.getByText('Klassisch'))
    await advance(PREVIEW_OPTIONS_SAVE_DELAY_MS)

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Die Auswahl konnte nicht gespeichert werden')
    expect(dialog).toHaveTextContent('Datenbank ist schreibgeschützt')
  })
})

describe('PreviewTab: content of the CV', () => {
  const last = (mock: { mock: { lastCall?: unknown[] } }) => mock.mock.lastCall![0]

  beforeEach(() => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-pdf')
    global.URL.revokeObjectURL = vi.fn()
    vi.mocked(profileApi.getPreviewPdf).mockResolvedValue(PDF())
    vi.mocked(profileApi.exportPdf).mockResolvedValue({ blob: PDF(), filename: 'Lebenslauf.pdf' })
    vi.mocked(profileApi.exportDocx).mockResolvedValue({ blob: PDF(), filename: 'Lebenslauf.docx' })
    vi.mocked(profileApi.savePreviewOptions).mockImplementation(async (body) => body)
    vi.mocked(profileApi.get).mockResolvedValue(PROFILE)
    vi.mocked(applicationsApi.contentSuggestion).mockResolvedValue(SUGGESTION)
    vi.mocked(profileApi.saveCvContentSettings).mockImplementation(async (body) => body)
  })

  it('always asks the server to apply the selection: preview, PDF and Word', async () => {
    renderTab()
    await waitFor(() => expect(profileApi.getPreviewPdf).toHaveBeenCalled())
    expect(last(vi.mocked(profileApi.getPreviewPdf) as never)).toMatchObject({ applySelection: true })
    fireEvent.click(screen.getByText('PDF herunterladen'))
    await waitFor(() => expect(profileApi.exportPdf).toHaveBeenCalledWith(expect.objectContaining({ applySelection: true })))
    fireEvent.click(screen.getByText('Word herunterladen (.docx)'))
    await waitFor(() => expect(profileApi.exportDocx).toHaveBeenCalledWith(expect.objectContaining({ applySelection: true })))
  })

  it('tells what is left out and why, and shows an entry again on a click: saved first, then rendered again', async () => {
    renderTab()
    const summary = await screen.findByText('1 Eintrag ausgeblendet, 1 gekürzt')
    expect(summary).toBeInTheDocument()
    const school = screen.getByTestId('content-row-d1')
    expect(school).toHaveTextContent('Realschulabschluss')
    expect(school).toHaveTextContent('Liegt unter Ihrem höchsten Abschluss')
    await waitFor(() => expect(profileApi.getPreviewPdf).toHaveBeenCalledTimes(1))

    fireEvent.click(within(school).getByRole('button', { name: /Einblenden/ }))

    await waitFor(() =>
      expect(profileApi.saveCvContentSettings).toHaveBeenCalledWith({
        useSuggestion: true,
        overrides: { experiences: {}, educations: { d1: 'full' }, certificates: {}, hiddenSections: [] },
      }),
    )
    // The picture is asked for again only after the settings were saved
    await waitFor(() => expect(profileApi.getPreviewPdf).toHaveBeenCalledTimes(2))
    const saveOrder = vi.mocked(profileApi.saveCvContentSettings).mock.invocationCallOrder[0]!
    expect(vi.mocked(profileApi.getPreviewPdf).mock.invocationCallOrder[1]!).toBeGreaterThan(saveOrder)
    // The entry is still listed, now as shown against the suggestion, with the way back
    expect(within(screen.getByTestId('content-row-d1')).getByRole('button', { name: /Wieder der Empfehlung folgen/ })).toBeInTheDocument()
  })

  it('"Alles einblenden" switches the suggestion off, and "Empfehlung anwenden" brings it back', async () => {
    renderTab()
    await screen.findByTestId('content-row-d1')
    fireEvent.click(screen.getByRole('button', { name: 'Alles einblenden' }))
    await waitFor(() =>
      expect(profileApi.saveCvContentSettings).toHaveBeenCalledWith({
        useSuggestion: false,
        overrides: { experiences: {}, educations: {}, certificates: {}, hiddenSections: [] },
      }),
    )
    expect(await screen.findByText(/Die Empfehlung ist aus\. Alles wird gezeigt\./)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Empfehlung anwenden' }))
    await waitFor(() => expect(profileApi.saveCvContentSettings).toHaveBeenLastCalledWith(expect.objectContaining({ useSuggestion: true })))
  })

  it('reports a failed save completely in the error dialog and does not render a picture of a selection the server does not have', async () => {
    vi.mocked(profileApi.saveCvContentSettings).mockRejectedValueOnce(new ApiError(500, { status: 500, code: 'internal', detail: 'Datenbank gesperrt' }))
    renderTab()
    const school = await screen.findByTestId('content-row-d1')
    await waitFor(() => expect(profileApi.getPreviewPdf).toHaveBeenCalledTimes(1))
    fireEvent.click(within(school).getByRole('button', { name: /Einblenden/ }))

    expect(await screen.findByTestId('error-dialog')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Die Auswahl des Inhalts konnte nicht gespeichert werden.')
    expect(profileApi.getPreviewPdf).toHaveBeenCalledTimes(1)
  })
})
