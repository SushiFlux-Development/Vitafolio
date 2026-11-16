import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { clampOffset, useDragMove } from '../../hooks/useDragMove'
import { DragGrip, DragReset } from './DragControls'
import { Icon } from './Icon'
import type { IconName } from './Icon'

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

export interface DialogProps {
  open: boolean
  /** Called for Esc, the close button and a click on the backdrop. */
  onClose: () => void
  title: string
  /** Icon in the tinted tile next to the title. */
  icon?: IconName
  tone?: 'default' | 'danger'
  /** "alertdialog" for confirmations and errors, "dialog" for forms. */
  role?: 'dialog' | 'alertdialog'
  /** Width of the panel. */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  /** What gets the focus when the dialog opens; the first focusable element when not given. */
  initialFocus?: RefObject<HTMLElement | null>
  /** A click on the backdrop closes the dialog (not for forms with unsaved input). */
  closeOnBackdrop?: boolean
  /** Hide the close button in the corner (confirmations have their own cancel button). */
  hideCloseButton?: boolean
  /** The window can be moved by its head (pointer) or its grip (arrow keys), within the browser or app window; it never leaves it. */
  draggable?: boolean
  children: ReactNode
  footer?: ReactNode
}

/**
 * The open dialogs, each with the number it got when it was first drawn. A dialog can open another one (an assistant inside a
 * detail view, a confirmation inside a form), and every one of them listens for Esc on the document: only the one with the
 * highest number - the one opened last - may react, otherwise a single key press closes the whole pile. The number comes from
 * the render order (an outer dialog is drawn before the one inside it), not from the order of the effects (those run inside out).
 */
const openDialogs = new Set<number>()
let drawn = 0

const WIDTH = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-6xl', full: 'max-w-[min(110rem,calc(100vw-3rem))]' } as const

/**
 * The app's own dialog - never the browser's or the operating system's. Own overlay, focus trap, Esc and backdrop close,
 * focus returns to where it was; the body scrolls inside the panel, so a long text (an error message) is always fully
 * readable. Motion respects the reduced-motion setting.
 */
export function Dialog({
  open,
  onClose,
  title,
  icon,
  tone = 'default',
  role = 'dialog',
  size = 'md',
  initialFocus,
  closeOnBackdrop = true,
  hideCloseButton = false,
  draggable = false,
  children,
  footer,
}: DialogProps) {
  const reduce = useReducedMotion() ?? false

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-(--overlay) p-6 pt-[max(2rem,10vh)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
          onMouseDown={(event) => {
            if (closeOnBackdrop && event.target === event.currentTarget) onClose()
          }}
        >
          <Panel
            onClose={onClose}
            title={title}
            icon={icon}
            tone={tone}
            role={role}
            size={size}
            initialFocus={initialFocus}
            hideCloseButton={hideCloseButton}
            draggable={draggable}
            footer={footer}
            reduce={reduce}
          >
            {children}
          </Panel>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

interface PanelProps extends Pick<DialogProps, 'onClose' | 'title' | 'icon' | 'tone' | 'role' | 'size' | 'initialFocus' | 'hideCloseButton' | 'draggable' | 'footer' | 'children'> {
  reduce: boolean
}

function Panel({ onClose, title, icon, tone, role, size = 'md', initialFocus, hideCloseButton, draggable = false, footer, children, reduce }: PanelProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  // Where the user moved the window to, as a shift from the centred place it has by itself.
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const titleId = useId()
  const [order] = useState(() => ++drawn)
  // The Escape listener lives as long as the panel, so it reads the newest onClose (which may depend on a busy state).
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    openDialogs.add(order)
    const previous = document.activeElement as HTMLElement | null
    const focusTarget =
      initialFocus?.current ?? panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    focusTarget?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && order === Math.max(...openDialogs)) {
        event.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('keydown', onEscape)
      openDialogs.delete(order)
      document.body.style.overflow = previousOverflow
      previous?.focus?.()
    }
    // Runs once when the panel mounts (it only exists while the dialog is open).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Moving. The natural place is where the panel would sit without the shift; it is measured when needed, because the window may have
  // been resized since. The shift is limited so that the whole panel stays inside the window.
  const keepInside = (shift: { x: number; y: number }, current: { x: number; y: number }) => {
    const box = panelRef.current?.getBoundingClientRect()
    if (!box) return shift
    return clampOffset(shift, { x: box.left - current.x, y: box.top - current.y, w: box.width, h: box.height }, { w: window.innerWidth, h: window.innerHeight })
  }
  const drag = useDragMove({ read: () => offset, write: setOffset, clamp: (shift) => keepInside(shift, offset) })
  const shiftRef = useRef(offset)
  useEffect(() => {
    shiftRef.current = offset
  })
  // A smaller window moves the panel back in.
  useEffect(() => {
    if (!draggable) return
    const onResize = () => {
      const current = shiftRef.current
      const next = keepInside(current, current)
      if (next.x !== current.x || next.y !== current.y) setOffset(next)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
    // keepInside only reads the panel and the window, so it is not a dependency
  }, [draggable])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (items.length === 0) return
    const first = items[0]!
    const last = items[items.length - 1]!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const danger = tone === 'danger'
  return (
    <motion.div
      ref={panelRef}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={handleKeyDown}
      className={`flex max-h-[calc(100vh-4rem)] w-full flex-col rounded-lg border border-line bg-surface shadow-pop ${WIDTH[size]}`}
      // The CSS property "translate" is separate from the transform of the entrance animation, so the two do not disturb each other.
      style={draggable ? { translate: `${offset.x}px ${offset.y}px` } : undefined}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
    >
      <div
        className={`flex items-start gap-3 px-6 pt-5 pb-3 ${draggable ? 'cursor-grab touch-none rounded-t-lg select-none' : ''}`}
        data-testid={draggable ? 'drag-head' : undefined}
        {...(draggable ? drag.headProps : {})}
      >
        {icon && (
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${danger ? 'bg-danger-soft text-danger-soft-ink' : 'bg-select text-select-ink'}`}
          >
            <Icon name={icon} size={20} />
          </span>
        )}
        <h2 id={titleId} className="min-w-0 flex-1 pt-1 text-lg leading-snug">
          {title}
        </h2>
        {draggable && (
          <>
            <DragReset shown={offset.x !== 0 || offset.y !== 0} onClick={() => setOffset({ x: 0, y: 0 })} />
            <DragGrip onKeyDown={drag.onGripKeyDown} />
          </>
        )}
        {!hideCloseButton && (
          <button type="button" data-no-drag="" className="btn btn-ghost btn-sm btn-icon -mr-1" aria-label={t('common.close')} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 text-ink">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
    </motion.div>
  )
}
