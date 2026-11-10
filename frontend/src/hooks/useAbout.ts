import { useQuery } from '@tanstack/react-query'
import { publicApi } from '../api/endpoints'

export const ABOUT_KEY = ['about'] as const

/** Licence, source code and which manuals this build contains (public; fetched once, it only changes with a new build). */
export function useAbout() {
  return useQuery({ queryKey: ABOUT_KEY, queryFn: publicApi.about, staleTime: Infinity, gcTime: Infinity, retry: false })
}

/** The page with the published versions, derived from the source address the server names (never a fixed address in the app). */
export function releasesUrl(sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null
  return `${sourceUrl.replace(/\/+$/, '')}/releases`
}
