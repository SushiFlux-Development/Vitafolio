import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { useState } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { applicationsApi, profileApi, publicApi } from '../../api/endpoints'
import type { ContentSuggestion, CvSelection, Profile } from '../../api/types'
import { renderInApp } from '../../test/render'
import { versionOf } from '../../test/fixtures'
import { CvContentDialog } from './CvContentDialog'
import { applySuggestion, EMPTY_SELECTION } from './cvSelection'
import { useContentSuggestion } from './queries'

vi.mock('../../api/endpoints', () => ({
  profileApi: { get: vi.fn() },
  applicationsApi: { contentSuggestion: vi.fn() },
  publicApi: { version: vi.fn() },
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

// Invented data only.
const profile = {
  id: 'p1',
  firstName: 'Erika',
  lastName: 'Mustermann',
  bio: 'Ein Kurzprofil',
  experiences: [
    { id: 'e1', jobTitle: 'Teamleiterin IT', employer: 'Muster GmbH', startDate: '2020-01', endDate: null, isCurrent: true, sortOrder: 0 },
    { id: 'e2', jobTitle: 'Systemadministratorin', employer: 'Alt AG', startDate: '2008-03', endDate: '2012-06', isCurrent: false, sortOrder: 1 },
    { id: 'e3', jobTitle: 'Praktikantin', employer: 'Klein KG', startDate: '2006-01', endDate: '2006-03', isCurrent: false, sortOrder: 2 },
  ],
  educations: [
    { id: 'd1', degree: 'Bachelor Informatik', institution: 'Musterhochschule', startDate: '2004-10', endDate: '2008-02', isCurrent: false, sortOrder: 0 },
    { id: 'd2', degree: 'Abitur', institution: 'Musterschule', startDate: '1996-08', endDate: '2004-06', isCurrent: false, sortOrder: 1 },
  ],
  skills: [{ id: 's1', name: 'Linux', level: 4, sortOrder: 0 }],
  languages: [],
  certificates: [{ id: 'c1', title: 'Netzwerk-Zertifikat', issuer: 'Muster-Institut', issueDate: '2011-05', sortOrder: 0 }],
  interests: [],
  customSections: [{ id: 'g1', title: 'Ehrenamt', sortOrder: 0, items: [] }],
} as unknown as Profile

const suggestion: ContentSuggestion = {
  yearsOfExperience: 14,
  stage: 'long',
  experiences: [
    { id: 'e1', suggestion: 'full', reason: 'recent' },
    { id: 'e2', suggestion: 'short', reason: 'older_than_10_years' },
    { id: 'e3', suggestion: 'hidden', reason: 'some_future_reason' },
  ],
  educations: [
    { id: 'd1', suggestion: 'full', reason: 'highest' },
    { id: 'd2', suggestion: 'short', reason: 'school' },
  ],
  certificates: [{ id: 'c1', suggestion: 'hidden', reason: 'older_than_10_years' }],
  attachments: [],
  checklist: [
    { key: 'cover_letter', state: 'ok' },
    { key: 'highest_degree', state: 'missing' },
    { key: 'photo', state: 'a_new_state' as never },
    { key: 'something_new', state: 'optional' },
  ],
}

function Harness({ onLeave = vi.fn() }: { onLeave?: () => void }) {
  const [selection, setSelection] = useState<CvSelection>(EMPTY_SELECTION)
  const content = useContentSuggestion(true)
  const take = (s: ContentSuggestion) => setSelection((previous) => applySuggestion(previous, s))
  return (
    <>
      <CvContentDialog open onClose={vi.fn()} selection={selection} onChange={setSelection} suggestion={content} onTakeSuggestion={take} onLeave={onLeave} />
      <output data-testid="selection">{JSON.stringify(selection)}</output>
    </>
  )
}

const chosen = () => JSON.parse(screen.getByTestId('selection').textContent ?? '{}') as CvSelection
const levelGroup = (title: string) => screen.getByRole('radiogroup', { name: `Darstellung von ${title}` })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(publicApi.version).mockResolvedValue(versionOf('v2026.11.12 (13.557)'))
  vi.mocked(profileApi.get).mockResolvedValue(profile)
  vi.mocked(applicationsApi.contentSuggestion).mockResolvedValue(suggestion)
})

describe('CvContentDialog', () => {
  it('lists every station, education, certificate and section of the profile, all in full until the person decides', async () => {
    renderInApp(<Harness />)
    expect(await screen.findByText('Teamleiterin IT')).toBeInTheDocument()
    expect(screen.getByText('Abitur')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Netzwerk-Zertifikat' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: 'Ehrenamt' })).toHaveAttribute('aria-checked', 'true')
    expect(within(levelGroup('Systemadministratorin')).getByRole('radio', { name: 'Ausführlich' })).toHaveAttribute('aria-checked', 'true')
    expect(chosen()).toEqual(EMPTY_SELECTION)
  })

  it('changes nothing by itself: the suggestion is only shown, and applied by a click', async () => {
    renderInApp(<Harness />)
    await screen.findByText('Teamleiterin IT')
    await waitFor(() => expect(screen.getByText(/Vorschlag: Kurz\. Endete vor über 10 Jahren/)).toBeInTheDocument())
    expect(chosen()).toEqual(EMPTY_SELECTION)
  })

  it('takes the suggestion on a click, keeps every value editable, marks a value that differs and resets to complete', async () => {
    const user = userEvent.setup()
    renderInApp(<Harness />)
    await screen.findByText('Teamleiterin IT')
    await user.click(screen.getByRole('button', { name: 'Vorschlag übernehmen' }))
    await waitFor(() => expect(chosen().experiences).toEqual({ e2: 'short', e3: 'hidden' }))
    expect(chosen().educations).toEqual({ d2: 'short' })
    expect(chosen().certificates).toEqual({ c1: 'hidden' })
    expect(screen.getByRole('switch', { name: 'Netzwerk-Zertifikat' })).toHaveAttribute('aria-checked', 'false')
    expect(within(levelGroup('Systemadministratorin')).getByRole('radio', { name: 'Kurz' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText('Weicht ab')).not.toBeInTheDocument()

    await user.click(within(levelGroup('Systemadministratorin')).getByRole('radio', { name: 'Weglassen' }))
    expect(chosen().experiences.e2).toBe('hidden')
    expect(screen.getByText('Weicht ab')).toBeInTheDocument()
    expect(screen.getByTestId('cv-content-result')).toHaveTextContent('2 Stationen weggelassen, 1 Ausbildung gekürzt')

    await user.click(screen.getByRole('switch', { name: 'Netzwerk-Zertifikat' }))
    expect(chosen().certificates).toEqual({})
    expect(screen.getAllByText('Weicht ab')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Alles vollständig' }))
    expect(chosen()).toEqual(EMPTY_SELECTION)
    expect(screen.getByTestId('cv-content-result')).toHaveTextContent('Vollständig: das ganze Stammprofil')
  })

  it('shows a general text for a reason it does not know instead of failing', async () => {
    renderInApp(<Harness />)
    await screen.findByText('Teamleiterin IT')
    await waitFor(() => expect(screen.getByText(/Vorschlag: Weglassen\. Empfehlung der App/)).toBeInTheDocument())
  })

  it('shows the checklist with a state for each point, and survives a state and a point it does not know', async () => {
    renderInApp(<Harness />)
    await screen.findByText('Teamleiterin IT')
    const letter = await screen.findByTestId('checklist-cover_letter')
    await waitFor(() => expect(within(letter).getByText('Vorhanden')).toBeInTheDocument())
    expect(within(screen.getByTestId('checklist-highest_degree')).getByText('Fehlt')).toBeInTheDocument()
    expect(within(screen.getByTestId('checklist-photo')).getByText('Freiwillig')).toBeInTheDocument()
    expect(within(screen.getByTestId('checklist-something_new')).getByText('Freiwillig')).toBeInTheDocument()
  })

  it('reports a suggestion that cannot be loaded completely, and leaves the selection alone', async () => {
    vi.mocked(applicationsApi.contentSuggestion).mockRejectedValue(new ApiError(500, { status: 500, detail: 'Server kaputt' }))
    const user = userEvent.setup()
    renderInApp(<Harness />)
    await screen.findByText('Teamleiterin IT')
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Der Vorschlag konnte nicht geladen werden'))
    await user.click(screen.getByRole('button', { name: 'Vorschlag übernehmen' }))
    expect(await screen.findByTestId('error-dialog')).toBeInTheDocument()
    expect(chosen()).toEqual(EMPTY_SELECTION)
  })

  it('leads to the guide page through the form, which asks first when something is unsaved', async () => {
    const onLeave = vi.fn()
    const user = userEvent.setup()
    renderInApp(<Harness onLeave={onLeave} />)
    await screen.findByText('Teamleiterin IT')
    await user.click(screen.getByRole('link', { name: /Angaben im Ratgeber anpassen/ }))
    expect(onLeave).toHaveBeenCalledOnce()
  })
})
