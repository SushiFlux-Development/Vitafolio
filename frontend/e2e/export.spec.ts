import type { Locator, Page } from '@playwright/test'
import { scanTextContrast, waitForCalmPage } from './checks'
import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { apiOk, openAs, readDownload } from './support'

// The "Export" page: every application with the file name its PDF gets, a preview and a download per row, a selection for several at
// once (one gives the PDF, two or more give a ZIP), and the CV alone on a second tab. Every test has an account of its own.
// Written to run once the server side of the ZIP (POST /api/applications/dossiers/archive) is in; the tests that fake the answer of
// the server say so.
test.use({ viewport: { width: 1024, height: 768 } })

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path = '/export') => openAs(member.page, DISPLAY_NAME, path)

interface Listed {
  id: string
  jobTitle: string
  company: string
  dossierFileName: string
}

const createApplication = (member: Member, body: Record<string, unknown>) =>
  apiOk<{ id: string }>(member.page, 'POST', '/api/applications', { jobTitle: 'Entwicklerin', company: 'Muster GmbH', status: 'draft', ...body })

const listed = (member: Member) => apiOk<Listed[]>(member.page, 'GET', '/api/applications')

async function box(locator: Locator) {
  return (await locator.boundingBox())!
}

/** Position and size of the parts of the page that must stay where they are while a download runs or a message changes. */
async function frame(page: Page) {
  return {
    toolbar: await box(page.locator('[data-hint="export-bulk"]')),
    bulk: await box(page.getByTestId('export-bulk')),
    list: await box(page.locator('[data-hint="export-list"]')),
  }
}

test.describe('navigation', () => {
  test('the sidebar leads to the page, and the tab is in the address', async ({ member }) => {
    const { page, t } = member
    await open(member, '/')
    await page.getByRole('navigation', { name: t('nav.label') }).getByRole('link', { name: t('nav.export'), exact: true }).click()
    await expect(page).toHaveURL(/\/export$/)
    await expect(page.getByRole('heading', { level: 1, name: t('export.title') })).toBeVisible()
    await expect(page.getByRole('tab', { name: t('export.tabs.applications'), selected: true })).toBeVisible()

    await page.getByRole('tab', { name: t('export.tabs.cv') }).click()
    await expect(page).toHaveURL(/\/export\?tab=cv$/)
    await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()

    // Reload: the tab comes from the address
    await page.reload()
    await expect(page.getByRole('tab', { name: t('export.tabs.cv'), selected: true })).toBeVisible()
  })

  test('the overview has an export button that leads to the page', async ({ member }) => {
    const { page, t } = member
    await open(member, '/')
    await page.getByRole('button', { name: t('nav.export'), exact: true }).click()
    await expect(page).toHaveURL(/\/export$/)
  })

  test('an empty account is led to "new application", which opens the form', async ({ member }) => {
    const { page, t } = member
    await open(member)
    await expect(page.getByText(t('export.empty.title'))).toBeVisible()
    await page.getByRole('button', { name: t('applications.newApplication') }).click()
    await expect(page).toHaveURL(/\/applications$/)
    await expect(page.getByRole('dialog', { name: t('applications.createTitle') })).toBeVisible()
  })
})

test.describe('the applications tab', () => {
  test('lists every application with the file name the server gives its PDF', async ({ member }) => {
    const { page } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG' })
    await createApplication(member, { jobTitle: 'Entwicklerin', company: 'Alpha GmbH' })
    const names = new Map((await listed(member)).map((entry) => [entry.id, entry.dossierFileName]))
    expect(names.size).toBe(2)

    await open(member)
    const rows = page.getByTestId('export-table').locator('tbody tr')
    await expect(rows).toHaveCount(2)
    for (const name of names.values()) {
      expect(name).toMatch(/\.pdf$/)
      await expect(page.getByTestId('export-file-name').filter({ hasText: name })).toBeVisible()
    }
  })

  test('one PDF from a row and from the toolbar, a ZIP with a PDF each from two on', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG' })
    await createApplication(member, { jobTitle: 'Entwicklerin', company: 'Alpha GmbH' })
    const entries = await listed(member)
    await open(member)

    const row = entries[0]!
    const single = page.waitForEvent('download')
    await page.getByRole('button', { name: t('export.downloadRow', { name: `${row.company} – ${row.jobTitle}` }) }).click()
    expect((await single).suggestedFilename()).toBe(row.dossierFileName)

    await page.getByRole('checkbox', { name: t('export.selectRow', { name: `${row.company} – ${row.jobTitle}` }) }).check()
    await expect(page.getByTestId('export-bulk')).toContainText('(1)')
    const alone = page.waitForEvent('download')
    await page.getByTestId('export-bulk').click()
    expect((await alone).suggestedFilename()).toBe(row.dossierFileName)

    await page.getByTestId('export-select-all').check()
    await expect(page.getByTestId('export-bulk')).toContainText('(2)')
    const archive = page.waitForEvent('download')
    await page.getByTestId('export-bulk').click()
    const download = await archive
    expect(download.suggestedFilename()).toMatch(/\.zip$/)
    // The names of the files are stored as plain text in a ZIP
    const bytes = (await readDownload(download)).toString('latin1')
    for (const entry of entries) expect(bytes).toContain(entry.dossierFileName)
  })

  test('the preview opens from the row', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG' })
    await open(member)
    await page.getByRole('button', { name: t('export.previewRow', { name: 'Beta AG – Teamleiterin IT' }) }).click()
    await expect(page.getByRole('dialog', { name: 'Beta AG – Teamleiterin IT' })).toBeVisible()
    await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()
  })

  test('works with the keyboard: Tab to a box, Space chooses, the count follows', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG' })
    await open(member)
    const rowBox = page.getByRole('checkbox', { name: t('export.selectRow', { name: 'Beta AG – Teamleiterin IT' }) })
    await rowBox.focus()
    await expect(rowBox).toBeFocused()
    await page.keyboard.press('Space')
    await expect(rowBox).toBeChecked()
    await expect(page.getByTestId('export-count')).toContainText(t('export.selected', { chosen: 1, total: 1 }))
    await expect(page.getByTestId('export-bulk')).toBeEnabled()
  })

  test('a running download shows "Wird erstellt …" on its button without changing any size, and blocks a second one', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG' })
    await createApplication(member, { jobTitle: 'Entwicklerin', company: 'Alpha GmbH' })
    await page.route('**/api/applications/*/dossier/download', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      await route.continue()
    })
    await open(member)
    await expect(page.getByTestId('export-table').locator('tbody tr')).toHaveCount(2)

    const first = page.getByRole('button', { name: t('export.downloadRow', { name: 'Beta AG – Teamleiterin IT' }) })
    const second = page.getByRole('button', { name: t('export.downloadRow', { name: 'Alpha GmbH – Entwicklerin' }) })
    const before = { page: await frame(page), first: await box(first), second: await box(second) }

    const download = page.waitForEvent('download')
    await first.click()
    await expect(first).toContainText(t('export.creating'))
    await expect(first).toHaveAttribute('aria-busy', 'true')
    await expect(second).toBeDisabled()
    await expect(page.getByTestId('export-bulk')).toBeDisabled()
    expect({ page: await frame(page), first: await box(first), second: await box(second) }, 'nothing moved or changed size while it runs').toEqual(before)

    await download
    await expect(first).not.toHaveAttribute('aria-busy', 'true')
    await expect(second).toBeEnabled()
    expect({ page: await frame(page), first: await box(first), second: await box(second) }, 'nothing moved or changed size afterwards').toEqual(before)
  })

  // The answer of the server is faked here: a ZIP of which one dossier is missing, as the header of the real ZIP says it.
  test('says "1 von 2 konnten nicht erstellt werden" in full with a copy button, laid over the list so nothing moves', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG' })
    await createApplication(member, { jobTitle: 'Entwicklerin', company: 'Alpha GmbH' })
    await page.route('**/api/applications/dossiers/archive', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="Bewerbungen-2026-11-09.zip"', 'X-Dossiers-Failed': '1' },
        body: Buffer.from('PK'),
      }),
    )
    await open(member)
    await page.getByTestId('export-select-all').check()
    const before = await frame(page)

    const download = page.waitForEvent('download')
    await page.getByTestId('export-bulk').click()
    await download
    const notice = page.getByTestId('error-notice')
    await expect(notice).toContainText(t('errors.codes.dossiers.partial_failed', { failed: 1, total: 2 }))
    await expect(notice.getByTestId('copy-button')).toBeVisible()
    expect(await frame(page), 'the notice lies over the list').toEqual(before)

    await notice.getByRole('button', { name: t('common.close') }).click()
    await expect(notice).toBeHidden()
    expect(await frame(page)).toEqual(before)
  })

  test('tells a failed download in the error dialog, complete', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG' })
    await page.route('**/api/applications/*/dossier/download', (route) =>
      route.fulfill({ status: 500, contentType: 'application/problem+json', body: JSON.stringify({ status: 500, code: 'internal', detail: 'Anlage 3 nicht lesbar' }) }),
    )
    await open(member)
    await page.getByRole('button', { name: t('export.downloadRow', { name: 'Beta AG – Teamleiterin IT' }) }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(t('export.errors.download'))
    await expect(dialog).toContainText('Anlage 3 nicht lesbar')
    await expect(dialog.getByTestId('copy-button')).toBeVisible()
  })

  test('more than 100 chosen: the button is off and the message sits in the room the hint already has', async ({ member }) => {
    test.setTimeout(180_000)
    const { page, t } = member
    for (let index = 1; index <= 101; index++) await createApplication(member, { jobTitle: `Stelle ${index}`, company: `Firma ${index}` })
    await open(member)
    await expect(page.getByTestId('export-table').locator('tbody tr')).toHaveCount(101)

    await page.getByTestId('export-select-all').check()
    const tooMany = page.getByText(t('export.bulk.tooMany', { count: 101, limit: 100 }))
    await expect(tooMany).toBeVisible()
    await expect(page.getByTestId('export-bulk')).toBeDisabled()
    const over = await frame(page)

    // Taking one away: allowed again, the hint is back, and nothing around it moved
    await page.getByRole('checkbox', { name: t('export.selectRow', { name: 'Firma 1 – Stelle 1' }) }).uncheck()
    await expect(tooMany).toBeHidden()
    await expect(page.getByText(t('export.bulk.hint'))).toBeVisible()
    await expect(page.getByTestId('export-bulk')).toBeEnabled()
    const allowed = await frame(page)
    expect(allowed.toolbar).toEqual(over.toolbar)
    expect(allowed.bulk, 'the button keeps its size whatever the count says').toEqual(over.bulk)
    expect(allowed.list).toEqual(over.list)
  })
})

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ member }) => {
      await member.page.emulateMedia({ colorScheme: theme })
    })

    test('the export page is readable: every text against its real background', async ({ member }) => {
      const { page, t } = member
      await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG', status: 'applied' })
      await createApplication(member, { jobTitle: 'Entwicklerin', company: 'Alpha GmbH' })
      await open(member)
      await expect(page.getByTestId('export-table').locator('tbody tr')).toHaveCount(2)
      await page.getByTestId('export-select-all').check()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await waitForCalmPage(page)
      const result = await scanTextContrast(page)
      expect(result.measured).toBeGreaterThanOrEqual(10)
      const lines = result.findings.map((item) => `"${item.text}" ${item.ratio}:1 < ${item.needed}:1 (${item.foreground} on ${item.background}, ${item.where})`)
      expect(lines, `${theme} theme, ${t('export.title')}`).toEqual([])
    })
  })
}
