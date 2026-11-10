import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, ClipboardEvent, FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useDateFormat } from '../../hooks/useDateFormat'
import { applyDateInput, digitsOfPastedDate, displayOfStored, maskDigits, normalizeStored, separatorOf, storedOfText } from '../../validation/dates'
import type { DateSpec } from '../../validation/dates'
import { dateCheck } from '../../validation/rules'
import { TextField } from './TextField'
import type { TextFieldProps } from './TextField'
import { useLiveCheck } from './useLiveCheck'

interface DateFieldProps extends Omit<TextFieldProps, 'error' | 'value' | 'onChange' | 'reserve' | 'inputMode' | 'placeholder' | 'required' | 'ref'> {
  /** What the form stores: ISO text (`YYYY-MM-DD`, `YYYY-MM`, `YYYY`), empty, or - when somebody is half way through or the value is an old one - the text as it is. */
  value: string
  onValueChange: (stored: string) => void
  /** Whether a whole day or a month is asked for, whether it is required and which years are allowed. */
  spec: DateSpec
  /** A submit was tried: every problem is shown. */
  attempted?: boolean
  serverError?: string | undefined
  /** Translation keys of messages that can be shown through `serverError`, so their room is reserved up front. */
  serverKeys?: readonly string[]
}

/**
 * The one field for every date in the app (live validation like LiveTextField, same reserved room for messages). The user types
 * digits only: the separators of the chosen date format (Settings > Appearance) appear by themselves, so `23041990` becomes
 * `23.04.1990`. The form still holds ISO text; the typed text turns into it as soon as it is a finished, existing date.
 * Until then - and for an old value that fits no pattern - the form holds the text as typed, so nothing is ever lost, and the
 * field shows it as a problem instead of cleaning it up.
 *
 * Editing works anywhere in the text (the caret stays behind its digit), deleting a separator deletes the digit before it,
 * and a pasted date in any of the three notations is taken over in the active one.
 */
export function DateField({ value, onValueChange, spec, attempted, serverError, serverKeys, onBlur, ...field }: DateFieldProps) {
  const { t } = useTranslation()
  const { format } = useDateFormat()
  const check = useMemo(() => dateCheck(spec, format), [spec, format])

  // The shown text is local (a half-typed date is no ISO text); it is derived again whenever the form's value changes from
  // outside (another entry opened, a quick fill, the form reset) or the format changes.
  const [shown, setShown] = useState(() => ({ text: displayOfStored(value, format, spec.kind), sent: value, format }))
  let current = shown
  if (value !== shown.sent || format !== shown.format) {
    current = { text: displayOfStored(value, format, spec.kind), sent: value, format }
    setShown(current)
  }

  // An old value that is a finished date in another notation ("23.04.1990") is turned into ISO text right away.
  useEffect(() => {
    const normalized = normalizeStored(value, format, spec)
    if (normalized !== value) onValueChange(normalized)
    // The callback is a fresh function on every render; only a changed value (or format) can need normalising.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, format, spec.kind])

  const live = useLiveCheck(current.text, { check, attempted, serverError, ...(serverKeys ? { serverKeys } : {}) })

  const commit = (input: HTMLInputElement, text: string, caret: number) => {
    // The mask has the last word on the text and the caret; React then finds the input already showing it.
    if (input.value !== text) input.value = text
    input.setSelectionRange(caret, caret)
    const stored = storedOfText(text, format, spec)
    setShown({ text, sent: stored, format })
    if (stored !== current.sent) onValueChange(stored)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const inputType = event.nativeEvent instanceof InputEvent ? event.nativeEvent.inputType : undefined
    const result = applyDateInput({ previous: current.text, raw: input.value, caret: input.selectionStart ?? input.value.length, inputType, format, kind: spec.kind })
    commit(input, result.text, result.caret)
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const digits = digitsOfPastedDate(event.clipboardData.getData('text'), format, spec.kind)
    if (digits === null) return // not a whole date: the pasted text goes through the normal edit (digits only)
    event.preventDefault()
    const text = maskDigits(digits, format, spec.kind)
    commit(event.currentTarget, text, text.length)
  }

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    live.settle()
    // A year alone waits for a month behind its separator ("2024-"); leaving the field takes the separator away.
    if (current.text.endsWith(separatorOf(format)) && check(current.text, { settled: true }) === undefined) {
      setShown({ ...current, text: current.text.slice(0, -1) })
    }
    onBlur?.(event)
  }

  return (
    <TextField
      {...field}
      required={spec.required === true}
      value={current.text}
      error={live.error}
      reserve={live.reserve}
      placeholder={t(`dates.placeholder.${spec.kind}.${format}`)}
      inputMode="numeric"
      autoComplete="off"
      onChange={handleChange}
      onPaste={handlePaste}
      onBlur={handleBlur}
    />
  )
}
