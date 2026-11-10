import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18n from 'i18next'
import { useMemo } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import '../../i18n'
import { NAV_LIST_CLASS, SidebarNavArea, SidebarNavProvider, useSidebarNav } from './SidebarNav'

beforeAll(async () => {
  await i18n.changeLanguage('de')
})

beforeEach(() => sessionStorage.clear())
afterEach(() => sessionStorage.clear())

const TITLES: Record<string, string> = { '/': 'Übersicht', '/letters': 'Anschreiben', '/area': 'Bereich' }

/** A page that hands two sections to the sidebar, as the master profile does with nine. */
function AreaPage() {
  const section = useMemo(
    () => ({
      label: 'Bereiche',
      backLabel: 'Zurück',
      items: [
        { id: 'one', label: 'Eins', icon: 'fileText' as const, to: '?tab=one' },
        { id: 'two', label: 'Zwei', icon: 'briefcase' as const, to: '?tab=two' },
      ],
      activeId: 'one',
    }),
    [],
  )
  useSidebarNav(section)
  return <p>area page</p>
}

function renderApp(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <SidebarNavProvider titleOf={(path) => TITLES[path] ?? 'Übersicht'}>
        <SidebarNavArea
          main={
            <nav aria-label="Hauptnavigation" className={NAV_LIST_CLASS}>
              <Link to="/">Übersicht</Link>
              <Link to="/letters?x=1">Anschreiben</Link>
              <Link to="/area">Bereich</Link>
            </nav>
          }
        />
        <Routes>
          <Route path="/" element={<p>overview page</p>} />
          <Route path="/letters" element={<p>letters page</p>} />
          <Route path="/area" element={<AreaPage />} />
        </Routes>
      </SidebarNavProvider>
    </MemoryRouter>,
  )
}

describe('sidebar sub-navigation', () => {
  it('replaces the main navigation by the sections of the open page, with "Zurück" first, and returns when the page is left', async () => {
    renderApp('/')
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Bereich' }))
    const sections = await screen.findByRole('navigation', { name: 'Bereiche' })
    expect(screen.queryByRole('navigation', { name: 'Hauptnavigation' })).toBeNull()
    // "Zurück" comes before the sections
    const back = screen.getByTestId('sidebar-back')
    expect(back.compareDocumentPosition(sections) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(sections).getByRole('link', { name: 'Eins' })).toHaveAttribute('aria-current', 'page')
    expect(within(sections).getByRole('link', { name: 'Zwei' })).not.toHaveAttribute('aria-current')

    await userEvent.click(back)
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Bereiche' })).toBeNull())
    expect(await screen.findByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument()
  })

  it('"Zurück" leads to the page visited last outside the open one, with its address and its name as the tooltip', async () => {
    renderApp('/')
    await userEvent.click(screen.getByRole('link', { name: 'Anschreiben' }))
    expect(await screen.findByText('letters page')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Bereich' }))
    const back = await screen.findByTestId('sidebar-back')
    expect(back).toHaveAttribute('href', '/letters?x=1')
    expect(back).toHaveAttribute('title', 'Zurück zu: Anschreiben')

    await userEvent.click(back)
    expect(await screen.findByText('letters page')).toBeInTheDocument()
  })

  it('does not count a switch of the section as a visited page', async () => {
    renderApp('/')
    await userEvent.click(screen.getByRole('link', { name: 'Anschreiben' }))
    await userEvent.click(screen.getByRole('link', { name: 'Bereich' }))
    const sections = await screen.findByRole('navigation', { name: 'Bereiche' })
    await userEvent.click(within(sections).getByRole('link', { name: 'Zwei' }))
    await userEvent.click(within(sections).getByRole('link', { name: 'Eins' }))
    expect(screen.getByTestId('sidebar-back')).toHaveAttribute('href', '/letters?x=1')
  })

  it('leads to the overview when there is no page before (opened directly, or the remembered one is the page itself)', async () => {
    renderApp('/area')
    expect(await screen.findByTestId('sidebar-back')).toHaveAttribute('href', '/')
    expect(screen.getByTestId('sidebar-back')).toHaveAttribute('title', 'Zurück zu: Übersicht')
  })

  it('remembers the page before across a reload of the tab, and ignores an address from outside the app', async () => {
    sessionStorage.setItem('cv.previousPage', '/letters?x=1')
    const first = renderApp('/area')
    expect(await screen.findByTestId('sidebar-back')).toHaveAttribute('href', '/letters?x=1')
    first.unmount()

    sessionStorage.setItem('cv.previousPage', '//evil.example/path')
    renderApp('/area')
    expect(await screen.findByTestId('sidebar-back')).toHaveAttribute('href', '/')
  })

  it('does nothing without a shell around (the page alone)', () => {
    render(
      <MemoryRouter>
        <AreaPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('area page')).toBeInTheDocument()
  })
})
