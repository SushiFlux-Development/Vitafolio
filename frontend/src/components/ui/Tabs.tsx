import { useSearchParams } from 'react-router'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { useFitInRow } from './useFitInRow'

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
 * The shared tab bar (settings, administration, details): one connected thin bar in one row, the active tab tinted (the
 * "selection" category) with the gold straight line under its label. When the tabs do not fit at full length the bar becomes a
 * connected vertical list in the same style (useFitInRow) - never cut or scrolled sideways. Use {@link useTabParam} to keep the
 * active tab in the address (?tab=...). A page with many sections (the master profile) does not use it: its sections are the
 * sub-pages of its entry in the sidebar (see SidebarNav).
 */
export function Tabs<T extends string>({ tabs, active, onChange, label }: TabsProps<T>) {
  const bar = useFitInRow<HTMLDivElement>(tabs.map((tab) => `${tab.label}${tab.badge ?? ''}`).join('|'))
  return (
    <div ref={bar} role="tablist" aria-label={label} className="choice-bar">
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
              const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
              const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
              if (!forward && !backward) return
              event.preventDefault()
              const target = tabs[(index + (forward ? 1 : -1) + tabs.length) % tabs.length]
              if (target) {
                onChange(target.id)
                document.getElementById(`tab-${target.id}`)?.focus()
              }
            }}
            className="choice"
          >
            {tab.icon && <Icon name={tab.icon} size={17} />}
            {tab.label}
            {tab.badge !== undefined && <span className="badge badge-neutral">{tab.badge}</span>}
          </button>
        )
      })}
    </div>
  )
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
