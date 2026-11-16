import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAppState } from '../../auth/AppState'
import { useSidebarRail } from '../../components/layout/SidebarNav'
import { Icon } from '../../components/ui/Icon'
import { isUpdateOffered, useCanManageUpdates, useUpdateStatus } from '../../hooks/useUpdates'
import { useInstallUpdate } from './useInstallUpdate'

/** A row of the sidebar tree in the info colour, marked as a status by a straight line at its left edge. */
const ITEM_CLASS = 'tree-row accent-start mt-1 text-info-soft-ink [--accent-color:var(--info-soft-ink)] hover:text-info-soft-ink'

/**
 * The "update available" entry of the navigation. Only for people who may look after updates (administrators; the one user of
 * the Windows program) and never in a development build. In the Windows program a click asks and installs (the page behind
 * it is in the settings); on a server it opens the update page with the steps for Docker and Unraid and the image tag. In the
 * rail only the icon with its dot stays, the text moves into the tooltip.
 */
export function UpdateNavItem() {
  const { t } = useTranslation()
  const { bootstrap } = useAppState()
  const canManage = useCanManageUpdates()
  const status = useUpdateStatus(canManage)
  const { start, starting } = useInstallUpdate()
  const { rail, tip } = useSidebarRail()
  const desktop = bootstrap.mode === 'desktop'

  const data = status.data
  if (!canManage || !data || !isUpdateOffered(data)) return null

  const name = `${t('updates.updateAvailablePill')}: ${data.available?.display ?? ''}`
  const content = (
    <>
      <span className="relative shrink-0">
        <Icon name="circleArrowUp" size={20} />
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-xs bg-info-soft-ink motion-safe:animate-pulse" aria-hidden="true" />
      </span>
      <span className={rail ? 'sr-only' : 'min-w-0 flex-1'}>
        <span className="block">{t('updates.updateAvailablePill')}</span>
        <span className="block text-sm font-normal break-words">{data.available?.display}</span>
      </span>
    </>
  )

  if (desktop && data.canInstall) {
    return (
      <button type="button" className={ITEM_CLASS} disabled={starting} onClick={() => void start(data)} data-testid="update-nav" {...tip(name)}>
        {content}
      </button>
    )
  }
  return (
    <Link to={desktop ? '/settings?tab=updates' : '/admin?tab=updates'} className={ITEM_CLASS} data-testid="update-nav" {...tip(name)}>
      {content}
    </Link>
  )
}
