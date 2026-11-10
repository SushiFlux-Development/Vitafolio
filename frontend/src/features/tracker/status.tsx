import { useTranslation } from 'react-i18next'
import type { ApplicationStatus } from '../../api/types'
import { Icon } from '../../components/ui/Icon'
import type { IconName } from '../../components/ui/Icon'

/** The seven states of an application in the order of a typical process. */
export const STATUS_ORDER: readonly ApplicationStatus[] = ['draft', 'applied', 'acknowledged', 'interview', 'offer', 'rejected', 'withdrawn']

export type StatusTone = 'neutral' | 'info' | 'highlight' | 'success' | 'danger'

/**
 * How a status looks: a tone from the shared status colours and an icon of its own. The icon makes the status readable
 * without the colour, and the two "closed" states (rejection, withdrawn) differ by icon and label, not only by shade.
 */
const LOOK: Record<ApplicationStatus, { tone: StatusTone; icon: IconName }> = {
  draft: { tone: 'neutral', icon: 'pencil' },
  applied: { tone: 'info', icon: 'fileExport' },
  acknowledged: { tone: 'info', icon: 'check' },
  interview: { tone: 'highlight', icon: 'users' },
  offer: { tone: 'success', icon: 'circleCheck' },
  rejected: { tone: 'danger', icon: 'x' },
  withdrawn: { tone: 'neutral', icon: 'logout' },
}

export const statusTone = (status: ApplicationStatus): StatusTone => LOOK[status]?.tone ?? 'neutral'

/** The status as a badge: icon and translated label, in the colour of its meaning. */
export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const { t } = useTranslation()
  const look = LOOK[status] ?? LOOK.draft
  return (
    <span className={`badge badge-${look.tone}`}>
      <Icon name={look.icon} size={12} />
      {t(`applications.statuses.${status}`)}
    </span>
  )
}

/** The columns of the board: six, because rejection and withdrawal share the last one ("closed"). */
export const BOARD_COLUMNS = ['draft', 'applied', 'acknowledged', 'interview', 'offer', 'closed'] as const
export type BoardColumn = (typeof BOARD_COLUMNS)[number]

export function columnOf(status: ApplicationStatus): BoardColumn {
  if (status === 'rejected' || status === 'withdrawn') return 'closed'
  return (BOARD_COLUMNS as readonly string[]).includes(status) ? (status as BoardColumn) : 'draft'
}
