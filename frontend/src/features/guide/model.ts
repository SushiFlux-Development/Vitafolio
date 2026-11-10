import type { GuideAnswers, GuideExplain, GuidePlanKind, GuideRegion, GuideSituation } from '../../api/types'

/** The choices of each question, in the order they are shown. */
export const SITUATIONS: readonly GuideSituation[] = ['school', 'training_or_studies', 'working', 'returning']
export const PLAN_KINDS: readonly GuidePlanKind[] = ['same_field', 'new_field', 'first_job']
/** The plans that make sense for somebody who has worked: a first job is only asked of those who just finished school or training. */
export type WorkerPlanKind = Exclude<GuidePlanKind, 'first_job'>
export const WORKER_PLAN_KINDS: readonly WorkerPlanKind[] = ['same_field', 'new_field']
export const EXPLAINS: readonly GuideExplain[] = ['gap', 'parental_leave', 'illness', 'unemployment', 'dropped_out', 'frequent_changes']
export const REGIONS: readonly GuideRegion[] = ['de', 'uk', 'us']

/** Upper limit of the years field. Longer working lives do not exist; the server holds the final say. */
export const MAX_YEARS = 60

export type YearsChoiceId = 'none' | 'under2' | 'from2' | 'from5' | 'from10' | 'over15'

interface YearsChoice {
  id: YearsChoiceId
  /** The number saved when the quick choice is clicked. */
  years: number
  /** Whether a number of years belongs to this quick choice (the lower bound counts, the upper one starts the next). */
  contains: (years: number) => boolean
}

/** "keine, unter 2, 2 bis 5, 5 bis 10, 10 bis 15, über 15 Jahre". */
export const YEARS_CHOICES: readonly YearsChoice[] = [
  { id: 'none', years: 0, contains: (n) => n === 0 },
  { id: 'under2', years: 1, contains: (n) => n >= 1 && n < 2 },
  { id: 'from2', years: 3, contains: (n) => n >= 2 && n < 5 },
  { id: 'from5', years: 7, contains: (n) => n >= 5 && n < 10 },
  { id: 'from10', years: 12, contains: (n) => n >= 10 && n < 15 },
  { id: 'over15', years: 20, contains: (n) => n >= 15 },
]

export function yearsChoiceOf(years: number): YearsChoiceId | null {
  return YEARS_CHOICES.find((choice) => choice.contains(years))?.id ?? null
}

export type YearsReading = { state: 'empty' } | { state: 'invalid' } | { state: 'range' } | { state: 'ok'; years: number }

/** Reads the typed years: whole numbers from 0 to {@link MAX_YEARS}; spaces around are ignored. */
export function readYears(text: string): YearsReading {
  const trimmed = text.trim()
  if (trimmed === '') return { state: 'empty' }
  if (!/^\d+$/.test(trimmed)) return { state: 'invalid' }
  const years = Number(trimmed)
  return years > MAX_YEARS ? { state: 'range' } : { state: 'ok', years }
}

export type StepId = 'situation' | 'years' | 'plan' | 'explain' | 'region'

/** Whether the person has been in working life before (so years and plan are asked). */
export function hasWorked(situation: GuideSituation | null): boolean {
  return situation === 'working' || situation === 'returning'
}

/** The questions to ask. Somebody who has just finished school or training has no working years and a first job ahead. */
export function stepsFor(situation: GuideSituation | null): readonly StepId[] {
  return hasWorked(situation) ? ['situation', 'years', 'plan', 'explain', 'region'] : ['situation', 'explain', 'region']
}

/** The wizard's working copy: `null` = not answered yet. The years stay text so a half-typed number is not lost. */
export interface GuideDraft {
  situation: GuideSituation | null
  yearsText: string
  plan: GuidePlanKind | null
  /** `[]` is the answer "nothing to explain"; `null` means the question is still open. */
  explain: GuideExplain[] | null
  region: GuideRegion | null
}

export const EMPTY_DRAFT: GuideDraft = { situation: null, yearsText: '', plan: null, explain: null, region: null }

export function draftOf(answers: GuideAnswers | null): GuideDraft {
  if (answers === null) return EMPTY_DRAFT
  return {
    situation: answers.situation,
    yearsText: answers.yearsOfExperience === null ? '' : String(answers.yearsOfExperience),
    plan: answers.plan,
    explain: [...answers.explain],
    region: answers.region,
  }
}

export function isStepDone(step: StepId, draft: GuideDraft): boolean {
  switch (step) {
    case 'situation':
      return draft.situation !== null
    case 'years':
      return readYears(draft.yearsText).state === 'ok'
    case 'plan':
      return draft.plan !== null && (WORKER_PLAN_KINDS as readonly string[]).includes(draft.plan)
    case 'explain':
      return draft.explain !== null
    case 'region':
      return draft.region !== null
  }
}

/** The answers to save, or `null` while a question that is asked is still open. */
export function answersOf(draft: GuideDraft): GuideAnswers | null {
  if (!stepsFor(draft.situation).every((step) => isStepDone(step, draft))) return null
  if (draft.situation === null || draft.explain === null || draft.region === null) return null
  const worked = hasWorked(draft.situation)
  const years = readYears(draft.yearsText)
  const plan = worked ? draft.plan : 'first_job'
  if (plan === null) return null
  return {
    situation: draft.situation,
    yearsOfExperience: worked && years.state === 'ok' ? years.years : null,
    plan,
    // Fixed order, so the same choice always gives the same saved answers.
    explain: EXPLAINS.filter((item) => draft.explain!.includes(item)),
    region: draft.region,
  }
}
