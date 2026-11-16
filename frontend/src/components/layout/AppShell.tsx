import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { authApi } from '../../api/endpoints'
import { SIGNED_OUT, ME_KEY } from '../../auth/useAuth'
import type { Session } from '../../auth/useAuth'
import { useAppState } from '../../auth/AppState'
import { branding } from '../../branding'
import { removeAccountDrafts } from '../../hooks/draftStore'
import { flushAllAutoSaves } from '../../hooks/useAutoSave'
import { useVersion } from '../../hooks/useVersion'
import { useAppearance } from '../../theme/useAppearance'
import { HandbookViewer } from '../../features/help/HandbookViewer'
import { LiveHelper } from '../../features/live-helper/LiveHelper'
import { useLiveHelper } from '../../features/live-helper/useLiveHelper'
import { UpdateNavItem } from '../../features/updates/UpdateNavItem'
import { UpdateProgressDialog } from '../../features/updates/UpdateProgressDialog'
import { WhatsNewHost } from '../../features/whats-new/WhatsNewHost'
import { AiSettingsModal } from '../ai/AiSettingsModal'
import { Logo, Wordmark } from '../ui/Brand'
import { Button } from '../ui/Button'
import { useConfirm } from '../ui/ConfirmDialog'
import { useErrorDialog } from '../ui/ErrorDialog'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/Icon'
import { Segmented } from '../ui/Segmented'
import { SidebarNavProvider, SidebarRailProvider, TreeButton, TreeLink, TreeSubs, useSidebarCollapsed, useSidebarRail, useSidebarSection } from './SidebarNav'

interface NavItem {
  to: string
  label: string
  icon: IconName
  /** Only the address itself counts as this entry (the overview at "/"). */
  end?: boolean
  /** The page hands its sub-pages to the sidebar (useSidebarNav): the row has a chevron and unfolds them while it is open. */
  subPages?: boolean
}

/** The data-hint of a main navigation entry ("nav-profile", "nav-guide" ...), so the live helper can point at it. */
const navHint = (to: string) => (to === '/' ? 'nav-overview' : `nav-${to.slice(1)}`)

/** True when the address is this entry's page (or a page below it). */
function isAt(pathname: string, item: Pick<NavItem, 'to' | 'end'>): boolean {
  if (item.end || item.to === '/') return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

/** Two letters for the avatar tile, from the display name. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? `${words[0]![0]}${words[words.length - 1]![0]}` : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

/**
 * The frame of the signed-in app: the sidebar next to the page. Below 1024 px the page scrolls sideways - there is no phone
 * layout. There is no page footer: the version, the credit line and the licences are on the About page, which the small info
 * icon at the foot of the sidebar opens.
 *
 * The sidebar is one tree (see SidebarNav): wordmark and the collapse button on top, the overview, the sections, a line, the
 * secondary entries; pinned at the foot what applies to everything (administration, settings) and the user area. It has a
 * fixed height and only the list between top and foot scrolls, so the user area is in view at every window height. Collapsed it
 * is a slim icon rail (remembered per browser) and the page takes the freed width. The page fills the width of the window with
 * one small even margin (layout token in index.css).
 */
export function AppShell() {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false)
  const [isHandbookOpen, setIsHandbookOpen] = useState(false)
  const helper = useLiveHelper()

  return (
    <SidebarNavProvider>
      <div className="flex min-h-screen">
        <SidebarRailProvider rail={collapsed}>
          <Sidebar
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            onOpenAiSettings={() => setIsAiSettingsOpen(true)}
            onOpenHandbook={() => setIsHandbookOpen(true)}
            onHelp={helper.help}
          />
        </SidebarRailProvider>

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

interface SidebarProps {
  collapsed: boolean
  onToggleCollapsed: () => void
  onOpenAiSettings: () => void
  onOpenHandbook: () => void
  onHelp: () => void
}

function Sidebar({ collapsed, onToggleCollapsed, onOpenAiSettings, onOpenHandbook, onHelp }: SidebarProps) {
  const { t } = useTranslation()
  const { bootstrap, session } = useAppState()
  const user = session.user!
  const desktop = bootstrap.mode === 'desktop'
  const { pathname, search } = useLocation()
  const section = useSidebarSection()
  const { rail, tip, hideTip } = useSidebarRail()

  const sections: NavItem[] = [
    { to: '/profile', label: t('nav.profile'), icon: 'fileText', subPages: true },
    { to: '/cover-letters', label: t('nav.coverLetters'), icon: 'files' },
    { to: '/applications', label: t('nav.applications'), icon: 'briefcase' },
    { to: '/export', label: t('nav.export'), icon: 'fileExport' },
  ]

  const entry = (item: NavItem) => {
    const inside = isAt(pathname, item)
    // The open section unfolds its sub-pages (never in the rail); the row itself is the current page only without them.
    const subs = item.subPages && inside && !rail ? section : null
    const open = subs !== null
    const current = inside && !(subs !== null && subs.activeId !== null)
    return (
      <div key={item.to}>
        <TreeLink
          // Inside the section the row keeps the sub-page that is open instead of starting it over.
          to={inside ? `${pathname}${search}` : item.to}
          icon={item.icon}
          label={item.label}
          current={current}
          inside={inside}
          expanded={item.subPages ? open : undefined}
          hint={navHint(item.to)}
        />
        {subs && <TreeSubs section={subs} />}
      </div>
    )
  }

  const toggleLabel = collapsed ? t('nav.expand') : t('nav.collapse')

  return (
    <aside id="sidebar" className="sidebar sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-surface" data-rail={rail ? 'true' : undefined}>
      {/* Wordmark and the collapse button share the top row; in the rail the logo plate sits above the button. */}
      <div className={`flex shrink-0 gap-1 pt-4 pb-3 short:pt-3 short:pb-2 ${rail ? 'flex-col items-center px-2' : 'items-center justify-between pr-2 pl-5'}`}>
        {rail ? <Logo size={32} /> : <Wordmark height={26} />}
        <button
          type="button"
          className="tree-icon-btn"
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          aria-controls="sidebar"
          onClick={() => {
            hideTip()
            onToggleCollapsed()
          }}
          data-hint="shell-collapse"
          data-testid="sidebar-collapse"
          {...tip(toggleLabel, true)}
        >
          <Icon name={collapsed ? 'layoutSidebarLeftExpand' : 'layoutSidebarLeftCollapse'} size={22} />
        </button>
      </div>

      <nav aria-label={t('nav.label')} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-1" onScroll={hideTip}>
        {entry({ to: '/', label: t('nav.overview'), icon: 'home', end: true })}
        {sections.map(entry)}
        <div className="tree-sep" aria-hidden="true" />
        {entry({ to: '/guide', label: t('nav.guide'), icon: 'compass' })}
        <TreeButton icon="sparkles" label={t('nav.aiSettings')} onClick={onOpenAiSettings} iconClassName="text-highlight-soft-ink" hint="shell-ai" />
        <TreeButton icon="book" label={t('nav.handbook')} onClick={onOpenHandbook} hint="shell-handbook" testId="open-handbook" />
        {/* The live helper: the hints of the open page again (the introduction on a page without hints). */}
        <TreeButton icon="help" label={t('liveHelper.helpButton')} onClick={onHelp} hint="shell-help" testId="open-help" />
        <UpdateNavItem />
      </nav>

      {/* What applies to everything: the administration of the instance and the own settings. */}
      <div className="shrink-0 border-t border-line px-3 py-2 short:py-1">
        {user.role === 'admin' && !desktop && entry({ to: '/admin', label: t('nav.admin'), icon: 'userShield' })}
        {entry({ to: '/settings', label: t('nav.settings'), icon: 'settings' })}
      </div>

      <UserArea />
    </aside>
  )
}

/** Name and role, the theme switch, sign-out and the way to the About page. In the rail: the same, icons only. */
function UserArea() {
  const { t } = useTranslation()
  const { bootstrap, session } = useAppState()
  const user = session.user!
  const desktop = bootstrap.mode === 'desktop'
  const appearance = useAppearance()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const version = useVersion()
  const { rail, tip } = useSidebarRail()

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

  const role = desktop ? t('shell.localAccount') : t(`roles.${user.role}`)
  const about = t('about.title', { product: branding.name })
  const aboutTip = version.data ? `${about} · ${version.data.version || version.data.short}` : about

  return (
    <div className={`flex shrink-0 flex-col gap-3 border-t border-line py-3 short:gap-2 short:py-2 ${rail ? 'items-center px-2' : 'px-3'}`}>
      <div className={`flex min-h-12 items-center gap-3 ${rail ? 'justify-center' : 'px-2'}`} {...tip(`${user.displayName} · ${role}`)}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-select text-sm font-semibold text-select-ink" aria-hidden="true">
          {initials(user.displayName)}
        </span>
        <div className={rail ? 'sr-only' : 'min-w-0'}>
          {/* The whole name, wrapped where it is long: never cut off. */}
          <p className="text-sm font-semibold break-words text-ink" data-testid="current-user">
            {user.displayName}
          </p>
          <p className="text-xs break-words text-ink-muted">{role}</p>
        </div>
      </div>

      <div className={rail ? 'w-12' : 'w-full'}>
        <Segmented
          // A new bar for the rail: it is measured before it is painted, so it never shows a row that does not fit for a frame.
          key={rail ? 'rail' : 'full'}
          label={t('shell.theme')}
          value={appearance.preference}
          onChange={appearance.setTheme}
          options={[
            { value: 'light', label: t('settings.theme.light'), icon: 'sun' },
            { value: 'dark', label: t('settings.theme.dark'), icon: 'moon' },
          ]}
          compact
          tip={(label) => tip(label, true)}
        />
      </div>

      <div className={`flex items-center gap-2 ${rail ? 'flex-col' : ''}`}>
        {!desktop &&
          // A real button of its own size (not a box across the sidebar).
          (rail ? (
            <Button small iconOnly icon="logout" busy={signOut.isPending} data-testid="sign-out" onClick={() => signOut.mutate()} {...tip(t('nav.signOut'))}>
              <span className="sr-only">{t('nav.signOut')}</span>
            </Button>
          ) : (
            <Button small icon="logout" busy={signOut.isPending} data-testid="sign-out" onClick={() => signOut.mutate()}>
              {t('nav.signOut')}
            </Button>
          ))}
        <Link
          to="/settings?tab=about"
          className={`tree-icon-btn ${rail ? '' : 'ml-auto'}`}
          aria-label={t('shell.versionLink', { product: branding.name })}
          data-testid="open-about"
          {...tip(aboutTip, true)}
        >
          <Icon name="infoCircle" size={20} />
        </Link>
      </div>
    </div>
  )
}
