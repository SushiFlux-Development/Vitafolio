import { useTranslation } from 'react-i18next'
import { useDateFormat } from '../../hooks/useDateFormat'
import { autoSaveView } from '../../hooks/useAutoSave'
import type { AutoSaveSnapshot } from '../../hooks/useAutoSave'
import { useErrorDialog } from './ErrorDialog'
import { CardMark, markRoom } from './CardMark'
import type { CardMarkValue } from './CardMark'

interface AutoSaveStatusProps {
  state: AutoSaveSnapshot<unknown>
  /** Title of the error dialog the "Show error" button opens (what could not be saved). */
  failureTitle: string
  /** What stops the input from being sent while it is blocked, and every text that can be (their room is reserved). */
  blocked: { text: string; all: readonly string[] }
  /** When input from the local copy was put back (milliseconds since 1970); shown instead of "Saved" until the next change. */
  restoredAt?: number | null
  /** What the server has is itself incomplete (a new profile without a name): say what is missing instead of "Saved". */
  incomplete?: boolean
  align?: 'start' | 'end'
}

/**
 * The one status line of a form that saves by itself, in the place of the save button: quietly "Saved" at rest, "Saving ..." only
 * when it takes a moment, and in plain words what is wrong otherwise - never a dialog that jumps up while typing. A failure
 * offers the complete, copyable error behind a button. The room of the longest text of the active language is reserved.
 */
export function AutoSaveStatus({ state, failureTitle, blocked, restoredAt = null, incomplete = false, align = 'end' }: AutoSaveStatusProps) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  const showError = useErrorDialog()

  const details = { label: t('autoSave.showError'), onClick: () => showError(state.failure?.error, failureTitle) }
  const restored = (when: number | string) => t('autoSave.restored', { time: typeof when === 'number' ? dates.dateTime(new Date(when).toISOString()) : when })

  const view = autoSaveView(state, incomplete)
  const marks: Record<typeof view, CardMarkValue> = {
    saved: restoredAt === null ? { tone: 'success', text: t('autoSave.saved') } : { tone: 'success', text: restored(restoredAt) },
    saving: { tone: 'neutral', text: t('autoSave.saving') },
    blocked: { tone: 'warning', text: blocked.text },
    retrying: { tone: 'warning', text: t('autoSave.retrying'), action: details },
    rejected: { tone: 'danger', text: t('autoSave.rejected'), action: details },
    signedOut: { tone: 'danger', text: t('autoSave.signedOut'), action: details },
  }

  const reserve = [
    t('autoSave.saved'),
    t('autoSave.saving'),
    ...blocked.all,
    markRoom({ text: t('autoSave.retrying'), action: details }),
    markRoom({ text: t('autoSave.rejected'), action: details }),
    markRoom({ text: t('autoSave.signedOut'), action: details }),
    // The longest date with time that can appear.
    restored('88.88.8888, 88:88'),
  ]

  return <CardMark mark={marks[view]} reserve={reserve} align={align} />
}
