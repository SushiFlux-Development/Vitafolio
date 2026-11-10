import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbort } from '../api/client'

export interface PdfPreviewState {
  /** An object URL of the newest rendered PDF, or null while there is none yet. */
  url: string | null
  /** A render is under way (the previous PDF, if any, stays visible meanwhile). */
  loading: boolean
  /** Why the newest render failed (the real error, for ErrorNotice), or null. */
  error: unknown
  /** Renders again with the current inputs (the "refresh" and "try again" buttons). */
  refresh: () => void
}

interface Options {
  /** Fetches the PDF. Needs to be stable (useCallback) over exactly the inputs that change the picture. */
  load: (signal: AbortSignal) => Promise<Blob>
  /** False = nothing is requested (a closed dialog, a hidden tab). */
  enabled?: boolean
  /** Waits this long after the last change of `load` before asking the server (typing, colour clicks). */
  debounceMs?: number
  /** Identifies WHAT is shown (which letter, which application): when it changes, the old picture is dropped at once instead of staying as a placeholder. */
  resetKey?: string
}

interface State {
  url: string | null
  loading: boolean
  error: unknown
}

const EMPTY: State = { url: null, loading: false, error: null }

/**
 * The PDF behind a preview. Every change of the inputs aborts the render that is still running (so a slow answer can never
 * overwrite a newer one), the previous picture stays on screen until the new one is ready, the object URL of a replaced or
 * abandoned PDF is released, and a failure keeps the real error for the caller to show in full.
 */
export function usePdfPreview({ load, enabled = true, debounceMs = 0, resetKey = '' }: Options): PdfPreviewState {
  const [state, setState] = useState<State>(EMPTY)
  const [seenKey, setSeenKey] = useState(resetKey)
  const [tick, setTick] = useState(0)
  const currentUrl = useRef<string | null>(null)
  const urlKey = useRef(resetKey)

  // Another document than before: nothing of the old one may show while the new one renders.
  let view = state
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setState(EMPTY)
    view = EMPTY
  }

  useEffect(() => {
    if (urlKey.current !== resetKey) {
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current)
      currentUrl.current = null
      urlKey.current = resetKey
    }
    if (!enabled) return
    const controller = new AbortController()
    const timer = setTimeout(
      () => {
        setState((previous) => ({ ...previous, loading: true, error: null }))
        load(controller.signal)
          .then((blob) => {
            if (controller.signal.aborted) return
            const url = URL.createObjectURL(blob)
            if (currentUrl.current) URL.revokeObjectURL(currentUrl.current)
            currentUrl.current = url
            setState({ url, loading: false, error: null })
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted || isAbort(error)) return
            setState((previous) => ({ ...previous, loading: false, error }))
          })
      },
      Math.max(0, debounceMs),
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [load, enabled, debounceMs, resetKey, tick])

  // Whatever is left when the preview goes away is released with it.
  useEffect(
    () => () => {
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current)
      currentUrl.current = null
    },
    [],
  )

  const refresh = useCallback(() => setTick((value) => value + 1), [])
  return { ...view, refresh }
}
