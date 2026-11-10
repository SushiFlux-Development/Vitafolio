import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { PreviewOptions, Profile } from '../../api/types'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { DEFAULT_DOCUMENT_COLOR } from '../../features/documents/palette'
import { DEFAULT_DESIGN } from '../../features/documents/useDocumentDesigns'
import { useAutoSave } from '../../hooks/useAutoSave'

/** Quiet time after the last change before the choice is sent; quick switching causes one request. */
export const PREVIEW_OPTIONS_SAVE_DELAY_MS = 600

/** The saved choice, or the defaults (document language follows the interface language) when nothing is saved yet. */
export function initialPreviewOptions(saved: PreviewOptions | null | undefined, uiLanguage: string | undefined): PreviewOptions {
  return (
    saved ?? {
      design: DEFAULT_DESIGN,
      accentColor: DEFAULT_DOCUMENT_COLOR,
      font: 'Liberation Sans',
      showPhoto: true,
      photoShape: 'rounded',
      language: uiLanguage?.startsWith('en') ? 'en' : 'de',
    }
  )
}

/**
 * The options of "Preview & export" with automatic, debounced saving (the shared save loop of the forms, see useAutoSave).
 *
 * - A change applies at once (state) and is written into the profile query at once, so coming back finds it.
 * - The request goes out after a quiet period, one at a time; a change made while one is running is sent right after it.
 *   An answer is only written into the query when nothing newer is waiting, so an old answer never overwrites a newer choice.
 * - Leaving the section sends a pending change immediately.
 * - A failure opens the error dialog (complete and copyable); the next change tries again. There is no status line here, so
 *   the choice is not retried in the background - and being a click, not typed text, it has no local copy.
 */
export function usePreviewOptions(saved: PreviewOptions | null | undefined) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()

  const writeCache = useCallback(
    (value: PreviewOptions) => {
      queryClient.setQueryData<Profile>(['profile'], (previous) => (previous ? { ...previous, previewOptions: value } : previous))
    },
    [queryClient],
  )

  const autosave = useAutoSave<PreviewOptions, PreviewOptions>({
    initial: initialPreviewOptions(saved, i18n.language),
    save: (value, { keepalive }) => (keepalive ? profileApi.savePreviewOptions(value, { keepalive }) : profileApi.savePreviewOptions(value)),
    isSendable: () => true,
    onSaved: (normalised, { newer }) => {
      if (!newer) writeCache(normalised)
    },
    delayMs: PREVIEW_OPTIONS_SAVE_DELAY_MS,
    retry: false,
  })

  const { peek, setValue } = autosave
  const update = useCallback(
    (patch: Partial<PreviewOptions>) => {
      const next = { ...peek(), ...patch }
      setValue(next)
      writeCache(next)
    },
    [peek, setValue, writeCache],
  )

  // Each failure is shown once, completely; the next change tries again.
  const failure = autosave.state.failure
  useEffect(() => {
    if (failure) showError(failure.error, t('profile.preview.saveOptionsFailed'))
  }, [failure, showError, t])

  return { options: autosave.value, update }
}
