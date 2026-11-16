import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { FocusEvent, PointerEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import type { TipHandlers } from '../ui/Segmented'

/**
 * The sidebar is one tree: every section of the app is a row with icon and name. A page with sub-pages of its own (the master
 * profile has nine) hands them to the sidebar with {@link useSidebarNav}; while that page is open its row unfolds them beneath
 * it, indented on a thin guide line. Every sub-page is a real link to an address of the page (usually "?tab=..."), so reload,
 * "open in a new tab" and the browser's back button keep working.
 *
 * The sidebar can be collapsed to a slim icon rail (remembered per browser, {@link useSidebarCollapsed}); in the rail the names
 * move into our own tooltip ({@link useSidebarRail}).
 */
export interface SidebarNavItem {
  id: string
  label: string
  /** Where the entry leads, relative to the page (for example "?tab=skills"). */
  to: string
}

export interface SidebarNavSection {
  /** Accessible name of the list of sub-pages. */
  label: string
  items: readonly SidebarNavItem[]
  /** The sub-page being shown; null when the page shows none of them (a different view of the page). */
  activeId: string | null
}

const SetSectionContext = createContext<((section: SidebarNavSection | null) => void) | null>(null)
const SectionContext = createContext<SidebarNavSection | null>(null)

/** Holds the sub-pages the open page registered. Place it around the sidebar and the page outlet. */
export function SidebarNavProvider({ children }: { children: ReactNode }) {
  const [section, setSection] = useState<SidebarNavSection | null>(null)
  return (
    <SetSectionContext.Provider value={setSection}>
      <SectionContext.Provider value={section}>{children}</SectionContext.Provider>
    </SetSectionContext.Provider>
  )
}

/**
 * Puts the sub-pages of the calling page under its row of the sidebar for as long as the page is open. Pass a memoised object
 * (it is registered again whenever it changes); `null` shows none. Without a shell around (a component test) it does nothing.
 */
export function useSidebarNav(section: SidebarNavSection | null): void {
  const register = useContext(SetSectionContext)
  useEffect(() => {
    if (!register) return
    register(section)
    return () => register(null)
  }, [register, section])
}

/** The sub-pages registered by the open page, for the shell. */
export function useSidebarSection(): SidebarNavSection | null {
  return useContext(SectionContext)
}

// ---------------------------------------------------------------------------------------------------------------- collapsed

const COLLAPSED_KEY = 'cv.sidebarCollapsed'
/** Used when the browser refuses the storage: the choice then lasts as long as the page. */
let memoryCollapsed = false

function readCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY)
    return stored === null ? memoryCollapsed : stored === '1'
  } catch {
    return memoryCollapsed
  }
}

function writeCollapsed(value: boolean) {
  memoryCollapsed = value
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0')
  } catch {
    // Kept in memory only (see memoryCollapsed).
  }
}

/** Whether the sidebar is folded into the icon rail, remembered per browser. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggle = useCallback(() => {
    setCollapsed((was) => {
      writeCollapsed(!was)
      return !was
    })
  }, [])
  return [collapsed, toggle]
}

// ---------------------------------------------------------------------------------------------------------------- rail and tips

interface RailValue {
  /** The sidebar is the slim icon rail: names are only in the tooltip (and the accessible name). */
  rail: boolean
  /**
   * Handlers that show `text` in our own tooltip beside the element. By default only in the rail (where the name is not shown);
   * `always` for an icon-only control that has no visible name in either state.
   */
  tip: (text: string, always?: boolean) => TipHandlers
  /** Hides the tooltip (the list scrolled, the sidebar changed its width). */
  hideTip: () => void
}

const RailContext = createContext<RailValue>({ rail: false, tip: () => ({}), hideTip: () => undefined })

export function useSidebarRail(): RailValue {
  return useContext(RailContext)
}

/**
 * Provides the rail state and draws the one tooltip of the sidebar: a fixed panel to the right of the element, so the scrolling
 * list never clips it. It shows on pointer hover and on keyboard focus, never as a browser title. The element keeps its own
 * accessible name, so the tooltip itself is hidden from screen readers.
 */
export function SidebarRailProvider({ rail, children }: { rail: boolean; children: ReactNode }) {
  const [shown, setShown] = useState<{ text: string; top: number; left: number } | null>(null)
  const hideTip = useCallback(() => setShown(null), [])

  const value = useMemo<RailValue>(() => {
    const show = (element: HTMLElement, text: string) => {
      const box = element.getBoundingClientRect()
      setShown({ text, top: box.top + box.height / 2, left: box.right + 10 })
    }
    const tip = (text: string, always = false): TipHandlers => {
      if (!rail && !always) return {}
      return {
        onPointerEnter: (event: PointerEvent<HTMLElement>) => show(event.currentTarget, text),
        onPointerLeave: hideTip,
        onFocus: (event: FocusEvent<HTMLElement>) => {
          if (event.currentTarget.matches(':focus-visible')) show(event.currentTarget, text)
        },
        onBlur: hideTip,
      }
    }
    return { rail, tip, hideTip }
  }, [rail, hideTip])

  return (
    <RailContext.Provider value={value}>
      {children}
      {shown && (
        <div className="rail-tip" style={{ top: shown.top, left: shown.left }} aria-hidden="true" data-testid="sidebar-tip">
          {shown.text}
        </div>
      )}
    </RailContext.Provider>
  )
}

// ---------------------------------------------------------------------------------------------------------------- rows

interface TreeLinkProps {
  to: string
  icon: IconName
  label: string
  /** This row is the page being shown (it carries the straight line). */
  current: boolean
  /** The page being shown is inside this section (its sub-pages are open). */
  inside?: boolean
  /** The section has sub-pages: true / false = unfolded or not; undefined = none. */
  expanded?: boolean | undefined
  hint?: string
  testId?: string
}

/** A section of the tree: icon and name, a chevron when it has sub-pages. In the rail only the icon stays. */
export function TreeLink({ to, icon, label, current, inside = false, expanded, hint, testId }: TreeLinkProps) {
  const { rail, tip } = useSidebarRail()
  return (
    <Link
      to={to}
      className="tree-row"
      aria-current={current ? 'page' : undefined}
      aria-expanded={expanded !== undefined && !rail ? expanded : undefined}
      data-inside={inside && !current ? 'true' : undefined}
      data-hint={hint}
      data-testid={testId}
      {...tip(label)}
    >
      <Icon name={icon} size={20} className="shrink-0" />
      <span className={rail ? 'sr-only' : 'min-w-0 flex-1'}>{label}</span>
      {expanded !== undefined && !rail && (
        <span className="tree-chevron" aria-hidden="true">
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={18} />
        </span>
      )}
    </Link>
  )
}

interface TreeButtonProps {
  icon: IconName
  label: string
  onClick: () => void
  /** Colour class of the icon (the AI entry keeps its highlight colour). */
  iconClassName?: string
  hint?: string
  testId?: string
}

/** A row of the tree that opens something instead of a page (the manual, the AI settings, the hints). */
export function TreeButton({ icon, label, onClick, iconClassName = '', hint, testId }: TreeButtonProps) {
  const { rail, tip } = useSidebarRail()
  return (
    <button type="button" className="tree-row" onClick={onClick} data-hint={hint} data-testid={testId} {...tip(label)}>
      <Icon name={icon} size={20} className={`shrink-0 ${iconClassName}`} />
      <span className={rail ? 'sr-only' : 'min-w-0 flex-1'}>{label}</span>
    </button>
  )
}

/** The sub-pages of the open section, indented on a 1px guide line. Never in the rail. */
export function TreeSubs({ section }: { section: SidebarNavSection }) {
  return (
    <nav aria-label={section.label} className="tree-subs" data-hint="sidebar-sections">
      {section.items.map((item) => {
        const active = item.id === section.activeId
        return (
          <Link
            key={item.id}
            to={item.to}
            // Switching the sub-page is not a step in the history: the browser's back button leaves the page, as it did with tabs.
            replace
            aria-current={active ? 'page' : undefined}
            ref={active ? scrollIntoView : undefined}
            className="tree-sub"
          >
            <span className="min-w-0 flex-1">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

/** Brings the active entry into view when the list is too long for the window (nothing happens where it fits). */
function scrollIntoView(element: HTMLAnchorElement | null) {
  element?.scrollIntoView?.({ block: 'nearest' })
}
