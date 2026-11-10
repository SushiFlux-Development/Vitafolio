import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { applicationsApi, profileApi } from '../../api/endpoints'
import type { ContentSuggestion } from '../../api/types'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { knownIdsOf } from './cvSelection'

/** The query key of one application's details, so the list page, the details and the edit form all write to the same cache entry. */
export const applicationDetailKey = (id: string | null) => ['applications', 'detail', id] as const

/** Every application, unfiltered: the query of the export page and the dashboard, and the cache entry of the tracker page without filters. */
export const allApplicationsKey = ['applications', 'list', 'all', ''] as const

export const contentSuggestionKey = ['applications', 'content-suggestion'] as const

/**
 * The suggestion of the server for what an application of this person should contain. It is fetched in the background while the
 * form is open; `take` hands it to the caller when the user clicks "take the suggestion". If it is not there (still loading, or the
 * load failed), `take` asks again and, when that fails too, reports the complete error in the app's error dialog.
 */
export function useContentSuggestion(enabled: boolean) {
  const { t } = useTranslation()
  const showError = useErrorDialog()
  const query = useQuery({
    queryKey: contentSuggestionKey,
    queryFn: () => applicationsApi.contentSuggestion(),
    enabled,
  })

  const take = async (apply: (suggestion: ContentSuggestion) => void) => {
    const result = query.data ? { data: query.data, error: null } : await query.refetch()
    if (result.data) apply(result.data)
    else showError(result.error, t('applications.content.errors.suggestion'))
  }

  return { query, take }
}

/** The sections the person left out of the master profile's own CV (they start a new application off the same way). */
export function useProfileHiddenSections(enabled: boolean): readonly string[] {
  return useQuery({ queryKey: ['profile'], queryFn: () => profileApi.get(), enabled, select: (profile) => profile.cvContentSettings?.overrides?.hiddenSections ?? NO_SECTIONS }).data ?? NO_SECTIONS
}

const NO_SECTIONS: readonly string[] = []

/**
 * The ids the master profile has today (undefined while it loads or when it cannot be read), so a summary counts only entries that
 * still exist. The profile is shared with the profile page through its query key.
 */
export function useKnownProfileIds(enabled: boolean) {
  return useQuery({ queryKey: ['profile'], queryFn: () => profileApi.get(), enabled, select: knownIdsOf }).data
}
