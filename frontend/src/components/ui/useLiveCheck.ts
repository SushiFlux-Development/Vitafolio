import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Check } from '../../validation/rules'

export interface LiveOptions {
  /** The rule for this field; it is evaluated on every keystroke. */
  check: Check
  /** A submit was tried: every problem is shown, also in fields the user never touched. */
  attempted?: boolean
  /** The server's answer to the last submit for this field (taken name, wrong code, ...). */
  serverError?: string | undefined
  /** Translation keys of the answers the server can give for this field, so their room is reserved up front. */
  serverKeys?: readonly string[]
}

/**
 * The live-validation state of one field: the problem to show (or the server's answer), the texts to reserve room for, and
 * the blur handler that settles half-finished values. Shared by the single-line, the multi-line and the date field.
 */
export function useLiveCheck(value: string, { check, attempted = false, serverError, serverKeys = [] }: LiveOptions) {
  const { t } = useTranslation()
  const [touched, setTouched] = useState(false)
  const [left, setLeft] = useState(false)

  const problem = check(value, { settled: attempted || left })
  // "Touched" is derived while rendering: the first typed character is enough, and clearing the field again keeps it
  // touched, so a field emptied by the user says "required" instead of silently going back to neutral.
  const show = touched || value !== '' || attempted
  if (!touched && value !== '') setTouched(true)
  const liveError = problem && show ? t(problem.key, problem.values ?? {}) : undefined
  const reserve = [...check.problems.map((possible) => t(possible.key, possible.values ?? {})), ...serverKeys.map((key) => t(key))]
  return { error: liveError ?? serverError, reserve, settle: () => setLeft(true) }
}
