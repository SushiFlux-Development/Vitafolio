import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { AutoSaveEngine } from './autoSaveEngine'
import type { AutoSaveEngineOptions, AutoSaveSnapshot } from './autoSaveEngine'
import { draftKey } from './draftStore'

export { AUTOSAVE_DELAY_MS, AUTOSAVE_MAX_WAIT_MS, AUTOSAVE_RETRY_DELAYS_MS, AUTOSAVE_SLOW_MS, flushAllAutoSaves } from './autoSaveEngine'
export type { AutoSaveFailure, AutoSavePhase, AutoSaveSnapshot, FailureKind } from './autoSaveEngine'

export interface UseAutoSaveOptions<T, R> extends Omit<AutoSaveEngineOptions<T, R>, 'draft'> {
  /** The state the form starts from (what the server has). Later changes of this value are ignored; use `reset`. */
  initial: T
  /**
   * The local copy: which account and form it belongs to (`cv.draft.<account>.<form>`) and the server state the typing is based
   * on. Without an account (isolated tests) there is no local copy.
   */
  draft?: { accountId: string | undefined; form: string; base: () => string } | null
}

export interface AutoSave<T> {
  /** What is on the screen: the newest state, never replaced by an answer of the server. */
  value: T
  setValue: (next: T | ((current: T) => T)) => void
  /** The newest value right now, also between two renders (for code that builds the next value from it). */
  peek: () => T
  state: AutoSaveSnapshot<T>
  /** The state right now, also between two renders (after an `await`, where `state` is the one of an earlier render). */
  latest: () => AutoSaveSnapshot<T>
  /** Sends the newest state at once; true when the server has everything afterwards. */
  flush: () => Promise<boolean>
  /** The server's state was replaced from outside: start over from it. */
  reset: (next: T) => void
  /** Gives up what could not be saved; back to the last confirmed state. */
  discard: () => void
}

function engineOptions<T, R>(options: UseAutoSaveOptions<T, R>): AutoSaveEngineOptions<T, R> {
  const { initial: _initial, draft, ...rest } = options
  return { ...rest, draft: draft?.accountId ? { key: draftKey(draft.accountId, draft.form), base: draft.base } : null }
}

/**
 * A form that saves by itself. The caller shows `value`, calls `setValue` on every keystroke and renders `state` (see
 * {@link autoSaveView}); everything else happens here:
 *
 * - every change is copied into the local storage at once, before and independent of any request;
 * - the request goes out 400 ms after the last keystroke, at the latest every 2 s of continuous typing, one at a time, always
 *   the newest state; an answer never replaces what is on the screen (the server trims, the user is still typing);
 * - leaving (the form unmounts, the tab is hidden or closed, the connection returns) sends at once;
 * - a failure keeps the input, retries after 2 s, 5 s, 15 s and then every 30 s, and never opens a dialog by itself.
 */
export function useAutoSave<T, R = unknown>(options: UseAutoSaveOptions<T, R>): AutoSave<T> {
  const [engine] = useState(() => new AutoSaveEngine<T, R>(options.initial, engineOptions(options)))
  // The callbacks of the latest render, so the long-lived loop never calls an outdated closure.
  useEffect(() => {
    engine.configure(engineOptions(options))
  })

  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot)

  useEffect(() => {
    engine.enter()
    const hide = () => engine.pageHidden()
    const show = () => engine.pageVisible()
    const visibility = () => (document.visibilityState === 'hidden' ? hide() : show())
    const online = () => engine.retryNow()
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', show)
    window.addEventListener('online', online)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', show)
      window.removeEventListener('online', online)
      document.removeEventListener('visibilitychange', visibility)
      engine.leave()
    }
  }, [engine])

  const setValue = useCallback((next: T | ((current: T) => T)) => engine.change(typeof next === 'function' ? (next as (current: T) => T)(engine.current()) : next), [engine])
  const latest = useCallback(() => engine.getSnapshot(), [engine])
  const peek = useCallback(() => engine.current(), [engine])
  const flush = useCallback(() => engine.flush(), [engine])
  const reset = useCallback((next: T) => engine.reset(next), [engine])
  const discard = useCallback(() => engine.discard(), [engine])

  return { value: state.value, setValue, peek, state, latest, flush, reset, discard }
}

/** What the status line says. */
export type AutoSaveView =
  /** The server has it, or the save is on its way and quick (nothing to announce). */
  | 'saved'
  /** A change has been waiting for the server for more than a moment. */
  | 'saving'
  /** The input cannot be sent yet (missing or red values); it is kept locally. */
  | 'blocked'
  /** The server could not be reached or failed; the same state is tried again by itself. */
  | 'retrying'
  /** The server refused the values or the target is gone; it is not repeated until the input changes. */
  | 'rejected'
  /** The session ran out; the input waits in the local copy for the next sign-in. */
  | 'signedOut'

/** `incomplete`: nothing is wrong with the typing, but what the server has lacks required values - that is said instead of "saved". */
export function autoSaveView(state: AutoSaveSnapshot<unknown>, incomplete = false): AutoSaveView {
  const failure = state.failure
  if (failure) return failure.kind === 'transient' ? 'retrying' : failure.kind === 'auth' ? 'signedOut' : 'rejected'
  if (state.phase === 'blocked' || (incomplete && state.phase !== 'saving')) return 'blocked'
  if (state.changed && state.slow) return 'saving'
  return 'saved'
}
