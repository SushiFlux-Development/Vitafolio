import type { ChangeEvent, FocusEvent } from 'react'
import { TextAreaField } from './TextAreaField'
import type { TextAreaFieldProps } from './TextAreaField'
import { TextField } from './TextField'
import type { TextFieldProps } from './TextField'
import { useLiveCheck } from './useLiveCheck'
import type { LiveOptions } from './useLiveCheck'

interface LiveTextFieldProps extends Omit<TextFieldProps, 'error' | 'value' | 'onChange' | 'reserve'>, LiveOptions {
  value: string
  onValueChange: (value: string) => void
}

/**
 * A text field with live validation (the app-wide default): a problem shows up as soon as the typed value has one -
 * not after the user leaves the field or presses a button, by which time the whole form is usually filled in and the
 * message is overlooked. A field nobody has typed into stays calm, except after a submit attempt. A problem the user
 * can see right now wins over an older answer of the server.
 *
 * The room under the field is reserved for the longest message the rule or the server can produce, so showing one
 * moves nothing (see TextField "reserve").
 */
export function LiveTextField({ value, onValueChange, check, attempted, serverError, serverKeys, onBlur, ...field }: LiveTextFieldProps) {
  const live = useLiveCheck(value, { check, attempted, serverError, serverKeys })
  return (
    <TextField
      {...field}
      value={value}
      error={live.error}
      reserve={live.reserve}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onValueChange(event.target.value)}
      onBlur={(event: FocusEvent<HTMLInputElement>) => {
        live.settle()
        onBlur?.(event)
      }}
    />
  )
}

interface LiveTextAreaFieldProps extends Omit<TextAreaFieldProps, 'error' | 'value' | 'onChange' | 'reserve'>, LiveOptions {
  value: string
  onValueChange: (value: string) => void
}

/** The multi-line twin of {@link LiveTextField}: same rules, same timing, same reserved room. */
export function LiveTextAreaField({ value, onValueChange, check, attempted, serverError, serverKeys, onBlur, ...field }: LiveTextAreaFieldProps) {
  const live = useLiveCheck(value, { check, attempted, serverError, serverKeys })
  return (
    <TextAreaField
      {...field}
      value={value}
      error={live.error}
      reserve={live.reserve}
      onChange={(event) => onValueChange(event.target.value)}
      onBlur={(event) => {
        live.settle()
        onBlur?.(event)
      }}
    />
  )
}
