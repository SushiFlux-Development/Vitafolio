import { useId } from 'react'
import type { Ref, SelectHTMLAttributes } from 'react'
import { MessageSlot } from './MessageSlot'

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  ref?: Ref<HTMLSelectElement>
  label: string
  hint?: string | undefined
  /** Visually hide the label (it stays the accessible name), for a select inside a toolbar. */
  hideLabel?: boolean
}

/** A labelled single-choice select in the app's input look (same height, border and radius as the text fields). */
export function SelectField({ label, hint, hideLabel = false, className = '', children, ...select }: SelectFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'text-sm font-medium text-ink'}>
        {label}
      </label>
      <select id={id} aria-describedby={hint ? hintId : undefined} className="input" {...select}>
        {children}
      </select>
      {hint && <MessageSlot id={hintId} message={hint} reserve={[hint]} />}
    </div>
  )
}
