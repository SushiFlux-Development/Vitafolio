/**
 * The local copy of what somebody typed into a form that saves by itself: written on every keystroke, removed once the server
 * has confirmed exactly this state. It is the safety net behind the automatic saving - if the server cannot be reached, the
 * session ran out or the tab is closed, nothing typed is lost.
 *
 * Every access is guarded: storage can be full, switched off or blocked (private mode, policy), and the form has to work the
 * same without it. A key looks like `cv.draft.<account id>.<form>`; the account id keeps two people on one browser apart.
 */

const PREFIX = 'cv.draft.'

/** What is stored under one key. */
export interface StoredDraft<T> {
  /** The form's values, as they were sent to the server. */
  value: T
  /** When the last keystroke happened (milliseconds since 1970). */
  savedAt: number
  /** The state of the server this input is based on (the letter's last-change time, a fingerprint of the stored fields). */
  base: string
}

/** The storage key of one form of one account. */
export function draftKey(accountId: string, form: string): string {
  return `${PREFIX}${accountId}.${form}`
}

/** Writes the copy; false when the browser refused (the form carries on without it). */
export function writeDraft<T>(key: string, draft: StoredDraft<T>): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

/**
 * Reads the copy. `accept` turns the parsed JSON into a value of the right shape or refuses it (null): a copy written by an
 * older version, edited by hand or cut off is ignored instead of breaking the form.
 */
export function readDraft<T>(key: string, accept: (raw: unknown) => T | null): StoredDraft<T> | null {
  try {
    const text = localStorage.getItem(key)
    if (text === null) return null
    const parsed: unknown = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object') return null
    const { value, savedAt, base } = parsed as Record<string, unknown>
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || typeof base !== 'string') return null
    const accepted = accept(value)
    return accepted === null ? null : { value: accepted, savedAt, base }
  } catch {
    return null
  }
}

export function removeDraft(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Nothing to remove if the storage cannot be reached.
  }
}

/** Removes the copy only while it still holds exactly `value`, so a newer copy written meanwhile is never taken away. */
export function removeDraftIfSame(key: string, value: unknown): void {
  try {
    const text = localStorage.getItem(key)
    if (text === null) return
    const stored = (JSON.parse(text) as { value?: unknown } | null)?.value
    if (JSON.stringify(stored) === JSON.stringify(value)) localStorage.removeItem(key)
  } catch {
    // Unreadable or unreachable: leave it, a copy too many is harmless.
  }
}

/** Removes every copy of one account (explicit sign-out); the copies of other accounts stay. */
export function removeAccountDrafts(accountId: string): void {
  try {
    const own = `${PREFIX}${accountId}.`
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(own)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // No access, nothing to remove.
  }
}

/**
 * Removes the copies of things that no longer exist: `form` is the shared part of the key ("coverLetter"), the part behind it
 * the id of the item. Copies of the ids in `keep` stay.
 */
export function removeDraftsExcept(accountId: string, form: string, keep: ReadonlySet<string>): void {
  try {
    const own = `${PREFIX}${accountId}.${form}.`
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(own) && !keep.has(key.slice(own.length))) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // No access, nothing to remove.
  }
}

/** What to do with a copy found when a form opens. */
export type RestoreDecision<T> =
  /** No copy, or one that says nothing new (the server already has it): nothing to do, the copy goes. */
  | { kind: 'none' }
  /** The server has not changed since the copy was made: take the input over and save it. */
  | { kind: 'apply'; draft: StoredDraft<T> }
  /** The server changed meanwhile (another device): the user decides. */
  | { kind: 'ask'; draft: StoredDraft<T> }

/**
 * Decides what a found copy means. `normalize` turns a value into what the server would store of it (trimmed text, ...), so a
 * copy that only differs by a blank at the end counts as already saved.
 */
export function decideRestore<T>(draft: StoredDraft<T> | null, server: { value: T; base: string }, normalize: (value: T) => unknown): RestoreDecision<T> {
  if (!draft) return { kind: 'none' }
  if (JSON.stringify(normalize(draft.value)) === JSON.stringify(normalize(server.value))) return { kind: 'none' }
  return draft.base === server.base ? { kind: 'apply', draft } : { kind: 'ask', draft }
}
