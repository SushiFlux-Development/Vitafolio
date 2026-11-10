import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasForeignModal, useLiveHelper } from './useLiveHelper'
import { HINTS_KEY, INTRO_KEY, isIntroDone, isScreenSeen, markIntroDone, resetLiveHelper, restartLiveHelper } from './storage'

function wrapperAt(route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

/** jsdom has no layout: a control needs a size, or no hint is shown for it. */
function control(target: string) {
  const element = document.createElement('div')
  element.setAttribute('data-hint', target)
  element.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 30, width: 100, height: 30, toJSON: () => ({}) })
  document.body.appendChild(element)
  return element
}

/** Lets time pass inside act, including the observer callbacks that wait in the microtask queue. */
async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/** Lets the observers report and React render (a change made outside of act), without moving the clock. */
async function settle() {
  await act(async () => {})
}

/** A browser that has never seen the helper. */
function freshBrowser() {
  localStorage.removeItem(INTRO_KEY)
  localStorage.removeItem(HINTS_KEY)
  resetLiveHelper()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  resetLiveHelper()
})

describe('the introduction at the first start', () => {
  it('opens by itself after a short wait, once', async () => {
    freshBrowser()
    const { result, unmount } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/') })
    expect(result.current.introOpen).toBe(false)
    await wait(1000)
    expect(result.current.introOpen).toBe(true)

    act(() => result.current.finishIntro())
    expect(result.current.introOpen).toBe(false)
    expect(isIntroDone()).toBe(true)
    unmount()

    // The next start, the next page: it does not come back
    const again = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/profile') })
    await wait(3000)
    expect(again.result.current.introOpen).toBe(false)
  })

  it('does not open for a browser that has seen it', async () => {
    freshBrowser()
    markIntroDone()
    const { result } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/') })
    await wait(3000)
    expect(result.current.introOpen).toBe(false)
  })

  it('stays away from pages that are no pages of the app (error pages)', async () => {
    freshBrowser()
    const { result } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/error/503') })
    await wait(3000)
    expect(result.current.introOpen).toBe(false)
  })

  it('waits while a dialog owns the screen and comes when it is gone', async () => {
    freshBrowser()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    expect(hasForeignModal()).toBe(true)

    const { result } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/') })
    await wait(3000)
    expect(result.current.introOpen).toBe(false)

    dialog.remove()
    await settle()
    await wait(1000)
    expect(result.current.introOpen).toBe(true)
  })

  it('does not count its own dialogs as something in the way', () => {
    const own = document.createElement('div')
    own.setAttribute('aria-modal', 'true')
    own.setAttribute('data-live-helper', '')
    document.body.appendChild(own)
    const wrapping = document.createElement('div')
    wrapping.setAttribute('aria-modal', 'true')
    wrapping.innerHTML = '<div data-live-helper></div>'
    document.body.appendChild(wrapping)
    expect(hasForeignModal()).toBe(false)
  })

  it('starts again on request, with everything forgotten', async () => {
    markIntroDone()
    const { result } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/settings') })
    expect(result.current.introOpen).toBe(false)
    act(() => restartLiveHelper())
    expect(result.current.introOpen).toBe(true)
    expect(isIntroDone()).toBe(false)
    act(() => result.current.finishIntro())
    // The screen it was started on does not show its hints right after the introduction
    expect(isScreenSeen('settings')).toBe(true)
  })
})

describe('the hints of a screen', () => {
  it('open by themselves on the first visit, once the controls are on the page, and never again by themselves', async () => {
    freshBrowser()
    markIntroDone()
    control('settings-tabs')
    const first = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/settings') })
    expect(first.result.current.screen).toBe('settings')
    await wait(1500)
    expect(first.result.current.hintsOpen).toBe(true)
    expect(isScreenSeen('settings')).toBe(true)
    act(() => first.result.current.closeHints())
    expect(first.result.current.hintsOpen).toBe(false)
    first.unmount()

    const second = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/settings') })
    await wait(15_000)
    expect(second.result.current.hintsOpen).toBe(false)
  })

  it('wait for the introduction, which comes first', async () => {
    freshBrowser()
    control('settings-tabs')
    const { result } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/settings') })
    await wait(1000)
    expect(result.current.introOpen).toBe(true)
    expect(result.current.hintsOpen).toBe(false)
    await wait(5000)
    expect(result.current.hintsOpen).toBe(false)
  })

  it('wait while a dialog owns the screen', async () => {
    freshBrowser()
    markIntroDone()
    control('settings-tabs')
    const dialog = document.createElement('div')
    dialog.setAttribute('aria-modal', 'true')
    document.body.appendChild(dialog)
    const { result } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/settings') })
    await wait(5000)
    expect(result.current.hintsOpen).toBe(false)
    dialog.remove()
    await settle()
    await wait(2000)
    expect(result.current.hintsOpen).toBe(true)
  })

  it('do not start when the page has none of the controls (it is still loading, or the page lacks them)', async () => {
    freshBrowser()
    markIntroDone()
    const { result } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/settings') })
    await wait(15_000)
    expect(result.current.hintsOpen).toBe(false)
    expect(isScreenSeen('settings')).toBe(false)
  })

  it('come back through "?" on a screen that was seen', async () => {
    markIntroDone()
    localStorage.setItem(HINTS_KEY, JSON.stringify({ settings: true }))
    control('settings-tabs')
    const { result } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/settings') })
    await wait(3000)
    expect(result.current.hintsOpen).toBe(false)
    act(() => result.current.help())
    expect(result.current.hintsOpen).toBe(true)
    expect(result.current.introOpen).toBe(false)
  })

  it('"?" starts the introduction on a screen without hints, or whose controls are all missing', async () => {
    markIntroDone()
    const guide = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/guide?view=wizard') })
    act(() => guide.result.current.help())
    expect(guide.result.current.introOpen).toBe(true)
    guide.unmount()

    const empty = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/applications') })
    act(() => empty.result.current.help())
    expect(empty.result.current.introOpen).toBe(true)
  })

  it('belong to the screen they were opened on', async () => {
    markIntroDone()
    control('settings-tabs')
    const { result } = renderHook(() => useLiveHelper(), { wrapper: wrapperAt('/settings') })
    act(() => result.current.help())
    expect(result.current.hintsOpen).toBe(true)
    act(() => result.current.startIntro())
    expect(result.current.hintsOpen).toBe(false)
    expect(result.current.introOpen).toBe(true)
  })
})
