import { ApiError } from '../../api/client'
import { DOSSIER_ARCHIVE_LIMIT } from '../../api/endpoints'

/** The code of the "some dossiers of the ZIP could not be built" notice (text: errors.codes.dossiers.partial_failed). */
export const PARTIAL_FAILURE_CODE = 'dossiers.partial_failed'

export type SelectAllState = 'none' | 'some' | 'all'

/** The ids of the chosen applications in the order of the list; an id that is no longer in the list (deleted meanwhile) is dropped. */
export function chosenIds(items: readonly { id: string }[], chosen: ReadonlySet<string>): string[] {
  return items.filter((item) => chosen.has(item.id)).map((item) => item.id)
}

/** Whether none, some or all of the listed applications are chosen (the state of the "select all" box). */
export function selectAllState(total: number, chosenCount: number): SelectAllState {
  if (total === 0 || chosenCount === 0) return 'none'
  return chosenCount >= total ? 'all' : 'some'
}

/** More applications than one ZIP request takes. */
export function overLimit(chosenCount: number): boolean {
  return chosenCount > DOSSIER_ARCHIVE_LIMIT
}

/**
 * The notice for a ZIP in which some dossiers are missing. It is an {@link ApiError} of the client's own making (status 0), so it is
 * shown by the same notice as every failure: complete, with a copy button that carries the code, the version and the time.
 */
export function partialFailure(failed: number, total: number): ApiError {
  return new ApiError(0, { code: PARTIAL_FAILURE_CODE, params: { failed, total } })
}
