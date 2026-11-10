import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { LANGUAGES } from './labels'
import { apiOk, expectNothingMoves, openAs, settledLayout } from './support'

// What goes into the CV of one application: a new application is put together from the suggestion of the app, the person corrects it,
// an existing application is never changed by itself, and an application without a selection behaves as before. The suggestion of the server is replaced by a fixed answer, so the test checks the
// screens and the saving, not the rules of the server. Every test has an account of its own.
test.use({ viewport: { width: 1024, height: 768 } })

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path = '/applications') => openAs(member.page, DISPLAY_NAME, path)

interface Created {
  id: string
}
interface StoredApplication {
  id: string
  jobTitle: string
  cvSelection: unknown
}

/** Invented profile entries; returns their ids so the fixed suggestion can name them. */
async function createProfile(member: Member) {
  const { page } = member
  const recent = await apiOk<Created>(page, 'POST', '/api/profile/experiences', { jobTitle: 'Entwicklerin', employer: 'Muster GmbH', startDate: '2019-04', isCurrent: true, description: 'Aufgaben', sortOrder: 0 })
  const older = await apiOk<Created>(page, 'POST', '/api/profile/experiences', { jobTitle: 'Berater', employer: 'Alt AG', startDate: '2004-01', endDate: '2008-01', isCurrent: false, description: 'Beratung', sortOrder: 1 })
  const internship = await apiOk<Created>(page, 'POST', '/api/profile/experiences', { jobTitle: 'Praktikantin', employer: 'Klein KG', startDate: '2003-01', endDate: '2003-03', isCurrent: false, sortOrder: 2 })
  const degree = await apiOk<Created>(page, 'POST', '/api/profile/educations', { degree: 'Bachelor Informatik', institution: 'Musterhochschule', startDate: '2008-10', endDate: '2012-02', isCurrent: false, sortOrder: 0 })
  const school = await apiOk<Created>(page, 'POST', '/api/profile/educations', { degree: 'Abitur', institution: 'Musterschule', startDate: '1996-08', endDate: '2004-06', isCurrent: false, sortOrder: 1 })
  const certificate = await apiOk<Created>(page, 'POST', '/api/profile/certificates', { title: 'Netzwerk-Zertifikat', issuer: 'Muster-Institut', issueDate: '2011-05', sortOrder: 0 })
  return { recent, older, internship, degree, school, certificate }
}

type Profile = Awaited<ReturnType<typeof createProfile>>

const suggestionFor = (p: Profile) => ({
  yearsOfExperience: 14,
  stage: 'long',
  experiences: [
    { id: p.recent.id, suggestion: 'full', reason: 'recent' },
    { id: p.older.id, suggestion: 'short', reason: 'older_than_10_years' },
    { id: p.internship.id, suggestion: 'hidden', reason: 'old_internship' },
  ],
  educations: [
    { id: p.degree.id, suggestion: 'full', reason: 'highest' },
    { id: p.school.id, suggestion: 'short', reason: 'school' },
  ],
  certificates: [{ id: p.certificate.id, suggestion: 'hidden', reason: 'older_than_10_years' }],
  attachments: [],
  checklist: [
    { key: 'cover_letter', state: 'ok' },
    { key: 'cv', state: 'ok' },
    { key: 'work_references', state: 'optional' },
    { key: 'highest_degree', state: 'missing' },
    { key: 'certificates', state: 'optional' },
    { key: 'photo', state: 'optional' },
  ],
})

/** The server answers `null` for the complete profile; an empty selection means the same. */
const isComplete = (value: unknown) =>
  value === null ||
  value === undefined ||
  Object.values(value as Record<string, unknown[] | Record<string, unknown>>).every((part) => (Array.isArray(part) ? part.length === 0 : Object.keys(part).length === 0))

for (const language of LANGUAGES) {
  test.describe(language, () => {
    test.use({ language })

    test('a new application is put together from the suggestion, the person corrects it, it is saved and shown, and "everything complete" clears it', async ({ member }) => {
      const { page, t } = member
      const profile = await createProfile(member)
      await page.route('**/api/applications/content-suggestion', (route) => route.fulfill({ json: suggestionFor(profile) }))
      await open(member)
      await page.getByRole('button', { name: t('applications.newApplication') }).first().click()
      const form = page.getByRole('dialog', { name: t('applications.createTitle') })
      await form.getByLabel(t('applications.fields.jobTitle'), { exact: true }).fill('Teamleiterin IT')
      await form.getByLabel(t('applications.fields.company'), { exact: true }).fill('Auswahl AG')

      // Without a click the form already holds the suggestion and says so before anything is saved
      const summary = form.getByTestId('cv-content-summary')
      const suggested = [
        t('applications.content.summary.experiencesShort_one', { count: 1 }),
        t('applications.content.summary.experiencesHidden_one', { count: 1 }),
        t('applications.content.summary.educationsShort_one', { count: 1 }),
        t('applications.content.summary.certificatesHidden_one', { count: 1 }),
      ].join(', ')
      await expect(summary).toContainText(suggested)
      // The announcement names who put it together (the product name is a variable of the text, so only the rest is compared)
      await expect(summary).toContainText(t('applications.content.auto', { summary: '' }).replace('{{product}}', '').trim())
      await form.getByRole('button', { name: t('applications.content.open') }).click()
      const content = page.getByRole('dialog', { name: t('applications.content.title') })
      const level = (title: string, name: string) => content.getByRole('radiogroup', { name: t('applications.content.levelFor', { title }) }).getByRole('radio', { name })
      await expect(level('Berater', t('applications.content.levels.short'))).toHaveAttribute('aria-checked', 'true')
      await expect(level('Praktikantin', t('applications.content.levels.hidden'))).toHaveAttribute('aria-checked', 'true')
      await expect(level('Abitur', t('applications.content.levels.short'))).toHaveAttribute('aria-checked', 'true')
      await expect(level('Entwicklerin', t('applications.content.levels.full'))).toHaveAttribute('aria-checked', 'true')
      await expect(content.getByRole('switch', { name: 'Netzwerk-Zertifikat' })).toHaveAttribute('aria-checked', 'false')
      // The reason is shown with every suggestion, and nothing differs yet
      const olderReason = t('applications.content.suggestionLine', {
        level: t('applications.content.levels.short'),
        reason: t('applications.content.reasons.experience.older_than_10_years'),
      })
      await expect(content.getByText(olderReason)).toBeVisible()
      await expect(content.getByText(t('applications.content.differs'), { exact: true })).toHaveCount(0)
      await expect(content.getByTestId('checklist-highest_degree').getByText(t('applications.content.checklist.states.missing'))).toBeVisible()

      // Correcting: a value that differs from the suggestion is marked
      await level('Praktikantin', t('applications.content.levels.full')).click()
      await expect(content.getByText(t('applications.content.differs'), { exact: true })).toHaveCount(1)
      await content.getByRole('button', { name: t('applications.content.done') }).click()
      await expect(content).toBeHidden()

      // Once something was changed, the line just tells what the CV takes
      const expected = [
        t('applications.content.summary.experiencesShort_one', { count: 1 }),
        t('applications.content.summary.educationsShort_one', { count: 1 }),
        t('applications.content.summary.certificatesHidden_one', { count: 1 }),
      ].join(', ')
      await expect(summary).toHaveText(expected)

      await form.getByRole('button', { name: t('applications.actions.save') }).click()
      const details = page.getByRole('dialog', { name: 'Teamleiterin IT – Auswahl AG' })
      await expect(details).toBeVisible()
      await expect(details.getByTestId('cv-adjusted')).toContainText(expected)
      const stored = (await apiOk<StoredApplication[]>(page, 'GET', '/api/applications')).find((entry) => entry.jobTitle === 'Teamleiterin IT')!
      const saved = await apiOk<StoredApplication>(page, 'GET', `/api/applications/${stored.id}`)
      expect(saved.cvSelection).toEqual({
        experiences: { [profile.older.id]: 'short' },
        educations: { [profile.school.id]: 'short' },
        certificates: { [profile.certificate.id]: 'hidden' },
        hiddenSections: [],
      })

      // Opened again, the form shows the saved choice and does NOT put the suggestion on top of it; "everything complete" clears it
      await details.getByRole('button', { name: t('applications.actions.edit') }).click()
      const edit = page.getByRole('dialog', { name: t('applications.editTitle') })
      await expect(edit.getByTestId('cv-content-summary')).toHaveText(expected)
      await edit.getByRole('button', { name: t('applications.content.actions.reset') }).click()
      await expect(edit.getByTestId('cv-content-summary')).toHaveText(t('applications.content.summary.complete'))
      await edit.getByRole('button', { name: t('applications.actions.save') }).click()
      await expect(edit).toBeHidden()
      await expect(details.getByTestId('cv-adjusted')).toHaveCount(0)
      expect(isComplete((await apiOk<StoredApplication>(page, 'GET', `/api/applications/${stored.id}`)).cvSelection)).toBe(true)
    })

    test('an existing application is never changed by the suggestion; "Take suggestion" in the content dialog does it on a click', async ({ member }) => {
      const { page, t } = member
      const profile = await createProfile(member)
      await page.route('**/api/applications/content-suggestion', (route) => route.fulfill({ json: suggestionFor(profile) }))
      await apiOk(page, 'POST', '/api/applications', { jobTitle: 'Entwicklerin', company: 'Muster GmbH', status: 'draft' })
      await open(member)
      await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
      const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
      await details.getByRole('button', { name: t('applications.actions.edit') }).click()
      const edit = page.getByRole('dialog', { name: t('applications.editTitle') })
      const summary = edit.getByTestId('cv-content-summary')
      await expect(summary).toHaveText(t('applications.content.summary.complete'))
      await edit.getByRole('button', { name: t('applications.content.open') }).click()
      const content = page.getByRole('dialog', { name: t('applications.content.title') })
      const olderReason = t('applications.content.suggestionLine', {
        level: t('applications.content.levels.short'),
        reason: t('applications.content.reasons.experience.older_than_10_years'),
      })
      // The suggestion is shown, the values are not touched
      await expect(content.getByText(olderReason)).toBeVisible()
      await expect(content.getByRole('radiogroup', { name: t('applications.content.levelFor', { title: 'Berater' }) }).getByRole('radio', { name: t('applications.content.levels.full') })).toHaveAttribute('aria-checked', 'true')
      await content.getByRole('button', { name: t('applications.content.actions.take') }).click()
      await expect(content.getByRole('radiogroup', { name: t('applications.content.levelFor', { title: 'Berater' }) }).getByRole('radio', { name: t('applications.content.levels.short') })).toHaveAttribute('aria-checked', 'true')
      await content.getByRole('button', { name: t('applications.content.done') }).click()
      await expect(summary).not.toHaveText(t('applications.content.summary.complete'))
    })

    test('without a suggestion the application stays complete and the form says so calmly', async ({ member }) => {
      const { page, t } = member
      await page.route('**/api/applications/content-suggestion', (route) => route.fulfill({ status: 500, json: { status: 500, code: 'internal', detail: 'kaputt' } }))
      await open(member)
      await page.getByRole('button', { name: t('applications.newApplication') }).first().click()
      const form = page.getByRole('dialog', { name: t('applications.createTitle') })
      await expect(form.getByTestId('cv-content-summary')).toHaveText(t('applications.content.noSuggestion'), { timeout: 30_000 })
      await form.getByLabel(t('applications.fields.jobTitle'), { exact: true }).fill('Ohne Vorschlag')
      await form.getByLabel(t('applications.fields.company'), { exact: true }).fill('Leer AG')
      await form.getByRole('button', { name: t('applications.actions.save') }).click()
      await expect(page.getByRole('dialog', { name: 'Ohne Vorschlag – Leer AG' })).toBeVisible()
      const stored = (await apiOk<StoredApplication[]>(page, 'GET', '/api/applications')).find((entry) => entry.jobTitle === 'Ohne Vorschlag')!
      expect(isComplete((await apiOk<StoredApplication>(page, 'GET', `/api/applications/${stored.id}`)).cvSelection)).toBe(true)
    })

    test('an application without a selection stays complete: nothing is marked as adjusted', async ({ member }) => {
      const { page, t } = member
      await apiOk(page, 'POST', '/api/applications', { jobTitle: 'Entwicklerin', company: 'Muster GmbH', status: 'draft' })
      await open(member)
      await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
      const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
      await expect(details.getByTestId('cv-adjusted')).toHaveCount(0)
      await details.getByRole('tab', { name: new RegExp(t('applications.dossier.title')) }).click()
      await expect(details.getByText(t('applications.content.summary.complete'))).toBeVisible()
    })

    test('the suggestion arriving moves nothing in the form or in the content dialog', async ({ member }) => {
      const { page, t } = member
      const profile = await createProfile(member)
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/applications/content-suggestion', async (route) => {
        await gate
        await route.fulfill({ json: suggestionFor(profile) })
      })
      await open(member)
      await page.getByRole('button', { name: t('applications.newApplication') }).first().click()
      const form = page.getByRole('dialog', { name: t('applications.createTitle') })
      const summary = form.getByTestId('cv-content-summary')
      await expect(summary).toHaveText(t('applications.content.summary.complete'))
      const beforeForm = await settledLayout(page)

      // The form puts the new application together: the line grows from one line to the announcement, nothing else moves
      await expectNothingMoves(
        page,
        'the suggestion filling a new application',
        async () => {
          release()
          await expect(summary).toContainText(t('applications.content.summary.experiencesShort_one', { count: 1 }))
        },
        beforeForm,
      )

      await form.getByRole('button', { name: t('applications.content.open') }).click()
      const content = page.getByRole('dialog', { name: t('applications.content.title') })
      await expect(content.getByTestId('checklist-cv').getByText(t('applications.content.checklist.states.ok'))).toBeVisible()
      const before = await settledLayout(page)
      await expectNothingMoves(
        page,
        'changing a value (it differs from the suggestion now) and the line behind it changing',
        async () => {
          await content.getByRole('radiogroup', { name: t('applications.content.levelFor', { title: 'Berater' }) }).getByRole('radio', { name: t('applications.content.levels.hidden') }).click()
          await expect(content.getByText(t('applications.content.differs'), { exact: true })).toHaveCount(1)
        },
        before,
      )
    })
  })
}
