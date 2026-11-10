import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { AUTOSAVE_DELAY_MS, AUTOSAVE_MAX_WAIT_MS, AUTOSAVE_RETRY_DELAYS_MS, AUTOSAVE_SLOW_MS, autoSaveView, flushAllAutoSaves, useAutoSave } from './useAutoSave'
import type { UseAutoSaveOptions } from './useAutoSave'
import { draftKey, readDraft } from './draftStore'

interface Form {
  name: string
}

const KEY = draftKey('acc-1', 'test')
const accept = (raw: unknown): Form | null => (raw && typeof raw === 'object' && typeof (raw as Form).name === 'string' ? (raw as Form) : null)

type Save = (value: Form, context: { keepalive: boolean }) => Promise<Form>

function setup(overrides: Partial<UseAutoSaveOptions<Form, Form>> = {}) {
  const save = overrides.save ? (overrides.save as ReturnType<typeof vi.fn<Save>>) : vi.fn<Save>(async (value) => value)
  const onSaved = vi.fn()
  const hook = renderHook(() =>
    useAutoSave<Form, Form>({
      initial: { name: '' },
      isSendable: () => true,
      onSaved,
      draft: { accountId: 'acc-1', form: 'test', base: () => 'base-1' },
      ...overrides,
      save,
    }),
  )
  return { ...hook, save, onSaved }
}

const type = (hook: ReturnType<typeof setup>, name: string) => act(() => hook.result.current.setValue({ name }))
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
const serverError = () => new ApiError(500, { status: 500, code: 'internal', detail: 'Datenbank gesperrt' })

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // The page counts as visible in every test unless it says otherwise.
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('timing', () => {
    it('sends 400 ms after the last keystroke, not before', async () => {
      const hook = setup()
      type(hook, 'M')
      await advance(AUTOSAVE_DELAY_MS - 1)
      expect(hook.save).not.toHaveBeenCalled()
      await advance(1)
      expect(hook.save).toHaveBeenCalledTimes(1)
      expect(hook.save).toHaveBeenCalledWith({ name: 'M' }, { keepalive: false })
    })

    it('restarts the quiet period with every keystroke and sends once with the newest value', async () => {
      const hook = setup()
      for (const name of ['M', 'Ma', 'Max']) {
        type(hook, name)
        await advance(300)
      }
      expect(hook.save).not.toHaveBeenCalled()
      await advance(100)
      expect(hook.save).toHaveBeenCalledTimes(1)
      expect(hook.save.mock.calls[0]![0]).toEqual({ name: 'Max' })
    })

    it('sends at the latest 2 s after the first keystroke of uninterrupted typing', async () => {
      const hook = setup()
      for (let index = 1; index <= 8; index += 1) {
        type(hook, 'x'.repeat(index))
        await advance(300)
      }
      // Typing went on for 2.4 s without a pause of 400 ms: the request went out at 2 s with the value of that moment.
      expect(hook.save).toHaveBeenCalledTimes(1)
      expect(hook.save.mock.calls[0]![0]).toEqual({ name: 'xxxxxxx' })
      expect(AUTOSAVE_MAX_WAIT_MS).toBe(2000)
    })

    it('sets the same values again without a request (a field normalising its own text)', async () => {
      const hook = setup()
      type(hook, '')
      await advance(5000)
      expect(hook.save).not.toHaveBeenCalled()
    })
  })

  describe('one request at a time, in order', () => {
    it('sends the newest state after a running request and never two at once', async () => {
      const resolvers: Array<(value: Form) => void> = []
      const save = vi.fn<Save>(() => new Promise((resolve) => resolvers.push(resolve)))
      const hook = setup({ save })

      type(hook, 'A')
      await advance(AUTOSAVE_DELAY_MS)
      expect(resolvers).toHaveLength(1)

      type(hook, 'AB')
      await advance(AUTOSAVE_DELAY_MS)
      type(hook, 'ABC')
      await advance(AUTOSAVE_DELAY_MS)
      expect(resolvers).toHaveLength(1) // still the first one only

      await act(async () => resolvers[0]!({ name: 'A' }))
      await advance(0)
      expect(resolvers).toHaveLength(2)
      expect(save.mock.calls[1]![0]).toEqual({ name: 'ABC' }) // the newest, not the one in between

      await act(async () => resolvers[1]!({ name: 'ABC' }))
      await advance(0)
      expect(hook.result.current.state.changed).toBe(false)
    })

    it('says with every answer whether it is already outdated', async () => {
      const resolvers: Array<(value: Form) => void> = []
      const save = vi.fn<Save>(() => new Promise((resolve) => resolvers.push(resolve)))
      const hook = setup({ save })
      type(hook, 'A')
      await advance(AUTOSAVE_DELAY_MS)
      type(hook, 'AB')

      await act(async () => resolvers[0]!({ name: 'A' }))
      await advance(0)
      expect(hook.onSaved).toHaveBeenLastCalledWith({ name: 'A' }, { sent: { name: 'A' }, newer: true })

      await act(async () => resolvers[1]!({ name: 'AB' }))
      await advance(0)
      expect(hook.onSaved).toHaveBeenLastCalledWith({ name: 'AB' }, { sent: { name: 'AB' }, newer: false })
    })

    it('keeps the blank at the end: the answer of the server (trimmed) never replaces what is on the screen', async () => {
      const hook = setup({ save: vi.fn<Save>(async (value) => ({ name: value.name.trim() })) })
      type(hook, 'Max ')
      await advance(AUTOSAVE_DELAY_MS)
      await advance(0)
      expect(hook.onSaved).toHaveBeenCalledWith({ name: 'Max' }, { sent: { name: 'Max ' }, newer: false })
      expect(hook.result.current.value).toEqual({ name: 'Max ' })
      // Not changed relative to what was sent, although the answer differs from it
      expect(hook.result.current.state.changed).toBe(false)

      type(hook, 'Max B')
      expect(hook.result.current.value).toEqual({ name: 'Max B' })
    })
  })

  describe('leaving', () => {
    it('sends at once when the form goes away', async () => {
      const hook = setup()
      type(hook, 'Max')
      hook.unmount()
      await advance(0)
      expect(hook.save).toHaveBeenCalledTimes(1)
      expect(hook.save.mock.calls[0]![0]).toEqual({ name: 'Max' })
    })

    it('sends at once, with keepalive, when the page is hidden', async () => {
      const hook = setup()
      type(hook, 'Max')
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      act(() => void document.dispatchEvent(new Event('visibilitychange')))
      await advance(0)
      expect(hook.save).toHaveBeenCalledWith({ name: 'Max' }, { keepalive: true })
    })

    it('sends at once, with keepalive, on pagehide', async () => {
      const hook = setup()
      type(hook, 'Max')
      act(() => void window.dispatchEvent(new Event('pagehide')))
      await advance(0)
      expect(hook.save).toHaveBeenCalledWith({ name: 'Max' }, { keepalive: true })
    })

    it('does not use keepalive for a body beyond its 64 KB limit; the local copy covers that case', async () => {
      const hook = setup({ save: vi.fn<Save>(() => Promise.reject(serverError())) })
      type(hook, 'ä'.repeat(40_000)) // 80,000 bytes in UTF-8
      act(() => void window.dispatchEvent(new Event('pagehide')))
      await advance(0)
      expect(hook.save).toHaveBeenCalledWith(expect.anything(), { keepalive: false })
      expect(readDraft(KEY, accept)?.value.name).toHaveLength(40_000)
    })

    it('sends what is waiting in every open form before a sign-out', async () => {
      const hook = setup()
      type(hook, 'Max')
      await act(async () => {
        expect(await flushAllAutoSaves()).toBe(true)
      })
      expect(hook.save).toHaveBeenCalledTimes(1)
    })

    it('resolves flush() with false when the input cannot be saved', async () => {
      const hook = setup({ save: vi.fn<Save>(() => Promise.reject(serverError())) })
      type(hook, 'Max')
      let result: boolean | undefined
      await act(async () => {
        result = await hook.result.current.flush()
      })
      expect(result).toBe(false)
    })
  })

  describe('the local copy', () => {
    it('is written on every keystroke, before any request', () => {
      const hook = setup()
      type(hook, 'M')
      expect(readDraft(KEY, accept)).toMatchObject({ value: { name: 'M' }, base: 'base-1' })
      type(hook, 'Ma')
      expect(readDraft(KEY, accept)?.value).toEqual({ name: 'Ma' })
      expect(readDraft(KEY, accept)?.savedAt).toBeGreaterThan(0)
      expect(hook.save).not.toHaveBeenCalled()
    })

    it('is written even for a value that is not sendable, and that value is never sent', async () => {
      const hook = setup({ isSendable: (value) => value.name.length >= 3 })
      type(hook, 'Ma')
      await advance(10_000)
      expect(hook.save).not.toHaveBeenCalled()
      expect(readDraft(KEY, accept)?.value).toEqual({ name: 'Ma' })
      expect(hook.result.current.state.phase).toBe('blocked')
      expect(hook.result.current.state.unsent).toBe(true)
      expect(autoSaveView(hook.result.current.state)).toBe('blocked')

      type(hook, 'May')
      await advance(AUTOSAVE_DELAY_MS)
      expect(hook.save).toHaveBeenCalledWith({ name: 'May' }, { keepalive: false })
    })

    it('is removed when the server confirmed exactly this state', async () => {
      const hook = setup()
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      await advance(0)
      expect(readDraft(KEY, accept)).toBeNull()
    })

    it('stays while a newer state exists than the one that was confirmed', async () => {
      const resolvers: Array<(value: Form) => void> = []
      const hook = setup({ save: vi.fn<Save>(() => new Promise((resolve) => resolvers.push(resolve))) })
      type(hook, 'A')
      await advance(AUTOSAVE_DELAY_MS)
      type(hook, 'AB')
      await act(async () => resolvers[0]!({ name: 'A' }))
      expect(readDraft(KEY, accept)?.value).toEqual({ name: 'AB' })
    })

    it('stays after a failed save', async () => {
      const hook = setup({ save: vi.fn<Save>(() => Promise.reject(serverError())) })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      expect(readDraft(KEY, accept)?.value).toEqual({ name: 'Max' })
    })

    it('is removed by discard()', async () => {
      const hook = setup({ save: vi.fn<Save>(() => Promise.reject(serverError())) })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      act(() => hook.result.current.discard())
      expect(readDraft(KEY, accept)).toBeNull()
      expect(hook.result.current.value).toEqual({ name: '' })
    })

    it('is not written without an account (isolated pages)', () => {
      const hook = setup({ draft: { accountId: undefined, form: 'test', base: () => 'b' } })
      type(hook, 'Max')
      expect(localStorage.length).toBe(0)
    })

    it('does not stop the form when the storage throws', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError')
      })
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError')
      })
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError')
      })
      const hook = setup()
      type(hook, 'Max')
      expect(hook.result.current.value).toEqual({ name: 'Max' })
      await advance(AUTOSAVE_DELAY_MS)
      await advance(0)
      expect(hook.save).toHaveBeenCalledWith({ name: 'Max' }, { keepalive: false })
      expect(hook.result.current.state.changed).toBe(false)
    })
  })

  describe('failures', () => {
    it('retries after 2 s, 5 s, 15 s, then every 30 s, and keeps the input meanwhile', async () => {
      const hook = setup({ save: vi.fn<Save>(() => Promise.reject(serverError())) })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      expect(hook.save).toHaveBeenCalledTimes(1)
      expect(autoSaveView(hook.result.current.state)).toBe('retrying')
      expect(hook.result.current.value).toEqual({ name: 'Max' })

      let calls = 1
      for (const wait of [...AUTOSAVE_RETRY_DELAYS_MS, 30_000]) {
        await advance(wait - 1)
        expect(hook.save).toHaveBeenCalledTimes(calls)
        await advance(1)
        calls += 1
        expect(hook.save).toHaveBeenCalledTimes(calls)
      }
      expect(AUTOSAVE_RETRY_DELAYS_MS).toEqual([2000, 5000, 15000, 30000])
    })

    it('gets through as soon as the server answers again, and the failure is gone', async () => {
      const save = vi.fn<Save>().mockRejectedValueOnce(serverError()).mockImplementation(async (value) => value)
      const hook = setup({ save })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      expect(hook.result.current.state.failure?.kind).toBe('transient')
      await advance(2000)
      expect(hook.result.current.state.failure).toBeNull()
      expect(hook.result.current.state.changed).toBe(false)
      expect(readDraft(KEY, accept)).toBeNull()
      await advance(60_000)
      expect(save).toHaveBeenCalledTimes(2)
    })

    it('retries at once when the connection returns', async () => {
      const save = vi.fn<Save>().mockRejectedValueOnce(new ApiError(0, { code: 'network' })).mockImplementation(async (value) => value)
      const hook = setup({ save })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      expect(save).toHaveBeenCalledTimes(1)
      act(() => void window.dispatchEvent(new Event('online')))
      await advance(0)
      expect(save).toHaveBeenCalledTimes(2)
      expect(hook.result.current.state.changed).toBe(false)
    })

    it('tries again with the next change instead of waiting for the long retry time', async () => {
      const save = vi.fn<Save>().mockRejectedValue(serverError())
      const hook = setup({ save })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      await advance(2000) // second try fails, the next one would be in 5 s
      expect(save).toHaveBeenCalledTimes(2)
      type(hook, 'Max B')
      await advance(AUTOSAVE_DELAY_MS)
      expect(save).toHaveBeenCalledTimes(3)
      expect(save.mock.calls[2]![0]).toEqual({ name: 'Max B' })
    })

    it('waits as long as the server asks when there are too many requests', async () => {
      const limited = new ApiError(429, { status: 429, code: 'rate_limited' }, 20)
      const save = vi.fn<Save>().mockRejectedValueOnce(limited).mockImplementation(async (value) => value)
      const hook = setup({ save })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      await advance(19_000)
      expect(save).toHaveBeenCalledTimes(1)
      await advance(1000)
      expect(save).toHaveBeenCalledTimes(2)
    })

    it('does not repeat a state the server refused (400), shows the field answers, and sends again after a change', async () => {
      const refused = new ApiError(400, { status: 400, code: 'validation.failed', errors: { firstName: [{ code: 'validation.required' }] } })
      const save = vi.fn<Save>().mockRejectedValueOnce(refused).mockImplementation(async (value) => value)
      const hook = setup({ save })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      await advance(120_000)
      expect(save).toHaveBeenCalledTimes(1)
      expect(autoSaveView(hook.result.current.state)).toBe('rejected')
      expect((hook.result.current.state.failure?.error as ApiError).fieldErrors.firstName).toBeDefined()
      expect(hook.result.current.state.failure?.value).toEqual({ name: 'Max' })
      expect(readDraft(KEY, accept)?.value).toEqual({ name: 'Max' })

      type(hook, 'Max B')
      expect(hook.result.current.state.failure).toBeNull() // the answer belonged to the old value
      await advance(AUTOSAVE_DELAY_MS)
      expect(save).toHaveBeenCalledTimes(2)
    })

    it('does not loop after an expired session (401) and keeps the local copy for the next sign-in', async () => {
      const expired = new ApiError(401, { status: 401, code: 'auth.invalid' })
      const save = vi.fn<Save>().mockRejectedValue(expired)
      const hook = setup({ save })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      await advance(10 * 60_000)
      expect(save).toHaveBeenCalledTimes(1)
      expect(autoSaveView(hook.result.current.state)).toBe('signedOut')
      expect(readDraft(KEY, accept)?.value).toEqual({ name: 'Max' })
      // Leaving does not try again either
      hook.unmount()
      await advance(0)
      expect(save).toHaveBeenCalledTimes(1)
      expect(readDraft(KEY, accept)?.value).toEqual({ name: 'Max' })
    })

    it('does not try again on its own when the caller turned retrying off, but sends with the next change', async () => {
      const save = vi.fn<Save>().mockRejectedValueOnce(serverError()).mockImplementation(async (value) => value)
      const hook = setup({ save, retry: false })
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      await advance(120_000)
      expect(save).toHaveBeenCalledTimes(1)
      type(hook, 'Max B')
      await advance(AUTOSAVE_DELAY_MS)
      expect(save).toHaveBeenCalledTimes(2)
    })

    it('stops retrying after the form is gone, but the copy stays', async () => {
      const save = vi.fn<Save>().mockRejectedValue(serverError())
      const hook = setup({ save })
      type(hook, 'Max')
      hook.unmount()
      await advance(0)
      expect(save).toHaveBeenCalledTimes(1)
      await advance(5 * 60_000)
      expect(save).toHaveBeenCalledTimes(1)
      expect(readDraft(KEY, accept)?.value).toEqual({ name: 'Max' })
    })
  })

  describe('the status', () => {
    it('stays quiet while a save is quick and says "saving" only after about a second', async () => {
      let resolve: (value: Form) => void = () => undefined
      const save = vi.fn<Save>(() => new Promise((done) => (resolve = done)))
      const hook = setup({ save })
      expect(autoSaveView(hook.result.current.state)).toBe('saved')
      type(hook, 'Max')
      await advance(AUTOSAVE_DELAY_MS)
      expect(autoSaveView(hook.result.current.state)).toBe('saved') // 400 ms: no flicker
      await advance(AUTOSAVE_SLOW_MS - AUTOSAVE_DELAY_MS)
      expect(autoSaveView(hook.result.current.state)).toBe('saving')
      await act(async () => resolve({ name: 'Max' }))
      await advance(0)
      expect(autoSaveView(hook.result.current.state)).toBe('saved')
    })

    it('never shows "saving" for a save that finishes in time', async () => {
      const hook = setup()
      const seen = new Set<string>()
      for (let round = 0; round < 5; round += 1) {
        type(hook, `Max ${round}`)
        await advance(AUTOSAVE_DELAY_MS)
        await advance(300)
        seen.add(autoSaveView(hook.result.current.state))
      }
      expect([...seen]).toEqual(['saved'])
    })
  })
})
