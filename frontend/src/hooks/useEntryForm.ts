import { useState } from 'react'

/**
 * The state of an "add / edit entry" dialog: the form values, whether it is open, whether a save was tried (every required
 * field then shows its problem) and whether anything differs from what the dialog opened with (closing then asks first).
 * The values stay while the dialog fades out, so its content does not vanish mid-animation.
 */
export function useEntryForm<T extends object>() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<T | null>(null)
  const [initial, setInitial] = useState('')
  const [attempted, setAttempted] = useState(false)

  return {
    open,
    form,
    attempted,
    /** True when something differs from what the dialog opened with. */
    dirty: form !== null && JSON.stringify(form) !== initial,
    start(value: T) {
      setForm(value)
      setInitial(JSON.stringify(value))
      setAttempted(false)
      setOpen(true)
    },
    close: () => setOpen(false),
    patch: (changes: Partial<T>) => setForm((current) => (current ? { ...current, ...changes } : current)),
    markAttempted: () => setAttempted(true),
  }
}
