// Copyright (c) 2026 SushiFlux Development
// Licensed under the AGPL-3.0-only.

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { applicationsApi } from '../../api/endpoints'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { Icon } from '../../components/ui/Icon'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading, PageHeader } from '../../components/ui/Page'
import { Segmented } from '../../components/ui/Segmented'
import { SelectField } from '../../components/ui/SelectField'
import { ApplicationsTable } from '../../features/tracker/ApplicationsTable'
import { ApplicationFormDialog } from '../../features/tracker/ApplicationFormDialog'
import { KanbanBoard } from '../../features/tracker/KanbanBoard'
import { applicationDetailKey } from '../../features/tracker/queries'
import { useApplicationActions } from '../../features/tracker/useApplicationActions'
import { STATUS_ORDER } from '../../features/tracker/status'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { AttachmentsModal } from './AttachmentsModal'

type ViewMode = 'kanban' | 'list'
type MetricTone = 'neutral' | 'info' | 'highlight' | 'success' | 'warning'

const METRIC_TEXT: Record<MetricTone, string> = {
  neutral: 'text-ink',
  info: 'text-info-soft-ink',
  highlight: 'text-highlight-soft-ink',
  success: 'text-success-soft-ink',
  warning: 'text-warning-soft-ink',
}

export function ApplicationsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()

  // The filters live in the address, so the dashboard (and a bookmark) can lead to a filtered list: "?status=interview", "?followUp=1".
  // "?new=1" (the empty dashboard and the empty export page lead here) opens the form for a new application right away, and
  // "?open=<id>" opens the details of that application; both markers are removed again.
  const [params, setParams] = useSearchParams()
  const requestedStatus = params.get('status')
  const statusFilter = STATUS_ORDER.find((status) => status === requestedStatus) ?? 'all'
  const onlyFollowUpDue = params.get('followUp') === '1'
  const changeParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (value === null) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      ),
    [setParams],
  )
  const setStatusFilter = (value: string) => changeParam('status', value === 'all' ? null : value)
  const setOnlyFollowUpDue = (on: boolean) => changeParam('followUp', on ? '1' : null)

  // A filtered list is looked at as a list; the board would show one column and five empty ones.
  const [viewMode, setViewMode] = useState<ViewMode>(() => (params.get('status') ? 'list' : 'kanban'))
  const [search, setSearch] = useState('')
  const [createKey, setCreateKey] = useState(0)
  const [createOpen, setCreateOpen] = useState(() => params.get('new') === '1')
  const hasNewMarker = params.has('new')
  useEffect(() => {
    if (hasNewMarker) changeParam('new', null)
  }, [hasNewMarker, changeParam])
  const [attachmentsOpen, setAttachmentsOpen] = useState(false)
  // The search asks the server only when the typing paused, and the old list stays on screen meanwhile (no flicker).
  const debouncedSearch = useDebouncedValue(search.trim(), 300)
  const list = useQuery({
    queryKey: ['applications', 'list', statusFilter, debouncedSearch],
    queryFn: () => applicationsApi.list({ status: statusFilter === 'all' ? undefined : statusFilter, search: debouncedSearch || undefined }),
    placeholderData: keepPreviousData,
  })
  const stats = useQuery({ queryKey: ['applications', 'stats'], queryFn: applicationsApi.stats })
  // Opening, previewing, downloading and deleting an application work the same here and on the dashboard.
  const actions = useApplicationActions()

  // "?open=<id>" (a link from the dashboard) opens that application; the marker is removed at once, so a reload does not open it again.
  const openMarker = params.get('open')
  useEffect(() => {
    if (!openMarker) return
    changeParam('open', null)
    queryClient
      .fetchQuery({ queryKey: applicationDetailKey(openMarker), queryFn: () => applicationsApi.get(openMarker), staleTime: 0 })
      .then(() => actions.showDetails(openMarker))
      .catch((error: unknown) => showError(error, t('applications.errors.load')))
    // Only when the marker appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMarker])

  const applications = useMemo(() => {
    const items = list.data ?? []
    return onlyFollowUpDue ? items.filter((application) => application.isFollowUpDue) : items
  }, [list.data, onlyFollowUpDue])

  const openCreate = () => {
    setCreateKey((key) => key + 1)
    setCreateOpen(true)
  }

  const followUps = stats.data?.followUpsDue ?? 0

  return (
    <>
      <PageHeader
        title={t('applications.title')}
        subtitle={t('applications.subtitle')}
        actions={
          <>
            <Button icon="files" onClick={() => setAttachmentsOpen(true)} data-hint="applications-attachments">
              {t('applications.attachments.manage')}
            </Button>
            <Button variant="create" icon="plus" onClick={openCreate} data-hint="applications-new">
              {t('applications.newApplication')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        {followUps > 0 && (
          <div className="notice notice-warning flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Icon name="clock" size={20} className="shrink-0" />
              <span className="font-semibold">{t('applications.followUpAlert', { count: followUps })}</span>
            </div>
            {/* The label itself says the state ("show all" / "only follow-ups"); aria-pressed on top would announce it twice. */}
            <Button small onClick={() => setOnlyFollowUpDue(!onlyFollowUpDue)}>
              {onlyFollowUpDue ? t('applications.filter.showAll') : t('applications.filter.onlyFollowUp')}
            </Button>
          </div>
        )}

        {stats.isError && <ErrorNotice error={stats.error} title={t('applications.errors.stats')} />}
        {stats.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <MetricCard label={t('applications.stats.total')} count={stats.data.total} tone="neutral" />
            <MetricCard label={t('applications.stats.draft')} count={stats.data.draft} tone="neutral" />
            <MetricCard
              label={t('applications.stats.applied')}
              count={stats.data.applied + stats.data.acknowledged}
              tone="info"
              detail={stats.data.acknowledged > 0 ? t('applications.stats.ofWhichAcknowledged', { count: stats.data.acknowledged }) : undefined}
            />
            <MetricCard label={t('applications.stats.interview')} count={stats.data.interview} tone="highlight" />
            <MetricCard label={t('applications.stats.offer')} count={stats.data.offer} tone="success" />
            <MetricCard
              label={t('applications.stats.closed')}
              count={stats.data.rejected + stats.data.withdrawn}
              tone="neutral"
              detail={t('applications.stats.closedDetail', { rejected: stats.data.rejected, withdrawn: stats.data.withdrawn })}
            />
            <MetricCard label={t('applications.stats.followUpsDue')} count={stats.data.followUpsDue} tone={stats.data.followUpsDue > 0 ? 'warning' : 'neutral'} />
          </div>
        )}

        <div className="card flex flex-wrap items-end justify-between gap-3 p-3">
          <div className="flex flex-1 flex-wrap items-end gap-3">
            <div className="relative min-w-60 max-w-md flex-1">
              <label htmlFor="application-search" className="sr-only">
                {t('applications.filter.search')}
              </label>
              <Icon name="world" size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted" />
              <input
                id="application-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('applications.filter.searchPlaceholder')}
                className="input pl-9"
              />
            </div>
            <SelectField label={t('applications.filter.status')} hideLabel value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-w-52">
              <option value="all">{t('applications.filter.all')}</option>
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {t(`applications.statuses.${status}`)}
                </option>
              ))}
            </SelectField>
          </div>

          <div data-hint="applications-views">
            <Segmented<ViewMode>
              label={t('applications.views.label')}
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'kanban', label: t('applications.views.kanban'), icon: 'layoutBoard' },
                { value: 'list', label: t('applications.views.list'), icon: 'fileText' },
              ]}
            />
          </div>
        </div>

        {list.isPending ? (
          <Loading />
        ) : list.isError ? (
          <div className="flex flex-col items-start gap-3">
            <ErrorNotice error={list.error} title={t('applications.errors.load')} />
            <Button icon="refresh" onClick={() => void list.refetch()}>
              {t('preview.retry')}
            </Button>
          </div>
        ) : applications.length === 0 ? (
          <EmptyState
            icon="briefcase"
            title={t('applications.empty')}
            text={t('applications.noResults')}
            action={
              <Button variant="create" icon="plus" onClick={openCreate}>
                {t('applications.newApplication')}
              </Button>
            }
          />
        ) : viewMode === 'kanban' ? (
          <div data-hint="applications-board">
            <KanbanBoard
              applications={applications}
              {...actions.boardProps}
            />
          </div>
        ) : (
          <div data-hint="applications-board">
            <ApplicationsTable
              applications={applications}
              onSelect={actions.boardProps.onSelect}
              onDownload={actions.boardProps.onDownload}
              onDelete={(application) => void actions.askDelete(application)}
            />
          </div>
        )}
      </div>

      <ApplicationFormDialog
        key={createKey}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        coverLetters={actions.coverLetters}
        onSaved={(created) => {
          setCreateOpen(false)
          actions.showDetails(created.id)
        }}
      />

      <AttachmentsModal open={attachmentsOpen} onClose={() => setAttachmentsOpen(false)} />

      {actions.dialogs}
    </>
  )
}

function MetricCard({ label, count, tone, detail }: { label: string; count: number; tone: MetricTone; detail?: string | undefined }) {
  return (
    <div className="card flex flex-col p-3">
      <span className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{label}</span>
      <span className={`mt-1 text-2xl font-semibold tracking-tight ${METRIC_TEXT[tone]}`}>{count}</span>
      {detail && <span className="mt-0.5 text-xs text-ink-muted">{detail}</span>}
    </div>
  )
}
