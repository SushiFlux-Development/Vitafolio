import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import type { Page, Route } from '@playwright/test'
import { LANGUAGES } from './labels'
import { apiOk, contrastBetween, expectNothingMoves, failPuts, MEMBER_PASSWORD, openAs, settledLayout } from './support'

// The forms that save by themselves, seen from the outside of the page:
//  - the last save when the page is hidden or closed arrives at the server (fetch option "keepalive"), without waiting for the
//    quiet period of the normal rhythm;
//  - the local copy: input the server did not take survives a reload, comes back into the form and is saved once the server answers;
//  - every state of the status mark (saved, saving, not complete, trying again, refused) in both languages at 1024 px and in both
//    themes with its real colours.
const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path: string) => openAs(member.page, DISPLAY_NAME, path)

interface ProfileJson {
  firstName: string
  lastName: string
}
interface Letter {
  id: string
  body: string
}

const profileOf = (member: Member) => apiOk<ProfileJson>(member.page, 'GET', '/api/profile')
const seedProfile = (member: Member) => apiOk(member.page, 'PUT', '/api/profile', { firstName: 'Erika', lastName: 'Mustermann', email: 'erika@example.com' })

/** Remembers every fetch of the page with its "keepalive" flag (read back with {@link fetchLog}). */
async function recordFetches(page: Page) {
  await page.addInitScript(() => {
    const log: { url: string; method: string; keepalive: boolean }[] = []
    ;(window as unknown as { __fetchLog: typeof log }).__fetchLog = log
    const original = window.fetch
    window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
      log.push({ url: String(input instanceof Request ? input.url : input), method: (init?.method ?? 'GET').toUpperCase(), keepalive: init?.keepalive === true })
      return original.call(window, input, init)
    }
  })
}
const fetchLog = (page: Page) => page.evaluate(() => (window as unknown as { __fetchLog: { url: string; method: string; keepalive: boolean }[] }).__fetchLog)

/**
 * Stops the page's clock: the quiet period of the automatic saving (400 ms) and its other timers never run, so a save that
 * arrives at the server can only be the one sent because the page was left.
 */
async function freezeTimers(page: Page) {
  await page.clock.install()
  await page.clock.pauseAt(new Date(Date.now() + 60_000))
}

// ---- leaving the page ----------------------------------------------------------------------------------------------------------

test.describe('the last save when the page is left', () => {
  test('a hidden page sends what was typed at once, with keepalive, before the quiet period is over', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    await recordFetches(page)
    await open(member, '/profile')
    const first = page.getByLabel(t('profile.personal.firstName'), { exact: true })
    await expect(first).toHaveValue('Erika')
    await freezeTimers(page)

    await first.fill('Zoe')
    expect((await profileOf(member)).firstName, 'nothing was sent yet (the timers stand still)').toBe('Erika')
    expect((await fetchLog(page)).filter((entry) => entry.method === 'PUT')).toEqual([])

    // The tab is hidden (switching to another tab): the visibility changes to "hidden"
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(async () => (await profileOf(member)).firstName, { message: 'the server has the input of the hidden page' }).toBe('Zoe')
    const puts = (await fetchLog(page)).filter((entry) => entry.method === 'PUT' && entry.url.endsWith('/api/profile'))
    expect(puts, 'exactly one save, sent with keepalive').toEqual([{ url: expect.stringMatching(/\/api\/profile$/), method: 'PUT', keepalive: true }])
  })

  test('closing the tab sends what was typed: the server has it although the quiet period never ran', async ({ member }) => {
    const { page, t, context } = member
    await seedProfile(member)
    await open(member, '/profile')
    const first = page.getByLabel(t('profile.personal.firstName'), { exact: true })
    await expect(first).toHaveValue('Erika')
    await freezeTimers(page)

    await first.fill('Zoe')
    expect((await profileOf(member)).firstName).toBe('Erika')
    await page.close()
    // Another page of the same window looks at the server
    await expect.poll(async () => (await apiOk<ProfileJson>(context, 'GET', '/api/profile')).firstName, { message: 'the server has the input of the closed tab' }).toBe('Zoe')
  })

  test('a cover letter is sent the same way when the page is hidden', async ({ member }) => {
    const { page, t } = member
    const created = await apiOk<Letter>(page, 'POST', '/api/cover-letters', { title: 'Weg', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text' })
    await recordFetches(page)
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Weg' }).first().click()
    const body = page.getByLabel(t('coverLetters.fields.body'), { exact: true })
    await expect(body).toHaveValue('Text')
    await freezeTimers(page)

    await body.fill('Beim Verstecken gesendet')
    expect((await apiOk<Letter>(page, 'GET', `/api/cover-letters/${created.id}`)).body).toBe('Text')
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    await expect.poll(async () => (await apiOk<Letter>(page, 'GET', `/api/cover-letters/${created.id}`)).body).toBe('Beim Verstecken gesendet')
    const puts = (await fetchLog(page)).filter((entry) => entry.method === 'PUT' && entry.url.includes(`/api/cover-letters/${created.id}`))
    expect(puts.map((entry) => entry.keepalive)).toEqual([true])
  })
})

// ---- the local copy -------------------------------------------------------------------------------------------------------------

const draftKeys = (page: Page, form: string) => page.evaluate((needle) => Object.keys(localStorage).filter((key) => key.startsWith('cv.draft.') && key.includes(needle)), form)

test.describe('the local copy', () => {
  // The server really refuses: the session is ended behind the open page (the server answers 401 to every save, also to the last one a
  // page sends while it is being left - a mock of Playwright could not stand in for that: such a save is not seen by routes).
  const endSession = (member: Member) => apiOk(member.context, 'POST', '/api/auth/logout')
  const signInAgain = (member: Member) => apiOk(member.context, 'POST', '/api/auth/login', { username: member.username, password: MEMBER_PASSWORD })

  test('personal data: input the server did not take survives a reload and is saved once the server answers again', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    page.on('dialog', (dialog) => void dialog.accept())
    await open(member, '/profile')
    const first = page.getByLabel(t('profile.personal.firstName'), { exact: true })
    await expect(first).toHaveValue('Erika')

    await endSession(member)
    await first.fill('Zoe')
    await expect.poll(() => draftKeys(page, '.personal'), { message: 'the local copy exists' }).toHaveLength(1)
    // The page is gone and the person comes back: signed in again, the server has nothing yet
    await page.reload()
    await expect(page).toHaveURL(/\/login/)
    await signInAgain(member)
    expect((await profileOf(member)).firstName, 'the server never got it').toBe('Erika')
    expect(await draftKeys(page, '.personal'), 'the local copy survived the reload').toHaveLength(1)

    // The input is back in the field and saved by itself; the copy goes
    await open(member, '/profile')
    await expect.poll(async () => (await profileOf(member)).firstName, { timeout: 20_000, message: 'the restored input reached the server' }).toBe('Zoe')
    await expect(page.getByLabel(t('profile.personal.firstName'), { exact: true })).toHaveValue('Zoe')
    // The status says the input was put back (it stays so until the next change)
    await expect(page.getByRole('status').filter({ hasText: t('autoSave.restored', { time: '@@' }).split('@@')[1]!.trim() })).toBeVisible()
    await expect.poll(() => draftKeys(page, '.personal')).toHaveLength(0)
    // The note goes with the next change, and nothing around it moves (its room is reserved)
    await expectNothingMoves(page, 'the restored note replaced by "saved"', async () => {
      await page.getByLabel(t('profile.personal.lastName'), { exact: true }).fill('Mustermann-Muster')
      await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
    })
  })

  test('a cover letter: the typed text survives a reload and is saved once the server answers again', async ({ member }) => {
    const { page, t } = member
    const created = await apiOk<Letter>(page, 'POST', '/api/cover-letters', { title: 'Kopie', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text' })
    page.on('dialog', (dialog) => void dialog.accept())
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Kopie' }).first().click()
    const body = page.getByLabel(t('coverLetters.fields.body'), { exact: true })
    await expect(body).toHaveValue('Text')
    const letterBody = async () => (await apiOk<Letter>(page, 'GET', `/api/cover-letters/${created.id}`)).body

    await endSession(member)
    await body.fill('Nicht speicherbar')
    await expect.poll(() => draftKeys(page, '.coverLetter.'), { message: 'the local copy exists' }).toHaveLength(1)
    await page.reload()
    await expect(page).toHaveURL(/\/login/)
    await signInAgain(member)
    expect(await letterBody(), 'the server never got it').toBe('Text')
    expect(await draftKeys(page, '.coverLetter.'), 'the local copy survived the reload').toHaveLength(1)

    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Kopie' }).first().click()
    await expect.poll(letterBody, { timeout: 20_000, message: 'the restored text reached the server' }).toBe('Nicht speicherbar')
    await expect(page.getByLabel(t('coverLetters.fields.body'), { exact: true })).toHaveValue('Nicht speicherbar')
    await expect.poll(() => draftKeys(page, '.coverLetter.')).toHaveLength(0)
  })
})

// ---- the status mark in every state ----------------------------------------------------------------------------------------------

/** Answers every PUT to the address after `delayMs` (a slow server) - kept open until the returned function is called. */
async function slowPuts(page: Page, glob: string, delayMs: number): Promise<() => Promise<void>> {
  const handler = async (route: Route) => {
    if (route.request().method() !== 'PUT') return route.fallback()
    await new Promise((resolve) => setTimeout(resolve, delayMs))
    return route.fallback()
  }
  await page.route(glob, handler)
  return () => page.unroute(glob, handler)
}

/** Refuses every PUT to the address as the server does when the target is gone (a refusal that is not repeated). */
async function refusePuts(page: Page, glob: string): Promise<() => Promise<void>> {
  const handler = (route: Route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status: 404, code: 'not_found', detail: 'Das Profil wurde nicht gefunden.' }) })
      : route.fallback()
  await page.route(glob, handler)
  return () => page.unroute(glob, handler)
}

test.describe('the status mark of the personal data in every state', () => {
  test.use({ viewport: { width: 1024, height: 768 } })
  for (const language of LANGUAGES) {
    test.describe(language, () => {
      test.use({ language })
      test('saving, not complete, trying again and refused move nothing around the mark', async ({ member }) => {
        const { page, t } = member
        await seedProfile(member)
        await open(member, '/profile')
        const first = page.getByLabel(t('profile.personal.firstName'), { exact: true })
        await expect(first).toHaveValue('Erika')
        await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
        const before = await settledLayout(page)

        // "Saving ..." only shows when the server takes its time
        const fast = await slowPuts(page, '**/api/profile', 2500)
        await expectNothingMoves(
          page,
          '"Saving ..." appears while the server is slow',
          async () => {
            await first.fill('Zoe')
            await expect(page.getByText(t('autoSave.saving'), { exact: true })).toBeVisible()
          },
          before,
        )
        await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible({ timeout: 15_000 })
        await fast()

        // A required value missing: the mark says what is missing
        await expectNothingMoves(
          page,
          'the first name emptied (not complete)',
          async () => {
            await first.fill('')
            await expect(page.getByText(t('profile.personal.autoSave.firstNameMissing'))).toBeVisible()
          },
          before,
        )
        await first.fill('Zoe')
        await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()

        // The server refuses the input (not repeated by itself)
        const allow = await refusePuts(page, '**/api/profile')
        await expectNothingMoves(
          page,
          'the server refuses the input',
          async () => {
            await first.fill('Zoe Anna')
            await expect(page.getByText(t('autoSave.rejected'))).toBeVisible()
          },
          before,
        )
        await allow()
        // Typing on gives the input a new chance
        await first.fill('Zoe Anna Maria')
        await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible({ timeout: 15_000 })
      })
    })
  }
})

// ---- contrast of the status mark -------------------------------------------------------------------------------------------------

for (const theme of ['light', 'dark'] as const) {
  test(`status mark: the text of every state keeps 4.5:1 on its own background (${theme} theme)`, async ({ member }) => {
    const { page, t } = member
    await page.emulateMedia({ colorScheme: theme })
    await seedProfile(member)
    await open(member, '/profile')
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    const first = page.getByLabel(t('profile.personal.firstName'), { exact: true })
    await expect(first).toHaveValue('Erika')

    /** The shown mark (not the invisible copies that reserve room): its text colour against its own background. */
    const measure = async (text: string, tone: string) => {
      const badge = page.locator('[role="status"] > .badge:not(.invisible)', { hasText: text })
      await expect(badge).toBeVisible()
      await expect(badge).toHaveClass(new RegExp(`badge-${tone}`))
      const { color, background, action } = await badge.evaluate((element) => {
        const style = getComputedStyle(element)
        const button = element.querySelector('button')
        return { color: style.color, background: style.backgroundColor, action: button ? getComputedStyle(button).color : null }
      })
      const ratio = await contrastBetween(page, color, background)
      test.info().annotations.push({ type: `${theme} ${tone}`, description: `${color} on ${background} = ${ratio.toFixed(2)}:1${action ? `, action ${action}` : ''}` })
      expect(ratio, `${theme}: "${text}" (${tone}) ${color} on ${background}`).toBeGreaterThanOrEqual(4.5)
      if (action) expect(await contrastBetween(page, action, background), `${theme}: the action of "${text}"`).toBeGreaterThanOrEqual(4.5)
    }

    await measure(t('autoSave.saved'), 'success')

    const slow = await slowPuts(page, '**/api/profile', 2500)
    await first.fill('Zoe')
    await measure(t('autoSave.saving'), 'neutral')
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible({ timeout: 15_000 })
    await slow()

    await first.fill('')
    await measure(t('profile.personal.autoSave.firstNameMissing'), 'warning')
    await first.fill('Zoe')
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()

    const stopFailing = await failPuts(page, '**/api/profile')
    await first.fill('Zoe Anna')
    await measure(t('autoSave.retrying'), 'warning')
    await stopFailing()
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible({ timeout: 20_000 })

    const allow = await refusePuts(page, '**/api/profile')
    await first.fill('Zoe Anna Maria')
    await measure(t('autoSave.rejected'), 'danger')
    await allow()
  })
}
