import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api/client'
import { docsApi } from '../../api/endpoints'
import type { LanguageCode } from '../../api/types'
import { branding } from '../../branding'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Icon } from '../../components/ui/Icon'
import { PdfPreview, pdfViewerUrl } from '../../components/ui/PdfPreview'
import { Segmented } from '../../components/ui/Segmented'
import { useAbout } from '../../hooks/useAbout'
import { usePdfPreview } from '../../hooks/usePdfPreview'

interface HandbookViewerProps {
  open: boolean
  onClose: () => void
}

/**
 * The manual inside the app: the PDF in an embedded frame (the same preview as for the documents), in the language of the
 * interface unless the reader switches. Download and "open in a new tab" are the way out when the embedded viewer is not
 * available. A build without the manual says so plainly instead of showing an error.
 */
export function HandbookViewer({ open, onClose }: HandbookViewerProps) {
  const { t, i18n } = useTranslation()
  const about = useAbout()
  const uiLanguage: LanguageCode = i18n.language.startsWith('en') ? 'en' : 'de'
  // Where the reader switched to; null = follow the interface language.
  const [chosen, setChosen] = useState<LanguageCode | null>(null)
  const language = chosen ?? uiLanguage

  const available = about.data?.handbook
  const missingForSure = available !== undefined && !available[language]
  const both = available !== undefined && available.de && available.en

  const load = useCallback((signal: AbortSignal) => docsApi.handbookPdf(language, signal), [language])
  const preview = usePdfPreview({ load, enabled: open && !about.isPending && !missingForSure, resetKey: language })
  const notAvailable = missingForSure || (preview.error instanceof ApiError && preview.error.code === 'handbook.not_available')

  const fileName = `${branding.name}-${language === 'en' ? 'Handbook' : 'Handbuch'}.pdf`
  const linkClass = 'btn btn-secondary'
  const hasFile = Boolean(preview.url) && !preview.error

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('handbook.title')}
      icon="book"
      size="full"
      footer={
        <>
          {both && (
            <div className="mr-auto">
              <Segmented
                label={t('handbook.language')}
                value={language}
                onChange={setChosen}
                options={[
                  { value: 'de', label: t('handbook.languages.de') },
                  { value: 'en', label: t('handbook.languages.en') },
                ]}
              />
            </div>
          )}
          {hasFile ? (
            <>
              <a href={preview.url ? pdfViewerUrl(preview.url) : undefined} target="_blank" rel="noopener noreferrer" className={linkClass} data-testid="handbook-new-tab">
                <Icon name="externalLink" size={17} />
                {t('handbook.openInTab')}
              </a>
              <a href={preview.url ?? undefined} download={fileName} className={linkClass} data-testid="handbook-download">
                <Icon name="download" size={17} />
                {t('handbook.download')}
              </a>
            </>
          ) : (
            <>
              <span className={`${linkClass} opacity-55`} aria-disabled="true">
                <Icon name="externalLink" size={17} />
                {t('handbook.openInTab')}
              </span>
              <span className={`${linkClass} opacity-55`} aria-disabled="true">
                <Icon name="download" size={17} />
                {t('handbook.download')}
              </span>
            </>
          )}
          <Button variant="confirm" onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      {notAvailable ? (
        <EmptyState icon="book" title={t('handbook.notAvailableTitle')} text={t('handbook.notAvailableText')} />
      ) : (
        <PdfPreview preview={preview} title={t('handbook.frame')} className="h-[calc(90vh-12rem)] min-h-[420px]" />
      )}
    </Dialog>
  )
}
