import { useTranslation } from 'react-i18next'
import type { ApplicationListItem } from '../../api/types'
import { Icon } from '../../components/ui/Icon'
import { useDateFormat } from '../../hooks/useDateFormat'
import { BOARD_COLUMNS, columnOf, StatusBadge } from './status'
import type { BoardColumn } from './status'

interface KanbanBoardProps {
  applications: readonly ApplicationListItem[]
  onSelect: (id: string) => void
  onPreview: (application: ApplicationListItem) => void
  onDownload: (application: ApplicationListItem) => void
}

/**
 * The board: one column per stage. The last column is called "closed" and holds both rejections and withdrawals; every card
 * in it carries its own status badge, so the two can never be mistaken for each other.
 */
export function KanbanBoard({ applications, onSelect, onPreview, onDownload }: KanbanBoardProps) {
  const { t } = useTranslation()
  const grouped = Object.fromEntries(BOARD_COLUMNS.map((column) => [column, [] as ApplicationListItem[]])) as Record<BoardColumn, ApplicationListItem[]>
  for (const application of applications) grouped[columnOf(application.status)].push(application)

  return (
    <div className="grid grid-cols-1 gap-4 overflow-x-auto pb-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {BOARD_COLUMNS.map((column) => (
        <section
          key={column}
          aria-label={t(`applications.columns.${column}`)}
          className="flex h-[min(750px,70vh)] min-w-[220px] flex-col rounded-md border border-line bg-surface-2"
        >
          <header className="border-b border-line px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold tracking-wider text-ink uppercase">{t(`applications.columns.${column}`)}</h2>
              <span className="badge badge-neutral" aria-label={t('applications.columnCount', { count: grouped[column].length })}>
                {grouped[column].length}
              </span>
            </div>
            {column === 'closed' && <p className="mt-1 text-xs text-ink-muted">{t('applications.columns.closedHint')}</p>}
          </header>

          <ul className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
            {grouped[column].map((application) => (
              <KanbanCard key={application.id} application={application} showStatus={column === 'closed'} onSelect={onSelect} onPreview={onPreview} onDownload={onDownload} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

interface KanbanCardProps extends Omit<KanbanBoardProps, 'applications'> {
  application: ApplicationListItem
  showStatus: boolean
}

/**
 * One card. The title is a real button that opens the details; its hit area is stretched over the whole card, so mouse and
 * keyboard reach the same action. The two small actions appear on hover and whenever the card has the focus.
 */
function KanbanCard({ application, showStatus, onSelect, onPreview, onDownload }: KanbanCardProps) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  return (
    <li className="group relative rounded-sm border border-line bg-surface p-3 transition-colors focus-within:border-indicator hover:border-indicator">
      <div className="flex items-start justify-between gap-1">
        <h3 className="min-w-0 text-sm font-semibold text-ink">
          <button type="button" onClick={() => onSelect(application.id)} className="text-left after:absolute after:inset-0 after:content-['']">
            <span className="line-clamp-2">{application.jobTitle}</span>
          </button>
        </h3>
        {application.isFollowUpDue && (
          <span className="badge badge-warning shrink-0" title={t('applications.stats.followUpsDue')}>
            <Icon name="clock" size={12} />
            <span className="sr-only">{t('applications.stats.followUpsDue')}</span>
          </span>
        )}
      </div>

      <p className="mt-0.5 line-clamp-1 text-xs font-medium text-ink-muted">{application.company}</p>

      {application.location && (
        <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
          <Icon name="world" size={12} />
          <span className="truncate">{application.location}</span>
        </p>
      )}

      {showStatus && (
        <div className="mt-2">
          <StatusBadge status={application.status} />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2 text-xs text-ink-muted">
        <span>{application.appliedAt ? dates.date(application.appliedAt) : t('applications.notSentYet')}</span>
        <div className="relative z-10 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button type="button" onClick={() => onPreview(application)} title={t('applications.dossier.preview')} className="rounded-xs p-1 hover:bg-surface-2 hover:text-ink">
            <Icon name="fileText" size={14} />
            <span className="sr-only">{t('applications.dossier.preview')}</span>
          </button>
          <button type="button" onClick={() => onDownload(application)} title={t('applications.dossier.download')} className="rounded-xs p-1 hover:bg-surface-2 hover:text-ink">
            <Icon name="download" size={14} />
            <span className="sr-only">{t('applications.dossier.download')}</span>
          </button>
        </div>
      </div>
    </li>
  )
}
