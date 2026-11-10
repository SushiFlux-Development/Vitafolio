import type { ApplicationListItem } from '../../api/types'

/** How many applications the "follow-up due" strip of the dashboard lists. */
export const DASHBOARD_ROWS = 6

const time = (iso: string | null | undefined): number => {
  const value = iso ? Date.parse(iso) : Number.NaN
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

/** The applications whose follow-up is due, the one that has waited longest first; one without a date comes last. */
export function dueFollowUps(items: readonly ApplicationListItem[], limit = DASHBOARD_ROWS): ApplicationListItem[] {
  return items
    .filter((application) => application.isFollowUpDue)
    .sort((a, b) => time(a.followUpAt) - time(b.followUpAt))
    .slice(0, limit)
}
