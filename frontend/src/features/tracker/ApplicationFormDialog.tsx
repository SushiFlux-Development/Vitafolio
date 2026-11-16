import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { applicationsApi, attachmentsApi } from '../../api/endpoints'
import type { Application, ApplicationStatus, ContentSuggestion, CoverLetterListItem, CvSelection } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { FormDialog } from '../../components/ui/FormDialog'
import { DateField } from '../../components/ui/DateField'
import { LiveTextAreaField, LiveTextField } from '../../components/ui/LiveTextField'
import { Icon } from '../../components/ui/Icon'
import { SelectField } from '../../components/ui/SelectField'
import { Toggle } from '../../components/ui/Toggle'
import { FOLLOW_UP_DAY, emailCheck, isStoredDateValid, isValid, noRule, requiredField, urlCheck } from '../../validation/rules'
import { groupDesigns, useDocumentDesigns } from '../documents/useDocumentDesigns'
import { DEFAULT_FOLLOW_UP_DAYS, EMPTY_APPLICATION_FORM, formFromApplication, toCreatePayload, toUpdatePayload } from './applicationForm'
import type { ApplicationForm } from './applicationForm'
import { CvContentDialog, GUIDE_ROUTE } from './CvContentDialog'
import { applyAttachmentSuggestion, applyEffective, applySuggestion, EMPTY_SELECTION, isCompleteSelection } from './cvSelection'
import { applicationDetailKey, useContentSuggestion, useKnownProfileIds, useProfileHiddenSections } from './queries'
import { Reserved } from './Reserved'
import { describeSelection, longestSummary } from './selectionSummary'
import { STATUS_ORDER } from './status'

interface ApplicationFormDialogProps {
  open: boolean
  onClose: () => void
  coverLetters: readonly Pick<CoverLetterListItem, 'id' | 'title'>[]
  /** The application to change. Left out = a new application is created. */
  application?: Application | undefined
  /** The saved application (the answer of the server). */
  onSaved: (application: Application) => void
}

/**
 * The one form for a new and for an existing application: with `application` it opens filled in and saves with PUT, without it starts
 * empty and creates. The caller gives it a new `key` (or mounts it fresh) every time it is opened, so it always starts from the right
 * state. The required fields turn red while typing; a failed save is shown in the error dialog (complete and copyable) and keeps
 * everything that was typed.
 */
export function ApplicationFormDialog({ open, onClose, coverLetters, application, onSaved }: ApplicationFormDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const designs = useDocumentDesigns()
  const editing = application !== undefined
  const [initial] = useState<ApplicationForm>(() => (application ? formFromApplication(application) : EMPTY_APPLICATION_FORM))
  const [form, setForm] = useState<ApplicationForm>(initial)
  const [attempted, setAttempted] = useState(false)
  const [contentOpen, setContentOpen] = useState(false)
  // Which of the two suggested fields the person has changed by hand; until then a new application follows the suggestion.
  const [touched, setTouched] = useState({ selection: false, attachments: false })
  const confirm = useConfirm()
  const navigate = useNavigate()

  const attachments = useQuery({
    queryKey: ['attachments'],
    queryFn: attachmentsApi.list,
    enabled: open,
  })
  const suggestion = useContentSuggestion(open)
  const knownIds = useKnownProfileIds(open)
  const profileHiddenSections = useProfileHiddenSections(open)
  const suggestedAttachment = (id: string) => suggestion.query.data?.attachments.find((entry) => entry.id === id)

  // A NEW application is put together from the suggestion as soon as it is there, as long as the person has not touched these fields. This
  // is derived while rendering (not copied into the form), so the form is not "changed" by it, and it is shown in the form before saving.
  // An existing application never changes by itself.
  const data = suggestion.query.data
  const auto =
    !editing && data
      ? {
          selection: applyEffective(EMPTY_SELECTION, data, profileHiddenSections),
          attachments: applyAttachmentSuggestion([], data).filter((id) => (attachments.data ?? []).some((attachment) => attachment.id === id)),
        }
      : null
  const autoSelection = auto !== null && !touched.selection
  const autoAttachments = auto !== null && !touched.attachments
  const current: ApplicationForm = {
    ...form,
    cvSelection: autoSelection ? auto.selection : form.cvSelection,
    attachmentIds: autoAttachments ? auto.attachments : form.attachmentIds,
  }

  const save = useMutation({
    mutationFn: (values: ApplicationForm) => (application ? applicationsApi.update(application.id, toUpdatePayload(values, application)) : applicationsApi.create(toCreatePayload(values))),
    onSuccess: (saved) => {
      queryClient.setQueryData(applicationDetailKey(saved.id), saved)
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
      onSaved(saved)
    },
    onError: (error) => showError(error, editing ? t('applications.errors.update') : t('applications.errors.create')),
  })

  const set = <K extends keyof ApplicationForm>(key: K, value: ApplicationForm[K]) => {
    if (key === 'cvSelection') setTouched((previous) => ({ ...previous, selection: true }))
    if (key === 'attachmentIds') setTouched((previous) => ({ ...previous, attachments: true }))
    setForm((previous) => ({ ...previous, [key]: value }))
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const submit = () => {
    setAttempted(true)
    const ok = [
      isValid(requiredField, form.jobTitle),
      isValid(requiredField, form.company),
      isValid(emailCheck, form.contactEmail),
      isValid(urlCheck, form.jobPostingUrl),
      isStoredDateValid(FOLLOW_UP_DAY, form.followUpAt),
    ].every(Boolean)
    if (ok) save.mutate(current)
  }

  const toggleAttachment = (id: string, checked: boolean) => set('attachmentIds', checked ? [...current.attachmentIds, id] : current.attachmentIds.filter((existing) => existing !== id))

  // "Everything complete": the whole profile again. For a new application that also takes back the attachments the suggestion chose.
  const resetContent = () => {
    set('cvSelection', EMPTY_SELECTION)
    if (!editing) set('attachmentIds', [])
  }
  const takeSuggestion = (s: ContentSuggestion) => {
    set('cvSelection', applySuggestion(current.cvSelection, s))
    set('attachmentIds', applyAttachmentSuggestion(current.attachmentIds, s))
  }

  // The line under "CV content": what the application takes. A suggestion that was set up for a new application is announced as such, as
  // long as the person has not changed it; afterwards the line just tells what the CV takes.
  const announced = autoSelection && autoAttachments
  const announcement = describeSelection(t, current.cvSelection, knownIds, current.attachmentIds.length)
  const nothingSuggested = isCompleteSelection(current.cvSelection) && current.attachmentIds.length === 0
  const contentLine =
    announced && !nothingSuggested
      ? t('applications.content.auto', { summary: announcement })
      : !editing && suggestion.query.isError
        ? t('applications.content.noSuggestion')
        : describeSelection(t, current.cvSelection, knownIds)


  // The link to the guide page leaves the application page: typed input is not thrown away without a question.
  const leaveForGuide = async () => {
    if (dirty) {
      const discard = await confirm({
        title: t('common.discardTitle'),
        message: t('common.discardMessage'),
        confirmLabel: t('common.discard'),
        tone: 'danger',
      })
      if (!discard) return
    }
    setContentOpen(false)
    onClose()
    void navigate(GUIDE_ROUTE)
  }

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      onSubmit={submit}
      title={editing ? t('applications.editTitle') : t('applications.createTitle')}
      icon="briefcase"
      size="md"
      submitLabel={t('applications.actions.save')}
      busy={save.isPending}
      dirty={dirty}
    >
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <LiveTextField
          label={t('applications.fields.jobTitle')}
          required
          value={form.jobTitle}
          onValueChange={(value) => set('jobTitle', value)}
          check={requiredField}
          attempted={attempted}
          placeholder={t('applications.placeholders.jobTitle')}
          data-autofocus
        />
        <LiveTextField
          label={t('applications.fields.company')}
          required
          value={form.company}
          onValueChange={(value) => set('company', value)}
          check={requiredField}
          attempted={attempted}
          placeholder={t('applications.placeholders.company')}
        />
        <LiveTextField
          label={t('applications.fields.location')}
          value={form.location}
          onValueChange={(value) => set('location', value)}
          check={noRule}
          placeholder={t('applications.placeholders.location')}
        />
        <LiveTextField
          label={t('applications.fields.salaryExpectation')}
          value={form.salaryExpectation}
          onValueChange={(value) => set('salaryExpectation', value)}
          check={noRule}
          placeholder={t('applications.placeholders.salary')}
        />
      </div>

      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
        <LiveTextField
          label={t('applications.fields.contactPerson')}
          value={form.contactPerson}
          onValueChange={(value) => set('contactPerson', value)}
          check={noRule}
          placeholder={t('applications.placeholders.contactPerson')}
        />
        <LiveTextField
          label={t('applications.fields.contactEmail')}
          type="email"
          value={form.contactEmail}
          onValueChange={(value) => set('contactEmail', value)}
          check={emailCheck}
          attempted={attempted}
          placeholder={t('applications.placeholders.contactEmail')}
        />
        <LiveTextField
          label={t('applications.fields.contactPhone')}
          type="tel"
          value={form.contactPhone}
          onValueChange={(value) => set('contactPhone', value)}
          check={noRule}
          placeholder={t('applications.placeholders.contactPhone')}
        />
      </div>

      <LiveTextField
        label={t('applications.fields.jobPostingUrl')}
        type="url"
        value={form.jobPostingUrl}
        onValueChange={(value) => set('jobPostingUrl', value)}
        check={urlCheck}
        attempted={attempted}
        placeholder={t('applications.placeholders.jobPostingUrl')}
      />

      {/* The status of an existing application changes in its details (the timeline notes it there), so only a new one asks for it here. */}
      <div className={`grid grid-cols-1 gap-x-4 gap-y-4 ${editing ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
        {!editing && (
          <SelectField label={t('applications.fields.status')} value={form.status} onChange={(event) => set('status', event.target.value as ApplicationStatus)}>
            {STATUS_ORDER.map((status) => (
              <option key={status} value={status}>
                {t(`applications.statuses.${status}`)}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField label={t('applications.fields.coverLetter')} value={form.coverLetterId} onChange={(event) => set('coverLetterId', event.target.value)}>
          <option value="">{t('applications.fields.noCoverLetter')}</option>
          {coverLetters.map((letter) => (
            <option key={letter.id} value={letter.id}>
              {letter.title}
            </option>
          ))}
        </SelectField>
        <DateField label={t('applications.fields.followUpAt')} spec={FOLLOW_UP_DAY} value={form.followUpAt} onValueChange={(value) => set('followUpAt', value)} attempted={attempted} />
      </div>
      <p className="-mt-2 text-[0.8125rem] leading-snug text-ink-muted">
        {t('applications.fields.followUpHint', {
          days: DEFAULT_FOLLOW_UP_DAYS,
        })}
      </p>

      <fieldset className="space-y-4 rounded-md border border-line bg-surface-2 p-4">
        <legend className="px-1 text-xs font-semibold tracking-wider text-ink uppercase">{t('applications.dossier.title')}</legend>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <SelectField label={t('applications.fields.cvDesign')} value={form.cvDesign} onChange={(event) => set('cvDesign', event.target.value)}>
            {groupDesigns(designs).map(({ group, designs: members }, _, groups) => {
              const options = members.map((design) => (
                <option key={design.id} value={design.id}>
                  {t(`profile.preview.designs.${design.id}`, {
                    defaultValue: design.id,
                  })}
                </option>
              ))
              return groups.length > 1 ? (
                <optgroup
                  key={group}
                  label={t(`profile.preview.designGroups.${group}`, {
                    defaultValue: group,
                  })}
                >
                  {options}
                </optgroup>
              ) : (
                options
              )
            })}
          </SelectField>
          <SelectField label={t('applications.fields.cvLanguage')} value={form.cvLanguage} onChange={(event) => set('cvLanguage', event.target.value as 'de' | 'en')}>
            <option value="de">{t('profile.preview.languageDe')}</option>
            <option value="en">{t('profile.preview.languageEn')}</option>
          </SelectField>
        </div>

        <Toggle label={t('applications.fields.includeCoverSheet')} checked={form.includeCoverSheet} onChange={(checked) => set('includeCoverSheet', checked)} />

        {/* What of the master profile goes into the CV: the details live in their own dialog, here only the state in a few words. */}
        <div className="space-y-1 border-t border-line pt-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-sm font-medium text-ink">{t('applications.content.title')}</p>
            <div className="flex items-center gap-2">
              <Button small icon="pencil" onClick={() => setContentOpen(true)}>
                {t('applications.content.open')}
              </Button>
              <Button small variant="ghost" icon="refresh" disabled={isCompleteSelection(current.cvSelection) && (editing || current.attachmentIds.length === 0)} onClick={resetContent}>
                {t('applications.content.actions.reset')}
              </Button>
            </div>
          </div>
          {/* The line keeps room for its longest text, so a suggestion arriving (or failing to) moves nothing. */}
          <Reserved reserve={[t('applications.content.auto', { summary: longestSummary(t) }), t('applications.content.noSuggestion')]} className="text-[0.8125rem] leading-snug text-ink-muted">
            <p data-testid="cv-content-summary">{contentLine}</p>
          </Reserved>
        </div>

        <fieldset className="space-y-2 border-t border-line pt-3">
          <legend className="text-sm font-medium text-ink">
            {t('applications.attachments.choose', {
              count: current.attachmentIds.length,
            })}
          </legend>
          {attachments.isError ? (
            <p className="text-sm text-danger">{t('applications.attachments.loadFailed')}</p>
          ) : (attachments.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-muted">{t('applications.attachments.none')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-ink-muted">{t('applications.attachments.suggestionIntro')}</p>
                <Button
                  small
                  icon="sparkles"
                  busy={suggestion.query.isFetching && !suggestion.query.data}
                  onClick={() => void suggestion.take((s) => set('attachmentIds', applyAttachmentSuggestion(current.attachmentIds, s)))}
                >
                  {t('applications.content.actions.take')}
                </Button>
              </div>
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-sm border border-line bg-surface p-2">
                {(attachments.data ?? []).map((attachment) => (
                  <li key={attachment.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-xs p-1 text-sm text-ink hover:bg-surface-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-confirm"
                        checked={current.attachmentIds.includes(attachment.id)}
                        onChange={(event) => toggleAttachment(attachment.id, event.target.checked)}
                      />
                      <span className="min-w-0 font-medium break-words">{attachment.title}</span>
                      {attachment.category && <span className="badge badge-neutral">{attachment.category}</span>}
                    </label>
                    <AttachmentReason entry={suggestedAttachment(attachment.id)} selected={current.attachmentIds.includes(attachment.id)} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </fieldset>
      </fieldset>

      <LiveTextAreaField
        label={t('applications.fields.notes')}
        rows={3}
        value={form.notes}
        onValueChange={(value) => set('notes', value)}
        check={noRule}
        placeholder={t('applications.placeholders.notes')}
      />
      <CvContentDialog
        open={contentOpen}
        onClose={() => setContentOpen(false)}
        selection={current.cvSelection}
        onChange={(selection: CvSelection) => set('cvSelection', selection)}
        suggestion={suggestion}
        onTakeSuggestion={takeSuggestion}
        onLeave={() => void leaveForGuide()}
      />
    </FormDialog>
  )
}

const ATTACHMENT_REASONS = ['recent_reference', 'older_reference', 'highest_degree', 'lower_degree', 'school_report', 'older_school_report', 'degree', 'certificate'] as const

/** The suggestion for one attachment, under its checkbox. Two lines stay free for it, so it appearing (or a choice that differs from it) moves nothing. */
function AttachmentReason({ entry, selected }: { entry: ContentSuggestion['attachments'][number] | undefined; selected: boolean }) {
  const { t } = useTranslation()
  const known: readonly string[] = ATTACHMENT_REASONS
  const differs = entry !== undefined && (entry.suggestion === 'include') !== selected
  return (
    <p className="mt-0.5 ml-8 min-h-10 text-[0.8125rem] leading-snug text-ink-muted">
      {entry && (
        <>
          {differs && (
            <span className="badge badge-info mr-1.5 align-middle">
              <Icon name="infoCircle" size={12} />
              {t('applications.content.differs')}
            </span>
          )}
          {t('applications.attachments.suggestionLine', {
            advice: t(entry.suggestion === 'include' ? 'applications.attachments.include' : 'applications.attachments.omit'),
            reason: t(`applications.attachments.reasons.${known.includes(entry.reason) ? entry.reason : 'unknown'}`),
          })}
        </>
      )}
    </p>
  )
}
