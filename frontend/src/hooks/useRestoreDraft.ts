import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirmChoice } from '../components/ui/ConfirmDialog'
import { decideRestore, readDraft, removeDraft } from './draftStore'
import { useDateFormat } from './useDateFormat'

interface RestoreDraftOptions<T> {
  /** The storage key of the form's copy; null = there is no local copy (no account, isolated test). */
  key: string | null
  /** The server's data is known, so the copy can be compared with it. */
  ready: boolean
  /** Turns the parsed JSON of a copy into a value of the right shape, or refuses it. */
  accept: (raw: unknown) => T | null
  /** What the server has now, and the state marker it is based on (same kind as the one stored with the copy). */
  server: { value: T; base: string }
  /** What the server would store of a value (trimmed text ...): a copy that only differs in that counts as saved already. */
  normalize: (value: T) => unknown
  /** Put the input back into the form and save it. */
  onRestore: (value: T, savedAt: number) => void
}

/**
 * Looks once, when a form opens, whether a local copy of unsaved input exists (the last save failed, the tab was closed ...):
 * - the server has the same: the copy is removed;
 * - the server did not change since the copy was made: the input is taken over (and saved);
 * - the server changed meanwhile (another device): our own dialog asks which of the two to keep. "Keep the server's state" removes
 *   the copy; closing the dialog without an answer leaves it for the next opening.
 */
export function useRestoreDraft<T>(options: RestoreDraftOptions<T>): void {
  const { t } = useTranslation()
  const confirm = useConfirmChoice()
  const dates = useDateFormat()
  const handled = useRef<string | null>(null)
  const latest = useRef({ options, confirm, t, dates })
  useEffect(() => {
    latest.current = { options, confirm, t, dates }
  })

  const { key, ready } = options
  useEffect(() => {
    if (!key || !ready || handled.current === key) return
    handled.current = key
    const { options: o, confirm: ask, t: translate, dates: format } = latest.current
    const draft = readDraft(key, o.accept)
    const decision = decideRestore(draft, o.server, o.normalize)
    if (decision.kind === 'none') {
      removeDraft(key)
      return
    }
    if (decision.kind === 'apply') {
      o.onRestore(decision.draft.value, decision.draft.savedAt)
      return
    }
    const time = format.dateTime(new Date(decision.draft.savedAt).toISOString())
    void ask({
      title: translate('autoSave.restore.askTitle', { time }),
      message: translate('autoSave.restore.askMessage', { time }),
      confirmLabel: translate('autoSave.restore.take'),
      cancelLabel: translate('autoSave.restore.drop'),
    }).then((choice) => {
      if (choice === 'confirm') latest.current.options.onRestore(decision.draft.value, decision.draft.savedAt)
      // Only the button removes the copy. Esc or a click beside the dialog means "not now": the form shows the server's state, the
      // copy stays and is asked about again the next time. The copy is only replaced when the user types (that is the decision).
      else if (choice === 'cancel') removeDraft(key)
    })
  }, [key, ready])
}
