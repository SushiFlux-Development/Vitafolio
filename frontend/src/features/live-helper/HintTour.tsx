import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { DragGrip, DragReset } from '../../components/ui/DragControls'
import { Icon } from '../../components/ui/Icon'
import { clampBox, useDragMove } from '../../hooks/useDragMove'
import { findHintTargets, hintElement } from './hints'
import type { HintDefinition, HintScreen } from './hints'

/** Room the lit area keeps around the control. */
const SPOT_PADDING = 6
/** Distance between the lit area and the card. */
const GAP = 14
/** The card never gets closer than this to the edge of the window. */
const MARGIN = 12

/** Where the control a hint points at is right now; follows scrolling, resizing and layout changes frame by frame. */
function useTargetRect(target: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    if (!target) return
    let frame = 0
    const tick = () => {
      const next = hintElement(target)?.getBoundingClientRect() ?? null
      setRect((previous) => {
        if (!next) return null
        const same = previous && Math.abs(previous.x - next.x) < 0.5 && Math.abs(previous.y - next.y) < 0.5 && Math.abs(previous.width - next.width) < 0.5 && Math.abs(previous.height - next.height) < 0.5
        return same ? previous : next
      })
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [target])
  // Without a target there is nothing to follow, whatever was measured last.
  return target ? rect : null
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

/** Puts the card next to the control on the side that has room (below, above, right, left), always inside the window. */
export function placeCard(rect: { left: number; right: number; top: number; bottom: number; width: number; height: number } | null, card: { w: number; h: number }, view: { w: number; h: number }): { left: number; top: number } {
  if (!rect) return { left: Math.max(MARGIN, (view.w - card.w) / 2), top: Math.max(MARGIN, (view.h - card.h) / 2) }
  const fits = {
    below: view.h - rect.bottom - GAP - MARGIN >= card.h,
    above: rect.top - GAP - MARGIN >= card.h,
    right: view.w - rect.right - GAP - MARGIN >= card.w,
    left: rect.left - GAP - MARGIN >= card.w,
  }
  // A tall control (the list of sections in the sidebar) is better served from the side.
  const order = rect.height > view.h * 0.5 ? (['right', 'left', 'below', 'above'] as const) : (['below', 'above', 'right', 'left'] as const)
  const side = order.find((candidate) => fits[candidate]) ?? 'below'
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const maxLeft = view.w - card.w - MARGIN
  const maxTop = view.h - card.h - MARGIN
  if (side === 'below') return { left: clamp(centerX - card.w / 2, MARGIN, maxLeft), top: clamp(rect.bottom + GAP, MARGIN, maxTop) }
  if (side === 'above') return { left: clamp(centerX - card.w / 2, MARGIN, maxLeft), top: clamp(rect.top - GAP - card.h, MARGIN, maxTop) }
  if (side === 'right') return { left: clamp(rect.right + GAP, MARGIN, maxLeft), top: clamp(centerY - card.h / 2, MARGIN, maxTop) }
  return { left: clamp(rect.left - GAP - card.w, MARGIN, maxLeft), top: clamp(centerY - card.h / 2, MARGIN, maxTop) }
}

interface HintTourProps {
  screen: HintScreen | null
  open: boolean
  onClose: () => void
  /** "Show the introduction": the caller closes the hints and opens the introduction. */
  onShowIntro: () => void
  /** "Manual": the caller closes the hints and opens the manual. */
  onOpenHandbook: () => void
}

/**
 * The hints of one screen: the page dims, a soft light sits on the real control and a small card beside it says what the control
 * does. One hint after the other; a control that is not on the page is skipped. Own implementation, no tour library: the controls
 * are found by their data-hint attribute, the light follows them every frame, and nothing on the page moves.
 */
export function HintTour({ screen, open, onClose, onShowIntro, onOpenHandbook }: HintTourProps) {
  const { t } = useTranslation()
  const reduce = useReducedMotion() ?? false
  const cardRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const [steps, setSteps] = useState<HintDefinition[]>([])
  const [index, setIndex] = useState(0)
  const [wasOpen, setWasOpen] = useState(false)
  // Where the user put the card, if they did: it then stays there from hint to hint; the light moves on without it.
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null)
  const [card, setCard] = useState({ w: 352, h: 220 })
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    closeRef.current = onClose
  })

  // When the hints open: the controls that exist right now, from the first one (settled while rendering, so the first frame is right).
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && screen) {
      setSteps(findHintTargets(screen))
      setIndex(0)
      // A new start ("?") places the card by itself again
      setPlaced(null)
    }
  }
  // None of the controls is left: there is nothing to show.
  useEffect(() => {
    if (open && wasOpen && steps.length === 0) closeRef.current()
  }, [open, wasOpen, steps])

  const step = open ? steps[index] : undefined
  const rect = useTargetRect(step?.target ?? null)

  // Esc closes; the focus returns to where it was.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      previous?.focus?.()
    }
  }, [open])

  // A control outside the visible part is brought into view; then the keyboard focus moves into the card.
  useEffect(() => {
    if (!step) return
    const element = hintElement(step.target)
    const bounds = element?.getBoundingClientRect()
    if (element && bounds && (bounds.top < 80 || bounds.bottom > window.innerHeight - 20)) {
      element.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    }
    cardRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
  }, [step, reduce])

  // Size of the card (for the placement) and of the window.
  useLayoutEffect(() => {
    const element = cardRef.current
    if (!element) return
    const measure = () => {
      setCard({ w: element.offsetWidth, h: element.offsetHeight })
      setView({ w: window.innerWidth, h: window.innerHeight })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [step])

  const last = index >= steps.length - 1
  // The next hint whose control is still on the page (one that went away meanwhile is skipped); none left ends the tour.
  const next = () => {
    const following = steps.findIndex((candidate, position) => position > index && hintElement(candidate.target) !== null)
    if (following < 0) onClose()
    else setIndex(following)
  }

  // Tab stays inside the card.
  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const nodes = [...(cardRef.current?.querySelectorAll<HTMLElement>('button') ?? [])]
    const first = nodes[0]
    const lastNode = nodes[nodes.length - 1]
    if (!first || !lastNode) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      lastNode.focus()
    } else if (!event.shiftKey && document.activeElement === lastNode) {
      event.preventDefault()
      first.focus()
    }
  }

  // The card where the user left it, kept inside the window (also when the window got smaller); otherwise next to the control.
  const kept = placed ? clampBox({ x: placed.left, y: placed.top }, card, view) : null
  const position = kept ? { left: kept.x, top: kept.y } : placeCard(rect, card, view)
  const drag = useDragMove({
    read: () => ({ x: position.left, y: position.top }),
    write: (next) => setPlaced({ left: next.x, top: next.y }),
    clamp: (next) => clampBox(next, card, view),
  })
  // Moving the card follows the pointer or the key at once; only the automatic placement glides (and not at all with reduced motion).
  const spring = reduce || placed ? { duration: 0.01 } : ({ type: 'spring', stiffness: 300, damping: 32 } as const)

  return createPortal(
    <AnimatePresence>
      {open && step && (
        <motion.div
          key="hints"
          className="fixed inset-0 z-[60]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.1 : 0.2 }}
          // The page behind is not clickable while a hint is up.
          onMouseDown={(event) => event.preventDefault()}
        >
          {rect ? (
            <motion.div
              className="pointer-events-none fixed rounded-md"
              aria-hidden="true"
              data-testid="hint-spot"
              // One huge shadow dims everything but the lit area; the ring around it uses the text colour of the theme, which stands out
              // from the dimmed page in both themes.
              style={{ boxShadow: '0 0 0 100vmax var(--overlay), 0 0 0 2px var(--ink)' }}
              initial={false}
              animate={{ left: rect.left - SPOT_PADDING, top: rect.top - SPOT_PADDING, width: rect.width + SPOT_PADDING * 2, height: rect.height + SPOT_PADDING * 2 }}
              transition={reduce ? { duration: 0.01 } : { type: 'spring', stiffness: 260, damping: 30 }}
            />
          ) : (
            <div className="absolute inset-0 bg-(--overlay)" aria-hidden="true" />
          )}

          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="live-hint-title"
            aria-describedby="live-hint-text"
            data-live-helper=""
            data-testid="hint-card"
            onKeyDown={trapFocus}
            className="fixed w-[min(22rem,calc(100vw-1.5rem))] rounded-lg border border-line-strong bg-surface p-4 text-ink shadow-pop"
            initial={false}
            animate={{ left: position.left, top: position.top }}
            transition={spring}
          >
            {/* The head is the handle: drag it with the mouse or pen, or use the arrow keys on the grip. The reset keeps its room while it is hidden. */}
            <div className="-mx-4 -mt-4 mb-1 flex cursor-grab touch-none items-center gap-2 rounded-t-lg px-3 pt-2.5 pb-1 select-none" data-testid="hint-handle" {...drag.headProps}>
              <DragGrip onKeyDown={drag.onGripKeyDown} />
              <p className="min-w-0 flex-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{t('liveHelper.hints.meta', { current: index + 1, total: steps.length })}</p>
              <DragReset shown={placed !== null} withLabel onClick={() => setPlaced(null)} />
            </div>
            <h2 id="live-hint-title" className="mt-1 text-base leading-snug">
              {t(`liveHelper.hints.${step.id}.title`)}
            </h2>
            <p id="live-hint-text" className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {t(`liveHelper.hints.${step.id}.text`)}
            </p>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Button variant="ghost" small onClick={onClose}>
                {t('liveHelper.hints.skip')}
              </Button>
              <Button variant="confirm" small data-autofocus="" onClick={next}>
                {last ? t('liveHelper.hints.done') : t('liveHelper.hints.next')}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-sm font-semibold">
              <button type="button" className="inline-flex items-center gap-1.5 rounded-xs text-link hover:underline" onClick={onShowIntro}>
                <Icon name="compass" size={15} />
                {t('liveHelper.hints.intro')}
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-xs text-link hover:underline" onClick={onOpenHandbook}>
                <Icon name="book" size={15} />
                {t('liveHelper.hints.handbook')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
