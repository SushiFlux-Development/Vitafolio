import { useLayoutEffect, useRef } from 'react'

/** True when the options of a bar need more room than one row of the bar has (each at its full, unwrapped length). */
export function overflowsRow(bar: HTMLElement): boolean {
  let needed = 0
  for (const child of Array.from(bar.children)) needed += (child as HTMLElement).offsetWidth
  return needed > bar.clientWidth + 1
}

/**
 * Keeps a choice bar (.choice-bar: tabs, segmented control) in one row while its options fit at full length, and turns it into a
 * connected vertical list (data-stack="true") when they do not - never cut, hidden or scrolled sideways. It decides again
 * whenever the bar, the room around it or the options change, and once the web fonts are loaded.
 *
 * The check takes the row away for a moment, measures and sets the result again in the same frame, so nothing is painted in
 * between and nothing flickers. `signature` is anything that changes with the labels (their texts joined).
 */
export function useFitInRow<T extends HTMLElement>(signature: string) {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar) return
    const fit = () => {
      if (!bar.isConnected) return
      bar.removeAttribute('data-stack')
      if (overflowsRow(bar)) bar.setAttribute('data-stack', 'true')
    }
    fit()
    if (typeof ResizeObserver === 'undefined') return
    // Later checks wait for the next frame: changing the bar inside the observer's own callback would make it report a loop.
    let frame = 0
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    }
    // The bar itself (its own width) and the room it lives in (an inline bar that is a list does not grow by itself).
    const observer = new ResizeObserver(later)
    observer.observe(bar)
    if (bar.parentElement) observer.observe(bar.parentElement)
    void document.fonts?.ready.then(later)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [signature])

  return ref
}
