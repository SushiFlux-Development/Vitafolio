import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { scanTextContrast, waitForCalmPage } from './checks'
import { apiOk, openAs } from './support'

// The dashboard: the state of the applications at a glance. Below the welcome it shows
// the tracker board itself (the same component as on the applications page), a strip for follow-ups that are due, the first steps
// while there is no application, and the sidebar's theme switch, its foot (no page footer) and the rail it collapses to.
// Every test has an account of its own.
test.use({ viewport: { width: 1024, height: 768 } })

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path = '/') => openAs(member.page, DISPLAY_NAME, path)

const createApplication = (member: Member, body: Record<string, unknown>) =>
  apiOk<{ id: string }>(member.page, 'POST', '/api/applications', { jobTitle: 'Entwicklerin', company: 'Muster GmbH', status: 'draft', ...body })

test.describe('without an application', () => {
  test('shows the three first steps with links, and the empty board below them', async ({ member }) => {
    const { page, t } = member
    await open(member)
    await expect(page.getByTestId('getting-started')).toBeVisible()
    // The board is there with all its columns, empty
    for (const column of ['draft', 'applied', 'acknowledged', 'interview', 'offer', 'closed']) {
      await expect(page.getByRole('region', { name: t(`applications.columns.${column}`) })).toBeVisible()
    }

    await page.getByTestId('start-profile').click()
    await expect(page).toHaveURL(/\/profile/)
    await open(member)
    await page.getByTestId('start-guide').click()
    await expect(page).toHaveURL(/\/guide/)
    await open(member)
    await page.getByTestId('start-application').click()
    await expect(page).toHaveURL(/\/applications$/)
    await expect(page.getByRole('dialog', { name: t('applications.createTitle') })).toBeVisible()
  })
})

test.describe('with applications', () => {
  test('shows the tracker board: every application in the column of its status, no first steps', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG', status: 'interview' })
    await createApplication(member, { jobTitle: 'Entwicklerin', company: 'Alpha GmbH', status: 'draft' })
    await open(member)

    await expect(page.getByRole('region', { name: t('applications.columns.interview') }).getByText('Teamleiterin IT')).toBeVisible()
    await expect(page.getByRole('region', { name: t('applications.columns.draft') }).getByText('Entwicklerin')).toBeVisible()
    await expect(page.getByTestId('getting-started')).toHaveCount(0)
  })

  test('a card opens the details, where the status is changed - and the board follows', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG', status: 'draft' })
    await open(member)

    await page.getByRole('button', { name: 'Teamleiterin IT' }).click()
    const details = page.getByRole('dialog', { name: 'Teamleiterin IT – Beta AG' })
    await expect(details).toBeVisible()
    await details.getByLabel(t('applications.fields.status')).selectOption('interview')
    await details.getByRole('button', { name: t('common.close') }).click()
    await expect(page.getByRole('region', { name: t('applications.columns.interview') }).getByText('Teamleiterin IT')).toBeVisible()
  })

  test('the strip "follow-up due" is only there when something is due, and leads to the application', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Ruhige Stelle', company: 'Ruhe AG', status: 'draft' })
    await open(member)
    await expect(page.getByRole('region', { name: t('overview.next.title') })).toHaveCount(0)

    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG', status: 'applied', followUpAt: '2026-10-01T00:00:00Z' })
    await open(member)
    const strip = page.getByRole('region', { name: t('overview.next.title') })
    await expect(strip).toBeVisible()
    await strip.getByRole('link', { name: /Teamleiterin IT/ }).click()
    await expect(page.getByRole('dialog', { name: 'Teamleiterin IT – Beta AG' })).toBeVisible()
    // The marker is gone from the address, so a reload does not open it again
    await expect(page).toHaveURL(/\/applications$/)
  })

  test('the filter links of the applications page still work', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG', status: 'interview' })
    await createApplication(member, { jobTitle: 'Entwicklerin', company: 'Alpha GmbH', status: 'draft' })
    await open(member, '/applications?status=interview')
    await expect(page.getByRole('combobox', { name: t('applications.filter.status') })).toHaveValue('interview')
    await expect(page.getByRole('button', { name: 'Teamleiterin IT' })).toBeVisible()
    await expect(page.getByText('Entwicklerin')).toHaveCount(0)
  })

  test('the buttons "new application" and "export" lead where they say', async ({ member }) => {
    const { page, t } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG' })
    await open(member)
    await page.getByRole('button', { name: t('nav.export'), exact: true }).click()
    await expect(page).toHaveURL(/\/export$/)
    await open(member)
    await page.getByRole('button', { name: t('applications.newApplication') }).click()
    await expect(page.getByRole('dialog', { name: t('applications.createTitle') })).toBeVisible()
  })

  test('at 1024 px the board scrolls inside itself, the page does not', async ({ member }) => {
    const { page } = member
    await createApplication(member, { jobTitle: 'Teamleiterin IT', company: 'Beta AG', status: 'interview' })
    await open(member)
    await expect(page.getByRole('button', { name: 'Teamleiterin IT' })).toBeVisible()
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: document.documentElement.clientWidth }))
    expect(widths.page, 'the page has a horizontal scrollbar').toBeLessThanOrEqual(widths.window)
  })
})

test.describe('the sidebar', () => {
  test('the theme switch has two positions, light and dark', async ({ member }) => {
    const { page, t } = member
    await open(member)
    const group = page.getByRole('radiogroup', { name: t('shell.theme') })
    await expect(group.getByRole('radio')).toHaveCount(2)
    await group.getByRole('radio', { name: t('settings.theme.dark') }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await group.getByRole('radio', { name: t('settings.theme.light') }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('no page footer next to the sidebar: the info icon leads to the About page; "sign out" is a button of its own size', async ({ member }) => {
    const { page } = member
    await open(member)
    const aside = page.locator('aside')
    await expect(page.locator('footer')).toHaveCount(0)
    const asideBox = (await aside.boundingBox())!

    const signOut = (await page.getByTestId('sign-out').boundingBox())!
    expect(signOut.width, 'sign out is no box across the sidebar').toBeLessThan(asideBox.width * 0.7)
    expect(signOut.height, 'sign out keeps the 48 px target through its hit area, the box itself stays compact').toBeLessThan(48)

    await page.getByTestId('open-about').click()
    await expect(page).toHaveURL(/\/settings\?tab=about$/)
    await expect(page.getByTestId('about-version')).toBeVisible()
    await expect(page.getByTestId('about-credit')).toContainText('♥')
  })

  test('the sidebar collapses to a slim rail with own tooltips, the page takes the room, and the choice survives a reload', async ({ member }) => {
    const { page, t } = member
    await open(member)
    const aside = page.locator('aside')
    const main = page.locator('main')
    const wide = (await aside.boundingBox())!.width
    const mainBefore = (await main.boundingBox())!

    await page.getByTestId('sidebar-collapse').click()
    await expect(aside).toHaveAttribute('data-rail', 'true')
    const narrow = (await aside.boundingBox())!.width
    expect(narrow).toBeLessThan(wide / 2)
    const mainAfter = (await main.boundingBox())!
    expect(mainAfter.x + mainAfter.width, 'the page still ends at the window edge').toBeCloseTo(mainBefore.x + mainBefore.width, 0)
    expect(mainAfter.width, 'the page takes the freed width').toBeGreaterThan(mainBefore.width + (wide - narrow) - 2)

    // The name of an entry is an own tooltip (no browser title) on hover
    const profile = aside.getByRole('link', { name: t('nav.profile') })
    await expect(profile).not.toHaveAttribute('title')
    await profile.hover()
    await expect(page.getByTestId('sidebar-tip')).toHaveText(t('nav.profile'))

    await page.reload()
    await expect(page.locator('aside')).toHaveAttribute('data-rail', 'true')
    await page.getByTestId('sidebar-collapse').click()
    await expect(page.locator('aside')).not.toHaveAttribute('data-rail', 'true')
  })
})

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ member }) => {
      await member.page.emulateMedia({ colorScheme: theme })
    })

    test('the dashboard is readable, with and without applications', async ({ member }) => {
      const { page } = member
      const scan = async (what: string) => {
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await waitForCalmPage(page)
        const result = await scanTextContrast(page)
        expect(result.measured, `${what}: something was measured`).toBeGreaterThanOrEqual(8)
        const lines = result.findings.map((item) => `"${item.text}" ${item.ratio}:1 < ${item.needed}:1 (${item.foreground} on ${item.background}, ${item.where})`)
        expect(lines, `${theme} theme, ${what}`).toEqual([])
      }
      await open(member)
      await expect(page.getByTestId('getting-started')).toBeVisible()
      await scan('dashboard without applications')

      for (const status of ['draft', 'applied', 'interview', 'offer', 'rejected', 'withdrawn']) {
        await createApplication(member, { jobTitle: `Stelle ${status}`, company: `Firma ${status}`, status, followUpAt: status === 'applied' ? '2026-10-01T00:00:00Z' : null })
      }
      await open(member)
      await expect(page.getByRole('button', { name: 'Stelle interview' })).toBeVisible()
      await scan('dashboard with applications')
    })
  })
}
