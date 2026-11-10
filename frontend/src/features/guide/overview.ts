import type { GuideAnswers } from '../../api/types'
import type { OverviewId } from './content'
import type { BlockId } from './plan'

/** The tabs of the overview ("all situations"), in the order they are shown. */
export const OVERVIEW_IDS: readonly OverviewId[] = ['school', 'training', 'some', 'long', 'switch', 'returning', 'sensitive', 'uk', 'us']

export interface OverviewExample {
  /** Invented answers that stand for the situation (the overview is for reading, it does not use the user's own answers). */
  answers: GuideAnswers
  /** Show only these blocks of the plan (the tab is about one topic); all blocks when absent. */
  only?: readonly BlockId[]
}

const base: GuideAnswers = { situation: 'working', yearsOfExperience: 3, plan: 'same_field', explain: [], region: 'de' }

export const OVERVIEW_EXAMPLES: Record<OverviewId, OverviewExample> = {
  school: { answers: { situation: 'school', yearsOfExperience: null, plan: 'first_job', explain: [], region: 'de' } },
  training: { answers: { situation: 'training_or_studies', yearsOfExperience: null, plan: 'first_job', explain: [], region: 'de' } },
  some: { answers: base },
  long: { answers: { ...base, yearsOfExperience: 12 } },
  switch: { answers: { ...base, plan: 'new_field' } },
  returning: { answers: { ...base, situation: 'returning', yearsOfExperience: 7 } },
  sensitive: {
    answers: { ...base, explain: ['gap', 'parental_leave', 'illness', 'unemployment', 'dropped_out', 'frequent_changes'] },
    only: ['sensitive'],
  },
  uk: { answers: { ...base, region: 'uk' }, only: ['region'] },
  us: { answers: { ...base, region: 'us' }, only: ['region'] },
}
