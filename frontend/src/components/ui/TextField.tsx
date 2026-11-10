import { useId } from 'react'
import type { InputHTMLAttributes, Ref } from 'react'
import { MessageSlot } from './MessageSlot'

/** The asterisk after the label of a required field - drawn by CSS, so it is no part of the label's text (the accessible name stays clean). */
export const REQUIRED_MARK = "after:ml-1 after:text-danger after:content-['*']"

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>
  /** Classes for the input itself (e.g. monospace for codes); "className" styles the whole field with label and hint. */
  inputClassName?: string
  label: string
  error?: string | undefined
  hint?: string | undefined
  /**
   * Every text that can show up under this field besides the hint. The room under the field is sized for the longest
   * of them (and of the hint) once and for all: a message appearing, changing or disappearing must never push the
   * fields below it, resize the card or move the page (the layout stays rigid). Without it, a message that can appear
   * later takes room only when it shows, and everything below jumps.
   */
  reserve?: readonly string[]
}

export function TextField({ label, error, hint, reserve, required, className = '', inputClassName = '', ...input }: TextFieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error ?? hint
  const reserved = [...(hint ? [hint] : []), ...(reserve ?? [])]

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={`text-sm font-medium text-ink ${required ? REQUIRED_MARK : ''}`}>
        {label}
      </label>
      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={`input ${inputClassName}`}
        {...input}
      />
      <MessageSlot id={messageId} message={message} danger={Boolean(error)} reserve={reserved} />
    </div>
  )
}
