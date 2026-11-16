import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { useMemo } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarNavProvider, SidebarRailProvider, TreeLink, TreeSubs, useSidebarCollapsed, useSidebarNav, useSidebarSection } from './SidebarNav'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

/** A page that hands two sub-pages to the sidebar, as the master profile does with nine. */
function AreaPage() {
  const section = useMemo(
    () => ({
      label: 'Bereiche',
      items: [
        { id: 'one', label: 'Eins', to: '?tab=one' },
        { id: 'two', label: 'Zwei', to: '?tab=two' },
      ],
      activeId: 'one',
    }),
    [],
  )
  useSidebarNav(section)
  return <p>area page</p>
}

function Subs() {
  const section = useSidebarSection()
  return section ? <TreeSubs section={section} /> : <p>no sub-pages</p>
}

describe('sub-pages in the sidebar tree', () => {
  it('shows the sub-pages of the open page as links to its addresses, the open one marked, and drops them when the page goes', () => {
    const view = render(
      <MemoryRouter initialEntries={['/area']}>
        <SidebarNavProvider>
          <Subs />
          <AreaPage />
        </SidebarNavProvider>
      </MemoryRouter>,
    )
    const subs = screen.getByRole('navigation', { name: 'Bereiche' })
    expect(within(subs).getByRole('link', { name: 'Eins' })).toHaveAttribute('aria-current', 'page')
    expect(within(subs).getByRole('link', { name: 'Zwei' })).not.toHaveAttribute('aria-current')
    expect(within(subs).getByRole('link', { name: 'Zwei' })).toHaveAttribute('href', '/area?tab=two')
    expect(subs).toHaveAttribute('data-hint', 'sidebar-sections')

    view.rerender(
      <MemoryRouter initialEntries={['/area']}>
        <SidebarNavProvider>
          <Subs />
        </SidebarNavProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('no sub-pages')).toBeInTheDocument()
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

describe('the rail', () => {
  function Row({ rail }: { rail: boolean }) {
    return (
      <MemoryRouter>
        <SidebarRailProvider rail={rail}>
          <TreeLink to="/letters" icon="files" label="Anschreiben" current={false} expanded={false} />
        </SidebarRailProvider>
      </MemoryRouter>
    )
  }

  it('keeps the name as the accessible name but shows it only in an own tooltip, never as a browser title', () => {
    render(<Row rail />)
    const link = screen.getByRole('link', { name: 'Anschreiben' })
    expect(link).not.toHaveAttribute('title')
    // No chevron and no unfolding in the rail
    expect(link).not.toHaveAttribute('aria-expanded')
    expect(screen.queryByTestId('sidebar-tip')).toBeNull()
    fireEvent.pointerEnter(link)
    expect(screen.getByTestId('sidebar-tip')).toHaveTextContent('Anschreiben')
    fireEvent.pointerLeave(link)
    expect(screen.queryByTestId('sidebar-tip')).toBeNull()
  })

  it('shows no tooltip at full width, where the name is visible', () => {
    render(<Row rail={false} />)
    const link = screen.getByRole('link', { name: 'Anschreiben' })
    expect(link).toHaveAttribute('aria-expanded', 'false')
    fireEvent.pointerEnter(link)
    expect(screen.queryByTestId('sidebar-tip')).toBeNull()
  })
})

describe('the collapsed state', () => {
  it('is remembered per browser', () => {
    const first = renderHook(() => useSidebarCollapsed())
    expect(first.result.current[0]).toBe(false)
    act(() => first.result.current[1]())
    expect(first.result.current[0]).toBe(true)
    expect(localStorage.getItem('cv.sidebarCollapsed')).toBe('1')
    first.unmount()

    expect(renderHook(() => useSidebarCollapsed()).result.current[0]).toBe(true)
  })

  it('still works, for as long as the page lives, when the browser refuses the storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    const first = renderHook(() => useSidebarCollapsed())
    const before = first.result.current[0]
    act(() => first.result.current[1]())
    expect(first.result.current[0]).toBe(!before)
    first.unmount()
    expect(renderHook(() => useSidebarCollapsed()).result.current[0]).toBe(!before)
  })
})
