import type { FocusEventHandler, KeyboardEvent, PointerEventHandler } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'
import { useFitInRow } from './useFitInRow'

interface Option<T extends string> {
  value: T
  label: string
  icon?: IconName
}

/** Handlers that show an own tooltip for an icon-only option (the sidebar's rail); without them the label is the browser's title. */
export interface TipHandlers {
  onPointerEnter?: PointerEventHandler<HTMLElement>
  onPointerLeave?: PointerEventHandler<HTMLElement>
  onFocus?: FocusEventHandler<HTMLElement>
  onBlur?: FocusEventHandler<HTMLElement>
}

interface SegmentedProps<T extends string> {
  options: readonly Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  /** Icons only (the label stays as the accessible name and tooltip), segments share the full width. */
  compact?: boolean
  disabled?: boolean
  /** Own tooltip for the icon-only options of a compact bar. */
  tip?: (label: string) => TipHandlers
}

/**
 * A short single-choice control (theme, language): one connected thin bar in one row, the chosen segment tinted with a straight
 * line under its label. When the options do not fit at full length it becomes a connected vertical list (useFitInRow). It
 * behaves like a native radio group: Tab reaches only the chosen segment, the arrow keys move the choice (and the focus) to the
 * neighbour, wrapping around.
 */
export function Segmented<T extends string>({ options, value, onChange, label, compact = false, disabled = false, tip }: SegmentedProps<T>) {
  const group = useFitInRow<HTMLDivElement>(options.map((option) => option.label).join('|'))

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0 || disabled) return
    event.preventDefault()
    const index = options.findIndex((option) => option.value === value)
    const nextIndex = (index + step + options.length) % options.length
    const next = options[nextIndex]
    if (!next) return
    onChange(next.value)
    // The newly chosen segment takes the focus along; it exists already, only its tab stop changes.
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex]?.focus()
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className="choice-bar"
      data-inline={compact ? undefined : 'true'}
      data-compact={compact ? 'true' : undefined}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            tabIndex={selected ? 0 : -1}
            aria-checked={selected}
            aria-label={compact ? option.label : undefined}
            title={compact && !tip ? option.label : undefined}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className="choice"
            {...(compact && tip ? tip(option.label) : {})}
          >
            {option.icon && <Icon name={option.icon} size={16} />}
            {!compact && option.label}
          </button>
        )
      })}
    </div>
  )
}
