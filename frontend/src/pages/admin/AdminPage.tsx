import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/ui/Page'
import { TabPanel, Tabs, useTabParam } from '../../components/ui/Tabs'
import type { TabItem } from '../../components/ui/Tabs'
import { BackupsPanel } from '../../features/backups/BackupsPanel'
import { isUpdateOffered, useUpdateStatus } from '../../hooks/useUpdates'
import { ActivityTab } from './ActivityTab'
import { SettingsTab } from './SettingsTab'
import { UpdatesTab } from './UpdatesTab'
import { UsersTab } from './UsersTab'

type AdminTab = 'users' | 'settings' | 'updates' | 'activity' | 'backups'

/**
 * App-Administration (admins only, its own menu entry): everything that changes the instance for everybody, grouped by
 * topic. Never part of the personal settings. In the desktop program there is no such area - the single local owner
 * finds the backups in the settings.
 */
export function AdminPage() {
  const { t } = useTranslation()
  const updateOffered = isUpdateOffered(useUpdateStatus().data)

  const tabs: TabItem<AdminTab>[] = [
    { id: 'users', label: t('admin.tabs.users'), icon: 'users' },
    { id: 'settings', label: t('admin.tabs.settings'), icon: 'settings' },
    { id: 'updates', label: t('admin.tabs.updates'), icon: updateOffered ? 'circleArrowUp' : 'refresh', badge: updateOffered ? t('updates.tabBadge') : undefined },
    { id: 'activity', label: t('admin.tabs.activity'), icon: 'history' },
    { id: 'backups', label: t('admin.tabs.backups'), icon: 'database' },
  ]
  const [active, setActive] = useTabParam(tabs.map((tab) => tab.id))

  return (
    <>
      <PageHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />
      <Tabs tabs={tabs} active={active} onChange={setActive} label={t('admin.title')} />
      <TabPanel id={active}>
        {active === 'users' && <UsersTab />}
        {active === 'settings' && <SettingsTab />}
        {active === 'updates' && <UpdatesTab />}
        {active === 'activity' && <ActivityTab />}
        {active === 'backups' && <BackupsPanel />}
      </TabPanel>
    </>
  )
}
