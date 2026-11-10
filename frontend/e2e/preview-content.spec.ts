import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { LANGUAGES } from './labels'
import { apiOk, expectNothingMoves, openAs, settledLayout } from './support'

// "Preview & export" of the master profile shows only what is still relevant for the person (the suggestion of the app, with its
// reason); what is left out is listed with a button to show it again - for example a school certificate - and a change is saved first,
// then the preview renders again. The suggestion of the server is replaced by a fixed answer, so this checks the screens, the
// saving and the order of the requests, not the rules of the server. Every test has an account of its own.
test.use({ viewport: { width: 1024, height: 768 } })

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member) => openAs(member.page, DISPLAY_NAME, '/profile?tab=preview')

interface Created {
  id: string
}
interface Settings {
  useSuggestion: boolean
  overrides: { experiences: Record<string, string>; educations: Record<string, string>; certificates: Record<string, string>; hiddenSections: string[] }
}

/** Invented entries: a current job, an old job (shortened by the suggestion) and a school certificate (left out by it). */
async function createProfile(member: Member) {
  const { page } = member
  const recent = await apiOk<Created>(page, 'POST', '/api/profile/experiences', { jobTitle: 'Entwicklerin', employer: 'Muster GmbH', startDate: '2019-04', isCurrent: true, sortOrder: 0 })
  const older = await apiOk<Created>(page, 'POST', '/api/profile/experiences', { jobTitle: 'Berater', employer: 'Alt AG', startDate: '2001-01', endDate: '2004-01', isCurrent: false, description: 'Beratung', sortOrder: 1 })
  const degree = await apiOk<Created>(page, 'POST', '/api/profile/educations', { degree: 'Bachelor Informatik', institution: 'Musterhochschule', startDate: '2008-10', endDate: '2012-02', isCurrent: false, sortOrder: 0 })
  const school = await apiOk<Created>(page, 'POST', '/api/profile/educations', { degree: 'Realschulabschluss', institution: 'Musterschule', startDate: '1996', endDate: '2002', isCurrent: false, sortOrder: 1 })
  return { recent, older, degree, school }
}

type Profile = Awaited<ReturnType<typeof createProfile>>

const suggestionFor = (p: Profile) => ({
  yearsOfExperience: 14,
  stage: 'long',
  experiences: [
    { id: p.recent.id, suggestion: 'full', reason: 'recent' },
    { id: p.older.id, suggestion: 'short', reason: 'older_than_10_years' },
  ],
  educations: [
    { id: p.degree.id, suggestion: 'full', reason: 'highest' },
    { id: p.school.id, suggestion: 'hidden', reason: 'below_highest_degree' },
  ],
  certificates: [],
  attachments: [],
  checklist: [],
})

const settingsOf = (member: Member) => apiOk<{ cvContentSettings?: Settings | null }>(member.page, 'GET', '/api/profile').then((profile) => profile.cvContentSettings)

for (const language of LANGUAGES) {
  test.describe(language, () => {
    test.use({ language })

    test('the content block says what is left out and why; showing the school certificate again is saved first, then the preview renders again; every render and export asks for the selection', async ({ member }) => {
      const { page, t } = member
      const profile = await createProfile(member)
      await page.route('**/api/applications/content-suggestion', (route) => route.fulfill({ json: suggestionFor(profile) }))
      // The order of the requests that matter: the saving of the settings and the pictures of the preview
      const requests: string[] = []
      const bodies: unknown[] = []
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname
        if (request.method() === 'PUT' && path === '/api/profile/cv-content-settings') requests.push('save')
        if (request.method() === 'POST' && path === '/api/profile/preview/pdf') {
          requests.push('preview')
          bodies.push(request.postDataJSON())
        }
      })
      await open(member)

      const block = page.getByTestId('preview-content')
      await expect(block.getByTestId('preview-content-summary')).toHaveText(
        [t('profile.preview.content.summary.hidden_one', { count: 1 }), t('profile.preview.content.summary.short_one', { count: 1 })].join(', '),
      )
      const schoolRow = block.getByTestId(`content-row-${profile.school.id}`)
      await expect(schoolRow).toContainText('Realschulabschluss')
      await expect(schoolRow).toContainText(t('applications.content.reasons.education.below_highest_degree'))
      await expect(block.getByTestId(`content-row-${profile.older.id}`)).toContainText(t('applications.content.reasons.experience.older_than_10_years'))
      expect(bodies.length).toBeGreaterThan(0)
      expect(bodies.every((body) => (body as { applySelection?: boolean }).applySelection === true)).toBe(true)

      // Showing it again: saved first, then a new picture
      requests.length = 0
      await schoolRow.getByRole('button', { name: new RegExp(t('profile.preview.content.show')) }).click()
      await expect.poll(async () => (await settingsOf(member))?.overrides.educations[profile.school.id]).toBe('full')
      await expect.poll(() => requests.includes('preview')).toBe(true)
      expect(requests.indexOf('save')).toBeGreaterThanOrEqual(0)
      expect(requests.indexOf('save')).toBeLessThan(requests.indexOf('preview'))
      // The entry stays in the list as one shown against the suggestion, with the way back
      await expect(schoolRow.getByRole('button', { name: new RegExp(t('profile.preview.content.follow')) })).toBeVisible()
      await schoolRow.getByRole('button', { name: new RegExp(t('profile.preview.content.follow')) }).click()
      await expect.poll(async () => (await settingsOf(member))?.overrides.educations[profile.school.id]).toBeUndefined()
    })

    test('"Show everything" switches the suggestion off and "Apply suggestion" brings it back; the adjust dialog changes single entries', async ({ member }) => {
      const { page, t } = member
      const profile = await createProfile(member)
      await page.route('**/api/applications/content-suggestion', (route) => route.fulfill({ json: suggestionFor(profile) }))
      await open(member)
      const block = page.getByTestId('preview-content')
      await expect(block.getByTestId(`content-row-${profile.school.id}`)).toBeVisible()

      await block.getByRole('button', { name: t('profile.preview.content.showAll') }).click()
      await expect.poll(async () => (await settingsOf(member))?.useSuggestion).toBe(false)
      await expect(block.getByTestId('preview-content-summary')).toContainText(t('profile.preview.content.summary.suggestionOff'))
      await block.getByRole('button', { name: t('profile.preview.content.applySuggestion') }).click()
      await expect.poll(async () => (await settingsOf(member))?.useSuggestion).toBe(true)

      // The dialog: values are the person's own corrections to the suggestion
      await block.getByRole('button', { name: t('profile.preview.content.adjust') }).click()
      const dialog = page.getByRole('dialog', { name: t('applications.content.title') })
      const group = (title: string) => dialog.getByRole('radiogroup', { name: t('applications.content.levelFor', { title }) })
      await expect(group('Realschulabschluss').getByRole('radio', { name: t('applications.content.levels.hidden') })).toHaveAttribute('aria-checked', 'true')
      await group('Berater').getByRole('radio', { name: t('applications.content.levels.hidden') }).click()
      await expect.poll(async () => (await settingsOf(member))?.overrides.experiences[profile.older.id]).toBe('hidden')
      await dialog.getByRole('button', { name: t('applications.content.done') }).click()
      await expect(block.getByTestId(`content-row-${profile.older.id}`)).toContainText(t('profile.preview.content.row.own', { level: t('applications.content.levels.hidden'), suggested: t('applications.content.levels.short') }))
    })

    test('the suggestion arriving moves nothing next to the content block, and the preview keeps its place', async ({ member }) => {
      const { page } = member
      const profile = await createProfile(member)
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/api/applications/content-suggestion', async (route) => {
        await gate
        await route.fulfill({ json: suggestionFor(profile) })
      })
      await open(member)
      const block = page.getByTestId('preview-content')
      await expect(block).toBeVisible()
      const before = await settledLayout(page)
      await expectNothingMoves(
        page,
        'the suggestion arriving: summary and list fill in',
        async () => {
          release()
          await expect(block.getByTestId(`content-row-${profile.school.id}`)).toBeVisible()
        },
        before,
      )
    })
  })
}
