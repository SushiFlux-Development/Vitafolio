import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { contentDe } from '../src/features/guide/content.de'
import { apiOk, openAs } from './support'

// The guide (Ratgeber): the click wizard for everybody who applies, the plan that follows from the answers, the answers saved per
// account, and the overview "all situations". Every test has an account of its own (fixtures.ts) and the German interface; the
// wording of the guide lives in the content module of the language (src/features/guide/content.de.ts), not in the locale files.
// The narrowest supported window is used on purpose: that is where a step must not jump.

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path = '/guide') => openAs(member.page, DISPLAY_NAME, path)
const c = contentDe

interface Answers {
  situation: string
  yearsOfExperience: number | null
  plan: string
  explain: string[]
  region: string
}

const saved = (member: Member) => apiOk<Answers | null>(member.page, 'GET', '/api/profile/guide-answers')

test.describe('guide', () => {
  test.use({ viewport: { width: 1024, height: 700 } })

  test('is in the sidebar, starts with an intro and has nothing saved yet', async ({ member }) => {
    const { page, t } = member
    await open(member, '/')
    await page.getByRole('navigation', { name: t('nav.label') }).getByRole('link', { name: t('nav.guide'), exact: true }).click()
    await expect(page).toHaveURL(/\/guide$/)
    await expect(page.getByTestId('guide-intro')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: c.title })).toBeVisible()
    expect(await saved(member)).toBeNull()
    // The window is not wider than the screen at the narrowest size, and nothing is cut off.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('a school leaver answers three questions, gets the plan and finds it again after a reload', async ({ member }) => {
    const { page } = member
    await open(member)
    await page.getByTestId('guide-start').click()
    await expect(page.getByTestId('guide-question')).toHaveText(c.wizard.situation.title)
    // The question has the focus, so a keyboard user starts at it.
    await expect(page.getByTestId('guide-question')).toBeFocused()
    await expect(page.getByTestId('guide-next')).toBeDisabled()

    await page.getByRole('radio', { name: new RegExp(c.wizard.situation.options.school.label) }).check()
    await page.getByTestId('guide-next').click()
    await expect(page.getByTestId('guide-question')).toHaveText(c.wizard.explain.title)
    await page.getByRole('checkbox', { name: new RegExp(c.wizard.explain.options.none.label) }).check()
    await page.getByTestId('guide-next').click()
    await expect(page.getByTestId('guide-question')).toHaveText(c.wizard.region.title)
    await page.getByRole('radio', { name: new RegExp(c.wizard.region.options.de.label) }).check()
    await page.getByTestId('guide-next').click()

    await expect(page.getByTestId('guide-plan')).toBeVisible()
    await expect(page.getByTestId('guide-item-att.school')).toBeVisible()
    await expect(page.getByTestId('guide-item-att.long')).toHaveCount(0)
    await expect(page.getByTestId('guide-block-sensitive')).toHaveCount(0)
    expect(await saved(member)).toEqual({ situation: 'school', yearsOfExperience: null, plan: 'first_job', explain: [], region: 'de' })

    await page.reload()
    await expect(page.getByTestId('guide-plan')).toBeVisible()
    await expect(page.getByTestId('guide-intro')).toHaveCount(0)
  })

  test('somebody with years in a job who changes career gets the advice for exactly that', async ({ member }) => {
    const { page } = member
    await open(member, '/guide?view=wizard')
    await page.getByRole('radio', { name: new RegExp(c.wizard.situation.options.working.label) }).check()
    await expect(page.getByTestId('guide-step-label')).toHaveText(c.wizard.stepOf(1, 5))
    await page.getByTestId('guide-next').click()

    // Years: a quick choice fills the field, typing picks the matching choice, a wrong value is reported at once.
    const years = page.locator('input[name="years"]')
    await page.getByRole('radio', { name: c.wizard.years.choices.from2 }).check()
    await expect(years).toHaveValue('3')
    await years.fill('')
    await years.pressSequentially('2')
    await expect(page.getByRole('radio', { name: c.wizard.years.choices.from2 })).toBeChecked()
    await years.fill('x')
    await expect(years).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText(c.wizard.years.invalid)).toBeVisible()
    await years.fill('2')
    await expect(page.getByText(c.wizard.years.invalid)).toBeHidden()
    await page.getByTestId('guide-next').click()

    await page.getByRole('radio', { name: new RegExp(c.wizard.plan.options.new_field.label) }).check()
    await page.getByTestId('guide-next').click()
    await page.getByRole('checkbox', { name: new RegExp(c.wizard.explain.options.gap.label) }).check()
    await page.getByRole('checkbox', { name: new RegExp(c.wizard.explain.options.dropped_out.label) }).check()
    await page.getByTestId('guide-next').click()
    await page.getByRole('radio', { name: new RegExp(c.wizard.region.options.us.label) }).check()
    await page.getByTestId('guide-next').click()

    await expect(page.getByTestId('guide-plan')).toBeVisible()
    expect(await saved(member)).toEqual({ situation: 'working', yearsOfExperience: 2, plan: 'new_field', explain: ['gap', 'dropped_out'], region: 'us' })
    // Years of experience: the middle step, with a change of career, a gap, a dropped-out course, in the USA.
    await expect(page.getByTestId('guide-item-cl.switchReason')).toBeVisible()
    await expect(page.getByTestId('guide-item-sens.gap')).toBeVisible()
    await expect(page.getByTestId('guide-item-sens.dropped_out')).toBeVisible()
    await expect(page.getByTestId('guide-item-sens.illness')).toHaveCount(0)
    await expect(page.getByTestId('guide-block-region')).toBeVisible()
    await expect(page.getByTestId('guide-item-find.drv')).toHaveCount(0)
    // A rule of thumb says so in words.
    await expect(page.getByTestId('guide-item-trim.some').getByText(c.kinds.ruleOfThumb)).toBeVisible()

    // Change the answers: the wizard starts with them, and the plan follows the new ones.
    await page.getByTestId('guide-change').click()
    await expect(page.getByRole('radio', { name: new RegExp(c.wizard.situation.options.working.label) })).toBeChecked()
    await page.getByTestId('guide-cancel').click()
    await expect(page.getByTestId('guide-plan')).toBeVisible()
  })

  test('nothing moves from one question to the next, and no message moves the buttons', async ({ member }) => {
    const { page } = member
    await open(member, '/guide?view=wizard')
    const card = page.getByTestId('guide-wizard')
    const next = page.getByTestId('guide-next')
    const frame = async () => ({ card: (await card.boundingBox())!, next: (await next.boundingBox())! })

    await page.getByRole('radio', { name: new RegExp(c.wizard.situation.options.working.label) }).check()
    const first = await frame()
    await next.click()
    await expect(page.getByTestId('guide-question')).toHaveText(c.wizard.years.title.working)
    await expect(page.locator('input[name="years"]')).toBeVisible()
    const years = await frame()

    // A message under the years field takes no room that was not there.
    await page.locator('input[name="years"]').fill('abc')
    await expect(page.getByText(c.wizard.years.invalid)).toBeVisible()
    const withMessage = await frame()
    await page.locator('input[name="years"]').fill('99')
    await expect(page.getByText(c.wizard.years.range(60))).toBeVisible()
    const withOther = await frame()
    await page.locator('input[name="years"]').fill('5')
    await next.click()
    await expect(page.getByTestId('guide-question')).toHaveText(c.wizard.plan.title)
    const plan = await frame()
    await page.getByRole('radio', { name: new RegExp(c.wizard.plan.options.same_field.label) }).check()
    await next.click()
    await expect(page.getByTestId('guide-question')).toHaveText(c.wizard.explain.title)
    const explain = await frame()
    await page.getByRole('checkbox', { name: new RegExp(c.wizard.explain.options.none.label) }).check()
    await next.click()
    await expect(page.getByTestId('guide-question')).toHaveText(c.wizard.region.title)
    const region = await frame()

    for (const other of [years, withMessage, withOther, plan, explain, region]) {
      expect(other.card.height).toBeCloseTo(first.card.height, 0)
      expect(other.card.y).toBeCloseTo(first.card.y, 0)
      expect(other.next.y).toBeCloseTo(first.next.y, 0)
      expect(other.next.x).toBeCloseTo(first.next.x, 0)
    }
    // Still no sideways scrolling at the narrowest window.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('works with the keyboard alone: arrows move the choice, Enter goes on', async ({ member }) => {
    const { page } = member
    await open(member, '/guide?view=wizard')
    await expect(page.getByTestId('guide-question')).toBeFocused()
    await page.keyboard.press('Tab')
    // The first card takes the focus; an arrow key chooses the next one without a mouse.
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio', { name: new RegExp(c.wizard.situation.options.training_or_studies.label) })).toBeChecked()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('guide-question')).toHaveText(c.wizard.explain.title)
    await expect(page.getByTestId('guide-question')).toBeFocused()
    // Cancel is reachable and leaves without saving.
    await page.getByTestId('guide-cancel').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('guide-intro')).toBeVisible()
    expect(await saved(member)).toBeNull()
  })

  test('all situations can be read without answering, one tab each, and the tab survives a reload', async ({ member }) => {
    const { page } = member
    await open(member, '/guide')
    await page.getByTestId('guide-open-overview').click()
    await expect(page.getByTestId('guide-overview')).toBeVisible()
    await page.getByRole('tab', { name: c.overview.tabs.long }).click()
    await expect(page.getByTestId('guide-item-att.long')).toBeVisible()
    await expect(page.getByTestId('guide-item-att.school')).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('tab', { name: c.overview.tabs.long })).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('tab', { name: c.overview.tabs.sensitive }).click()
    await expect(page.getByTestId('guide-block-sensitive')).toBeVisible()
    for (const kind of ['gap', 'unemployment', 'parental_leave', 'illness', 'dropped_out', 'frequent_changes']) {
      await expect(page.getByTestId(`guide-item-sens.${kind}`)).toBeVisible()
    }
    // Nothing was saved by reading.
    expect(await saved(member)).toBeNull()
  })

  test('the pension insurance links open in a new tab and only appear for Germany', async ({ member }) => {
    const { page } = member
    await apiOk(page, 'PUT', '/api/profile/guide-answers', { situation: 'working', yearsOfExperience: 12, plan: 'same_field', explain: [], region: 'de' })
    await open(member)
    const request = page.getByTestId('guide-external-drvRequest')
    await expect(request).toHaveAttribute('href', 'https://www.deutsche-rentenversicherung.de/DRV/DE/Online-Services/informationen_anfordern')
    await expect(request).toHaveAttribute('target', '_blank')
    await expect(page.getByTestId('guide-external-drvGlossary')).toHaveAttribute('href', /versicherungsverlauf$/)

    await apiOk(page, 'PUT', '/api/profile/guide-answers', { situation: 'working', yearsOfExperience: 12, plan: 'same_field', explain: [], region: 'uk' })
    await page.reload()
    await expect(page.getByTestId('guide-block-region')).toBeVisible()
    await expect(page.getByTestId('guide-external-drvRequest')).toHaveCount(0)
  })

  test('a block leads to the place in the app where it is put into practice', async ({ member }) => {
    const { page } = member
    await apiOk(page, 'PUT', '/api/profile/guide-answers', { situation: 'working', yearsOfExperience: 3, plan: 'same_field', explain: [], region: 'de' })
    await open(member)
    await page.getByTestId('guide-block-coverLetter').getByTestId('guide-link-coverLetters').click()
    await expect(page).toHaveURL(/\/cover-letters$/)
  })
})

test.describe('guide in English', () => {
  test.use({ language: 'en', viewport: { width: 1024, height: 700 } })

  test('shows the English wording', async ({ member }) => {
    const { page } = member
    await apiOk(page, 'PUT', '/api/profile/guide-answers', { situation: 'school', yearsOfExperience: null, plan: 'first_job', explain: [], region: 'uk' })
    await open(member)
    await expect(page.getByRole('heading', { level: 2, name: 'Your application plan' })).toBeVisible()
    await expect(page.getByTestId('guide-item-region.ukTerm')).toContainText('resume')
  })
})
