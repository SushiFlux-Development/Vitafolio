import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useMemo } from 'react'
import i18n from 'i18next'
import { Route, Routes } from 'react-router'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../i18n'
import { authApi, docsApi, publicApi, updatesApi, whatsNewApi } from '../../api/endpoints'
import { INTRO_KEY, resetLiveHelper } from '../../features/live-helper/storage'
import { draftKey, writeDraft } from '../../hooks/draftStore'
import { useAutoSave } from '../../hooks/useAutoSave'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { ABOUT, notesOf, offeredStatus, statusOf, versionOf } from '../../test/fixtures'
import { renderInApp } from '../../test/render'
import { AppShell } from './AppShell'
import { useSidebarNav } from './SidebarNav'

vi.mock('../../api/endpoints', () => ({
  authApi: { logout: vi.fn() },
  accountApi: { savePreferences: vi.fn() },
  updatesApi: { status: vi.fn(), check: vi.fn(), setChannel: vi.fn(), install: vi.fn() },
  publicApi: { version: vi.fn(), about: vi.fn() },
  whatsNewApi: { pending: vi.fn(), current: vi.fn(), markSeen: vi.fn() },
  docsApi: { handbookPdf: vi.fn() },
  aiApi: { getConfig: vi.fn() },
}))

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

beforeEach(() => {
  vi.clearAllMocks()
  global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/handbook')
  global.URL.revokeObjectURL = vi.fn()
  vi.mocked(publicApi.version).mockResolvedValue(versionOf('v2026.11.12.13.557'))
  vi.mocked(publicApi.about).mockResolvedValue(ABOUT)
  vi.mocked(updatesApi.status).mockResolvedValue(statusOf())
  vi.mocked(whatsNewApi.pending).mockResolvedValue(notesOf({ show: false, sections: [] }))
  vi.mocked(whatsNewApi.markSeen).mockResolvedValue(undefined)
  vi.mocked(docsApi.handbookPdf).mockResolvedValue(new Blob(['%PDF-1.4'], { type: 'application/pdf' }))
})

/** A page with sections of its own, like the master profile. */
function SectionPage() {
  const section = useMemo(
    () => ({
      label: 'Bereiche der Seite',
      backLabel: 'Zurück',
      items: Array.from({ length: 9 }, (_, index) => ({ id: `s${index}`, label: `Bereich ${index + 1}`, icon: 'fileText' as const, to: `?tab=s${index}` })),
      activeId: 's0',
    }),
    [],
  )
  useSidebarNav(section)
  return <p>section page</p>
}

function renderShell(options: Parameters<typeof renderInApp>[1] = {}) {
  return renderInApp(
    <ThemeProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<p>page</p>} />
          <Route path="/sections" element={<SectionPage />} />
        </Route>
      </Routes>
    </ThemeProvider>,
    options,
  )
}

describe('version display in the navigation', () => {
  it.each([
    ['release', 'v2026.11.12.13.557', 'release'],
    ['beta', 'v2026.11.12.13.557 (β)', 'beta'],
    ['nightly', 'v2026.11.12.13.557 (α)', 'nightly'],
    ['development', 'v2026.11.12.13.557 (</>)', 'dev'],
  ])('shows the %s version exactly as the server writes it, whole', async (_name, text, channel) => {
    vi.mocked(publicApi.version).mockResolvedValue(versionOf(text, channel))
    renderShell()
    const label = await screen.findByTestId('version')
    expect(label).toHaveTextContent(text)
    expect(label.textContent).toBe(text)
    // No cut-off: nothing around the text clips it.
    const link = label.closest('a')!
    expect(link.className).not.toMatch(/truncate|line-clamp|overflow-hidden|text-ellipsis/)
  })

  it('leads to the About page with licence, source code and the notes of this version', async () => {
    renderShell()
    const label = await screen.findByTestId('version')
    expect(label.closest('a')).toHaveAttribute('href', '/settings?tab=about')
  })
})

describe('manual and update hint in the navigation', () => {
  it('opens the manual from the user area', async () => {
    renderShell()
    fireEvent.click(await screen.findByTestId('open-handbook'))
    expect(await screen.findByRole('dialog', { name: 'Handbuch' })).toBeInTheDocument()
    expect(await screen.findByTitle('Handbuch als PDF')).toBeInTheDocument()
  })

  it('shows the update icon for the administrator of a server when an update is available', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ host: 'server', canInstall: false }))
    renderShell({ mode: 'server' })
    expect(await screen.findByTestId('update-nav')).toHaveTextContent('Update verfügbar')
  })

  it('shows no update icon in a development build', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ state: 'devBuild', currentChannel: 'dev' }))
    renderShell()
    await waitFor(() => expect(updatesApi.status).toHaveBeenCalled())
    expect(screen.queryByTestId('update-nav')).toBeNull()
  })
})

describe('"What is new" in the shell', () => {
  it('opens by itself at the start when it is due', async () => {
    vi.mocked(whatsNewApi.pending).mockResolvedValue(notesOf())
    renderShell()
    expect(await screen.findByRole('dialog', { name: /Neu in/ })).toBeInTheDocument()
  })
})

describe('live helper in the shell', () => {
  it('opens the introduction by itself at the very first start, and not again after it was closed', async () => {
    resetLiveHelper()
    renderShell()
    const intro = await screen.findByRole('dialog', { name: /Willkommen bei/ }, { timeout: 3000 })
    fireEvent.click(within(intro).getByRole('button', { name: 'Überspringen' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Willkommen bei/ })).toBeNull())
    expect(localStorage.getItem(INTRO_KEY)).toBe('1')
  })

  it('has a help button that starts the introduction where the page has no hints', async () => {
    renderShell()
    fireEvent.click(await screen.findByTestId('open-help'))
    expect(await screen.findByRole('dialog', { name: /Willkommen bei/ })).toBeInTheDocument()
  })

  it('leads from the last step of the introduction to the manual', async () => {
    renderShell()
    fireEvent.click(await screen.findByTestId('open-help'))
    const intro = await screen.findByRole('dialog', { name: /Willkommen bei/ })
    for (let i = 0; i < 5; i++) fireEvent.click(within(intro).getByRole('button', { name: /^Weiter/ }))
    fireEvent.click(await within(intro).findByRole('button', { name: 'Handbuch öffnen' }))
    expect(await screen.findByRole('dialog', { name: 'Handbuch' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Willkommen bei/ })).toBeNull())
  })

  it('marks the controls it can point at', async () => {
    renderShell()
    await screen.findByTestId('open-help')
    for (const target of ['nav-profile', 'nav-export', 'nav-guide', 'shell-ai', 'shell-handbook', 'shell-help']) {
      expect(document.querySelector(`[data-hint="${target}"]`), target).not.toBeNull()
    }
  })
})

describe('the lower part of the sidebar', () => {
  it('has a theme switch with two positions, light and dark', async () => {
    renderShell()
    const group = await screen.findByRole('radiogroup', { name: 'Darstellung wechseln' })
    expect(within(group).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label') ?? radio.textContent)).toHaveLength(2)
    expect(within(group).queryByRole('radio', { name: 'System' })).toBeNull()
  })

  it('has the entry to the export between the applications and the guide', async () => {
    renderShell()
    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(expect.arrayContaining(['Bewerbungen', 'Export', 'Ratgeber']))
    const names = within(nav).getAllByRole('link').map((link) => link.textContent)
    expect(names.indexOf('Export')).toBe(names.indexOf('Bewerbungen') + 1)
  })

  it('has a sign-out button of its own, and the footer holds the credit line and the version', async () => {
    renderShell()
    const button = await screen.findByTestId('sign-out')
    expect(button).toHaveClass('btn')
    expect(button.className).not.toContain('w-full')
    expect(await screen.findByTestId('version')).toHaveTextContent('v2026.11.12.13.557')
  })
})

describe('sub-navigation in the sidebar', () => {
  it('replaces only the main navigation: user area, theme switch and footer stay, and only the list scrolls', async () => {
    renderShell({ route: '/sections' })
    const sections = await screen.findByRole('navigation', { name: 'Bereiche der Seite' })
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).toBeNull()
    expect(within(sections).getAllByRole('link')).toHaveLength(9)
    expect(screen.getByTestId('sidebar-back')).toHaveTextContent('Zurück')

    // Unchanged below the list
    expect(screen.getByTestId('current-user')).toBeInTheDocument()
    expect(screen.getByTestId('open-handbook')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Darstellung wechseln' })).toBeInTheDocument()
    expect(screen.getByTestId('version')).toBeInTheDocument()

    // The list is the part that scrolls; the sidebar as a whole never does, and the user area keeps its size
    expect(sections.className).toMatch(/overflow-y-auto/)
    const aside = sections.closest('aside')!
    expect(aside.className).not.toMatch(/overflow-y-(auto|scroll)/)
    expect(screen.getByTestId('current-user').closest('div.shrink-0')).not.toBeNull()
  })

  it('shows the update hint in the sub-navigation too', async () => {
    vi.mocked(updatesApi.status).mockResolvedValue(offeredStatus({ host: 'server', canInstall: false }))
    renderShell({ mode: 'server', route: '/sections' })
    expect(await screen.findByTestId('update-nav')).toHaveTextContent('Update verfügbar')
  })
})

describe('signing out with forms that save by themselves', () => {
  /** A form that cannot send what was typed: the sign-out would throw it away together with the local copy. */
  function StuckForm() {
    const form = useAutoSave<{ text: string }, unknown>({
      initial: { text: '' },
      save: () => Promise.reject(new Error('no connection')),
      isSendable: () => true,
      draft: { accountId: 'u1', form: 'stuck', base: () => 'b' },
    })
    return <button onClick={() => form.setValue({ text: 'tippe' })}>tippen</button>
  }

  it('removes the local copies of this account only', async () => {
    vi.mocked(authApi.logout).mockResolvedValue(undefined)
    writeDraft(draftKey('u1', 'personal'), { value: { a: 1 }, savedAt: 1, base: 'b' })
    writeDraft(draftKey('u2', 'personal'), { value: { a: 2 }, savedAt: 1, base: 'b' })
    renderShell({ mode: 'server' })

    fireEvent.click(await screen.findByTestId('sign-out'))

    await waitFor(() => expect(authApi.logout).toHaveBeenCalled())
    await waitFor(() => expect(localStorage.getItem(draftKey('u1', 'personal'))).toBeNull())
    expect(localStorage.getItem(draftKey('u2', 'personal'))).not.toBeNull()
  })

  it('asks first when input could not be sent, and stays signed in on "Abbrechen"', async () => {
    vi.mocked(authApi.logout).mockResolvedValue(undefined)
    renderInApp(
      <ThemeProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<StuckForm />} />
          </Route>
        </Routes>
      </ThemeProvider>,
      { mode: 'server' },
    )
    fireEvent.click(await screen.findByRole('button', { name: 'tippen' }))

    fireEvent.click(screen.getByTestId('sign-out'))
    const question = await screen.findByRole('alertdialog')
    expect(question).toHaveTextContent('Eingaben nicht gespeichert')
    fireEvent.click(within(question).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(authApi.logout).not.toHaveBeenCalled()
    // The typed text is still in the local copy
    expect(localStorage.getItem(draftKey('u1', 'stuck'))).not.toBeNull()

    fireEvent.click(screen.getByTestId('sign-out'))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Abmelden und verwerfen' }))
    await waitFor(() => expect(authApi.logout).toHaveBeenCalled())
    await waitFor(() => expect(localStorage.getItem(draftKey('u1', 'stuck'))).toBeNull())
  })
})
