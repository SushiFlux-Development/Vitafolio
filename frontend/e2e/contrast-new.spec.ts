import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import type { Locator } from '@playwright/test'
import { scanTextContrast, waitForCalmPage } from './checks'
import { dateIn } from './labels'
import { apiOk, contrastBetween, openAs, token } from './support'

// WCAG 2.x for the pages and tokens that came with the profile, documents, tracker and AI helpers - in BOTH shipped themes (light, dark):
// the status colours of the badges as token pairs (4.5:1 text, 3:1 for the gold indicator), and every visible piece of text on the new
// screens measured against its real background. Disabled controls are exempt (WCAG); text over a gradient and faded text is counted as
// "unmeasured" and reported by the numbers. The older screens are in contrast-rendered.spec.ts.
const THEMES = ['light', 'dark'] as const
const DISPLAY_NAME = 'Erika Mustermann'

const STATUSES = ['draft', 'applied', 'acknowledged', 'interview', 'offer', 'rejected', 'withdrawn'] as const

async function expectReadable(member: Member, theme: string, what: string, minimumMeasured = 8) {
  const { page } = member
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
  await waitForCalmPage(page)
  const result = await scanTextContrast(page)
  expect(result.measured, `${what}: something was measured`).toBeGreaterThanOrEqual(minimumMeasured)
  test.info().annotations.push({ type: `${what} (${theme})`, description: `${result.measured} measured, ${result.unmeasured} unmeasured${result.unmeasured > 0 ? ': ' + result.unmeasuredTexts.join(' | ') : ''}` })
  const lines = result.findings.map((item) => `"${item.text}" ${item.ratio}:1 < ${item.needed}:1 (${item.foreground} on ${item.background}, ${item.where})`)
  expect(lines, `${theme} theme, ${what} (${result.measured} texts measured, ${result.unmeasured} unmeasured)`).toEqual([])
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ member }) => {
      await member.page.emulateMedia({ colorScheme: theme })
    })

    test('the status colours of the badges and the gold indicator keep their contrast as token pairs', async ({ member }) => {
      const { page } = member
      await openAs(page, DISPLAY_NAME, '/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const pairs: [string, string, number][] = [
        ['success-soft-ink', 'success-soft', 4.5],
        ['danger-soft-ink', 'danger-soft', 4.5],
        ['warning-soft-ink', 'warning-soft', 4.5],
        ['info-soft-ink', 'info-soft', 4.5],
        ['highlight-soft-ink', 'highlight-soft', 4.5],
        ['select-ink', 'select-bg', 4.5],
        ['ink', 'bg-sunken', 4.5],
        ['ink-muted', 'surface-2', 4.5],
        ['indicator', 'surface', 3],
        ['line-strong', 'surface-2', 3],
      ]
      for (const [foreground, background, minimum] of pairs) {
        const ratio = await contrastBetween(page, await token(page, foreground), await token(page, background))
        expect(ratio, `${theme}: --${foreground} on --${background}`).toBeGreaterThanOrEqual(minimum)
      }
    })

    test('profile: the personal data, the building blocks and the preview screen', async ({ member }) => {
      const { page } = member
      await apiOk(page, 'PUT', '/api/profile', { firstName: 'Erika', lastName: 'Mustermann', professionalTitle: 'Entwicklerin', email: 'erika@example.com' })
      await apiOk(page, 'POST', '/api/profile/experiences', { jobTitle: 'Entwicklerin', employer: 'Muster GmbH', startDate: '2019-04', isCurrent: true, description: 'Aufgaben', sortOrder: 0 })
      await apiOk(page, 'POST', '/api/profile/experiences', { jobTitle: 'Berater', employer: 'Alt AG', startDate: '2010-01', endDate: '2016-01', isCurrent: false, sortOrder: 1 })
      for (const tab of ['personal', 'experiences', 'preview']) {
        await openAs(page, DISPLAY_NAME, `/profile?tab=${tab}`)
        // The open section is marked in the sidebar's list of sections
        await expect(page.getByRole('navigation', { name: member.t('profile.sections') }).locator('[aria-current="page"]')).toBeVisible()
        if (tab === 'preview') await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()
        await expectReadable(member, theme, `profile: ${tab}`)
      }
      // The gap analysis card and a dialog with live hints
      await openAs(page, DISPLAY_NAME, '/profile?tab=experiences')
      await page.getByRole('button', { name: member.t('profile.experiences.add') }).first().click()
      await page.getByRole('dialog').getByLabel(member.t('profile.experiences.startDate'), { exact: true }).fill(dateIn(member.language).monthDigits(2020, 0))
      await expect(page.getByRole('dialog').getByText(member.t(dateIn(member.language).invalidMonth)).first()).toBeVisible()
      await expectReadable(member, theme, 'profile: position dialog with a hint')
    })

    test('cover letters: the list, the editor with hints and the status line', async ({ member }) => {
      const { page, t } = member
      await apiOk(page, 'POST', '/api/cover-letters', { title: 'Kontrast', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text' })
      await openAs(page, DISPLAY_NAME, '/cover-letters')
      await expect(page.getByRole('button', { name: 'Kontrast' }).first()).toBeVisible()
      await expectReadable(member, theme, 'cover letters: list', 5)
      await page.getByRole('button', { name: 'Kontrast' }).first().click()
      await page.getByLabel(t('coverLetters.fields.subject'), { exact: true }).fill('')
      await page.getByLabel(t('coverLetters.fields.senderEmail'), { exact: true }).fill('a b')
      await expect(page.getByText(t('coverLetters.autoSave.missing_one', { count: 1 }))).toBeVisible()
      await expectReadable(member, theme, 'cover letters: editor with hints')
    })

    test('tracker: the board with all seven statuses, the list, the details and the dossier tab', async ({ member }) => {
      const { page, t } = member
      for (const status of STATUSES) {
        await apiOk(page, 'POST', '/api/applications', { jobTitle: `Stelle ${status}`, company: `Firma ${status}`, status, followUpAt: status === 'applied' ? '2026-10-01T00:00:00Z' : null })
      }
      await openAs(page, DISPLAY_NAME, '/applications')
      await expect(page.getByRole('button', { name: 'Stelle draft' })).toBeVisible()
      // The follow-up notice, the metric cards, every column; rejected and withdrawn carry their badges in the last column
      await expect(page.getByText(t('applications.followUpAlert_one', { count: 1 }))).toBeVisible()
      await expectReadable(member, theme, 'tracker: board')
      await page.getByRole('radio', { name: t('applications.views.list') }).click()
      await expect(page.getByRole('table')).toBeVisible()
      await expectReadable(member, theme, 'tracker: list')
      await page.getByRole('radio', { name: t('applications.views.kanban') }).click()
      await page.getByRole('button', { name: 'Stelle rejected' }).click()
      const details = page.getByRole('dialog', { name: 'Stelle rejected – Firma rejected' })
      await expect(details).toBeVisible()
      await expectReadable(member, theme, 'tracker: details')
      await details.getByRole('tab', { name: new RegExp(t('applications.timeline.title')) }).click()
      await expectReadable(member, theme, 'tracker: timeline')
      await details.getByRole('tab', { name: new RegExp(t('applications.dossier.title')) }).click()
      await expectReadable(member, theme, 'tracker: dossier tab')
    })

    test('attachments, the AI assistant with its result and the AI settings', async ({ member }) => {
      const { page, t } = member
      await openAs(page, DISPLAY_NAME, '/applications')
      await page.getByRole('button', { name: t('applications.attachments.manage') }).click()
      await expect(page.getByRole('dialog', { name: t('attachments.title') })).toBeVisible()
      await expectReadable(member, theme, 'attachments dialog', 5)
      await page.keyboard.press('Escape')

      await openAs(page, DISPLAY_NAME, '/profile')
      await page.getByRole('button', { name: t('ai.entry.summary') }).click()
      const dialog = page.getByRole('dialog', { name: t('ai.tasks.summary') })
      await dialog.getByLabel(t('ai.assistant.pasteAnswer'), { exact: true }).fill('kein JSON')
      await dialog.getByRole('button', { name: t('ai.assistant.parseAnswer') }).click()
      await expect(dialog.getByTestId('error-notice')).toBeVisible()
      await expectReadable(member, theme, 'AI assistant with an error', 5)
      await dialog.getByLabel(t('ai.assistant.pasteAnswer'), { exact: true }).fill('{"shortSummary":"Kurz.","bulletPoints":["a"]}')
      await dialog.getByRole('button', { name: t('ai.assistant.parseAnswer') }).click()
      await expect(dialog.getByText('Kurz.', { exact: true })).toBeVisible()
      await expectReadable(member, theme, 'AI assistant with a result', 5)
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: t('nav.aiSettings') }).click()
      const settings = page.getByRole('dialog', { name: t('ai.settingsTitle') })
      await settings.getByLabel(t('ai.provider'), { exact: true }).selectOption({ label: t('ai.providers.lmstudio') })
      await settings.getByLabel(t('ai.model'), { exact: true }).pressSequentially('x')
      await settings.getByLabel(t('ai.model'), { exact: true }).fill('')
      await expect(settings.getByText(t('rules.model.required'))).toBeVisible()
      await expectReadable(member, theme, 'AI settings with a hint', 5)
    })

    test('keyboard focus is visible on the new controls: a ring on buttons and tabs, the gold border on a board card (3:1)', async ({ member }) => {
      const { page, t } = member
      await apiOk(page, 'POST', '/api/applications', { jobTitle: 'Fokus', company: 'Ring AG', status: 'draft' })
      await openAs(page, DISPLAY_NAME, '/applications')
      await expect(page.getByRole('button', { name: 'Fokus' })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

      /** Presses Tab until the focus is on the element (a keyboard user's way, so :focus-visible applies). */
      const tabTo = async (target: Locator) => {
        for (let step = 0; step < 80; step++) {
          if (await target.evaluate((element) => element === document.activeElement)) return
          await page.keyboard.press('Tab')
        }
        throw new Error('The element never got the keyboard focus.')
      }
      for (const [name, target] of [
        ['the "new application" button', page.getByRole('button', { name: t('applications.newApplication') }).first()],
        ['the view switch', page.getByRole('radio', { checked: true }).first()],
      ] as const) {
        await tabTo(target)
        const ring = await target.evaluate((element) => {
          const style = getComputedStyle(element)
          let backdrop = 'rgb(255, 255, 255)'
          for (let node: Element | null = element.parentElement; node; node = node.parentElement) {
            const color = getComputedStyle(node).backgroundColor
            if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
              backdrop = color
              break
            }
          }
          return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor, backdrop }
        })
        expect(ring.style, `${name}: a focus ring is drawn`).not.toBe('none')
        expect(ring.width).toBeGreaterThan(0)
        expect(await contrastBetween(page, ring.color, ring.backdrop), `${theme}: focus ring of ${name} on ${ring.backdrop}`).toBeGreaterThanOrEqual(3)
      }

      // The card: its title button has no ring of its own; the card shows the focus with the gold border
      const card = page.getByRole('button', { name: 'Fokus' })
      const item = card.locator('xpath=ancestor::li[1]')
      const idle = await item.evaluate((element) => getComputedStyle(element).borderTopColor)
      await tabTo(card)
      // The border changes with a short transition: wait until it has stopped moving, then measure
      const borderOf = () => item.evaluate((element) => getComputedStyle(element).borderTopColor)
      await expect.poll(borderOf, { message: "the focused card looks different from an idle one" }).not.toBe(idle)
      let settled = await borderOf()
      await expect.poll(async () => { const now = await borderOf(); const same = now === settled; settled = now; return same }).toBe(true)
      const backdrop = await item.evaluate((element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          const color = getComputedStyle(node).backgroundColor
          if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color
        }
        return "rgb(255, 255, 255)"
      })
      expect(await contrastBetween(page, settled, backdrop), theme + ": border of the focused card on " + backdrop).toBeGreaterThanOrEqual(3)
    })

    test('about and the manual dialog', async ({ member }) => {
      const { page, t } = member
      await openAs(page, DISPLAY_NAME, '/settings?tab=about')
      await expect(page.getByTestId('license-row').first()).toBeVisible()
      await expectReadable(member, theme, 'about page')
      await page.getByTestId('open-handbook').click()
      await expect(page.getByRole('dialog', { name: t('handbook.title') })).toBeVisible()
      await expectReadable(member, theme, 'manual dialog', 3)
    })
  })
}
