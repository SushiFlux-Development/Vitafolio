import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { applicationsApi, attachmentsApi, profileApi, publicApi } from '../../api/endpoints'
import type { Application, ApplicationPayload, Attachment, ContentSuggestion, Profile } from '../../api/types'
import { renderInApp } from '../../test/render'
import { versionOf } from '../../test/fixtures'
import { ApplicationFormDialog } from './ApplicationFormDialog'

vi.mock('../documents/useDocumentDesigns', async (original) => ({
  ...(await original<typeof import('../documents/useDocumentDesigns')>()),
  useDocumentDesigns: () => [{ id: 'classic' }, { id: 'modern' }, { id: 'plain' }],
}))

vi.mock('../../api/endpoints', () => ({
  applicationsApi: { create: vi.fn(), update: vi.fn(), contentSuggestion: vi.fn() },
  attachmentsApi: { list: vi.fn() },
  profileApi: { get: vi.fn() },
  publicApi: { version: vi.fn() },
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

// Invented data only.
const profile = {
  experiences: [
    { id: 'e1', jobTitle: 'Teamleiterin IT', employer: 'Muster GmbH', startDate: '2020-01', isCurrent: true },
    { id: 'e2', jobTitle: 'Systemadministratorin', employer: 'Alt AG', startDate: '2008-03', endDate: '2012-06', isCurrent: false },
    { id: 'e3', jobTitle: 'Praktikantin', employer: 'Klein KG', startDate: '2006-01', endDate: '2006-03', isCurrent: false },
  ],
  educations: [],
  skills: [],
  languages: [],
  certificates: [],
  interests: [],
  customSections: [],
} as unknown as Profile

const attachment = { id: 'a1', title: 'Arbeitszeugnis Muster', category: 'Zeugnis' } as Attachment

const suggestion: ContentSuggestion = {
  yearsOfExperience: 14,
  stage: 'long',
  experiences: [
    { id: 'e1', suggestion: 'full', reason: 'recent' },
    { id: 'e2', suggestion: 'short', reason: 'older_than_10_years' },
    { id: 'e3', suggestion: 'hidden', reason: 'old_internship' },
  ],
  educations: [],
  certificates: [],
  attachments: [{ id: 'a1', suggestion: 'include', reason: 'recent_reference' }],
  checklist: [],
}

const saved = { id: 'new1', jobTitle: 'x', company: 'y' } as Application
const sent = () => vi.mocked(applicationsApi.create).mock.calls[0]![0] as ApplicationPayload
const line = () => screen.getByTestId('cv-content-summary')

async function fillAndSave(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Stellenbezeichnung|Position/), 'Teamleiterin')
  await user.type(screen.getByLabelText(/Unternehmen|Firma/), 'Auswahl AG')
  await user.click(screen.getByRole('button', { name: 'Speichern' }))
  await waitFor(() => expect(applicationsApi.create).toHaveBeenCalledTimes(1))
}

function renderForm(application?: Application) {
  return renderInApp(<ApplicationFormDialog open onClose={vi.fn()} coverLetters={[]} application={application} onSaved={vi.fn()} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(publicApi.version).mockResolvedValue(versionOf('v2026.11.12 (13.557)'))
  vi.mocked(profileApi.get).mockResolvedValue(profile)
  vi.mocked(attachmentsApi.list).mockResolvedValue([attachment])
  vi.mocked(applicationsApi.contentSuggestion).mockResolvedValue(suggestion)
  vi.mocked(applicationsApi.create).mockResolvedValue(saved)
})

describe('ApplicationFormDialog: the suggestion for a new application', () => {
  it('puts the new application together from the suggestion, says so in the form before anything is saved, and saves it', async () => {
    const user = userEvent.setup()
    renderForm()
    await waitFor(() => expect(line()).toHaveTextContent('hat einen Vorschlag zusammengestellt: 1 Station gekürzt, 1 Station weggelassen, 1 Anlage'))
    expect(screen.getByRole('checkbox', { name: /Arbeitszeugnis Muster/ })).toBeChecked()
    await fillAndSave(user)
    expect(sent().cvSelection).toEqual({ experiences: { e2: 'short', e3: 'hidden' }, educations: {}, certificates: {}, hiddenSections: [] })
    expect(sent().attachmentIds).toEqual(['a1'])
  })

  it('lets a hand-made choice for a field stand: the suggestion no longer overwrites it', async () => {
    const user = userEvent.setup()
    renderForm()
    await waitFor(() => expect(line()).toHaveTextContent('Vorschlag zusammengestellt'))
    await user.click(screen.getByRole('checkbox', { name: /Arbeitszeugnis Muster/ }))
    // The line no longer claims the suggestion once something was changed
    await waitFor(() => expect(line()).not.toHaveTextContent('Vorschlag zusammengestellt'))
    expect(line()).toHaveTextContent('1 Station gekürzt, 1 Station weggelassen')
    await fillAndSave(user)
    // The attachment was taken back by hand; the selection of the CV still follows the suggestion
    expect(sent().attachmentIds).toEqual([])
    expect(sent().cvSelection).toMatchObject({ experiences: { e2: 'short', e3: 'hidden' } })
  })

  it('"Alles vollständig" takes the suggestion back: the whole profile, no attachments', async () => {
    const user = userEvent.setup()
    renderForm()
    await waitFor(() => expect(line()).toHaveTextContent('Vorschlag zusammengestellt'))
    await user.click(screen.getByRole('button', { name: 'Alles vollständig' }))
    expect(line()).toHaveTextContent('Vollständig: das ganze Stammprofil')
    expect(screen.getByRole('button', { name: 'Alles vollständig' })).toBeDisabled()
    await fillAndSave(user)
    expect(sent().cvSelection).toEqual({})
    expect(sent().attachmentIds).toEqual([])
  })

  it('stays complete when the suggestion cannot be loaded, and says so calmly', async () => {
    vi.mocked(applicationsApi.contentSuggestion).mockRejectedValue(new ApiError(500, { status: 500, detail: 'kaputt' }))
    const user = userEvent.setup()
    renderForm()
    await waitFor(() => expect(line()).toHaveTextContent('Es gibt keinen Vorschlag. Der Lebenslauf bleibt vollständig.'))
    await fillAndSave(user)
    expect(sent().cvSelection).toEqual({})
    expect(sent().attachmentIds).toEqual([])
  })

  it('stays complete when there is nothing to suggest', async () => {
    vi.mocked(applicationsApi.contentSuggestion).mockResolvedValue({ ...suggestion, experiences: [{ id: 'e1', suggestion: 'full', reason: 'recent' }], attachments: [] })
    renderForm()
    await waitFor(() => expect(applicationsApi.contentSuggestion).toHaveBeenCalled())
    await waitFor(() => expect(line()).toHaveTextContent('Vollständig: das ganze Stammprofil'))
    expect(line()).not.toHaveTextContent('Vorschlag zusammengestellt')
  })

  it('never changes an existing application by itself', async () => {
    const existing = { id: 'app1', jobTitle: 'Alt', company: 'Alt AG', status: 'draft', cvDesign: 'classic', cvLanguage: 'de', includeCoverSheet: true, attachmentIds: [], cvSelection: null } as unknown as Application
    renderForm(existing)
    await waitFor(() => expect(applicationsApi.contentSuggestion).toHaveBeenCalled())
    await waitFor(() => expect(profileApi.get).toHaveBeenCalled())
    expect(line()).toHaveTextContent('Vollständig: das ganze Stammprofil')
    expect(screen.getByRole('checkbox', { name: /Arbeitszeugnis Muster/ })).not.toBeChecked()
  })
})
