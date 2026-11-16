import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { labelsFor } from './labels'
import { openApp } from './support'

// The frame of every page, from the narrowest supported window to 4K, landscape and portrait (one monitor stands upright):
//  - the page fills the whole width of the window with one small even margin on all four sides, no maximum width, no centred column
//  - no horizontal scrollbar anywhere
//  - the sidebar never scrolls as a whole: the user area stays in view, only the list of entries scrolls
//  - the PDF preview takes the larger share of the width and the height
// German interface, as in the other layout specs.
const t = labelsFor('de')

const WINDOWS = [
  { name: 'narrowest and low (1024 x 700)', width: 1024, height: 700 },
  { name: 'Full HD (1920 x 1080)', width: 1920, height: 1080 },
  { name: '4K (3840 x 2160)', width: 3840, height: 2160 },
  { name: 'portrait (1080 x 1920)', width: 1080, height: 1920 },
] as const

const PROFILE_SECTIONS = ['personal', 'experiences', 'educations', 'skills', 'languages', 'certificates', 'interests', 'customSections', 'preview'] as const

const PAGES = [
  '/',
  ...PROFILE_SECTIONS.map((section) => `/profile?tab=${section}`),
  '/profile?view=wizard',
  '/cover-letters',
  '/applications',
  '/export',
  '/export?tab=cv',
  '/settings?tab=appearance',
  '/settings?tab=security',
  '/settings?tab=about',
  '/admin?tab=users',
  '/admin?tab=settings',
  '/admin?tab=updates',
  '/admin?tab=activity',
  '/admin?tab=backups',
]

/** The page frame and the sidebar, measured in the browser. */
async function frameOf(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')!
    const wrapper = main.firstElementChild as HTMLElement
    const style = getComputedStyle(wrapper)
    const aside = document.querySelector('aside')!
    const user = document.querySelector('[data-testid="current-user"]')!.getBoundingClientRect()
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      mainWidth: main.getBoundingClientRect().width,
      wrapperWidth: wrapper.getBoundingClientRect().width,
      maxWidth: style.maxWidth,
      margins: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map((value) => Math.round(parseFloat(value) * 100) / 100),
      asideScrolls: aside.scrollHeight > aside.clientHeight + 1,
      userBottom: user.bottom,
      windowHeight: window.innerHeight,
    }
  })
}

for (const size of WINDOWS) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('every page fills the window with an even margin, has no horizontal scrollbar and keeps the user area of the sidebar in view', async ({ page }) => {
      test.setTimeout(240_000)
      for (const path of PAGES) {
        await openApp(page, path)
        await page.waitForTimeout(250)
        const frame = await frameOf(page)
        const where = `${path} at ${size.name}`
        expect(frame.scrollWidth, `${where}: horizontal scrollbar`).toBeLessThanOrEqual(frame.clientWidth)
        expect(frame.maxWidth, `${where}: the page has no maximum width`).toBe('none')
        expect(frame.wrapperWidth, `${where}: the page takes the whole width beside the sidebar`).toBeCloseTo(frame.mainWidth, 0)
        expect(new Set(frame.margins).size, `${where}: one margin on all four sides (${frame.margins.join(', ')})`).toBe(1)
        expect(frame.margins[0], `${where}: the margin is small`).toBeLessThanOrEqual(40)
        expect(frame.asideScrolls, `${where}: the sidebar as a whole scrolls`).toBe(false)
        expect(frame.userBottom, `${where}: the user area is in view`).toBeLessThanOrEqual(frame.windowHeight)
      }
    })

    test('the profile sections are all reachable in the sidebar tree: only the list scrolls, the user area stays in view', async ({ page }) => {
      await openApp(page, '/profile?tab=personal')
      const list = page.getByRole('navigation', { name: t('profile.sections') })
      const last = list.getByRole('link', { name: t('profile.tabs.preview'), exact: true })
      await last.scrollIntoViewIfNeeded()
      await expect(last).toBeInViewport({ ratio: 1 })
      // Nothing of the user area covers it: the entry itself is what a click at its centre hits
      const box = (await last.boundingBox())!
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
      expect(hit).toBe('/profile?tab=preview')
      await expect(page.getByTestId('current-user')).toBeInViewport({ ratio: 1 })
      await last.click()
      await expect(page).toHaveURL(/tab=preview/)
      await expect(last).toHaveAttribute('aria-current', 'page')
      // The sections are sub-pages of the profile's row in the one tree: the main navigation stays around them
      await expect(page.getByRole('navigation', { name: t('nav.label') }).getByRole('link', { name: t('nav.profile'), exact: true })).toHaveAttribute('aria-expanded', 'true')
    })
  })
}

test.describe('PDF preview in the profile', () => {
  test.describe('large window', () => {
    test.use({ viewport: { width: 1920, height: 1080 } })

    test('the options are a narrow column on the left, the preview takes the rest of the width and the height of the window', async ({ page }) => {
      await openApp(page, '/profile?tab=preview')
      const frame = page.getByTestId('pdf-preview-frame')
      await expect(frame).toBeVisible()
      const options = page.getByRole('region', { name: t('profile.preview.options') })
      const frameBox = (await frame.boundingBox())!
      const optionsBox = (await options.boundingBox())!
      expect(optionsBox.width, 'the options column is narrow').toBeLessThanOrEqual(320)
      expect(optionsBox.x + optionsBox.width, 'the options stand left of the preview').toBeLessThanOrEqual(frameBox.x)
      expect(frameBox.width, 'the preview has the larger share of the width').toBeGreaterThanOrEqual(1100)
      expect(frameBox.height, 'the preview uses the height of the window').toBeGreaterThanOrEqual(1080 - 300)
      // The viewer starts without the thumbnail bar and fitted to the width (the fragment of the address)
      expect(await frame.getAttribute('src')).toMatch(/^blob:.*#navpanes=0&view=FitH$/)

      // The options stay in view while the page scrolls
      await page.mouse.wheel(0, 400)
      await page.waitForTimeout(200)
      await expect(options).toBeInViewport({ ratio: 0.5 })
    })
  })

  test.describe('portrait', () => {
    test.use({ viewport: { width: 1080, height: 1920 } })

    test('the options lie above the preview and the preview grows with the height', async ({ page }) => {
      await openApp(page, '/profile?tab=preview')
      const frame = page.getByTestId('pdf-preview-frame')
      await expect(frame).toBeVisible()
      const options = page.getByRole('region', { name: t('profile.preview.options') })
      const frameBox = (await frame.boundingBox())!
      const optionsBox = (await options.boundingBox())!
      expect(optionsBox.y + optionsBox.height, 'the options are above the preview').toBeLessThanOrEqual(frameBox.y + 1)
      expect(frameBox.width).toBeGreaterThanOrEqual(1080 - 256 - 100)
      expect(frameBox.height).toBeGreaterThanOrEqual(1100)
    })
  })

  test.describe('narrowest window', () => {
    test.use({ viewport: { width: 1024, height: 700 } })

    test('the preview is as wide as the page and not smaller than 36 rem high; the options sit above it', async ({ page }) => {
      await openApp(page, '/profile?tab=preview')
      const frame = page.getByTestId('pdf-preview-frame')
      await expect(frame).toBeVisible()
      const frameBox = (await frame.boundingBox())!
      expect(frameBox.width).toBeGreaterThanOrEqual(1024 - 256 - 100)
      // The 36 rem are the height of the preview box with its 1 px border (the frame inside is 2 px less); the frame fills the box
      const box = (await frame.locator('xpath=..').boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(36 * 16)
      expect(frameBox.height).toBeGreaterThanOrEqual(box.height - 2)
    })
  })
})
