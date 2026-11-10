import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'

/**
 * Sub-navigation in the sidebar. A page with many sections (the master profile has nine) hands them to the sidebar instead of
 * drawing a tab bar of its own: while the page is open, the sidebar swaps its main navigation for these sections, with an
 * entry "back" on top that leaves to the page visited before. User area, theme switch and footer of the sidebar stay as they are.
 *
 * A page only calls {@link useSidebarNav}; the shell renders the result ({@link SidebarNavArea}). Every section is a real link
 * to an address of the page (usually "?tab=..."), so reload, "open in a new tab" and the browser's back button keep working.
 */
export interface SidebarNavItem {
  id: string
  label: string
  icon: IconName
  /** Where the entry leads, relative to the page (for example "?tab=skills"). */
  to: string
}

export interface SidebarNavSection {
  /** Accessible name of the list of sections. */
  label: string
  /** Text of the first entry, which leaves the section. */
  backLabel: string
  items: readonly SidebarNavItem[]
  /** The section being shown; null when the page shows none of them (a different view of the page). */
  activeId: string | null
}

/** Look of one entry of the sidebar (main navigation and sub-navigation share it, so they cannot drift apart). */
export function navItemClass(active: boolean): string {
  return `flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-semibold transition-colors ${
    active ? 'bg-select text-select-ink shadow-[inset_3px_0_0_var(--indicator)]' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
  }`
}

/**
 * The scrolling list of the sidebar: only this part scrolls when the window is too low, never the whole sidebar, so the user
 * area below stays in view. The vertical padding leaves room for the focus ring of the first and last entry.
 */
export const NAV_LIST_CLASS = 'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 py-1 [scrollbar-width:thin]'

interface Current {
  section: SidebarNavSection | null
  /** The page "back" leads to, and its name for the tooltip. */
  backTo: string
  backTitle: string
}

const SetSectionContext = createContext<((section: SidebarNavSection | null) => void) | null>(null)
const CurrentContext = createContext<Current>({ section: null, backTo: '/', backTitle: '' })

const STORAGE_KEY = 'cv.previousPage'

/** Only addresses inside the app are taken from the storage. */
function isInternal(address: string | null): address is string {
  return address !== null && address.startsWith('/') && !address.startsWith('//')
}

function readPrevious(): string | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    return isInternal(stored) ? stored : null
  } catch {
    return null
  }
}

function writePrevious(address: string | null) {
  try {
    if (address === null) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, address)
  } catch {
    // Without storage "back" simply forgets the page across a reload and leads to the overview.
  }
}

interface ProviderProps {
  children: ReactNode
  /** Name of the page at an address, for the tooltip of "back" ("Back to Cover letters"). */
  titleOf: (pathname: string) => string
}

/**
 * Holds the section the open page registered, and remembers the page visited before the current one (another path, not just
 * another "?tab="), also across a reload of the tab. Place it around the sidebar and the page outlet.
 */
export function SidebarNavProvider({ children, titleOf }: ProviderProps) {
  const location = useLocation()
  const [section, setSection] = useState<SidebarNavSection | null>(null)
  const [seen, setSeen] = useState(() => ({ pathname: location.pathname, search: location.search, previous: readPrevious() }))

  // The previous page is the last address with another path; switching a section only changes the search part.
  if (seen.pathname !== location.pathname) {
    setSeen({ pathname: location.pathname, search: location.search, previous: `${seen.pathname}${seen.search}` })
  } else if (seen.search !== location.search) {
    setSeen({ ...seen, search: location.search })
  }

  useEffect(() => writePrevious(seen.previous), [seen.previous])

  const current = useMemo<Current>(() => {
    const previousPath = seen.previous?.split(/[?#]/)[0]
    // An address from before a reload can be the page itself; then there is nothing to go back to but the overview.
    const backTo = seen.previous !== null && previousPath !== seen.pathname ? seen.previous : '/'
    return { section, backTo, backTitle: titleOf(backTo.split(/[?#]/)[0] ?? '/') }
  }, [section, seen, titleOf])

  return (
    <SetSectionContext.Provider value={setSection}>
      <CurrentContext.Provider value={current}>{children}</CurrentContext.Provider>
    </SetSectionContext.Provider>
  )
}

/**
 * Puts the sections of the calling page into the sidebar for as long as the page is open. Pass a memoised object (it is
 * registered again whenever it changes); `null` shows the normal navigation. Without a shell around (a component test) it does nothing.
 */
export function useSidebarNav(section: SidebarNavSection | null): void {
  const register = useContext(SetSectionContext)
  useEffect(() => {
    if (!register) return
    register(section)
    return () => register(null)
  }, [register, section])
}

interface AreaProps {
  /** The main navigation (a `<nav>` that uses {@link NAV_LIST_CLASS}). */
  main: ReactNode
  /** Shown below the sections of a sub-navigation, as it is below the main navigation (the update hint). */
  trailing?: ReactNode
}

/** The list part of the sidebar: the main navigation, or - while a page has registered sections - the sub-navigation. */
export function SidebarNavArea({ main, trailing }: AreaProps) {
  const { section } = useContext(CurrentContext)
  const reduce = useReducedMotion() ?? false
  // A quiet slide in the direction of travel: into the page's sections from the right, back to the main navigation from the left.
  const shift = reduce ? 0 : 12
  const enter = { duration: reduce ? 0 : 0.16, ease: 'easeOut' } as const
  const leave = { duration: reduce ? 0 : 0.08 } as const

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AnimatePresence mode="wait" initial={false}>
        {section ? (
          <motion.div
            key="sub"
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, x: shift }}
            animate={{ opacity: 1, x: 0, transition: enter }}
            exit={{ opacity: 0, transition: leave }}
          >
            <SubNav section={section} trailing={trailing} />
          </motion.div>
        ) : (
          <motion.div
            key="main"
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, x: -shift }}
            animate={{ opacity: 1, x: 0, transition: enter }}
            exit={{ opacity: 0, transition: leave }}
          >
            {main}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function SubNav({ section, trailing }: { section: SidebarNavSection; trailing: ReactNode }) {
  const { t } = useTranslation()
  const { backTo, backTitle } = useContext(CurrentContext)

  return (
    <>
      <div className="shrink-0 px-3 pb-3">
        <Link to={backTo} className={navItemClass(false)} title={t('nav.backTo', { page: backTitle })} data-testid="sidebar-back">
          <Icon name="chevronLeft" size={19} />
          <span className="flex-1">{section.backLabel}</span>
        </Link>
      </div>
      <nav aria-label={section.label} className={`${NAV_LIST_CLASS} border-t border-line pt-3`} data-hint="sidebar-sections">
        {section.items.map((item) => {
          const active = item.id === section.activeId
          return (
            <Link
              key={item.id}
              to={item.to}
              // Switching the section is not a step in the history: the browser's back button leaves the page, as it did with tabs.
              replace
              aria-current={active ? 'page' : undefined}
              ref={active ? scrollIntoView : undefined}
              className={navItemClass(active)}
            >
              <Icon name={item.icon} size={19} className="shrink-0" />
              <span className="min-w-0 flex-1">{item.label}</span>
            </Link>
          )
        })}
        {trailing}
      </nav>
    </>
  )
}

/** Brings the active entry into view when the list is too long for the window (nothing happens where it fits). */
function scrollIntoView(element: HTMLAnchorElement | null) {
  element?.scrollIntoView?.({ block: 'nearest' })
}
