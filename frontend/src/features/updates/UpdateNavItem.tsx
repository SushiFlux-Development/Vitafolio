import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router'
import { useAppState } from '../../auth/AppState'
import { Icon } from '../../components/ui/Icon'
import { isUpdateOffered, useCanManageUpdates, useUpdateStatus } from '../../hooks/useUpdates'
import { useInstallUpdate } from './useInstallUpdate'

const ITEM_CLASS =
  'notice notice-info mt-2 flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-focus'

/**
 * The "update available" entry of the navigation. Only for people who may look after updates (administrators; the one user of
 * the Windows program) and never in a development build. In the Windows program a click asks and installs (the page behind
 * it is in the settings); on a server it opens the update page with the steps for Docker and Unraid and the image tag.
 */
export function UpdateNavItem() {
  const { t } = useTranslation()
  const { bootstrap } = useAppState()
  const canManage = useCanManageUpdates()
  const status = useUpdateStatus(canManage)
  const { start, starting } = useInstallUpdate()
  const desktop = bootstrap.mode === 'desktop'

  const data = status.data
  if (!canManage || !data || !isUpdateOffered(data)) return null

  const content = (
    <>
      <Icon name="circleArrowUp" size={18} />
      <span className="min-w-0 flex-1">
        <span className="block">{t('updates.updateAvailablePill')}</span>
        <span className="block font-normal break-words">{data.available?.display}</span>
      </span>
      <span className="h-2 w-2 shrink-0 rounded-xs bg-info-soft-ink motion-safe:animate-pulse" aria-hidden="true" />
    </>
  )

  if (desktop && data.canInstall) {
    return (
      <button type="button" className={ITEM_CLASS} disabled={starting} onClick={() => void start(data)} data-testid="update-nav">
        {content}
      </button>
    )
  }
  return (
    <NavLink to={desktop ? '/settings?tab=updates' : '/admin?tab=updates'} className={ITEM_CLASS} data-testid="update-nav">
      {content}
    </NavLink>
  )
}
