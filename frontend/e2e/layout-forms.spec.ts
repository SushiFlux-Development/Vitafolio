import { test as plain } from '@playwright/test'
import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { LANGUAGES, dateIn } from './labels'
import { apiOk, expectNothingMoves, failPuts, openApp, openAs, settledLayout } from './support'

// "Nothing moves" for the forms and dialogs of the profile, the documents, the tracker and the AI helpers: when a live hint, a
// server answer, a notice or a mark appears, changes or goes away, nothing around it moves, grows or shrinks - in German and in
// English, at 1024 px (the narrowest supported window, where German wraps most). Every test has an account of its own.
//
// What is NOT a message and therefore not measured here: a dialog opening over the page (it is a new screen with buttons of its
// own) and a list that grows by the entry the user just added.
test.use({ viewport: { width: 1024, height: 768 } })

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path: string) => openAs(member.page, DISPLAY_NAME, path)

for (const language of LANGUAGES) {
  test.describe(language, () => {
    test.use({ language })
    // The date fields take digits only and add the separators themselves, in the notation of the language
    const dates = dateIn(language)

    // ---- the master profile ----------------------------------------------------------------------------------------------------

    test('personal data: the live hints move nothing', async ({ member }) => {
      const { page, t } = member
      await open(member, '/profile')
      const field = (key: string) => page.getByLabel(t(key), { exact: true })
      await expect(field('profile.personal.email')).toBeVisible()
      // The status line has its own test below: here it is measured as well (it changes with the hints), the room is reserved
      await field('profile.personal.firstName').fill('Zoe')
      await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
      const before = await settledLayout(page)

      await expectNothingMoves(page, 'a blank in the e-mail address', () => field('profile.personal.email').fill('erika mail'), before)
      await expectNothingMoves(page, 'the required last name emptied', () => field('profile.personal.lastName').fill(''), before)
      await expectNothingMoves(page, 'a wrong link', () => field('profile.personal.website').fill('ftp://x'), before)
      await expectNothingMoves(page, 'a day that does not exist', () => field('profile.personal.dateOfBirth').fill(dates.digits(1990, 2, 30)), before)
      await expectNothingMoves(
        page,
        'everything corrected again',
        async () => {
          await field('profile.personal.email').fill('erika@example.com')
          await field('profile.personal.lastName').fill('Mustermann')
          await field('profile.personal.website').fill('')
          await field('profile.personal.dateOfBirth').fill('')
        },
        before,
      )
    })

    test('personal data: every state of the status line moves nothing; it sits in the header line of the card, and no empty band lies above the first field', async ({ member }) => {
      const { page, t } = member
      await open(member, '/profile')
      const card = page.locator('form').filter({ has: page.getByRole('heading', { name: t('profile.personal.title'), level: 2 }) })
      const title = card.getByRole('heading', { name: t('profile.personal.title'), level: 2 })
      const firstGroup = card.getByRole('heading', { name: t('profile.personal.nameHeading'), level: 3 })
      const box = async (locator: ReturnType<typeof card.locator>) => (await locator.boundingBox())!
      const field = (key: string) => page.getByLabel(t(key), { exact: true })
      await expect(card.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
      const before = await settledLayout(page)

      // The header line is title and sentence; the first group follows with the normal spacing of the card, nothing reserved in between
      const subtitle = card.locator('p').first()
      const gap = (await box(firstGroup)).y - ((await box(subtitle)).y + (await box(subtitle)).height)
      expect(gap, 'distance between the sentence under the title and the first group').toBeLessThanOrEqual(32)

      const insideHeader = async (mark: ReturnType<typeof card.locator>, what: string) => {
        const markBox = await box(mark)
        const top = (await box(title)).y
        const bottom = (await box(subtitle)).y + (await box(subtitle)).height
        expect(markBox.y, `${what}: not above the header line`).toBeGreaterThanOrEqual(top - 4)
        expect(markBox.y + markBox.height, `${what}: not below the header line`).toBeLessThanOrEqual(bottom + 4)
        expect(markBox.x, `${what}: right of the title`).toBeGreaterThan((await box(title)).x)
      }
      await insideHeader(card.getByText(t('autoSave.saved'), { exact: true }), 'saved')

      await expectNothingMoves(
        page,
        'both names emptied (the status names what is missing)',
        async () => {
          await field('profile.personal.firstName').fill('')
          await field('profile.personal.lastName').fill('')
          await expect(card.getByText(t('profile.personal.autoSave.namesMissing'))).toBeVisible()
        },
        before,
      )
      await insideHeader(card.getByText(t('profile.personal.autoSave.namesMissing')), 'names missing')

      // The server does not take the input: "not saved, trying again" with the button for the complete error
      const stopFailing = await failPuts(page, '**/api/profile')
      await expectNothingMoves(
        page,
        'the server does not take the input (the status says it is trying again)',
        async () => {
          await field('profile.personal.firstName').fill('Zoe')
          await field('profile.personal.lastName').fill('Muster')
          await expect(card.getByText(t('autoSave.retrying'))).toBeVisible()
        },
        before,
      )
      await insideHeader(card.getByText(t('autoSave.retrying')), 'trying again')

      await stopFailing()
      await expectNothingMoves(
        page,
        'the next try gets through (the status is quiet again)',
        async () => {
          await expect(card.getByText(t('autoSave.saved'), { exact: true })).toBeVisible({ timeout: 15_000 })
        },
        before,
      )
    })

    test('a position in its dialog: month hints and the current-position switch move nothing', async ({ member }) => {
      const { page, t } = member
      await open(member, '/profile?tab=experiences')
      await page.getByRole('button', { name: t('profile.experiences.add') }).first().click()
      const dialog = page.getByRole('dialog')
      const field = (key: string) => dialog.getByLabel(t(key), { exact: true })
      await expect(field('profile.experiences.jobTitle')).toBeVisible()
      const before = await settledLayout(page)

      await expectNothingMoves(
        page,
        'a required field typed in and emptied again',
        async () => {
          await field('profile.experiences.jobTitle').pressSequentially('x')
          await field('profile.experiences.jobTitle').fill('')
          await expect(dialog.getByText(t('rules.field.required')).first()).toBeVisible()
        },
        before,
      )
      await expectNothingMoves(
        page,
        'a month with a letter in it',
        async () => {
          await field('profile.experiences.startDate').fill(dates.monthDigits(2020, 0))
          await expect(dialog.getByText(t(dates.invalidMonth)).first()).toBeVisible()
        },
        before,
      )
      await expectNothingMoves(page, 'an end date with a wrong month', () => field('profile.experiences.endDate').fill(dates.monthDigits(2020, 0)), before)
      await expectNothingMoves(page, 'the current-position switch (the end date is disabled, not removed)', () => dialog.getByRole('switch', { name: t('profile.experiences.isCurrent') }).click(), before)
      await expectNothingMoves(
        page,
        'everything emptied again',
        async () => {
          await field('profile.experiences.startDate').fill('')
          await field('profile.experiences.jobTitle').fill('')
        },
        before,
      )
    })

    test('JSON Resume: the invalid-JSON hint and the answers of the server move nothing', async ({ member }) => {
      const { page, t } = member
      await open(member, '/profile')
      await page.getByRole('button', { name: t('profile.jsonResume.button') }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('radio', { name: t('profile.jsonResume.importMode') }).click()
      const paste = dialog.getByLabel(t('profile.jsonResume.pasteLabel'), { exact: true })
      await expect(paste).toBeVisible()
      const before = await settledLayout(page)

      await expectNothingMoves(page, 'half a document typed (no hint yet)', () => paste.pressSequentially('{ "basics": '), before)
      await expectNothingMoves(
        page,
        'the field left: the invalid-JSON hint',
        async () => {
          await dialog.getByRole('radio', { name: t('profile.jsonResume.importMode') }).focus()
          await expect(dialog.getByText(t('rules.json.invalid'))).toBeVisible()
        },
        before,
      )
      await expectNothingMoves(
        page,
        'valid JSON the server refuses (an answer in the alert slot)',
        async () => {
          await paste.fill(JSON.stringify({ basics: { name: '' }, work: [{ name: '', position: '', startDate: 'kein Datum' }] }))
          await dialog.getByRole('button', { name: t('profile.jsonResume.importButton') }).click()
          await expect(dialog.getByTestId('error-notice')).toBeVisible()
        },
        before,
      )
      await expectNothingMoves(
        page,
        'valid JSON the server takes (the success notice)',
        async () => {
          await paste.fill(JSON.stringify({ basics: { name: 'Max Muster', email: 'max@example.com' } }))
          await dialog.getByRole('button', { name: t('profile.jsonResume.importButton') }).click()
          await expect(dialog.getByText(t('profile.jsonResume.importSuccess'))).toBeVisible()
        },
        before,
      )
    })

    // ---- the documents -----------------------------------------------------------------------------------------------------------

    test('a cover letter: required hints, the sender e-mail hint and the status line move nothing', async ({ member }) => {
      const { page, t } = member
      await apiOk(page, 'POST', '/api/cover-letters', { title: 'Layout', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text' })
      await open(member, '/cover-letters')
      await page.getByRole('button', { name: 'Layout' }).first().click()
      const field = (key: string) => page.getByLabel(t(key), { exact: true })
      await expect(field('coverLetters.fields.subject')).toBeVisible()
      const before = await settledLayout(page)

      await expectNothingMoves(page, 'the subject emptied', () => field('coverLetters.fields.subject').fill(''), before)
      await expectNothingMoves(page, 'the salutation emptied', () => field('coverLetters.fields.salutation').fill(''), before)
      await expectNothingMoves(page, 'the body emptied', () => field('coverLetters.fields.body').fill(''), before)
      await expectNothingMoves(page, 'a blank in the sender e-mail', () => field('coverLetters.fields.senderEmail').fill('a b'), before)
      await expectNothingMoves(
        page,
        'everything corrected (the status goes back to "saved")',
        async () => {
          await field('coverLetters.fields.subject').fill('Betreff')
          await field('coverLetters.fields.salutation').fill('Guten Tag')
          await field('coverLetters.fields.body').fill('Neuer Text')
          await field('coverLetters.fields.senderEmail').fill('')
          await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
        },
        before,
      )

      // The server does not take the input: the status says it is trying again, with the button for the complete error
      const stopFailing = await failPuts(page, '**/api/cover-letters/*')
      await expectNothingMoves(
        page,
        'the server does not take the input (the status says it is trying again)',
        async () => {
          await field('coverLetters.fields.subject').fill('Anderer Betreff')
          await expect(page.getByText(t('autoSave.retrying'))).toBeVisible()
        },
        before,
      )
      await stopFailing()
      await expectNothingMoves(
        page,
        'the next try gets through',
        async () => {
          await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible({ timeout: 15_000 })
        },
        before,
      )
    })

    // ---- the tracker -----------------------------------------------------------------------------------------------------------

    test('an application: every live hint and the red submit move nothing', async ({ member }) => {
      const { page, t } = member
      await open(member, '/applications')
      await page.getByRole('button', { name: t('applications.newApplication') }).first().click()
      const dialog = page.getByRole('dialog')
      const field = (key: string) => dialog.getByLabel(t(key), { exact: true })
      await expect(field('applications.fields.jobTitle')).toBeVisible()
      const before = await settledLayout(page)

      await expectNothingMoves(
        page,
        'the job title typed in and emptied',
        async () => {
          await field('applications.fields.jobTitle').pressSequentially('x')
          await field('applications.fields.jobTitle').fill('')
        },
        before,
      )
      await expectNothingMoves(page, 'a blank in the e-mail', () => field('applications.fields.contactEmail').fill('a b'), before)
      await expectNothingMoves(page, 'a wrong link', () => field('applications.fields.jobPostingUrl').fill('ftp://x'), before)
      await expectNothingMoves(page, 'a day that does not exist', () => field('applications.fields.followUpAt').fill(dates.digits(2026, 2, 30)), before)
      await expectNothingMoves(page, 'a year out of range', () => field('applications.fields.followUpAt').fill(dates.digits(1999, 1, 1)), before)
      await expectNothingMoves(
        page,
        'a red submit marks every untouched field',
        async () => {
          await dialog.getByRole('button', { name: t('applications.actions.save') }).click()
          await expect(field('applications.fields.company')).toHaveAttribute('aria-invalid', 'true')
        },
        before,
      )
      await expectNothingMoves(
        page,
        'everything corrected',
        async () => {
          await field('applications.fields.contactEmail').fill('')
          await field('applications.fields.jobPostingUrl').fill('')
          await field('applications.fields.followUpAt').fill('')
          await field('applications.fields.jobTitle').fill('Entwicklerin')
          await field('applications.fields.company').fill('Muster GmbH')
        },
        before,
      )
    })

    test('the timeline form of an application moves nothing', async ({ member }) => {
      const { page, t } = member
      await apiOk(page, 'POST', '/api/applications', { jobTitle: 'Entwicklerin', company: 'Muster GmbH', status: 'draft' })
      await open(member, '/applications')
      await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
      const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
      await details.getByRole('tab', { name: new RegExp(t('applications.timeline.title')) }).click()
      const title = details.getByLabel(t('applications.timeline.eventTitle'), { exact: true })
      await expect(title).toBeVisible()
      const before = await settledLayout(page)
      await expectNothingMoves(
        page,
        'the event title typed in and emptied (required)',
        async () => {
          await title.pressSequentially('x')
          await title.fill('')
        },
        before,
      )
      await expectNothingMoves(
        page,
        'a red add',
        async () => {
          await details.getByRole('button', { name: t('common.add') }).click()
          await expect(title).toHaveAttribute('aria-invalid', 'true')
        },
        before,
      )
    })

    test('the dossier preview bar keeps its size and place whichever version it names', async ({ member }) => {
      const { page, t } = member
      await apiOk(page, 'PUT', '/api/profile', { firstName: 'Erika', lastName: 'Mustermann' })
      const created = await apiOk<{ id: string }>(page, 'POST', '/api/applications', { jobTitle: 'Entwicklerin', company: 'Muster GmbH', status: 'draft' })
      await apiOk(page, 'POST', `/api/applications/${created.id}/dossier/archive`)
      await open(member, '/applications')
      await page.getByRole('button', { name: 'Entwicklerin' }).first().click()
      const details = page.getByRole('dialog', { name: 'Entwicklerin – Muster GmbH' })
      await details.getByRole('tab', { name: new RegExp(t('applications.dossier.title')) }).click()
      await details.getByRole('button', { name: t('applications.dossier.preview') }).click()
      const source = page.getByTestId('dossier-source')
      await expect(source).toContainText(t('applications.dossier.sourceArchivedBadge'))
      await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()
      // The dialog scales in while it opens: measure once the bar has stopped moving
      const settledBox = async () => {
        let last: string | undefined
        await expect.poll(async () => { const now = JSON.stringify(await source.boundingBox()); const same = now === last; last = now; return same }, { message: 'the version bar stopped moving' }).toBe(true)
        return (await source.boundingBox())!
      }
      const box = await settledBox()
      await page.getByRole('button', { name: t('applications.dossier.viewCurrent') }).click()
      await expect(source).toContainText(t('applications.dossier.sourceCurrentBadge'))
      const after = await settledBox()
      expect(after!.height, 'the version bar keeps its height').toBeCloseTo(box!.height, 1)
      expect(after!.width, 'the version bar keeps its width').toBeCloseTo(box!.width, 1)
      expect(after!.y, 'the version bar keeps its place').toBeCloseTo(box!.y, 1)
    })

    test('attachments: choosing a file with a realistic name moves nothing', async ({ member }) => {
      const { page, t } = member
      await open(member, '/applications')
      await page.getByRole('button', { name: t('applications.attachments.manage') }).click()
      const dialog = page.getByRole('dialog', { name: t('attachments.title') })
      await expect(dialog.getByText(t('attachments.noFile'))).toBeVisible()
      const before = await settledLayout(page)
      await expectNothingMoves(
        page,
        'a file chosen (its name and size appear next to the button)',
        async () => {
          await dialog.locator('input[type="file"]').setInputFiles({ name: 'Arbeitszeugnis Muster GmbH 2025.pdf', mimeType: 'application/pdf', buffer: Buffer.from('kein PDF') })
          await expect(dialog.getByText(/Arbeitszeugnis Muster GmbH 2025/)).toBeVisible()
        },
        before,
      )
    })

    test('attachments: a very long file name is cut inside its line and pushes nothing', async ({ member }) => {
      const { page, t } = member
      await open(member, '/applications')
      await page.getByRole('button', { name: t('applications.attachments.manage') }).click()
      const dialog = page.getByRole('dialog', { name: t('attachments.title') })
      await expect(dialog.getByText(t('attachments.noFile'))).toBeVisible()
      const before = await settledLayout(page)
      await expectNothingMoves(
        page,
        'a file with a very long name chosen',
        async () => {
          await dialog.locator('input[type="file"]').setInputFiles({
            name: 'ein-sehr-langer-dateiname-wie-ihn-gescannte-unterlagen-manchmal-haben-ohne-leerzeichen-aber-mit-vielen-woertern.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('kein PDF'),
          })
          await expect(dialog.getByText(/ein-sehr-langer-dateiname/)).toBeVisible()
        },
        before,
      )
    })

    // ---- the AI helpers ------------------------------------------------------------------------------------------------------------

    test('the AI assistant: the copy confirmation appearing moves nothing', async ({ member }) => {
      const { page, t, context } = member
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await open(member, '/profile')
      await page.getByRole('button', { name: t('ai.entry.summary') }).click()
      const dialog = page.getByRole('dialog', { name: t('ai.tasks.summary') })
      await expect(dialog.getByRole('button', { name: t('ai.assistant.copyPrompt') })).toBeVisible()
      const before = await settledLayout(page)
      await expectNothingMoves(
        page,
        'the prompt copied (the confirmation appears, the button says "Kopiert")',
        async () => {
          await dialog.getByRole('button', { name: t('ai.assistant.copyPrompt') }).click()
          await expect(dialog.getByText(t('ai.assistant.promptCopied'))).toBeVisible()
        },
        before,
      )
    })

    test('the AI assistant: the refusal of a pasted answer and the result move nothing', async ({ member }) => {
      const { page, t, context } = member
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      await open(member, '/profile')
      await page.getByRole('button', { name: t('ai.entry.summary') }).click()
      const dialog = page.getByRole('dialog', { name: t('ai.tasks.summary') })
      // The copy confirmation is its own test above: it is on screen already when this one starts measuring
      await dialog.getByRole('button', { name: t('ai.assistant.copyPrompt') }).click()
      await expect(dialog.getByText(t('ai.assistant.promptCopied'))).toBeVisible()
      const before = await settledLayout(page)

      await expectNothingMoves(page, 'an answer pasted (the evaluate button becomes available)', () => dialog.getByLabel(t('ai.assistant.pasteAnswer'), { exact: true }).fill('kein JSON'), before)
      await expectNothingMoves(
        page,
        'the refusal of the answer (error in the alert slot)',
        async () => {
          await dialog.getByRole('button', { name: t('ai.assistant.parseAnswer') }).click()
          await expect(dialog.getByTestId('error-notice')).toBeVisible()
        },
        before,
      )
    })

    test('the AI settings: the model hint, the address hint and the line about saving before the test move nothing', async ({ member }) => {
      const { page, t } = member
      await open(member, '/')
      await page.getByRole('button', { name: t('nav.aiSettings') }).click()
      const dialog = page.getByRole('dialog', { name: t('ai.settingsTitle') })
      await dialog.getByLabel(t('ai.provider'), { exact: true }).selectOption({ label: t('ai.providers.lmstudio') })
      const model = dialog.getByLabel(t('ai.model'), { exact: true })
      await expect(model).toBeVisible()
      const before = await settledLayout(page)
      await expectNothingMoves(
        page,
        'the model typed in and emptied (required)',
        async () => {
          await model.pressSequentially('x')
          await model.fill('')
        },
        before,
      )
      await expectNothingMoves(page, 'a wrong address', () => dialog.getByLabel(t('ai.baseUrl'), { exact: true }).fill('localhost:1234'), before)
      await expectNothingMoves(
        page,
        'everything fine again (the line about saving before the test)',
        async () => {
          await dialog.getByLabel(t('ai.baseUrl'), { exact: true }).fill('http://localhost:1234/v1')
          await model.fill('mein-modell')
        },
        before,
      )
    })
  })
}

// ---- the update page (an administrator's page: the owner's saved session) ------------------------------------------------------------

for (const language of LANGUAGES) {
  plain(`update channel (${language}): choosing a channel changes its explanation and the image tag without moving anything around them`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('cv.language', value), language)
    await openApp(page, '/admin?tab=updates')
    try {
      await expect(page.getByTestId('update-channel')).toBeVisible()
      const before = await settledLayout(page)
      for (const channel of ['beta', 'nightly', 'none'] as const) {
        await expectNothingMoves(
          page,
          `the channel "${channel}" chosen (another explanation, another tag in the notice and the command)`,
          async () => {
            await page.getByTestId('update-channel').getByRole('radio').nth(['none', 'beta', 'nightly'].indexOf(channel)).click()
            await expect.poll(async () => (await apiOk<{ channel: string }>(page, 'GET', '/api/updates/status')).channel).toBe(channel)
          },
          before,
        )
      }
    } finally {
      await apiOk(page, 'PUT', '/api/admin/updates/channel', { channel: 'none' })
    }
  })
}
