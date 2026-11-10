import { useSearchParams } from 'react-router'
import { Icon } from './Icon'
import type { IconName } from './Icon'

export interface TabItem<T extends string = string> {
  id: T
  label: string
  icon?: IconName
  /** A small count or marker after the label ("Snapshot", the number of events). */
  badge?: string | number | undefined
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[]
  active: T
  onChange: (id: T) => void
  /** Accessible name of the tab list. */
  label: string
}

/**
 * The shared tab bar (settings, administration, details): the active tab is the "selection" category - tinted, with the
 * gold indicator underneath. Use {@link useTabParam} to keep the active tab in the address (?tab=...). A bar with more tabs
 * than the window is wide scrolls sideways instead of breaking the page, and the active tab is brought into view. A page
 * with many sections (the master profile) does not use it: it puts its sections into the sidebar (see SidebarNav).
 */
export function Tabs<T extends string>({ tabs, active, onChange, label }: TabsProps<T>) {
  return (
    <div className="border-b border-line">
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              const index = tabs.findIndex((item) => item.id === active)
              const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : null
              if (next === null) return
              event.preventDefault()
              const target = tabs[(next + tabs.length) % tabs.length]
              if (target) {
                onChange(target.id)
                document.getElementById(`tab-${target.id}`)?.focus()
              }
            }}
            ref={selected ? scrollIntoView : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-t-sm border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
              selected ? 'border-indicator bg-select text-select-ink' : 'border-transparent text-ink-muted hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {tab.icon && <Icon name={tab.icon} size={17} />}
            {tab.label}
            {tab.badge !== undefined && <span className="badge badge-neutral">{tab.badge}</span>}
          </button>
        )
      })}
      </div>
    </div>
  )
}

/** Brings the active tab into the visible part of a scrolling bar (nothing happens where the bar fits). */
function scrollIntoView(element: HTMLButtonElement | null) {
  element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

/** The panel that belongs to a tab. */
export function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="pt-6">
      {children}
    </div>
  )
}

/** The active tab from "?tab=", falling back to the first allowed one; changing it replaces the history entry. */
export function useTabParam<T extends string>(allowed: readonly T[]): [T, (id: T) => void] {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const active = allowed.find((id) => id === requested) ?? allowed[0]!
  return [
    active,
    (id) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          next.set('tab', id)
          return next
        },
        { replace: true },
      ),
  ]
}
