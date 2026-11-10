import type { ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { ErrorNotice } from './Notice'

interface AlertSlotProps {
  /** Normal answers that are not failures ("saved"); shown in the slot's own room. */
  children?: ReactNode
  /**
   * Every failure answer this place shows in normal operation (already translated, see `reserveFor`). The slot is sized
   * for the tallest of them at the current width and language, so an alert appearing, changing or going away moves
   * nothing. These are texts of an {@link ErrorNotice}, so they include its Copy footer.
   */
  reserve?: readonly string[]
  /** Texts of one-line notices without a footer ("saved", hints) that also take room in the slot. */
  reservePlain?: readonly string[]
  /** For slots whose whole `reserve` is footer-less notices (hints, results). Same as listing them in `reservePlain`. */
  plain?: boolean
  /**
   * The failure of the last action (or null). If its code is one of `normalCodes` it is shown in the slot (the room is
   * reserved); every other failure is a rare technical one and is laid over the content below the slot, so nothing
   * moves and no gap stands empty in every form for something that almost never happens.
   */
  error?: unknown
  /** What was being done ("Konto konnte nicht angelegt werden"), shown before the reason. */
  errorTitle?: string
  /** Codes of `error` that belong to the normal flow. */
  normalCodes?: readonly string[]
  /** Closes the laid-over failure (it keeps covering content until then). Required in practice whenever `error` is used. */
  onDismiss?: () => void
  /**
   * Which way the laid-over failure grows from the slot: down over the content below (pages) or up over the content above
   * (dialogs, whose scrolling body would otherwise get longer and move, and hide the failure below its fold).
   */
  grow?: 'down' | 'up'
}

/** Whether this failure is an answer of the normal flow (reserved in the slot) rather than a rare technical one. */
export function isNormalAnswer(error: unknown, normalCodes: readonly string[]): boolean {
  return error instanceof ApiError && error.code !== undefined && normalCodes.includes(error.code)
}

/**
 * The fixed place for a form's answer (a failed submit, "saved"). Put it where the answer belongs (usually below the
 * buttons) and keep it there.
 *
 * Normal answers take reserved room. Rare technical failures take none: they are laid over the content under the slot,
 * complete (wrapping, selectable, with Copy), and go away with their Close button. The layer scrolls itself if it is
 * taller than half the window, so it can never run out of it.
 *
 * Only for answers inside a form. Replacing a whole screen (the next sign-in step, a dialog) is a deliberate change
 * of content, not a message.
 */
export function AlertSlot({ children, reserve = [], reservePlain = [], plain = false, error = null, errorTitle, normalCodes = [], onDismiss, grow = 'down' }: AlertSlotProps) {
  const failed = error !== null && error !== undefined
  const normal = failed && isNormalAnswer(error, normalCodes)
  const rare = failed && !normal
  const footerless = plain ? [...reserve, ...reservePlain] : reservePlain
  const withFooter = plain ? [] : reserve

  return (
    // One grid cell holds the real notice and an invisible copy of every possible one, drawn with the notice's own box
    // metrics from a data attribute - so they take room but are no text in the page.
    <div className="relative grid">
      <div className="col-start-1 row-start-1">
        {children}
        {normal && <ErrorNotice error={error} {...(errorTitle ? { title: errorTitle } : {})} />}
      </div>
      {withFooter.map((text, index) => (
        <div key={`f${index}`} aria-hidden="true" data-reserved={text} className="notice-reserve pointer-events-none invisible col-start-1 row-start-1 select-none" />
      ))}
      {footerless.map((text, index) => (
        <div key={`p${index}`} aria-hidden="true" data-reserved={text} className="notice-reserve-plain pointer-events-none invisible col-start-1 row-start-1 select-none" />
      ))}
      {rare && (
        <div className={`absolute inset-x-0 ${grow === 'up' ? 'bottom-0' : 'top-0'} z-30 max-h-[min(24rem,60vh)] overflow-y-auto rounded-sm bg-surface shadow-pop`} data-testid="alert-overlay">
          <ErrorNotice error={error} {...(errorTitle ? { title: errorTitle } : {})} {...(onDismiss ? { onDismiss } : {})} />
        </div>
      )}
    </div>
  )
}
