import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { profileApi } from '../../api/endpoints'
import type { GuideAnswers } from '../../api/types'

export const GUIDE_ANSWERS_KEY = ['guide-answers'] as const

/** The saved answers of the account, or `null` when the wizard was never completed. */
export function useGuideAnswers() {
  return useQuery({
    queryKey: GUIDE_ANSWERS_KEY,
    // An empty answer is "none yet"; a query function must not return undefined.
    queryFn: async () => (await profileApi.getGuideAnswers()) ?? null,
  })
}

/** Saves the answers; the server's normalised copy replaces the cached one, so the plan is built from what is stored. */
export function useSaveGuideAnswers() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (answers: GuideAnswers) => (await profileApi.saveGuideAnswers(answers)) ?? answers,
    onSuccess: (saved) => {
      queryClient.setQueryData(GUIDE_ANSWERS_KEY, saved)
      // The suggestion per application is built from these answers.
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
    },
  })
}
