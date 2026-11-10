import { useBootstrapQuery } from '../../auth/useAuth'
import type { DocumentDesign } from '../../api/types'

/** The design used when none was chosen yet (the server's default). */
export const DEFAULT_DESIGN = 'classic'

// Until the server's list has arrived only the default is offered; the full list is never repeated in the UI.
const DEFAULT_ONLY: DocumentDesign[] = [{ id: DEFAULT_DESIGN }]

/** The group a design belongs to when the server names none. */
const STANDARD_GROUP = 'standard'

export interface DesignGroup {
  group: string
  designs: DocumentDesign[]
}

/** The CV designs on offer. The server ships and publishes them (/api/bootstrap): preview, export and dossier share one list. */
export function useDocumentDesigns(): DocumentDesign[] {
  const { data } = useBootstrapQuery()
  return data?.documentDesigns?.length ? data.documentDesigns : DEFAULT_ONLY
}

/** The designs by group, in the order the server lists them. */
export function groupDesigns(designs: DocumentDesign[]): DesignGroup[] {
  const groups = new Map<string, DocumentDesign[]>()
  for (const design of designs) {
    const name = design.group ?? STANDARD_GROUP
    groups.set(name, [...(groups.get(name) ?? []), design])
  }
  return [...groups].map(([group, members]) => ({ group, designs: members }))
}
