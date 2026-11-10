import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import { applicationsApi } from '../../api/endpoints'
import type { DossierSource } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { MessageSlot } from '../../components/ui/MessageSlot'
import { PdfPreview } from '../../components/ui/PdfPreview'
import { usePdfPreview } from '../../hooks/usePdfPreview'

export interface DossierTarget {
  id: string
  company: string
  jobTitle: string
}

interface DossierPreviewDialogProps {
  /** The application whose dossier is shown; null = closed. */
  target: DossierTarget | null
  onClose: () => void
  onDownload: (target: DossierTarget) => void
}

type Version = 'auto' | 'current'

/**
 * The dossier of one application in a dialog: the same embedded preview as the CV and the cover letter, aborted when the
 * dialog closes or another application is chosen, with the real error and a "try again" button when rendering fails.
 *
 * It always says which version it shows. By default that is the filed one (the document as it was sent), otherwise the current state;
 * with a filed version, "view current state" renders today's state on purpose and the way back is one click. A filed version whose
 * file is lost is told as such (never silently replaced by a new render); the way on is the same button.
 */
export function DossierPreviewDialog({ target, onClose, onDownload }: DossierPreviewDialogProps) {
  const { t } = useTranslation()
  const id = target?.id
  const [version, setVersion] = useState<Version>('auto')
  const [source, setSource] = useState<DossierSource | null>(null)
  const [seenId, setSeenId] = useState(id)

  // Another application than before: start with its default version, and nothing of the old answer stays.
  if (seenId !== id) {
    setSeenId(id)
    setVersion('auto')
    setSource(null)
  }

  const load = useCallback(
    async (signal: AbortSignal) => {
      const preview = await applicationsApi.getPreview(id ?? '', { version, signal })
      if (!signal.aborted) setSource(preview.source)
      return preview.blob
    },
    [id, version],
  )
  const preview = usePdfPreview({ load, enabled: Boolean(id), resetKey: `${id ?? ''}:${version}` })

  const switchTo = (next: Version) => {
    setSource(null)
    setVersion(next)
  }

  const archiveMissing = preview.error instanceof ApiError && preview.error.code === 'archive.missing'
  const currentLabel = t('applications.dossier.viewCurrent')
  const archivedLabel = t('applications.dossier.viewArchived')
  // Both labels are drawn invisibly in the one cell, so the button is as wide whichever way it points and the bar keeps its size.
  const switchLabel = (label: string) => (
    <span className="grid">
      {[currentLabel, archivedLabel].map((text) => (
        <span key={text} aria-hidden="true" className="invisible col-start-1 row-start-1">
          {text}
        </span>
      ))}
      <span className="col-start-1 row-start-1">{label}</span>
    </span>
  )
  const viewCurrent = (
    <Button variant="confirm" icon="refresh" onClick={() => switchTo('current')}>
      {switchLabel(currentLabel)}
    </Button>
  )

  // What the bar says: which version this is and what that means. A version asked for explicitly is shown in full as soon as it is there.
  const badgeLabels = [t('applications.dossier.sourceArchivedBadge'), t('applications.dossier.sourceCurrentBadge')]
  const texts = [t('applications.dossier.sourceArchivedText'), t('applications.dossier.sourceCurrentText'), t('applications.dossier.sourceNoArchiveText')]
  const badge = source === 'archived' ? badgeLabels[0] : source === 'current' ? badgeLabels[1] : undefined
  const message = source === 'archived' ? texts[0] : source === 'current' ? (version === 'current' ? texts[1] : texts[2]) : undefined
  // A button only where there is somewhere to go: from the filed version to today's state, and back.
  const switchButton =
    source === 'archived' ? (
      viewCurrent
    ) : source === 'current' && version === 'current' ? (
      <Button icon="chevronLeft" onClick={() => switchTo('auto')}>
        {switchLabel(archivedLabel)}
      </Button>
    ) : null

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? `${target.company} – ${target.jobTitle}` : t('applications.dossier.preview')}
      icon="fileText"
      size="full"
      footer={
        <>
          <Button onClick={onClose}>{t('common.close')}</Button>
          {target && (
            <Button variant="confirm" icon="download" onClick={() => onDownload(target)}>
              {t('applications.dossier.download')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-2 px-3 py-2" data-testid="dossier-source">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {/* Both labels are drawn invisibly, so the badge takes the same room whichever version it names. */}
            <span className="grid shrink-0">
              {badge && <span className={`badge col-start-1 row-start-1 ${source === 'archived' ? 'badge-info' : 'badge-neutral'}`}>{badge}</span>}
              {badgeLabels.map((label) => (
                <span key={label} aria-hidden="true" data-reserved={label} className="badge invisible col-start-1 row-start-1 select-none after:content-[attr(data-reserved)]" />
              ))}
            </span>
            <div className="min-w-0 flex-1">
              <MessageSlot message={message} reserve={texts} />
            </div>
          </div>
          {switchButton}
        </div>
        <PdfPreview
          preview={preview}
          title={t('applications.dossier.previewFrame')}
          className="h-[calc(90vh-17rem)] min-h-[360px]"
          errorAction={archiveMissing ? viewCurrent : undefined}
        />
      </div>
    </Dialog>
  )
}
