import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import { fieldErrors } from '../../api/errors'
import { saveBlob } from '../../api/download'
import { coverLettersApi, profileApi } from '../../api/endpoints'
import type { CoverLetter, CoverLetterListItem, CoverLetterPayload } from '../../api/types'
import { useOptionalAppState } from '../../auth/AppState'
import { AiAssistantModal } from '../../components/ai/AiAssistantModal'
import { AutoSaveStatus } from '../../components/ui/AutoSaveStatus'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { Icon } from '../../components/ui/Icon'
import { ErrorNotice } from '../../components/ui/Notice'
import { Loading, PageHeader } from '../../components/ui/Page'
import { PdfPreview } from '../../components/ui/PdfPreview'
import { TabPanel, Tabs } from '../../components/ui/Tabs'
import type { TabItem } from '../../components/ui/Tabs'
import { CoverLetterForm } from '../../features/cover-letter/CoverLetterForm'
import { acceptLetter, hasProblems, letterIssues, normalizeLetter, renderOptions, REQUIRED_FIELDS, toPayload } from '../../features/cover-letter/model'
import { DEFAULT_DOCUMENT_COLOR } from '../../features/documents/palette'
import { draftKey, removeDraft, removeDraftsExcept } from '../../hooks/draftStore'
import { useAutoSave } from '../../hooks/useAutoSave'
import { useDateFormat } from '../../hooks/useDateFormat'
import { usePdfPreview } from '../../hooks/usePdfPreview'
import { useRestoreDraft } from '../../hooks/useRestoreDraft'
import { UnsavedChangesGuard, useLeaveTexts } from '../../hooks/useUnsavedChangesGuard'
import { useHintScreen } from '../../features/live-helper/hints'

type EditorTab = 'editor' | 'preview'

/** The part of the storage key behind `cv.draft.<account>.`; the letter's id follows. */
const DRAFT_FORM = 'coverLetter'

export function CoverLettersPage() {
  const { t, i18n } = useTranslation()
  const dates = useDateFormat()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const showError = useErrorDialog()
  const accountId = useOptionalAppState()?.session.user?.id
  const language = i18n.language?.startsWith('en') ? 'en' : 'de'

  // The letter that is open in the editor, as the server gave it; null = the list is shown. What is typed lives in the editor.
  const [opened, setOpened] = useState<CoverLetter | null>(null)

  const letters = useQuery({ queryKey: ['coverLetters'], queryFn: coverLettersApi.list })
  const refreshList = () => void queryClient.invalidateQueries({ queryKey: ['coverLetters'] })

  // Local copies of letters that are gone (deleted on another device) are of no use: they go as soon as the list is current.
  const known = letters.isFetching ? undefined : letters.data
  useEffect(() => {
    if (accountId && known) removeDraftsExcept(accountId, DRAFT_FORM, new Set(known.map((letter) => letter.id)))
  }, [accountId, known])

  const create = useMutation({
    mutationFn: async () => {
      const profile = await profileApi.get().catch(() => null)
      const name = profile ? `${profile.firstName} ${profile.lastName}`.trim() : ''
      // The letter's date is free text; it starts as today's date in the chosen date format.
      const today = dates.date(new Date().toISOString())
      const payload: CoverLetterPayload = {
        title: t('coverLetters.defaults.title'),
        senderName: name,
        senderStreet: profile?.street ?? '',
        senderPostalCode: profile?.postalCode ?? '',
        senderCity: profile?.city ?? '',
        senderPhone: profile?.phone ?? '',
        senderEmail: profile?.email ?? '',
        recipientCompany: t('coverLetters.defaults.recipientCompany'),
        recipientDepartment: '',
        recipientContactPerson: '',
        recipientStreet: '',
        recipientPostalCode: '',
        recipientCity: t('coverLetters.defaults.recipientCity'),
        recipientCountry: '',
        place: profile?.city || t('coverLetters.defaults.recipientCity'),
        date: today,
        subject: t('coverLetters.defaults.subject'),
        salutation: t('coverLetters.defaults.salutation'),
        body: t('coverLetters.defaults.body'),
        closing: t('coverLetters.defaults.closing'),
        signatureName: name,
        attachmentsNote: t('coverLetters.defaults.attachmentsNote'),
        language,
        font: 'Liberation Sans',
        accentColor: DEFAULT_DOCUMENT_COLOR,
      }
      return coverLettersApi.create(payload)
    },
    onSuccess: (created) => {
      setOpened(created)
      refreshList()
    },
    onError: (error) => showError(error, t('coverLetters.errors.create')),
  })

  const openFromList = useMutation({
    mutationFn: (id: string) => coverLettersApi.get(id),
    onSuccess: setOpened,
    onError: (error, id) => {
      // The letter is gone: its local copy has nothing to come back to.
      if (error instanceof ApiError && error.status === 404 && accountId) removeDraft(draftKey(accountId, `${DRAFT_FORM}.${id}`))
      showError(error, t('coverLetters.errors.load'))
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => coverLettersApi.delete(id),
    onSuccess: (_result, id) => {
      if (accountId) removeDraft(draftKey(accountId, `${DRAFT_FORM}.${id}`))
      setOpened((current) => (current?.id === id ? null : current))
      refreshList()
    },
    onError: (error) => showError(error, t('coverLetters.errors.delete')),
  })

  const askDelete = async (id: string, title: string) => {
    const ok = await confirm({ title: t('common.delete'), message: t('coverLetters.deleteConfirm', { title }), confirmLabel: t('common.delete'), tone: 'danger' })
    if (ok) remove.mutate(id)
  }

  if (opened) {
    return (
      <CoverLetterEditor
        key={opened.id}
        initial={opened}
        onClose={() => {
          setOpened(null)
          refreshList()
        }}
        onDelete={(id, title) => void askDelete(id, title)}
      />
    )
  }

  const list = letters.data ?? []

  return (
    <>
      <PageHeader
        title={t('coverLetters.title')}
        subtitle={t('coverLetters.subtitle')}
        actions={
          <Button variant="create" icon="plus" busy={create.isPending} onClick={() => create.mutate()} data-hint="letters-new">
            {t('coverLetters.newLetter')}
          </Button>
        }
      />

      {letters.isPending ? (
        <Loading />
      ) : letters.isError ? (
        <div className="flex flex-col items-start gap-3">
          <ErrorNotice error={letters.error} title={t('coverLetters.errors.loadList')} />
          <Button icon="refresh" onClick={() => void letters.refetch()}>
            {t('preview.retry')}
          </Button>
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon="files"
          title={t('coverLetters.empty')}
          action={
            <Button variant="create" icon="plus" busy={create.isPending} onClick={() => create.mutate()}>
              {t('coverLetters.newLetter')}
            </Button>
          }
        />
      ) : (
        <ul className="card-grid [--card-min:20rem]" data-hint="letters-list">
          {list.map((letter) => (
            <li key={letter.id} className="card group relative flex flex-col justify-between p-5 transition-colors focus-within:border-indicator hover:border-indicator">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 text-base font-semibold text-ink">
                    <button type="button" onClick={() => openFromList.mutate(letter.id)} className="line-clamp-2 text-left after:absolute after:inset-0 after:content-['']">
                      {letter.title}
                    </button>
                  </h2>
                </div>
                <p className="mt-2 line-clamp-1 text-sm font-medium text-ink">{letter.recipientCompany}</p>
                <p className="mt-1 line-clamp-1 text-xs text-ink-muted">{letter.subject}</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-muted">
                <span>{letter.date ?? dates.dateTime(letter.updatedAt)}</span>
                <Button variant="danger-outline" small icon="trash" className="relative z-10" title={t('common.delete')} onClick={() => void askDelete(letter.id, letter.title)}>
                  <span className="sr-only">
                    {t('common.delete')}: {letter.title}
                  </span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

interface CoverLetterEditorProps {
  /** The letter as the server has it now. Later changes of this value are ignored: the editor owns what is typed. */
  initial: CoverLetter
  onClose: () => void
  onDelete: (id: string, title: string) => void
}

/**
 * One letter in the editor. It saves by itself (see useAutoSave): there is no save button, the status line says where things
 * stand, and nothing typed is lost when the server cannot be reached - it stays in a local copy that is offered again on the
 * next opening.
 */
function CoverLetterEditor({ initial, onClose, onDelete }: CoverLetterEditorProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const showError = useErrorDialog()
  const accountId = useOptionalAppState()?.session.user?.id
  const leaveTexts = useLeaveTexts()
  // The editor is a screen of its own for the live helper (the address is the same as the list's).
  useHintScreen('coverLetterEditor')

  // What belongs to the stored letter and not to the text: the signature flag and the time of the last change on the server.
  const [meta, setMeta] = useState({ hasSignature: initial.hasSignature, updatedAt: initial.updatedAt })
  // The state of the server the typing is based on (marks the local copy).
  const serverBase = useRef(initial.updatedAt)
  const [tab, setTab] = useState<EditorTab>('editor')
  const [attempted, setAttempted] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [translateOpen, setTranslateOpen] = useState(false)
  const [restoredAt, setRestoredAt] = useState<number | null>(null)
  // Counts the saves, so the preview is made again when the letter on the server changed.
  const [saves, setSaves] = useState(0)

  const auto = useAutoSave<CoverLetterPayload, CoverLetter>({
    initial: toPayload(initial),
    // The values go out as typed; what the server trims or fills in is not put back into the fields (the user is still typing).
    save: (payload, { keepalive }) => (keepalive ? coverLettersApi.update(initial.id, payload, { keepalive }) : coverLettersApi.update(initial.id, payload)),
    isSendable: (payload) => !hasProblems(payload),
    onSaved: (answer) => {
      serverBase.current = answer.updatedAt
      setMeta((current) => ({ ...current, updatedAt: answer.updatedAt }))
      setSaves((count) => count + 1)
      // The list shows title, company, subject and date: it follows without a request. A letter that is not in it is not added.
      queryClient.setQueryData<CoverLetterListItem[]>(['coverLetters'], (list) => {
        if (!list?.some((item) => item.id === answer.id)) return list
        const item: CoverLetterListItem = { id: answer.id, title: answer.title, recipientCompany: answer.recipientCompany, subject: answer.subject, date: answer.date, updatedAt: answer.updatedAt }
        return [item, ...list.filter((other) => other.id !== answer.id)]
      })
    },
    draft: { accountId, form: `${DRAFT_FORM}.${initial.id}`, base: () => serverBase.current },
  })

  const { setValue, peek } = auto
  const update = useCallback(
    (patch: Partial<CoverLetter>) => {
      setRestoredAt(null)
      setValue({ ...peek(), ...(patch as Partial<CoverLetterPayload>) })
    },
    [setValue, peek],
  )

  useRestoreDraft<CoverLetterPayload>({
    key: accountId ? draftKey(accountId, `${DRAFT_FORM}.${initial.id}`) : null,
    ready: true,
    accept: (raw) => acceptLetter(raw, toPayload(initial)),
    server: { value: toPayload(initial), base: initial.updatedAt },
    normalize: normalizeLetter,
    onRestore: (value, savedAt) => {
      setValue(value)
      setRestoredAt(savedAt)
    },
  })

  const value = auto.value
  /** The letter as the form shows it: the typed values on top of what belongs to the stored letter. */
  const letter = useMemo(() => ({ ...initial, ...value, hasSignature: meta.hasSignature, updatedAt: meta.updatedAt }) as CoverLetter, [initial, value, meta])

  /**
   * Makes sure the server has everything that is typed, before the preview or an export. False when a required field is missing
   * (the fields then show it) or the save failed (the error is shown completely).
   */
  const ensureSaved = async (): Promise<CoverLetterPayload | null> => {
    if (hasProblems(peek())) {
      setAttempted(true)
      return null
    }
    if (await auto.flush()) return peek()
    const failure = auto.latest().failure
    if (failure) showError(failure.error, t('coverLetters.errors.save'))
    return null
  }

  /** Back to the list: what is on its way is sent first; only input that cannot be saved is asked about. */
  const goBack = async () => {
    const saved = await auto.flush()
    if (saved || (await confirm({ ...leaveTexts, tone: 'danger' }))) onClose()
  }

  // The signature belongs to the stored letter, so the server's answer only updates that flag - everything typed stays.
  const signature = useMutation({
    mutationFn: (action: { file: File } | 'delete') => (action === 'delete' ? coverLettersApi.deleteSignature(initial.id) : coverLettersApi.uploadSignature(initial.id, action.file)),
    onSuccess: (updated) => {
      serverBase.current = updated.updatedAt
      setMeta({ hasSignature: updated.hasSignature, updatedAt: updated.updatedAt })
    },
    onError: (error, action) => showError(error, action === 'delete' ? t('coverLetters.errors.signatureDelete') : t('coverLetters.errors.signatureUpload')),
  })

  const askDeleteSignature = async () => {
    const ok = await confirm({
      title: t('coverLetters.fields.deleteSignature'),
      message: t('coverLetters.signatureDeleteConfirm'),
      confirmLabel: t('coverLetters.fields.deleteSignature'),
      tone: 'danger',
    })
    if (ok) signature.mutate('delete')
  }

  const exportFile = useMutation({
    mutationFn: async (kind: 'pdf' | 'docx') => {
      const saved = await ensureSaved()
      if (!saved) return null
      const options = renderOptions(saved)
      return kind === 'pdf' ? coverLettersApi.exportPdf(initial.id, options) : coverLettersApi.exportDocx(initial.id, options)
    },
    onSuccess: (file) => {
      if (file) saveBlob(file.blob, file.filename)
    },
    onError: (error) => showError(error, t('coverLetters.errors.download')),
  })

  // ---- preview -----------------------------------------------------------------------------------------------------

  // The preview shows the stored letter; the tab switch saves what is typed first, so what is seen is what is saved.
  const request = useMemo(() => ({ options: renderOptions(value), saves }), [value, saves])
  const load = useCallback((signal: AbortSignal) => coverLettersApi.getPreviewPdf(initial.id, request.options, signal), [initial.id, request])
  const preview = usePdfPreview({ load, enabled: tab === 'preview', resetKey: initial.id })

  // Enter in a field sends at once instead of waiting for the quiet period; if something is missing, the fields say what.
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (hasProblems(peek())) setAttempted(true)
    void auto.flush()
  }

  const changeTab = async (next: EditorTab) => {
    if (next === 'preview' && !(await ensureSaved())) return
    setTab(next)
  }

  const tabs: TabItem<EditorTab>[] = [
    { id: 'editor', label: t('coverLetters.tabs.editor') },
    { id: 'preview', label: t('coverLetters.tabs.preview') },
  ]

  // What the server said about single fields when it refused the values.
  const refused = auto.state.failure?.kind === 'validation' ? fieldErrors(t, auto.state.failure.error) : {}

  // What stops the input from being saved, in words; the room of the longest of these is held in the status.
  const issues = letterIssues(value)
  const blockedTexts = useMemo(
    () => [t('coverLetters.autoSave.missing', { count: 1 }), t('coverLetters.autoSave.missing', { count: REQUIRED_FIELDS.length }), t('autoSave.invalid'), t('autoSave.unfinished')],
    [t],
  )
  const blockedText = issues.missing > 0 ? t('coverLetters.autoSave.missing', { count: issues.missing }) : issues.red ? t('autoSave.invalid') : t('autoSave.unfinished')

  return (
    <>
      {/* Only input that could not be saved is worth a question; whatever is on its way is sent when the page is left. */}
      <UnsavedChangesGuard when={auto.state.unsent} texts={leaveTexts} />
      <PageHeader
        title={t('coverLetters.title')}
        subtitle={t('coverLetters.editTitle')}
        actions={
          <>
            <Button icon="chevronLeft" onClick={() => void goBack()}>
              {t('coverLetters.actions.backToList')}
            </Button>
            <Button icon="sparkles" onClick={() => setAiOpen(true)} data-hint="letter-ai">
              {t('ai.title')}
            </Button>
            <Button icon="language" disabled={value.body.trim() === ''} onClick={() => setTranslateOpen(true)} data-testid="letter-ai-translate">
              {t('ai.entry.translateLetter')}
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <div data-hint="letter-tabs">
          <Tabs tabs={tabs} active={tab} onChange={(next) => void changeTab(next)} label={t('coverLetters.title')} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="shrink-0" data-hint="letter-autosave">
            <AutoSaveStatus
              state={auto.state}
              failureTitle={t('coverLetters.errors.save')}
              blocked={{ text: blockedText, all: blockedTexts }}
              restoredAt={restoredAt}
              align="start"
            />
          </div>
          <div className="flex items-center gap-2" data-hint="letter-export">
            <Button variant="danger-outline" icon="trash" onClick={() => onDelete(initial.id, value.title)}>
              {t('common.delete')}
            </Button>
            <Button icon="download" busy={exportFile.isPending && exportFile.variables === 'docx'} disabled={exportFile.isPending} onClick={() => exportFile.mutate('docx')}>
              {t('coverLetters.actions.downloadDocx')}
            </Button>
            <Button variant="confirm" icon="download" busy={exportFile.isPending && exportFile.variables === 'pdf'} disabled={exportFile.isPending} onClick={() => exportFile.mutate('pdf')}>
              {t('coverLetters.actions.downloadPdf')}
            </Button>
          </div>
        </div>

        <TabPanel id={tab}>
          {tab === 'editor' ? (
            <form onSubmit={handleSubmit} noValidate>
              <CoverLetterForm
                draft={letter}
                onChange={update}
                attempted={attempted}
                serverErrors={refused}
                signatureBusy={signature.isPending}
                onSignatureUpload={(file) => signature.mutate({ file })}
                onSignatureDelete={() => void askDeleteSignature()}
              />
              {/* No visible button: the letter saves by itself. This one only makes Enter in a field send at once (implicit submission). */}
              <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
            </form>
          ) : (
            <section className="card space-y-4 p-5" aria-label={t('coverLetters.tabs.preview')}>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <Icon name="fileText" size={18} className="text-ink-muted" />
                  {t('coverLetters.previewTitle')}
                </h2>
                <Button icon="refresh" busy={preview.loading} onClick={preview.refresh}>
                  {t('coverLetters.actions.refreshPreview')}
                </Button>
              </div>
              <PdfPreview preview={preview} title={t('coverLetters.previewFrame')} className="h-[max(36rem,calc(100vh-23rem))]" />
            </section>
          )}
        </TabPanel>
      </div>

      <AiAssistantModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        task="generate_cover_letter"
        language={value.language ?? 'de'}
        initialJobTitle={value.title || undefined}
        initialCompany={value.recipientCompany || undefined}
        initialRecipient={value.recipientContactPerson || undefined}
        onApplyCoverLetter={(result) =>
          update({
            subject: result.subject || value.subject,
            salutation: result.salutation || value.salutation,
            body: `${result.opening}\n\n${result.body}\n\n${result.closing}`.trim(),
          })
        }
      />
      {translateOpen && (
        <AiAssistantModal
          open
          onClose={() => setTranslateOpen(false)}
          task="translate_content"
          initialText={value.body}
          initialTargetLanguage={value.language === 'en' ? 'de' : 'en'}
          onApplyTranslation={(result) => update({ body: result.translatedText })}
        />
      )}
    </>
  )
}
