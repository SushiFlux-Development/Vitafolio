import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import i18n from 'i18next'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { aiApi, coverLettersApi } from '../../api/endpoints'
import type { CoverLetter, CoverLetterListItem, CoverLetterPayload } from '../../api/types'
import { AppStateProvider } from '../../auth/AppState'
import { ConfirmProvider } from '../../components/ui/ConfirmDialog'
import { ErrorDialogProvider } from '../../components/ui/ErrorDialog'
import { toPayload } from '../../features/cover-letter/model'
import { draftKey, readDraft, writeDraft } from '../../hooks/draftStore'
import { ADMIN, bootstrapOf } from '../../test/fixtures'
import { CoverLettersPage } from './CoverLettersPage'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

const mockLetter: CoverLetter = {
  id: 'cl1',
  title: 'Bewerbung Cloud Specialist',
  senderName: 'Max Mustermann',
  senderStreet: 'Musterstr. 1',
  senderPostalCode: '10115',
  senderCity: 'Berlin',
  senderPhone: '+49 123 45678',
  senderEmail: 'max@example.com',
  recipientCompany: 'CloudScale AG',
  recipientDepartment: 'IT',
  recipientContactPerson: 'Frau Schmidt',
  recipientStreet: 'Industriestr. 10',
  recipientPostalCode: '80331',
  recipientCity: 'München',
  recipientCountry: 'Deutschland',
  place: 'Berlin',
  date: '06.11.2026',
  subject: 'Bewerbung als Cloud Specialist',
  salutation: 'Sehr geehrte Frau Schmidt,',
  body: 'mit großem Interesse bewerbe ich mich bei Ihnen.',
  closing: 'Mit freundlichen Grüßen',
  signatureName: 'Max Mustermann',
  hasSignature: false,
  attachmentsNote: 'Lebenslauf, Zeugnisse',
  language: 'de',
  font: 'Liberation Sans',
  accentColor: '#14213D',
  includeFoldMarks: true,
  createdAt: '2026-11-06T00:00:00Z',
  updatedAt: '2026-11-06T00:00:00Z',
}

const mockListItem: CoverLetterListItem = {
  id: 'cl1',
  title: 'Bewerbung Cloud Specialist',
  recipientCompany: 'CloudScale AG',
  subject: 'Bewerbung als Cloud Specialist',
  date: '06.11.2026',
  updatedAt: '2026-11-06T00:00:00Z',
}

vi.mock('../../api/endpoints', () => ({
  coverLettersApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    uploadSignature: vi.fn(),
    deleteSignature: vi.fn(),
    getPreviewPdf: vi.fn(),
    exportPdf: vi.fn(),
    exportDocx: vi.fn(),
  },
  profileApi: {
    get: vi.fn(),
  },
  aiApi: {
    parseResponse: vi.fn(),
    buildPrompt: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({
      provider: 'copy_paste',
      model: 'gpt-4o-mini',
      baseUrl: null,
      hasApiKey: false,
      pseudonymize: true,
    }),
  },
  // The error dialog reads the app version for its copyable text.
  publicApi: { version: vi.fn().mockResolvedValue({ version: 'v2026.11.7 (1.2-dev)', short: 'v2026.11.7', channel: 'dev' }) },
}))

function renderComponent({ account = false }: { account?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const page = (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <ErrorDialogProvider>
          <MemoryRouter>
            <CoverLettersPage />
          </MemoryRouter>
        </ErrorDialogProvider>
      </ConfirmProvider>
    </QueryClientProvider>
  )
  // The signed-in account gives the local copy its key; without one (the default) there is no local copy.
  return render(account ? <AppStateProvider value={{ bootstrap: bootstrapOf('server'), session: { user: ADMIN, twoFactorSetupRequired: false } }}>{page}</AppStateProvider> : page)
}

/** Opens the editor of the one letter in the list. */
async function openEditor(options: { account?: boolean } = {}) {
  vi.mocked(coverLettersApi.list).mockResolvedValue([mockListItem])
  vi.mocked(coverLettersApi.get).mockResolvedValue(mockLetter)
  renderComponent(options)
  fireEvent.click(await screen.findByRole('button', { name: 'Bewerbung Cloud Specialist' }))
  return screen.findByDisplayValue('CloudScale AG')
}

describe('CoverLettersPage', () => {
  afterEach(() => localStorage.clear())

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(coverLettersApi.update).mockImplementation(async (id, payload) => ({ ...mockLetter, ...payload, id, closing: payload.closing ?? '', updatedAt: '2026-11-09T09:00:00Z' }) as CoverLetter)
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-file')
    global.URL.revokeObjectURL = vi.fn()
    vi.mocked(coverLettersApi.getPreviewPdf).mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
  })

  it('renders list of cover letters and opens one in the editor', async () => {
    await openEditor()

    expect(coverLettersApi.get).toHaveBeenCalledWith('cl1')
    expect(screen.getByDisplayValue('Sehr geehrte Frau Schmidt,')).toBeInTheDocument()
  })

  it('renders empty state when no letters exist', async () => {
    vi.mocked(coverLettersApi.list).mockResolvedValue([])

    renderComponent()

    expect(await screen.findByText('Noch keine Anschreiben vorhanden. Erstellen Sie Ihr erstes Anschreiben!')).toBeInTheDocument()
  })

  it('connects every label with its field', async () => {
    await openEditor()

    expect(screen.getByLabelText(/^Unternehmensname \/ Organisation/)).toHaveValue('CloudScale AG')
    expect(screen.getByLabelText(/^Betreffzeile/)).toHaveValue('Bewerbung als Cloud Specialist')
    expect(screen.getByLabelText(/^Brieftext/)).toHaveValue('mit großem Interesse bewerbe ich mich bei Ihnen.')
  })

  it('triggers PDF and DOCX downloads when buttons are clicked', async () => {
    vi.mocked(coverLettersApi.exportPdf).mockResolvedValue({
      blob: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      filename: 'Anschreiben_CloudScale.pdf',
    })
    vi.mocked(coverLettersApi.exportDocx).mockResolvedValue({
      blob: new Blob(['PK\x03\x04'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
      filename: 'Anschreiben_CloudScale.docx',
    })
    await openEditor()

    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }))
    await waitFor(() => {
      expect(coverLettersApi.exportPdf).toHaveBeenCalledWith('cl1', expect.objectContaining({ font: 'Liberation Sans', language: 'de' }))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Word herunterladen (.docx)' }))
    await waitFor(() => {
      expect(coverLettersApi.exportDocx).toHaveBeenCalledWith('cl1', expect.objectContaining({ font: 'Liberation Sans', language: 'de' }))
    })
  })

  it('saves an edited letter before it is exported, so the file is what is on the screen', async () => {
    vi.mocked(coverLettersApi.update).mockResolvedValue({ ...mockLetter, subject: 'Neuer Betreff' })
    vi.mocked(coverLettersApi.exportPdf).mockResolvedValue({ blob: new Blob(['%PDF']), filename: 'a.pdf' })
    await openEditor()

    fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: 'Neuer Betreff' } })
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }))

    await waitFor(() => expect(coverLettersApi.exportPdf).toHaveBeenCalled())
    expect(coverLettersApi.update).toHaveBeenCalledWith('cl1', expect.objectContaining({ subject: 'Neuer Betreff' }))
    expect(vi.mocked(coverLettersApi.update).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(coverLettersApi.exportPdf).mock.invocationCallOrder[0]!)
  })

  it('saves an edited letter before the preview and shows it as an embedded blob frame', async () => {
    vi.mocked(coverLettersApi.update).mockResolvedValue({ ...mockLetter, subject: 'Neuer Betreff' })
    await openEditor()

    fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: 'Neuer Betreff' } })
    fireEvent.click(screen.getByRole('tab', { name: 'PDF-Vorschau' }))

    await waitFor(() => expect(coverLettersApi.getPreviewPdf).toHaveBeenCalled())
    expect(coverLettersApi.update).toHaveBeenCalledTimes(1)
    expect(coverLettersApi.getPreviewPdf).toHaveBeenCalledWith('cl1', expect.objectContaining({ language: 'de' }), expect.any(AbortSignal))
    await waitFor(() => expect(document.querySelector('iframe')?.getAttribute('src')).toBe('blob:http://localhost/mock-file#navpanes=0&view=FitH'))
    expect(document.querySelector('object, embed')).toBeNull()
  })

  it('does not save or send a letter with an empty required field, says so at the field and in the status, and keeps it in the local copy', async () => {
    await openEditor({ account: true })

    fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: '' } })
    // Live: the problem is visible before anything is pressed.
    expect(screen.getByText('Bitte ausfüllen.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Noch nicht gespeichert: 1 Pflichtfeld ist leer')
    expect(readDraft(draftKey('u1', 'coverLetter.cl1'), (raw) => raw as CoverLetterPayload)?.value.subject).toBe('')

    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 600))))
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }))

    expect(coverLettersApi.update).not.toHaveBeenCalled()
    expect(coverLettersApi.exportPdf).not.toHaveBeenCalled()
  })

  it('has no save button: it saves by itself after typing and then says "Gespeichert"', async () => {
    await openEditor()
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Gespeichert')

    fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: 'Neuer Betreff' } })
    expect(coverLettersApi.update).not.toHaveBeenCalled() // the quiet period has not passed
    await waitFor(() => expect(coverLettersApi.update).toHaveBeenCalledWith('cl1', expect.objectContaining({ subject: 'Neuer Betreff' })))
    expect(coverLettersApi.update).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Gespeichert'))
  })

  it('keeps the blank at the end and what was cleared: the answer of the server never replaces the fields', async () => {
    // The server trims every text and puts "Mit freundlichen Grüßen" in for an empty closing.
    vi.mocked(coverLettersApi.update).mockImplementation(
      async (id, payload) => ({ ...mockLetter, ...payload, id, subject: payload.subject.trim(), closing: payload.closing?.trim() || 'Mit freundlichen Grüßen' }) as CoverLetter,
    )
    await openEditor()

    const subject = screen.getByLabelText(/^Betreffzeile/)
    fireEvent.change(subject, { target: { value: 'Bewerbung ' } })
    const closing = screen.getByLabelText(/^Grußformel/)
    fireEvent.change(closing, { target: { value: '' } })
    await waitFor(() => expect(coverLettersApi.update).toHaveBeenCalledTimes(1))
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 100))))

    expect(subject).toHaveValue('Bewerbung ')
    expect(closing).toHaveValue('')
  })

  it('goes back without a question once everything is saved, and sends what was typed on the way', async () => {
    await openEditor()

    fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: 'Etwas anderes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zur Übersicht' }))

    expect(await screen.findByRole('button', { name: 'Bewerbung Cloud Specialist' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(coverLettersApi.update).toHaveBeenCalledWith('cl1', expect.objectContaining({ subject: 'Etwas anderes' }))
  })

  it('asks only when the input could not be saved, says that it stays as a copy, and goes on the answer', async () => {
    vi.mocked(coverLettersApi.update).mockRejectedValue(new ApiError(500, { status: 500, code: 'internal', detail: 'Datenbank gesperrt' }))
    await openEditor({ account: true })

    fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: 'Etwas anderes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zur Übersicht' }))

    const question = await screen.findByRole('alertdialog')
    expect(within(question).getByText('Eingaben nicht gespeichert')).toBeInTheDocument()
    expect(question).toHaveTextContent('Kopie in diesem Browser')

    // "Abbrechen" stays in the editor with the typed text.
    fireEvent.click(within(question).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByLabelText(/^Betreffzeile/)).toHaveValue('Etwas anderes')

    // "Trotzdem verlassen" returns to the list; the copy stays for the next opening.
    fireEvent.click(screen.getByRole('button', { name: 'Zurück zur Übersicht' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Trotzdem verlassen' }))
    expect(await screen.findByRole('button', { name: 'Bewerbung Cloud Specialist' })).toBeInTheDocument()
    expect(readDraft(draftKey('u1', 'coverLetter.cl1'), (raw) => raw as CoverLetterPayload)?.value.subject).toBe('Etwas anderes')
  })

  it('goes back without a question when nothing was changed', async () => {
    await openEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Zurück zur Übersicht' }))

    expect(await screen.findByRole('button', { name: 'Bewerbung Cloud Specialist' })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('keeps what was typed when a signature is uploaded', async () => {
    vi.mocked(coverLettersApi.uploadSignature).mockResolvedValue({ ...mockLetter, hasSignature: true, updatedAt: '2026-11-07T00:00:00Z' })
    await openEditor()

    fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: 'Noch nicht gespeichert' } })
    const file = new File(['png'], 'sig.png', { type: 'image/png' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('Unterschrift hinterlegt')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Betreffzeile/)).toHaveValue('Noch nicht gespeichert')
  })

  it('shows a failure of the background save in the status, without a dialog, and the complete error behind a button', async () => {
    vi.mocked(coverLettersApi.update).mockRejectedValue(new ApiError(500, { status: 500, code: 'internal', detail: 'Datenbank gesperrt' }))
    await openEditor()

    fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: 'Neu' } })
    expect(await screen.findByText(/Nicht gespeichert, neuer Versuch läuft/)).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByLabelText(/^Betreffzeile/)).toHaveValue('Neu')

    fireEvent.click(screen.getByRole('button', { name: 'Fehler anzeigen' }))
    expect(await screen.findByTestId('error-dialog')).toHaveTextContent('Datenbank gesperrt')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Das Anschreiben konnte nicht gespeichert werden.')
  })

  it('shows a save that fails while exporting in the error dialog with the real reason, and does not export', async () => {
    vi.mocked(coverLettersApi.update).mockRejectedValue(new ApiError(500, { status: 500, code: 'internal', detail: 'Datenbank gesperrt' }))
    await openEditor()

    fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: 'Neu' } })
    fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }))

    const dialog = await screen.findByTestId('error-dialog')
    expect(dialog).toHaveTextContent('Datenbank gesperrt')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Das Anschreiben konnte nicht gespeichert werden.')
    expect(coverLettersApi.exportPdf).not.toHaveBeenCalled()
  })

  describe('the local copy', () => {
    const copyOf = (changes: Partial<CoverLetterPayload>, base: string) =>
      writeDraft(draftKey('u1', 'coverLetter.cl1'), { value: { ...toPayload(mockLetter), ...changes }, savedAt: Date.UTC(2026, 10, 9, 8, 30), base })
    const copy = () => readDraft(draftKey('u1', 'coverLetter.cl1'), (raw) => raw as CoverLetterPayload)

    it('is written with every keystroke and removed once the server has this state', async () => {
      await openEditor({ account: true })
      fireEvent.change(screen.getByLabelText(/^Betreffzeile/), { target: { value: 'Neu' } })
      expect(copy()).toMatchObject({ value: { subject: 'Neu' }, base: mockLetter.updatedAt })
      await waitFor(() => expect(coverLettersApi.update).toHaveBeenCalled())
      await waitFor(() => expect(copy()).toBeNull())
    })

    it('is put back and saved when the server did not change since', async () => {
      copyOf({ subject: 'Aus der Kopie' }, mockLetter.updatedAt)
      await openEditor({ account: true })
      await waitFor(() => expect(screen.getByLabelText(/^Betreffzeile/)).toHaveValue('Aus der Kopie'))
      expect(screen.getByRole('status')).toHaveTextContent(/Eingaben vom .* wiederhergestellt/)
      await waitFor(() => expect(coverLettersApi.update).toHaveBeenCalledWith('cl1', expect.objectContaining({ subject: 'Aus der Kopie' })))
    })

    it('asks when the letter changed on the server meanwhile, and keeps the server state on "Serverstand behalten"', async () => {
      copyOf({ subject: 'Aus der Kopie' }, '2026-01-01T00:00:00Z')
      await openEditor({ account: true })

      const dialog = await screen.findByRole('alertdialog')
      expect(dialog).toHaveTextContent(/Eingaben vom .* übernehmen\?/)
      fireEvent.click(within(dialog).getByRole('button', { name: 'Serverstand behalten' }))
      await waitFor(() => expect(copy()).toBeNull())
      expect(screen.getByLabelText(/^Betreffzeile/)).toHaveValue(mockLetter.subject)
      expect(coverLettersApi.update).not.toHaveBeenCalled()
    })

    it('is removed together with a letter that is gone', async () => {
      copyOf({ subject: 'Aus der Kopie' }, mockLetter.updatedAt)
      vi.mocked(coverLettersApi.list).mockResolvedValue([])
      renderComponent({ account: true })
      await screen.findByText('Noch keine Anschreiben vorhanden. Erstellen Sie Ihr erstes Anschreiben!')
      await waitFor(() => expect(copy()).toBeNull())
    })
  })

  describe('fold and punch marks', () => {
    const switchName = 'DIN-Falz- und Lochmarken'

    it('reads the saved choice of the letter', async () => {
      vi.mocked(coverLettersApi.get).mockResolvedValue({ ...mockLetter, includeFoldMarks: false })
      vi.mocked(coverLettersApi.list).mockResolvedValue([mockListItem])
      renderComponent()
      fireEvent.click(await screen.findByRole('button', { name: 'Bewerbung Cloud Specialist' }))

      expect(await screen.findByRole('switch', { name: switchName })).toHaveAttribute('aria-checked', 'false')
    })

    it('is saved with the letter by itself', async () => {
      vi.mocked(coverLettersApi.update).mockResolvedValue({ ...mockLetter, includeFoldMarks: false })
      await openEditor()
      expect(screen.getByRole('switch', { name: switchName })).toHaveAttribute('aria-checked', 'true')

      fireEvent.click(screen.getByRole('switch', { name: switchName }))

      await waitFor(() => expect(coverLettersApi.update).toHaveBeenCalledWith('cl1', expect.objectContaining({ includeFoldMarks: false })))
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Gespeichert'))
      expect(screen.getByRole('switch', { name: switchName })).toHaveAttribute('aria-checked', 'false')
    })

    it('goes back without a question, the choice is sent on the way', async () => {
      await openEditor()

      fireEvent.click(screen.getByRole('switch', { name: switchName }))
      fireEvent.click(screen.getByRole('button', { name: 'Zurück zur Übersicht' }))

      expect(await screen.findByRole('button', { name: 'Bewerbung Cloud Specialist' })).toBeInTheDocument()
      expect(coverLettersApi.update).toHaveBeenCalledWith('cl1', expect.objectContaining({ includeFoldMarks: false }))
    })

    it('shows the preview and exports with the current value', async () => {
      vi.mocked(coverLettersApi.update).mockResolvedValue({ ...mockLetter, includeFoldMarks: false })
      vi.mocked(coverLettersApi.exportPdf).mockResolvedValue({ blob: new Blob(['%PDF']), filename: 'a.pdf' })
      await openEditor()

      fireEvent.click(screen.getByRole('switch', { name: switchName }))
      fireEvent.click(screen.getByRole('tab', { name: 'PDF-Vorschau' }))

      await waitFor(() => expect(coverLettersApi.getPreviewPdf).toHaveBeenCalled())
      expect(coverLettersApi.getPreviewPdf).toHaveBeenLastCalledWith('cl1', expect.objectContaining({ includeFoldMarks: false }), expect.any(AbortSignal))

      fireEvent.click(screen.getByRole('button', { name: 'PDF herunterladen' }))
      await waitFor(() => expect(coverLettersApi.exportPdf).toHaveBeenCalledWith('cl1', expect.objectContaining({ includeFoldMarks: false })))
    })
  })

  it('translates the text of the letter with the assistant, into the other language, and puts it into the letter', async () => {
    vi.mocked(aiApi.parseResponse).mockResolvedValue({ translatedText: 'I am applying with great interest.' })
    await openEditor()

    fireEvent.click(screen.getByTestId('letter-ai-translate'))
    const assistant = await screen.findByRole('dialog', { name: 'Text übersetzen' })
    // The letter is German, so the translation goes into English; the text sent is the text on the screen.
    expect(within(assistant).getByLabelText('Übersetzen nach')).toHaveValue('en')
    expect(within(assistant).getByLabelText('Zu übersetzender Text')).toHaveValue(mockLetter.body)

    fireEvent.change(within(assistant).getByPlaceholderText(/Fügen Sie die vollständige Antwort/), { target: { value: '{}' } })
    fireEvent.click(within(assistant).getByRole('button', { name: /3. Antwort auswerten/ }))
    fireEvent.click(await within(assistant).findByRole('button', { name: 'Übersetzung übernehmen' }))

    await waitFor(() => expect(screen.getByDisplayValue('I am applying with great interest.')).toBeInTheDocument())
  })
})
