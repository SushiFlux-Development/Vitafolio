import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import { saveBlob } from '../../api/download'
import { profileApi } from '../../api/endpoints'
import type { Profile } from '../../api/types'
import { reserveFor } from '../../components/forms/reserve'
import { AlertSlot } from '../../components/ui/AlertSlot'
import { Button } from '../../components/ui/Button'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { LiveTextAreaField } from '../../components/ui/LiveTextField'
import { Notice } from '../../components/ui/Notice'
import { Segmented } from '../../components/ui/Segmented'
import { Toggle } from '../../components/ui/Toggle'
import { jsonObjectCheck } from '../../validation/rules'

interface JsonResumeModalProps {
  open: boolean
  onClose: () => void
  onImportSuccess: (profile: Profile) => void
  /** The personal data form holds typed input that an import would replace by what the file says. */
  hasUnsavedPersonalData?: boolean
}

/** The server's answer to a refused file: normal use, so it keeps reserved room in the dialog. */
const NORMAL_ANSWERS = ['validation.failed']

type Mode = 'export' | 'import'

export function JsonResumeModal({ open, onClose, onImportSuccess, hasUnsavedPersonalData = false }: JsonResumeModalProps) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const showError = useErrorDialog()
  // A refused file stays in the dialog; every other failure opens the error dialog (nothing is laid over the buttons).
  const fail = (error: unknown, title: string) => (error instanceof ApiError && error.code !== undefined && NORMAL_ANSWERS.includes(error.code) ? setOutcome({ ok: false, error, title }) : showError(error, title))
  const fileInput = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<Mode>('export')
  const [replace, setReplace] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  // The last result: a success text or the real error (never a swallowed one), at a fixed place.
  const [outcome, setOutcome] = useState<{ ok: true; text: string } | { ok: false; error: unknown; title: string } | null>(null)

  const exportJson = useMutation({
    mutationFn: async () => {
      const data = await profileApi.getJsonResume()
      saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'resume.json')
    },
    onMutate: () => setOutcome(null),
    onSuccess: () => setOutcome({ ok: true, text: t('profile.jsonResume.exportSuccess') }),
    onError: (error) => fail(error, t('profile.jsonResume.errors.export')),
  })

  const importJson = useMutation({
    mutationFn: (parsed: Record<string, unknown>) => profileApi.importJsonResume(parsed, replace),
    onMutate: () => setOutcome(null),
    onSuccess: (profile) => {
      onImportSuccess(profile)
      setOutcome({ ok: true, text: t('profile.jsonResume.importSuccess') })
      setJsonText('')
      setFileName(null)
      setAttempted(false)
    },
    onError: (error) => fail(error, t('profile.jsonResume.errors.import')),
  })

  const changeMode = (next: Mode) => {
    setMode(next)
    setOutcome(null)
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setOutcome(null)
    try {
      setJsonText(await file.text())
      setFileName(file.name)
      // A file that is no JSON is told at once, not only after the user clicks in and out of the field.
      setAttempted(true)
    } catch (error) {
      fail(error, t('profile.jsonResume.errors.file'))
    }
  }

  const handleImport = async () => {
    setAttempted(true)
    if (jsonObjectCheck(jsonText, { settled: true })) return
    const parsed = JSON.parse(jsonText) as Record<string, unknown>

    // Replacing, and losing typed-in personal data, are asked about first - both cannot be undone from here.
    if (replace || hasUnsavedPersonalData) {
      const ok = await confirm({
        title: t('profile.jsonResume.confirmTitle'),
        message: (
          <>
            {replace && <p>{t('profile.jsonResume.confirmReplace')}</p>}
            {hasUnsavedPersonalData && <p className={replace ? 'mt-2' : ''}>{t('profile.jsonResume.confirmUnsaved')}</p>}
          </>
        ),
        confirmLabel: t('profile.jsonResume.importButton'),
        tone: replace ? 'danger' : 'default',
      })
      if (!ok) return
    }
    importJson.mutate(parsed)
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('profile.jsonResume.title')} icon="files" size="md" closeOnBackdrop={false} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      <div className="space-y-4">
        <Notice tone="info">{t('profile.jsonResume.intro')}</Notice>

        <Segmented<Mode>
          label={t('profile.jsonResume.modeLabel')}
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'export', label: t('profile.jsonResume.exportMode'), icon: 'download' },
            { value: 'import', label: t('profile.jsonResume.importMode'), icon: 'upload' },
          ]}
        />

        {mode === 'export' ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">{t('profile.jsonResume.exportText')}</p>
            <div className="flex justify-end">
              <Button variant="confirm" icon="download" busy={exportJson.isPending} onClick={() => exportJson.mutate()}>
                {t('profile.jsonResume.exportButton')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">{t('profile.jsonResume.fileLabel')}</p>
              <div className="flex items-center gap-3">
                <input ref={fileInput} type="file" accept=".json,application/json" onChange={(event) => void handleFile(event)} className="sr-only" tabIndex={-1} aria-hidden="true" />
                <Button icon="upload" onClick={() => fileInput.current?.click()}>
                  {t('profile.jsonResume.chooseFile')}
                </Button>
                {fileName && <span className="min-w-0 truncate text-sm font-medium text-ink">{fileName}</span>}
              </div>
            </div>

            <LiveTextAreaField
              label={t('profile.jsonResume.pasteLabel')}
              rows={6}
              value={jsonText}
              onValueChange={setJsonText}
              check={jsonObjectCheck}
              attempted={attempted}
              placeholder={'{ "basics": { … } }'}
              inputClassName="font-mono text-xs"
              spellCheck={false}
            />

            <Toggle label={t('profile.jsonResume.replaceLabel')} description={t('profile.jsonResume.replaceHint')} checked={replace} onChange={setReplace} />

            <div className="flex justify-end">
              <Button variant="confirm" icon="upload" busy={importJson.isPending} disabled={!jsonText.trim()} onClick={() => void handleImport()}>
                {t('profile.jsonResume.importButton')}
              </Button>
            </div>
          </div>
        )}


        {/* A file the server refuses is a normal answer and keeps its room, below the buttons so they never move. Anything else (export trouble, unreadable file) goes into the error dialog instead of covering the buttons. */}
        <AlertSlot
          reserve={reserveFor(t, ['validation.failed'], t('profile.jsonResume.errors.import'))}
          reservePlain={[t('profile.jsonResume.exportSuccess'), t('profile.jsonResume.importSuccess')]}
          error={outcome?.ok === false ? outcome.error : null}
          errorTitle={outcome?.ok === false ? outcome.title : undefined}
          normalCodes={NORMAL_ANSWERS}
          onDismiss={() => setOutcome(null)}
        >
          {outcome?.ok === true && <Notice tone="success">{outcome.text}</Notice>}
        </AlertSlot>
      </div>
    </Dialog>
  )
}
