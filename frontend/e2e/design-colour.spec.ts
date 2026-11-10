import { expect, test } from './fixtures'
import type { Member } from './fixtures'
import type { Locator, Page } from '@playwright/test'
import { scanTextContrast, waitForCalmPage } from './checks'
import { LANGUAGES } from './labels'
import { DEFAULT_DOCUMENT_COLOR, DOCUMENT_COLORS } from '../src/features/documents/palette'
import { apiOk, contrastBetween, expectNothingMoves, layoutSnapshot, MEMBER_PASSWORD, openAs, settledLayout, SIGNED_OUT } from './support'

// Design, font and colour of the documents, seen in the browser: the design gallery (profile, "Preview & export"), the choice of designs
// in the tracker, the font list, the own-colour picker (profile and cover letter), the cover letter's tab and list, the laid-over failures
// that must never cover the control that tries again, and the security page at 1920 px.
//
// The lists of designs and fonts are read from /api/bootstrap, never typed here: the server decides how many there are, in which order and
// (later) in which groups. Nothing below assumes a count, a number of columns or an order.

const DISPLAY_NAME = 'Erika Mustermann'
const open = (member: Member, path: string) => openAs(member.page, DISPLAY_NAME, path)

interface Bootstrap {
  documentDesigns: { id: string; group?: string }[]
  documentFonts: { family: string }[]
}
const bootstrapOf = (page: Page) => apiOk<Bootstrap>(page, 'GET', '/api/bootstrap')

/** The designs in the order the gallery, the tracker's list and the arrow keys show them: by group (in the order the groups first appear), inside a group in the server's order. */
async function designsOf(page: Page) {
  const groups = new Map<string, { id: string; group: string }[]>()
  for (const design of (await bootstrapOf(page)).documentDesigns) {
    const group = design.group ?? 'standard'
    groups.set(group, [...(groups.get(group) ?? []), { id: design.id, group }])
  }
  return { groups: [...groups.keys()], designs: [...groups.values()].flat() }
}

interface Options {
  design: string
  language: string
  accentColor: string
  font: string
  showPhoto: boolean
  photoShape: string
}
const baseOptions = async (member: Member): Promise<Options> => ({
  design: 'classic',
  language: 'de',
  accentColor: DEFAULT_DOCUMENT_COLOR,
  font: (await bootstrapOf(member.page)).documentFonts[0]!.family,
  showPhoto: true,
  photoShape: 'rounded',
})
/** Stores the remembered choice of "Preview & export" (what the page shows when it opens). */
async function storeOptions(member: Member, patch: Partial<Options>) {
  await apiOk(member.page, 'PUT', '/api/profile/preview-options', { ...(await baseOptions(member)), ...patch })
}
const storedOptions = async (member: Member) => (await apiOk<{ previewOptions: Options | null }>(member.page, 'GET', '/api/profile')).previewOptions

async function seedProfile(member: Member) {
  await apiOk(member.page, 'PUT', '/api/profile', { firstName: 'Erika', lastName: 'Mustermann', professionalTitle: 'Entwicklerin', email: 'erika@example.com' })
  await apiOk(member.page, 'POST', '/api/profile/experiences', { jobTitle: 'Entwicklerin', employer: 'Muster GmbH', startDate: '2019-04', isCurrent: true, sortOrder: 0 })
}

const gallery = (member: Member) => member.page.getByRole('radiogroup', { name: member.t('profile.preview.design'), exact: true })
const tiles = (member: Member) => gallery(member).getByRole('radio')
const toggle = (member: Member) => member.page.getByTestId('design-gallery-toggle')
const previewFrame = (page: Page) => page.getByTestId('pdf-preview-frame')

async function openGallery(member: Member) {
  await toggle(member).click()
  await expect(gallery(member)).toBeVisible()
}

/** The index of the design that is chosen in the open gallery. */
const checkedIndex = async (member: Member) => (await tiles(member).evaluateAll((all) => all.findIndex((tile) => tile.getAttribute('aria-checked') === 'true')))

/** Position and size of a box once it has stopped moving (entrance animations). */
async function settledBox(locator: Locator) {
  let last: string | undefined
  await expect.poll(async () => { const now = JSON.stringify(await locator.boundingBox()); const same = now === last; last = now; return same }, { message: 'the box stopped moving' }).toBe(true)
  return (await locator.boundingBox())!
}

/** The centre of the control is really the control (or part of it), not something laid over it. */
async function expectClickable(locator: Locator, what: string) {
  await expect(locator, `${what}: visible`).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  const covered = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return top === null || !element.contains(top) ? (top?.outerHTML.slice(0, 120) ?? 'nothing') : null
  })
  expect(covered, `${what}: nothing is laid over it`).toBeNull()
}

const THEMES = ['light', 'dark'] as const

/** Puts the page and every scrolling box on it (the gallery, the options card) back to the top: a choice brings its tile into view by scrolling, which is no movement. */
const scrollToTop = (page: Page) =>
  page.evaluate(() => {
    window.scrollTo(0, 0)
    for (const element of document.querySelectorAll('*')) if (element.scrollTop !== 0) element.scrollTop = 0
  })

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

// ---- the design gallery ----------------------------------------------------------------------------------------------------------

test.describe('design gallery', () => {
  test('it unfolds, shows every design the server offers with its picture, a click chooses, and the choice stays after a reload', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    const designs = (await designsOf(page)).designs
    expect(designs.length, 'the server offers designs').toBeGreaterThan(1)
    await open(member, '/profile?tab=preview')
    await expect(previewFrame(page)).toBeVisible()
    await expect(gallery(member), 'folded at first').toHaveCount(0)
    await expect(toggle(member)).toHaveAttribute('aria-expanded', 'false')

    await openGallery(member)
    await expect(toggle(member)).toHaveAttribute('aria-expanded', 'true')
    await expect(tiles(member)).toHaveCount(designs.length)
    // Every design is there, shows its real first page (the pictures load lazily: bring each into view) and is in the order of the list
    for (const [index, design] of designs.entries()) {
      const tile = tiles(member).nth(index)
      await tile.scrollIntoViewIfNeeded()
      await expect(tile).toBeVisible()
      await expect.poll(() => tile.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0), { message: `the picture of "${design.id}" loaded` }).toBe(true)
    }
    // Exactly one is chosen, and it is the only tab stop
    expect(await tiles(member).evaluateAll((all) => all.filter((tile) => tile.getAttribute('aria-checked') === 'true').length)).toBe(1)
    expect(await tiles(member).evaluateAll((all) => all.filter((tile) => tile.getAttribute('tabindex') === '0').length)).toBe(1)

    // A click on the last design: it is chosen, the server renders with it, and it is remembered
    const last = designs[designs.length - 1]!
    const rendered = page.waitForRequest((request) => request.url().endsWith('/api/profile/preview/pdf') && (request.postDataJSON() as { design?: string }).design === last.id)
    await tiles(member).last().scrollIntoViewIfNeeded()
    await tiles(member).last().click()
    await expect(tiles(member).last()).toHaveAttribute('aria-checked', 'true')
    await rendered
    await expect.poll(async () => (await storedOptions(member))?.design).toBe(last.id)

    await page.reload()
    await expect(page.getByTestId('current-user')).toContainText(DISPLAY_NAME)
    await expect(toggle(member)).toBeVisible()
    await expect(page.getByText(t(`profile.preview.designs.${last.id}`), { exact: true }).first()).toBeVisible()
    await openGallery(member)
    expect(await checkedIndex(member), 'the choice is still there after a reload').toBe(designs.length - 1)
    // Folding it again
    await toggle(member).click()
    await expect(gallery(member)).toHaveCount(0)
  })

  test('the arrow keys move the choice and the focus (wrapping at the ends), up and down go one row of the grid', async ({ member }) => {
    const { page } = member
    await seedProfile(member)
    const designs = (await designsOf(page)).designs
    await storeOptions(member, { design: designs[0]!.id })
    await open(member, '/profile?tab=preview')
    await openGallery(member)
    const focusedIndex = () => tiles(member).evaluateAll((all) => all.findIndex((tile) => tile === document.activeElement))

    await tiles(member).nth(0).focus()
    await page.keyboard.press('ArrowRight')
    expect(await checkedIndex(member)).toBe(1)
    expect(await focusedIndex(), 'the focus follows the choice').toBe(1)
    await page.keyboard.press('ArrowLeft')
    expect(await checkedIndex(member)).toBe(0)
    await page.keyboard.press('ArrowLeft')
    expect(await checkedIndex(member), 'wraps to the last').toBe(designs.length - 1)
    await page.keyboard.press('ArrowRight')
    expect(await checkedIndex(member), 'wraps to the first').toBe(0)

    // One row down and up again - how many tiles a row holds is the window's business
    const boxes = await tiles(member).evaluateAll((all) => all.map((tile) => ({ x: tile.getBoundingClientRect().x, y: tile.getBoundingClientRect().y })))
    const columns = boxes.filter((box) => Math.abs(box.y - boxes[0]!.y) < 2).length
    if (designs.length > columns) {
      await page.keyboard.press('ArrowDown')
      const down = await checkedIndex(member)
      expect(down, 'one row further').toBe(columns)
      expect(boxes[down]!.y, 'the chosen tile lies below').toBeGreaterThan(boxes[0]!.y)
      await page.keyboard.press('ArrowUp')
      expect(await checkedIndex(member)).toBe(0)
    }
    // The choice reached the server
    await expect.poll(async () => (await storedOptions(member))?.design, { timeout: 15_000 }).toBe(designs[0]!.id)
  })

  test('the designs stored in older versions (classic, modern, plain) are shown as chosen', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    const designs = (await designsOf(page)).designs
    for (const id of ['classic', 'modern', 'plain']) {
      const index = designs.findIndex((design) => design.id === id)
      expect(index, `"${id}" is still on offer`).toBeGreaterThanOrEqual(0)
      await storeOptions(member, { design: id })
      await open(member, '/profile?tab=preview')
      await expect(previewFrame(page)).toBeVisible()
      await expect(page.getByText(t(`profile.preview.designs.${id}`), { exact: true }).first()).toBeVisible()
      await openGallery(member)
      expect(await checkedIndex(member), `"${id}" is the chosen one`).toBe(index)
    }
  })

  // The window sizes that matter: 1024 px (narrowest; the options lie above the preview) and 1600 px (from 1536 px on a fixed 19 rem
  // column left of the preview). Every language, because German is longer.
  for (const size of [{ width: 1024, height: 768 }, { width: 1536, height: 864 }, { width: 1600, height: 900 }]) {
    for (const language of LANGUAGES) {
      test.describe(`${size.width} px, ${language}`, () => {
        test.use({ viewport: size, language })

        test('opening and choosing moves nothing around it, the tiles stay inside the card, the preview keeps its place', async ({ member }) => {
          const { page, t } = member
          await seedProfile(member)
          const designs = (await designsOf(page)).designs
          await open(member, '/profile?tab=preview')
          await expect(previewFrame(page)).toBeVisible()
          const sideBySide = size.width >= 1536
          const options = page.getByRole('region', { name: t('profile.preview.options') })
          const frameBefore = await settledBox(previewFrame(page))
          if (sideBySide) expect((await options.boundingBox())!.width, 'the options are a fixed 19 rem column').toBeCloseTo(19 * 16, 0)

          await openGallery(member)
          const afterOpen = await settledBox(previewFrame(page))
          if (sideBySide) expect(afterOpen, 'the preview keeps its place when the gallery unfolds').toEqual(frameBefore)
          const card = (await options.boundingBox())!
          for (const [index, design] of designs.entries()) {
            const tile = tiles(member).nth(index)
            await tile.scrollIntoViewIfNeeded()
            const box = (await tile.boundingBox())!
            expect(box.x, `${design.id}: inside the card (left)`).toBeGreaterThanOrEqual(card.x)
            expect(box.x + box.width, `${design.id}: inside the card (right)`).toBeLessThanOrEqual(card.x + card.width + 0.5)
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal scrollbar').toBe(true)
          if (!sideBySide) expect((await gallery(member).boundingBox())!.height, 'the gallery scrolls inside itself beyond 31 rem').toBeLessThanOrEqual(31 * 16 + 1)
          await tiles(member).first().scrollIntoViewIfNeeded()
          await expect(options).toBeVisible()

          // Choosing every design (names and sentences differ in length) moves nothing: not the bar, the tiles or the controls below
          await scrollToTop(page)
          const before = await settledLayout(page)
          for (const [index, design] of designs.entries()) {
            await expectNothingMoves(
              page,
              `"${design.id}" chosen`,
              async () => {
                await tiles(member).nth(index).click()
                await expect(tiles(member).nth(index)).toHaveAttribute('aria-checked', 'true')
                await scrollToTop(page)
              },
              before,
            )
          }
          if (sideBySide) expect(await settledBox(previewFrame(page)), 'the preview keeps its place while designs are chosen').toEqual(frameBefore)
        })
      })
    }
  }

  for (const theme of THEMES) {
    test(`every text of the folded and the unfolded gallery is readable (${theme} theme)`, async ({ member }) => {
      const { page } = member
      await page.emulateMedia({ colorScheme: theme })
      await seedProfile(member)
      await open(member, '/profile?tab=preview')
      await expect(previewFrame(page)).toBeVisible()
      await expectReadable(member, theme, 'preview options, gallery folded')
      await openGallery(member)
      await tiles(member).last().scrollIntoViewIfNeeded()
      await tiles(member).first().scrollIntoViewIfNeeded()
      await expectReadable(member, theme, 'preview options, gallery unfolded')
    })
  }
})

// ---- the groups of designs --------------------------------------------------------------------------------------------------------

test.describe('design groups', () => {
  test('every group has its heading in the gallery, in order, above its own tiles; the expressive group says what it is for', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    const { groups, designs } = await designsOf(page)
    expect(groups.length, 'the server names more than one group').toBeGreaterThan(1)
    await open(member, '/profile?tab=preview')
    await openGallery(member)
    // The document order of headings and tiles is the order on the page: heading, its tiles, next heading, ...
    const sequence = await gallery(member).evaluate((root) =>
      [...root.querySelectorAll('p.uppercase, [role="radio"]')].map((element) => ({
        kind: element.getAttribute('role') === 'radio' ? 'tile' : 'heading',
        text: element.getAttribute('aria-label') ?? element.textContent ?? '',
        top: element.getBoundingClientRect().top,
      })),
    )
    const expected: string[] = []
    for (const group of groups) {
      expected.push('heading:' + t(`profile.preview.designGroups.${group}`).toLowerCase())
      for (let count = designs.filter((candidate) => candidate.group === group).length; count > 0; count--) expected.push('tile')
    }
    expect(sequence.map((entry) => (entry.kind === 'heading' ? 'heading:' + entry.text.toLowerCase() : 'tile'))).toEqual(expected)
    // Each heading lies above the tiles of its group and below the tiles of the group before
    let lastTileTop = -Infinity
    for (const [index, entry] of sequence.entries()) {
      if (entry.kind === 'heading') expect(entry.top, "heading " + entry.text + " below the tiles before it").toBeGreaterThan(lastTileTop)
      else {
        const heading = [...sequence.slice(0, index)].reverse().find((candidate) => candidate.kind === 'heading')!
        expect(entry.top, "tile " + entry.text + " below its heading").toBeGreaterThan(heading.top)
        lastTileTop = entry.top
      }
    }
    if (groups.includes('expressive')) await expect(gallery(member).getByText(t('profile.preview.designGroups.expressiveHint'))).toBeVisible()
    // The tiles count per group is what the server says
    for (const group of groups) {
      const ids = designs.filter((design) => design.group === group)
      expect(ids.length, "group " + group + " has designs").toBeGreaterThan(0)
    }
  })

  for (const theme of THEMES) {
    test("the group headings and the hint are readable (" + theme + " theme)", async ({ member }) => {
      const { page, t } = member
      await page.emulateMedia({ colorScheme: theme })
      await seedProfile(member)
      const { groups } = await designsOf(page)
      await open(member, '/profile?tab=preview')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await openGallery(member)
      await waitForCalmPage(page)
      const texts = [...groups.map((group) => t("profile.preview.designGroups." + group)), ...(groups.includes('expressive') ? [t('profile.preview.designGroups.expressiveHint')] : [])]
      for (const text of texts) {
        const element = gallery(member).getByText(text, { exact: true })
        await element.scrollIntoViewIfNeeded()
        const { color, background } = await element.evaluate((node) => {
          let backdrop = 'rgb(255, 255, 255)'
          for (let current: Element | null = node; current; current = current.parentElement) {
            const value = getComputedStyle(current).backgroundColor
            if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') { backdrop = value; break }
          }
          return { color: getComputedStyle(node).color, background: backdrop }
        })
        const ratio = await contrastBetween(page, color, background)
        test.info().annotations.push({ type: theme + ' "' + text.slice(0, 30) + '"', description: color + " on " + background + " = " + ratio.toFixed(2) + ":1" })
        expect(ratio, theme + ': "' + text.slice(0, 40) + '" ' + color + " on " + background).toBeGreaterThanOrEqual(4.5)
      }
      await expectReadable(member, theme, 'gallery with groups')
    })
  }

  test('every design renders, in German and in English, through the API and by a click in the gallery', async ({ member }) => {
    const { page } = member
    test.setTimeout(300_000)
    await seedProfile(member)
    const { designs } = await designsOf(page)
    for (const language of ['de', 'en']) {
      for (const design of designs) {
        const response = await page.request.fetch('/api/profile/preview/pdf', { method: 'POST', headers: { 'X-Cv-Request': '1' }, data: { ...(await baseOptions(member)), design: design.id, language } })
        expect(response.status(), design.id + " (" + language + ") renders").toBe(200)
        expect((await response.body()).subarray(0, 5).toString('latin1'), design.id + " is a PDF").toBe('%PDF-')
      }
    }
    await open(member, '/profile?tab=preview')
    await openGallery(member)
    for (const [index, design] of designs.entries()) {
      if ((await checkedIndex(member)) === index) continue
      const answer = page.waitForResponse((candidate) => candidate.url().endsWith('/api/profile/preview/pdf') && (candidate.request().postDataJSON() as { design?: string }).design === design.id)
      await tiles(member).nth(index).click()
      expect((await answer).status(), design.id + " renders in the preview").toBe(200)
      await expect(previewFrame(page)).toBeVisible()
    }
  })
})

// ---- the tracker ------------------------------------------------------------------------------------------------------------------

test.describe('designs in the tracker', () => {
  test('the choice offers every design of the server; a design stored by an older version (classic, modern, plain) is shown; a new choice is saved', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    const designs = (await designsOf(page)).designs
    const created: Record<string, string> = {}
    for (const id of ['classic', 'modern', 'plain']) {
      created[id] = (await apiOk<{ id: string }>(page, 'POST', '/api/applications', { jobTitle: `Stelle ${id}`, company: `Firma ${id}`, status: 'draft', cvDesign: id })).id
    }
    await open(member, '/applications')
    for (const id of ['classic', 'modern', 'plain']) {
      await page.getByRole('button', { name: `Stelle ${id}` }).first().click()
      const details = page.getByRole('dialog', { name: `Stelle ${id} – Firma ${id}` })
      await details.getByRole('button', { name: t('applications.actions.edit') }).click()
      const form = page.getByRole('dialog', { name: t('applications.editTitle') })
      const select = form.getByLabel(t('applications.fields.cvDesign'), { exact: true })
      expect(await select.locator('option').evaluateAll((all) => all.map((option) => (option as HTMLOptionElement).value)), 'the options are the server\'s list, in its order').toEqual(designs.map((design) => design.id))
      const { groups, designs: shown } = await designsOf(page)
      const optgroups = await select.locator('optgroup').evaluateAll((all) => all.map((group) => ({ label: (group as HTMLOptGroupElement).label, ids: [...group.querySelectorAll('option')].map((option) => option.value) })))
      expect(optgroups.map((group) => group.label), 'one labelled group per group of the server, in order').toEqual(groups.map((group) => t(`profile.preview.designGroups.${group}`)))
      expect(optgroups.map((group) => group.ids), 'each group holds its own designs').toEqual(groups.map((group) => shown.filter((design) => design.group === group).map((design) => design.id)))
      await expect(select, `"${id}" is shown as chosen`).toHaveValue(id)
      if (id === 'plain') {
        const other = designs.find((design) => design.id !== 'plain')!.id
        await select.selectOption(other)
        await form.getByRole('button', { name: t('applications.actions.save') }).click()
        await expect.poll(async () => (await apiOk<{ cvDesign: string }>(page, 'GET', `/api/applications/${created[id]}`)).cvDesign).toBe(other)
      } else {
        await page.keyboard.press('Escape')
        await expect(form).toBeHidden()
        await page.keyboard.press('Escape')
        await expect(details).toBeHidden()
      }
    }
  })
})

// ---- fonts -----------------------------------------------------------------------------------------------------------------------

test.describe('fonts', () => {
  test('the CV preview offers every font of the server; each one is rendered (the preview loads)', async ({ member }) => {
    const { page, t } = member
    test.setTimeout(240_000)
    await seedProfile(member)
    const fonts = (await bootstrapOf(page)).documentFonts
    expect(fonts.length, 'the server offers fonts').toBeGreaterThan(1)
    await open(member, '/profile?tab=preview')
    await expect(previewFrame(page)).toBeVisible()
    const select = page.getByLabel(t('profile.preview.font'), { exact: true })
    expect(await select.locator('option').evaluateAll((all) => all.map((option) => (option as HTMLOptionElement).value))).toEqual(fonts.map((font) => font.family))
    for (const font of fonts.slice(1)) {
      const answer = page.waitForResponse((response) => response.url().endsWith('/api/profile/preview/pdf') && (response.request().postDataJSON() as { font?: string }).font === font.family)
      await select.selectOption(font.family)
      const response = await answer
      expect(response.status(), `"${font.family}" renders`).toBe(200)
      expect(response.headers()['content-type']).toContain('pdf')
      await expect(previewFrame(page)).toBeVisible()
    }
    await expect.poll(async () => (await storedOptions(member))?.font, { timeout: 15_000 }).toBe(fonts[fonts.length - 1]!.family)
  })

  test('a cover letter takes a font: it is saved with the letter and the preview renders with it', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    const fonts = (await bootstrapOf(page)).documentFonts
    const created = await apiOk<{ id: string }>(page, 'POST', '/api/cover-letters', { title: 'Schrift', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text' })
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Schrift' }).first().click()
    const select = page.getByLabel(t('coverLetters.fields.font'), { exact: true })
    await expect.poll(() => select.locator('option').evaluateAll((all) => all.map((option) => (option as HTMLOptionElement).value))).toEqual(fonts.map((font) => font.family))
    const chosen = fonts[fonts.length - 1]!.family
    await select.selectOption(chosen)
    await expect.poll(async () => (await apiOk<{ font: string }>(page, 'GET', `/api/cover-letters/${created.id}`)).font).toBe(chosen)
    const answer = page.waitForResponse((response) => response.url().includes('/preview/pdf'))
    await page.getByRole('tab', { name: t('coverLetters.tabs.preview') }).click()
    expect((await answer).status()).toBe(200)
    await expect(previewFrame(page)).toBeVisible()
  })
})

// ---- the own colour ---------------------------------------------------------------------------------------------------------------

const trigger = (member: Member) => member.page.getByRole('button', { name: new RegExp('^' + member.t('colorPicker.custom')) })
const popover = (member: Member) => member.page.getByRole('dialog', { name: member.t('colorPicker.dialog'), exact: true })
const hexField = (member: Member) => popover(member).getByLabel(member.t('colorPicker.hex'), { exact: true })
const areaOf = (member: Member) => popover(member).getByRole('slider', { name: member.t('colorPicker.area'), exact: true })
const hueOf = (member: Member) => popover(member).getByRole('slider', { name: member.t('colorPicker.hue'), exact: true })
const swatch = (member: Member, hex: string) => member.page.getByRole('radio', { name: new RegExp('\\(' + hex + '\\)$', 'i') })
/** The first sentence of the "too light" hint, whatever ratio it names. */
const tooLightHint = (member: Member) => member.t('colorPicker.tooLight', { ratio: '@@', min: '@@' }).split('(')[0]!.trim()

test.describe('own colour on the profile preview', () => {
  test('opening moves nothing; the colour field takes mouse drags; the hue slider and the hex field work; the choice is saved', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    await open(member, '/profile?tab=preview')
    await expect(previewFrame(page)).toBeVisible()
    await trigger(member).scrollIntoViewIfNeeded()

    // Opening floats over the page: everything that was there stays where it was
    const before = await settledLayout(page)
    await trigger(member).click()
    await expect(popover(member)).toBeVisible()
    const after = await settledLayout(page)
    for (const [key, value] of Object.entries(before)) expect(after[key], `${key} after the popover opened`).toBe(value)

    // A drag over the colour field: past the top left corner is white, past the bottom right black (the position is clamped)
    const area = (await settledBox(areaOf(member)))
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
    await page.mouse.down()
    await page.mouse.move(area.x - 40, area.y - 40, { steps: 6 })
    await expect(hexField(member)).toHaveValue('#FFFFFF')
    await page.mouse.move(area.x + area.width + 40, area.y + area.height + 40, { steps: 6 })
    await expect(hexField(member)).toHaveValue('#000000')
    // The top right corner: the pure hue; the hue slider then walks along the rainbow
    await page.mouse.move(area.x + area.width + 40, area.y - 40, { steps: 6 })
    await page.mouse.up()
    await hueOf(member).focus()
    await page.keyboard.press('Home')
    await expect(hueOf(member)).toHaveAttribute('aria-valuenow', '0')
    await expect(hexField(member)).toHaveValue('#FF0000')
    for (let step = 0; step < 6; step++) await page.keyboard.press('Shift+ArrowRight')
    await expect(hueOf(member)).toHaveAttribute('aria-valuenow', '60')
    await expect(hexField(member)).toHaveValue('#FFFF00')
    // A mouse drag on the hue slider
    const hue = await settledBox(hueOf(member))
    await page.mouse.move(hue.x + 1, hue.y + hue.height / 2)
    await page.mouse.down()
    await page.mouse.move(hue.x + hue.width / 3, hue.y + hue.height / 2, { steps: 4 })
    await page.mouse.up()
    expect(Number(await hueOf(member).getAttribute('aria-valuenow')), 'a third along the slider is about 120 degrees').toBeGreaterThan(100)
    // Arrow keys in the colour field change saturation / brightness
    await areaOf(member).focus()
    const saturation = Number(await areaOf(member).getAttribute('aria-valuenow'))
    await page.keyboard.press('ArrowLeft')
    expect(Number(await areaOf(member).getAttribute('aria-valuenow'))).toBe(saturation - 1)

    // The hex field: a problem shows while typing, before any blur; six digits count at once; three only when the field is left
    await hexField(member).fill('')
    await expect(popover(member).getByText(t('rules.color.required'))).toBeVisible()
    await hexField(member).pressSequentially('zz')
    await expect(popover(member).getByText(t('rules.color.characters'))).toBeVisible()
    await hexField(member).fill('#1A2B3C')
    await expect.poll(async () => (await storedOptions(member))?.accentColor?.toUpperCase(), { timeout: 15_000 }).toBe('#1A2B3C')
    await hexField(member).fill('#abc')
    await expect(page.getByRole('button', { name: t('colorPicker.custom') + ' #1A2B3C' }), 'a short form is not applied while it may still grow').toBeVisible()
    await hexField(member).press('Enter')
    await expect(hexField(member)).toHaveValue('#AABBCC')
    await expect.poll(async () => (await storedOptions(member))?.accentColor?.toUpperCase(), { timeout: 15_000 }).toBe('#AABBCC')
    // The preview was asked for exactly this colour
    await expect(trigger(member)).toHaveAccessibleName(t('colorPicker.customChosen', { hex: '#AABBCC' }))
  })

  test('hints: a colour that is too light and one with transparency say so in their reserved room (nothing moves); the trigger warns too', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    await open(member, '/profile?tab=preview')
    await trigger(member).scrollIntoViewIfNeeded()
    await trigger(member).click()
    await expect(popover(member)).toBeVisible()
    const box = await settledBox(popover(member))
    const withoutColourButton = async () => Object.fromEntries(Object.entries(await settledLayout(page)).filter(([key]) => !key.includes(t('colorPicker.custom'))))
    const before = await withoutColourButton()

    await hexField(member).fill('#FFFF00')
    await expect(popover(member).getByText(tooLightHint(member))).toBeVisible()
    await expect(trigger(member)).toHaveAttribute('title', t('colorPicker.tooLightShort'))
    expect(await settledBox(popover(member)), 'the popover keeps its size when the hint appears').toEqual(box)
    expect(await withoutColourButton(), 'the page keeps its layout when the hint appears').toEqual(before)

    await hexField(member).fill('#14213D80')
    await expect(popover(member).getByText(t('colorPicker.transparent'))).toBeVisible()
    expect(await settledBox(popover(member)), 'the popover keeps its size when the other hint appears').toEqual(box)

    await hexField(member).fill('#14213D')
    await expect(popover(member).getByText(t('colorPicker.transparent'))).toHaveCount(0)
    await expect(popover(member).getByText(tooLightHint(member))).toHaveCount(0)
  })

  test('opening moves the focus into the popover (so Esc and the arrow keys work at once)', async ({ member }) => {
    await seedProfile(member)
    await open(member, '/profile?tab=preview')
    await trigger(member).scrollIntoViewIfNeeded()
    await trigger(member).click()
    await expect(popover(member)).toBeVisible()
    await expect(areaOf(member), 'the colour field has the focus').toBeFocused()
    await member.page.keyboard.press('Escape')
    await expect(popover(member), 'Esc closes it').toBeHidden()
    await expect(trigger(member)).toBeFocused()
  })

  test('keyboard: Tab stays inside, Esc closes and gives the focus back (also from the hex field); a click beside closes without taking the focus', async ({ member }) => {
    const { page } = member
    await seedProfile(member)
    await open(member, '/profile?tab=preview')
    await trigger(member).scrollIntoViewIfNeeded()
    await trigger(member).click()
    await areaOf(member).focus()

    await page.keyboard.press('Tab')
    await expect(hueOf(member)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(hexField(member)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(areaOf(member), 'Tab wraps around inside the popover').toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(hexField(member), 'Shift+Tab wraps backwards').toBeFocused()

    await page.keyboard.press('Escape')
    await expect(popover(member)).toBeHidden()
    await expect(trigger(member), 'the focus is back on the button').toBeFocused()

    await page.keyboard.press('Enter')
    await expect(popover(member)).toBeVisible()
    await hexField(member).focus()
    await page.keyboard.press('Escape')
    await expect(popover(member)).toBeHidden()
    await expect(trigger(member)).toBeFocused()

    // A click beside it closes it; the focus is not pulled to the button
    await trigger(member).click()
    await expect(popover(member)).toBeVisible()
    await page.getByRole('heading', { level: 1 }).click()
    await expect(popover(member)).toBeHidden()
    await expect(trigger(member)).not.toBeFocused()
    // The button toggles
    await trigger(member).click()
    await expect(popover(member)).toBeVisible()
    await trigger(member).click()
    await expect(popover(member)).toBeHidden()
  })

  test('a colour stored by another program is shown as the own colour after a reload; one of the eight swatches switches it off again', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    await storeOptions(member, { accentColor: '#123456' })
    await open(member, '/profile?tab=preview')
    await expect(previewFrame(page)).toBeVisible()
    await expect(trigger(member)).toHaveAccessibleName(t('colorPicker.customChosen', { hex: '#123456' }))
    await expect(page.getByRole('radiogroup', { name: t('profile.preview.color') }).getByRole('radio', { checked: true }), 'none of the eight is chosen').toHaveCount(0)
    await trigger(member).click()
    await expect(hexField(member)).toHaveValue('#123456')
    await page.keyboard.press('Escape')

    const second = DOCUMENT_COLORS[1]!.hex
    await swatch(member, second).click()
    await expect(swatch(member, second)).toHaveAttribute('aria-checked', 'true')
    await expect(trigger(member)).toHaveAccessibleName(t('colorPicker.custom'))
    await expect.poll(async () => (await storedOptions(member))?.accentColor?.toUpperCase()).toBe(second.toUpperCase())
    await page.reload()
    await expect(swatch(member, second)).toHaveAttribute('aria-checked', 'true')
  })

  test.describe('narrowest window', () => {
    test.use({ viewport: { width: 1024, height: 700 } })
    test('the popover stays inside the window, whether the button is high or low on the page', async ({ member }) => {
      const { page } = member
      await seedProfile(member)
      await open(member, '/profile?tab=preview')
      for (const where of ['top', 'bottom'] as const) {
        await page.evaluate((position) => window.scrollTo(0, position === 'top' ? 0 : document.documentElement.scrollHeight), where)
        await trigger(member).scrollIntoViewIfNeeded()
        await trigger(member).click()
        await expect(popover(member)).toBeVisible()
        const box = await settledBox(popover(member))
        const view = page.viewportSize()!
        expect(box.x, `${where}: left edge`).toBeGreaterThanOrEqual(0)
        expect(box.y, `${where}: top edge`).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width, `${where}: right edge`).toBeLessThanOrEqual(view.width)
        expect(box.y + box.height, `${where}: bottom edge`).toBeLessThanOrEqual(view.height)
        await trigger(member).click()
        await expect(popover(member)).toBeHidden()
      }
    })
  })

  for (const theme of THEMES) {
    test(`the texts of the popover (with both hints and an error) and of the own-colour button are readable (${theme} theme)`, async ({ member }) => {
      const { page } = member
      await page.emulateMedia({ colorScheme: theme })
      await seedProfile(member)
      await open(member, '/profile?tab=preview')
      await expect(previewFrame(page)).toBeVisible()
      await trigger(member).scrollIntoViewIfNeeded()
      await trigger(member).click()
      await expect(popover(member)).toBeVisible()
      await expectReadable(member, theme, 'own-colour popover')
      await hexField(member).fill('#FFFF00')
      await expect(popover(member).getByText(tooLightHint(member))).toBeVisible()
      await expectReadable(member, theme, 'own-colour popover, too light (the button is yellow)')
      await hexField(member).fill('#14213D80')
      await expect(popover(member).getByText(member.t('colorPicker.transparent'))).toBeVisible()
      await expectReadable(member, theme, 'own-colour popover, transparency')
      await hexField(member).fill('')
      await expect(popover(member).getByText(member.t('rules.color.required'))).toBeVisible()
      await expectReadable(member, theme, 'own-colour popover, error')
      await hexField(member).fill('#123456')
      await page.keyboard.press('Escape')
      await expectReadable(member, theme, 'own-colour button, dark colour')
    })
  }
})

test.describe('own colour on the cover letter', () => {
  const openLetter = async (member: Member, accentColor?: string) => {
    const { page } = member
    const created = await apiOk<{ id: string }>(page, 'POST', '/api/cover-letters', {
      title: 'Farbe', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text', ...(accentColor ? { accentColor } : {}),
    })
    await open(member, '/cover-letters')
    await page.getByRole('button', { name: 'Farbe' }).first().click()
    await expect(trigger(member)).toBeVisible()
    return created.id
  }
  const colourOf = async (member: Member, id: string) => (await apiOk<{ accentColor: string | null }>(member.page, 'GET', `/api/cover-letters/${id}`)).accentColor?.toUpperCase()

  test('a colour typed into the picker is saved with the letter; a stored foreign colour is the own colour after a reload', async ({ member }) => {
    const { page, t } = member
    const id = await openLetter(member)
    await trigger(member).scrollIntoViewIfNeeded()
    await trigger(member).click()
    await expect(popover(member)).toBeVisible()
    await hexField(member).fill('#336699')
    await expect.poll(() => colourOf(member, id), { timeout: 15_000 }).toBe('#336699')
    await expect(trigger(member)).toHaveAccessibleName(t('colorPicker.customChosen', { hex: '#336699' }))
    await page.keyboard.press('Escape')
    await expect(trigger(member)).toBeFocused()

    await page.reload()
    await page.getByRole('button', { name: 'Farbe' }).first().click()
    await expect(trigger(member)).toHaveAccessibleName(t('colorPicker.customChosen', { hex: '#336699' }))
    await expect(page.getByRole('radiogroup', { name: t('coverLetters.fields.accentColor') }).getByRole('radio', { checked: true })).toHaveCount(0)
  })

  test('opening the picker moves nothing', async ({ member }) => {
    const { page } = member
    await openLetter(member, '#AA5500')
    await trigger(member).scrollIntoViewIfNeeded()
    const before = await settledLayout(page)
    await trigger(member).click()
    await expect(popover(member)).toBeVisible()
    const after = await settledLayout(page)
    for (const [key, value] of Object.entries(before)) expect(after[key], `${key} after the popover opened`).toBe(value)
  })

  test.describe('narrowest window', () => {
    test.use({ viewport: { width: 1024, height: 700 } })
    test('the popover stays inside the window', async ({ member }) => {
      const { page } = member
      await openLetter(member)
      await trigger(member).scrollIntoViewIfNeeded()
      await trigger(member).click()
      await expect(popover(member)).toBeVisible()
      const box = await settledBox(popover(member))
      const view = page.viewportSize()!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(view.width)
      expect(box.y + box.height).toBeLessThanOrEqual(view.height)
    })
  })

  for (const theme of THEMES) {
    test(`the popover texts on the cover letter page are readable (${theme} theme)`, async ({ member }) => {
      await member.page.emulateMedia({ colorScheme: theme })
      await openLetter(member, '#FFFF00')
      await trigger(member).scrollIntoViewIfNeeded()
      await trigger(member).click()
      await expect(popover(member)).toBeVisible()
      await expectReadable(member, theme, 'cover letter with the own-colour popover (yellow)', 5)
    })
  }
})

// ---- the cover letter's tab and list ----------------------------------------------------------------------------------------------

test.describe('cover letters: tab and list', () => {
  for (const [language, content] of [['de', 'Inhalt'], ['en', 'Content']] as const) {
    test.describe(language, () => {
      test.use({ language })
      test(`the first tab is called "${content}"; the list shows no "DIN 5008" badge`, async ({ member }) => {
        const { page } = member
        await apiOk(page, 'POST', '/api/cover-letters', { title: 'Liste', recipientCompany: 'Musterfirma', recipientCity: 'Musterstadt', subject: 'Betreff', salutation: 'Guten Tag', body: 'Text' })
        await open(member, '/cover-letters')
        await expect(page.getByRole('button', { name: 'Liste' }).first()).toBeVisible()
        await expect(page.locator('.badge', { hasText: /DIN/ }), 'no badge with "DIN" in the list').toHaveCount(0)
        for (const item of await page.getByRole('listitem').all()) expect(await item.innerText()).not.toMatch(/DIN\s*5008/)
        await page.getByRole('button', { name: 'Liste' }).first().click()
        const tabs = page.getByRole('tab')
        await expect(tabs.first()).toHaveText(content)
        await expect(page.getByRole('tab', { name: content, exact: true })).toHaveAttribute('aria-selected', 'true')
      })
    })
  }
})

// ---- failures laid over the content never cover the control that tries again ----------------------------------------------------------

test.describe('laid-over failures leave the retry control free', () => {
  const rare = { status: 500, contentType: 'application/json', body: JSON.stringify({ status: 500, code: 'internal', detail: 'Ein technischer Fehler, der in voller Länge lesbar bleibt.', traceId: 'e2e-trace' }) }

  test('JSON Resume: after a failed import the import button is free and a second try works', async ({ member }) => {
    const { page, t } = member
    await open(member, '/profile')
    await page.getByRole('button', { name: t('profile.jsonResume.button') }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('radio', { name: t('profile.jsonResume.importMode') }).click()
    await dialog.getByLabel(t('profile.jsonResume.pasteLabel'), { exact: true }).fill(JSON.stringify({ basics: { name: 'Max Muster', email: 'max@example.com' } }))
    await page.route('**/api/profile/json-resume/import*', (route) => route.fulfill(rare), { times: 1 })
    const button = dialog.getByRole('button', { name: t('profile.jsonResume.importButton') })
    await button.click()
    // Trouble that is no answer of the normal flow opens the error dialog (complete, with its Copy button) instead of covering the dialog
    const failure = page.getByRole('alertdialog').filter({ has: page.getByTestId('error-dialog') })
    await expect(failure).toBeVisible()
    await expect(failure.getByTestId('error-dialog')).toContainText('Ein technischer Fehler, der in voller Länge lesbar bleibt.')
    await expect(failure.getByTestId('copy-button')).toBeVisible()
    await expect(page.getByTestId('alert-overlay'), 'nothing is laid over the import dialog').toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(failure).toBeHidden()
    await expectClickable(button, 'the import button after the failure')
    await button.click()
    await expect(dialog.getByText(t('profile.jsonResume.importSuccess'))).toBeVisible()
  })

  test('AI settings: after a failed connection test the test button and the save button are free', async ({ member }) => {
    const { page, t } = member
    await open(member, '/')
    await page.getByRole('button', { name: t('nav.aiSettings') }).click()
    const dialog = page.getByRole('dialog', { name: t('ai.settingsTitle') })
    await dialog.getByLabel(t('ai.provider'), { exact: true }).selectOption({ label: t('ai.providers.openai') })
    await dialog.getByLabel(t('ai.model'), { exact: true }).fill('gpt-test')
    await dialog.getByLabel(t('ai.apiKey'), { exact: true }).fill('sk-test-0123456789abcdef')
    await page.route('**/api/ai/test-connection', (route) => route.fulfill(rare), { times: 1 })
    const test = dialog.getByRole('button', { name: t('ai.testConnection') })
    await test.click()
    await expect(page.getByTestId('alert-overlay')).toBeVisible()
    await expectClickable(test, 'the test button under a laid-over failure')
    for (const button of await dialog.getByRole('button').all()) {
      if (await button.isDisabled()) continue
      await expectClickable(button, `the button "${(await button.innerText()).trim() || (await button.getAttribute('aria-label'))}" under a laid-over failure`)
    }
  })

  test('AI assistant: after a refused answer and after a technical failure the evaluate button is free', async ({ member }) => {
    const { page, t } = member
    await seedProfile(member)
    await open(member, '/profile')
    await page.getByRole('button', { name: t('ai.entry.summary') }).click()
    const dialog = page.getByRole('dialog', { name: t('ai.tasks.summary') })
    const paste = dialog.getByLabel(t('ai.assistant.pasteAnswer'), { exact: true })
    const evaluate = dialog.getByRole('button', { name: t('ai.assistant.parseAnswer') })

    await paste.fill('kein JSON')
    await evaluate.click()
    await expect(dialog.getByTestId('error-notice')).toBeVisible()
    await expectClickable(evaluate, 'the evaluate button under a refused answer')

    await page.route('**/api/ai/parse', (route) => route.fulfill(rare), { times: 1 })
    await paste.fill('{"shortSummary":"Kurz.","bulletPoints":["a"]}')
    await evaluate.click()
    await expect(page.getByTestId('alert-overlay')).toBeVisible()
    await expectClickable(evaluate, 'the evaluate button under a technical failure')

    await evaluate.click()
    await expect(dialog.getByText('Kurz.', { exact: true })).toBeVisible()
  })

  test('sign-in: "too many attempts" stays in the flow (no laid-over layer), moves nothing, and the button stays free', async ({ browser }) => {
    const context = await browser.newContext({ storageState: SIGNED_OUT, locale: 'de-DE', viewport: { width: 1024, height: 768 } })
    try {
      const page = await context.newPage()
      await page.route('**/api/auth/login', (route) =>
        route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '30' }, body: JSON.stringify({ status: 429, code: 'rate_limited', detail: 'Zu viele Versuche. Bitte in 30 Sekunden erneut versuchen.' }) }),
      )
      await page.goto('/login')
      await page.locator('input[name="username"]').fill('jemand')
      await page.locator('input[name="password"]').fill('irgendein langes passwort')
      const submit = page.locator('button[type="submit"]')
      await expect(submit).toBeVisible()
      const before = await settledLayout(page)
      await submit.click()
      await expect(page.getByTestId('error-notice')).toBeVisible()
      await expect(page.getByTestId('alert-overlay'), 'in the flow, not laid over').toHaveCount(0)
      expect(await settledLayout(page), 'the sign-in page keeps its layout').toEqual(before)
      await expectClickable(submit, 'the sign-in button under the message')
      // Layout including the page as it stands now equals the one with the message gone? The message has its room from the start.
      expect(Object.keys(await layoutSnapshot(page)).length).toBeGreaterThan(3)
    } finally {
      await context.close()
    }
  })
})

// ---- settings, security, wide window ------------------------------------------------------------------------------------------------

test.describe('security page with several sessions', () => {
  for (const size of [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
    test.describe(`${size.width} px`, () => {
      test.use({ viewport: size })
      test('no horizontal scrollbar' + (size.width === 1920 ? ', and the table of sessions needs no scrolling of its own' : ''), async ({ member, browser }) => {
        const { page } = member
        // More sessions of the same account (their rows carry an "end" button each)
        for (let i = 0; i < 3; i++) {
          const other = await browser.newContext()
          await other.request.post('/api/auth/login', { headers: { 'X-Cv-Request': '1' }, data: { username: member.username, password: MEMBER_PASSWORD } })
          await other.close()
        }
        await open(member, '/settings?tab=security')
        const table = page.getByTestId('sessions-table')
        await expect(table).toBeVisible()
        await expect(table.getByRole('button').first(), 'other sessions can be ended').toBeVisible()
        await page.waitForTimeout(250)
        const measures = await page.evaluate(() => {
          const wrapper = document.querySelector('[data-testid="sessions-table"]')!.parentElement!
          return { page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], wrapper: [wrapper.scrollWidth, wrapper.clientWidth] }
        })
        expect(measures.page[0], 'no horizontal scrollbar on the page').toBeLessThanOrEqual(measures.page[1]!)
        if (size.width === 1920) expect(measures.wrapper[0], 'the table fits its frame').toBeLessThanOrEqual(measures.wrapper[1]!)
      })
    })
  }
})
