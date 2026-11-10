import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'

type StepId = 'welcome' | 'profile' | 'letter' | 'applications' | 'guide' | 'help'

/** An entry of the little picture of the sidebar next to the text, and whether it is the one this step is about. */
interface Entry {
  icon: IconName
  /** Text key of the entry's name. */
  labelKey: string
  active?: boolean
}

interface Step {
  id: StepId
  icon: IconName
  entries: readonly Entry[]
}

// What the sidebar looks like in the picture; the labels are the app's own navigation texts, so the picture cannot drift from it.
const MAIN_ENTRIES: readonly Omit<Entry, 'active'>[] = [
  { icon: 'home', labelKey: 'nav.overview' },
  { icon: 'fileText', labelKey: 'nav.profile' },
  { icon: 'files', labelKey: 'nav.coverLetters' },
  { icon: 'briefcase', labelKey: 'nav.applications' },
  { icon: 'compass', labelKey: 'nav.guide' },
]
const HELP_ENTRIES: readonly Omit<Entry, 'active'>[] = [
  { icon: 'sparkles', labelKey: 'nav.aiSettings' },
  { icon: 'book', labelKey: 'nav.handbook' },
  { icon: 'help', labelKey: 'liveHelper.helpButton' },
  { icon: 'settings', labelKey: 'nav.settings' },
]

const activate = (entries: readonly Omit<Entry, 'active'>[], labelKey: string | null): Entry[] => entries.map((entry) => ({ ...entry, active: entry.labelKey === labelKey }))

const STEPS: readonly Step[] = [
  { id: 'welcome', icon: 'sparkles', entries: activate(MAIN_ENTRIES, 'nav.overview') },
  { id: 'profile', icon: 'fileText', entries: activate(MAIN_ENTRIES, 'nav.profile') },
  { id: 'letter', icon: 'files', entries: activate(MAIN_ENTRIES, 'nav.coverLetters') },
  { id: 'applications', icon: 'briefcase', entries: activate(MAIN_ENTRIES, 'nav.applications') },
  { id: 'guide', icon: 'compass', entries: activate(MAIN_ENTRIES, 'nav.guide') },
  { id: 'help', icon: 'help', entries: activate(HELP_ENTRIES, 'liveHelper.helpButton') },
]

const POINTS = [1, 2, 3] as const

interface IntroTourProps {
  open: boolean
  /** Skip, Esc, the close button and "Done": the caller remembers that the introduction was seen. */
  onClose: () => void
  /** Last step: leaves the introduction and opens the master profile. */
  onGoToProfile: () => void
  /** Last step: leaves the introduction and opens the manual. */
  onOpenHandbook: () => void
}

/**
 * The introduction at the first start: six short steps in a dialog of a fixed size, so no step resizes or moves the frame. Each
 * step has a title, a sentence, three points and a small picture of the sidebar that shows where the thing is done. The dialog is
 * the app's own (focus trap, Esc, reduced motion); the arrow keys move between the steps.
 */
export function IntroTour({ open, onClose, onGoToProfile, onOpenHandbook }: IntroTourProps) {
  const { t } = useTranslation()
  const reduce = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)

  const last = STEPS.length - 1
  const step = STEPS[index]!

  const goTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(last, target))
      setDirection(clamped >= index ? 1 : -1)
      setIndex(clamped)
    },
    [index, last],
  )

  // A new run starts at the first step.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setIndex(0)
      setDirection(1)
    }
  }

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      // The arrow keys on the grip of the window move the window; they are not for the steps
      if (event.defaultPrevented) return
      if (event.key === 'ArrowRight') goTo(index + 1)
      else if (event.key === 'ArrowLeft') goTo(index - 1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, index, goTo])

  const shift = reduce ? 0 : 24

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('liveHelper.intro.title')}
      icon="compass"
      size="lg"
      closeOnBackdrop={false}
      draggable
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('liveHelper.intro.skip')}
          </Button>

          <nav className="flex items-center" aria-label={t('liveHelper.intro.dots')}>
            {STEPS.map((candidate, position) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => goTo(position)}
                aria-label={t('liveHelper.intro.dot', { n: position + 1, title: t(`liveHelper.intro.steps.${candidate.id}.title`) })}
                aria-current={position === index ? 'step' : undefined}
                className="flex h-8 items-center justify-center rounded-xs px-1"
              >
                <span className={`block h-2.5 rounded-xs transition-all duration-200 ${position === index ? 'w-6 bg-indicator' : 'w-2.5 bg-line-strong'}`} />
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button className="min-w-28" icon="arrowLeft" disabled={index === 0} onClick={() => goTo(index - 1)}>
              {t('liveHelper.intro.back')}
            </Button>
            {/* One button for "Next" and "Done": it stays the same element, so the keyboard focus stays on it from step to step. */}
            <Button
              className="min-w-28"
              variant="confirm"
              icon={index === last ? 'check' : 'arrowRight'}
              data-autofocus=""
              onClick={() => (index === last ? onClose() : goTo(index + 1))}
            >
              {index === last ? t('liveHelper.intro.finish') : t('liveHelper.intro.next')}
            </Button>
          </div>
        </div>
      }
    >
      {/* Fixed height: every step has the same frame. The marker tells the helper that this dialog is its own and not one in its way. */}
      <div className="relative h-[21rem] overflow-hidden" data-live-helper="">
        <p className="sr-only" aria-live="polite">
          {t('liveHelper.intro.announce', { current: index + 1, total: STEPS.length, title: t(`liveHelper.intro.steps.${step.id}.title`) })}
        </p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step.id}
            className="grid h-full grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6"
            initial={{ opacity: 0, x: direction * shift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -shift }}
            transition={{ duration: reduce ? 0 : 0.18, ease: 'easeOut' }}
          >
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-select text-select-ink">
                  <Icon name={step.icon} size={22} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{t('liveHelper.intro.stepOf', { current: index + 1, total: STEPS.length })}</p>
                  <h3 className="text-lg leading-snug">{t(`liveHelper.intro.steps.${step.id}.title`)}</h3>
                </div>
              </div>

              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink">{t(`liveHelper.intro.steps.${step.id}.text`)}</p>

              <ul className="mt-3 space-y-2 text-sm">
                {POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 leading-snug text-ink-muted">
                    <Icon name="circleCheck" size={17} className="mt-0.5 shrink-0 text-toggle-on" />
                    <span>{t(`liveHelper.intro.steps.${step.id}.point${point}`)}</span>
                  </li>
                ))}
              </ul>

              {index === last && (
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  <Button icon="fileText" onClick={onGoToProfile}>
                    {t('liveHelper.intro.toProfile')}
                  </Button>
                  <Button icon="book" onClick={onOpenHandbook}>
                    {t('liveHelper.intro.openHandbook')}
                  </Button>
                </div>
              )}
            </div>

            {/* A small picture of the sidebar: the entry this step is about is marked like the active page in the real one. */}
            <div className="min-w-0 self-start rounded-md border border-line bg-surface-2 p-3" aria-hidden="true">
              <p className="mb-2 px-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{t('liveHelper.intro.where')}</p>
              <ul className="flex flex-col gap-1">
                {step.entries.map((entry) => (
                  <li
                    key={entry.labelKey}
                    className={`flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-semibold ${
                      entry.active ? 'bg-select text-select-ink shadow-[inset_3px_0_0_var(--indicator)]' : 'text-ink-muted'
                    }`}
                  >
                    <Icon name={entry.icon} size={18} className="shrink-0" />
                    <span className="min-w-0">{t(entry.labelKey)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </Dialog>
  )
}
