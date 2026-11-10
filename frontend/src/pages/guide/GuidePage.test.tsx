import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { ApiError } from '../../api/client'
import { profileApi } from '../../api/endpoints'
import type { GuideAnswers } from '../../api/types'
import { renderInApp } from '../../test/render'
import { GuidePage } from './GuidePage'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

// Calm motion in the test: no slides, so a step is there as soon as the previous one is gone.
const realMatchMedia = window.matchMedia
beforeEach(() => {
  window.matchMedia = ((query: string) => ({ ...realMatchMedia(query), matches: query.includes('prefers-reduced-motion') })) as typeof window.matchMedia
})
afterEach(() => {
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
})

const SAVED: GuideAnswers = { situation: 'working', yearsOfExperience: 12, plan: 'new_field', explain: ['gap'], region: 'de' }

function renderGuide(route = '/guide') {
  return renderInApp(
    <Routes>
      <Route path="/guide" element={<GuidePage />} />
    </Routes>,
    { route },
  )
}

const question = () => screen.findByTestId('guide-question')

async function choose(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('radio', { name: new RegExp(label) }))
}

describe('first visit', () => {
  it('shows the start screen with both ways in', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(null)
    renderGuide()
    expect(await screen.findByTestId('guide-intro')).toBeInTheDocument()
    expect(screen.getByTestId('guide-start')).toBeInTheDocument()
    expect(screen.getByTestId('guide-open-overview')).toBeInTheDocument()
  })

  it('leads a school leaver through three questions and saves the answers', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(null)
    const saved = vi.spyOn(profileApi, 'saveGuideAnswers').mockImplementation(async (body) => body)
    const user = userEvent.setup()
    renderGuide()

    await user.click(await screen.findByTestId('guide-start'))
    expect((await question()).textContent).toBe('Wo stehen Sie gerade?')
    // The question takes the focus, and next waits for an answer.
    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveFocus())
    expect(screen.getByTestId('guide-next')).toBeDisabled()
    expect(screen.getByTestId('guide-back')).toBeDisabled()

    await choose(user, 'Schule gerade abgeschlossen')
    expect(screen.getByTestId('guide-step-label')).toHaveTextContent('Frage 1 von 3')
    await user.click(screen.getByTestId('guide-next'))

    // Years and plan are left out for somebody who has just finished school.
    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Gibt es etwas zu erklären?'))
    expect(screen.getByTestId('guide-step-label')).toHaveTextContent('Frage 2 von 3')
    expect(screen.getByTestId('guide-next')).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /Nichts Besonderes/ }))
    await user.click(screen.getByTestId('guide-next'))

    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Wohin bewerben Sie sich?'))
    await choose(user, 'Deutschland')
    await user.click(screen.getByTestId('guide-next'))

    await waitFor(() => expect(saved).toHaveBeenCalledWith({ situation: 'school', yearsOfExperience: null, plan: 'first_job', explain: [], region: 'de' }))
    // The plan follows: school reports, and none of the advice for a long career.
    expect(await screen.findByTestId('guide-plan')).toBeInTheDocument()
    expect(screen.getByTestId('guide-item-att.school')).toBeInTheDocument()
    expect(screen.queryByTestId('guide-item-att.long')).not.toBeInTheDocument()
    expect(screen.queryByTestId('guide-block-sensitive')).not.toBeInTheDocument()
  })

  it('goes back to the start screen when cancelled', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(null)
    const user = userEvent.setup()
    renderGuide()
    await user.click(await screen.findByTestId('guide-start'))
    await question()
    await user.click(screen.getByTestId('guide-cancel'))
    expect(await screen.findByTestId('guide-intro')).toBeInTheDocument()
  })

  it('asks the years and the plan of somebody who has worked, and checks the number on every keystroke', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(null)
    const saved = vi.spyOn(profileApi, 'saveGuideAnswers').mockImplementation(async (body) => body)
    const user = userEvent.setup()
    renderGuide()
    await user.click(await screen.findByTestId('guide-start'))
    await question()
    await choose(user, 'Im Berufsleben')
    expect(screen.getByTestId('guide-step-label')).toHaveTextContent('Frage 1 von 5')
    await user.click(screen.getByTestId('guide-next'))

    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Wie lange sind Sie schon im Berufsleben?'))
    const field = screen.getByRole('textbox', { name: /Oder genaue Zahl/ })
    // An untouched empty field is calm.
    expect(screen.queryByText(/Bitte nur eine ganze Zahl/)).not.toBeInTheDocument()
    expect(screen.getByTestId('guide-next')).toBeDisabled()

    await user.type(field, 'ab')
    expect(await screen.findByText('Bitte nur eine ganze Zahl eingeben, zum Beispiel 7.')).toBeInTheDocument()
    expect(field).toBeInvalid()
    expect(screen.getByTestId('guide-next')).toBeDisabled()

    await user.clear(field)
    expect(await screen.findByText('Bitte eine Schnellwahl treffen oder eine Zahl eingeben.')).toBeInTheDocument()

    await user.type(field, '99')
    expect(await screen.findByText('Zu groß: höchstens 60 Jahre.')).toBeInTheDocument()

    // A quick choice fills the field; a typed number picks the matching quick choice.
    await choose(user, '2 bis 5 Jahre')
    expect(field).toHaveValue('3')
    expect(screen.getByTestId('guide-next')).toBeEnabled()
    await user.clear(field)
    await user.type(field, '12')
    expect(screen.getByRole('radio', { name: /10 bis 15 Jahre/ })).toBeChecked()
    expect(screen.queryByText(/Zu groß/)).not.toBeInTheDocument()
    await user.click(screen.getByTestId('guide-next'))

    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Was haben Sie vor?'))
    expect(screen.queryByRole('radio', { name: /Erste Stelle/ })).not.toBeInTheDocument()
    await choose(user, 'In einen anderen Beruf wechseln')
    await user.click(screen.getByTestId('guide-next'))

    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Gibt es etwas zu erklären?'))
    // "Nothing special" and a concrete point exclude each other.
    await user.click(screen.getByRole('checkbox', { name: /Lücke im Lebenslauf/ }))
    await user.click(screen.getByRole('checkbox', { name: /Elternzeit/ }))
    expect(screen.getByRole('checkbox', { name: /Nichts Besonderes/ })).not.toBeChecked()
    await user.click(screen.getByRole('checkbox', { name: /Nichts Besonderes/ }))
    expect(screen.getByRole('checkbox', { name: /Nichts Besonderes/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Lücke im Lebenslauf/ })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Elternzeit/ })).not.toBeChecked()
    // Clicking "nothing special" again takes the answer back; a concrete point replaces it.
    await user.click(screen.getByRole('checkbox', { name: /Nichts Besonderes/ }))
    expect(screen.getByTestId('guide-next')).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /Lücke im Lebenslauf/ }))
    await user.click(screen.getByRole('checkbox', { name: /Elternzeit/ }))
    // Taking the last point away leaves the question open again.
    await user.click(screen.getByRole('checkbox', { name: /Elternzeit/ }))
    expect(screen.getByTestId('guide-next')).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: /Lücke im Lebenslauf/ }))
    expect(screen.getByTestId('guide-next')).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /Lücke im Lebenslauf/ }))
    await user.click(screen.getByRole('checkbox', { name: /Elternzeit/ }))
    await user.click(screen.getByTestId('guide-next'))

    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Wohin bewerben Sie sich?'))
    await choose(user, 'Großbritannien')
    await user.click(screen.getByTestId('guide-next'))

    await waitFor(() => expect(saved).toHaveBeenCalledWith({ situation: 'working', yearsOfExperience: 12, plan: 'new_field', explain: ['gap', 'parental_leave'], region: 'uk' }))
  })

  it('goes back one question with its answer still in place', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(null)
    const user = userEvent.setup()
    renderGuide()
    await user.click(await screen.findByTestId('guide-start'))
    await question()
    await choose(user, 'Schule gerade abgeschlossen')
    await user.click(screen.getByTestId('guide-next'))
    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Gibt es etwas zu erklären?'))
    await user.click(screen.getByTestId('guide-back'))
    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Wo stehen Sie gerade?'))
    expect(screen.getByRole('radio', { name: /Schule gerade abgeschlossen/ })).toBeChecked()
  })

  it('reports a failed save in full and keeps the answers', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(null)
    vi.spyOn(profileApi, 'saveGuideAnswers').mockRejectedValue(new ApiError(500, { status: 500, title: 'Fehler', detail: 'Datenbank gesperrt' }))
    const user = userEvent.setup()
    renderGuide()
    await user.click(await screen.findByTestId('guide-start'))
    await question()
    await choose(user, 'Schule gerade abgeschlossen')
    await user.click(screen.getByTestId('guide-next'))
    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Gibt es etwas zu erklären?'))
    await user.click(screen.getByRole('checkbox', { name: /Nichts Besonderes/ }))
    await user.click(screen.getByTestId('guide-next'))
    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Wohin bewerben Sie sich?'))
    await choose(user, 'USA')
    await user.click(screen.getByTestId('guide-next'))

    const dialog = await screen.findByTestId('error-dialog')
    expect(within(dialog).getByText(/Datenbank gesperrt/)).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Ihre Antworten konnten nicht gespeichert werden.')
    // The wizard is still there with its answers.
    expect(screen.getByTestId('guide-wizard')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /USA/ })).toBeChecked()
  })
})

describe('later visits', () => {
  it('show the plan for the saved answers straight away', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(SAVED)
    renderGuide()
    expect(await screen.findByTestId('guide-plan')).toBeInTheDocument()
    expect(screen.queryByTestId('guide-intro')).not.toBeInTheDocument()
    expect(screen.getByTestId('guide-answers-summary')).toHaveTextContent('Berufswechsel')
    expect(screen.getByTestId('guide-answers-summary')).toHaveTextContent('12 Jahre Berufserfahrung')
    // Long career, change of career, gap ticked: exactly those blocks and items.
    expect(screen.getByTestId('guide-item-cl.switchReason')).toBeInTheDocument()
    expect(screen.getByTestId('guide-item-sens.gap')).toBeInTheDocument()
    expect(screen.queryByTestId('guide-item-sens.illness')).not.toBeInTheDocument()
    expect(screen.getByTestId('guide-item-att.long')).toBeInTheDocument()
    expect(screen.queryByTestId('guide-item-att.school')).not.toBeInTheDocument()
  })

  it('mark a rule of thumb and a dispute as such, in words', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(SAVED)
    renderGuide()
    const rule = await screen.findByTestId('guide-item-trim.long')
    expect(within(rule).getByText('Faustregel')).toBeInTheDocument()
    const dispute = screen.getByTestId('guide-item-cv.lengthLong')
    expect(within(dispute).getByText('Quellen uneinig')).toBeInTheDocument()
    expect(screen.getByText('Orientierung, keine Rechtsberatung.')).toBeInTheDocument()
  })

  it('lead each block to a place in the app', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(SAVED)
    renderGuide()
    await screen.findByTestId('guide-plan')
    const trim = screen.getByTestId('guide-block-trim')
    expect(within(trim).getByTestId('guide-link-profileExperiences')).toHaveAttribute('href', '/profile?tab=experiences')
    expect(within(screen.getByTestId('guide-block-coverLetter')).getByTestId('guide-link-coverLetters')).toHaveAttribute('href', '/cover-letters')
    expect(within(screen.getByTestId('guide-block-attachments')).getByTestId('guide-link-applications')).toHaveAttribute('href', '/applications')
  })

  it('open the pension insurance pages in the browser, for Germany only', async () => {
    const get = vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(SAVED)
    const { unmount } = renderGuide()
    const request = await screen.findByTestId('guide-external-drvRequest')
    expect(request).toHaveAttribute('href', 'https://www.deutsche-rentenversicherung.de/DRV/DE/Online-Services/informationen_anfordern')
    expect(request).toHaveAttribute('target', '_blank')
    expect(request.getAttribute('rel')).toContain('noopener')
    expect(screen.getByTestId('guide-external-drvGlossary')).toHaveAttribute('href', 'https://www.deutsche-rentenversicherung.de/SharedDocs/Glossareintraege/DE/V/versicherungsverlauf')
    unmount()

    get.mockResolvedValue({ ...SAVED, region: 'uk' })
    renderGuide()
    await screen.findByTestId('guide-plan')
    expect(screen.queryByTestId('guide-external-drvRequest')).not.toBeInTheDocument()
    expect(screen.getByTestId('guide-block-region')).toBeInTheDocument()
  })

  it('open the wizard with the saved answers and a cancel that returns to the plan', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(SAVED)
    const user = userEvent.setup()
    renderGuide()
    await user.click(await screen.findByTestId('guide-change'))
    await question()
    expect(screen.getByRole('radio', { name: /Im Berufsleben/ })).toBeChecked()
    await user.click(screen.getByTestId('guide-next'))
    await waitFor(() => expect(screen.getByTestId('guide-question')).toHaveTextContent('Wie lange sind Sie schon im Berufsleben?'))
    expect(screen.getByRole('textbox', { name: /Oder genaue Zahl/ })).toHaveValue('12')
    expect(screen.getByRole('radio', { name: /10 bis 15 Jahre/ })).toBeChecked()
    await user.click(screen.getByTestId('guide-cancel'))
    expect(await screen.findByTestId('guide-plan')).toBeInTheDocument()
  })

  it('say when the saved answers cannot be loaded, in full, with a way to try again', async () => {
    const get = vi.spyOn(profileApi, 'getGuideAnswers').mockRejectedValue(new ApiError(500, { status: 500, title: 'Fehler', detail: 'Datenbank gesperrt' }))
    const user = userEvent.setup()
    renderGuide()
    const notice = await screen.findByTestId('error-notice')
    expect(notice).toHaveTextContent('Ihre gespeicherten Antworten konnten nicht geladen werden.')
    get.mockResolvedValue(null)
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByTestId('guide-intro')).toBeInTheDocument()
  })
})

describe('all situations', () => {
  it('can be read without any answer, one tab per situation', async () => {
    const get = vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(null)
    const user = userEvent.setup()
    renderGuide()
    await user.click(await screen.findByTestId('guide-open-overview'))
    expect(await screen.findByTestId('guide-overview')).toBeInTheDocument()
    expect(get).toHaveBeenCalled()
    // The first tab is the school leaver: school reports, no long-career advice.
    expect(screen.getByTestId('guide-item-att.school')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Schule abgeschlossen' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Lange Berufserfahrung' }))
    expect(await screen.findByTestId('guide-item-att.long')).toBeInTheDocument()
    expect(screen.queryByTestId('guide-item-att.school')).not.toBeInTheDocument()

    // The tab about delicate points shows that block only, with all six points.
    await user.click(screen.getByRole('tab', { name: 'Heikle Punkte' }))
    expect(await screen.findByTestId('guide-block-sensitive')).toBeInTheDocument()
    expect(screen.queryByTestId('guide-block-trim')).not.toBeInTheDocument()
    expect(screen.getByTestId('guide-item-sens.dropped_out')).toBeInTheDocument()
    expect(screen.getByTestId('guide-item-sens.frequent_changes')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'USA' }))
    expect(await screen.findByTestId('guide-item-region.usTerm')).toBeInTheDocument()

    await user.click(screen.getByTestId('guide-overview-back'))
    expect(await screen.findByTestId('guide-intro')).toBeInTheDocument()
  })

  it('open from the plan too', async () => {
    vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue(SAVED)
    const user = userEvent.setup()
    renderGuide()
    await user.click(await screen.findByTestId('guide-open-overview'))
    expect(await screen.findByTestId('guide-overview')).toBeInTheDocument()
    await user.click(screen.getByTestId('guide-overview-back'))
    expect(await screen.findByTestId('guide-plan')).toBeInTheDocument()
  })
})

describe('in English', () => {
  it('shows the English texts', async () => {
    await i18n.changeLanguage('en')
    try {
      vi.spyOn(profileApi, 'getGuideAnswers').mockResolvedValue({ ...SAVED, region: 'us', explain: [] })
      renderGuide()
      expect(await screen.findByText('Your application plan')).toBeInTheDocument()
      expect(screen.getByTestId('guide-item-region.usTerm')).toHaveTextContent('resume')
      expect(screen.getByRole('button', { name: 'Change answers' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('de')
    }
  })
})
