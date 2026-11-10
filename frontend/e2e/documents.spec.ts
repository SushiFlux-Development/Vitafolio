import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { apiOk, failPuts, openAs, readDownload } from './support'

// The documents: the CV preview and its exports, and the cover letters (editor that saves by itself, save before preview, the guard
// against losing input that could not be saved, fold marks). Every test has an account of its own (fixtures.ts) and the German interface.

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path: string) => openAs(member.page, DISPLAY_NAME, path)

const isPdf = (bytes: Buffer) => bytes.subarray(0, 5).toString('latin1') === '%PDF-'
const isZip = (bytes: Buffer) => bytes.subarray(0, 2).toString('latin1') === 'PK'

interface Letter {
  id: string
  title: string
  body: string
  subject: string
  includeFoldMarks: boolean
}

const lettersOf = (member: Member) => apiOk<Letter[]>(member.page, 'GET', '/api/cover-letters')
const letterOf = (member: Member, id: string) => apiOk<Letter>(member.page, 'GET', `/api/cover-letters/${id}`)

async function seedProfile(member: Member) {
  await apiOk(member.page, 'PUT', '/api/profile', { firstName: 'Erika', lastName: 'Mustermann', professionalTitle: 'Entwicklerin', email: 'erika@example.com' })
  await apiOk(member.page, 'POST', '/api/profile/experiences', { jobTitle: 'Entwicklerin', employer: 'Muster GmbH', startDate: '2019-04', isCurrent: true, sortOrder: 0 })
}

test.describe('CV preview and export', () => {
  test('a new design is rendered again with that design; the PDF and the Word file are real files with the right names', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    await open(member, '/profile?tab=preview')
    await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()

    // Choosing "Modern" asks the server for a new picture with exactly that design
    const modern = page.waitForRequest((request) => request.url().endsWith('/api/profile/preview/pdf') && (request.postDataJSON() as { design?: string }).design === 'modern')
    await page.getByTestId('design-gallery-toggle').click()
    await page.getByRole('radio', { name: t('profile.preview.designs.modern') }).click()
    await modern
    await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()

    // The PDF export
    const pdf = page.waitForEvent('download')
    await page.getByRole('button', { name: t('profile.preview.download') }).click()
    const pdfFile = await pdf
    expect(pdfFile.suggestedFilename()).toBe('Lebenslauf_Erika_Mustermann.pdf')
    const pdfBytes = await readDownload(pdfFile)
    expect(isPdf(pdfBytes), 'starts like a PDF').toBe(true)
    expect(pdfBytes.length).toBeGreaterThan(2_000)

    // The Word export: a zip package with the document part inside
    const docx = page.waitForEvent('download')
    await page.getByRole('button', { name: t('profile.preview.downloadDocx') }).click()
    const docxFile = await docx
    expect(docxFile.suggestedFilename()).toBe('Lebenslauf_Erika_Mustermann.docx')
    const docxBytes = await readDownload(docxFile)
    expect(isZip(docxBytes), 'starts like a zip package').toBe(true)
    expect(docxBytes.includes(Buffer.from('word/document.xml'))).toBe(true)

    // The English CV is named like one
    await page.getByRole('radio', { name: t('profile.preview.languageEn') }).click()
    const english = page.waitForEvent('download')
    await page.getByRole('button', { name: t('profile.preview.download') }).click()
    expect((await english).suggestedFilename()).toBe('Resume_Erika_Mustermann.pdf')
  })

  test('a failing render is told in full with a way to try again (the server refuses an unknown design)', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    await open(member, '/profile?tab=preview')
    await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()
    // Answer the next render with a failure, as a server with a problem would
    await page.route('**/api/profile/preview/pdf', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'render.failed', detail: 'Der Lebenslauf konnte nicht erzeugt werden: Test-Fehler mit einer langen Erklärung, damit man sieht, dass nichts abgeschnitten wird.' }) }), { times: 1 })
    await page.getByRole('button', { name: t('profile.preview.refresh') }).click()
    const notice = page.getByTestId('error-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(t('preview.failed'))
    await expect(page.getByTestId('copy-button')).toBeVisible()
    await page.getByRole('button', { name: t('preview.retry') }).click()
    await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()
    await expect(notice).toHaveCount(0)
  })
})

test.describe('cover letters', () => {
  test('a new letter opens in the editor with the profile data; required fields turn red while typing and the letter is listed', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    await open(member, '/cover-letters')
    await expect(page.getByText(t('coverLetters.empty'))).toBeVisible()
    await page.getByRole('button', { name: t('coverLetters.newLetter') }).first().click()
    await expect(page.getByRole('heading', { name: t('coverLetters.fields.recipientSection'), level: 2 })).toBeVisible()
    // The sender comes from the master profile
    await expect(page.getByLabel(t('coverLetters.fields.senderName'), { exact: true })).toHaveValue('Erika Mustermann')
    await expect(page.getByLabel(t('coverLetters.fields.senderEmail'), { exact: true })).toHaveValue('erika@example.com')

    const subject = page.getByLabel(t('coverLetters.fields.subject'), { exact: true })
    await subject.fill('')
    await expect(subject).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByText(t('rules.field.required')).first()).toBeVisible()
    await subject.pressSequentially('Bewerbung als Entwicklerin')
    await expect(subject).not.toHaveAttribute('aria-invalid', 'true')

    const email = page.getByLabel(t('coverLetters.fields.senderEmail'), { exact: true })
    await email.fill('erika mail')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await email.fill('erika@example.com')

    // No button to press: the letter saves by itself
    await expect(page.getByRole('button', { name: t('common.save'), exact: true })).toHaveCount(0)
    await expect.poll(async () => (await lettersOf(member)).map((letter) => letter.subject)).toEqual(['Bewerbung als Entwicklerin'])
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
  })

  test('a changed letter is saved BEFORE the preview is drawn, so what is seen is what is stored', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    const created = await apiOk<Letter>(page, 'POST', '/api/cover-letters', { title: 'Entwurf', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Alt', salutation: 'Guten Tag', body: 'Alter Text' })
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Entwurf' }).first().click()

    const order: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (request.method() === 'PUT' && url.pathname === `/api/cover-letters/${created.id}`) order.push('save')
      if (request.method() === 'POST' && url.pathname === `/api/cover-letters/${created.id}/preview/pdf`) order.push('preview')
    })
    await page.getByLabel(t('coverLetters.fields.body'), { exact: true }).fill('Neuer Text, noch nicht gespeichert')
    await page.getByRole('tab', { name: t('coverLetters.tabs.preview') }).click()
    await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()
    expect(order, 'the save goes first, then the preview').toEqual(['save', 'preview'])
    expect((await letterOf(member, created.id)).body).toBe('Neuer Text, noch nicht gespeichert')

    // Back in the editor everything is saved
    await page.getByRole('tab', { name: t('coverLetters.tabs.editor') }).click()
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
  })

  test('a letter with a missing required field is NOT sent for the preview: the fields say what is missing', async ({ member }) => {
    const { page, t } = member
    await apiOk(page, 'POST', '/api/cover-letters', { title: 'Lücke', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text' })
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Lücke' }).first().click()
    await page.getByLabel(t('coverLetters.fields.salutation'), { exact: true }).fill('')
    const sent: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/api/cover-letters/')) sent.push(`${request.method()} ${new URL(request.url()).pathname}`)
    })
    await page.getByRole('tab', { name: t('coverLetters.tabs.preview') }).click()
    await expect(page.getByLabel(t('coverLetters.fields.salutation'), { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('tab', { name: t('coverLetters.tabs.editor') })).toHaveAttribute('aria-selected', 'true')
    expect(sent).toEqual([])
  })

  test('leaving after typing asks nothing - the text is saved on the way; only input that could not be saved is asked about', async ({ member }) => {
    const { page, t } = member
    const created = await apiOk<Letter>(page, 'POST', '/api/cover-letters', { title: 'Frage', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text' })
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Frage' }).first().click()
    const body = page.getByLabel(t('coverLetters.fields.body'), { exact: true })

    // Typed and straight out again: no question, the text is on the server
    await body.fill('Nur getippt')
    await page.getByRole('button', { name: t('coverLetters.actions.backToList') }).click()
    await expect(page.getByRole('button', { name: 'Frage' }).first()).toBeVisible()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    expect((await letterOf(member, created.id)).body).toBe('Nur getippt')

    // The server does not take the next input: now the question comes - the back button and the navigation alike
    await page.getByRole('button', { name: 'Frage' }).first().click()
    await failPuts(page, `**/api/cover-letters/${created.id}`)
    await body.fill('Nicht speicherbar')
    await expect(page.getByText(t('autoSave.retrying'))).toBeVisible()

    await page.getByRole('button', { name: t('coverLetters.actions.backToList') }).click()
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('autoSave.leave.title'))
    await ask.getByRole('button', { name: t('common.cancel') }).click()
    await expect(body).toHaveValue('Nicht speicherbar')

    await page.getByRole('link', { name: t('nav.profile') }).click()
    await expect(page.getByRole('alertdialog')).toContainText(t('autoSave.leave.title'))
    await page.getByRole('alertdialog').getByRole('button', { name: t('common.cancel') }).click()
    await expect(page).toHaveURL(/\/cover-letters/)

    await page.getByRole('button', { name: t('coverLetters.actions.backToList') }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: t('autoSave.leave.confirm') }).click()
    await expect(page.getByRole('button', { name: 'Frage' }).first()).toBeVisible()
    expect((await letterOf(member, created.id)).body, 'the server still has the earlier text').toBe('Nur getippt')
    // ...and the typed text waits in the local copy
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('cv.draft.') && key.includes('.coverLetter.')))).toHaveLength(1)
  })

  test('fold and punch marks: the switch is saved with the letter by itself and is still on after a reload', async ({ member }) => {
    const { page, t } = member
    const created = await apiOk<Letter>(page, 'POST', '/api/cover-letters', { title: 'Falz', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text', includeFoldMarks: false })
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Falz' }).first().click()
    const marks = page.getByRole('switch', { name: t('coverLetters.fields.foldMarks') })
    await expect(marks).toHaveAttribute('aria-checked', 'false')
    await marks.click()
    await expect(marks).toHaveAttribute('aria-checked', 'true')
    await expect.poll(async () => (await letterOf(member, created.id)).includeFoldMarks).toBe(true)

    await page.reload()
    await page.getByRole('button', { name: 'Falz' }).first().click()
    await expect(page.getByRole('switch', { name: t('coverLetters.fields.foldMarks') })).toHaveAttribute('aria-checked', 'true')

    // And off again: the same way back
    await page.getByRole('switch', { name: t('coverLetters.fields.foldMarks') }).click()
    await expect.poll(async () => (await letterOf(member, created.id)).includeFoldMarks).toBe(false)
  })

  test('the export saves first and hands over a real PDF and a real Word file; deleting asks', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    const created = await apiOk<Letter>(page, 'POST', '/api/cover-letters', { title: 'Export', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text' })
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Export' }).first().click()
    await page.getByLabel(t('coverLetters.fields.body'), { exact: true }).fill('Beim Export mitgespeichert')

    const pdf = page.waitForEvent('download')
    await page.getByRole('button', { name: t('coverLetters.actions.downloadPdf') }).click()
    const pdfFile = await pdf
    expect(isPdf(await readDownload(pdfFile))).toBe(true)
    expect(pdfFile.suggestedFilename()).toMatch(/\.pdf$/)
    expect((await letterOf(member, created.id)).body).toBe('Beim Export mitgespeichert')

    const docx = page.waitForEvent('download')
    await page.getByRole('button', { name: t('coverLetters.actions.downloadDocx') }).click()
    const docxFile = await docx
    expect(isZip(await readDownload(docxFile))).toBe(true)
    expect(docxFile.suggestedFilename()).toMatch(/\.docx$/)

    // Deleting names the letter and can be cancelled
    await page.getByRole('button', { name: t('common.delete'), exact: true }).click()
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('coverLetters.deleteConfirm', { title: 'Export' }))
    await ask.getByRole('button', { name: t('common.cancel') }).click()
    await expect(ask).toBeHidden()
    expect(await lettersOf(member)).toHaveLength(1)
    await page.getByRole('button', { name: t('common.delete'), exact: true }).click()
    await ask.getByRole('button', { name: t('common.delete') }).click()
    await expect(page.getByText(t('coverLetters.empty'))).toBeVisible()
    expect(await lettersOf(member)).toHaveLength(0)
  })
})
