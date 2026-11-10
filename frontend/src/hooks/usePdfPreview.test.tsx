import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePdfPreview } from './usePdfPreview'

const pdf = (text: string) => new Blob([text], { type: 'application/pdf' })

type Load = (signal: AbortSignal) => Promise<Blob>

/** One stable function per key, like the useCallback a real caller has: a new identity is what triggers a new render. */
function stable(make: (key: string) => Load): (key: string) => Load {
  const cache = new Map<string, Load>()
  return (key) => {
    if (!cache.has(key)) cache.set(key, make(key))
    return cache.get(key)!
  }
}

beforeEach(() => {
  let counter = 0
  global.URL.createObjectURL = vi.fn(() => `blob:mock/${++counter}`)
  global.URL.revokeObjectURL = vi.fn()
})

describe('usePdfPreview', () => {
  it('renders once, keeps the object URL and releases it on unmount', async () => {
    const load = vi.fn(() => Promise.resolve(pdf('a')))
    const { result, unmount } = renderHook(() => usePdfPreview({ load }))

    await waitFor(() => expect(result.current.url).toBe('blob:mock/1'))
    expect(load).toHaveBeenCalledTimes(1)
    expect(result.current.loading).toBe(false)

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock/1')
  })

  it('aborts the running render when the inputs change, and a slow old answer never replaces the new one', async () => {
    const answers: Array<() => void> = []
    const signals: AbortSignal[] = []
    const loadFor = stable(
      (label) => (signal) =>
        new Promise<Blob>((resolve) => {
          signals.push(signal)
          answers.push(() => resolve(pdf(label)))
        }),
    )

    const { result, rerender } = renderHook(({ label }) => usePdfPreview({ load: loadFor(label) }), { initialProps: { label: 'old' } })
    await waitFor(() => expect(signals).toHaveLength(1))
    rerender({ label: 'new' })
    await waitFor(() => expect(signals).toHaveLength(2))
    expect(signals[0]!.aborted).toBe(true)

    // The old request answers late: its result must be dropped.
    await act(async () => {
      answers[0]!()
      await Promise.resolve()
    })
    expect(result.current.url).toBeNull()

    await act(async () => {
      answers[1]!()
    })
    await waitFor(() => expect(result.current.url).toBe('blob:mock/1'))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous picture while the next one renders, and releases it after the swap', async () => {
    const loadFor = stable((id) => () => Promise.resolve(pdf(id)))
    const { result, rerender } = renderHook(({ id }) => usePdfPreview({ load: loadFor(id) }), { initialProps: { id: 'a' } })

    await waitFor(() => expect(result.current.url).toBe('blob:mock/1'))
    rerender({ id: 'b' })
    await waitFor(() => expect(result.current.url).toBe('blob:mock/2'))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock/1')
  })

  it('keeps the real error and tries again on refresh', async () => {
    const failure = new Error('Typst: Zeile 3')
    const load = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(pdf('ok'))
    const { result } = renderHook(() => usePdfPreview({ load }))

    await waitFor(() => expect(result.current.error).toBe(failure))
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.url).toBe('blob:mock/1'))
    expect(result.current.error).toBeNull()
  })

  it('does not report a cancelled request as an error', async () => {
    const load = vi.fn((signal: AbortSignal) => new Promise<Blob>((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))
    const { result, unmount } = renderHook(() => usePdfPreview({ load }))
    await waitFor(() => expect(load).toHaveBeenCalled())
    unmount()
    expect(result.current.error).toBeNull()
  })

  it('drops the picture of the old document when another document is chosen (resetKey)', async () => {
    const loadFor = stable((key) => () => (key === 'first' ? Promise.resolve(pdf('first')) : new Promise<Blob>(() => undefined)))
    const { result, rerender } = renderHook(({ key }) => usePdfPreview({ load: loadFor(key), resetKey: key }), { initialProps: { key: 'first' } })

    await waitFor(() => expect(result.current.url).toBe('blob:mock/1'))
    // 'second' never answers: the picture of 'first' must not stand in for it.
    rerender({ key: 'second' })
    expect(result.current.url).toBeNull()
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock/1'))
  })

  it('asks nothing while disabled', async () => {
    const load = vi.fn(() => Promise.resolve(pdf('x')))
    const { result } = renderHook(() => usePdfPreview({ load, enabled: false }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(load).not.toHaveBeenCalled()
    expect(result.current.url).toBeNull()
  })
})
