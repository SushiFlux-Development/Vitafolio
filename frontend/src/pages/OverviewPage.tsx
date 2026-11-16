import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { applicationsApi } from '../api/endpoints'
import type { ApplicationListItem } from '../api/types'
import { useAppState, useUser } from '../auth/AppState'
import { Button } from '../components/ui/Button'
import { Logo } from '../components/ui/Brand'
import { Icon } from '../components/ui/Icon'
import { ErrorNotice, Notice } from '../components/ui/Notice'
import { Loading } from '../components/ui/Page'
import { dueFollowUps } from '../features/dashboard/model'
import { KanbanBoard } from '../features/tracker/KanbanBoard'
import { allApplicationsKey } from '../features/tracker/queries'
import { useApplicationActions } from '../features/tracker/useApplicationActions'
import { useDateFormat } from '../hooks/useDateFormat'

const NEW_APPLICATION = '/applications?new=1'

/**
 * The start page: the welcome with the two things done most (a new application, the export), the first steps while there is no
 * application yet, a compact strip with the follow-ups that are due (only when there are any), and below it the real tracker board -
 * the same component and the same behaviour as on the applications page (open a card, change the status in the details, preview and
 * download), over the full width. The board scrolls sideways inside itself when the window is narrow; the page does not.
 */
export function OverviewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { bootstrap } = useAppState()
  const user = useUser()
  const desktop = bootstrap.mode === 'desktop'
  const actions = useApplicationActions()

  const list = useQuery({ queryKey: allApplicationsKey, queryFn: () => applicationsApi.list({}) })
  const items = list.data ?? []

  return (
    <div className="flex flex-col gap-6">
      {/* The welcome: a calm block on the page under a 1px line, the logo on its plate and a straight accent line under the text. */}
      <section className="flex flex-wrap items-center gap-x-6 gap-y-5 border-b border-line pb-6" aria-label={t('overview.welcomeLabel')}>
        <Logo size={56} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.75rem] leading-tight">{t('overview.welcome', { name: user.displayName })}</h1>
          <p className="mt-1.5 max-w-xl leading-relaxed text-ink-muted">{t('brand.subline')}</p>
          <div className="mt-4 h-[3px] w-12 bg-indicator" aria-hidden="true" />
        </div>
        <div className="flex shrink-0 items-center gap-2" data-hint="overview-actions">
          <Button variant="create" icon="plus" onClick={() => void navigate(NEW_APPLICATION)}>
            {t('applications.newApplication')}
          </Button>
          <Button icon="fileExport" onClick={() => void navigate('/export')}>
            {t('nav.export')}
          </Button>
        </div>
      </section>

      {/* Known from the first frame (it is part of the session), so it never pushes the page down later. */}
      {!desktop && !user.twoFactorEnabled && (
        <Notice tone="warning">
          {t('overview.twoFactor.notice')}{' '}
          <Link to="/settings?tab=security" className="font-semibold underline">
            {t('overview.twoFactor.setUp')}
          </Link>
        </Notice>
      )}

      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorNotice error={list.error} title={t('applications.errors.load')} />
          <Button icon="refresh" onClick={() => void list.refetch()}>
            {t('preview.retry')}
          </Button>
        </div>
      ) : (
        <>
          {items.length === 0 && <GettingStarted />}
          <FollowUps items={items} />
          <section className="flex flex-col gap-3" aria-label={t('overview.board.title')}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base">{t('overview.board.title')}</h2>
              <Link to="/applications" className="text-sm font-semibold">
                {t('overview.board.open')}
              </Link>
            </div>
            {/* The board with all its columns, also while they are empty: it is what the applications page shows. */}
            <div data-hint="overview-board">
              <KanbanBoard applications={items} {...actions.boardProps} />
            </div>
          </section>
        </>
      )}

      {actions.dialogs}
    </div>
  )
}

/** The follow-ups that are due, compact: one line each, every line leads to the application. Nothing is shown when none is due. */
function FollowUps({ items }: { items: readonly ApplicationListItem[] }) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  const due = dueFollowUps(items)
  if (due.length === 0) return null
  return (
    <section className="card accent-start p-4 [--accent-color:var(--warning-soft-ink)]" aria-label={t('overview.next.title')} data-hint="overview-next">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base">
          <Icon name="clock" size={18} className="text-warning-soft-ink" />
          {t('overview.next.title')}
        </h2>
        <Link to="/applications?followUp=1" className="text-sm font-semibold">
          {t('overview.next.all')}
        </Link>
      </div>
      <ul className="card-grid gap-x-4 gap-y-1 [--card-min:22rem]">
        {due.map((application) => (
          <li key={application.id}>
            <Link
              to={`/applications?open=${encodeURIComponent(application.id)}`}
              className="group flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="font-semibold break-words text-ink">{application.jobTitle}</span>
                <span className="text-ink-muted"> · {application.company}</span>
                <span className="block text-xs text-ink-muted">
                  {application.followUpAt ? t('overview.next.followUp', { date: dates.date(application.followUpAt) }) : t('overview.next.followUpNoDate')}
                </span>
              </span>
              <Icon name="chevronRight" size={18} className="shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Without an application: the three steps to the first one, each a link to where it is done. */
function GettingStarted() {
  const { t } = useTranslation()
  const steps = [
    { id: 'profile', to: '/profile', icon: 'fileText' },
    { id: 'guide', to: '/guide', icon: 'compass' },
    { id: 'application', to: NEW_APPLICATION, icon: 'briefcase' },
  ] as const
  return (
    <section className="flex flex-col gap-3" aria-label={t('overview.start.title')}>
      <div>
        <h2 className="text-base">{t('overview.start.title')}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t('overview.start.text')}</p>
      </div>
      <div className="card-grid [--card-min:16rem]" data-testid="getting-started">
        {steps.map((step, index) => (
          <Link
            key={step.id}
            to={step.to}
            className="card group flex items-start gap-3 p-4 transition-colors hover:border-line-strong hover:bg-surface-2"
            data-testid={`start-${step.id}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-select text-select-ink">
              <Icon name={step.icon} size={21} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('overview.start.step', { number: index + 1 })}</span>
              <span className="mt-0.5 block font-semibold text-ink">{t(`overview.start.steps.${step.id}.title`)}</span>
              <span className="mt-1 block text-sm text-ink-muted">{t(`overview.start.steps.${step.id}.text`)}</span>
            </span>
            <Icon name="chevronRight" size={18} className="mt-1 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </section>
  )
}
