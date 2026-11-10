import { useBootstrapQuery } from '../../auth/useAuth'
import type { DocumentFont } from '../../api/types'

// Until the server's list has arrived only the default is offered; the full list is never repeated in the UI.
const DEFAULT_ONLY: DocumentFont[] = [{ family: 'Liberation Sans', serif: false }]

/** The fonts documents can be rendered with. The server ships and publishes them (/api/bootstrap): CV, cover letter and dossier share one list. */
export function useDocumentFonts(): DocumentFont[] {
  const { data } = useBootstrapQuery()
  return data?.documentFonts?.length ? data.documentFonts : DEFAULT_ONLY
}

/** The font to show as selected: a stored name that is no longer offered falls back to the first one (the server does the same when rendering). */
export function selectedFont(fonts: DocumentFont[], value: string | null | undefined): string {
  return fonts.find((f) => f.family === value)?.family ?? fonts[0]?.family ?? 'Liberation Sans'
}
