import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { applicationsApi } from '../../api/endpoints'
import type { Application, ApplicationStatus, CoverLetterListItem } from '../../api/types'
import { AiAssistantModal } from '../../components/ai/AiAssistantModal'
import { AlertSlot } from '../../components/ui/AlertSlot'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { Icon } from '../../components/ui/Icon'
import { LiveTextField } from '../../components/ui/LiveTextField'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { TabPanel, Tabs } from '../../components/ui/Tabs'
import type { TabItem } from '../../components/ui/Tabs'
import { useDateFormat } from '../../hooks/useDateFormat'
import { noRule, requiredField } from '../../validation/rules'
import { ApplicationFormDialog } from './ApplicationFormDialog'
import { isAdjusted } from './cvSelection'
import type { KnownIds } from './cvSelection'
import { useKnownProfileIds } from './queries'
import { describeSelection } from './selectionSummary'
import { STATUS_ORDER, StatusBadge } from './status'

type DetailsTab = 'details' | 'timeline' | 'dossier'

interface ApplicationDetailsDialogProps {
  app: Application
  /** The cover letters the edit form offers. */
  coverLetters: readonly Pick<CoverLetterListItem, 'id' | 'title'>[]
  onClose: () => void
  onDelete: () => void
  onDownload: () => void
  onPreview: () => void
}

/** The two "could not freeze the dossier" answers the server attaches to an application (translated like error codes). */
const ARCHIVE_WARNINGS = ['archive.failed', 'archive.attachments_unavailable'] as const

/**
 * Everything about one application: details, timeline and dossier. Every action that changes something reports a failure in
 * the error dialog (complete and copyable); the freeze warnings of the server stay visible at a fixed place.
 */
export function ApplicationDetailsDialog({ app, coverLetters, onClose, onDelete, onDownload, onPreview }: ApplicationDetailsDialogProps) {
  const { t } = useTranslation()
  const dates = useDateFormat()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const confirm = useConfirm()
  const known = useKnownProfileIds(true)
  const [tab, setTab] = useState<DetailsTab>('details')
  const [aiOpen, setAiOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [warning, setWarning] = useState<Application['archiveWarning']>(null)

  const [eventTitle, setEventTitle] = useState('')
  const [eventNote, setEventNote] = useState('')
  const [eventStatus, setEventStatus] = useState<ApplicationStatus>(app.status)
  const [eventAttempted, setEventAttempted] = useState(false)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['applications'] })

  const changeStatus = useMutation({
    mutationFn: (status: ApplicationStatus) => applicationsApi.updateStatus(app.id, { status }),
    onSuccess: (updated) => {
      setWarning(updated.archiveWarning ?? null)
      refresh()
    },
    onError: (error) => showError(error, t('applications.errors.status')),
  })

  const addEvent = useMutation({
    mutationFn: () => applicationsApi.addEvent(app.id, { title: eventTitle.trim(), note: eventNote.trim() || null, status: eventStatus, date: new Date().toISOString() }),
    onSuccess: () => {
      setEventTitle('')
      setEventNote('')
      setEventAttempted(false)
      refresh()
    },
    onError: (error) => showError(error, t('applications.errors.addEvent')),
  })

  const deleteEvent = useMutation({
    mutationFn: (eventId: string) => applicationsApi.deleteEvent(app.id, eventId),
    onSuccess: refresh,
    onError: (error) => showError(error, t('applications.errors.deleteEvent')),
  })

  const archive = useMutation({
    mutationFn: (replace: boolean) => applicationsApi.archiveSnapshot(app.id, replace),
    onSuccess: (updated) => {
      setWarning(updated.archiveWarning ?? null)
      refresh()
    },
    onError: (error) => showError(error, t('applications.errors.archive')),
  })

  // A new snapshot replaces the one that was frozen when the application was sent - only on purpose.
  const archiveNow = async () => {
    if (app.hasArchivedPdf) {
      const ok = await confirm({
        title: t('applications.dossier.replaceTitle'),
        message: t('applications.dossier.replaceMessage', { company: app.company, jobTitle: app.jobTitle }),
        confirmLabel: t('applications.dossier.replaceConfirm'),
        tone: 'danger',
      })
      if (!ok) return
    }
    archive.mutate(app.hasArchivedPdf)
  }

  const removeEvent = async (eventId: string, title: string | null) => {
    const ok = await confirm({
      title: t('applications.timeline.deleteTitle'),
      message: t('applications.timeline.deleteConfirm', { title: title ?? '' }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (ok) deleteEvent.mutate(eventId)
  }

  const submitEvent = () => {
    setEventAttempted(true)
    if (eventTitle.trim() === '') return
    addEvent.mutate()
  }

  const tabs: TabItem<DetailsTab>[] = [
    { id: 'details', label: t('applications.detailsTitle') },
    { id: 'timeline', label: t('applications.timeline.title'), badge: app.events?.length ?? 0 },
    { id: 'dossier', label: t('applications.dossier.title'), badge: app.hasArchivedPdf ? t('applications.dossier.snapshotBadge') : undefined },
  ]

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${app.jobTitle} – ${app.company}`}
      size="lg"
      // The timeline form inside may hold a half-typed event: a click beside the dialog must not throw it away.
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="danger-outline" icon="trash" className="mr-auto" onClick={onDelete}>
            {t('applications.actions.delete')}
          </Button>
          <Button icon="pencil" onClick={() => setEditOpen(true)}>
            {t('applications.actions.edit')}
          </Button>
          <Button onClick={onClose}>{t('common.close')}</Button>
          <Button variant="confirm" icon="download" onClick={onDownload}>
            {t('applications.dossier.download')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-line bg-surface-2 p-3">
          <SelectField
            label={t('applications.fields.status')}
            value={app.status}
            disabled={changeStatus.isPending}
            onChange={(event) => changeStatus.mutate(event.target.value as ApplicationStatus)}
            className="min-w-56"
          >
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {t(`applications.statuses.${status}`)}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-wrap items-center gap-2 pb-1 text-xs text-ink-muted">
            <StatusBadge status={app.status} />
            {app.appliedAt && (
              <span>
                {t('applications.fields.appliedAt')}: <strong className="text-ink">{dates.date(app.appliedAt)}</strong>
              </span>
            )}
            {app.followUpAt && (
              <span>
                {t('applications.fields.followUpAt')}: <strong className="text-ink">{dates.date(app.followUpAt)}</strong>
              </span>
            )}
            {app.isFollowUpDue && (
              <span className="badge badge-warning">
                <Icon name="clock" size={12} />
                {t('applications.stats.followUpsDue')}
              </span>
            )}
          </div>
        </div>

        <AlertSlot plain reserve={ARCHIVE_WARNINGS.map((code) => t(`errors.codes.${code}`))}>
          {warning && <Notice tone="warning">{t(`errors.codes.${warning}`)}</Notice>}
        </AlertSlot>

        <div>
          <Tabs tabs={tabs} active={tab} onChange={setTab} label={t('applications.detailsTitle')} />
          <TabPanel id={tab}>
            {tab === 'details' && <DetailsPanel app={app} known={known} onAnalyze={() => setAiOpen(true)} />}

            {tab === 'timeline' && (
              <div className="flex flex-col gap-4">
                <form
                  noValidate
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitEvent()
                  }}
                  className="rounded-md border border-line bg-surface-2 p-3"
                >
                  <h3 className="mb-2 text-xs font-semibold tracking-wider text-ink uppercase">{t('applications.timeline.addEvent')}</h3>
                  <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-3">
                    <LiveTextField
                      className="sm:col-span-2"
                      label={t('applications.timeline.eventTitle')}
                      value={eventTitle}
                      onValueChange={setEventTitle}
                      check={requiredField}
                      attempted={eventAttempted}
                      placeholder={t('applications.timeline.eventTitlePlaceholder')}
                    />
                    <SelectField label={t('applications.timeline.status')} value={eventStatus} onChange={(event) => setEventStatus(event.target.value as ApplicationStatus)}>
                      {STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {t(`applications.statuses.${status}`)}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div className="flex items-start gap-3">
                    <LiveTextField className="flex-1" label={t('applications.timeline.note')} value={eventNote} onValueChange={setEventNote} check={noRule} />
                    <Button type="submit" variant="confirm" icon="plus" busy={addEvent.isPending} className="mt-[1.625rem]">
                      {t('common.add')}
                    </Button>
                  </div>
                </form>

                {app.events && app.events.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {app.events.map((event) => (
                      <li key={event.id} className="card flex items-start justify-between gap-3 p-3">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 rounded-sm bg-surface-2 p-1.5 text-ink-muted">
                            <Icon name="calendarTime" size={14} />
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-ink">{event.title}</span>
                              <StatusBadge status={event.status} />
                            </div>
                            {event.note && <p className="mt-1 text-xs text-ink-muted">{event.note}</p>}
                            <span className="mt-1 block text-xs text-ink-muted">{dates.dateTime(event.date)}</span>
                          </div>
                        </div>
                        <Button variant="danger-text" small iconOnly icon="trash" title={t('common.delete')} onClick={() => void removeEvent(event.id, event.title)}>
                          <span className="sr-only">
                            {t('common.delete')}: {event.title}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-ink-muted">{t('applications.timeline.noEvents')}</p>
                )}
              </div>
            )}

            {tab === 'dossier' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{t('applications.dossier.title')}</h3>
                      <p className="mt-0.5 text-xs text-ink-muted">{app.hasArchivedPdf ? t('applications.dossier.frozenHint') : t('applications.dossier.liveHint')}</p>
                    </div>
                    <span className={`badge ${app.hasArchivedPdf ? 'badge-info' : 'badge-neutral'}`}>
                      {app.hasArchivedPdf ? t('applications.dossier.frozenBadge') : t('applications.dossier.liveBadge')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="confirm" icon="download" onClick={onDownload}>
                      {t('applications.dossier.download')}
                    </Button>
                    <Button icon="fileText" onClick={onPreview}>
                      {t('applications.dossier.preview')}
                    </Button>
                    <Button variant="ghost" icon="refresh" busy={archive.isPending} onClick={() => void archiveNow()}>
                      {t('applications.dossier.archiveNow')}
                    </Button>
                  </div>
                </div>

                <dl className="card grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 p-4 text-sm">
                  <dt className="text-ink-muted">{t('applications.fields.cvDesign')}</dt>
                  <dd className="text-right font-semibold text-ink">{t(`profile.preview.designs.${app.cvDesign}`, { defaultValue: app.cvDesign })}</dd>
                  <dt className="text-ink-muted">{t('applications.fields.cvLanguage')}</dt>
                  <dd className="text-right font-semibold text-ink">{app.cvLanguage === 'en' ? t('profile.preview.languageEn') : t('profile.preview.languageDe')}</dd>
                  <dt className="text-ink-muted">{t('applications.fields.includeCoverSheet')}</dt>
                  <dd className="text-right font-semibold text-ink">{app.includeCoverSheet ? t('common.yes') : t('common.no')}</dd>
                  <dt className="text-ink-muted">{t('applications.fields.coverLetter')}</dt>
                  <dd className="text-right font-semibold text-ink">{app.coverLetterTitle || t('applications.fields.noCoverLetter')}</dd>
                  <dt className="text-ink-muted">{t('applications.content.title')}</dt>
                  <dd className="text-right font-semibold text-ink">{describeSelection(t, app.cvSelection, known)}</dd>
                  <dt className="text-ink-muted">{t('applications.attachments.label')}</dt>
                  <dd className="text-right font-semibold text-ink">
                    {app.attachmentIds?.length ? t('applications.attachments.count', { count: app.attachmentIds.length }) : t('applications.attachments.noneAttached')}
                  </dd>
                </dl>
              </div>
            )}
          </TabPanel>
        </div>
      </div>

      {/* Mounted only while it is open, so every opening starts from the stored application. */}
      {editOpen && <ApplicationFormDialog open onClose={() => setEditOpen(false)} coverLetters={coverLetters} application={app} onSaved={() => setEditOpen(false)} />}

      <AiAssistantModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        task="analyze_job"
        initialJobTitle={app.jobTitle}
        initialCompany={app.company}
        initialJobDescription={app.jobDescription || ''}
      />
    </Dialog>
  )
}

function DetailsPanel({ app, known, onAnalyze }: { app: Application; known: KnownIds | undefined; onAnalyze: () => void }) {
  const { t } = useTranslation()
  const adjusted = isAdjusted(app.cvSelection, known)
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-md border border-line bg-surface-2 p-3">
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">
            {t('applications.fields.company')} &amp; {t('applications.fields.location')}
          </h3>
          <p className="font-semibold text-ink">{app.company}</p>
          <p className="text-ink-muted">{app.location || '–'}</p>
          {app.salaryExpectation && (
            <p className="mt-2 text-xs text-ink-muted">
              {t('applications.fields.salaryExpectation')}: <strong className="text-ink">{app.salaryExpectation}</strong>
            </p>
          )}
          {app.jobPostingUrl && /^https?:\/\//i.test(app.jobPostingUrl) && (
            <p className="mt-2 text-xs">
              <a href={app.jobPostingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                {t('applications.fields.jobPostingUrl')}
                <Icon name="world" size={12} />
              </a>
            </p>
          )}
        </section>

        <section className="rounded-md border border-line bg-surface-2 p-3">
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('applications.fields.contactPerson')}</h3>
          <p className="font-semibold text-ink">{app.contactPerson || '–'}</p>
          {app.contactEmail && (
            <p className="mt-1 text-xs text-ink-muted">
              {t('applications.contact.email')}:{' '}
              <a href={`mailto:${app.contactEmail}`} className="underline">
                {app.contactEmail}
              </a>
            </p>
          )}
          {app.contactPhone && (
            <p className="mt-0.5 text-xs text-ink-muted">
              {t('applications.contact.phone')}:{' '}
              <a href={`tel:${app.contactPhone}`} className="underline">
                {app.contactPhone}
              </a>
            </p>
          )}
        </section>
      </div>

      <div className="notice notice-highlight flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <Icon name="sparkles" size={18} className="shrink-0" />
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase">{t('ai.tasks.analyzeJob')}</h3>
            <p className="mt-0.5 text-xs">{t('applications.ai.analyzeText')}</p>
          </div>
        </div>
        <Button variant="confirm" small icon="sparkles" onClick={onAnalyze}>
          {t('applications.ai.analyze')}
        </Button>
      </div>

      {app.coverLetterTitle && (
        <section className="flex items-center justify-between rounded-md border border-line bg-surface-2 p-3">
          <div>
            <h3 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('applications.fields.coverLetter')}</h3>
            <p className="mt-0.5 font-semibold text-ink">{app.coverLetterTitle}</p>
          </div>
          <Icon name="files" size={20} className="text-ink-muted" />
        </section>
      )}

      {adjusted && (
        <section className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-2 p-3" data-testid="cv-adjusted">
          <div>
            <h3 className="text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('applications.content.title')}</h3>
            <p className="mt-0.5 font-semibold text-ink">{describeSelection(t, app.cvSelection, known)}</p>
          </div>
          <Icon name="files" size={20} className="shrink-0 text-ink-muted" />
        </section>
      )}

      {app.notes && (
        <section className="rounded-md border border-line bg-surface-2 p-3">
          <h3 className="mb-1 text-xs font-semibold tracking-wider text-ink-muted uppercase">{t('applications.fields.notes')}</h3>
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-ink">{app.notes}</p>
        </section>
      )}
    </div>
  )
}
