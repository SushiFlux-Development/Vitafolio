import { useId } from 'react'
import type { Ref, TextareaHTMLAttributes } from 'react'
import { MessageSlot } from './MessageSlot'
import { REQUIRED_MARK } from './TextField'

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  ref?: Ref<HTMLTextAreaElement>
  label: string
  error?: string | undefined
  hint?: string | undefined
  /** Texts that can show up under the field besides the hint; the room is sized for the longest (see TextField). */
  reserve?: readonly string[]
  /** Classes for the textarea itself (monospace for code); "className" styles the whole field. */
  inputClassName?: string
}

/** A labelled multi-line field with the same label, message slot and reserved room as {@link TextField}. */
export function TextAreaField({ label, error, hint, reserve, required, className = '', inputClassName = '', rows = 4, ...area }: TextAreaFieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error ?? hint
  const reserved = [...(hint ? [hint] : []), ...(reserve ?? [])]

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={`text-sm font-medium text-ink ${required ? REQUIRED_MARK : ''}`}>
        {label}
      </label>
      <textarea
        id={id}
        required={required}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`input resize-y leading-relaxed ${inputClassName}`}
        {...area}
      />
      <MessageSlot id={messageId} message={message} danger={Boolean(error)} reserve={reserved} />
    </div>
  )
}
