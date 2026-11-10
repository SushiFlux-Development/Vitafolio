// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { MemoryRouter } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { applicationsApi, attachmentsApi, coverLettersApi, profileApi } from '../../api/endpoints'
import type {
  Application,
  ApplicationListItem,
  ApplicationStats,
  Profile,
} from '../../api/types'
import { ConfirmProvider } from '../../components/ui/ConfirmDialog'
import { ErrorDialogProvider } from '../../components/ui/ErrorDialog'
import { ApplicationsPage } from './ApplicationsPage'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

const mockStats: ApplicationStats = {
  total: 3,
  draft: 1,
  applied: 1,
  acknowledged: 0,
  interview: 1,
  offer: 0,
  rejected: 0,
  withdrawn: 0,
  followUpsDue: 1,
}

const mockListItems: ApplicationListItem[] = [
  {
    id: 'app1',
    jobTitle: 'Senior Cloud Engineer',
    company: 'CloudScale AG',
    location: 'Berlin / Remote',
    status: 'applied',
    appliedAt: '2026-10-15T00:00:00Z',
    followUpAt: null,
    isFollowUpDue: true,
    coverLetterTitle: 'Anschreiben CloudScale',
    hasArchivedPdf: true,
    updatedAt: '2026-10-15T00:00:00Z',
  },
  {
    id: 'app2',
    jobTitle: 'Lead Architect',
    company: 'Enterprise Corp',
    location: 'München',
    status: 'interview',
    appliedAt: '2026-11-01T00:00:00Z',
    followUpAt: null,
    isFollowUpDue: false,
    coverLetterTitle: null,
    hasArchivedPdf: false,
    updatedAt: '2026-11-02T00:00:00Z',
  },
  {
    id: 'app3',
    jobTitle: 'Fullstack Dev',
    company: 'Startup GmbH',
    location: null,
    status: 'draft',
    appliedAt: null,
    followUpAt: null,
    isFollowUpDue: false,
    coverLetterTitle: null,
    hasArchivedPdf: false,
    updatedAt: '2026-11-03T00:00:00Z',
  },
]

const mockAppDetails: Application = {
  id: 'app1',
  jobTitle: 'Senior Cloud Engineer',
  company: 'CloudScale AG',
  location: 'Berlin / Remote',
  contactPerson: 'Herr Dr. Markus Schmidt',
  contactEmail: 'schmidt@cloudscale.example',
  contactPhone: '+49 30 9876543',
  jobPostingUrl: 'https://cloudscale.example/jobs/1',
  jobDescription: 'Tolles Team.',
  salaryExpectation: '90.000 EUR',
  status: 'applied',
  appliedAt: '2026-10-15T00:00:00Z',
  followUpAt: null,
  isFollowUpDue: true,
  coverLetterId: 'cl1',
  coverLetterTitle: 'Anschreiben CloudScale',
  cvDesign: 'classic',
  cvAccentColor: '#14213D',
  cvFont: 'Liberation Sans',
  cvLanguage: 'de',
  cvShowPhoto: true,
  cvPhotoShape: 'rounded',
  includeCoverSheet: true,
  attachmentIds: [],
  hasArchivedPdf: true,
  notes: 'Sehr gutes Erstgespräch geplant.',
  createdAt: '2026-10-15T00:00:00Z',
  updatedAt: '2026-10-15T00:00:00Z',
  events: [
    {
      id: 'ev1',
      applicationId: 'app1',
      status: 'applied',
      date: '2026-10-15T00:00:00Z',
      title: 'Bewerbung eingereicht',
      note: 'Per E-Mail versendet.',
      createdAt: '2026-10-15T00:00:00Z',
    },
  ],
}

vi.mock('../../features/documents/useDocumentDesigns', async (original) => ({
  ...(await original<typeof import('../../features/documents/useDocumentDesigns')>()),
  useDocumentDesigns: () => [{ id: 'classic' }, { id: 'modern' }, { id: 'plain' }],
}))

vi.mock('../../api/endpoints', () => ({
  applicationsApi: {
    list: vi.fn(),
    stats: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    addEvent: vi.fn(),
    deleteEvent: vi.fn(),
    getPreviewPdf: vi.fn(),
    getPreview: vi.fn(),
    downloadDossier: vi.fn(),
    archiveSnapshot: vi.fn(),
    contentSuggestion: vi.fn(),
  },
  // The form counts what a selection leaves out against the master profile.
  profileApi: {
    get: vi.fn(),
  },
  coverLettersApi: {
    list: vi.fn(),
  },
  // The error dialog reads the app version for its copyable text.
  publicApi: {
    version: vi.fn().mockResolvedValue({ version: 'v2026.11.7 (1.2-dev)', short: 'v2026.11.7', channel: 'dev' }),
  },
  attachmentsApi: {
    list: vi.fn().mockResolvedValue([]),
    upload: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    downloadUrl: vi.fn((id: string) => `/api/attachments/${id}/download`),
  },
  aiApi: {
    getConfig: vi.fn().mockResolvedValue({
      provider: 'copy_paste',
      model: 'gpt-4o-mini',
      baseUrl: null,
      hasApiKey: false,
      pseudonymize: true,
    }),
  },
}))

function renderPage(route = '/') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          <ErrorDialogProvider>
            <ApplicationsPage />
          </ErrorDialogProvider>
        </ConfirmProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

describe('ApplicationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-dossier')
    global.URL.revokeObjectURL = vi.fn()
    vi.mocked(applicationsApi.list).mockResolvedValue(mockListItems)
    vi.mocked(applicationsApi.stats).mockResolvedValue(mockStats)
    vi.mocked(applicationsApi.get).mockResolvedValue(mockAppDetails)
    vi.mocked(attachmentsApi.list).mockResolvedValue([])
    vi.mocked(profileApi.get).mockResolvedValue({ experiences: [], educations: [], skills: [], languages: [], certificates: [], interests: [], customSections: [] } as unknown as Profile)
    // No suggestion (as when the server has no data): the form stays complete and says so quietly.
    vi.mocked(applicationsApi.contentSuggestion).mockRejectedValue(new ApiError(404, { status: 404, detail: 'no suggestion' }))
    vi.mocked(coverLettersApi.list).mockResolvedValue([
      { id: 'cl1', title: 'Anschreiben CloudScale', recipientCompany: 'CloudScale AG', subject: 'Subject', updatedAt: '2026-10-15T00:00:00Z' },
    ])
  })

  it('renders title, stats cards and follow-up alert banner', async () => {
    renderPage()

    expect(await screen.findByText('Bewerbungs-Tracker')).toBeInTheDocument()
    expect(await screen.findByText('Gesamt')).toBeInTheDocument()
    const followUpBadges = await screen.findAllByText('Nachfassen fällig')
    expect(followUpBadges.length).toBeGreaterThanOrEqual(1)

    // Follow-up banner
    expect(await screen.findByText(/Bei 1 Bewerbung ist ein Nachfassen fällig/)).toBeInTheDocument()
  })

  it('renders kanban board with columns and application cards', async () => {
    renderPage()

    // Check items in Kanban
    expect(await screen.findByText('Senior Cloud Engineer')).toBeInTheDocument()
    expect(screen.getByText('Lead Architect')).toBeInTheDocument()
    expect(screen.getByText('Fullstack Dev')).toBeInTheDocument()
  })

  it('switches to list view and displays table rows', async () => {
    renderPage()

    const listBtn = await screen.findByRole('radio', { name: /Listenansicht/i })
    fireEvent.click(listBtn)

    expect(await screen.findByText('CloudScale AG')).toBeInTheDocument()
    expect(screen.getByText('Enterprise Corp')).toBeInTheDocument()
  })

  it('opens new application dialog, fills fields and calls create endpoint', async () => {
    vi.mocked(applicationsApi.create).mockResolvedValue(mockAppDetails)
    renderPage()

    const newBtn = await screen.findByRole('button', { name: /Neue Bewerbung/i })
    fireEvent.click(newBtn)

    expect(await screen.findByText('Neue Bewerbung anlegen')).toBeInTheDocument()

    const jobTitleInput = screen.getByPlaceholderText(/Senior Cloud Architect/i)
    const companyInput = screen.getByPlaceholderText(/Acme Corp GmbH/i)

    fireEvent.change(jobTitleInput, { target: { value: 'Frontend Spezialist' } })
    fireEvent.change(companyInput, { target: { value: 'Tech AG' } })

    const submitBtn = screen.getByRole('button', { name: /Speichern/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(applicationsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobTitle: 'Frontend Spezialist',
          company: 'Tech AG',
        })
      )
    })
  })

  it('opens details modal when clicking an application card and allows adding an event', async () => {
    vi.mocked(applicationsApi.addEvent).mockResolvedValue({
      id: 'ev2',
      applicationId: 'app1',
      status: 'interview',
      date: '2026-11-06T00:00:00Z',
      title: 'Zweites Gespräch',
      note: 'Deep Dive Tech.',
      createdAt: '2026-11-06T00:00:00Z',
    })

    renderPage()

    const card = await screen.findByText('Senior Cloud Engineer')
    fireEvent.click(card)

    expect(await screen.findByText('Senior Cloud Engineer – CloudScale AG')).toBeInTheDocument()
    expect(screen.getByText('Herr Dr. Markus Schmidt')).toBeInTheDocument()

    // Switch to Timeline tab
    const timelineTab = screen.getByRole('tab', { name: /Verlauf & Ereignisse/i })
    fireEvent.click(timelineTab)

    expect(await screen.findByText('Bewerbung eingereicht')).toBeInTheDocument()

    // Add event
    const titleInput = screen.getByLabelText(/Titel des Ereignisses/i)
    fireEvent.change(titleInput, { target: { value: 'Zweites Gespräch' } })

    const addBtn = screen.getByRole('button', { name: /Hinzufügen/i })
    fireEvent.click(addBtn)

    await waitFor(() => {
      expect(applicationsApi.addEvent).toHaveBeenCalledWith(
        'app1',
        expect.objectContaining({
          title: 'Zweites Gespräch',
        })
      )
    })
  })

  it('triggers download dossier from details modal', async () => {
    const mockBlob = new Blob(['%PDF-test'], { type: 'application/pdf' })
    vi.mocked(applicationsApi.downloadDossier).mockResolvedValue({
      blob: mockBlob,
      filename: 'Bewerbung_CloudScale.pdf',
    })

    renderPage()

    const card = await screen.findByText('Senior Cloud Engineer')
    fireEvent.click(card)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Senior Cloud Engineer – CloudScale AG')).toBeInTheDocument()

    const downloadBtn = within(dialog).getByRole('button', { name: /Dossier herunterladen/i })
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(applicationsApi.downloadDossier).toHaveBeenCalledWith('app1')
    })
  })

  it('asks before an existing snapshot is replaced and only then replaces it', async () => {
    vi.mocked(applicationsApi.archiveSnapshot).mockResolvedValue(mockAppDetails)

    renderPage()

    fireEvent.click(await screen.findByText('Senior Cloud Engineer'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('tab', { name: /Bewerbungs-Dossier/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Snapshot aktualisieren/i }))

    // The question comes first - nothing is replaced yet
    const question = await screen.findByRole('alertdialog')
    expect(within(question).getByText('Archivierten Stand ersetzen?')).toBeInTheDocument()
    expect(applicationsApi.archiveSnapshot).not.toHaveBeenCalled()

    fireEvent.click(within(question).getByRole('button', { name: 'Ersetzen' }))
    await waitFor(() => {
      expect(applicationsApi.archiveSnapshot).toHaveBeenCalledWith('app1', true)
    })
  })

  it('does not replace the snapshot when the question is cancelled', async () => {
    renderPage()

    fireEvent.click(await screen.findByText('Senior Cloud Engineer'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('tab', { name: /Bewerbungs-Dossier/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Snapshot aktualisieren/i }))

    const question = await screen.findByRole('alertdialog')
    fireEvent.click(within(question).getByRole('button', { name: 'Abbrechen' }))
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(applicationsApi.archiveSnapshot).not.toHaveBeenCalled()
  })

  it('asks the server only after the typing paused, and keeps the old list on screen meanwhile', async () => {
    renderPage()
    expect(await screen.findByText('Senior Cloud Engineer')).toBeInTheDocument()
    expect(applicationsApi.list).toHaveBeenCalledTimes(1)

    let finish: (items: ApplicationListItem[]) => void = () => undefined
    vi.mocked(applicationsApi.list).mockImplementationOnce(() => new Promise<ApplicationListItem[]>((resolve) => (finish = resolve)))
    const search = screen.getByRole('searchbox', { name: 'Bewerbungen durchsuchen' })
    fireEvent.change(search, { target: { value: 'Lead' } })
    fireEvent.change(search, { target: { value: 'Lead A' } })
    // Not asked yet: the typing has just happened.
    expect(applicationsApi.list).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(applicationsApi.list).toHaveBeenCalledTimes(2), { timeout: 2000 })
    expect(applicationsApi.list).toHaveBeenLastCalledWith({ status: undefined, search: 'Lead A' })
    // The answer is still on its way: the previous cards stay (no empty flash, no spinner).
    expect(screen.getByText('Senior Cloud Engineer')).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()

    finish([mockListItems[1]!])
    await waitFor(() => expect(screen.queryByText('Senior Cloud Engineer')).toBeNull())
    expect(screen.getByText('Lead Architect')).toBeInTheDocument()
  })

  it('tells a failed download in the error dialog with the real reason', async () => {
    vi.mocked(applicationsApi.downloadDossier).mockRejectedValue(new ApiError(500, { status: 500, code: 'internal', detail: 'Anlage 3 nicht lesbar' }))
    renderPage()

    fireEvent.click(await screen.findByText('Senior Cloud Engineer'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Dossier herunterladen/i }))

    const error = await screen.findByTestId('error-dialog')
    expect(error).toHaveTextContent('Anlage 3 nicht lesbar')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Das Dossier konnte nicht heruntergeladen werden.')
  })

  it('tells a failed status change instead of staying silent', async () => {
    vi.mocked(applicationsApi.updateStatus).mockRejectedValue(new ApiError(409, { status: 409, code: 'conflict', detail: 'Status gesperrt' }))
    renderPage()

    fireEvent.click(await screen.findByText('Senior Cloud Engineer'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Aktueller Status'), { target: { value: 'offer' } })

    expect(await screen.findByTestId('error-dialog')).toHaveTextContent('Status gesperrt')
  })

  it('shows the freeze warning of the server at a fixed place after a status change', async () => {
    vi.mocked(applicationsApi.updateStatus).mockResolvedValue({ ...mockAppDetails, archiveWarning: 'archive.attachments_unavailable' })
    renderPage()

    fireEvent.click(await screen.findByText('Senior Cloud Engineer'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Aktueller Status'), { target: { value: 'offer' } })

    expect(await within(dialog).findByText(/mindestens eine Anlage fehlt/i)).toBeInTheDocument()
  })

  it('asks before an event of the timeline is deleted', async () => {
    vi.mocked(applicationsApi.deleteEvent).mockResolvedValue(undefined)
    renderPage()

    fireEvent.click(await screen.findByText('Senior Cloud Engineer'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('tab', { name: /Verlauf & Ereignisse/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /Löschen: Bewerbung eingereicht/i }))

    const question = await screen.findByRole('alertdialog')
    expect(applicationsApi.deleteEvent).not.toHaveBeenCalled()
    fireEvent.click(within(question).getByRole('button', { name: 'Löschen' }))
    await waitFor(() => expect(applicationsApi.deleteEvent).toHaveBeenCalledWith('app1', 'ev1'))
  })

  describe('changing an application', () => {
    /** Opens the details of the first application and then the edit form on top of it. */
    async function openEditForm(details: Application = mockAppDetails) {
      vi.mocked(applicationsApi.get).mockResolvedValue(details)
      vi.mocked(applicationsApi.update).mockResolvedValue(details)
      renderPage()
      fireEvent.click(await screen.findByText('Senior Cloud Engineer'))
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Bearbeiten' }))
      return screen.findByRole('dialog', { name: 'Bewerbung bearbeiten' })
    }

    const followUpField = (form: HTMLElement) => within(form).getByLabelText('Nachfassen geplant am')
    const save = (form: HTMLElement) => fireEvent.click(within(form).getByRole('button', { name: 'Speichern' }))
    const sentBody = () => vi.mocked(applicationsApi.update).mock.calls[0]![1]

    it('opens with everything of the application filled in, and sends it back as a whole', async () => {
      vi.mocked(attachmentsApi.list).mockResolvedValue([
        { id: 'att1', title: 'Arbeitszeugnis', fileName: 'z.pdf', category: 'Zeugnis', contentType: 'application/pdf', sizeBytes: 10, sortOrder: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' },
      ])
      const form = await openEditForm({ ...mockAppDetails, attachmentIds: ['att1'], cvDesign: 'modern', cvLanguage: 'en', includeCoverSheet: false })

      expect(within(form).getByLabelText(/^Stellenbezeichnung/)).toHaveValue('Senior Cloud Engineer')
      expect(within(form).getByLabelText(/^Unternehmen/)).toHaveValue('CloudScale AG')
      expect(within(form).getByLabelText('Standort / Remote')).toHaveValue('Berlin / Remote')
      expect(within(form).getByLabelText('Gehaltsvorstellung')).toHaveValue('90.000 EUR')
      expect(within(form).getByLabelText('Ansprechpartner')).toHaveValue('Herr Dr. Markus Schmidt')
      expect(within(form).getByLabelText('E-Mail-Adresse')).toHaveValue('schmidt@cloudscale.example')
      expect(within(form).getByLabelText('Telefonnummer')).toHaveValue('+49 30 9876543')
      expect(within(form).getByLabelText('Link zur Stellenausschreibung')).toHaveValue('https://cloudscale.example/jobs/1')
      expect(within(form).getByLabelText('Zugeordnetes Anschreiben')).toHaveValue('cl1')
      expect(within(form).getByLabelText('Lebenslauf-Design')).toHaveValue('modern')
      expect(within(form).getByLabelText('Sprache')).toHaveValue('en')
      expect(within(form).getByRole('switch', { name: 'Deckblatt ins Dossier einbinden' })).toHaveAttribute('aria-checked', 'false')
      expect(await within(form).findByRole('checkbox', { name: /Arbeitszeugnis/ })).toBeChecked()
      expect(within(form).getByLabelText(/Persönliche Notizen/)).toHaveValue('Sehr gutes Erstgespräch geplant.')
      // The status changes in the details (the timeline notes it there), not in this form.
      expect(within(form).queryByLabelText('Aktueller Status')).toBeNull()

      fireEvent.change(within(form).getByLabelText(/^Stellenbezeichnung/), { target: { value: 'Principal Cloud Engineer' } })
      save(form)

      await waitFor(() => expect(applicationsApi.update).toHaveBeenCalledTimes(1))
      expect(vi.mocked(applicationsApi.update).mock.calls[0]![0]).toBe('app1')
      expect(sentBody()).toEqual({
        jobTitle: 'Principal Cloud Engineer',
        company: 'CloudScale AG',
        location: 'Berlin / Remote',
        contactPerson: 'Herr Dr. Markus Schmidt',
        contactEmail: 'schmidt@cloudscale.example',
        contactPhone: '+49 30 9876543',
        jobPostingUrl: 'https://cloudscale.example/jobs/1',
        // Not in the form, but an optional text left out would be cleared by the server - so it travels along unchanged.
        jobDescription: 'Tolles Team.',
        salaryExpectation: '90.000 EUR',
        followUpAt: null,
        coverLetterId: 'cl1',
        includeCoverSheet: false,
        // Always sent: `{}` is the complete profile and the only value that clears a stored selection on a change.
        cvSelection: {},
        attachmentIds: ['att1'],
        cvDesign: 'modern',
        cvLanguage: 'en',
        notes: 'Sehr gutes Erstgespräch geplant.',
      })
      // Left out on purpose: the status and the sent day stay as they are.
      expect(sentBody()).not.toHaveProperty('status')
      expect(sentBody()).not.toHaveProperty('appliedAt')
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Bewerbung bearbeiten' })).toBeNull())
    })

    it('clears the optional fields and the cover letter that were emptied, and saves a follow-up day', async () => {
      const form = await openEditForm()

      fireEvent.change(within(form).getByLabelText('Standort / Remote'), { target: { value: '' } })
      fireEvent.change(within(form).getByLabelText('Zugeordnetes Anschreiben'), { target: { value: '' } })
      await userEvent.type(followUpField(form), '01122026')
      expect(followUpField(form)).toHaveValue('01.12.2026')
      save(form)

      await waitFor(() => expect(applicationsApi.update).toHaveBeenCalled())
      expect(sentBody()).toMatchObject({ location: null, coverLetterId: null, followUpAt: '2026-12-01T00:00:00Z' })
    })

    it('shows the stored follow-up day, and emptying the field removes it', async () => {
      const form = await openEditForm({ ...mockAppDetails, followUpAt: '2026-11-20T00:00:00Z' })
      // Stored as ISO, shown in the chosen notation (German interface: day.month.year).
      expect(followUpField(form)).toHaveValue('20.11.2026')

      fireEvent.change(followUpField(form), { target: { value: '' } })
      save(form)

      await waitFor(() => expect(applicationsApi.update).toHaveBeenCalled())
      expect(sentBody()).toMatchObject({ followUpAt: null })
    })

    it('does not change a stored follow-up that the user did not touch (also not its time of day)', async () => {
      const form = await openEditForm({ ...mockAppDetails, followUpAt: '2026-11-20T14:30:00Z' })

      fireEvent.change(within(form).getByLabelText(/^Unternehmen/), { target: { value: 'CloudScale GmbH' } })
      save(form)

      await waitFor(() => expect(applicationsApi.update).toHaveBeenCalled())
      expect(sentBody()).toMatchObject({ company: 'CloudScale GmbH', followUpAt: '2026-11-20T14:30:00Z' })
    })

    it('says what happens without a follow-up day, and marks a wrong day while it is typed', async () => {
      const form = await openEditForm()
      expect(within(form).getByText('Ohne Datum erinnert die App nach 14 Tagen im Status „Beworben“.')).toBeInTheDocument()

      await userEvent.type(followUpField(form), '45132026')
      // Before any blur or click: the field is red and says what is expected, in the active notation.
      expect(followUpField(form)).toHaveValue('45.13.2026')
      expect(followUpField(form)).toHaveAttribute('aria-invalid', 'true')
      expect(within(form).getByText('Bitte als TT.MM.JJJJ angeben, z. B. 23.04.1990.')).toBeInTheDocument()

      save(form)
      expect(applicationsApi.update).not.toHaveBeenCalled()

      await userEvent.clear(followUpField(form))
      await userEvent.type(followUpField(form), '01051999')
      expect(within(form).getByText('Bitte ein Jahr zwischen 2000 und 2100 angeben.')).toBeInTheDocument()
    })

    it('asks before changed input is dropped, and closes at once when nothing changed', async () => {
      const form = await openEditForm()
      fireEvent.click(within(form).getByRole('button', { name: 'Abbrechen' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Bewerbung bearbeiten' })).toBeNull())
      expect(screen.queryByRole('alertdialog')).toBeNull()

      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Bearbeiten' }))
      const again = await screen.findByRole('dialog', { name: 'Bewerbung bearbeiten' })
      fireEvent.change(within(again).getByLabelText('Ansprechpartner'), { target: { value: 'Jemand anderes' } })
      fireEvent.click(within(again).getByRole('button', { name: 'Abbrechen' }))
      expect(within(await screen.findByRole('alertdialog')).getByText('Änderungen verwerfen?')).toBeInTheDocument()
      expect(applicationsApi.update).not.toHaveBeenCalled()
    })

    it('tells a failed save with the real reason and keeps what was typed', async () => {
      const form = await openEditForm()
      vi.mocked(applicationsApi.update).mockRejectedValue(new ApiError(400, { status: 400, code: 'attachment.not_found', detail: 'One of the specified attachments does not exist.' }))

      fireEvent.change(within(form).getByLabelText('Ansprechpartner'), { target: { value: 'Frau Müller' } })
      save(form)

      const error = await screen.findByTestId('error-dialog')
      expect(error).toHaveTextContent('Eine der gewählten Anlagen gibt es nicht (mehr)')
      expect(screen.getByRole('alertdialog')).toHaveTextContent('Die Bewerbung konnte nicht gespeichert werden.')
      expect(within(form).getByLabelText('Ansprechpartner')).toHaveValue('Frau Müller')
    })

    it('creates with the same form, including the follow-up day and the status', async () => {
      vi.mocked(applicationsApi.create).mockResolvedValue(mockAppDetails)
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: /Neue Bewerbung/i }))
      const form = await screen.findByRole('dialog', { name: 'Neue Bewerbung anlegen' })

      fireEvent.change(within(form).getByLabelText(/^Stellenbezeichnung/), { target: { value: 'Dev' } })
      fireEvent.change(within(form).getByLabelText(/^Unternehmen/), { target: { value: 'Tech AG' } })
      fireEvent.change(within(form).getByLabelText('Aktueller Status'), { target: { value: 'applied' } })
      await userEvent.type(followUpField(form), '24122026')
      save(form)

      await waitFor(() => expect(applicationsApi.create).toHaveBeenCalled())
      expect(vi.mocked(applicationsApi.create).mock.calls[0]![0]).toMatchObject({ jobTitle: 'Dev', company: 'Tech AG', status: 'applied', followUpAt: '2026-12-24T00:00:00Z' })
    })
  })

  describe('dossier preview', () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' })

    /** Opens the dossier preview from the dossier tab of the details of the first application (which has a filed version). */
    async function openPreview() {
      renderPage()
      fireEvent.click(await screen.findByText('Senior Cloud Engineer'))
      const details = await screen.findByRole('dialog')
      fireEvent.click(within(details).getByRole('tab', { name: /Bewerbungs-Dossier/i }))
      fireEvent.click(within(details).getByRole('button', { name: 'Dossier ansehen' }))
      return screen.findByRole('dialog', { name: 'CloudScale AG – Senior Cloud Engineer' })
    }

    const calls = () => vi.mocked(applicationsApi.getPreview).mock.calls.map(([, options]) => options?.version)

    it('asks the server for the default version and says it is the filed one', async () => {
      vi.mocked(applicationsApi.getPreview).mockResolvedValue({ blob: pdf, source: 'archived' })
      const dialog = await openPreview()

      const bar = await within(dialog).findByText('Abgelegte Fassung')
      expect(bar).toBeInTheDocument()
      expect(within(dialog).getByText(/Das ist die abgelegte Fassung/)).toBeInTheDocument()
      expect(applicationsApi.getPreview).toHaveBeenCalledWith('app1', { version: 'auto', signal: expect.any(AbortSignal) })
      expect(within(dialog).getByRole('button', { name: 'Heutigen Stand ansehen' })).toBeInTheDocument()
    })

    it('shows today\'s state on request, says so, and goes back to the filed version', async () => {
      vi.mocked(applicationsApi.getPreview).mockImplementation(async (_id, options) => ({ blob: pdf, source: options?.version === 'current' ? 'current' : 'archived' }))
      const dialog = await openPreview()
      await within(dialog).findByText('Abgelegte Fassung')

      fireEvent.click(within(dialog).getByRole('button', { name: 'Heutigen Stand ansehen' }))

      expect(await within(dialog).findByText('Heutiger Stand')).toBeInTheDocument()
      expect(within(dialog).getByText(/Er kann von der abgelegten Fassung abweichen/)).toBeInTheDocument()
      expect(within(dialog).queryByText('Abgelegte Fassung')).toBeNull()
      expect(calls()).toEqual(['auto', 'current'])

      fireEvent.click(within(dialog).getByRole('button', { name: 'Zurück zur abgelegten Fassung' }))
      expect(await within(dialog).findByText('Abgelegte Fassung')).toBeInTheDocument()
      expect(calls()).toEqual(['auto', 'current', 'auto'])
    })

    it('tells a lost filed version clearly, offers today\'s state and does not render anything new on its own', async () => {
      vi.mocked(applicationsApi.getPreview).mockImplementation(async (_id, options) => {
        if (options?.version === 'current') return { blob: pdf, source: 'current' }
        throw new ApiError(409, { status: 409, code: 'archive.missing', detail: 'The archived dossier of this application is no longer available.' })
      })
      const dialog = await openPreview()

      const alert = await within(dialog).findByRole('alert')
      expect(alert).toHaveTextContent('Der archivierte Stand dieser Bewerbung ist nicht mehr vorhanden.')
      // Trying again would only fail again: the way on is the other version.
      expect(within(dialog).queryByRole('button', { name: 'Noch einmal versuchen' })).toBeNull()
      expect(calls()).toEqual(['auto'])

      fireEvent.click(within(alert.parentElement!).getByRole('button', { name: 'Heutigen Stand ansehen' }))

      expect(await within(dialog).findByText('Heutiger Stand')).toBeInTheDocument()
      expect(within(dialog).queryByRole('alert')).toBeNull()
      expect(calls()).toEqual(['auto', 'current'])
    })

    it('says plainly that no version is filed yet and offers no switch', async () => {
      vi.mocked(applicationsApi.getPreview).mockResolvedValue({ blob: pdf, source: 'current' })
      const dialog = await openPreview()

      expect(await within(dialog).findByText('Heutiger Stand')).toBeInTheDocument()
      expect(within(dialog).getByText(/noch keine Fassung abgelegt/)).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Heutigen Stand ansehen' })).toBeNull()
      expect(within(dialog).queryByRole('button', { name: 'Zurück zur abgelegten Fassung' })).toBeNull()
    })
  })

  it('shows the closed column with both rejections and withdrawals and the metric split', async () => {
    vi.mocked(applicationsApi.list).mockResolvedValue([
      { ...mockListItems[0]!, id: 'r1', jobTitle: 'Abgelehnte Stelle', status: 'rejected' },
      { ...mockListItems[1]!, id: 'w1', jobTitle: 'Zurückgezogene Stelle', status: 'withdrawn' },
    ])
    vi.mocked(applicationsApi.stats).mockResolvedValue({ ...mockStats, rejected: 1, withdrawn: 1, total: 2 })
    renderPage()

    const closed = await screen.findByRole('region', { name: 'Abgeschlossen' })
    expect(within(closed).getByText('Abgelehnte Stelle')).toBeInTheDocument()
    expect(within(closed).getByText('Zurückgezogene Stelle')).toBeInTheDocument()
    expect(await screen.findByText('1 Absage(n) · 1 zurückgezogen')).toBeInTheDocument()
  })

  describe('filters and targets in the address (the dashboard links here)', () => {
    it('asks the server for the status of "?status=" and shows it as a list', async () => {
      renderPage('/?status=interview')

      expect(await screen.findByRole('table')).toBeInTheDocument()
      await waitFor(() => expect(applicationsApi.list).toHaveBeenCalledWith({ status: 'interview' }))
      expect(screen.getByRole('combobox', { name: 'Nach Status filtern' })).toHaveValue('interview')
    })

    it('writes a changed status filter into the address, so the list can be linked to', async () => {
      renderPage('/')
      const select = await screen.findByRole('combobox', { name: 'Nach Status filtern' })

      fireEvent.change(select, { target: { value: 'offer' } })

      await waitFor(() => expect(applicationsApi.list).toHaveBeenCalledWith({ status: 'offer' }))
      fireEvent.change(select, { target: { value: 'all' } })
      await waitFor(() => expect(select).toHaveValue('all'))
    })

    it('ignores a status it does not know', async () => {
      renderPage('/?status=nonsense')

      await screen.findByText('Senior Cloud Engineer')
      expect(applicationsApi.list).toHaveBeenCalledWith({})
    })

    it('shows only the applications with a due follow-up for "?followUp=1"', async () => {
      renderPage('/?followUp=1')

      expect(await screen.findByText('Senior Cloud Engineer')).toBeInTheDocument()
      expect(screen.queryByText('Lead Architect')).toBeNull()
    })

    it('opens the details of the application named by "?open="', async () => {
      renderPage('/?open=app1')

      expect(await screen.findByRole('dialog', { name: 'Senior Cloud Engineer – CloudScale AG' })).toBeInTheDocument()
      expect(applicationsApi.get).toHaveBeenCalledWith('app1')
    })

    it('opens the form for a new application for "?new=1"', async () => {
      renderPage('/?new=1')

      expect(await screen.findByRole('dialog', { name: 'Neue Bewerbung anlegen' })).toBeInTheDocument()
    })
  })
})
