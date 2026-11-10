import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { profileApi } from '../../api/endpoints'
import type { CvContentSettings, Profile } from '../../api/types'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { contentSuggestionKey } from '../tracker/queries'

/**
 * Saves what the master profile shows in its own CV. A change is visible at once (written into the profile in the cache) and
 * sent right away; changes go out one after the other, in the order they were made, so an older answer never overwrites a newer
 * choice. After every saved change `onSaved` runs - only then may the preview be rendered again, otherwise it could show the old
 * selection. A failure is shown in the error dialog (complete and copyable) and the profile is loaded again, so the screen shows
 * what the server really has.
 */
export function useContentSettingsSaver(onSaved: () => void) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const showError = useErrorDialog()
  const queue = useRef<Promise<void>>(Promise.resolve())
  const waiting = useRef(0)
  const onSavedRef = useRef(onSaved)
  useEffect(() => {
    onSavedRef.current = onSaved
  })

  return (next: CvContentSettings) => {
    queryClient.setQueryData<Profile>(['profile'], (previous) => (previous ? { ...previous, cvContentSettings: next } : previous))
    waiting.current += 1
    queue.current = queue.current.then(async () => {
      try {
        const saved = await profileApi.saveCvContentSettings(next)
        waiting.current -= 1
        // The normalised answer replaces the optimistic value only when nothing newer is waiting.
        if (waiting.current === 0) queryClient.setQueryData<Profile>(['profile'], (previous) => (previous ? { ...previous, cvContentSettings: saved } : previous))
        await queryClient.invalidateQueries({ queryKey: contentSuggestionKey })
        onSavedRef.current()
      } catch (error) {
        waiting.current -= 1
        showError(error, t('profile.preview.content.saveFailed'))
        void queryClient.invalidateQueries({ queryKey: ['profile'] })
      }
    })
  }
}
