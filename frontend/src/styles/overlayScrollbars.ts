/**
 * Overlay scrollbars. The native scrollbar is hidden everywhere (index.css), so it never takes layout room: the page and every
 * inner scroll area always use their full width. This module draws a slim thumb on top instead.
 *
 * - A thumb exists only where something can really be scrolled (overflow auto/scroll and content larger than the box).
 * - It shows while scrolling and while the pointer is near the right (or bottom) edge of the area, and fades out by itself
 *   HIDE_DELAY after the last scroll or after the pointer left. While it is dragged or the pointer is on it, it stays.
 * - It can be dragged. Wheel, keyboard and touch scrolling stay native and untouched.
 * - The thumbs live in one fixed layer at the end of <body>, so no scroll container and no React node is touched.
 * - Colours come from the theme tokens (index.css, .os-thumb): at least 3:1 in both themes; reduced motion turns the fading off.
 */

type Axis = 'y' | 'x'

const HIDE_DELAY = 1500 // ms after the last scroll or after the pointer left the edge
const EDGE_ZONE = 24 // px from the edge of an area in which the pointer reveals the thumb
const HIT = 16 // px, size of the grab area across the thumb (the visible bar is slimmer, see index.css)
const MIN_THUMB = 36 // px, shortest thumb
const PAD = 4 // px, gap between the thumb ends and the corners of the area

interface Entry {
  el: Element
  thumbs: Partial<Record<Axis, Thumb>>
}

interface Thumb {
  axis: Axis
  entry: Entry
  node: HTMLDivElement | null
  timer: number
  visible: boolean
  /** The pointer is in the edge zone of the area. */
  near: boolean
  /** The pointer is on the thumb itself. */
  over: boolean
  dragging: boolean
  // Geometry of the last update, used while dragging.
  trackLen: number
  thumbLen: number
  range: number
}

/** Installs the thumbs for the whole document; returns the function that removes them again (hot reload). */
export function installOverlayScrollbars(): () => void {
  if (typeof document === 'undefined') return () => undefined

  const doc = document.documentElement
  const entries = new WeakMap<Element, Entry>()
  const shown = new Set<Thumb>()
  let layer: HTMLDivElement | null = null
  let nearThumb: Thumb | null = null
  let frame = 0
  let lastMove: PointerEvent | null = null

  const pageScroller = () => (document.scrollingElement ?? doc) as Element
  const isPage = (el: Element) => el === pageScroller()

  function getLayer(): HTMLDivElement {
    if (!layer) {
      layer = document.createElement('div')
      layer.className = 'os-layer'
      layer.setAttribute('aria-hidden', 'true')
      document.body.appendChild(layer)
    }
    return layer
  }

  /** The element whose own scrollbar this is: html and body both stand for the page. */
  function scrollerOf(target: EventTarget | null): Element | null {
    if (target === document || target === doc || target === document.body) return pageScroller()
    return target instanceof Element ? target : null
  }

  function overflowOf(el: Element, axis: Axis): string {
    const prop = axis === 'y' ? 'overflowY' : 'overflowX'
    if (isPage(el)) {
      // The page takes its overflow from html, or from body when html leaves it at "visible".
      let value = getComputedStyle(doc)[prop]
      if (value === 'visible') value = getComputedStyle(document.body)[prop]
      return value === 'visible' ? 'auto' : value
    }
    return getComputedStyle(el)[prop]
  }

  /** True when the area can really be scrolled along this axis by the user. */
  function scrolls(el: Element, axis: Axis): boolean {
    const range = axis === 'y' ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth
    if (range <= 1) return false
    const value = overflowOf(el, axis)
    return value === 'auto' || value === 'scroll' || value === 'overlay'
  }

  /** Visible inner box of the area in window coordinates (without border, clipped to the window). */
  function boxOf(el: Element) {
    const vw = doc.clientWidth
    const vh = doc.clientHeight
    if (isPage(el)) return { left: 0, top: 0, right: vw, bottom: vh }
    const r = el.getBoundingClientRect()
    const left = r.left + el.clientLeft
    const top = r.top + el.clientTop
    return {
      left: Math.max(0, left),
      top: Math.max(0, top),
      right: Math.min(vw, left + el.clientWidth),
      bottom: Math.min(vh, top + el.clientHeight),
    }
  }

  function thumbOf(el: Element, axis: Axis): Thumb {
    let entry = entries.get(el)
    if (!entry) {
      entry = { el, thumbs: {} }
      entries.set(el, entry)
    }
    let thumb = entry.thumbs[axis]
    if (!thumb) {
      thumb = { axis, entry, node: null, timer: 0, visible: false, near: false, over: false, dragging: false, trackLen: 0, thumbLen: 0, range: 0 }
      entry.thumbs[axis] = thumb
    }
    return thumb
  }

  function ensureNode(thumb: Thumb): HTMLDivElement {
    if (thumb.node) return thumb.node
    const node = document.createElement('div')
    node.className = 'os-thumb'
    node.dataset.axis = thumb.axis
    node.dataset.visible = 'false'
    node.addEventListener('pointerenter', () => {
      thumb.over = true
      node.dataset.active = 'true'
      clearTimer(thumb)
    })
    node.addEventListener('pointerleave', () => {
      thumb.over = false
      if (!thumb.dragging) {
        node.dataset.active = 'false'
        scheduleHide(thumb)
      }
    })
    node.addEventListener('pointerdown', (event) => beginDrag(thumb, node, event))
    getLayer().appendChild(node)
    thumb.node = node
    return node
  }

  function clearTimer(thumb: Thumb) {
    if (thumb.timer) {
      window.clearTimeout(thumb.timer)
      thumb.timer = 0
    }
  }

  function scheduleHide(thumb: Thumb) {
    clearTimer(thumb)
    if (thumb.near || thumb.over || thumb.dragging) return
    thumb.timer = window.setTimeout(() => hide(thumb), HIDE_DELAY)
  }

  function hide(thumb: Thumb) {
    clearTimer(thumb)
    thumb.visible = false
    shown.delete(thumb)
    if (thumb.node) thumb.node.dataset.visible = 'false'
    // A hidden thumb of an element that left the page is dropped for good.
    if (!thumb.entry.el.isConnected && thumb.node) {
      thumb.node.remove()
      thumb.node = null
      delete thumb.entry.thumbs[thumb.axis]
    }
  }

  /** False while the area is removed, display:none or visibility:hidden (a closed dialog), so its thumb must not stay. */
  function areaVisible(el: Element): boolean {
    if (!el.isConnected) return false
    if (isPage(el)) return true
    const check = (el as Element & { checkVisibility?: (options?: { visibilityProperty?: boolean }) => boolean }).checkVisibility
    return check ? check.call(el, { visibilityProperty: true }) : true
  }

  /** Places and sizes the thumb. Returns false when there is nothing to scroll along this axis. */
  function place(thumb: Thumb): boolean {
    const el = thumb.entry.el
    const vertical = thumb.axis === 'y'
    if (!areaVisible(el) || !scrolls(el, thumb.axis)) return false
    const box = boxOf(el)
    const other = scrolls(el, vertical ? 'x' : 'y') ? HIT : 0 // keep clear of the thumb on the other axis
    const client = vertical ? el.clientHeight : el.clientWidth
    const size = vertical ? el.scrollHeight : el.scrollWidth
    const offset = vertical ? el.scrollTop : el.scrollLeft
    const start = (vertical ? box.top : box.left) + PAD
    const end = (vertical ? box.bottom : box.right) - PAD - other
    const trackLen = end - start
    if (trackLen < MIN_THUMB / 2) return false
    const range = size - client
    const thumbLen = Math.min(trackLen, Math.max(MIN_THUMB, (trackLen * client) / size))
    const travel = trackLen - thumbLen
    const pos = start + (range > 0 ? Math.min(1, Math.max(0, offset / range)) * travel : 0)
    const x = vertical ? box.right - HIT : pos
    const y = vertical ? pos : box.bottom - HIT
    const node = ensureNode(thumb)
    node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
    node.style.width = `${vertical ? HIT : Math.round(thumbLen)}px`
    node.style.height = `${vertical ? Math.round(thumbLen) : HIT}px`
    thumb.trackLen = trackLen
    thumb.thumbLen = thumbLen
    thumb.range = range
    return true
  }

  /** Shows the thumb (when there is something to scroll) and starts or stops its hide timer. */
  function reveal(thumb: Thumb) {
    if (!place(thumb)) {
      if (thumb.visible) hide(thumb)
      return
    }
    thumb.visible = true
    shown.add(thumb)
    thumb.node!.dataset.visible = 'true'
    scheduleHide(thumb)
  }

  function refreshShown(skip?: Element) {
    for (const thumb of shown) {
      if (thumb.entry.el === skip) continue
      if (!place(thumb)) hide(thumb)
    }
  }

  // ---- scrolling
  function onScroll(event: Event) {
    const el = scrollerOf(event.target)
    if (!el) return
    reveal(thumbOf(el, 'y'))
    reveal(thumbOf(el, 'x'))
    // Every other visible thumb follows its area, which may have moved with the page.
    refreshShown(el)
  }

  // ---- pointer near the edge
  /** The thumb whose edge zone holds the pointer, nearest scroll area first, the page last. */
  function findNear(event: PointerEvent): Thumb | null {
    const chain: Element[] = []
    for (let el = event.target instanceof Element ? event.target : null; el && el !== doc && el !== document.body; el = el.parentElement) chain.push(el)
    chain.push(pageScroller())
    for (const el of chain) {
      if (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) continue
      const box = boxOf(el)
      if (event.clientY >= box.top && event.clientY <= box.bottom && event.clientX <= box.right && event.clientX >= box.right - EDGE_ZONE && scrolls(el, 'y')) {
        return thumbOf(el, 'y')
      }
      if (event.clientX >= box.left && event.clientX <= box.right && event.clientY <= box.bottom && event.clientY >= box.bottom - EDGE_ZONE && scrolls(el, 'x')) {
        return thumbOf(el, 'x')
      }
    }
    return null
  }

  function setNear(next: Thumb | null) {
    if (next === nearThumb) return
    const previous = nearThumb
    nearThumb = next
    if (previous) {
      previous.near = false
      scheduleHide(previous)
    }
    if (next) {
      next.near = true
      reveal(next)
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    lastMove = event
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      const move = lastMove
      lastMove = null
      if (!move) return
      // On the thumb itself the current state stays (the thumb sits inside the edge zone).
      if (move.target instanceof Element && layer?.contains(move.target)) return
      setNear(findNear(move))
    })
  }

  /** The pointer left the window (no element entered): nothing is near any more. */
  function onPointerLeave(event: PointerEvent) {
    if (event.relatedTarget) return
    setNear(null)
  }

  const onBlur = () => setNear(null)

  // ---- dragging
  function beginDrag(thumb: Thumb, node: HTMLDivElement, event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    const el = thumb.entry.el
    const vertical = thumb.axis === 'y'
    const startPointer = vertical ? event.clientY : event.clientX
    const startOffset = vertical ? el.scrollTop : el.scrollLeft
    thumb.dragging = true
    node.dataset.active = 'true'
    clearTimer(thumb)
    doc.classList.add('os-dragging')
    node.setPointerCapture(event.pointerId)

    const onMove = (move: PointerEvent) => {
      const travel = thumb.trackLen - thumb.thumbLen
      if (travel <= 0) return
      const delta = ((vertical ? move.clientY : move.clientX) - startPointer) * (thumb.range / travel)
      const next = Math.min(thumb.range, Math.max(0, startOffset + delta))
      el.scrollTo(vertical ? { top: next, behavior: 'instant' } : { left: next, behavior: 'instant' })
      place(thumb)
    }
    const onEnd = (end: PointerEvent) => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerup', onEnd)
      node.removeEventListener('pointercancel', onEnd)
      if (node.hasPointerCapture(end.pointerId)) node.releasePointerCapture(end.pointerId)
      thumb.dragging = false
      doc.classList.remove('os-dragging')
      if (!thumb.over) node.dataset.active = 'false'
      scheduleHide(thumb)
    }
    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerup', onEnd)
    node.addEventListener('pointercancel', onEnd)
  }

  // ---- housekeeping: a dialog that closes takes its thumb with it at once instead of leaving it until the timer runs out.
  let checkFrame = 0
  function scheduleCheck() {
    if (shown.size === 0 || checkFrame) return
    checkFrame = window.requestAnimationFrame(() => {
      checkFrame = 0
      for (const thumb of [...shown]) if (!areaVisible(thumb.entry.el)) hide(thumb)
    })
  }

  const observer = new MutationObserver(scheduleCheck)
  const onResize = () => refreshShown()

  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  document.addEventListener('pointermove', onPointerMove, { passive: true })
  doc.addEventListener('pointerleave', onPointerLeave)
  window.addEventListener('blur', onBlur)
  window.addEventListener('resize', onResize)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'inert', 'open'] })
  document.addEventListener('transitionend', scheduleCheck, true)

  return () => {
    document.removeEventListener('scroll', onScroll, true)
    document.removeEventListener('pointermove', onPointerMove)
    doc.removeEventListener('pointerleave', onPointerLeave)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('resize', onResize)
    observer.disconnect()
    document.removeEventListener('transitionend', scheduleCheck, true)
    if (checkFrame) window.cancelAnimationFrame(checkFrame)
    if (frame) window.cancelAnimationFrame(frame)
    for (const thumb of shown) clearTimer(thumb)
    layer?.remove()
    layer = null
    doc.classList.remove('os-dragging')
  }
}
