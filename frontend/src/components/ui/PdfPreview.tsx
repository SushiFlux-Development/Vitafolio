import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PdfPreviewState } from '../../hooks/usePdfPreview'
import { Button } from './Button'
import { Icon } from './Icon'
import { ErrorNotice } from './Notice'

/**
 * Open parameters of the embedded PDF viewer, appended to the object URL as a fragment: `navpanes=0` starts without the
 * thumbnail sidebar, `view=FitH` fits the page to the width of the frame. They only set the start state; the reader can still
 * open the sidebar and zoom. (Chromium's viewer reads both from the fragment of the document URL, see its open_pdf_params_parser.)
 */
export const PDF_OPEN_PARAMETERS = 'navpanes=0&view=FitH'

/** The address of a rendered PDF for viewing: with the open parameters (a download keeps the plain address). */
export function pdfViewerUrl(url: string): string {
  return `${url}#${PDF_OPEN_PARAMETERS}`
}

interface PdfPreviewProps {
  preview: PdfPreviewState
  /** Accessible name of the embedded document ("Lebenslauf-Vorschau"). */
  title: string
  /** Height classes of the frame; the box keeps this height whatever happens inside (loading, failure, document). */
  className?: string
  /** Replaces "try again" under a failure for which trying again is pointless (a lost archive: the way on is another version). */
  errorAction?: ReactNode
}

/**
 * The one PDF preview of the app (CV, cover letter, dossier): an embedded frame showing the object URL, a calm overlay while
 * a new version renders (the old page stays visible underneath, nothing jumps), and the full, copyable error with a
 * "try again" button when rendering fails. Gives the viewer no thumbnail sidebar and fits the page to the width (see PDF_OPEN_PARAMETERS). The server's content security policy allows exactly this: a frame with a blob: source.
 */
export function PdfPreview({ preview, title, className = 'h-[max(30rem,calc(100vh-14rem))]', errorAction }: PdfPreviewProps) {
  const { t } = useTranslation()
  const { url, loading, error, refresh } = preview

  return (
    <div className={`relative w-full overflow-hidden rounded-md border border-line bg-sunken ${className}`} aria-busy={loading}>
      {url && !error && <iframe src={pdfViewerUrl(url)} title={title} data-testid="pdf-preview-frame" className="h-full w-full border-0 bg-surface" />}

      {error !== null && error !== undefined && (
        <div className="absolute inset-0 z-10 flex flex-col items-stretch justify-start gap-3 overflow-y-auto bg-sunken p-5">
          <ErrorNotice error={error} title={t('preview.failed')} />
          <div>
            {errorAction ?? (
              <Button variant="secondary" icon="refresh" onClick={refresh}>
                {t('preview.retry')}
              </Button>
            )}
          </div>
        </div>
      )}

      {!url && !error && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-ink-muted" role="status">
          <Icon name="loader" size={22} className="animate-spin" />
          <span>{t('preview.loading')}</span>
        </div>
      )}

      {url && !error && loading && (
        <div
          className="pointer-events-none absolute top-3 right-3 z-10 flex items-center gap-2 rounded-sm border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted"
          role="status"
        >
          <Icon name="loader" size={14} className="animate-spin" />
          {t('preview.loading')}
        </div>
      )}
    </div>
  )
}
