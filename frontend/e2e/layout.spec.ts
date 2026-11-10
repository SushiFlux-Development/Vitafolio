import { expect, test } from '@playwright/test'
import { expectNotTruncated } from './checks'
import { expectNothingMoves, field, openApp, SIGNED_OUT, settledLayout } from './support'

// "Nothing moves": when a message appears, changes or disappears - a live hint, a server answer, an alert - nothing around
// it may move, grow or shrink, not the card, not the fields below, not the page width. German texts are longer than
// English ones, and 1024 px is the narrowest supported window, so both languages are measured there.
test.use({ viewport: { width: 1024, height: 768 } })

for (const language of ['de', 'en'] as const) {
  test.describe(language, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => localStorage.setItem('cv.language', value), language)
    })

    test.describe('signed out', () => {
      test.use({ storageState: SIGNED_OUT })

      test('sign-in: live hints and a failed sign-in do not move anything', async ({ page }) => {
        await page.goto('/login')
        await expect(field(page, 'username')).toBeVisible()
        const before = await settledLayout(page)

        await expectNothingMoves(page, 'typing a username', () => field(page, 'username').pressSequentially('nobody'), before)
        await expectNothingMoves(page, 'username emptied again', () => field(page, 'username').fill(''), before)
        await expectNothingMoves(
          page,
          'wrong credentials answered by the server',
          async () => {
            await field(page, 'username').fill('nobody-here')
            await field(page, 'password').fill('whatever whatever whatever')
            await page.locator('button[type="submit"]').click()
            await expect(page.getByTestId('error-notice')).toBeVisible()
          },
          before,
        )
        await expectNothingMoves(page, 'the copy confirmation', () => page.getByTestId('copy-button').click(), before)
      })

      test('sign-in: an empty submit marks the fields without moving anything', async ({ page }) => {
        await page.goto('/login')
        const before = await settledLayout(page)
        await expectNothingMoves(page, 'submit with empty fields', () => page.locator('button[type="submit"]').click(), before)
      })
    })

    test('settings: the password form hints do not move anything', async ({ page }) => {
      await openApp(page, '/settings?tab=security')
      const form = page.getByTestId('password-form')
      await expect(form).toBeVisible()
      const before = await settledLayout(page)
      await expectNothingMoves(page, 'current password typed', () => form.locator('input[name="currentPassword"]').fill('x'), before)
      await expectNothingMoves(page, 'a too short new password', () => form.locator('input[name="newPassword"]').fill('abc'), before)
      await expectNothingMoves(page, 'a repeat that does not match', () => form.locator('input[name="repeatPassword"]').fill('zzz'), before)
      await expectNothingMoves(
        page,
        'the server refusing a wrong current password',
        async () => {
          await form.locator('input[name="currentPassword"]').fill('not the password')
          await form.locator('input[name="newPassword"]').fill('a long enough new passphrase')
          await form.locator('input[name="repeatPassword"]').fill('a long enough new passphrase')
          await form.locator('button[type="submit"]').click()
          await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible()
        },
        before,
      )
      await expectNothingMoves(
        page,
        'all fields emptied again',
        async () => {
          for (const name of ['currentPassword', 'newPassword', 'repeatPassword']) await form.locator(`input[name="${name}"]`).fill('')
        },
        before,
      )
    })

    test('settings: a rare technical failure is laid over the content - nothing moves, it stays in the window, it can be closed', async ({ page }) => {
      await openApp(page, '/settings?tab=security')
      const form = page.getByTestId('password-form')
      await expect(form).toBeVisible()
      // The room under the button is only as tall as the normal answer ("changed"), no band for failures.
      const slot = form.locator('div.relative.grid').last()
      const slotHeightBefore = (await slot.boundingBox())!.height
      const longDetail = 'Ein sehr langer technischer Fehler, der in voller Länge lesbar bleiben muss und deshalb umbricht statt abgeschnitten zu werden. '.repeat(4)
      await page.route('**/api/account/password', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'internal', detail: longDetail, traceId: 'e2e-trace' }) }), { times: 1 })
      await form.locator('input[name="currentPassword"]').fill('whatever whatever whatever')
      await form.locator('input[name="newPassword"]').fill('a long enough new passphrase')
      await form.locator('input[name="repeatPassword"]').fill('a long enough new passphrase')
      const before = await settledLayout(page)
      await expectNothingMoves(page, 'a rare failure answered by the server', async () => {
        await form.locator('button[type="submit"]').click()
        await expect(page.getByTestId('alert-overlay')).toBeVisible()
      }, before)
      const overlay = page.getByTestId('alert-overlay')
      // The slot did not grow, and the failure stays inside the window and is not cut off.
      expect((await slot.boundingBox())!.height).toBe(slotHeightBefore)
      const box = (await overlay.boundingBox())!
      const viewport = page.viewportSize()!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      await expectNotTruncated(overlay.getByTestId('error-notice'), 'the laid-over failure')
      // Closing it uncovers everything again.
      await overlay.getByRole('button', { name: language === 'de' ? 'Schließen' : 'Close' }).click()
      await expect(overlay).toBeHidden()
    })

    test('backups: editing the schedule and the master switch move nothing', async ({ page }) => {
      await openApp(page, '/admin?tab=backups')
      await expect(page.getByTestId('week-preview')).toBeVisible()
      const master = page.getByRole('switch').first()
      const before = await settledLayout(page)
      await expectNothingMoves(page, 'the master switch turned off (preview caption changes)', () => master.click(), before)
      await expectNothingMoves(page, 'the master switch turned on again', () => master.click(), before)
      await expectNothingMoves(page, 'an invalid retention number', () => field(page, 'keepRecent').fill('1'), before)
      await expectNothingMoves(page, 'the number corrected again', () => field(page, 'keepRecent').fill('20'), before)
    })
  })
}
