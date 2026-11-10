import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { apiOk, openAs } from './support'

// The AI helpers over copy and paste (no account, no key): the prompt is prepared and copied, the answer pasted, checked and taken
// over. The entry points are the short profile, the bullet points of a position and the letter's translation. Every test has an
// account of its own and the German interface; nothing here needs an AI service.

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path: string) => openAs(member.page, DISPLAY_NAME, path)

const clipboardText = (member: Member) => member.page.evaluate(() => navigator.clipboard.readText())

test.describe('copy and paste', () => {
  test('short profile: the prompt is copied (without the real name), the pasted answer is checked, shown and taken over into the field', async ({ member }) => {
    const { page, t, context } = member
    await apiOk(page, 'PUT', '/api/profile', { firstName: 'Zyxwvut', lastName: 'Qrstuvw', email: 'zyxwvut@example.com' })
    await open(member, '/profile')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: t('ai.entry.summary') }).click()
    const dialog = page.getByRole('dialog', { name: t('ai.tasks.summary') })
    // No service is set up: copy and paste is the only way, so there is no choice to make
    await expect(dialog.getByRole('radiogroup', { name: t('ai.assistant.way') })).toHaveCount(0)

    await dialog.getByRole('button', { name: t('ai.assistant.copyPrompt') }).click()
    await expect(dialog.getByText(t('ai.assistant.promptCopied'))).toBeVisible()
    const prompt = await clipboardText(member)
    expect(prompt, 'the prompt names the answer format').toContain('shortSummary')
    expect(prompt, 'the real name stays on this computer').not.toContain('Zyxwvut')
    expect(prompt).not.toContain('Qrstuvw')

    // Nothing to evaluate yet: the button waits for an answer
    const evaluate = dialog.getByRole('button', { name: t('ai.assistant.parseAnswer') })
    await expect(evaluate).toBeDisabled()
    await dialog.getByLabel(t('ai.assistant.pasteAnswer'), { exact: true }).fill('Das ist kein JSON, sondern nur ein Satz.')
    await evaluate.click()
    // The refusal is specific, complete and copyable - and the form stays as it is
    const failure = dialog.getByTestId('error-notice')
    await expect(failure).toBeVisible()
    await expect(failure).toContainText(t('ai.assistant.parseFailed'))
    await expect(failure.getByTestId('copy-button')).toBeVisible()

    await dialog.getByLabel(t('ai.assistant.pasteAnswer'), { exact: true }).fill('```json\n{"shortSummary":"Erfahrene Entwicklerin mit Schwerpunkt Cloud.","bulletPoints":["Cloud","Teams"]}\n```')
    await evaluate.click()
    await expect(dialog.getByText('Erfahrene Entwicklerin mit Schwerpunkt Cloud.', { exact: true })).toBeVisible()
    await expect(failure).toHaveCount(0)
    await dialog.getByRole('button', { name: t('ai.assistant.applyToSummary') }).click()
    await expect(dialog).toBeHidden()
    // Taken over into the field - like typed input, so it is saved by itself
    await expect(page.getByLabel(t('profile.personal.bio'), { exact: true })).toHaveValue('Erfahrene Entwicklerin mit Schwerpunkt Cloud.')
    await expect.poll(async () => (await apiOk<{ bio: string | null }>(page, 'GET', '/api/profile')).bio).toBe('Erfahrene Entwicklerin mit Schwerpunkt Cloud.')
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
  })

  test('without the permission to use the clipboard the prompt is shown to copy by hand, and the notice says so', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile')
    await page.getByRole('button', { name: t('ai.entry.summary') }).click()
    const dialog = page.getByRole('dialog', { name: t('ai.tasks.summary') })
    // Both ways to the clipboard refuse, as in a browser that does not allow it at all
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true })
      document.execCommand = () => false
    })
    await dialog.getByRole('button', { name: t('ai.assistant.copyPrompt') }).click()
    await expect(dialog.getByText(t('ai.assistant.copyFailed'))).toBeVisible()
    const shown = dialog.getByLabel(t('ai.assistant.promptLabel'), { exact: true })
    await expect(shown).toBeVisible()
    await expect(shown).toHaveValue(/shortSummary/)
  })

  test('bullet points of a position: the improved line replaces the old one in the open form; Esc closes only the assistant', async ({ member }) => {
    const { page, t } = member
    await apiOk(page, 'POST', '/api/profile/experiences', { jobTitle: 'Entwicklerin', employer: 'Muster GmbH', startDate: '2019-04', isCurrent: true, description: 'Zuständig für Cloud-Migrationen', sortOrder: 0 })
    await open(member, '/profile?tab=experiences')
    await page.getByRole('button', { name: `${t('profile.experiences.edit')}: Entwicklerin` }).click()
    const form = page.getByRole('dialog', { name: t('profile.experiences.edit') })
    await form.getByRole('button', { name: t('ai.entry.improveBullets') }).click()
    const assistant = page.getByRole('dialog', { name: t('ai.tasks.improveBullet') })
    await expect(assistant).toBeVisible()

    // Esc closes the assistant only, the form behind it stays
    await page.keyboard.press('Escape')
    await expect(assistant).toBeHidden()
    await expect(form).toBeVisible()
    await form.getByRole('button', { name: t('ai.entry.improveBullets') }).click()

    await assistant.getByLabel(t('ai.assistant.pasteAnswer'), { exact: true }).fill('{"improved":"Verantwortete Cloud-Migrationen","alternatives":["Leitete Cloud-Migrationen"],"explanation":"Aktives Verb."}')
    await assistant.getByRole('button', { name: t('ai.assistant.parseAnswer') }).click()
    await expect(assistant.getByText('Verantwortete Cloud-Migrationen', { exact: true })).toBeVisible()
    await assistant.getByRole('button', { name: t('ai.assistant.applyToDescription') }).click()
    await expect(assistant).toBeHidden()
    await expect(form.getByLabel(t('profile.experiences.description'), { exact: true })).toHaveValue('Verantwortete Cloud-Migrationen')
  })

  test('letter translation: the translated text is shown and replaces the body only when taken over', async ({ member }) => {
    const { page, t } = member
    await apiOk(page, 'POST', '/api/cover-letters', { title: 'Übersetzen', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Sehr geehrte Damen und Herren' })
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Übersetzen' }).first().click()
    await page.getByTestId('letter-ai-translate').click()
    const dialog = page.getByRole('dialog', { name: t('ai.tasks.translate') })
    await expect(dialog.getByLabel(t('ai.assistant.translateInput'), { exact: true })).toHaveValue('Sehr geehrte Damen und Herren')
    await dialog.getByLabel(t('ai.assistant.pasteAnswer'), { exact: true }).fill('{"translatedText":"Dear Sir or Madam","items":[]}')
    await dialog.getByRole('button', { name: t('ai.assistant.parseAnswer') }).click()
    await expect(dialog.getByTestId('translation-result')).toHaveText('Dear Sir or Madam')
    // Closing without taking over changes nothing
    await dialog.getByRole('button', { name: t('ai.assistant.close') }).last().click()
    await expect(page.getByLabel(t('coverLetters.fields.body'), { exact: true })).toHaveValue('Sehr geehrte Damen und Herren')

    await page.getByTestId('letter-ai-translate').click()
    await dialog.getByLabel(t('ai.assistant.pasteAnswer'), { exact: true }).fill('{"translatedText":"Dear Sir or Madam","items":[]}')
    await dialog.getByRole('button', { name: t('ai.assistant.parseAnswer') }).click()
    await dialog.getByRole('button', { name: t('ai.assistant.applyTranslation') }).click()
    await expect(page.getByLabel(t('coverLetters.fields.body'), { exact: true })).toHaveValue('Dear Sir or Madam')
    // Taken over like typed text: the letter saves it by itself
    await expect(page.getByText(t('autoSave.saved'), { exact: true })).toBeVisible()
  })
})

test.describe('settings of the AI service', () => {
  test('LM Studio has its own entry with the usual address filled in; a model is demanded while typing; leaving with changes asks first', async ({ member }) => {
    const { page, t } = member
    await open(member, '/')
    await page.getByRole('button', { name: t('nav.aiSettings') }).click()
    const dialog = page.getByRole('dialog', { name: t('ai.settingsTitle') })
    await dialog.getByLabel(t('ai.provider'), { exact: true }).selectOption({ label: t('ai.providers.lmstudio') })
    await expect(dialog.getByLabel(t('ai.baseUrl'), { exact: true })).toHaveValue('http://localhost:1234/v1')
    // A local service has no key
    await expect(dialog.getByLabel(t('ai.apiKey'), { exact: true })).toHaveCount(0)
    const model = dialog.getByLabel(t('ai.model'), { exact: true })
    await model.pressSequentially('x')
    await model.fill('')
    await expect(model).toHaveAttribute('aria-invalid', 'true')
    await expect(dialog.getByText(t('rules.model.required'))).toBeVisible()
    await expect(dialog.getByRole('button', { name: t('ai.testConnection') })).toBeDisabled()

    // Esc with typed changes: the question comes first
    await page.keyboard.press('Escape')
    const ask = page.getByRole('alertdialog')
    await expect(ask).toContainText(t('common.discardTitle'))
    await ask.getByRole('button', { name: t('common.discard') }).click()
    await expect(dialog).toBeHidden()
    expect((await apiOk<{ provider: string }>(page, 'GET', '/api/ai/config')).provider).toBe('copy_paste')
  })
})
