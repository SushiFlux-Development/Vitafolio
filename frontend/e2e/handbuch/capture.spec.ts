import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { expect, request as playwrightRequest, test } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Locator, Page } from '@playwright/test'
import { dateIn } from '../labels'
import { field, HELPER_SEEN, settledLayout, totp } from '../support'

/**
 * Screenshot capture for the user manuals (docs/handbuch/de/bilder and docs/handbuch/en/bilder).
 *
 * This is NOT part of the normal suite: playwright.config.ts only runs it when HANDBOOK_CAPTURE=1 (and then runs nothing else).
 *
 * How it is run: against a FRESH test server with the built UI, in the Playwright browser container - exactly what
 * scripts/e2e.ps1 sets up. The runner starts the server and the browser container, then calls Playwright; this file only needs
 *   HANDBOOK_CAPTURE=1            (environment of the Playwright call; set before calling the runner it is inherited)
 *   PLAYWRIGHT_BASE_URL           (set by the runner)
 *   PLAYWRIGHT_WS_ENDPOINT        (set by the runner, optional)
 *   E2E_SETUP_CODE                (optional: the one-time setup code of the fresh server, if the server asks for one)
 * The server should run with APP_CHANNEL=release, so the footer shows a release version and not "-dev".
 *
 * What it does: one serial run. 1. Photographs the setup page of the still empty server in both languages. 2. Creates made-up
 * demo data through the API (three accounts, backups, a backup schedule, some activity). 3. For German and then English: signs in
 * as the demo administrator, fills the profile, cover letter, attachments and applications with made-up content in the language of
 * the manual, photographs the read-only screens and dialogs (profile, cover letter, tracker, attachments, AI, updates, "What is
 * new", "About"), signs out again. 4. Last, the steps that change something (setting up two-factor sign-in for the administrator
 * and removing it again, a failed sign-in), so both languages see the same data.
 *
 * Two screens cannot show real data on a test server and get made-up answers instead: the update page (the test server has no
 * connection to the release list) and the notes of a version ("What is new", the test server's version has no entry). Both are
 * answered by the browser (route mocks) with invented versions; nothing is sent to or stored on the server.
 *
 * Output: element or clip screenshots at device scale 2, light theme, 1280 x 800 window; the same file names in both folders.
 * The German UI feeds the German manual, the English UI the English one. Only made-up people ("Mira Beispiel" ...) appear;
 * machine-specific text (the backup folder) is replaced in the page before it is photographed.
 */

type Lang = 'de' | 'en'
const LANGS: readonly Lang[] = ['de', 'en']

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5245'
const SETUP_CODE = process.env.E2E_SETUP_CODE
const HEADERS = { 'X-Cv-Request': '1' }
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_ROOT = resolve(HERE, '..', '..', '..', 'docs', 'handbuch')

interface Person {
  username: string
  displayName: string
  password: string
}

const MIRA: Person = { username: 'mira', displayName: 'Mira Beispiel', password: 'Ein langer Beispielsatz 2026' }
const JONAS: Person = { username: 'jonas', displayName: 'Jonas Muster', password: 'Noch ein Beispielsatz 2026' }
const LENA: Person = { username: 'lena', displayName: 'Lena Probe', password: 'Dritter Beispielsatz 2026' }

// Other devices of the demo administrator, so the list of signed-in devices has something to show.
const EDGE_ON_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'
const FIREFOX_ON_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'

test.describe.configure({ mode: 'serial' })
test.skip(process.env.HANDBOOK_CAPTURE !== '1', 'Manual screenshots are only taken with HANDBOOK_CAPTURE=1')

// ---- helpers ------------------------------------------------------------------------------------------------------------------

function outDir(lang: Lang): string {
  const dir = resolve(OUT_ROOT, lang, 'bilder')
  mkdirSync(dir, { recursive: true })
  return dir
}

async function apiContext(userAgent?: string): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: BASE_URL, extraHTTPHeaders: HEADERS, ...(userAgent ? { userAgent } : {}) })
}

async function signInApi(person: Person, userAgent?: string): Promise<APIRequestContext> {
  const api = await apiContext(userAgent)
  const response = await api.post('/api/auth/login', { data: { username: person.username, password: person.password } })
  expect(response.ok(), `sign-in of ${person.username} answered ${response.status()}`).toBe(true)
  return api
}

/** A browser window in the manual's language, light theme, scale 2; signed in when an API session is given. */
async function openWindow(browser: Browser, lang: Lang, api?: APIRequestContext): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: lang === 'de' ? 'de-DE' : 'en-GB',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    ...(api ? { storageState: await api.storageState() } : {}),
  })
  // The live helper counts as seen: no introduction and no hints in the screenshots (the manual shows the plain pages).
  await context.addInitScript(
    ([language, ...seen]) => {
      localStorage.setItem('cv.language', language as string)
      localStorage.setItem('cv.theme', 'light')
      for (const entry of seen as { name: string; value: string }[]) localStorage.setItem(entry.name, entry.value)
    },
    [lang, ...HELPER_SEEN] as const,
  )
  return { context, page: await context.newPage() }
}

/** Fonts loaded, entrance animations over, pointer out of the way. */
async function settle(page: Page): Promise<void> {
  await page.mouse.move(0, 0)
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await settledLayout(page)
}

/** Replaces text that belongs to this machine (the backup folder, the time zone name) by neutral demo text. */
async function scrub(page: Page): Promise<void> {
  await page.evaluate(() => {
    const set = (id: string, text: string) => {
      const element = document.querySelector(`[data-testid="${id}"]`)
      if (element) element.textContent = text
    }
    set('backup-directory', '/data/backups')
    set('backup-timezone', 'Europe/Berlin')
  })
}

/** A numbered badge with a frame around the part it explains (drawn over the page, nothing moves). */
async function mark(target: Locator, n: number, placement: 'corner' | 'above' = 'corner'): Promise<void> {
  await target.evaluate(
    (element, args) => {
      const box = element.getBoundingClientRect()
      const x = box.left + window.scrollX
      const y = box.top + window.scrollY
      const frame = document.createElement('div')
      frame.setAttribute('data-capture-mark', '')
      Object.assign(frame.style, {
        position: 'absolute',
        left: `${x - 3}px`,
        top: `${y - 3}px`,
        width: `${box.width + 6}px`,
        height: `${box.height + 6}px`,
        border: '2px solid #b8872a',
        borderRadius: '4px',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        zIndex: '99998',
      })
      const badge = document.createElement('div')
      badge.setAttribute('data-capture-mark', '')
      badge.textContent = String(args.n)
      Object.assign(badge.style, {
        position: 'absolute',
        left: `${args.above ? x + box.width / 2 - 11 : Math.max(x - 8, 2)}px`,
        top: `${args.above ? y - 28 : Math.max(y - 8, 2)}px`,
        width: '22px',
        height: '22px',
        borderRadius: '11px',
        background: '#14213d',
        color: '#f3eee2',
        border: '2px solid #d9ae57',
        boxSizing: 'border-box',
        font: '700 12px/18px Inter, sans-serif',
        textAlign: 'center',
        pointerEvents: 'none',
        zIndex: '99999',
      })
      document.body.append(frame, badge)
    },
    { n, above: placement === 'above' },
  )
}

async function clearMarks(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelectorAll('[data-capture-mark]').forEach((element) => element.remove()))
}

async function shot(target: Locator, lang: Lang, name: string): Promise<void> {
  await settle(target.page())
  await target.screenshot({ path: resolve(outDir(lang), `${name}.png`), animations: 'disabled', caret: 'hide' })
}

/** The whole window (only where the overall layout is the point). */
async function shotWindow(page: Page, lang: Lang, name: string): Promise<void> {
  await settle(page)
  await page.screenshot({ path: resolve(outDir(lang), `${name}.png`), animations: 'disabled', caret: 'hide' })
}

/** The top part of an element (a long table): its width, at most `maxHeight` pixels, in page coordinates. */
async function shotTop(target: Locator, lang: Lang, name: string, maxHeight: number): Promise<void> {
  const page = target.page()
  await settle(page)
  const box = await target.boundingBox()
  expect(box, `${name}: nothing to photograph`).not.toBeNull()
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
  await page.screenshot({
    path: resolve(outDir(lang), `${name}.png`),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    clip: { x: box!.x + scroll.x, y: box!.y + scroll.y, width: box!.width, height: Math.min(box!.height, maxHeight) },
  })
}

/** An input of a form inside a dialog (the shared `field` helper wants a whole page). */
const inputIn = (scope: Locator, name: string) => scope.locator(`input[name="${name}"]`)

const cards = (page: Page) => page.locator('[role="tabpanel"] section.card')

/** Several neighbouring parts of one page as one picture: the smallest rectangle around them (page coordinates). */
async function shotUnion(targets: Locator[], lang: Lang, name: string, maxHeight = 1400): Promise<void> {
  const page = targets[0]!.page()
  await settle(page)
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }))
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const target of targets) {
    const box = await target.boundingBox()
    expect(box, `${name}: nothing to photograph`).not.toBeNull()
    left = Math.min(left, box!.x + scroll.x)
    top = Math.min(top, box!.y + scroll.y)
    right = Math.max(right, box!.x + box!.width + scroll.x)
    bottom = Math.max(bottom, box!.y + box!.height + scroll.y)
  }
  await page.screenshot({
    path: resolve(outDir(lang), `${name}.png`),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    clip: { x: left, y: top, width: right - left, height: Math.min(bottom - top, maxHeight) },
  })
}

/** The texts of the interface that the capture has to find, in both languages (the labels are the ones in de.json and en.json). */
const TEXT = {
  de: {
    discard: 'Verwerfen',
    addPosition: 'Station hinzufügen',
    jobTitle: 'Position / Berufsbezeichnung',
    employer: 'Arbeitgeber / Unternehmen',
    startDate: 'Beginn (Monat/Jahr)',
    gapShow: 'Details & Tipps anzeigen',
    wizardMode: 'Assistenten-Modus',
    wizardSteps: 'Schritt-für-Schritt-Assistent',
    options: 'Optionen',
    jsonResume: 'JSON Resume',
    importMode: 'Importieren',
    recipient: 'Empfänger',
    content: 'Briefinhalt',
    design: 'Design & Format',
    signature: 'Unterschrift & Signatur',
    sender: 'Absenderangaben',
    newApplication: 'Neue Bewerbung',
    applicationJobTitle: 'Stellenbezeichnung',
    applicationCompany: 'Unternehmen',
    applicationLocation: 'Standort / Remote',
    dossierTab: 'Bewerbungs-Dossier',
    applicationEdit: 'Bearbeiten',
    applicationEditTitle: 'Bewerbung bearbeiten',
    dossierView: 'Dossier ansehen',
    attachments: 'Anlagen & Zeugnisse',
    aiSettings: 'KI-Einstellungen',
    aiProvider: 'KI-Anbieter',
    aiModel: 'Modell',
    aiServer: 'KI-Zugang des Servers',
    whatsNew: 'Neuerungen dieser Version',
  },
  en: {
    discard: 'Discard',
    addPosition: 'Add position',
    jobTitle: 'Position / Job title',
    employer: 'Employer / Company',
    startDate: 'Start (month/year)',
    gapShow: 'Show details & tips',
    wizardMode: 'Wizard mode',
    wizardSteps: 'Step-by-step wizard',
    options: 'Options',
    jsonResume: 'JSON Resume',
    importMode: 'Import',
    recipient: 'Recipient',
    content: 'Letter Content',
    design: 'Design & Format',
    signature: 'Signature',
    sender: 'Sender Information',
    newApplication: 'New Application',
    applicationJobTitle: 'Job Title',
    applicationCompany: 'Company',
    applicationLocation: 'Location / Remote',
    dossierTab: 'Application Dossier',
    applicationEdit: 'Edit',
    applicationEditTitle: 'Edit Application',
    dossierView: 'View Dossier',
    attachments: 'Attachments & certificates',
    aiSettings: 'AI Settings',
    aiProvider: 'AI Provider',
    aiModel: 'Model',
    aiServer: 'AI access of the server',
    whatsNew: 'What is new in this version',
  },
} as const

/** Closes a dialog with Escape; a form with typed input asks first, and the capture answers "discard". */
async function closeDialog(page: Page, lang: Lang, dialog: Locator): Promise<void> {
  await page.keyboard.press('Escape')
  const question = page.getByRole('alertdialog')
  const asked = await question.waitFor({ state: 'visible', timeout: 800 }).then(
    () => true,
    () => false,
  )
  if (asked) await question.getByRole('button', { name: TEXT[lang].discard }).click()
  await expect(dialog).toBeHidden()
}

/** Runs `act` with a taller window (a long dialog does not fit into 800 pixels) and puts the usual size back. */
async function withTallWindow(page: Page, height: number, act: () => Promise<void>): Promise<void> {
  await page.setViewportSize({ width: 1280, height })
  try {
    await act()
  } finally {
    await page.setViewportSize({ width: 1280, height: 800 })
  }
}

// ---- made-up content of the profile, letter, attachments and applications ---------------------------------------------------------

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** A small valid PNG (a soft grey gradient) - the stand-in for a scanned certificate in the demo attachments. */
function demoPng(width: number, height: number): Buffer {
  const stride = width * 3 + 1
  const rows = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shade = 225 + Math.round((y / height) * 25)
      const offset = y * stride + 1 + x * 3
      rows[offset] = shade
      rows[offset + 1] = shade
      rows[offset + 2] = shade + (x % 40 === 0 ? 0 : 4)
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

interface DemoContent {
  bio: string
  professionalTitle: string
  experiences: { jobTitle: string; employer: string; employmentType: string; startDate: string; endDate: string | null; isCurrent: boolean; description: string }[]
  education: { degree: string; institution: string; startDate: string; endDate: string; grade: string }
  skills: { name: string; category: string; level: number }[]
  languages: { language: string; level: string }[]
  certificate: { title: string; issuer: string; issueDate: string }
  letter: { title: string; company: string; contact: string; street: string; city: string; subject: string; salutation: string; body: string; closing: string; note: string }
  attachments: { title: string; category: string }[]
  applications: { jobTitle: string; company: string; location: string; status: string; daysAgo: number | null }[]
}

const DEMO: Record<Lang, DemoContent> = {
  de: {
    bio: 'Teamleiterin Buchhaltung mit zehn Jahren Erfahrung in Monats- und Jahresabschlüssen. Ich arbeite genau, gern im Team und bringe Ruhe in volle Fristen.',
    professionalTitle: 'Teamleiterin Buchhaltung',
    experiences: [
      { jobTitle: 'Teamleiterin Buchhaltung', employer: 'Beispiel Handels GmbH', employmentType: 'Vollzeit', startDate: '2021-04', endDate: null, isCurrent: true, description: 'Leitung eines Teams von vier Personen\nMonats- und Jahresabschlüsse\nEinführung eines digitalen Belegflusses' },
      { jobTitle: 'Buchhalterin', employer: 'Muster Logistik AG', employmentType: 'Vollzeit', startDate: '2016-09', endDate: '2021-02', isCurrent: false, description: 'Kreditoren- und Debitorenbuchhaltung\nUmsatzsteuer-Voranmeldungen' },
    ],
    education: { degree: 'Ausbildung zur Bürokauffrau', institution: 'Berufskolleg Musterstadt', startDate: '2013-09', endDate: '2016-07', grade: '1,8' },
    skills: [
      { name: 'Buchführung', category: 'Fachkenntnisse', level: 4 },
      { name: 'Tabellenkalkulation', category: 'Fachkenntnisse', level: 4 },
      { name: 'Teamführung', category: 'Methoden', level: 3 },
    ],
    languages: [
      { language: 'Deutsch', level: 'native' },
      { language: 'Englisch', level: 'B2' },
    ],
    certificate: { title: 'Bilanzbuchhalterin (IHK)', issuer: 'IHK Musterstadt', issueDate: '2019-06' },
    letter: {
      title: 'Bewerbung Buchhalterin bei Beispiel GmbH',
      company: 'Beispiel GmbH',
      contact: 'Frau Dr. Schmidt',
      street: 'Hauptstraße 1',
      city: 'Beispielstadt',
      subject: 'Bewerbung als Buchhalterin',
      salutation: 'Sehr geehrte Frau Dr. Schmidt,',
      body: 'mit großem Interesse habe ich Ihre Stellenanzeige gelesen. Seit zehn Jahren arbeite ich in der Buchhaltung und leite heute ein Team von vier Personen.\n\nGern bringe ich meine Erfahrung bei Ihnen ein.',
      closing: 'Mit freundlichen Grüßen',
      note: 'Lebenslauf, Zeugnisse',
    },
    attachments: [
      { title: 'Arbeitszeugnis Muster Logistik AG', category: 'Zeugnis' },
      { title: 'Zeugnis Bilanzbuchhalterin (IHK)', category: 'Zertifikat' },
    ],
    applications: [
      { jobTitle: 'Buchhalterin', company: 'Beispiel GmbH', location: 'Beispielstadt', status: 'applied', daysAgo: 20 },
      { jobTitle: 'Controllerin', company: 'Muster Consulting AG', location: 'Musterstadt', status: 'interview', daysAgo: 9 },
      { jobTitle: 'Finanzbuchhalterin', company: 'Probe & Söhne KG', location: 'Remote', status: 'draft', daysAgo: null },
      { jobTitle: 'Sachbearbeiterin Rechnungswesen', company: 'Demo Versorgung AG', location: 'Beispielstadt', status: 'acknowledged', daysAgo: 6 },
      { jobTitle: 'Teamleitung Rechnungswesen', company: 'Demo Industrie AG', location: 'Musterstadt', status: 'rejected', daysAgo: 30 },
    ],
  },
  en: {
    bio: 'Head of accounting with ten years of experience in monthly and annual closings. I work precisely, enjoy teamwork and keep calm when deadlines pile up.',
    professionalTitle: 'Head of accounting',
    experiences: [
      { jobTitle: 'Head of accounting', employer: 'Example Trading Ltd', employmentType: 'Full-time', startDate: '2021-04', endDate: null, isCurrent: true, description: 'Leading a team of four people\nMonthly and annual closings\nIntroducing a digital document flow' },
      { jobTitle: 'Accountant', employer: 'Sample Logistics plc', employmentType: 'Full-time', startDate: '2016-09', endDate: '2021-02', isCurrent: false, description: 'Accounts payable and receivable\nVAT returns' },
    ],
    education: { degree: 'Office management apprenticeship', institution: 'Sample Vocational College', startDate: '2013-09', endDate: '2016-07', grade: '1.8' },
    skills: [
      { name: 'Bookkeeping', category: 'Professional skills', level: 4 },
      { name: 'Spreadsheets', category: 'Professional skills', level: 4 },
      { name: 'Team leadership', category: 'Methods', level: 3 },
    ],
    languages: [
      { language: 'German', level: 'native' },
      { language: 'English', level: 'B2' },
    ],
    certificate: { title: 'Certified accountant', issuer: 'Sample Chamber of Commerce', issueDate: '2019-06' },
    letter: {
      title: 'Application accountant at Example Ltd',
      company: 'Example Ltd',
      contact: 'Dr. Smith',
      street: '1 High Street',
      city: 'Exampleton',
      subject: 'Application as accountant',
      salutation: 'Dear Dr. Smith,',
      body: 'I read your job advertisement with great interest. I have worked in accounting for ten years and today lead a team of four people.\n\nI would be glad to bring my experience to your company.',
      closing: 'Sincerely,',
      note: 'CV, references',
    },
    attachments: [
      { title: 'Reference Sample Logistics plc', category: 'Zeugnis' },
      { title: 'Certificate accountant', category: 'Zertifikat' },
    ],
    applications: [
      { jobTitle: 'Accountant', company: 'Example Ltd', location: 'Exampleton', status: 'applied', daysAgo: 20 },
      { jobTitle: 'Controller', company: 'Sample Consulting plc', location: 'Sampletown', status: 'interview', daysAgo: 9 },
      { jobTitle: 'Financial accountant', company: 'Test & Sons', location: 'Remote', status: 'draft', daysAgo: null },
      { jobTitle: 'Accounts clerk', company: 'Demo Utilities plc', location: 'Exampleton', status: 'acknowledged', daysAgo: 6 },
      { jobTitle: 'Head of accounts', company: 'Demo Industries plc', location: 'Sampletown', status: 'rejected', daysAgo: 30 },
    ],
  },
}

async function expectOk(response: { ok(): boolean; status(): number }, what: string): Promise<void> {
  expect(response.ok(), `${what} answered ${response.status()}`).toBe(true)
}

/** Everything the profile holds as lists, with the ids needed to delete it again. */
interface ProfileLists {
  experiences: { id: string }[]
  educations: { id: string }[]
  skills: { id: string }[]
  languages: { id: string }[]
  certificates: { id: string }[]
  interests: { id: string }[]
  customSections: { id: string }[]
}

/**
 * Writes the made-up content of the profile, the cover letter, the attachments and the applications in the language of the
 * manual - first removing what an earlier language left, so both manuals show the same story in their own language.
 */
async function seedDemoContent(api: APIRequestContext, lang: Lang): Promise<void> {
  const demo = DEMO[lang]

  // Remove: applications first (they point at letters and attachments), then letters, attachments and the profile lists
  const applications = (await (await api.get('/api/applications')).json()) as { id: string }[]
  for (const item of applications) await expectOk(await api.delete(`/api/applications/${item.id}`), 'deleting an application')
  const letters = (await (await api.get('/api/cover-letters')).json()) as { id: string }[]
  for (const item of letters) await expectOk(await api.delete(`/api/cover-letters/${item.id}`), 'deleting a cover letter')
  const files = (await (await api.get('/api/attachments')).json()) as { id: string }[]
  for (const item of files) await expectOk(await api.delete(`/api/attachments/${item.id}`), 'deleting an attachment')
  const lists = (await (await api.get('/api/profile')).json()) as ProfileLists
  const areas: [string, { id: string }[]][] = [
    ['experiences', lists.experiences],
    ['educations', lists.educations],
    ['skills', lists.skills],
    ['languages', lists.languages],
    ['certificates', lists.certificates],
    ['interests', lists.interests],
    ['custom-sections', lists.customSections],
  ]
  for (const [path, items] of areas) for (const item of items) await expectOk(await api.delete(`/api/profile/${path}/${item.id}`), `deleting from ${path}`)

  // Profile
  await expectOk(
    await api.put('/api/profile', {
      data: {
        firstName: 'Mira',
        lastName: 'Beispiel',
        professionalTitle: demo.professionalTitle,
        email: 'mira@beispiel.example',
        phone: '+49 30 1234567',
        street: lang === 'de' ? 'Musterweg 12' : '12 Sample Road',
        postalCode: '12345',
        city: lang === 'de' ? 'Musterstadt' : 'Sampletown',
        country: lang === 'de' ? 'Deutschland' : 'Germany',
        bio: demo.bio,
      },
    }),
    'saving the personal data',
  )
  let order = 0
  for (const entry of demo.experiences) {
    await expectOk(
      await api.post('/api/profile/experiences', {
        data: { ...entry, city: lang === 'de' ? 'Musterstadt' : 'Sampletown', country: null, sortOrder: order++ },
      }),
      'adding a position',
    )
  }
  await expectOk(
    await api.post('/api/profile/educations', {
      data: { ...demo.education, fieldOfStudy: null, city: null, country: null, isCurrent: false, description: null, sortOrder: 0 },
    }),
    'adding an education',
  )
  order = 0
  for (const entry of demo.skills) await expectOk(await api.post('/api/profile/skills', { data: { ...entry, sortOrder: order++ } }), 'adding a skill')
  order = 0
  for (const entry of demo.languages) await expectOk(await api.post('/api/profile/languages', { data: { ...entry, sortOrder: order++ } }), 'adding a language')
  await expectOk(
    await api.post('/api/profile/certificates', {
      data: { ...demo.certificate, expiryDate: null, credentialUrl: null, credentialId: null, sortOrder: 0 },
    }),
    'adding a certificate',
  )

  // Cover letter
  const letter = demo.letter
  const created = await api.post('/api/cover-letters', {
    data: {
      title: letter.title,
      senderName: 'Mira Beispiel',
      senderStreet: lang === 'de' ? 'Musterweg 12' : '12 Sample Road',
      senderPostalCode: '12345',
      senderCity: lang === 'de' ? 'Musterstadt' : 'Sampletown',
      senderPhone: '+49 30 1234567',
      senderEmail: 'mira@beispiel.example',
      recipientCompany: letter.company,
      recipientDepartment: '',
      recipientContactPerson: letter.contact,
      recipientStreet: letter.street,
      recipientPostalCode: '54321',
      recipientCity: letter.city,
      recipientCountry: '',
      place: lang === 'de' ? 'Musterstadt' : 'Sampletown',
      date: lang === 'de' ? '06.11.2026' : 'November 6, 2026',
      subject: letter.subject,
      salutation: letter.salutation,
      body: letter.body,
      closing: letter.closing,
      signatureName: 'Mira Beispiel',
      attachmentsNote: letter.note,
      language: lang,
      font: 'Liberation Sans',
      accentColor: '#14213D',
    },
  })
  await expectOk(created, 'creating the cover letter')
  const letterId = ((await created.json()) as { id: string }).id

  // Attachments (images: a PDF would need a made-up PDF file as well)
  const attachmentIds: string[] = []
  for (const attachment of demo.attachments) {
    const uploaded = await api.post('/api/attachments', {
      multipart: { file: { name: 'beispiel.png', mimeType: 'image/png', buffer: demoPng(600, 800) }, title: attachment.title, category: attachment.category },
    })
    await expectOk(uploaded, 'uploading an attachment')
    attachmentIds.push(((await uploaded.json()) as { id: string }).id)
  }

  // Applications (the first one is "applied" for 20 days: a follow-up is due, and its dossier is frozen)
  for (const application of demo.applications) {
    const sent = application.daysAgo === null ? null : new Date(Date.now() - application.daysAgo * 86_400_000).toISOString()
    await expectOk(
      await api.post('/api/applications', {
        data: {
          jobTitle: application.jobTitle,
          company: application.company,
          location: application.location,
          status: application.status,
          appliedAt: application.status === 'draft' ? null : sent,
          coverLetterId: application === demo.applications[0] ? letterId : null,
          attachmentIds: application === demo.applications[0] ? attachmentIds : [],
          cvDesign: 'classic',
          cvLanguage: lang,
          includeCoverSheet: true,
        },
      }),
      'creating an application',
    )
  }
}

async function endSession(context: BrowserContext, api: APIRequestContext): Promise<void> {
  // Ends exactly this session, so the list of signed-in devices is the same in both languages.
  await context.request.post('/api/auth/logout', { headers: HEADERS })
  await context.close()
  await api.dispose()
}

// ---- 1. the setup page of the empty server -----------------------------------------------------------------------------------

test('setup page (empty server)', async ({ browser }) => {
  for (const lang of LANGS) {
    const { context, page } = await openWindow(browser, lang)
    const bootstrap = await (await page.request.get('/api/bootstrap')).json()
    expect(bootstrap.setupRequired, 'the capture needs a fresh server (empty database)').toBe(true)

    await page.goto('/setup')
    await expect(field(page, 'username')).toBeVisible()
    await field(page, 'username').fill(MIRA.username)
    await field(page, 'displayName').fill(MIRA.displayName)
    // The one-time setup code (only present when the server asks for it); shown as typed dots like the passwords
    const setupCode = field(page, 'setupCode')
    if ((await setupCode.count()) > 0 && SETUP_CODE) await setupCode.fill(SETUP_CODE)
    await field(page, 'password').fill(MIRA.password)
    await field(page, 'repeat').fill(MIRA.password)
    await shot(page.locator('main > div').first(), lang, 'setup')
    await context.close()
  }
})

// ---- 2. made-up demo data ------------------------------------------------------------------------------------------------------

test('demo data: three accounts, backups, schedule, some activity', async () => {
  const anonymous = await apiContext()
  const mira = await apiContext(EDGE_ON_WINDOWS)
  const setup = await mira.post('/api/setup', {
    data: { username: MIRA.username, displayName: MIRA.displayName, password: MIRA.password, ...(SETUP_CODE ? { setupCode: SETUP_CODE } : {}) },
  })
  expect(setup.ok(), `setup answered ${setup.status()}`).toBe(true)
  const backup = async () => {
    const response = await mira.post('/api/admin/backups')
    // 409 = nothing changed since the last one: fine
    expect([201, 409]).toContain(response.status())
  }
  await backup()

  const create = async (person: Person) => {
    const response = await mira.post('/api/admin/users', { data: { ...person, role: 'user' } })
    expect(response.ok(), `creating ${person.username} answered ${response.status()}`).toBe(true)
    return (await response.json()) as { id: string }
  }
  await create(JONAS)
  await backup()
  const lena = await create(LENA)
  const disable = await mira.patch(`/api/admin/users/${lena.id}`, { data: { disabled: true } })
  expect(disable.ok()).toBe(true)
  await backup()

  // Jonas: signs in once, has two-factor sign-in on. One wrong password in between (a "sign-in failed" entry in the log).
  const wrong = await anonymous.post('/api/auth/login', { data: { username: JONAS.username, password: 'nicht das Passwort' } })
  expect(wrong.status()).toBe(401)
  const jonas = await signInApi(JONAS, FIREFOX_ON_LINUX)
  const started = await jonas.post('/api/account/2fa/totp/setup')
  expect(started.ok()).toBe(true)
  const { secret } = (await started.json()) as { secret: string }
  const enabled = await jonas.post('/api/account/2fa/totp/enable', { data: { code: totp(secret), password: JONAS.password } })
  expect(enabled.ok(), `two-factor of jonas answered ${enabled.status()}`).toBe(true)
  await jonas.dispose()
  await backup()

  // A schedule that is easy to read: weekdays 02:00 and 18:00
  const settings = await mira.put('/api/admin/backups/settings', {
    data: {
      automaticEnabled: true,
      onStart: true,
      beforeShutdown: true,
      schedule: { kind: 'times', intervalHours: 6, times: ['02:00', '18:00'], weekdays: [1, 2, 3, 4, 5] },
      catchUpMissed: true,
      keepRecent: 20,
      keepDailyDays: 60,
    },
  })
  expect(settings.ok(), `backup settings answered ${settings.status()}`).toBe(true)

  // An uploaded backup: download one and upload it again
  const list = (await (await mira.get('/api/admin/backups')).json()) as { id: string }[]
  expect(list.length).toBeGreaterThan(0)
  const download = await mira.post(`/api/admin/backups/${list[0]!.id}/download`, { data: { password: MIRA.password } })
  expect(download.ok(), `download answered ${download.status()}`).toBe(true)
  const upload = await mira.post('/api/admin/backups/upload', {
    multipart: { file: { name: 'vitafolio-backup.db', mimeType: 'application/octet-stream', buffer: await download.body() }, password: MIRA.password },
  })
  expect(upload.ok(), `upload answered ${upload.status()}`).toBe(true)

  // More devices of the administrator (they stay signed in), then this setup session ends
  await (await signInApi(MIRA, FIREFOX_ON_LINUX)).dispose()
  await mira.post('/api/auth/logout')
  await mira.dispose()
  await anonymous.dispose()
})

// ---- 3. the read-only screens, German first, then English ----------------------------------------------------------------------

for (const lang of LANGS) {
  test(`figures without changes (${lang})`, async ({ browser }) => {
    // Signed out: sign-in page and the second step
    {
      const { context, page } = await openWindow(browser, lang)
      await page.goto('/login')
      await field(page, 'username').fill(MIRA.username)
      await field(page, 'password').fill(MIRA.password)
      await shot(page.locator('main > div').first(), lang, 'anmeldung')

      await field(page, 'username').fill(JONAS.username)
      await field(page, 'password').fill(JONAS.password)
      await page.locator('button[type="submit"]').click()
      await expect(field(page, 'code')).toBeVisible()
      await shot(page.locator('main > div').first(), lang, 'anmeldung-code')
      await context.close()
    }

    // Signed in as the demo administrator
    const api = await signInApi(MIRA, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
    const { context, page } = await openWindow(browser, lang, api)
    const open = async (path: string) => {
      await page.goto(path)
      await expect(page.getByTestId('current-user')).toContainText(MIRA.displayName)
    }

    // Profile, letter, attachments and applications in the language of this manual (replaces what the other language left)
    await seedDemoContent(api, lang)
    const text = TEXT[lang]

    // The main window with numbered parts: menu, own area, colour scheme switch, footer
    await open('/')
    await expect(page.locator('aside footer')).toBeVisible()
    await mark(page.locator('aside nav'), 1)
    await mark(page.getByTestId('current-user').locator('xpath=../..'), 2)
    await mark(page.locator('aside').getByRole('radiogroup'), 3)
    await mark(page.locator('aside footer'), 4)
    await shotWindow(page, lang, 'hauptfenster')
    await clearMarks(page)

    // Personal settings: signed-in devices, appearance
    await open('/settings?tab=security')
    await expect(page.getByTestId('sessions-table')).toBeVisible()
    await expect(page.getByTestId('sessions-table').locator('tbody tr')).not.toHaveCount(0)
    await shot(cards(page).nth(2), lang, 'geraete')
    await open('/settings?tab=appearance')
    await shot(page.locator('[role="tabpanel"]'), lang, 'darstellung')

    // App administration: users (with the four row actions numbered), the create dialog, access switches, activity log
    await open('/admin?tab=users')
    const table = page.getByTestId('users-table')
    await expect(table.locator('tbody tr')).toHaveCount(3)
    const actions = table.locator('tbody tr').first().getByRole('button')
    for (let index = 0; index < 4; index++) await mark(actions.nth(index), index + 1, 'above')
    await shot(page.locator('[role="tabpanel"]'), lang, 'benutzer')
    await clearMarks(page)

    await page.getByTestId('create-user').click()
    const create = page.getByRole('dialog')
    await expect(create).toBeVisible()
    await inputIn(create, 'username').fill('lukas')
    await inputIn(create, 'displayName').fill('Lukas Demo')
    await inputIn(create, 'password').fill('Ein vierter Beispielsatz 2026')
    await inputIn(create, 'repeat').fill('Ein vierter Beispielsatz 2026')
    await page.waitForTimeout(400)
    await shot(create, lang, 'benutzer-anlegen')
    await page.keyboard.press('Escape')
    await expect(create).toBeHidden()

    await open('/admin?tab=settings')
    await shot(cards(page).first(), lang, 'admin-einstellungen')

    await open('/admin?tab=activity')
    await expect(page.getByTestId('activity-table').locator('tbody tr').first()).toBeVisible()
    await shotTop(page.locator('[role="tabpanel"]'), lang, 'aktivitaetsprotokoll', 560)

    // Backups: schedule (numbered), week preview, list with the three buttons (numbered), restore dialog
    await open('/admin?tab=backups')
    await expect(page.getByTestId('week-preview')).toBeVisible()
    await expect(page.getByTestId('backup-table').locator('tbody tr').first()).toBeVisible()
    await scrub(page)
    const schedule = cards(page).nth(0)
    await mark(schedule.locator('div.bg-surface-2').first(), 1)
    await mark(schedule.getByRole('switch').nth(1).locator('xpath=ancestor::div[contains(@class,"flex-col")][1]'), 2)
    await mark(schedule.getByRole('radiogroup').first(), 3)
    await mark(schedule.getByRole('switch').nth(3).locator('xpath=ancestor::div[contains(@class,"justify-between")][1]'), 4)
    await mark(schedule.locator('input[name="keepRecent"]').locator('xpath=ancestor::div[contains(@class,"grid")][1]'), 5)
    await shot(schedule, lang, 'zeitplan')
    await clearMarks(page)

    await shot(cards(page).nth(1), lang, 'vorschau')

    const list = cards(page).nth(2)
    await mark(page.getByTestId('backup-now'), 1)
    await mark(page.getByTestId('download-current'), 2)
    await mark(page.getByTestId('upload-backup'), 3)
    await shot(list, lang, 'sicherungen')
    await clearMarks(page)

    await page.getByTestId('restore').first().click()
    const restore = page.getByRole('alertdialog')
    await expect(restore).toBeVisible()
    await inputIn(restore, 'reauthPassword').fill(MIRA.password)
    await page.waitForTimeout(400)
    await shot(restore, lang, 'wiederherstellen')
    await page.keyboard.press('Escape')
    await expect(restore).toBeHidden()

    // ---- Master profile (chapter 8) ----
    // Personal details and photo area
    await open('/profile?tab=personal')
    await expect(page.getByTestId('profile-content')).toBeVisible()
    await shotTop(page.getByTestId('profile-content'), lang, 'profil-persoenlich', 720)

    // A position in its entry window
    await open('/profile?tab=experiences')
    await page.getByRole('button', { name: text.addPosition }).click()
    const station = page.getByRole('dialog')
    await expect(station).toBeVisible()
    await page.getByLabel(text.jobTitle).fill(DEMO[lang].experiences[0]!.jobTitle)
    await page.getByLabel(text.employer).fill(DEMO[lang].experiences[0]!.employer)
    // The date field takes digits only and adds the separators of the language itself (03.2021 / 2021-03)
    const [startYear, startMonth] = DEMO[lang].experiences[0]!.startDate.split('-').map(Number)
    await page.getByLabel(text.startDate).fill(dateIn(lang).monthDigits(startYear!, startMonth!))
    await page.waitForTimeout(300)
    await shot(station, lang, 'profil-station')
    await closeDialog(page, lang, station)

    // The gap analysis, opened
    await page.getByRole('button', { name: text.gapShow }).click()
    await shot(page.locator('div.notice-warning').first(), lang, 'luecken-analyse')

    // Wizard mode: the header and the five steps
    await open('/profile?tab=personal')
    await page.getByRole('button', { name: text.wizardMode }).click()
    await expect(page.getByRole('list', { name: text.wizardSteps })).toBeVisible()
    await shotUnion([page.locator('div.card.border-l-4').first(), page.getByRole('list', { name: text.wizardSteps })], lang, 'assistent')

    // CV options (the preview itself is a PDF frame and not photographed)
    await open('/profile?tab=preview')
    await expect(page.getByRole('region', { name: text.options })).toBeVisible()
    await shot(page.getByRole('region', { name: text.options }), lang, 'lebenslauf-optionen')

    // JSON Resume window, import side
    await open('/profile?tab=personal')
    await page.getByRole('button', { name: text.jsonResume }).click()
    const json = page.getByRole('dialog')
    await expect(json).toBeVisible()
    await json.getByRole('radio', { name: text.importMode }).click()
    await page.waitForTimeout(300)
    await shot(json, lang, 'json-resume')
    await closeDialog(page, lang, json)

    // ---- Cover letters (chapter 9) ----
    await open('/cover-letters')
    await page.getByRole('button', { name: DEMO[lang].letter.title }).click()
    await expect(page.getByRole('region', { name: text.recipient })).toBeVisible()
    await shotUnion([page.getByRole('region', { name: text.recipient }), page.getByRole('region', { name: text.content })], lang, 'anschreiben-inhalt', 1500)
    await shotUnion(
      [page.getByRole('region', { name: text.design }), page.getByRole('region', { name: text.signature }), page.getByRole('region', { name: text.sender })],
      lang,
      'anschreiben-optionen',
    )

    // ---- Tracker, dossier, attachments (chapter 10) ----
    await open('/applications')
    await expect(page.getByRole('button', { name: DEMO[lang].applications[0]!.jobTitle, exact: true }).first()).toBeVisible()
    await shotTop(page.locator('main > div').first(), lang, 'tracker-board', 800)

    await page.getByRole('button', { name: DEMO[lang].applications[0]!.jobTitle, exact: true }).first().click()
    const details = page.getByRole('dialog')
    await expect(details).toBeVisible()
    await details.getByRole('tab', { name: text.dossierTab }).click()
    await page.waitForTimeout(300)
    await shot(details, lang, 'tracker-details')

    // The window to change an application (it looks like the one to create it, without the status) and the dossier preview with the bar
    // that says which version it shows (the first demo application is sent, so its filed version is shown first)
    await withTallWindow(page, 1300, async () => {
      await details.getByRole('button', { name: text.applicationEdit, exact: true }).click()
      const edit = page.getByRole('dialog', { name: text.applicationEditTitle })
      await expect(edit).toBeVisible()
      await page.waitForTimeout(300)
      await shot(edit, lang, 'tracker-bearbeiten')
      await closeDialog(page, lang, edit)
    })
    await details.getByRole('button', { name: text.dossierView, exact: true }).click()
    const dossier = page.getByRole('dialog').filter({ has: page.getByTestId('dossier-source') })
    await expect(dossier).toBeVisible()
    await expect(dossier.getByTestId('pdf-preview-frame')).toBeVisible()
    await expect(page.getByTestId('dossier-source').locator('.badge').first()).toBeVisible()
    await page.waitForTimeout(800)
    await shot(dossier, lang, 'dossier-ansicht')
    await closeDialog(page, lang, dossier)
    await closeDialog(page, lang, details)

    await page.getByRole('button', { name: text.attachments }).click()
    const files = page.getByRole('dialog')
    await expect(files).toBeVisible()
    await expect(files.getByText(DEMO[lang].attachments[0]!.title)).toBeVisible()
    await shot(files, lang, 'anlagen')
    await closeDialog(page, lang, files)

    await withTallWindow(page, 1300, async () => {
      await page.getByRole('button', { name: text.newApplication }).click()
      const create = page.getByRole('dialog')
      await expect(create).toBeVisible()
      await page.getByLabel(text.applicationJobTitle, { exact: false }).first().fill(lang === 'de' ? 'Buchhalterin' : 'Accountant')
      await page.getByLabel(text.applicationCompany, { exact: false }).first().fill(lang === 'de' ? 'Beispiel GmbH' : 'Example Ltd')
      await page.getByLabel(text.applicationLocation, { exact: false }).first().fill(lang === 'de' ? 'Beispielstadt' : 'Exampleton')
      await page.waitForTimeout(300)
      await shot(create, lang, 'tracker-neu')
      await closeDialog(page, lang, create)
    })

    // ---- AI help (chapter 11) ----
    await open('/')
    await page.getByRole('button', { name: text.aiSettings }).click()
    const ai = page.getByRole('dialog')
    await expect(ai).toBeVisible()
    await ai.getByLabel(text.aiProvider).selectOption('ollama')
    await ai.getByLabel(text.aiModel, { exact: true }).fill(lang === 'de' ? 'mein-modell' : 'my-model')
    await page.waitForTimeout(300)
    await shot(ai, lang, 'ki-einstellungen')
    await closeDialog(page, lang, ai)

    await open('/profile?tab=personal')
    await page.getByTestId('bio-ai-summary').click()
    const assistant = page.getByRole('dialog')
    await expect(assistant).toBeVisible()
    await page.waitForTimeout(300)
    await shot(assistant, lang, 'ki-assistent')
    await closeDialog(page, lang, assistant)

    await open('/admin?tab=settings')
    await shot(page.getByRole('region', { name: text.aiServer }), lang, 'ki-server')

    // ---- Updates, "What is new", About (chapters 16 and 17): invented answers for the two screens that need the internet / a changelog ----
    const status = {
      currentVersion: 'v2026.11.12.13.557',
      currentTag: 'v2026.11.12',
      currentChannel: 'release',
      host: 'server',
      state: 'available',
      hasUpdate: true,
      available: {
        tag: 'v2026.12.3',
        display: 'v2026.12.3.4.120',
        channel: 'release',
        htmlUrl: 'https://github.com/example/project/releases/tag/v2026.12.3',
        publishedAt: '2026-12-05T08:00:00Z',
        notes: lang === 'de' ? 'Neu: Beispielfunktion\nBehoben: Beispielfehler' : 'New: example feature\nFixed: example bug',
      },
      latestRelease: null,
      latestBeta: null,
      latestNightly: null,
      checkedAt: '2026-12-05T09:30:00Z',
      nextManualCheckAt: null,
      throttled: false,
      error: null,
      dockerImage: 'ghcr.io/example/project',
      channel: 'none',
      channelSaved: true,
      dockerTag: 'latest',
      canInstall: false,
      install: { state: 'idle' },
    }
    const notes = {
      show: false,
      version: 'v2026.12.3.4.120',
      tag: 'v2026.12.3',
      language: lang,
      summary: null,
      sections: [
        { category: 'new', title: lang === 'de' ? 'Neu' : 'New', items: [lang === 'de' ? 'Eine **Beispielfunktion** für das Handbuch.' : 'An **example feature** for the manual.'] },
        { category: 'fixed', title: lang === 'de' ? 'Behoben' : 'Fixed', items: [lang === 'de' ? 'Ein Beispielfehler wurde behoben.' : 'An example bug was fixed.'] },
      ],
    }
    await context.route('**/api/updates/status', (route) => route.fulfill({ json: status }))
    await context.route('**/api/whats-new/current**', (route) => route.fulfill({ json: notes }))

    await open('/admin?tab=updates')
    await expect(page.getByTestId('update-available')).toBeVisible()
    await shotTop(page.getByTestId('admin-updates'), lang, 'updates', 1100)

    await open('/settings?tab=about')
    await expect(page.getByTestId('about')).toBeVisible()
    await shot(page.getByTestId('about').locator('section').first(), lang, 'ueber')
    await page.getByRole('button', { name: text.whatsNew }).click()
    const news = page.getByRole('dialog')
    await expect(news).toBeVisible()
    await expect(news.getByText(lang === 'de' ? 'Ein Beispielfehler wurde behoben.' : 'An example bug was fixed.')).toBeVisible()
    await shot(news, lang, 'neuerungen')
    await page.keyboard.press('Escape')
    await expect(news).toBeHidden()
    await context.unroute('**/api/updates/status')
    await context.unroute('**/api/whats-new/current**')

    await endSession(context, api)
  })
}

// ---- 4. steps that change something (last, so both languages saw the same data above) -----------------------------------------

for (const lang of LANGS) {
  test(`figures with changes (${lang})`, async ({ browser }) => {
    // An error message with its Copy button: a wrong password
    {
      const { context, page } = await openWindow(browser, lang)
      await page.goto('/login')
      await field(page, 'username').fill(MIRA.username)
      await field(page, 'password').fill('das ist nicht das Passwort')
      await page.locator('button[type="submit"]').click()
      const notice = page.getByTestId('error-notice')
      await expect(notice).toBeVisible()
      await shot(notice, lang, 'fehlermeldung')
      await context.close()
    }

    // Two-factor setup of the demo administrator: QR code, recovery codes - then switched off again
    const api = await signInApi(MIRA)
    const { context, page } = await openWindow(browser, lang, api)
    await page.goto('/settings?tab=security')
    await expect(page.getByTestId('current-user')).toContainText(MIRA.displayName)
    await page.getByTestId('totp-start').click()
    const secret = (await page.getByTestId('totp-secret').innerText()).trim()
    await expect(page.getByRole('img', { name: /QR/ })).toBeVisible()
    await shot(cards(page).nth(1), lang, 'zwei-faktor-einrichten')

    await field(page, 'code').fill(totp(secret))
    // If the server asks for the account password again here, it is entered the same way (field name "password")
    await page.getByRole('button', { name: lang === 'de' ? 'Aktivieren' : 'Turn on' }).click()
    const codes = page.getByTestId('recovery-codes')
    await expect(codes).toBeVisible()
    await expect(codes.locator('li')).toHaveCount(10)
    const recoveryCode = (await codes.locator('li').first().innerText()).trim()
    await shot(cards(page).nth(1), lang, 'wiederherstellungscodes')
    await page.getByTestId('totp-done').click()

    const form = page.getByTestId('disable-2fa-form')
    await form.locator('input[name="password"]').fill(MIRA.password)
    await form.locator('input[name="code"]').fill(recoveryCode)
    await page.getByTestId('disable-2fa').click()
    await expect(page.getByTestId('totp-start')).toBeVisible()

    await endSession(context, api)
  })
}
