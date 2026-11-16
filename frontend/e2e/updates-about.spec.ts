import { expect, test as plain } from '@playwright/test'
import { test } from './fixtures'
import { labelsFor } from './labels'
import { apiCall, apiOk, openApp, openAs, SIGNED_OUT } from './support'

// The update page and its channel choice, the "About" page (version, licence, source, components, what is new), the manual in the
// app and the role rules around them. The E2E server is a development build without access to the release feed: it must say so
// instead of looking for updates.

const t = labelsFor('de')

interface UpdateStatus {
  channel: 'none' | 'beta' | 'nightly'
  currentVersion: string
  state: string
  dockerImage: string
  dockerTag: string
  error: string | null
  host: string
}

const statusOf = (who: Parameters<typeof apiOk>[0]) => apiOk<UpdateStatus>(who, 'GET', '/api/updates/status')

plain.describe('update page (administration, server mode)', () => {
  plain.afterEach(async ({ page }) => {
    // Whatever a test chose: the default channel is put back
    await apiOk(page, 'PUT', '/api/admin/updates/channel', { channel: 'none' })
  })

  plain('a development build says so and offers nothing; searching changes nothing and fails nowhere', async ({ page }) => {
    await openApp(page, '/admin?tab=updates')
    await expect(page.getByTestId('admin-updates')).toBeVisible()
    await expect(page.getByText(t('updates.state.devBuild'))).toBeVisible()
    // The version is the one the info icon of the sidebar names (its own tooltip)
    const shown = (await page.getByTestId('updates-current').textContent())!.trim()
    await page.getByTestId('open-about').hover()
    await expect(page.getByTestId('sidebar-tip')).toContainText(shown)
    await page.getByTestId('updates-check').click()
    await expect(page.getByText(t('updates.state.devBuild'))).toBeVisible()
    await expect(page.getByTestId('error-notice')).toHaveCount(0)
    await expect(page.getByTestId('update-available')).toHaveCount(0)
    // No release feed was asked for in a development build: the answer is the dev state, not an error from the network
    const status = await statusOf(page)
    expect(status.state).not.toBe('error')
    expect(status.error).toBeNull()
  })

  plain('the channel choice explains itself, names the image tag Docker needs, survives a reload, and is put back at the end', async ({ page }) => {
    await openApp(page, '/admin?tab=updates')
    const channel = page.getByTestId('update-channel')
    await expect(page.getByTestId('update-channel-text')).toHaveText(t('updates.channel.noneText'))
    await expect(channel).toContainText(':latest')
    await expect(page.getByTestId('docker-command')).toContainText(':latest')

    await page.getByRole('radio', { name: t('updates.channel.beta') }).click()
    await expect(page.getByTestId('update-channel-text')).toHaveText(t('updates.channel.betaText'))
    await expect(channel).toContainText(':beta')
    await expect(page.getByTestId('docker-command')).toContainText(':beta')
    await expect.poll(async () => (await statusOf(page)).channel).toBe('beta')

    await page.getByRole('radio', { name: t('updates.channel.nightly') }).click()
    await expect(page.getByTestId('update-channel-text')).toHaveText(t('updates.channel.nightlyText'))
    await expect(channel).toContainText(':nightly')

    await page.reload()
    await expect(page.getByRole('radio', { name: t('updates.channel.nightly') })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('docker-command')).toContainText(':nightly')

    await page.getByRole('radio', { name: t('updates.channel.none') }).click()
    await expect(page.getByTestId('docker-command')).toContainText(':latest')
    await expect.poll(async () => (await statusOf(page)).channel).toBe('none')
  })

})

test.describe('role rules', () => {
  test('a normal account has no update administration: the page is closed, the API says no, and the status carries no failure text', async ({ member }) => {
    const { page } = member
    await openAs(page, 'Erika Mustermann', '/')
    await expect(page.getByRole('link', { name: t('nav.admin') })).toHaveCount(0)
    await page.goto('/admin?tab=updates')
    await expect(page.getByTestId('admin-updates')).toHaveCount(0)
    expect((await apiCall(page, 'PUT', '/api/admin/updates/channel', { channel: 'beta' })).status).toBe(403)
    expect((await apiCall(page, 'POST', '/api/admin/updates/check')).status).toBe(403)
    expect((await apiCall(page, 'POST', '/api/admin/updates/install')).status).toBe(403)
    // The status itself is readable for everybody who is signed in, without the failure text
    const status = await statusOf(page)
    expect(status.error).toBeNull()
  })

  plain.describe('signed out', () => {
    plain.use({ storageState: SIGNED_OUT })
    plain('nobody who is not signed in gets the update status or the notes', async ({ request }) => {
      for (const path of ['/api/updates/status', '/api/whats-new', '/api/docs/handbook?lang=de']) {
        const response = await request.get(path, { headers: { 'X-Cv-Request': '1' } })
        expect(response.status(), path).toBe(401)
      }
    })
  })
})

plain.describe('About', () => {
  plain('version, licence, source link and the notes of this version', async ({ page }) => {
    await openApp(page, '/settings?tab=about')
    await expect(page.getByTestId('about')).toBeVisible()
    // The running version as the server writes it, whole (with its channel symbol)
    const running = await apiOk<{ version: string; short: string }>(page, 'GET', '/api/version')
    expect((await page.getByTestId('about-version').textContent())!.trim()).toBe(running.version)
    await expect(page.getByTestId('about-credit')).toContainText('♥')
    // The licence obliges the program to offer its source: a real link that opens elsewhere without handing over the window
    const source = page.getByTestId('about-source')
    await expect(source).toHaveAttribute('href', /^https:\/\//)
    await expect(source).toHaveAttribute('target', '_blank')
    await expect(source).toHaveAttribute('rel', /noopener/)
    await expect(page.getByText('AGPL-3.0-only').first()).toBeVisible()

    await page.getByRole('button', { name: t('about.whatsNew') }).click()
    // A development build has no notes of its own: the dialog says so calmly (the notes of a real version are covered by the server tests)
    const notes = page.getByRole('dialog')
    await expect(notes).toBeVisible()
    await expect(notes).toContainText(t('whatsNew.notAvailable'))
    await page.keyboard.press('Escape')
    await expect(notes).toBeHidden()
  })

  plain('every component with its licence is listed, searchable, and a search without a match says so', async ({ page }) => {
    await openApp(page, '/settings?tab=about')
    const list = page.getByTestId('license-list')
    await expect(list).toBeVisible()
    const rows = page.getByTestId('license-row')
    await expect.poll(() => rows.count()).toBeGreaterThan(20)
    const total = await rows.count()

    const search = page.getByLabel(t('about.search'))
    await search.pressSequentially('react')
    await expect.poll(() => rows.count()).toBeLessThan(total)
    await expect(rows.first()).toContainText(/react/i)
    await search.fill('zzzz-no-such-component')
    await expect(page.getByText(t('about.licensesNone'))).toBeVisible()
    await expect(rows).toHaveCount(0)
    await search.fill('')
    await expect.poll(() => rows.count()).toBe(total)
  })

  plain('the info icon at the foot of the sidebar leads here', async ({ page }) => {
    await openApp(page, '/')
    await page.getByTestId('open-about').click()
    await expect(page).toHaveURL(/\/settings\?tab=about/)
    await expect(page.getByTestId('about')).toBeVisible()
  })
})

plain.describe('the manual in the app', () => {
  plain('it opens in a dialog with the PDF in the language of the interface, switches language, offers a new tab and a download, and closes with Esc', async ({ page }) => {
    await openApp(page, '/')
    const requested: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/docs/handbook')) requested.push(new URL(request.url()).searchParams.get('lang') ?? '')
    })
    await page.getByTestId('open-handbook').click()
    const dialog = page.getByRole('dialog', { name: t('handbook.title') })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('pdf-preview-frame')).toBeVisible()
    expect(requested).toEqual(['de'])
    await expect(dialog.getByTestId('handbook-new-tab')).toHaveAttribute('href', /^blob:/)
    await expect(dialog.getByTestId('handbook-download')).toHaveAttribute('download', /Handbuch\.pdf$/)

    await dialog.getByRole('radio', { name: t('handbook.languages.en') }).click()
    await expect.poll(() => requested).toEqual(['de', 'en'])
    await expect(dialog.getByTestId('handbook-download')).toHaveAttribute('download', /Handbook\.pdf$/)

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  plain('a language that is not available is refused with a stable code', async ({ page }) => {
    await openApp(page, '/')
    const bad = await apiCall<{ code?: string }>(page, 'GET', '/api/docs/handbook?lang=fr')
    expect(bad.status).toBe(400)
    expect(JSON.stringify(bad.body)).not.toMatch(/Exception|at Cv\./)
  })
})
