import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { expectNotTruncated } from './checks'
import { dateIn } from './labels'
import { apiOk, cvPdfBytes, openAs } from './support'

// The application tracker: creating and editing with live validation, the status and the board, the follow-up reminder, the timeline,
// the filed version of the dossier against today's state, attachments and the keyboard. Every test has an account of its own.

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path = '/applications') => openAs(member.page, DISPLAY_NAME, path)

interface Application {
  id: string
  jobTitle: string
  company: string
  status: string
  followUpAt: string | null
  hasArchivedPdf: boolean
  location: string | null
}

const applicationOf = (member: Member, id: string) => apiOk<Application>(member.page, 'GET', `/api/applications/${id}`)
const createApplication = (member: Member, body: Record<string, unknown>) =>
  apiOk<Application>(member.page, 'POST', '/api/applications', { jobTitle: 'Entwicklerin', company: 'Muster GmbH', status: 'draft', ...body })

/** The delete button of the attachment "Arbeitszeugnis Muster": its name is "Löschen" plus a hidden ": title", with a space between the two parts. */
const deleteAttachment = (t: Member['t']) => new RegExp('^' + t('common.delete') + '\\s*: Arbeitszeugnis Muster')

/** The board column with this name. */
const column = (member: Member, key: string) => member.page.getByRole('region', { name: member.t(`applications.columns.${key}`), exact: true })

test.describe('creating and editing', () => {
  test('a new application: problems show while typing, a red form is not sent, a valid one opens its details and lands in the first column', async ({ member }) => {
    const { page, t } = member
    await open(member)
    await expect(page.getByText(t('applications.empty'))).toBeVisible()
    await page.getByRole('button', { name: t('applications.newApplication') }).first().click()
    const form = page.getByRole('dialog', { name: t('applications.createTitle') })

    const jobTitle = form.getByLabel(t('applications.fields.jobTitle'), { exact: true })
    await jobTitle.pressSequentially('x')
    await jobTitle.fill('')
    await expect(jobTitle).toHaveAttribute('aria-invalid', 'true')
    await expect(form.getByText(t('rules.field.required')).first()).toBeVisible()

    const email = form.getByLabel(t('applications.fields.contactEmail'), { exact: true })
    await email.pressSequentially('a b')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(form.getByText(t('rules.email.invalid'))).toBeVisible()
    await email.fill('')

    const url = form.getByLabel(t('applications.fields.jobPostingUrl'), { exact: true })
    await url.pressSequentially('ftp://x')
    await expect(url).toHaveAttribute('aria-invalid', 'true')
    await url.fill('https://example.com/job')
    await expect(url).not.toHaveAttribute('aria-invalid', 'true')

    // A day that does not exist and a year out of range are named at once
    const followUp = form.getByLabel(t('applications.fields.followUpAt'), { exact: true })
    const dates = dateIn(member.language)
    await followUp.pressSequentially(dates.digits(2026, 2, 30))
    await expect(followUp).toHaveValue(dates.shown(2026, 2, 30))
    await expect(followUp).toHaveAttribute('aria-invalid', 'true')
    await expect(form.getByText(t('rules.date.nonexistent'))).toBeVisible()
    await followUp.fill(dates.digits(1999, 1, 1))
    await expect(form.getByText(t('rules.date.range', { min: 2000, max: 2100 }))).toBeVisible()
    await followUp.fill('')
    await expect(followUp).not.toHaveAttribute('aria-invalid', 'true')

    // Submit with the empty required fields: nothing goes to the server, every red field is marked
    const posts: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/applications') posts.push(request.url())
    })
    await form.getByRole('button', { name: t('applications.actions.save') }).click()
    await expect(form.getByLabel(t('applications.fields.company'), { exact: true })).toHaveAttribute('aria-invalid', 'true')
    expect(posts).toEqual([])

    await jobTitle.fill('Senior Entwicklerin')
    await form.getByLabel(t('applications.fields.company'), { exact: true }).fill('Acme GmbH')
    await form.getByLabel(t('applications.fields.location'), { exact: true }).fill('Berlin')
    await form.getByRole('button', { name: t('applications.actions.save') }).click()

    // The details of the new application open at once; behind them the board has the card in "Entwurf"
    const details = page.getByRole('dialog', { name: 'Senior Entwicklerin – Acme GmbH' })
    await expect(details).toBeVisible()
    await details.getByRole('button', { name: t('common.close') }).last().click()
    await expect(column(member, 'draft').getByRole('button', { name: 'Senior Entwicklerin' })).toBeVisible()
    await expect(column(member, 'draft').getByText('Berlin')).toBeVisible()
  })

  test('an existing application is editable: the form opens filled in, the change is saved and shown; the follow-up day can be set', async ({ member }) => {
    const { page, t } = member
    const created = await createApplication(member, { location: 'Hamburg' })
    await open(member)
    await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
    const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
    await details.getByRole('button', { name: t('applications.actions.edit') }).click()
    const form = page.getByRole('dialog', { name: t('applications.editTitle') })
    await expect(form.getByLabel(t('applications.fields.location'), { exact: true })).toHaveValue('Hamburg')
    // The status of an existing application changes in its details, not in this form
    await expect(form.getByLabel(t('applications.fields.status'), { exact: true })).toHaveCount(0)

    await form.getByLabel(t('applications.fields.location'), { exact: true }).fill('München')
    await form.getByLabel(t('applications.fields.followUpAt'), { exact: true }).fill(dateIn(member.language).digits(2030, 5, 17))
    await form.getByRole('button', { name: t('applications.actions.save') }).click()
    await expect(form).toBeHidden()
    await expect(details.getByText('München')).toBeVisible()
    const stored = await applicationOf(member, created.id)
    expect(stored.location).toBe('München')
    expect(stored.followUpAt).toContain('2030-05-17')
    await expect(details.getByText(dateIn(member.language).shown(2030, 5, 17))).toBeVisible()
  })

  test('closing the edit form with typed input asks first; Esc closes only the topmost dialog', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, {})
    await open(member)
    await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
    const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
    await details.getByRole('button', { name: t('applications.actions.edit') }).click()
    const form = page.getByRole('dialog', { name: t('applications.editTitle') })
    await form.getByLabel(t('applications.fields.location'), { exact: true }).fill('Irgendwo')
    await page.keyboard.press('Escape')
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('common.discardTitle'))
    // Esc again closes the question only - not the form behind it, and not the details behind that
    await page.keyboard.press('Escape')
    await expect(ask).toBeHidden()
    await expect(form).toBeVisible()
    await expect(details).toBeVisible()
  })
})

test.describe('status, board and follow-up', () => {
  test('changing the status moves the card between columns; rejection and withdrawal share "closed" but are told apart by their badge', async ({ member }) => {
    const { page, t } = member
    const created = await createApplication(member, {})
    await open(member)
    await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
    const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
    const status = details.getByLabel(t('applications.fields.status'), { exact: true })

    await status.selectOption({ label: t('applications.statuses.interview') })
    await expect.poll(async () => (await applicationOf(member, created.id)).status).toBe('interview')
    await details.getByRole('button', { name: t('common.close') }).last().click()
    await expect(column(member, 'interview').getByRole('button', { name: 'Entwicklerin' })).toBeVisible()
    await expect(column(member, 'draft').getByRole('button', { name: 'Entwicklerin' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
    await status.selectOption({ label: t('applications.statuses.rejected') })
    await expect.poll(async () => (await applicationOf(member, created.id)).status).toBe('rejected')
    await details.getByRole('button', { name: t('common.close') }).last().click()
    const closed = column(member, 'closed')
    await expect(closed.getByRole('button', { name: 'Entwicklerin' })).toBeVisible()
    await expect(closed.getByText(t('applications.statuses.rejected'), { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
    await status.selectOption({ label: t('applications.statuses.withdrawn') })
    await expect.poll(async () => (await applicationOf(member, created.id)).status).toBe('withdrawn')
    await details.getByRole('button', { name: t('common.close') }).last().click()
    await expect(closed.getByText(t('applications.statuses.withdrawn'), { exact: true })).toBeVisible()
    await expect(closed.getByText(t('applications.statuses.rejected'), { exact: true })).toHaveCount(0)
  })

  test('a follow-up that is due shows as a notice, a card mark and a count; the filter narrows to it; a later date clears it', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Fällig', company: 'Alt AG', status: 'applied', followUpAt: '2026-10-01T00:00:00Z' })
    await createApplication(member, { jobTitle: 'Ruhig', company: 'Neu AG', status: 'applied', followUpAt: '2030-01-01T00:00:00Z' })
    await open(member)
    await expect(page.getByText(t('applications.followUpAlert_one', { count: 1 }))).toBeVisible()
    // The card of the due application carries the mark (with a text for screen readers), the other one does not
    const due = page.getByRole('listitem').filter({ hasText: 'Fällig' })
    await expect(due.getByText(t('applications.stats.followUpsDue'))).toHaveCount(1)
    await expect(page.getByRole('listitem').filter({ hasText: 'Ruhig' }).getByText(t('applications.stats.followUpsDue'))).toHaveCount(0)

    const filter = page.getByRole('button', { name: t('applications.filter.onlyFollowUp') })
    await filter.click()
    // The same button now offers the way back; its label names the state, so it is no toggle button (no aria-pressed)
    await expect(page.getByRole('button', { name: t('applications.filter.showAll') })).not.toHaveAttribute('aria-pressed')
    await expect(page.getByRole('button', { name: 'Ruhig' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Fällig' })).toBeVisible()
    await page.getByRole('button', { name: t('applications.filter.showAll') }).click()
    await expect(page.getByRole('button', { name: 'Ruhig' })).toBeVisible()

    // Set a later follow-up day in the form: the notice goes away
    await page.getByRole('button', { name: 'Fällig' }).first().click()
    await page.getByRole('dialog', { name: 'Fällig – Alt AG' }).getByRole('button', { name: t('applications.actions.edit') }).click()
    await page.getByRole('dialog', { name: t('applications.editTitle') }).getByLabel(t('applications.fields.followUpAt'), { exact: true }).fill(dateIn(member.language).digits(2031, 3, 1))
    await page.getByRole('dialog', { name: t('applications.editTitle') }).getByRole('button', { name: t('applications.actions.save') }).click()
    await expect(page.getByText(t('applications.followUpAlert_one', { count: 1 }))).toHaveCount(0)
  })

  test('search and the list view: the search narrows by company, the status filter by status, the list shows the same entries', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Erste', company: 'Alpha AG', status: 'draft' })
    await createApplication(member, { jobTitle: 'Zweite', company: 'Beta GmbH', status: 'interview' })
    await open(member)
    await page.getByLabel(t('applications.filter.search')).pressSequentially('Beta')
    await expect(page.getByRole('button', { name: 'Zweite' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Erste' })).toHaveCount(0)
    await page.getByLabel(t('applications.filter.search')).fill('')
    await expect(page.getByRole('button', { name: 'Erste' })).toBeVisible()

    await page.getByLabel(t('applications.filter.status')).selectOption({ label: t('applications.statuses.interview') })
    await expect(page.getByRole('button', { name: 'Erste' })).toHaveCount(0)
    await page.getByLabel(t('applications.filter.status')).selectOption({ label: t('applications.filter.all') })

    await page.getByRole('radio', { name: t('applications.views.list') }).click()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('table').getByText('Alpha AG')).toBeVisible()
    await expect(page.getByRole('table').getByText('Beta GmbH')).toBeVisible()
  })

  test('the board works with the keyboard: a card opens with Enter, Esc returns to the card, its small actions show while it has the focus', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, {})
    await open(member)
    const card = column(member, 'draft').getByRole('button', { name: 'Entwicklerin' })
    const preview = column(member, 'draft').getByRole('button', { name: t('applications.dossier.preview') })
    await expect.poll(() => preview.evaluate((element) => getComputedStyle(element.parentElement!).opacity)).toBe('0')
    await card.focus()
    // The actions are not hidden from someone who has no mouse
    await expect.poll(() => preview.evaluate((element) => getComputedStyle(element.parentElement!).opacity)).toBe('1')
    await page.keyboard.press('Enter')
    const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
    await expect(details).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(details).toBeHidden()
    await expect(card).toBeFocused()
  })
})

test.describe('timeline', () => {
  test('an event needs a title (shown while typing), appears in the list, and is deleted only after a question', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, {})
    await open(member)
    await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
    const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
    await details.getByRole('tab', { name: new RegExp(t('applications.timeline.title')) }).click()
    const title = details.getByLabel(t('applications.timeline.eventTitle'), { exact: true })
    await title.pressSequentially('x')
    await title.fill('')
    await expect(title).toHaveAttribute('aria-invalid', 'true')
    await title.pressSequentially('Telefonat mit der Personalabteilung')
    await details.getByLabel(t('applications.timeline.note'), { exact: true }).fill('Rückruf nächste Woche')
    await details.getByRole('button', { name: t('common.add') }).click()
    await expect(details.getByText('Telefonat mit der Personalabteilung', { exact: true })).toBeVisible()
    await expect(details.getByText('Rückruf nächste Woche')).toBeVisible()

    await details.getByRole('button', { name: `${t('common.delete')}: Telefonat mit der Personalabteilung` }).click()
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('applications.timeline.deleteConfirm', { title: 'Telefonat mit der Personalabteilung' }))
    await ask.getByRole('button', { name: t('common.cancel') }).click()
    await expect(ask).toBeHidden()
    await expect(details.getByText('Telefonat mit der Personalabteilung', { exact: true })).toBeVisible()
    await details.getByRole('button', { name: `${t('common.delete')}: Telefonat mit der Personalabteilung` }).click()
    await ask.getByRole('button', { name: t('common.delete') }).click()
    await expect(details.getByText('Telefonat mit der Personalabteilung', { exact: true })).toHaveCount(0)
  })
})

test.describe("the dossier: filed version and today's state", () => {
  test("without a filed version the preview says it shows today's state; with one it shows the filed version and says so, and switching is one click each way", async ({ member }) => {
    const { page, t } = member
    await apiOk(page, 'PUT', '/api/profile', { firstName: 'Erika', lastName: 'Mustermann' })
    const created = await createApplication(member, {})
    await open(member)
    await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
    const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
    await details.getByRole('tab', { name: new RegExp(t('applications.dossier.title')) }).click()
    await expect(details.getByText(t('applications.dossier.liveBadge'))).toBeVisible()

    // No filed version: today's state, and the text says that no version is filed
    await details.getByRole('button', { name: t('applications.dossier.preview') }).click()
    const source = page.getByTestId('dossier-source')
    await expect(source).toContainText(t('applications.dossier.sourceCurrentBadge'))
    await expect(source).toContainText(t('applications.dossier.sourceNoArchiveText'))
    await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()
    // Esc closes only the preview; the details stay
    await page.keyboard.press('Escape')
    await expect(source).toBeHidden()
    await expect(details).toBeVisible()

    // Sending the application files the dossier
    await details.getByLabel(t('applications.fields.status'), { exact: true }).selectOption({ label: t('applications.statuses.applied') })
    await expect.poll(async () => (await applicationOf(member, created.id)).hasArchivedPdf).toBe(true)
    await expect(details.getByText(t('applications.dossier.frozenBadge'))).toBeVisible()

    await details.getByRole('button', { name: t('applications.dossier.preview') }).click()
    await expect(source).toContainText(t('applications.dossier.sourceArchivedBadge'))
    await expect(source).toContainText(t('applications.dossier.sourceArchivedText'))
    await page.getByRole('button', { name: t('applications.dossier.viewCurrent') }).click()
    await expect(source).toContainText(t('applications.dossier.sourceCurrentBadge'))
    await expect(source).toContainText(t('applications.dossier.sourceCurrentText'))
    await page.getByRole('button', { name: t('applications.dossier.viewArchived') }).click()
    await expect(source).toContainText(t('applications.dossier.sourceArchivedBadge'))
    await page.keyboard.press('Escape')
    await expect(source).toBeHidden()

    // Replacing the filed version is asked about; cancelling files nothing
    const archived: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/dossier/archive')) archived.push(request.url())
    })
    await details.getByRole('button', { name: t('applications.dossier.archiveNow') }).click()
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('applications.dossier.replaceTitle'))
    await ask.getByRole('button', { name: t('common.cancel') }).click()
    await expect(ask).toBeHidden()
    expect(archived).toEqual([])
    await details.getByRole('button', { name: t('applications.dossier.archiveNow') }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: t('applications.dossier.replaceConfirm') }).click()
    await expect.poll(() => archived.length).toBe(1)
    expect(archived[0]).toContain('replace=true')
  })
})

test.describe('attachments', () => {
  test('upload a PDF: the title comes from the file name, it is listed, can be attached to an application and deleted after a question', async ({ member }) => {
    const { page, t } = member
    const pdf = await cvPdfBytes(page)
    await open(member)
    await page.getByRole('button', { name: t('applications.attachments.manage') }).click()
    const dialog = page.getByRole('dialog', { name: t('attachments.title') })
    await expect(dialog.getByText(t('attachments.empty'))).toBeVisible()
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'Arbeitszeugnis Muster.pdf', mimeType: 'application/pdf', buffer: pdf })
    await expect(dialog.getByLabel(t('attachments.fields.title'), { exact: true })).toHaveValue('Arbeitszeugnis Muster')
    await dialog.getByRole('button', { name: t('attachments.save') }).click()
    await expect(dialog.getByText('Arbeitszeugnis Muster', { exact: true })).toBeVisible()
    await expect(dialog.getByText(t('attachments.listCount', { count: 1 }))).toBeVisible()
    await dialog.getByRole('button', { name: t('common.close') }).last().click()

    // Attach it to a new application
    await page.getByRole('button', { name: t('applications.newApplication') }).first().click()
    const form = page.getByRole('dialog', { name: t('applications.createTitle') })
    await form.getByLabel(t('applications.fields.jobTitle'), { exact: true }).fill('Mit Anlage')
    await form.getByLabel(t('applications.fields.company'), { exact: true }).fill('Anlagen AG')
    await form.getByRole('checkbox', { name: /Arbeitszeugnis Muster/ }).check()
    await form.getByRole('button', { name: t('applications.actions.save') }).click()
    const details = page.getByRole('dialog', { name: 'Mit Anlage – Anlagen AG' })
    await details.getByRole('tab', { name: new RegExp(t('applications.dossier.title')) }).click()
    await expect(details.getByText(t('applications.attachments.count_one', { count: 1 }))).toBeVisible()
    await details.getByRole('button', { name: t('common.close') }).last().click()

    // Deleting names what happens to applications that have it attached
    await page.getByRole('button', { name: t('applications.attachments.manage') }).click()
    await dialog.getByRole('button', { name: deleteAttachment(t) }).click()
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('attachments.deleteConfirm', { title: 'Arbeitszeugnis Muster' }))
    await ask.getByRole('button', { name: t('common.cancel') }).click()
    await expect(ask).toBeHidden()
    await dialog.getByRole('button', { name: deleteAttachment(t) }).click()
    await ask.getByRole('button', { name: t('common.delete') }).click()
    await expect(dialog.getByText(t('attachments.empty'))).toBeVisible()
  })

  test('a file that is no PDF is refused with a complete, copyable message and nothing is stored', async ({ member }) => {
    const { page, t } = member
    await open(member)
    await page.getByRole('button', { name: t('applications.attachments.manage') }).click()
    const dialog = page.getByRole('dialog', { name: t('attachments.title') })
    await dialog.locator('input[type="file"]').setInputFiles({ name: 'falsch.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Das ist kein PDF, nur Text.') })
    await dialog.getByRole('button', { name: t('attachments.save') }).click()
    const error = page.getByTestId('error-dialog')
    const errorDialog = page.getByRole('alertdialog').filter({ has: error })
    await expect(error).toBeVisible()
    // The specific answer of the server, not only the generic title: what is wrong, the code, and the trace id
    await expect(error).toContainText('Dateiformat wird nicht unterstützt')
    await expect(error).toContainText('file.invalid_format')
    await expectNotTruncated(error, 'the upload refusal')
    await expect(errorDialog.getByTestId('copy-button')).toBeVisible()
    expect(await apiOk<unknown[]>(page, 'GET', '/api/attachments')).toEqual([])
  })
})
