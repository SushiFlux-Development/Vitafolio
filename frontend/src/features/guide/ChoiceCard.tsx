import { Icon } from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'

interface ChoiceCardProps {
  /** One choice of several (radio) or one of many that can be combined (checkbox). */
  type: 'radio' | 'checkbox'
  /** Radios of one question share the name; the browser then moves the choice with the arrow keys. */
  name: string
  value: string
  checked: boolean
  onChange: () => void
  label: string
  description?: string | undefined
  /** An icon, or a short text such as "DE" in the tile on the left. */
  icon?: IconName
  tile?: string
  /** Smaller card for a short label (the quick choices of the years). */
  compact?: boolean
}

/**
 * A large choice card for the guide's questions. It is a real radio button or checkbox with a card around it, so the keyboard
 * works the native way (Tab into the group, arrows between radios, Space for a checkbox) and screen readers announce a group
 * of choices. The chosen card is marked by colour, a thicker edge and a tick - never by colour alone.
 */
export function ChoiceCard({ type, name, value, checked, onChange, label, description, icon, tile, compact = false }: ChoiceCardProps) {
  return (
    <label
      className={`group relative flex cursor-pointer gap-3 rounded-md border border-line-strong bg-surface transition-colors hover:bg-surface-2 has-checked:border-indicator has-checked:bg-select has-checked:text-select-ink has-checked:shadow-[inset_3px_0_0_var(--indicator)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus ${
        compact ? 'items-center px-3 py-2.5' : 'items-start p-4'
      }`}
    >
      <input type={type} name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {(icon || tile) && (
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-sm font-bold text-ink group-has-checked:bg-surface group-has-checked:text-select-ink"
        >
          {icon ? <Icon name={icon} size={21} /> : tile}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink group-has-checked:text-select-ink">{label}</span>
        {description && <span className="mt-0.5 block text-sm text-ink-muted group-has-checked:text-select-ink">{description}</span>}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border ${
          checked ? 'border-indicator bg-indicator text-select' : 'border-line-strong text-transparent'
        }`}
      >
        <Icon name="check" size={14} />
      </span>
    </label>
  )
}
