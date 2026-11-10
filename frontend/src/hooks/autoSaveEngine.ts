import { ApiError, KEEPALIVE_LIMIT_BYTES } from '../api/client'
import { removeDraft, removeDraftIfSame, writeDraft } from './draftStore'

/** Quiet time after the last keystroke before the server is asked. */
export const AUTOSAVE_DELAY_MS = 400
/** Without a pause in the typing, the newest state still goes out at least this often. */
export const AUTOSAVE_MAX_WAIT_MS = 2000
/** Waiting times after a failed attempt (2 s, 5 s, 15 s, then every 30 s). The last one repeats. */
export const AUTOSAVE_RETRY_DELAYS_MS: readonly number[] = [2000, 5000, 15000, 30000]
/** "Saving ..." is shown only once a change has been waiting for the server this long; a quick save stays unannounced. */
export const AUTOSAVE_SLOW_MS = 1000

/**
 * Why a save failed, as far as the next step is concerned:
 * - `transient`: no connection, server error, too many requests - the same state is tried again later;
 * - `validation`: the server refused the values (400): the same state is never sent again, the fields show the answer;
 * - `auth`: the session is gone (401): no loop, the input stays in the local copy until the next sign-in;
 * - `permanent`: any other refusal (the letter is gone, too large ...): not repeated either.
 */
export type FailureKind = 'transient' | 'validation' | 'auth' | 'permanent'

export function classifyFailure(error: unknown): FailureKind {
  if (!(error instanceof ApiError)) return 'transient'
  if (error.status === 401) return 'auth'
  if (error.status === 400 && (error.code === 'validation.failed' || Object.keys(error.fieldErrors).length > 0)) return 'validation'
  if (error.status === 0 || error.status >= 500 || error.status === 408 || error.status === 429) return 'transient'
  return 'permanent'
}

export interface AutoSaveFailure<T> {
  kind: FailureKind
  error: unknown
  /** The state that was refused. */
  value: T
  /** Failed tries in a row for transient failures (drives the waiting time). */
  attempts: number
}

/**
 * - `clean`: the server has this state;
 * - `waiting`: changed, the request is not out yet (or one is running and a newer state waits behind it);
 * - `blocked`: changed, but not sendable (a required value is missing, a field is red): kept in the local copy only;
 * - `saving`: a request is on its way.
 */
export type AutoSavePhase = 'clean' | 'waiting' | 'blocked' | 'saving'

export interface AutoSaveSnapshot<T> {
  value: T
  phase: AutoSavePhase
  /** The state differs from the last one the server confirmed. */
  changed: boolean
  failure: AutoSaveFailure<T> | null
  /** A change has been waiting for the server for more than the slow threshold. */
  slow: boolean
  /** Something typed could not be saved (blocked or failed) and so lives in the local copy only. */
  unsent: boolean
}

export interface AutoSaveEngineOptions<T, R> {
  /** Sends one state. `keepalive` is set when the page is going away and the body is small enough for it. */
  save: (value: T, context: { keepalive: boolean }) => Promise<R>
  /** False for a state the form shows as red or incomplete: it is kept locally and never sent. */
  isSendable: (value: T) => boolean
  /**
   * The server confirmed `sent`. `newer` is true when the user has typed on since (then the answer must not replace what is
   * on the screen, and the next request is already due).
   */
  onSaved?: (result: R, info: { sent: T; newer: boolean }) => void
  /** Where the local copy goes (null = no local copy), and the server state the typing is based on right now. */
  draft?: { key: string; base: () => string } | null
  delayMs?: number
  maxWaitMs?: number
  retryDelaysMs?: readonly number[]
  /** False = a failed state is not tried again by itself; the next change (or an explicit flush) sends it again. */
  retry?: boolean
  slowMs?: number
}

const encoder = new TextEncoder()

/** Every form that is open right now, so "sign out" can send what is still waiting first. */
const live = new Set<{ flush(): Promise<boolean> }>()

/**
 * The save loop behind {@link useAutoSave}, free of React so its timing can be tested exactly.
 *
 * - Every change is copied into the local storage at once, before anything is sent.
 * - The request follows 400 ms after the last change, at the latest 2 s after the first one of an uninterrupted burst.
 * - One request at a time; when it ends, the newest state goes out next. An answer is handed over together with the
 *   information whether it is already outdated.
 * - A failure never loses anything and never stops the form: transient failures are retried with growing waiting times, a
 *   refusal of the values is not repeated until they change.
 */
export class AutoSaveEngine<T, R = unknown> {
  private o: AutoSaveEngineOptions<T, R>
  private value: T
  private valueJson: string
  /** Counts the changes; the server has everything when the confirmed number is the current one. */
  private version = 0
  private confirmedVersion = 0
  private confirmed: T
  private failure: AutoSaveFailure<T> | null = null
  private sending = false
  private running: Promise<boolean> | null = null
  private left = false
  private exiting = false
  /** Counts resets; an answer that belongs to an earlier epoch is dropped. */
  private epoch = 0
  private slow = false
  private slowTimer: ReturnType<typeof setTimeout> | undefined
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private maxTimer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private snapshot: AutoSaveSnapshot<T>
  private readonly listeners = new Set<() => void>()

  constructor(initial: T, options: AutoSaveEngineOptions<T, R>) {
    this.o = options
    this.value = initial
    this.confirmed = initial
    this.valueJson = JSON.stringify(initial)
    this.snapshot = this.build()
  }

  /** Replaces the callbacks and timings with the ones of the latest render. */
  configure(options: AutoSaveEngineOptions<T, R>): void {
    this.o = options
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): AutoSaveSnapshot<T> => this.snapshot

  /** The newest value, also between two renders. */
  current(): T {
    return this.value
  }

  // ---- changes ------------------------------------------------------------------------------------------------------

  /** A new state: copied locally right now, sent after the quiet period. */
  change(next: T): void {
    const json = JSON.stringify(next)
    // Something that sets the same values again (a field normalising its own text) is no change.
    if (json === this.valueJson) return
    this.value = next
    this.valueJson = json
    this.version += 1
    // A refusal belongs to the values that were refused; new values deserve a new try. A transient failure stays visible
    // until something succeeds.
    if (this.failure && this.failure.kind !== 'transient') this.failure = null

    this.writeCopy()
    if (!this.o.isSendable(next)) {
      this.cancelTimers()
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
    } else {
      // The next try follows the normal rhythm instead of waiting for a long retry time.
      clearTimeout(this.retryTimer)
      this.retryTimer = undefined
      this.schedule()
    }
    this.trackSlow()
    this.notify()
  }

  /** The server's state was replaced from outside (an import): take it as the new truth and forget the old input. */
  reset(next: T): void {
    this.epoch += 1
    this.cancelTimers()
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    this.value = next
    this.confirmed = next
    this.valueJson = JSON.stringify(next)
    this.version += 1
    this.confirmedVersion = this.version
    this.failure = null
    this.dropCopy()
    this.trackSlow()
    this.notify()
  }

  /** Gives up what could not be saved: back to the last confirmed state, the local copy removed. */
  discard(): void {
    this.reset(this.confirmed)
  }

  // ---- sending ------------------------------------------------------------------------------------------------------

  /**
   * Sends the newest state now. Resolves true when the server has everything that was typed, false when it could not be
   * sent (blocked, refused, no connection).
   */
  flush(): Promise<boolean> {
    this.cancelTimers()
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    if (this.running) return this.running
    if (!this.changed()) return Promise.resolve(true)
    return this.drain()
  }

  /** The connection is back: a failed state is tried at once. */
  retryNow(): void {
    if (this.failure?.kind !== 'transient' || !this.changed()) return
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    if (!this.running) void this.drain()
  }

  /** The page is being hidden or closed: send now, with `keepalive` while it is allowed. */
  pageHidden(): void {
    this.exiting = true
    void this.flush()
  }

  pageVisible(): void {
    this.exiting = false
  }

  /** The form appears: it takes part in "flush everything" and resumes a failed state. */
  enter(): void {
    this.left = false
    live.add(this)
    if (this.failure?.kind === 'transient' && this.o.retry !== false && this.changed() && !this.retryTimer && !this.running) {
      this.scheduleRetry(this.failure)
    }
  }

  /** The form goes away: one last try to send, then nothing more is started (the local copy keeps what failed). */
  leave(): void {
    this.left = true
    live.delete(this)
    this.cancelTimers()
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    clearTimeout(this.slowTimer)
    this.slowTimer = undefined
    if (this.changed() && this.failure?.kind !== 'auth') void this.flush()
  }

  private drain(): Promise<boolean> {
    this.running ??= this.loop().finally(() => {
      this.running = null
      this.trackSlow()
      this.notify()
    })
    return this.running
  }

  private async loop(): Promise<boolean> {
    for (;;) {
      if (!this.changed()) return true
      if (!this.o.isSendable(this.value)) return false
      // A refused state is not sent again until the user changes it.
      if (this.failure && this.failure.kind !== 'transient') return false

      const sent = this.value
      const sentVersion = this.version
      const epoch = this.epoch
      this.sending = true
      this.notify()
      try {
        const keepalive = this.exiting && encoder.encode(JSON.stringify(sent)).length <= KEEPALIVE_LIMIT_BYTES
        const result = await this.o.save(sent, { keepalive })
        this.sending = false
        if (epoch !== this.epoch) return true // replaced from outside while the request ran: this answer is of no interest
        this.confirmed = sent
        this.confirmedVersion = sentVersion
        this.failure = null
        const newer = this.version !== sentVersion
        try {
          this.o.onSaved?.(result, { sent, newer })
        } catch {
          // A faulty listener must not stop the loop.
        }
        if (!newer) this.dropCopy(sent)
        this.trackSlow()
        this.notify()
      } catch (error) {
        this.sending = false
        if (epoch !== this.epoch) return true
        const kind = classifyFailure(error)
        const previous = this.failure?.kind === 'transient' ? this.failure.attempts : 0
        this.failure = { kind, error, value: sent, attempts: kind === 'transient' ? previous + 1 : 1 }
        if (kind === 'transient' && !this.left && this.o.retry !== false) this.scheduleRetry(this.failure)
        this.notify()
        return false
      }
    }
  }

  private changed(): boolean {
    return this.version !== this.confirmedVersion
  }

  // ---- timers -------------------------------------------------------------------------------------------------------

  private schedule(): void {
    clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.fire(), this.o.delayMs ?? AUTOSAVE_DELAY_MS)
    this.maxTimer ??= setTimeout(() => this.fire(), this.o.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS)
  }

  private fire(): void {
    this.cancelTimers()
    if (!this.running) void this.drain()
  }

  private cancelTimers(): void {
    clearTimeout(this.debounceTimer)
    clearTimeout(this.maxTimer)
    this.debounceTimer = undefined
    this.maxTimer = undefined
  }

  private scheduleRetry(failure: AutoSaveFailure<T>): void {
    const delays = this.o.retryDelaysMs ?? AUTOSAVE_RETRY_DELAYS_MS
    const own = delays[Math.min(failure.attempts - 1, delays.length - 1)] ?? 30000
    // "Too many requests" says how long to wait; asking earlier only makes it worse.
    const asked = failure.error instanceof ApiError && failure.error.retryAfter !== undefined ? failure.error.retryAfter * 1000 : 0
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      if (!this.running) void this.drain()
    }, Math.max(own, asked))
  }

  /** Starts or stops the "this takes a while" clock: it runs while the state differs from the server's. */
  private trackSlow(): void {
    if (!this.changed()) {
      clearTimeout(this.slowTimer)
      this.slowTimer = undefined
      this.slow = false
    } else if (!this.slow && this.slowTimer === undefined && !this.left) {
      this.slowTimer = setTimeout(() => {
        this.slowTimer = undefined
        this.slow = true
        this.notify()
      }, this.o.slowMs ?? AUTOSAVE_SLOW_MS)
    }
  }

  // ---- local copy ---------------------------------------------------------------------------------------------------

  private writeCopy(): void {
    const draft = this.o.draft
    if (draft) writeDraft(draft.key, { value: this.value, savedAt: Date.now(), base: draft.base() })
  }

  private dropCopy(sent?: T): void {
    const draft = this.o.draft
    if (!draft) return
    if (sent === undefined) removeDraft(draft.key)
    else removeDraftIfSame(draft.key, sent)
  }

  // ---- state for the view -------------------------------------------------------------------------------------------

  private build(): AutoSaveSnapshot<T> {
    const changed = this.changed()
    const sendable = this.o.isSendable(this.value)
    const phase: AutoSavePhase = this.sending ? 'saving' : !changed ? 'clean' : sendable ? 'waiting' : 'blocked'
    return {
      value: this.value,
      phase,
      changed,
      failure: this.failure,
      slow: this.slow,
      unsent: changed && (!sendable || this.failure !== null),
    }
  }

  private notify(): void {
    this.snapshot = this.build()
    for (const listener of this.listeners) listener()
  }
}

/** Sends whatever is waiting in any open form; resolves false when something could not be saved. */
export async function flushAllAutoSaves(): Promise<boolean> {
  const results = await Promise.all([...live].map((engine) => engine.flush()))
  return results.every(Boolean)
}
