import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Icon } from './Icon'
import type { IconName } from './Icon'

interface Option<T extends string> {
  value: T
  label: string
  icon?: IconName
}

interface SegmentedProps<T extends string> {
  options: readonly Option<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  /** Icons only (the label stays as the accessible name and tooltip), segments share the full width. */
  compact?: boolean
  disabled?: boolean
}

/**
 * A short single-choice control (theme, language); the chosen segment is the "selection" category, like the tabs. It behaves
 * like a native radio group: Tab reaches only the chosen segment, the arrow keys move the choice (and the focus) to the
 * neighbour, wrapping around.
 */
export function Segmented<T extends string>({ options, value, onChange, label, compact = false, disabled = false }: SegmentedProps<T>) {
  const group = useRef<HTMLDivElement>(null)

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
      className={`rounded-sm border border-line-strong bg-surface p-0.5 ${compact ? 'flex' : 'inline-flex'}`}
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
            title={compact ? option.label : undefined}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`flex min-h-8 items-center justify-center gap-2 rounded-xs px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${compact ? 'flex-1' : ''} ${
              selected ? 'bg-select text-select-ink shadow-[inset_0_-2px_0_var(--indicator)]' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {option.icon && <Icon name={option.icon} size={16} />}
            {!compact && option.label}
          </button>
        )
      })}
    </div>
  )
}
