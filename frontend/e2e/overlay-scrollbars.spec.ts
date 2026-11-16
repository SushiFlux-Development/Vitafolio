import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { contrastBetween, openApp, useTheme } from './support'

// Overlay scrollbars (src/styles/overlayScrollbars.ts, .os-thumb in src/styles/index.css), at the narrowest supported window:
//  - the native scrollbar is hidden and never takes layout room: nothing moves when a page or an inner area becomes scrollable
//  - an own thumb appears while scrolling or near the edge, only where there is something to scroll, and fades out by itself
//  - the thumb can be dragged
//  - reduced motion turns the fading off
//  - the thumb has at least 3:1 contrast against the page and the sidebar surface in light and dark
//  - the same for an inner scroll area (the list of the sidebar)
// The areas are made scrollable by appending a tall filler: that works the same on every page and in every language.
test.use({ viewport: { width: 1024, height: 700 } })

const FILLER = 'e2e-scroll-filler'

/** Appends a tall empty block to the page (`target` "page") or to the list of the sidebar (`target` "nav"). */
async function addFiller(page: Page, target: 'page' | 'nav', height = 4000) {
  await page.evaluate(
    ([where, size, id]) => {
      const host = where === 'nav' ? document.querySelector('aside nav')! : document.body
      const filler = document.createElement('div')
      filler.id = id as string
      filler.setAttribute('aria-hidden', 'true')
      filler.style.height = `${size}px`
      host.appendChild(filler)
    },
    [target, height, FILLER] as const,
  )
}

interface ThumbState {
  visible: boolean
  opacity: number
  x: number
  y: number
  width: number
  height: number
  transition: string
  barTransition: string
  barColor: string
}

/**
 * The vertical thumb of the page (its right edge is the right edge of the window) or of the sidebar list (it lies inside the
 * sidebar); null while that thumb does not exist.
 */
async function thumbOf(page: Page, which: 'page' | 'nav'): Promise<ThumbState | null> {
  return page.evaluate((target) => {
    const aside = document.querySelector('aside')!.getBoundingClientRect()
    const windowRight = document.documentElement.clientWidth
    for (const node of document.querySelectorAll<HTMLElement>('.os-thumb[data-axis="y"]')) {
      const box = node.getBoundingClientRect()
      const isPage = Math.abs(box.right - windowRight) <= 1
      const isNav = box.right <= aside.right + 1 && box.left >= aside.left - 1
      if ((target === 'page' && !isPage) || (target === 'nav' && !isNav)) continue
      const style = getComputedStyle(node)
      return {
        visible: node.dataset.visible === 'true',
        opacity: parseFloat(style.opacity),
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        transition: `${style.transitionProperty} | ${style.transitionDuration}`,
        barTransition: getComputedStyle(node, '::before').transitionDuration,
        barColor: getComputedStyle(node, '::before').backgroundColor,
      }
    }
    return null
  }, which)
}

/** Scrolls the area under the pointer with the mouse wheel, as a user does. */
async function wheelOver(page: Page, x: number, y: number, delta = 300) {
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, delta)
}

test.describe('overlay scrollbars at the narrowest window (1024 px)', () => {
  test('the page keeps its full width and nothing moves when it becomes scrollable', async ({ page }) => {
    await openApp(page, '/')
    const measure = () =>
      page.evaluate(() => {
        const rect = (element: Element) => {
          const box = element.getBoundingClientRect()
          return `${box.x}, ${box.y}, ${box.width} x ${box.height}`
        }
        const root = document.documentElement
        return {
          clientWidth: root.clientWidth,
          innerWidth: window.innerWidth,
          scrollable: root.scrollHeight > root.clientHeight + 1,
          sidebar: rect(document.querySelector('aside')!),
          main: rect(document.querySelector('main')!),
          user: rect(document.querySelector('[data-testid="current-user"]')!),
        }
      })
    // A filler of height 0 is the state before; the tall one makes the page scroll when it did not already.
    await addFiller(page, 'page', 0)
    const before = await measure()
    await page.evaluate((id) => ((document.getElementById(id)!.style.height = '4000px'), undefined), FILLER)
    await expect.poll(async () => (await measure()).scrollable).toBe(true)
    const after = await measure()
    expect(before.clientWidth, 'no reserved gutter before').toBe(before.innerWidth)
    expect(after.clientWidth, 'no reserved gutter once the page scrolls').toBe(after.innerWidth)
    expect(after.sidebar, 'sidebar did not move').toBe(before.sidebar)
    expect(after.main, 'main area did not change its width or position').toBe(before.main)
    expect(after.user, 'user area did not move').toBe(before.user)
  })

  test('the native scrollbar is hidden on the page and on an inner scroll area', async ({ page }) => {
    await openApp(page, '/')
    await addFiller(page, 'page')
    await addFiller(page, 'nav')
    const native = await page.evaluate(() => {
      const nav = document.querySelector('aside nav') as HTMLElement
      const root = document.documentElement
      return {
        rootWidthProperty: getComputedStyle(root).scrollbarWidth,
        navWidthProperty: getComputedStyle(nav).scrollbarWidth,
        navScrolls: nav.scrollHeight > nav.clientHeight + 1,
        pageScrolls: root.scrollHeight > root.clientHeight + 1,
        // offsetWidth includes a native scrollbar, clientWidth does not (the nav has no border)
        navBar: nav.offsetWidth - nav.clientWidth,
        pageBar: window.innerWidth - root.clientWidth,
      }
    })
    expect(native.pageScrolls, 'the page really scrolls in this test').toBe(true)
    expect(native.navScrolls, 'the sidebar list really scrolls in this test').toBe(true)
    expect(native.rootWidthProperty).toBe('none')
    expect(native.navWidthProperty).toBe('none')
    expect(native.pageBar, 'no native scrollbar width on the page').toBe(0)
    expect(native.navBar, 'no native scrollbar width in the sidebar list').toBe(0)
  })

  test('a thumb exists only where something scrolls, appears while scrolling and fades out by itself', async ({ page }) => {
    await openApp(page, '/')
    // Nothing is scrolled yet and the sidebar list does not scroll without a filler: no visible thumb
    expect((await thumbOf(page, 'nav'))?.visible ?? false, 'no thumb for a list that does not scroll').toBe(false)
    await addFiller(page, 'page')
    expect((await thumbOf(page, 'page'))?.visible ?? false, 'no thumb before anything scrolled').toBe(false)

    await wheelOver(page, 600, 350)
    await expect.poll(async () => (await thumbOf(page, 'page'))?.visible, { message: 'thumb appears while scrolling' }).toBe(true)
    await expect.poll(async () => (await thumbOf(page, 'page'))?.opacity).toBe(1)
    const shown = (await thumbOf(page, 'page'))!
    expect(shown.height, 'a long page gives a short thumb').toBeLessThan(700 / 2)
    expect(shown.width, 'the grab area is wider than the visible bar').toBeGreaterThanOrEqual(10)

    // It hides by itself about 1.5 s after the last scroll, then fades
    await expect.poll(async () => (await thumbOf(page, 'page'))?.visible, { timeout: 8_000, message: 'thumb fades out after the delay' }).toBe(false)
    await expect.poll(async () => (await thumbOf(page, 'page'))?.opacity, { timeout: 3_000 }).toBe(0)
  })

  test('the thumb appears when the pointer is near the right edge and stays while the pointer is on it', async ({ page }) => {
    await openApp(page, '/')
    await addFiller(page, 'page')
    await page.mouse.move(600, 350)
    await page.mouse.move(1024 - 6, 350)
    await expect.poll(async () => (await thumbOf(page, 'page'))?.visible, { message: 'thumb appears near the edge' }).toBe(true)
    // Past the hide delay it is still there, because the pointer has not left the edge zone
    await page.waitForTimeout(2_000)
    expect((await thumbOf(page, 'page'))?.visible, 'thumb stays while the pointer is near').toBe(true)
    await page.mouse.move(600, 350)
    await expect.poll(async () => (await thumbOf(page, 'page'))?.visible, { timeout: 8_000, message: 'thumb leaves with the pointer' }).toBe(false)
  })

  test('dragging the thumb scrolls the page, up and down', async ({ page }) => {
    await openApp(page, '/')
    await addFiller(page, 'page')
    await wheelOver(page, 600, 350, 200)
    await expect.poll(async () => (await thumbOf(page, 'page'))?.visible).toBe(true)
    const scrollY = () => page.evaluate(() => Math.round(window.scrollY))
    const start = await scrollY()
    const thumb = (await thumbOf(page, 'page'))!
    const grabX = thumb.x + thumb.width - 8
    const grabY = thumb.y + thumb.height / 2

    await page.mouse.move(grabX, grabY)
    await page.mouse.down()
    await page.mouse.move(grabX, grabY + 100, { steps: 5 })
    const dragged = await scrollY()
    // The filler is 4000 px high, so 100 px of thumb travel is far more than 100 px of page
    expect(dragged, 'dragging down scrolled the page down').toBeGreaterThan(start + 100)
    await page.mouse.move(grabX, grabY, { steps: 5 })
    await page.mouse.up()
    expect(await scrollY(), 'dragging back scrolled the page back').toBeLessThan(dragged)
    expect(await scrollY()).toBeCloseTo(start, -1)

    // While the pointer rests on the thumb it stays visible past the hide delay
    await page.waitForTimeout(2_000)
    expect((await thumbOf(page, 'page'))?.visible, 'thumb stays while the pointer is on it').toBe(true)
  })

  test('the sidebar list has its own thumb inside the sidebar, drags, and does not take width', async ({ page }) => {
    await openApp(page, '/')
    await addFiller(page, 'nav', 3000)
    const widths = () =>
      page.evaluate(() => {
        const nav = document.querySelector('aside nav') as HTMLElement
        return { aside: document.querySelector('aside')!.getBoundingClientRect().width, navClient: nav.clientWidth, navScroll: nav.scrollTop }
      })
    const before = await widths()
    await wheelOver(page, 100, 300, 300)
    await expect.poll(async () => (await thumbOf(page, 'nav'))?.visible, { message: 'thumb of the list appears' }).toBe(true)
    const thumb = (await thumbOf(page, 'nav'))!
    const aside = await page.locator('aside').boundingBox()
    expect(thumb.x + thumb.width, 'the thumb lies at the right edge of the sidebar').toBeLessThanOrEqual(aside!.x + aside!.width + 1)
    expect((await thumbOf(page, 'page'))?.visible ?? false, 'the page itself did not scroll, so it has no thumb').toBe(false)
    const scrolled = await widths()
    expect(scrolled.aside, 'sidebar width unchanged').toBe(before.aside)
    expect(scrolled.navClient, 'list width unchanged').toBe(before.navClient)

    const start = scrolled.navScroll
    const grabX = thumb.x + thumb.width - 8
    const grabY = thumb.y + thumb.height / 2
    await page.mouse.move(grabX, grabY)
    await page.mouse.down()
    await page.mouse.move(grabX, grabY + 60, { steps: 5 })
    await page.mouse.up()
    expect((await widths()).navScroll, 'dragging the list thumb scrolled the list').toBeGreaterThan(start + 60)
  })

  test('with reduced motion the thumb has no transition at all; otherwise it fades', async ({ page }) => {
    await openApp(page, '/')
    await addFiller(page, 'page')
    await wheelOver(page, 600, 350)
    await expect.poll(async () => (await thumbOf(page, 'page'))?.visible).toBe(true)
    const animated = (await thumbOf(page, 'page'))!
    expect(animated.transition, 'the thumb fades with motion allowed').toContain('opacity')
    expect(animated.transition).not.toMatch(/\| 0s$/)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(async () => (await thumbOf(page, 'page'))?.transition).toMatch(/\| 0s(, 0s)*$/)
    const reduced = (await thumbOf(page, 'page'))!
    expect(reduced.barTransition, 'no transition on the bar either').toMatch(/^0s(, 0s)*$/)

    // Without fading the thumb is gone the moment it is hidden: no half-transparent frames
    await wheelOver(page, 600, 350, 10)
    await expect.poll(async () => (await thumbOf(page, 'page'))?.visible, { timeout: 8_000 }).toBe(false)
    expect((await thumbOf(page, 'page'))!.opacity, 'hidden thumb is fully transparent at once').toBe(0)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`the thumb colour has at least 3:1 contrast against the page and the sidebar in the ${theme} theme`, async ({ page }) => {
      await useTheme(page, theme)
      await openApp(page, '/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await addFiller(page, 'page')
      await wheelOver(page, 600, 350)
      await expect.poll(async () => (await thumbOf(page, 'page'))?.visible).toBe(true)
      const thumb = (await thumbOf(page, 'page'))!
      const colours = await page.evaluate(() => ({
        page: getComputedStyle(document.body).backgroundColor,
        surface: getComputedStyle(document.querySelector('aside')!).backgroundColor,
        active: getComputedStyle(document.documentElement).getPropertyValue('--focus').trim(),
      }))
      expect(thumb.barColor, 'the bar is opaque').not.toMatch(/rgba\(.*, 0\)|transparent/)
      expect(await contrastBetween(page, thumb.barColor, colours.page), `${theme}: thumb on the page background`).toBeGreaterThanOrEqual(3)
      expect(await contrastBetween(page, thumb.barColor, colours.surface), `${theme}: thumb on the sidebar surface`).toBeGreaterThanOrEqual(3)
      expect(await contrastBetween(page, colours.active, colours.page), `${theme}: thumb while hovered or dragged on the page background`).toBeGreaterThanOrEqual(3)
    })
  }
})
