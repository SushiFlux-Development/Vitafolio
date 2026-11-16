import { useTranslation } from 'react-i18next'
import type { ApplicationListItem } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { useDateFormat } from '../../hooks/useDateFormat'
import { StatusBadge } from './status'

interface ApplicationsTableProps {
  applications: readonly ApplicationListItem[]
  onSelect: (id: string) => void
  onDownload: (application: ApplicationListItem) => void
  onDelete: (application: ApplicationListItem) => void
}

/** The list view: one row per application, the same three actions as everywhere an entry can be opened, saved or removed. */
export function ApplicationsTable({ applications, onSelect, onDownload, onDelete }: ApplicationsTableProps) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">
              {t('applications.fields.jobTitle')} / {t('applications.fields.company')}
            </th>
            <th scope="col">{t('applications.fields.location')}</th>
            <th scope="col">{t('applications.fields.status')}</th>
            <th scope="col">{t('applications.fields.appliedAt')}</th>
            <th scope="col">{t('applications.fields.coverLetter')}</th>
            <th scope="col" className="text-right">
              {t('common.actions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => (
            <tr key={application.id}>
              <td>
                <button type="button" onClick={() => onSelect(application.id)} className="text-left font-semibold text-ink hover:underline">
                  {application.jobTitle}
                </button>
                <div className="text-xs text-ink-muted">{application.company}</div>
                {application.isFollowUpDue && (
                  <span className="badge badge-warning mt-1">
                    <Icon name="clock" size={12} />
                    {t('applications.stats.followUpsDue')}
                  </span>
                )}
              </td>
              <td className="text-ink-muted">{application.location || '–'}</td>
              <td>
                <StatusBadge status={application.status} />
              </td>
              <td className="text-ink-muted">{application.appliedAt ? dates.date(application.appliedAt) : '–'}</td>
              <td className="text-ink-muted">
                {application.coverLetterTitle ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="files" size={14} />
                    {application.coverLetterTitle}
                  </span>
                ) : (
                  '–'
                )}
              </td>
              <td>
                <div className="flex items-center justify-end gap-1.5">
                  <Button variant="ghost" small iconOnly icon="download" title={t('applications.actions.downloadDossier')} onClick={() => onDownload(application)}>
                    <span className="sr-only">
                      {t('applications.actions.downloadDossier')}: {application.jobTitle}
                    </span>
                  </Button>
                  <Button variant="ghost" small iconOnly icon="pencil" title={t('applications.actions.viewDetails')} onClick={() => onSelect(application.id)}>
                    <span className="sr-only">
                      {t('applications.actions.viewDetails')}: {application.jobTitle}
                    </span>
                  </Button>
                  <Button variant="danger-text" small iconOnly icon="trash" title={t('applications.actions.delete')} onClick={() => onDelete(application)}>
                    <span className="sr-only">
                      {t('applications.actions.delete')}: {application.jobTitle}
                    </span>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
