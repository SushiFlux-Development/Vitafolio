import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { authApi } from '../../api/endpoints'
import { SIGNED_OUT, ME_KEY } from '../../auth/useAuth'
import type { Session } from '../../auth/useAuth'
import { useAppState } from '../../auth/AppState'
import { removeAccountDrafts } from '../../hooks/draftStore'
import { flushAllAutoSaves } from '../../hooks/useAutoSave'
import { useAppearance } from '../../theme/useAppearance'
import { HandbookViewer } from '../../features/help/HandbookViewer'
import { LiveHelper } from '../../features/live-helper/LiveHelper'
import { useLiveHelper } from '../../features/live-helper/useLiveHelper'
import { UpdateNavItem } from '../../features/updates/UpdateNavItem'
import { UpdateProgressDialog } from '../../features/updates/UpdateProgressDialog'
import { WhatsNewHost } from '../../features/whats-new/WhatsNewHost'
import { AiSettingsModal } from '../ai/AiSettingsModal'
import { MadeWith, VersionLabel, Wordmark } from '../ui/Brand'
import { Button } from '../ui/Button'
import { useConfirm } from '../ui/ConfirmDialog'
import { useErrorDialog } from '../ui/ErrorDialog'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import { Segmented } from '../ui/Segmented'
import { NAV_LIST_CLASS, navItemClass, SidebarNavArea, SidebarNavProvider } from './SidebarNav'

interface NavItem {
  to: string
  label: string
  icon: IconName
  end?: boolean
}

/** The data-hint of a main navigation entry ("nav-profile", "nav-guide" ...), so the live helper can point at it. */
const navHint = (to: string) => (to === '/' ? 'nav-overview' : `nav-${to.slice(1)}`)

const navLinkClass = ({ isActive }: { isActive: boolean }) => navItemClass(isActive)

/** Two letters for the avatar tile, from the display name. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? `${words[0]![0]}${words[words.length - 1]![0]}` : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

/**
 * The frame of the signed-in app: a sidebar (wordmark, navigation, user area with settings, theme switch and sign-out,
 * footer with the credit line and the running version) next to the page. Below 1024 px the page scrolls sideways - there
 * is no phone layout.
 *
 * The sidebar has a fixed height: wordmark, user area and footer keep their size and only the list of entries between them
 * scrolls, so the user area is in view at every window height. A page can swap the main navigation for its own sections
 * (see SidebarNav). The page fills the width of the window with one small even margin (layout token in index.css); the pages
 * use the room with multi-column grids (.card-grid, .field-grid), not with a narrow centred column.
 */
export function AppShell() {
  const { t } = useTranslation()
  const { bootstrap, session } = useAppState()
  const user = session.user!
  const appearance = useAppearance()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const desktop = bootstrap.mode === 'desktop'
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false)
  const [isHandbookOpen, setIsHandbookOpen] = useState(false)
  const helper = useLiveHelper()

  const signOut = useMutation({
    mutationFn: async () => {
      // Forms that save by themselves send what is still waiting first. A sign-out removes the local copies of this account, so
      // input that could not be sent would be gone for good: that is asked about.
      if (!(await flushAllAutoSaves())) {
        const leave = await confirm({ title: t('autoSave.signOut.title'), message: t('autoSave.signOut.message'), confirmLabel: t('autoSave.signOut.confirm'), tone: 'danger' })
        if (!leave) return false
      }
      await authApi.logout()
      return true
    },
    onSuccess: (done) => {
      if (!done) return
      removeAccountDrafts(user.id)
      queryClient.setQueryData<Session>(ME_KEY, SIGNED_OUT)
      // Nothing of the previous account may stay in the cache for the next one.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'bootstrap' && query.queryKey[0] !== 'version' && query.queryKey[0] !== 'me' })
      void navigate('/login', { replace: true })
    },
    onError: (error) => showError(error, t('shell.signOutFailed')),
  })

  const items: NavItem[] = [
    { to: '/', label: t('nav.overview'), icon: 'home', end: true },
    { to: '/profile', label: t('nav.profile'), icon: 'fileText' },
    { to: '/cover-letters', label: t('nav.coverLetters'), icon: 'files' },
    { to: '/applications', label: t('nav.applications'), icon: 'briefcase' },
    { to: '/export', label: t('nav.export'), icon: 'fileExport' },
    { to: '/guide', label: t('nav.guide'), icon: 'compass' },
    ...(user.role === 'admin' && !desktop ? [{ to: '/admin', label: t('nav.admin'), icon: 'userShield' as const }] : []),
  ]

  // The name of a page for the tooltip of the sub-navigation's "back" entry.
  const titleOf = useCallback(
    (pathname: string) => {
      if (pathname === '/settings') return t('nav.settings')
      if (pathname === '/admin') return t('nav.admin')
      if (pathname === '/profile') return t('nav.profile')
      if (pathname === '/cover-letters') return t('nav.coverLetters')
      if (pathname === '/applications') return t('nav.applications')
      if (pathname === '/export') return t('nav.export')
      if (pathname === '/guide') return t('nav.guide')
      return t('nav.overview')
    },
    [t],
  )

  return (
    <SidebarNavProvider titleOf={titleOf}>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-line bg-surface">
          <div className="shrink-0 px-5 pt-6 pb-5 short:pt-4 short:pb-3">
            <Wordmark height={26} />
          </div>

          <SidebarNavArea
            main={
              <nav aria-label={t('nav.label')} className={NAV_LIST_CLASS}>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass} data-hint={navHint(item.to)}>
                    <Icon name={item.icon} size={19} />
                    <span className="flex-1">{item.label}</span>
                  </NavLink>
                ))}
                <UpdateNavItem />
              </nav>
            }
            trailing={<UpdateNavItem />}
          />

          <div className="flex shrink-0 flex-col gap-3 border-t border-line px-3 py-4 short:gap-1.5 short:py-3">
            <div className="flex items-center gap-3 px-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-select text-sm font-semibold text-select-ink"
                aria-hidden="true"
              >
                {initials(user.displayName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink" data-testid="current-user" title={user.displayName}>
                  {user.displayName}
                </p>
                <p className="truncate text-xs text-ink-muted">{desktop ? t('shell.localAccount') : t(`roles.${user.role}`)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAiSettingsOpen(true)}
              data-hint="shell-ai"
              className="flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors text-left"
            >
              <Icon name="sparkles" size={19} className="text-highlight-soft-ink" />
              {t('nav.aiSettings')}
            </button>

            <button
              type="button"
              onClick={() => setIsHandbookOpen(true)}
              className="flex items-center gap-3 rounded-sm px-3 py-2 text-left text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              data-testid="open-handbook"
              data-hint="shell-handbook"
            >
              <Icon name="book" size={19} />
              {t('nav.handbook')}
            </button>

            {/* The live helper: the hints of the open page again (the introduction on a page without hints). */}
            <button
              type="button"
              onClick={helper.help}
              className="flex items-center gap-3 rounded-sm px-3 py-2 text-left text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              data-testid="open-help"
              data-hint="shell-help"
            >
              <Icon name="help" size={19} />
              {t('liveHelper.helpButton')}
            </button>

            <NavLink to="/settings" className={navLinkClass}>
              <Icon name="settings" size={19} />
              {t('nav.settings')}
            </NavLink>

            <div className="px-1">
              <Segmented
                label={t('shell.theme')}
                value={appearance.preference}
                onChange={appearance.setTheme}
                options={[
                  { value: 'light', label: t('settings.theme.light'), icon: 'sun' },
                  { value: 'dark', label: t('settings.theme.dark'), icon: 'moon' },
                ]}
                compact
              />
            </div>

            {!desktop && (
              // A real button of its own size (not a box across the sidebar), on the left edge of the rows above it.
              <Button small icon="logout" busy={signOut.isPending} className="self-start" data-testid="sign-out" onClick={() => signOut.mutate()}>
                {t('nav.signOut')}
              </Button>
            )}
          </div>

          <footer className="flex shrink-0 flex-col items-center gap-1 border-t border-line px-4 py-3 text-center text-xs text-ink-muted">
            <MadeWith />
            {/* The running version leads to the page with licence, source code and the notes of this version; the text is shown whole. */}
            <Link to="/settings?tab=about" className="w-fit max-w-full rounded-xs break-words text-ink-muted tabular-nums underline-offset-2 hover:text-ink hover:underline" title={t('shell.versionLink')}>
              <VersionLabel />
            </Link>
          </footer>
        </aside>

        <main className="min-w-0 flex-1 bg-bg">
          {/* The page fills the whole width of the window; the one margin on all four sides is a layout token (index.css). */}
          <div className="w-full p-(--page-gutter)">
            <Outlet />
          </div>
        </main>

        <AiSettingsModal open={isAiSettingsOpen} onClose={() => setIsAiSettingsOpen(false)} />
        <HandbookViewer open={isHandbookOpen} onClose={() => setIsHandbookOpen(false)} />
        <UpdateProgressDialog />
        <LiveHelper helper={helper} onOpenHandbook={() => setIsHandbookOpen(true)} />
        <WhatsNewHost />
      </div>
    </SidebarNavProvider>
  )
}
