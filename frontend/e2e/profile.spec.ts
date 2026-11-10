import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import type { Page } from '@playwright/test'
import { dateIn } from './labels'
import { apiOk, failPuts, openAs, readDownload } from './support'

// The master profile: personal data, the building blocks with their dialogs, the wizard, JSON Resume and the real router's guard
// against losing typed input. Every test has an account of its own (fixtures.ts) and the German interface.

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path: string) => openAs(member.page, DISPLAY_NAME, path)

/** The field with this label (exact: "Ort" must not find "Geburtsort"). */
const fieldOf = (member: Member, key: string) => member.page.getByLabel(member.t(key), { exact: true })

interface ProfileJson {
  firstName: string
  lastName: string
  email: string | null
  experiences: { id: string; jobTitle: string; employer: string }[]
}

/** The sidebar's list of the nine sections (the sub-navigation of the page) and one entry of it. */
const sectionsOf = (member: Member) => member.page.getByRole('navigation', { name: member.t('profile.sections') })
const sectionLink = (member: Member, key: string) => sectionsOf(member).getByRole('link', { name: member.t(`profile.tabs.${key}`), exact: true })

/** Lets every save of the personal data fail with a server error, until the returned function is called. */
const failSaving = (page: Page) => failPuts(page, '**/api/profile')

const profileOf = (member: Member) => apiOk<ProfileJson>(member.page, 'GET', '/api/profile')

test.describe('personal data', () => {
  test('a problem shows while typing, before any blur; the form saves by itself and the value survives a reload', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile')
    const email = fieldOf(member, 'profile.personal.email')

    // A blank in an address is wrong at once - no blur, no click
    await email.pressSequentially('erika mail')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText(t('rules.email.invalid'))).toBeVisible()
    await email.fill('')
    await expect(email).not.toHaveAttribute('aria-invalid', 'true')
    await email.pressSequentially('erika@example.com')
    await expect(email).not.toHaveAttribute('aria-invalid', 'true')

    // A required field that was emptied again says so at once
    const savedByItself = page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().endsWith('/api/profile') && response.ok() && (response.request().postData() ?? '').includes('Beispiel'))
    const last = fieldOf(member, 'profile.personal.lastName')
    await last.fill('')
    await expect(page.getByText(t('rules.field.required'))).toBeVisible()
    await last.pressSequentially('Beispiel')
    await expect(page.getByText(t('rules.field.required'))).toHaveCount(0)

    // There is no save button: the form saves by itself and says so
    await expect(page.getByRole('button', { name: t('common.save') })).toHaveCount(0)
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
    await savedByItself

    await page.reload()
    await expect(fieldOf(member, 'profile.personal.email')).toHaveValue('erika@example.com')
    await expect(fieldOf(member, 'profile.personal.lastName')).toHaveValue('Beispiel')
    expect((await profileOf(member)).lastName).toBe('Beispiel')
  })

  test('Enter marks every wrong field - including the ones nobody touched - and nothing that is red is ever sent', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile')
    await fieldOf(member, 'profile.personal.firstName').fill('')
    await fieldOf(member, 'profile.personal.website').fill('ftp://nope.example')
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().endsWith('/api/profile')) requests.push(request.url())
    })
    await fieldOf(member, 'profile.personal.website').press('Enter')
    await expect(fieldOf(member, 'profile.personal.firstName')).toHaveAttribute('aria-invalid', 'true')
    await expect(fieldOf(member, 'profile.personal.website')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText(t('rules.url.invalid'))).toBeVisible()
    // The status names the reason instead of "saved": a missing required value is named first ...
    await expect(page.getByText(t('profile.personal.autoSave.firstNameMissing'))).toBeVisible()
    // ... and once the name is there, the wrong link is what keeps the input from being saved
    await fieldOf(member, 'profile.personal.firstName').fill('Erika')
    await expect(page.getByText(t('autoSave.invalid'))).toBeVisible()
    // Well beyond the quiet period and the longest wait of continuous typing
    await page.waitForTimeout(2500)
    expect(requests, 'nothing that is red is sent').toEqual([])
  })

  test('the nine sections are in the sidebar, keep the active one in the address, also after a reload, and work with the keyboard', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile')
    // No tab bar on the page; the main navigation is replaced by the sections, "Zurück" on top
    await expect(page.getByRole('tablist')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: t('nav.label') })).toHaveCount(0)
    await expect(sectionsOf(member).getByRole('link')).toHaveCount(9)
    await expect(page.getByTestId('sidebar-back')).toHaveText(t('common.back'))
    await expect(sectionLink(member, 'personal')).toHaveAttribute('aria-current', 'page')

    await sectionLink(member, 'experiences').click()
    await expect(page).toHaveURL(/tab=experiences/)
    await page.reload()
    await expect(sectionLink(member, 'experiences')).toHaveAttribute('aria-current', 'page')
    await expect(sectionLink(member, 'personal')).not.toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: t('profile.experiences.title'), level: 2 })).toBeVisible()

    // The keyboard: Tab through the list, Enter opens (they are links)
    await sectionLink(member, 'experiences').focus()
    await page.keyboard.press('Tab')
    await expect(sectionLink(member, 'educations')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(sectionLink(member, 'educations')).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveURL(/tab=educations/)

    // Switching sections is no step in the history: the browser's back button leaves the profile
    await page.goBack()
    await expect(page).not.toHaveURL(/\/profile/)
  })

  test('"Zurück" leads to the page visited before the profile, and to the overview when there is none', async ({ member }) => {
    const { page, t } = member
    await open(member, '/cover-letters')
    await page.getByRole('link', { name: t('nav.profile') }).click()
    await expect(page).toHaveURL(/\/profile/)
    await sectionLink(member, 'skills').click()
    await expect(page.getByTestId('sidebar-back')).toHaveAttribute('href', '/cover-letters')
    await page.getByTestId('sidebar-back').click()
    await expect(page).toHaveURL(/\/cover-letters$/)
    await expect(page.getByRole('navigation', { name: t('nav.label') })).toBeVisible()

    // Opened directly in a fresh tab: nothing before it, so the overview
    const fresh = await member.context.newPage()
    await fresh.goto('/profile?tab=languages')
    await fresh.getByTestId('sidebar-back').click()
    await expect(fresh).toHaveURL(/\/$/)
  })

  test('assistant mode stays in the page header, none of the sections is the open one in it, and a section leaves it', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile?tab=skills')
    await page.getByRole('button', { name: t('profile.wizardMode') }).click()
    await expect(page).toHaveURL(/view=wizard/)
    await expect(page.getByRole('list', { name: t('profile.wizard.label') })).toBeVisible()
    await expect(page.getByRole('button', { name: t('profile.jsonResume.button') })).toBeVisible()
    await expect(sectionsOf(member).locator('[aria-current="page"]')).toHaveCount(0)
    // The assistant is still there after a reload
    await page.reload()
    await expect(page.getByRole('list', { name: t('profile.wizard.label') })).toBeVisible()

    await sectionLink(member, 'languages').click()
    await expect(page.getByRole('list', { name: t('profile.wizard.label') })).toHaveCount(0)
    await expect(page).not.toHaveURL(/view=wizard/)
    await expect(sectionLink(member, 'languages')).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('building blocks', () => {
  test('add an entry: live month hint, then it is listed; edit it; reorder two; delete asks first', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile?tab=experiences')

    // ---- add ----
    await page.getByRole('button', { name: t('profile.experiences.add') }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(t('profile.experiences.jobTitle'), { exact: true }).pressSequentially('Entwicklerin')
    await dialog.getByLabel(t('profile.experiences.employer'), { exact: true }).pressSequentially('Muster GmbH')
    const start = dialog.getByLabel(t('profile.experiences.startDate'), { exact: true })
    // Only digits are typed and the separator appears by itself. The beginning of a month is work in progress; a month that
    // cannot exist is wrong at once
    const dates = dateIn(member.language)
    await start.pressSequentially(dates.monthDigits(2020, 1).slice(0, -1))
    await expect(start).not.toHaveAttribute('aria-invalid', 'true')
    await start.fill('')
    await start.pressSequentially(dates.monthDigits(2020, 0))
    await expect(start).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText(t(dates.invalidMonth))).toBeVisible()
    await start.fill('')
    await start.pressSequentially(dates.monthDigits(2020, 3))
    await expect(start).toHaveValue(dates.shownMonth(2020, 3))
    await expect(start).not.toHaveAttribute('aria-invalid', 'true')
    await dialog.getByRole('switch', { name: t('profile.experiences.isCurrent') }).click()
    // "Current position" disables the end date instead of removing it: the form keeps its shape
    await expect(dialog.getByLabel(t('profile.experiences.endDate'), { exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: t('common.save') }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Entwicklerin', level: 3 })).toBeVisible()

    // ---- a second one, newest first is the user's choice: it lands below ----
    await apiOk(page, 'POST', '/api/profile/experiences', { jobTitle: 'Beraterin', employer: 'Zweite AG', startDate: '2018-01', endDate: '2020-02', isCurrent: false, sortOrder: 1 })
    await page.reload()
    const titles = page.locator('ul li h3')
    await expect(titles).toHaveText(['Entwicklerin', 'Beraterin'])
    await page.getByRole('button', { name: `${t('common.moveUp')}: Beraterin` }).click()
    await expect(titles).toHaveText(['Beraterin', 'Entwicklerin'])
    await page.reload()
    await expect(titles).toHaveText(['Beraterin', 'Entwicklerin'])

    // ---- edit ----
    await page.getByRole('button', { name: `${t('profile.experiences.edit')}: Entwicklerin` }).click()
    await expect(dialog.getByLabel(t('profile.experiences.jobTitle'), { exact: true })).toHaveValue('Entwicklerin')
    await dialog.getByLabel(t('profile.experiences.jobTitle'), { exact: true }).fill('Lead-Entwicklerin')
    await dialog.getByRole('button', { name: t('common.save') }).click()
    await expect(page.getByRole('heading', { name: 'Lead-Entwicklerin', level: 3 })).toBeVisible()

    // ---- closing with typed input asks first ----
    await page.getByRole('button', { name: `${t('profile.experiences.edit')}: Beraterin` }).click()
    await dialog.getByLabel(t('profile.experiences.employer'), { exact: true }).fill('Geändert AG')
    await dialog.getByRole('button', { name: t('common.cancel') }).click()
    const discard = page.getByRole('alertdialog')
    await expect(discard).toContainText(t('common.discardTitle'))
    // Staying keeps the typed value, discarding drops it
    await discard.getByRole('button', { name: t('common.cancel') }).click()
    await expect(dialog.getByLabel(t('profile.experiences.employer'), { exact: true })).toHaveValue('Geändert AG')
    await dialog.getByRole('button', { name: t('common.cancel') }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: t('common.discard') }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText(t('profile.experiences.at', { employer: 'Zweite AG' }), { exact: true })).toBeVisible()

    // ---- delete: the question names what happens; cancelling keeps, confirming removes ----
    await page.getByRole('button', { name: `${t('profile.experiences.delete')}: Beraterin` }).click()
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('profile.experiences.deleteConfirm'))
    await ask.getByRole('button', { name: t('common.cancel') }).click()
    await expect(titles).toHaveCount(2)
    await page.getByRole('button', { name: `${t('profile.experiences.delete')}: Beraterin` }).click()
    await ask.getByRole('button', { name: t('common.delete') }).click()
    await expect(titles).toHaveText(['Lead-Entwicklerin'])
    expect((await profileOf(member)).experiences.map((entry) => entry.jobTitle)).toEqual(['Lead-Entwicklerin'])
  })

  test('the other blocks add, edit and delete through the same dialogs (skills, languages, interests, own sections)', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile?tab=skills')
    await page.getByRole('button', { name: t('profile.skills.add') }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(t('profile.skills.name'), { exact: true }).pressSequentially('TypeScript')
    await dialog.getByRole('button', { name: t('common.save') }).click()
    await expect(page.getByText('TypeScript', { exact: true })).toBeVisible()

    await sectionLink(member, 'languages').click()
    await page.getByRole('button', { name: t('profile.languages.add') }).first().click()
    await dialog.getByLabel(t('profile.languages.language'), { exact: true }).pressSequentially('Englisch')
    await dialog.getByRole('button', { name: t('common.save') }).click()
    await expect(page.getByText('Englisch', { exact: true })).toBeVisible()

    await sectionLink(member, 'interests').click()
    await page.getByRole('button', { name: t('profile.interests.add') }).first().click()
    await dialog.getByLabel(t('profile.interests.name'), { exact: true }).pressSequentially('Fotografie')
    await dialog.getByRole('button', { name: t('common.save') }).click()
    await expect(page.getByText('Fotografie', { exact: true })).toBeVisible()

    await sectionLink(member, 'customSections').click()
    await page.getByRole('button', { name: t('profile.customSections.addSection') }).first().click()
    await dialog.getByLabel(t('profile.customSections.sectionTitle'), { exact: true }).pressSequentially('Publikationen')
    await dialog.getByRole('button', { name: t('common.save') }).click()
    await expect(page.getByText('Publikationen', { exact: true })).toBeVisible()

    // Delete one of them again: asked first
    await sectionLink(member, 'skills').click()
    await page.getByRole('button', { name: `${t('profile.skills.delete')}: TypeScript` }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: t('common.delete') }).click()
    await expect(page.getByText('TypeScript', { exact: true })).toHaveCount(0)
  })
})

test.describe('losing typed input', () => {
  test('the wizard and the classic view share the typed personal data', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile')
    await fieldOf(member, 'profile.personal.firstName').fill('Zoe')
    await page.getByRole('button', { name: t('profile.wizardMode') }).click()
    await expect(page.getByLabel(t('profile.personal.firstName'), { exact: true })).toHaveValue('Zoe')
    await page.locator('header').getByRole('button', { name: t('profile.classicView') }).click()
    await expect(fieldOf(member, 'profile.personal.firstName')).toHaveValue('Zoe')
  })

  test('switching to another section of the profile asks nothing and keeps what was typed', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile')
    await fieldOf(member, 'profile.personal.firstName').fill('Bleibt')
    await sectionLink(member, 'experiences').click()
    await expect(page).toHaveURL(/tab=experiences/)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await sectionLink(member, 'personal').click()
    await expect(fieldOf(member, 'profile.personal.firstName')).toHaveValue('Bleibt')
    // Leaving the section sent it
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
    expect((await profileOf(member)).firstName).toBe('Bleibt')
  })

  test('the real router asks before a click on the navigation leaves input that could not be saved; staying keeps it, leaving anyway goes', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile')
    await failSaving(page)
    await fieldOf(member, 'profile.personal.firstName').fill('Ungespeichert')
    await expect(page.getByText(t('autoSave.retrying'))).toBeVisible()

    // The main navigation is replaced by the sections here; the ways out are "Zurück" and the settings entry of the user area
    await page.getByRole('link', { name: t('nav.settings') }).click()
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('autoSave.leave.title'))
    await expect(ask).toContainText(t('autoSave.leave.message'))
    // Staying: still on the page, the value is still there
    await ask.getByRole('button', { name: t('common.cancel') }).click()
    await expect(page).toHaveURL(/\/profile/)
    await expect(fieldOf(member, 'profile.personal.firstName')).toHaveValue('Ungespeichert')

    // "Zurück" asks the same question
    await page.getByTestId('sidebar-back').click()
    await expect(page.getByRole('alertdialog')).toContainText(t('autoSave.leave.title'))
    await page.getByRole('alertdialog').getByRole('button', { name: t('common.cancel') }).click()
    await expect(page).toHaveURL(/\/profile/)

    // Discarding: the navigation goes through
    await page.getByRole('link', { name: t('nav.settings') }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: t('autoSave.leave.confirm') }).click()
    await expect(page).toHaveURL(/\/settings/)
    // Nothing was saved on the server, but the typed text waits in the local copy
    expect((await profileOf(member)).firstName).toBe('Erika')
    const copies = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('cv.draft.') && key.endsWith('.personal')))
    expect(copies).toHaveLength(1)
  })

  test('the browser\'s back button is asked about too, and "stay" puts the address back', async ({ member }) => {
    const { page, t } = member
    await open(member, '/')
    await page.getByRole('link', { name: t('nav.profile') }).click()
    await expect(page).toHaveURL(/\/profile/)
    await failSaving(page)
    await fieldOf(member, 'profile.personal.firstName').fill('Zurueck')
    await expect(page.getByText(t('autoSave.retrying'))).toBeVisible()

    await page.goBack()
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('autoSave.leave.title'))
    await ask.getByRole('button', { name: t('common.cancel') }).click()
    await expect(page).toHaveURL(/\/profile/)
    await expect(fieldOf(member, 'profile.personal.firstName')).toHaveValue('Zurueck')

    await page.goBack()
    await page.getByRole('alertdialog').getByRole('button', { name: t('autoSave.leave.confirm') }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('closing the tab or reloading with typed input triggers the browser\'s own prompt - and saved input does not', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile')
    const prompted: string[] = []
    page.on('dialog', (dialog) => {
      prompted.push(dialog.type())
      void dialog.dismiss()
    })
    const stopFailing = await failSaving(page)
    await fieldOf(member, 'profile.personal.firstName').fill('Ungespeichert')
    await expect(page.getByText(t('autoSave.retrying'))).toBeVisible()
    // The page asks for the prompt: a beforeunload handler that calls preventDefault is registered
    const blocked = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(blocked, 'input that could not be saved registers the beforeunload guard').toBe(true)
    // The server is back: the next automatic try (after 2 s) gets through
    await stopFailing()
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible({ timeout: 15_000 })
    const afterSave = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(afterSave, 'saved input registers no guard').toBe(false)
    expect(prompted, 'no browser box (window.confirm/alert) was used by the app').toEqual([])
  })
})

test.describe('JSON Resume', () => {
  test('export hands over a real resume.json with the profile; the notice says so', async ({ member }) => {
    const { page, t } = member
    await apiOk(page, 'PUT', '/api/profile', { firstName: 'Erika', lastName: 'Mustermann', email: 'erika@example.com' })
    await open(member, '/profile')
    await page.getByRole('button', { name: t('profile.jsonResume.button') }).click()
    const dialog = page.getByRole('dialog')
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: t('profile.jsonResume.exportButton') }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('resume.json')
    const resume = JSON.parse((await readDownload(file)).toString('utf8')) as { basics: { name: string; email: string } }
    expect(resume.basics.name).toBe('Erika Mustermann')
    expect(resume.basics.email).toBe('erika@example.com')
    await expect(dialog.getByText(t('profile.jsonResume.exportSuccess'))).toBeVisible()
  })

  test('import: invalid JSON is named at once after leaving the field and nothing is sent; replacing asks first and then takes over the file', async ({ member }) => {
    const { page, t } = member
    await apiOk(page, 'POST', '/api/profile/experiences', { jobTitle: 'Alt', employer: 'Alte Firma', startDate: '2010-01', isCurrent: true, sortOrder: 0 })
    await open(member, '/profile')
    await page.getByRole('button', { name: t('profile.jsonResume.button') }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('radio', { name: t('profile.jsonResume.importMode') }).click()
    const paste = dialog.getByLabel(t('profile.jsonResume.pasteLabel'), { exact: true })

    // Half a document is not an error while it is typed; it is once the field is left
    await paste.pressSequentially('{ "basics": ')
    await expect(paste).not.toHaveAttribute('aria-invalid', 'true')
    await page.getByRole('radio', { name: t('profile.jsonResume.importMode') }).focus()
    await expect(paste).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText(t('rules.json.invalid'))).toBeVisible()

    const imports: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/profile/json-resume/import')) imports.push(request.url())
    })
    await dialog.getByRole('button', { name: t('profile.jsonResume.importButton') }).click()
    expect(imports, 'invalid JSON is not sent').toEqual([])

    const resume = {
      basics: { name: 'Max Muster', label: 'Tester', email: 'max@example.com' },
      work: [{ name: 'Neue Firma', position: 'Testleiter', startDate: '2020-01-01', endDate: '2021-05-31', summary: 'Prüfte Dinge.' }],
    }
    await paste.fill(JSON.stringify(resume))
    await dialog.getByRole('switch', { name: t('profile.jsonResume.replaceLabel') }).click()
    await dialog.getByRole('button', { name: t('profile.jsonResume.importButton') }).click()

    // Replacing is asked about, and cancelling changes nothing
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('profile.jsonResume.confirmReplace'))
    await ask.getByRole('button', { name: t('common.cancel') }).click()
    expect(imports).toEqual([])
    expect((await profileOf(member)).experiences.map((entry) => entry.jobTitle)).toEqual(['Alt'])

    await dialog.getByRole('button', { name: t('profile.jsonResume.importButton') }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: t('profile.jsonResume.importButton') }).click()
    await expect(dialog.getByText(t('profile.jsonResume.importSuccess'))).toBeVisible()
    await expect.poll(async () => (await profileOf(member)).experiences.map((entry) => entry.jobTitle)).toEqual(['Testleiter'])
    expect((await profileOf(member)).lastName).toBe('Muster')
  })
})
