import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { GuideAnswers, GuideExplain, GuideSituation } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import type { IconName } from '../../components/ui/Icon'
import { TextField } from '../../components/ui/TextField'
import { ChoiceCard } from './ChoiceCard'
import { useGuideContent } from './content'
import type { GuideContent } from './content'
import { EMPTY_DRAFT, EXPLAINS, MAX_YEARS, REGIONS, SITUATIONS, WORKER_PLAN_KINDS, YEARS_CHOICES, answersOf, draftOf, isStepDone, readYears, stepsFor, yearsChoiceOf } from './model'
import type { GuideDraft, StepId, WorkerPlanKind } from './model'
import { useSaveGuideAnswers } from './useGuideAnswers'

const SITUATION_ICONS: Record<GuideSituation, IconName> = { school: 'school', training_or_studies: 'certificate', working: 'briefcase', returning: 'arrowBackUp' }
const PLAN_ICONS: Record<WorkerPlanKind, IconName> = { same_field: 'targetArrow', new_field: 'arrowsExchange' }
const EXPLAIN_ICONS: Record<GuideExplain | 'none', IconName> = {
  none: 'circleCheck',
  gap: 'calendarTime',
  parental_leave: 'babyCarriage',
  illness: 'stethoscope',
  unemployment: 'userSearch',
  dropped_out: 'doorExit',
  frequent_changes: 'switchHorizontal',
}
const REGION_TILES = { de: 'DE', uk: 'UK', us: 'US' } as const

interface GuideWizardProps {
  /** The saved answers to start from (changing the answers), or `null` for the first run. */
  initial: GuideAnswers | null
  onCancel: () => void
  /** The answers were saved: show the plan. */
  onSaved: () => void
}

/**
 * The click wizard: one question per step with large choice cards, back and next, progress, and a way out at any time. The
 * questions that do not apply (the years and the plan for somebody who has just finished school or training) are left out. A step
 * change replaces the content of a card whose size is fixed, so nothing around it moves; the focus goes to the new question.
 */
export function GuideWizard({ initial, onCancel, onSaved }: GuideWizardProps) {
  const content = useGuideContent()
  const reduce = useReducedMotion() ?? false
  const showError = useErrorDialog()
  const save = useSaveGuideAnswers()
  const [draft, setDraft] = useState<GuideDraft>(() => (initial ? draftOf(initial) : EMPTY_DRAFT))
  const [yearsTouched, setYearsTouched] = useState(false)
  const [index, setIndex] = useState(0)
  // Where the step came from decides the direction of the slide.
  const [direction, setDirection] = useState<1 | -1>(1)

  const steps = stepsFor(draft.situation)
  const stepIndex = Math.min(index, steps.length - 1)
  const step = steps[stepIndex]!
  const last = stepIndex === steps.length - 1
  const done = isStepDone(step, draft)
  const progress = draft.situation === null ? 0 : (stepIndex + (done ? 1 : 0)) / steps.length

  const patch = (change: Partial<GuideDraft>) => setDraft((current) => ({ ...current, ...change }))

  const go = (delta: 1 | -1) => {
    setDirection(delta)
    setIndex(Math.max(0, Math.min(steps.length - 1, stepIndex + delta)))
  }

  const finish = () => {
    const answers = answersOf(draft)
    if (answers === null) return
    save.mutate(answers, {
      onSuccess: onSaved,
      onError: (error) => showError(error, content.wizard.saveFailed),
    })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!done || save.isPending) return
    if (last) finish()
    else go(1)
  }

  const shift = reduce ? 0 : 18
  const fade = { duration: reduce ? 0 : 0.18, ease: 'easeOut' } as const

  return (
    <section className="card p-6" aria-label={content.wizard.label} data-testid="guide-wizard">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gold-text" data-testid="guide-step-label">
            {draft.situation === null ? content.wizard.stepFirst : content.wizard.stepOf(stepIndex + 1, steps.length)}
          </p>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-xs bg-sunken"
            role="progressbar"
            aria-label={content.wizard.label}
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={draft.situation === null ? 0 : stepIndex + 1}
          >
            <motion.div className="h-full bg-indicator" initial={false} animate={{ width: `${Math.round(progress * 100)}%` }} transition={fade} />
          </div>
        </div>
        <Button variant="ghost" icon="x" onClick={onCancel} data-testid="guide-cancel">
          {content.wizard.cancel}
        </Button>
      </div>

      <form onSubmit={submit} noValidate>
        {/* The room of the question is fixed, sized for the fullest one: the buttons below never move between steps. */}
        <div className="min-h-[30rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, x: direction * shift }}
              animate={{ opacity: 1, x: 0, transition: fade }}
              exit={{ opacity: 0, x: -direction * shift, transition: { duration: reduce ? 0 : 0.1 } }}
            >
              <StepBody step={step} draft={draft} patch={patch} content={content} yearsTouched={yearsTouched} touchYears={() => setYearsTouched(true)} />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-5">
          <Button icon="chevronLeft" onClick={() => go(-1)} disabled={stepIndex === 0 || save.isPending} data-testid="guide-back">
            {content.wizard.back}
          </Button>
          <Button type="submit" variant="confirm" icon={last ? 'check' : 'chevronRight'} disabled={!done} busy={save.isPending} data-testid="guide-next">
            {last ? content.wizard.finish : content.wizard.next}
          </Button>
        </div>
      </form>
    </section>
  )
}

interface StepBodyProps {
  step: StepId
  draft: GuideDraft
  patch: (change: Partial<GuideDraft>) => void
  content: GuideContent
  yearsTouched: boolean
  touchYears: () => void
}

/** The question of a step: its heading takes the focus when the step appears, so keyboard and screen reader users start at the question. */
function StepBody({ step, draft, patch, content, yearsTouched, touchYears }: StepBodyProps) {
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])

  const wizard = content.wizard
  const frame = (title: string, hint: string, body: ReactNode, role: 'radiogroup' | 'group' = 'radiogroup') => (
    <div>
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-xl outline-none" data-testid="guide-question">
        {title}
      </h2>
      <p className="mt-1 mb-5 max-w-2xl text-ink-muted">{hint}</p>
      <div role={role} aria-labelledby={headingId}>
        {body}
      </div>
    </div>
  )

  switch (step) {
    case 'situation':
      return frame(
        wizard.situation.title,
        wizard.situation.hint,
        <div className="card-grid [--card-min:15rem]">
          {SITUATIONS.map((value) => (
            <ChoiceCard
              key={value}
              type="radio"
              name="situation"
              value={value}
              checked={draft.situation === value}
              onChange={() => patch({ situation: value })}
              label={wizard.situation.options[value].label}
              description={wizard.situation.options[value].description}
              icon={SITUATION_ICONS[value]}
            />
          ))}
        </div>,
      )
    case 'years': {
      const kind = draft.situation === 'returning' ? 'returning' : 'working'
      const reading = readYears(draft.yearsText)
      const chosen = reading.state === 'ok' ? yearsChoiceOf(reading.years) : null
      const error =
        reading.state === 'invalid'
          ? wizard.years.invalid
          : reading.state === 'range'
            ? wizard.years.range(MAX_YEARS)
            : reading.state === 'empty' && yearsTouched
              ? wizard.years.required
              : undefined
      return frame(
        wizard.years.title[kind],
        wizard.years.hint[kind],
        <div className="flex flex-col gap-6">
          <div className="card-grid [--card-min:11rem]" role="radiogroup" aria-label={wizard.years.choicesLabel}>
            {YEARS_CHOICES.map((choice) => (
              <ChoiceCard
                key={choice.id}
                type="radio"
                name="yearsChoice"
                value={choice.id}
                checked={chosen === choice.id}
                onChange={() => {
                  touchYears()
                  patch({ yearsText: String(choice.years) })
                }}
                label={wizard.years.choices[choice.id]}
                compact
              />
            ))}
          </div>
          <div className="flex max-w-xs items-start gap-3">
            <TextField
              className="flex-1"
              label={wizard.years.fieldLabel}
              name="years"
              inputMode="numeric"
              autoComplete="off"
              value={draft.yearsText}
              onChange={(event) => {
                touchYears()
                patch({ yearsText: event.target.value })
              }}
              error={error}
              hint={wizard.years.fieldHint}
              reserve={[wizard.years.invalid, wizard.years.range(MAX_YEARS), wizard.years.required]}
            />
            <span className="mt-8 text-ink-muted">{wizard.years.unit}</span>
          </div>
        </div>,
        'group',
      )
    }
    case 'plan':
      return frame(
        wizard.plan.title,
        wizard.plan.hint,
        <div className="card-grid [--card-min:15rem]">
          {WORKER_PLAN_KINDS.map((value) => (
            <ChoiceCard
              key={value}
              type="radio"
              name="plan"
              value={value}
              checked={draft.plan === value}
              onChange={() => patch({ plan: value })}
              label={wizard.plan.options[value].label}
              description={wizard.plan.options[value].description}
              icon={PLAN_ICONS[value]}
            />
          ))}
        </div>,
      )
    case 'explain': {
      const chosen = draft.explain
      // "Nothing special" and a concrete point exclude each other; taking the last point away leaves the question open again.
      const toggle = (value: GuideExplain) => {
        const current = chosen ?? []
        const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
        patch({ explain: next.length === 0 ? null : EXPLAINS.filter((item) => next.includes(item)) })
      }
      return frame(
        wizard.explain.title,
        wizard.explain.hint,
        <div className="card-grid [--card-min:15rem]">
          <ChoiceCard
            type="checkbox"
            name="explain"
            value="none"
            checked={chosen !== null && chosen.length === 0}
            onChange={() => patch({ explain: chosen !== null && chosen.length === 0 ? null : [] })}
            label={wizard.explain.options.none.label}
            description={wizard.explain.options.none.description}
            icon={EXPLAIN_ICONS.none}
          />
          {EXPLAINS.map((value) => (
            <ChoiceCard
              key={value}
              type="checkbox"
              name="explain"
              value={value}
              checked={chosen?.includes(value) ?? false}
              onChange={() => toggle(value)}
              label={wizard.explain.options[value].label}
              description={wizard.explain.options[value].description}
              icon={EXPLAIN_ICONS[value]}
            />
          ))}
        </div>,
        'group',
      )
    }
    case 'region':
      return frame(
        wizard.region.title,
        wizard.region.hint,
        <div className="card-grid [--card-min:15rem]">
          {REGIONS.map((value) => (
            <ChoiceCard
              key={value}
              type="radio"
              name="region"
              value={value}
              checked={draft.region === value}
              onChange={() => patch({ region: value })}
              label={wizard.region.options[value].label}
              description={wizard.region.options[value].description}
              tile={REGION_TILES[value]}
            />
          ))}
        </div>,
      )
  }
}
