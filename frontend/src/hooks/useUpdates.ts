import { useQuery } from '@tanstack/react-query'
import { updatesApi } from '../api/endpoints'
import type { UpdateInstallState, UpdateStatusDto } from '../api/types'
import { useAppState } from '../auth/AppState'

export const UPDATE_STATUS_KEY = ['updates', 'status'] as const

/** An install run is under way (download, backup, restart): the status is polled every second until it ends. */
export function isInstallRunning(state: UpdateInstallState | undefined): boolean {
  return state === 'downloading' || state === 'backingUp' || state === 'restarting'
}

/** A development build never offers or installs anything. */
export function isDevBuild(status: UpdateStatusDto | undefined): boolean {
  return status?.state === 'devBuild' || status?.currentChannel === 'dev'
}

/** True when the hint "update available" is due: a real update, on a build that can be updated at all. */
export function isUpdateOffered(status: UpdateStatusDto | undefined): boolean {
  return status !== undefined && status.hasUpdate && Boolean(status.available) && !isDevBuild(status) && status.state !== 'unknownVersion'
}

/**
 * Who may look after updates: on a server the administrators, in the Windows program the one local user (who is the
 * administrator of the own copy). Everybody else neither sees the hint nor the page.
 */
export function useCanManageUpdates(): boolean {
  const { bootstrap, session } = useAppState()
  return bootstrap.mode === 'desktop' || session.user?.role === 'admin'
}

/**
 * The update status. Cached for ten minutes (the server asks GitHub on its own schedule), and polled every second while an
 * install is running - also when the server stops answering during the restart, the last known state stays.
 */
export function useUpdateStatus(enabled = true) {
  return useQuery({
    queryKey: UPDATE_STATUS_KEY,
    queryFn: updatesApi.status,
    enabled,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
    retry: false,
    refetchInterval: (query) => (isInstallRunning(query.state.data?.install.state) ? 1000 : false),
  })
}
