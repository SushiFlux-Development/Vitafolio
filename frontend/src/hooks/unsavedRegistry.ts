import { useEffect, useSyncExternalStore } from 'react'

/**
 * Who currently holds input that is not saved yet (a page with a changed draft, a form dialog with typed text). The page-level
 * question "may I leave?" is asked by the router guard; this registry answers the app-level question "is anything open that
 * a restart would throw away?" - for the one-click update, which closes the program.
 */
const holders = new Set<symbol>()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** True while at least one place holds unsaved input. Read at the moment of a click, not cached. */
export function hasUnsavedChanges(): boolean {
  return holders.size > 0
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reactive variant of {@link hasUnsavedChanges}. */
export function useHasUnsavedChanges(): boolean {
  return useSyncExternalStore(subscribe, hasUnsavedChanges, () => false)
}

/** Registers the calling component as a holder of unsaved input while `when` is true. */
export function useRegisterUnsaved(when: boolean): void {
  useEffect(() => {
    if (!when) return
    const id = Symbol('unsaved')
    holders.add(id)
    emit()
    return () => {
      holders.delete(id)
      emit()
    }
  }, [when])
}
