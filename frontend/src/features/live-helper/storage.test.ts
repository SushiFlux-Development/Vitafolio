import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_SCREENS, HINTS_KEY, INTRO_KEY, isIntroDone, isScreenSeen, markIntroDone, markScreenSeen, RESTART_EVENT, resetLiveHelper, restartLiveHelper } from './storage'

beforeEach(() => {
  resetLiveHelper()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what the live helper remembers', () => {
  it('starts with nothing seen', () => {
    localStorage.clear()
    expect(isIntroDone()).toBe(false)
    expect(isScreenSeen('profile')).toBe(false)
  })

  it('remembers the introduction and each screen on its own, in the browser', () => {
    markIntroDone()
    markScreenSeen('profile')
    expect(localStorage.getItem(INTRO_KEY)).toBe('1')
    expect(JSON.parse(localStorage.getItem(HINTS_KEY)!)).toEqual({ profile: true })
    markScreenSeen('preview')
    expect(JSON.parse(localStorage.getItem(HINTS_KEY)!)).toEqual({ profile: true, preview: true })
    expect(isScreenSeen('profile')).toBe(true)
    expect(isScreenSeen('applications')).toBe(false)
  })

  it('knows a browser that has every screen seen', () => {
    localStorage.setItem(HINTS_KEY, JSON.stringify({ [ALL_SCREENS]: true }))
    expect(isScreenSeen('profile')).toBe(true)
    expect(isScreenSeen('a screen that comes later')).toBe(true)
  })

  it('names its keys without the product name', () => {
    expect(INTRO_KEY).toMatch(/^cv\./)
    expect(HINTS_KEY).toMatch(/^cv\./)
  })

  it('copes with a damaged value in the storage', () => {
    localStorage.setItem(HINTS_KEY, '{not json')
    expect(isScreenSeen('profile')).toBe(false)
    localStorage.setItem(HINTS_KEY, '[1,2]')
    expect(isScreenSeen('profile')).toBe(false)
    markScreenSeen('profile')
    expect(isScreenSeen('profile')).toBe(true)
  })

  it('falls back to memory when the browser refuses the storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(isIntroDone()).toBe(false)
    markIntroDone()
    markScreenSeen('settings')
    // Nothing is thrown, and for the rest of the page load it stays quiet
    expect(isIntroDone()).toBe(true)
    expect(isScreenSeen('settings')).toBe(true)
    expect(isScreenSeen('profile')).toBe(false)
    expect(() => resetLiveHelper()).not.toThrow()
    expect(isIntroDone()).toBe(false)
    expect(isScreenSeen('settings')).toBe(false)
  })

  it('forgets everything on a reset, and a restart also tells the helper to open the introduction', () => {
    markIntroDone()
    markScreenSeen('profile')
    const heard = vi.fn()
    window.addEventListener(RESTART_EVENT, heard)
    restartLiveHelper()
    window.removeEventListener(RESTART_EVENT, heard)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(isIntroDone()).toBe(false)
    expect(isScreenSeen('profile')).toBe(false)
    expect(localStorage.getItem(INTRO_KEY)).toBeNull()
    expect(localStorage.getItem(HINTS_KEY)).toBeNull()
  })
})
