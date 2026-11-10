import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import { appears, contrastBetween, openAs, setHelperState, useTheme } from './support'

/**
 * The live helper: the introduction at the first start and the hints on the main screens.
 *
 * Every window of the suite starts as one that has seen the helper (see support.ts), otherwise it would cover every other test. This
 * file forgets that on purpose, window by window, with setHelperState, and then reloads: that is how a browser looks that has never
 * been here. German interface, at the narrowest supported width (1024 px) unless a test says otherwise.
 */
test.use({ viewport: { width: 1024, height: 768 } })

const NAME = 'Erika Mustermann'
const introDialog = (page: Page) => page.getByRole('dialog', { name: /Willkommen bei/ })
const hintCard = (page: Page) => page.getByTestId('hint-card')
const spot = (page: Page) => page.getByTestId('hint-spot')
/** The "?" button in the sidebar. */
const helpButton = (page: Page) => page.getByTestId('open-help')

/** Opens a page of the app, forgets what the helper has seen as asked, and loads it again like a browser would. */
async function startAs(member: Member, path: string, state: Parameters<typeof setHelperState>[1]) {
  const { page } = member
  await openAs(page, NAME, path)
  await setHelperState(page, state)
  await page.reload()
  await expect(page.getByTestId('current-user')).toContainText(NAME)
}

/** The titles of the hints shown one after the other, until "Fertig" ends them. */
async function walkThrough(page: Page): Promise<{ titles: string[]; total: number }> {
  const titles: string[] = []
  const meta = (await hintCard(page).locator('p').first().textContent()) ?? ''
  const total = Number(/von (\d+)/.exec(meta)?.[1])
  for (;;) {
    titles.push((await hintCard(page).getByRole('heading').textContent()) ?? '')
    const finish = hintCard(page).getByRole('button', { name: 'Fertig' })
    if (await finish.isVisible()) {
      await finish.click()
      break
    }
    const before = titles.length
    await hintCard(page).getByRole('button', { name: 'Weiter' }).click()
    await expect(hintCard(page).getByRole('heading')).not.toHaveText(titles[before - 1]!)
  }
  return { titles, total }
}

test.describe('the introduction', () => {
  test('opens by itself at the very first start, once, and Esc ends it for good', async ({ member }) => {
    const { page } = member
    await startAs(member, '/', {})
    await expect(introDialog(page)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Schritt 1 von 6')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(introDialog(page)).toBeHidden()

    // Not again: neither after a reload nor on the next page
    await page.reload()
    await expect(page.getByTestId('current-user')).toContainText(NAME)
    expect(await appears(introDialog(page), 3_000), 'the introduction came back after it was closed').toBe(false)
    await page.goto('/profile')
    expect(await appears(introDialog(page), 2_500)).toBe(false)
  })

  test('keeps its size on every step, has the focus on "Weiter" and keeps Tab inside', async ({ member }) => {
    const { page } = member
    await startAs(member, '/settings?tab=appearance', { introDone: true, seen: ['settings'] })
    await page.getByTestId('restart-helper').click()
    const dialog = introDialog(page)
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('button', { name: /^Weiter/ })).toBeFocused()

    await page.waitForTimeout(500)
    const first = await dialog.boundingBox()
    for (let step = 1; step < 6; step++) {
      await page.keyboard.press('ArrowRight')
      await expect(page.getByText(`Schritt ${step + 1} von 6`)).toBeVisible()
      await page.waitForTimeout(300)
      const box = await dialog.boundingBox()
      expect(box, `the frame changed on step ${step + 1}`).toEqual(first)
    }
    await expect(page.getByRole('button', { name: /^Fertig/ })).toBeFocused()

    // Tab runs around inside the dialog and never reaches the page behind it
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((element) => element.contains(document.activeElement)), `focus left the dialog after ${i + 1} Tab presses`).toBe(true)
    }
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }
  })

  test('names the guide, and the last step leads to the profile, whose hints then open', async ({ member }) => {
    const { page } = member
    await startAs(member, '/settings?tab=appearance', { introDone: true, seen: ['settings'] })
    await page.getByTestId('restart-helper').click()
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
    await expect(page.getByText('In wenigen Klicks erfahren Sie, was in Ihrer Situation in die Bewerbung gehört.')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await page.getByRole('button', { name: 'Zum Stammprofil' }).click()
    await expect(page).toHaveURL(/\/profile/)
    await expect(introDialog(page)).toBeHidden()
    await expect(hintCard(page)).toBeVisible({ timeout: 8_000 })
  })

  test('the last step opens the manual', async ({ member }) => {
    const { page } = member
    await startAs(member, '/settings?tab=appearance', { introDone: true, seen: ['settings'] })
    await page.getByTestId('restart-helper').click()
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    await page.getByRole('button', { name: 'Handbuch öffnen' }).click()
    await expect(page.getByRole('dialog', { name: 'Handbuch' })).toBeVisible()
    await expect(introDialog(page)).toBeHidden()
  })
})

test.describe('the hints', () => {
  test('open by themselves on the first visit of a page, in order, and never again by themselves', async ({ member }) => {
    const { page } = member
    await startAs(member, '/applications', { introDone: true })
    await expect(hintCard(page)).toBeVisible({ timeout: 8_000 })
    const { titles, total } = await walkThrough(page)
    expect(titles).toHaveLength(total)
    expect(titles[0]).toBe('Neue Bewerbung')
    await expect(hintCard(page)).toBeHidden()

    await page.reload()
    await expect(page.getByTestId('current-user')).toContainText(NAME)
    expect(await appears(hintCard(page), 3_500), 'the hints came back by themselves').toBe(false)
  })

  test('come back through "?", and a control that is not on the page is skipped', async ({ member }) => {
    const { page } = member
    // A new account has no application yet: the board is not on the page, so its hint must not be shown
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    expect(await appears(hintCard(page), 2_500)).toBe(false)
    await expect(page.locator('[data-hint="applications-board"]')).toHaveCount(0)

    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    const { titles, total } = await walkThrough(page)
    expect(total).toBe(3)
    expect(titles).toEqual(['Neue Bewerbung', 'Anlagen & Zeugnisse', 'Ansicht'])
    expect(titles).not.toContain('Ihre Bewerbungen')
  })

  test('"?" starts the introduction on a page that has no hints', async ({ member }) => {
    const { page } = member
    await startAs(member, '/profile?view=wizard', { introDone: true, seen: ['profile'] })
    await helpButton(page).click()
    await expect(introDialog(page)).toBeVisible()
  })

  test('Esc ends them and gives the focus back to the "?" button', async ({ member }) => {
    const { page } = member
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    await helpButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(hintCard(page)).toBeVisible()
    await expect(hintCard(page).getByRole('button', { name: 'Weiter' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(hintCard(page)).toBeHidden()
    await expect(helpButton(page)).toBeFocused()
  })

  test('keep Tab inside the card and let nothing behind it be clicked', async ({ member }) => {
    const { page } = member
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      expect(await hintCard(page).evaluate((element) => element.contains(document.activeElement)), `focus left the card after ${i + 1} Tab presses`).toBe(true)
    }
    // A click on "Neue Bewerbung" behind the dimmed layer does not reach the button: no form dialog opens, only the card is there
    const button = await page.locator('[data-hint="applications-new"]').boundingBox()
    await page.mouse.click(button!.x + button!.width / 2, button!.y + button!.height / 2)
    await expect(page.getByRole('dialog')).toHaveCount(1)
  })

  test('the light sits on the control and the card stays in the window, also after the window changed its size', async ({ member }) => {
    const { page } = member
    await startAs(member, '/settings?tab=appearance', { introDone: true, seen: ['settings'] })
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()

    const check = async (label: string) => {
      for (let step = 0; step < 2; step++) {
        await page.waitForTimeout(500)
        const target = await page.locator(step === 0 ? '[data-hint="settings-tabs"]' : '[data-hint="settings-helper"]').boundingBox()
        const light = await spot(page).boundingBox()
        const box = await hintCard(page).boundingBox()
        const viewport = page.viewportSize()!
        expect(target && light, label).toBeTruthy()
        // The lit area surrounds the control with a small margin
        expect(light!.x, `${label}: left edge`).toBeLessThanOrEqual(target!.x)
        expect(light!.y, `${label}: top edge`).toBeLessThanOrEqual(target!.y)
        expect(light!.x + light!.width, `${label}: right edge`).toBeGreaterThanOrEqual(target!.x + target!.width)
        expect(light!.y + light!.height, `${label}: bottom edge`).toBeGreaterThanOrEqual(target!.y + target!.height)
        expect(light!.width - target!.width, label).toBeLessThanOrEqual(24)
        // The card lies completely inside the window
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.y).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
        if (step === 0) await hintCard(page).getByRole('button', { name: 'Weiter' }).click()
      }
    }
    await check('1024 x 768')

    // Start over at a different size: the light follows the control, the card the window
    await page.keyboard.press('Escape')
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    await page.setViewportSize({ width: 1280, height: 600 })
    await check('1280 x 600 after a resize')
  })

  test('follow the page when it scrolls', async ({ member }) => {
    const { page } = member
    await startAs(member, '/settings?tab=appearance', { introDone: true, seen: ['settings'] })
    await page.setViewportSize({ width: 1024, height: 420 })
    await helpButton(page).click()
    await hintCard(page).getByRole('button', { name: 'Weiter' }).click()
    await expect(hintCard(page).getByRole('heading')).toHaveText('Einführung und Hinweise')
    await page.waitForTimeout(600)
    const before = await page.locator('[data-hint="settings-helper"]').boundingBox()
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(600)
    const after = await page.locator('[data-hint="settings-helper"]').boundingBox()
    const light = await spot(page).boundingBox()
    if (before && after && before.y !== after.y) {
      expect(Math.abs(light!.y - (after.y - 6)), 'the light did not follow the scrolling').toBeLessThanOrEqual(2)
    }
  })

  test('move nothing on the page when they come and go', async ({ member }) => {
    const { page } = member
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    const snapshot = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('main h1, main h2, main button, main a[href], main input, aside a[href], aside button')].map((element) => {
          const box = element.getBoundingClientRect()
          return `${Math.round(box.x * 10) / 10},${Math.round(box.y * 10) / 10},${Math.round(box.width * 10) / 10},${Math.round(box.height * 10) / 10}`
        }),
      )
    await page.waitForTimeout(500)
    const before = await snapshot()
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    await page.waitForTimeout(400)
    expect(await snapshot(), 'the page moved while the hints were open').toEqual(before)
    await page.keyboard.press('Escape')
    await expect(hintCard(page)).toBeHidden()
    await page.waitForTimeout(400)
    expect(await snapshot(), 'the page moved when the hints went').toEqual(before)
  })

  test('wait while another dialog owns the screen and come when it is gone', async ({ member }) => {
    const { page } = member
    // A page whose hints are seen, so nothing starts by itself; then the screen is switched inside the app while a dialog is open
    await startAs(member, '/settings?tab=appearance', { introDone: true, seen: ['settings'] })
    await page.getByRole('button', { name: 'KI-Einstellungen' }).click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
    await page.evaluate(() => {
      window.history.pushState({}, '', '/applications')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(await appears(hintCard(page), 3_500), 'the hints came up over a dialog').toBe(false)
    await page.keyboard.press('Escape')
    await expect(hintCard(page)).toBeVisible({ timeout: 8_000 })
  })

  test('respect "reduce motion": the light is on the control at once', async ({ member }) => {
    const { page } = member
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    await page.waitForTimeout(150)
    const target = await page.locator('[data-hint="applications-new"]').boundingBox()
    const light = await spot(page).boundingBox()
    expect(Math.abs(light!.x - (target!.x - 6))).toBeLessThanOrEqual(2)
    expect(Math.abs(light!.y - (target!.y - 6))).toBeLessThanOrEqual(2)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`are readable in the ${theme} theme (text 4.5:1, the ring around the control 3:1)`, async ({ member }) => {
      const { page } = member
      await useTheme(page, theme)
      await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
      await helpButton(page).click()
      await expect(hintCard(page)).toBeVisible()
      await page.waitForTimeout(400)

      const colors = await hintCard(page).evaluate((card) => {
        const style = (selector: string) => getComputedStyle(card.querySelector(selector)!).color
        return { background: getComputedStyle(card).backgroundColor, title: style('h2'), text: style('p:nth-of-type(2)'), meta: style('p') }
      })
      for (const [name, color] of Object.entries({ title: colors.title, text: colors.text, meta: colors.meta })) {
        expect(await contrastBetween(page, color, colors.background), `${theme}: ${name} of the card`).toBeGreaterThanOrEqual(4.5)
      }

      // The ring is the text colour of the theme; the page behind it is the page colour under the dimming layer
      const { ink, bg, overlay } = await page.evaluate(() => {
        const read = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
        return { ink: read('--ink'), bg: read('--bg'), overlay: read('--overlay') }
      })
      const [r, g, b, alpha = '1'] = overlay.match(/[\d.]+/g)!
      const dimmed = await page.evaluate(
        ([base, red, green, blue, a]) => {
          const canvas = document.createElement('canvas')
          canvas.width = canvas.height = 1
          const context = canvas.getContext('2d')!
          context.fillStyle = base!
          context.fillRect(0, 0, 1, 1)
          context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${a})`
          context.fillRect(0, 0, 1, 1)
          const [pr, pg, pb] = context.getImageData(0, 0, 1, 1).data
          return `rgb(${pr}, ${pg}, ${pb})`
        },
        [bg, r, g, b, alpha] as const,
      )
      expect(await contrastBetween(page, ink, dimmed), `${theme}: ring against the dimmed page`).toBeGreaterThanOrEqual(3)
    })
  }
})

test.describe('moving the explanation windows', () => {
  const grip = (page: Page) => page.getByTestId('drag-grip')
  const resetButton = (page: Page) => page.getByTestId('drag-reset')
  const inside = (box: { x: number; y: number; width: number; height: number } | null, page: Page) => {
    const viewport = page.viewportSize()!
    expect(box).toBeTruthy()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
  }
  /** Position and size of what is on the page itself (not of the helper). */
  const pageSnapshot = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('main h1, main button, main a[href], main input, aside a[href], aside button')]
        .filter((element) => !element.closest('[data-live-helper]'))
        .map((element) => {
          const box = element.getBoundingClientRect()
          return `${Math.round(box.x * 10) / 10},${Math.round(box.y * 10) / 10},${Math.round(box.width * 10) / 10},${Math.round(box.height * 10) / 10}`
        }),
    )

  test('the hint card is dragged by its head, stays inside the window and moves nothing else', async ({ member }) => {
    const { page } = member
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    await page.waitForTimeout(600)
    const before = await pageSnapshot(page)
    const light = await spot(page).boundingBox()
    const start = await hintCard(page).boundingBox()

    const handle = await page.getByTestId('hint-handle').boundingBox()
    // Grab at the free part of the head (right of the grip, left of the reset), not on a button
    const grab = { x: handle!.x + handle!.width / 2, y: handle!.y + handle!.height / 2 }
    await page.mouse.move(grab.x, grab.y)
    await page.mouse.down()
    await page.mouse.move(grab.x + 120, grab.y + 90, { steps: 8 })
    await page.mouse.up()

    const moved = await hintCard(page).boundingBox()
    expect(Math.abs(moved!.x - (start!.x + 120))).toBeLessThanOrEqual(2)
    expect(Math.abs(moved!.y - (start!.y + 90))).toBeLessThanOrEqual(2)
    // The light and the page stay where they were, and no text got marked
    expect(await spot(page).boundingBox()).toEqual(light)
    expect(await pageSnapshot(page)).toEqual(before)
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
    await expect(resetButton(page)).toBeVisible()

    // Far beyond the window: the card stops at the edge, completely inside
    const now = await page.getByTestId('hint-handle').boundingBox()
    await page.mouse.move(now!.x + now!.width / 2, now!.y + now!.height / 2)
    await page.mouse.down()
    await page.mouse.move(5000, 5000, { steps: 6 })
    await page.mouse.up()
    inside(await hintCard(page).boundingBox(), page)
    await page.mouse.move(0, 0)
    const corner = await page.getByTestId('hint-handle').boundingBox()
    await page.mouse.move(corner!.x + corner!.width / 2, corner!.y + corner!.height / 2)
    await page.mouse.down()
    await page.mouse.move(-5000, -5000, { steps: 6 })
    await page.mouse.up()
    inside(await hintCard(page).boundingBox(), page)
  })

  test('the card stays where it was put from hint to hint, the light goes on; "Position zurücksetzen" places it by itself again', async ({ member }) => {
    const { page } = member
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    await page.waitForTimeout(500)
    const auto = await hintCard(page).boundingBox()
    await grip(page).focus()
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(200)
    const put = await hintCard(page).boundingBox()
    expect(Math.round(put!.y - auto!.y)).toBe(192)

    const lightBefore = await spot(page).boundingBox()
    await hintCard(page).getByRole('button', { name: 'Weiter' }).click()
    await expect(hintCard(page).getByRole('heading')).toHaveText('Anlagen & Zeugnisse')
    await page.waitForTimeout(700)
    const next = await hintCard(page).boundingBox()
    expect(next!.x, 'the card jumped to the next control').toBeCloseTo(put!.x, 0)
    expect(next!.y, 'the card jumped to the next control').toBeCloseTo(put!.y, 0)
    expect(await spot(page).boundingBox(), 'the light did not go on to the next control').not.toEqual(lightBefore)

    await resetButton(page).click()
    await page.waitForTimeout(700)
    const back = await hintCard(page).boundingBox()
    expect(back!.y).not.toBeCloseTo(put!.y, 0)
    await expect(resetButton(page)).toBeHidden()

    // A new start with "?" places the card by itself, even if it had been moved before
    await grip(page).focus()
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Escape')
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    await expect(resetButton(page)).toBeHidden()
  })

  test('the arrow keys on the grip move the card (Shift in larger steps), the grip is described and the focus trap holds', async ({ member }) => {
    const { page } = member
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    await expect(grip(page)).toHaveAttribute('aria-label', /Fenster verschieben/)
    await page.waitForTimeout(500)
    await grip(page).focus()
    const start = await hintCard(page).boundingBox()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(150)
    const small = await hintCard(page).boundingBox()
    expect(Math.round(small!.x - start!.x)).toBe(16)
    expect(Math.round(small!.y - start!.y)).toBe(16)
    await page.keyboard.press('Shift+ArrowLeft')
    await page.waitForTimeout(150)
    const large = await hintCard(page).boundingBox()
    expect(Math.round(small!.x - large!.x)).toBe(64)
    await expect(grip(page)).toBeFocused()
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      expect(await hintCard(page).evaluate((element) => element.contains(document.activeElement))).toBe(true)
    }
  })

  test('a smaller window pushes the card back in', async ({ member }) => {
    const { page } = member
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    await grip(page).focus()
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowRight')
    await page.setViewportSize({ width: 1024, height: 600 })
    await page.waitForTimeout(300)
    inside(await hintCard(page).boundingBox(), page)
    await page.setViewportSize({ width: 1100, height: 420 })
    await page.waitForTimeout(300)
    inside(await hintCard(page).boundingBox(), page)
  })

  test('with "reduce motion" the card follows the key at once', async ({ member }) => {
    const { page } = member
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await startAs(member, '/applications', { introDone: true, seen: ['applications'] })
    await helpButton(page).click()
    await expect(hintCard(page)).toBeVisible()
    await page.waitForTimeout(150)
    const start = await hintCard(page).boundingBox()
    await grip(page).focus()
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(100)
    const moved = await hintCard(page).boundingBox()
    expect(Math.round(moved!.y - start!.y)).toBe(64)
  })

  test('the introduction is dragged by its head as well, keeps its place from step to step and stays inside the window', async ({ member }) => {
    const { page } = member
    await startAs(member, '/settings?tab=appearance', { introDone: true, seen: ['settings'] })
    await page.getByTestId('restart-helper').click()
    const dialog = introDialog(page)
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(500)
    const start = await dialog.boundingBox()
    const head = await page.getByTestId('drag-head').boundingBox()
    // The title, not a button
    await page.mouse.move(head!.x + head!.width / 2 - 100, head!.y + head!.height / 2)
    await page.mouse.down()
    await page.mouse.move(head!.x + head!.width / 2 - 100 - 80, head!.y + head!.height / 2 + 60, { steps: 6 })
    await page.mouse.up()
    const moved = await dialog.boundingBox()
    expect(Math.abs(moved!.x - (start!.x - 80))).toBeLessThanOrEqual(2)
    expect(Math.abs(moved!.y - (start!.y + 60))).toBeLessThanOrEqual(2)
    await expect(page.getByText('Schritt 1 von 6')).toBeVisible()

    await page.getByRole('button', { name: /^Weiter/ }).click()
    await expect(page.getByText('Schritt 2 von 6')).toBeVisible()
    await page.waitForTimeout(300)
    expect(await dialog.boundingBox()).toEqual(moved)

    await grip(page).focus()
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(150)
    // The arrow keys on the grip moved the dialog; they did not leave the step
    await expect(page.getByText('Schritt 2 von 6')).toBeVisible()
    inside(await dialog.boundingBox(), page)
    await page.setViewportSize({ width: 1024, height: 560 })
    await page.waitForTimeout(300)
    inside(await dialog.boundingBox(), page)

    await resetButton(page).click()
    await page.waitForTimeout(200)
    await expect(resetButton(page)).toBeHidden()
  })
})
