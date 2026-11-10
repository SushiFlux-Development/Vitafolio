import { useCallback, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { saveBlob } from '../../api/download'
import { profileApi } from '../../api/endpoints'
import type { CvRenderOptions, PreviewOptions } from '../../api/types'
import { Button } from '../../components/ui/Button'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { PdfPreview } from '../../components/ui/PdfPreview'
import { Segmented } from '../../components/ui/Segmented'
import { SelectField } from '../../components/ui/SelectField'
import { Toggle } from '../../components/ui/Toggle'
import { ColorSwatches } from '../../features/documents/ColorSwatches'
import { DesignGallery } from '../../features/documents/DesignGallery'
import { DEFAULT_DESIGN, useDocumentDesigns } from '../../features/documents/useDocumentDesigns'
import { selectedFont, useDocumentFonts } from '../../features/documents/useDocumentFonts'
import { usePdfPreview } from '../../hooks/usePdfPreview'
import { PreviewContent } from './PreviewContent'
import { usePreviewOptions } from './usePreviewOptions'

/**
 * "Preview & export": the options and the PDF. From 1536 px on the options are a narrow fixed column on the left that stays in
 * view while the page scrolls, and the preview gets all the rest of the width and the height of the window. In a narrower
 * window the options lie in a compact block above the preview (their groups wrap into as many columns as fit), and the
 * preview takes the full width below them - also in a tall, narrow window, where it grows with the height.
 */
export function PreviewTab({ saved }: { saved?: PreviewOptions | null }) {
  const { t } = useTranslation()
  const fonts = useDocumentFonts()
  const designs = useDocumentDesigns()
  const showError = useErrorDialog()

  // Starts with the remembered choice; every change is kept automatically (no save button).
  const { options, update } = usePreviewOptions(saved)

  // What the master profile shows is decided on the server (the suggestion and the person's own corrections), so every render asks
  // for it. A change of those settings is saved first and only then counted up here, so the next picture never shows the old selection.
  const [contentRevision, setContentRevision] = useState(0)
  const renderOptions = useMemo(() => ({ ...options, applySelection: true }), [options])

  // A new picture after the last change of the options; a slower older answer can never replace a newer one.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the revision is no input of the request, it only asks for a new picture
  const load = useCallback((signal: AbortSignal) => profileApi.getPreviewPdf(renderOptions, signal), [renderOptions, contentRevision])
  const preview = usePdfPreview({ load, debounceMs: 250 })

  const exportPdf = useMutation({
    mutationFn: () => profileApi.exportPdf(renderOptions),
    onSuccess: ({ blob, filename }) => saveBlob(blob, filename),
    onError: (error) => showError(error, t('profile.preview.exportFailed')),
  })
  const exportDocx = useMutation({
    mutationFn: () => profileApi.exportDocx(renderOptions),
    onSuccess: ({ blob, filename }) => saveBlob(blob, filename),
    onError: (error) => showError(error, t('profile.preview.exportFailed')),
  })

  return (
    <div className="grid items-start gap-6 2xl:grid-cols-[19rem_minmax(0,1fr)]">
      <section
        className="card p-5 2xl:sticky 2xl:top-(--page-gutter) 2xl:max-h-[calc(100vh-2*var(--page-gutter))] 2xl:overflow-y-auto"
        aria-label={t('profile.preview.options')}
      >
        <h2 className="text-base font-semibold text-ink">{t('profile.preview.title')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t('profile.preview.subtitle')}</p>

        <div className="mt-5 grid gap-x-8 gap-y-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))]">
          <div className="col-span-full">
            <PreviewContent onChanged={() => setContentRevision((value) => value + 1)} />
          </div>

          <div className="col-span-full" data-hint="preview-design">
            <DesignGallery designs={designs} value={options.design ?? DEFAULT_DESIGN} onChange={(value) => update({ design: value })} />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-ink">{t('profile.preview.language')}</p>
            <Segmented<'de' | 'en'>
              label={t('profile.preview.language')}
              value={options.language ?? 'de'}
              onChange={(value) => update({ language: value })}
              options={[
                { value: 'de', label: t('profile.preview.languageDe') },
                { value: 'en', label: t('profile.preview.languageEn') },
              ]}
            />
          </div>

          <div data-hint="preview-color">
            <p className="mb-2 text-sm font-semibold text-ink">{t('profile.preview.color')}</p>
            <ColorSwatches value={options.accentColor} onChange={(hex) => update({ accentColor: hex })} label={t('profile.preview.color')} />
          </div>

          <div data-hint="preview-font">
            <SelectField label={t('profile.preview.font')} value={selectedFont(fonts, options.font)} onChange={(event) => update({ font: event.target.value })}>
              {fonts.map((font) => (
                <option key={font.family} value={font.family}>
                  {font.family}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="space-y-3">
            <Toggle label={t('profile.preview.showPhoto')} checked={options.showPhoto ?? true} onChange={(checked) => update({ showPhoto: checked })} />
            {/* Stays in place when the photo is off (only dimmed), so switching it never moves the controls below. */}
            <div className={options.showPhoto ? '' : 'opacity-60'}>
              <p className="mb-2 text-xs font-semibold text-ink-muted">{t('profile.preview.photoShape')}</p>
              <Segmented<NonNullable<CvRenderOptions['photoShape']>>
                label={t('profile.preview.photoShape')}
                value={options.photoShape ?? 'rounded'}
                disabled={!options.showPhoto}
                onChange={(value) => update({ photoShape: value })}
                options={[
                  { value: 'round', label: t('profile.preview.photoShapes.round') },
                  { value: 'rounded', label: t('profile.preview.photoShapes.rounded') },
                  { value: 'rect', label: t('profile.preview.photoShapes.rect') },
                ]}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4" data-hint="preview-export">
          <Button icon="refresh" busy={preview.loading} onClick={preview.refresh}>
            {t('profile.preview.refresh')}
          </Button>
          <Button icon="download" busy={exportDocx.isPending} onClick={() => exportDocx.mutate()}>
            {t('profile.preview.downloadDocx')}
          </Button>
          <Button variant="confirm" icon="download" busy={exportPdf.isPending} onClick={() => exportPdf.mutate()}>
            {t('profile.preview.download')}
          </Button>
        </div>
      </section>

      {/* The preview fills the height of the window below the page header (side by side: it stays in view like the options). */}
      <div className="2xl:sticky 2xl:top-(--page-gutter)" data-hint="preview-pane">
        <PdfPreview
          preview={preview}
          title={t('profile.preview.frameTitle')}
          className="h-[max(36rem,calc(100vh-26rem))] 2xl:h-[max(36rem,calc(100vh-2*var(--page-gutter)-9rem))]"
        />
      </div>
    </div>
  )
}
