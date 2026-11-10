import { chromium, expect, test } from '@playwright/test'
import type { Browser, Page } from '@playwright/test'
import { apiOk, createUser, removeUsers, signedInContext } from './support'

/**
 * The PDF preview is an <iframe src="blob:..."> (components/ui/PdfPreview.tsx). The server's CSP allows `frame-src blob:` and
 * keeps `object-src 'none'`. A PDF in a frame is a plugin document, so the question these tests answer in a real Chromium is
 * whether the policy lets the browser's own PDF viewer show it.
 *
 * What a browser build can show differs: the suite runs in Chromium's new headless mode (playwright.config.ts, channel 'chromium'), which has the
 * real PDF viewer and therefore proves the document is DISPLAYED. Playwright's old headless shell has no PDF viewer at all, so it can only
 * prove that the policy reports no violation. Playwright's Firefox build cannot display embedded PDFs with or without a policy (checked:
 * the same "cannot be displayed here" page appears with the policy removed), so it is no evidence either way and is not used here.
 */

const USERNAME = 'e2e-pdf-preview'

interface Violation {
  directive: string
  blockedURI: string
}

/** Records every CSP violation and console message of the page, in the page and in its frames. */
async function recordViolations(page: Page) {
  const violations: Violation[] = []
  const messages: string[] = []
  page.on('console', (message) => messages.push(`${message.type()}: ${message.text()}`))
  await page.exposeFunction('__cspViolation', (entry: Violation) => violations.push(entry))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      void (window as unknown as { __cspViolation: (entry: Violation) => void }).__cspViolation({ directive: event.violatedDirective, blockedURI: event.blockedURI })
    })
  })
  return { violations, messages }
}

async function openPreview(browser: Browser) {
  const { context } = await signedInContext(browser, USERNAME)
  const page = await context.newPage()
  const record = await recordViolations(page)
  await apiOk(page, 'PUT', '/api/profile', { firstName: 'Erika', lastName: 'Musterfrau', professionalTitle: 'Beispielberufsbezeichnung', email: 'erika@example.com' })
  const rendered = page.waitForResponse((response) => response.url().endsWith('/api/profile/preview/pdf') && response.ok())
  await page.goto('/profile?tab=preview')
  await rendered
  await expect(page.getByTestId('pdf-preview-frame')).toBeVisible()
  return { context, page, ...record }
}

/** Playwright's old headless shell (no PDF viewer), started in the browser container. */
async function shellBrowser(): Promise<Browser | null> {
  const endpoint = process.env.PLAYWRIGHT_WS_ENDPOINT
  if (!endpoint) return null
  return chromium.connect(endpoint, { exposeNetwork: '<loopback>', headers: { 'x-playwright-launch-options': JSON.stringify({}) } })
}

test.describe('PDF preview under the content security policy', () => {
  test.beforeAll(async ({ browser }) => {
    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const page = await owner.newPage()
    await page.goto('/')
    await removeUsers(page, USERNAME)
    await createUser(page, USERNAME)
    await owner.close()
  })
  test.afterAll(async ({ browser }) => {
    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const page = await owner.newPage()
    await page.goto('/')
    await removeUsers(page, USERNAME)
    await owner.close()
  })

  test('the server sends exactly the policy the preview depends on', async ({ page }) => {
    const response = await page.goto('/login')
    const csp = response!.headers()['content-security-policy']!
    expect(csp).toContain('frame-src blob:')
    expect(csp).toContain("object-src 'none'")
  })

  test('the frame loads the blob without a single policy violation (headless shell: no viewer, only the policy is proven)', async () => {
    const browser = await shellBrowser()
    test.skip(browser === null, 'needs the browser container')
    try {
      const { context, violations, messages } = await openPreview(browser!)
      await expect.poll(() => violations, { message: 'CSP violations' }).toEqual([])
      expect(messages.filter((text) => /Content Security Policy|Refused to/i.test(text))).toEqual([])
      await context.close()
    } finally {
      await browser?.close()
    }
  })

  test('the browser shows the PDF in the frame: the viewer loads, no violation (Chromium with PDF viewer)', async ({ browser }) => {
    const { context, page, violations, messages } = await openPreview(browser)
    // The document in the frame is a PDF, and Chromium's own viewer (an extension frame) is loaded inside it
    await expect
      .poll(() => page.frames().some((frame) => /^chrome-extension:\/\/[a-z]+\/index\.html$/.test(frame.url())), { message: 'PDF viewer frame' })
      .toBe(true)
    const contentType = await page.getByTestId('pdf-preview-frame').evaluate((frame) => (frame as HTMLIFrameElement).contentDocument?.contentType)
    expect(contentType).toBe('application/pdf')
    expect(violations).toEqual([])
    expect(messages.filter((text) => /Content Security Policy|Refused to/i.test(text))).toEqual([])
    // And it is not the browser's "blocked" page: the frame has the size the preview box gives it
    const box = await page.getByTestId('pdf-preview-frame').boundingBox()
    expect(box!.width).toBeGreaterThan(400)
    expect(box!.height).toBeGreaterThan(400)
    await context.close()
  })
})
