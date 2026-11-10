import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import type { ApiError } from '../../api/client'
import { saveBlob } from '../../api/download'
import { applicationsApi, DOSSIER_ARCHIVE_LIMIT } from '../../api/endpoints'
import type { ApplicationListItem } from '../../api/types'
import { AlertSlot } from '../../components/ui/AlertSlot'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { Icon } from '../../components/ui/Icon'
import { MessageSlot } from '../../components/ui/MessageSlot'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading } from '../../components/ui/Page'
import { DossierPreviewDialog } from '../tracker/DossierPreviewDialog'
import type { DossierTarget } from '../tracker/DossierPreviewDialog'
import { allApplicationsKey } from '../tracker/queries'
import { StatusBadge } from '../tracker/status'
import { chosenIds, overLimit, partialFailure, selectAllState } from './model'

/** Which button started the running download: a row (by application) or the one above the list. */
type Source = { kind: 'row'; id: string } | { kind: 'bulk' }

interface DownloadRequest {
  ids: string[]
  source: Source
}

/**
 * A label that is as wide as the longest text it can show: all texts are drawn invisibly in one grid cell, the real one on top.
 * A button that swaps "PDF" for "Wird erstellt ..." therefore keeps its size and moves nothing.
 */
function StableLabel({ text, all }: { text: string; all: readonly string[] }) {
  return (
    <span className="grid whitespace-nowrap">
      {all.map((label) => (
        <span key={label} aria-hidden="true" className="invisible col-start-1 row-start-1">
          {label}
        </span>
      ))}
      <span className="col-start-1 row-start-1">{text}</span>
    </span>
  )
}

/**
 * "Export" > "Applications": every application with the name its PDF gets, a preview and a download per row, and a selection
 * for several at once. One chosen application gives the PDF itself, two or more give one ZIP with a PDF each.
 *
 * Rigid by design: a running download shows "Wird erstellt ..." on its button without changing the button's size, and blocks every
 * other download until it is done; the line under the toolbar holds a hint or the "too many" message in the same reserved room;
 * a ZIP with missing dossiers is reported in a notice laid over the list (complete, copyable), so nothing shifts.
 */
export function ApplicationsExport() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const showError = useErrorDialog()
  const language = i18n.language.startsWith('en') ? 'en' : 'de'

  const list = useQuery({ queryKey: allApplicationsKey, queryFn: () => applicationsApi.list({}) })
  const items = list.data ?? []

  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [previewTarget, setPreviewTarget] = useState<DossierTarget | null>(null)
  const [partial, setPartial] = useState<ApiError | null>(null)
  // Set in the click itself, so a second click in the same moment cannot start a second download before the first re-render.
  const inFlight = useRef(false)

  const ids = chosenIds(items, chosen)
  const state = selectAllState(items.length, ids.length)
  const tooMany = overLimit(ids.length)

  const selectAll = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = state === 'some'
  }, [state])

  const download = useMutation({
    mutationFn: async ({ ids: wanted }: DownloadRequest) => {
      if (wanted.length === 1) {
        const { blob, filename } = await applicationsApi.downloadDossier(wanted[0]!)
        saveBlob(blob, filename)
        return { total: 1, failed: 0 }
      }
      const { blob, filename, failed } = await applicationsApi.downloadDossierArchive(wanted, language)
      saveBlob(blob, filename)
      return { total: wanted.length, failed }
    },
    onSuccess: ({ total, failed }) => {
      if (failed > 0) setPartial(partialFailure(failed, total))
    },
    onError: (error) => showError(error, t('export.errors.download')),
    onSettled: () => {
      inFlight.current = false
    },
  })

  const start = (request: DownloadRequest) => {
    if (inFlight.current || request.ids.length === 0 || overLimit(request.ids.length)) return
    inFlight.current = true
    setPartial(null)
    download.mutate(request)
  }

  const running = download.isPending ? download.variables?.source : undefined
  const rowRunning = (id: string) => running?.kind === 'row' && running.id === id

  const toggle = (id: string, on: boolean) =>
    setChosen((previous) => {
      const next = new Set(previous)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const toggleAll = (on: boolean) => setChosen(on ? new Set(items.map((item) => item.id)) : new Set())

  if (list.isPending) return <Loading />
  if (list.isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorNotice error={list.error} title={t('applications.errors.load')} />
        <Button icon="refresh" onClick={() => void list.refetch()}>
          {t('preview.retry')}
        </Button>
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon="briefcase"
        title={t('export.empty.title')}
        text={t('export.empty.text')}
        action={
          <Button variant="create" icon="plus" onClick={() => void navigate('/applications?new=1')}>
            {t('applications.newApplication')}
          </Button>
        }
      />
    )
  }

  const bulkLabel = (number: number) => t('export.bulk.download', { number })
  const busyLabel = t('export.creating')
  const hintId = 'export-selection-hint'
  const limitText = (count: number) => t('export.bulk.tooMany', { limit: DOSSIER_ARCHIVE_LIMIT, count })
  const hintText = t('export.bulk.hint')

  return (
    <div className="flex flex-col gap-4">
      <div className="card relative p-3" data-hint="export-bulk">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xs text-sm font-semibold text-ink">
            <input
              ref={selectAll}
              type="checkbox"
              className="size-4 accent-confirm"
              checked={state === 'all'}
              onChange={(event) => toggleAll(event.target.checked)}
              data-testid="export-select-all"
            />
            {t('export.selectAll')}
            <span className="font-normal text-ink-muted" data-testid="export-count">
              {t('export.selected', { chosen: ids.length, total: items.length })}
            </span>
          </label>
          <Button
            variant="confirm"
            disabled={ids.length === 0 || tooMany || download.isPending}
            aria-busy={running?.kind === 'bulk' || undefined}
            aria-describedby={tooMany ? hintId : undefined}
            onClick={() => start({ ids, source: { kind: 'bulk' } })}
            data-testid="export-bulk"
          >
            <Icon name={running?.kind === 'bulk' ? 'loader' : 'download'} size={17} className={running?.kind === 'bulk' ? 'animate-spin' : ''} />
            <StableLabel text={running?.kind === 'bulk' ? busyLabel : bulkLabel(ids.length)} all={[bulkLabel(1000), busyLabel]} />
          </Button>
        </div>
        <div className="mt-2">
          <MessageSlot id={hintId} message={tooMany ? limitText(ids.length) : hintText} danger={tooMany} reserve={[hintText, limitText(1000)]} />
        </div>
        {/* A ZIP with missing dossiers: laid over the list below the toolbar, so nothing moves. */}
        <AlertSlot error={partial} errorTitle={t('export.partial.title')} onDismiss={() => setPartial(null)} />
      </div>

      <div className="card overflow-x-auto" data-hint="export-list">
        <table className="table" data-testid="export-table">
          <thead>
            <tr>
              <th scope="col" className="w-10">
                <span className="sr-only">{t('export.columns.select')}</span>
              </th>
              <th scope="col">{t('applications.fields.company')}</th>
              <th scope="col">{t('applications.fields.jobTitle')}</th>
              <th scope="col">{t('applications.fields.status')}</th>
              <th scope="col">{t('export.columns.fileName')}</th>
              <th scope="col">{t('export.columns.version')}</th>
              <th scope="col" className="text-right">
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((application) => (
              <ExportRow
                key={application.id}
                application={application}
                checked={chosen.has(application.id)}
                onToggle={(on) => toggle(application.id, on)}
                busy={rowRunning(application.id)}
                locked={download.isPending}
                onPreview={() => setPreviewTarget({ id: application.id, company: application.company, jobTitle: application.jobTitle })}
                onDownload={() => start({ ids: [application.id], source: { kind: 'row', id: application.id } })}
              />
            ))}
          </tbody>
        </table>
      </div>

      <DossierPreviewDialog target={previewTarget} onClose={() => setPreviewTarget(null)} onDownload={(target) => start({ ids: [target.id], source: { kind: 'row', id: target.id } })} />
    </div>
  )
}

interface ExportRowProps {
  application: ApplicationListItem
  checked: boolean
  onToggle: (on: boolean) => void
  /** This row's PDF is being made. */
  busy: boolean
  /** Some download is running (this row's or another): no button starts a second one. */
  locked: boolean
  onPreview: () => void
  onDownload: () => void
}

function ExportRow({ application, checked, onToggle, busy, locked, onPreview, onDownload }: ExportRowProps) {
  const { t } = useTranslation()
  const name = `${application.company} – ${application.jobTitle}`
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          className="size-4 accent-confirm"
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={t('export.selectRow', { name })}
        />
      </td>
      <td className="font-semibold text-ink">{application.company}</td>
      <td>{application.jobTitle}</td>
      <td>
        <StatusBadge status={application.status} />
      </td>
      <td className="font-mono text-xs break-all text-ink-muted" data-testid="export-file-name">
        {application.dossierFileName || '–'}
      </td>
      <td>
        {/* Which state the PDF shows: the one filed when the application was sent, or today's. */}
        <span className={`badge ${application.hasArchivedPdf ? 'badge-info' : 'badge-neutral'}`}>
          {application.hasArchivedPdf ? t('applications.dossier.sourceArchivedBadge') : t('applications.dossier.sourceCurrentBadge')}
        </span>
      </td>
      <td>
        <div className="flex items-center justify-end gap-1.5">
          <Button small icon="fileText" onClick={onPreview} aria-label={t('export.previewRow', { name })}>
            {t('export.preview')}
          </Button>
          <Button small variant="confirm" disabled={locked} aria-busy={busy || undefined} onClick={onDownload} aria-label={t('export.downloadRow', { name })}>
            <Icon name={busy ? 'loader' : 'download'} size={15} className={busy ? 'animate-spin' : ''} />
            <StableLabel text={busy ? t('export.creating') : t('export.pdf')} all={[t('export.pdf'), t('export.creating')]} />
          </Button>
        </div>
      </td>
    </tr>
  )
}
