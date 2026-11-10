/**
 * What the live helper remembers per browser (or per app window): whether the introduction was seen and which screens showed
 * their hints. Every access is guarded - storage can be blocked, full or switched off - and an in-memory copy takes over, so the
 * helper then shows itself once per page load instead of on every screen change.
 */

/** "1" once the introduction was finished or skipped. */
export const INTRO_KEY = 'cv.helper.intro'
/** JSON object: screen name -> true, for every screen whose hints were shown. */
export const HINTS_KEY = 'cv.helper.hints'
/** In that object, this name stands for every screen at once (a browser that has everything seen, such as a scripted test run). */
export const ALL_SCREENS = '*'

/** Fired by {@link restartLiveHelper}: the helper opens the introduction again. */
export const RESTART_EVENT = 'cv-helper-restart'

let introDoneInMemory = false
const screensSeenInMemory = new Set<string>()

export function isIntroDone(): boolean {
  if (introDoneInMemory) return true
  try {
    return localStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroDone(): void {
  introDoneInMemory = true
  try {
    localStorage.setItem(INTRO_KEY, '1')
  } catch {
    // Storage refused: the in-memory flag keeps the introduction quiet until the page is reloaded.
  }
}

function readSeen(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(HINTS_KEY) ?? '{}')
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

export function isScreenSeen(screen: string): boolean {
  const seen = readSeen()
  return screensSeenInMemory.has(screen) || screensSeenInMemory.has(ALL_SCREENS) || seen[screen] === true || seen[ALL_SCREENS] === true
}

export function markScreenSeen(screen: string): void {
  screensSeenInMemory.add(screen)
  try {
    localStorage.setItem(HINTS_KEY, JSON.stringify({ ...readSeen(), [screen]: true }))
  } catch {
    // Storage refused: the in-memory flag above keeps this screen quiet until the page is reloaded.
  }
}

/** For this page load only, and without touching the storage: the introduction and every screen count as seen (unit tests). */
export function assumeEverythingSeen(): void {
  introDoneInMemory = true
  screensSeenInMemory.add(ALL_SCREENS)
}

/** Forgets that anything was seen (introduction and the hints of every screen). */
export function resetLiveHelper(): void {
  introDoneInMemory = false
  screensSeenInMemory.clear()
  try {
    localStorage.removeItem(INTRO_KEY)
    localStorage.removeItem(HINTS_KEY)
  } catch {
    // Storage refused: nothing was stored.
  }
}

/** The "start again" button of the settings: forget everything and open the introduction right away. */
export function restartLiveHelper(): void {
  resetLiveHelper()
  window.dispatchEvent(new Event(RESTART_EVENT))
}
