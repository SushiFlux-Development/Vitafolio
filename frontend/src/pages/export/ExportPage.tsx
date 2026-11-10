import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import { Button } from '../../components/ui/Button'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading, PageHeader } from '../../components/ui/Page'
import { TabPanel, Tabs, useTabParam } from '../../components/ui/Tabs'
import type { TabItem } from '../../components/ui/Tabs'
import { ApplicationsExport } from '../../features/export/ApplicationsExport'
import { PreviewTab } from '../profile/PreviewTab'

type ExportTab = 'applications' | 'cv'

const TABS: readonly ExportTab[] = ['applications', 'cv']

/**
 * "Export": the finished PDFs in one place. The first tab is every application with the file name its PDF gets (preview, one download,
 * or several at once as a ZIP); the second is the CV alone, the same preview and export as in the master profile. The tab is in the
 * address ("?tab=").
 */
export function ExportPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useTabParam(TABS)

  const tabs: TabItem<ExportTab>[] = [
    { id: 'applications', label: t('export.tabs.applications'), icon: 'briefcase' },
    { id: 'cv', label: t('export.tabs.cv'), icon: 'fileText' },
  ]

  return (
    <>
      <PageHeader title={t('export.title')} subtitle={t('export.subtitle')} />
      <div data-hint="export-tabs">
        <Tabs tabs={tabs} active={tab} onChange={setTab} label={t('export.title')} />
      </div>
      <TabPanel id={tab}>{tab === 'applications' ? <ApplicationsExport /> : <CvExport />}</TabPanel>
    </>
  )
}

/** The CV tab: the preview of the master profile with the options it remembers (the profile query is shared with the profile page). */
function CvExport() {
  const { t } = useTranslation()
  const profile = useQuery({ queryKey: ['profile'], queryFn: profileApi.get })

  if (profile.data) return <PreviewTab saved={profile.data.previewOptions} />
  if (!profile.isError) return <Loading />
  return (
    <div className="flex flex-col items-start gap-3">
      <ErrorNotice error={profile.error} title={t('profile.loadFailed')} />
      <Button icon="refresh" onClick={() => void profile.refetch()}>
        {t('preview.retry')}
      </Button>
    </div>
  )
}
