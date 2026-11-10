// Playwright's fixture callback is called `use`; the React hooks rule mistakes it for a hook.
/* eslint-disable react-hooks/rules-of-hooks */
import { createHash } from 'node:crypto'
import { test as base } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { labelsFor } from './labels'
import type { Language } from './labels'
import { apiOk, createUser, MEMBER_PASSWORD, removeUsers, SIGNED_OUT } from './support'

export interface Member {
  username: string
  context: BrowserContext
  page: Page
  /** The text of a translation key in the language the page was started in. */
  t: ReturnType<typeof labelsFor>
  language: Language
}

interface Fixtures {
  /** The language the page starts in (German unless a describe block says otherwise). */
  language: Language
  /**
   * An account of its own for this test, signed in in a fresh browser window, with the page in `language`. Everything the test creates
   * belongs to this account, so tests never see each other's data; the account (and with it all its data) is removed afterwards.
   */
  member: Member
}

/** A short stable account name per test (the same title always gives the same name, so a leftover of a dead run is cleaned up next time). */
function usernameFor(title: string): string {
  return `e2e-${createHash('sha1').update(title).digest('hex').slice(0, 10)}`
}

export const test = base.extend<Fixtures>({
  language: ['de', { option: true }],
  member: async ({ browser, language, viewport }, use, testInfo) => {
    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const admin = await owner.newPage()
    await admin.goto('/')
    const username = usernameFor(testInfo.titlePath.join(' > '))
    await removeUsers(admin, username)
    await createUser(admin, username, { displayName: 'Erika Mustermann' })
    // The window has the size the describe block asked for (use({ viewport })), the narrowest supported one in the layout tests.
    const context = await browser.newContext({ storageState: SIGNED_OUT, locale: 'de-DE', viewport: viewport ?? { width: 1280, height: 800 } })
    await apiOk(context, 'POST', '/api/auth/login', { username, password: MEMBER_PASSWORD })
    const page = await context.newPage()
    await context.addInitScript((value) => localStorage.setItem('cv.language', value), language)
    await use({ username, context, page, t: labelsFor(language), language })
    await context.close()
    await removeUsers(admin, username)
    await owner.close()
  },
})

export { expect } from '@playwright/test'
