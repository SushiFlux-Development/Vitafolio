import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { whatsNewApi } from '../../api/endpoints'
import type { LanguageCode, WhatsNew } from '../../api/types'
import { useAppState } from '../../auth/AppState'
import { useVersion } from '../../hooks/useVersion'
import { WhatsNewDialog } from './WhatsNewDialog'

const PENDING_KEY = ['whats-new', 'pending'] as const

/**
 * Opens "What's new" by itself, once, when the server says the notes of the running version are due for this person (the first
 * start after an update). Closing marks them as seen on the server, so they never come back for this version. Never in a
 * development build: the server does not write there either, and the question is not even asked.
 */
export function WhatsNewHost() {
  const { i18n } = useTranslation()
  const { session } = useAppState()
  const queryClient = useQueryClient()
  const version = useVersion()
  const [closed, setClosed] = useState(false)

  const language: LanguageCode = i18n.language.startsWith('en') ? 'en' : 'de'
  // The account's own language is applied right after the first render; asking earlier would fetch the notes in the wrong one.
  const savedLanguage = session.user?.language
  const languageReady = !savedLanguage || i18n.language.startsWith(savedLanguage)

  // The question itself marks the first contact with a version on the server: ask once per page load, never again on focus or remount.
  const pending = useQuery({
    queryKey: PENDING_KEY,
    queryFn: () => whatsNewApi.pending(language),
    enabled: version.isSuccess && version.data.channel !== 'dev' && languageReady,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const markSeen = useMutation({
    mutationFn: whatsNewApi.markSeen,
    // A failed mark is not worth interrupting anybody: the notes would simply come once more at the next start.
    onSuccess: () => queryClient.setQueryData<WhatsNew | undefined>(PENDING_KEY, (current) => (current ? { ...current, show: false } : current)),
  })

  const notes = pending.data
  // After closing, the dialog stays mounted (closed) so that it can fade out.
  if (!notes || (!notes.show && !closed)) return null

  return (
    <WhatsNewDialog
      open={!closed}
      notes={notes}
      onClose={() => {
        setClosed(true)
        markSeen.mutate()
      }}
    />
  )
}
