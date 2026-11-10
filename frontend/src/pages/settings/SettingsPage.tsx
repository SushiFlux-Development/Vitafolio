import { useTranslation } from 'react-i18next'
import { useAppState } from '../../auth/AppState'
import { PageHeader } from '../../components/ui/Page'
import { TabPanel, Tabs, useTabParam } from '../../components/ui/Tabs'
import type { TabItem } from '../../components/ui/Tabs'
import { BackupsPanel } from '../../features/backups/BackupsPanel'
import { isUpdateOffered, useUpdateStatus } from '../../hooks/useUpdates'
import { UpdatesTab } from '../admin/UpdatesTab'
import { AboutTab } from './AboutTab'
import { AppearanceTab } from './AppearanceTab'
import { SecurityTab } from './SecurityTab'

type SettingsTab = 'appearance' | 'security' | 'updates' | 'backups' | 'about'

/**
 * Einstellungen: the user's own options only, grouped by topic in tabs (the active tab is in the address). The security
 * tab only exists where there are accounts (server). The desktop program has no administration area for its single local
 * owner, so the update page and the backups sit here instead. "About" (licence, source code, notes of this version) is for everybody.
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const { bootstrap } = useAppState()
  const desktop = bootstrap.mode === 'desktop'

  const status = useUpdateStatus(desktop)
  const updateOffered = desktop && isUpdateOffered(status.data)

  const tabs: TabItem<SettingsTab>[] = [
    { id: 'appearance', label: t('settings.tabs.appearance'), icon: 'palette' },
    ...(desktop
      ? [
          { id: 'updates' as const, label: t('settings.tabs.updates'), icon: updateOffered ? ('circleArrowUp' as const) : ('refresh' as const), badge: updateOffered ? t('updates.tabBadge') : undefined },
          { id: 'backups' as const, label: t('settings.tabs.backups'), icon: 'database' as const },
        ]
      : [{ id: 'security' as const, label: t('settings.tabs.security'), icon: 'shieldLock' as const }]),
    { id: 'about', label: t('settings.tabs.about'), icon: 'infoCircle' },
  ]
  const [active, setActive] = useTabParam(tabs.map((tab) => tab.id))

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div data-hint="settings-tabs">
        <Tabs tabs={tabs} active={active} onChange={setActive} label={t('settings.title')} />
      </div>
      <TabPanel id={active}>
        {active === 'appearance' && <AppearanceTab />}
        {active === 'security' && <SecurityTab />}
        {active === 'updates' && <UpdatesTab />}
        {active === 'backups' && <BackupsPanel />}
        {active === 'about' && <AboutTab />}
      </TabPanel>
    </>
  )
}
