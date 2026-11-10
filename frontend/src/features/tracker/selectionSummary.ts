import type { TFunction } from 'i18next'
import type { CvSelection } from '../../api/types'
import { selectionCounts } from './cvSelection'
import type { KnownIds, SelectionCounts } from './cvSelection'

/** The parts of the short summary, in the order they are told; each has a plural text "applications.content.summary.<key>". */
const PARTS: readonly (keyof SelectionCounts)[] = [
  'experiencesShort',
  'experiencesHidden',
  'educationsShort',
  'educationsHidden',
  'certificatesHidden',
  'sectionsHidden',
]

/**
 * "2 Stationen gekürzt, 1 Station weggelassen, 3 Anlagen" - or "complete" when nothing is left out. With `known` only entries that
 * still exist in the master profile are counted; `attachments` adds the number of attached documents (0 = not told).
 */
export function describeSelection(t: TFunction, selection: CvSelection | null | undefined, known?: KnownIds, attachments = 0): string {
  const counts = selectionCounts(selection, known)
  const parts = PARTS.filter((key) => counts[key] > 0).map((key) => t(`applications.content.summary.${key}`, { count: counts[key] }))
  if (attachments > 0) parts.push(t('applications.content.summary.attachments', { count: attachments }))
  return parts.length > 0 ? parts.join(', ') : t('applications.content.summary.complete')
}

/** The longest summary there can be (every part, with a large count): the room the form keeps for it. */
export function longestSummary(t: TFunction): string {
  return [...PARTS.map((key) => t(`applications.content.summary.${key}`, { count: 99 })), t('applications.content.summary.attachments', { count: 99 })].join(', ')
}
