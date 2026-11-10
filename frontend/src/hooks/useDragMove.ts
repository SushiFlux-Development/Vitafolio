import { useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

/** A card never gets closer than this to the edge of the window. */
export const DRAG_MARGIN = 12
/** One press of an arrow key moves a window by this much; with Shift by the larger step. */
export const KEY_STEP = 16
export const KEY_STEP_LARGE = 64

export interface Point {
  x: number
  y: number
}

export interface Size {
  w: number
  h: number
}

const limit = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

/** The position (top left corner) of a box of this size, moved into the window. A box larger than the window sticks to the top left. */
export function clampBox(position: Point, size: Size, view: Size, margin = DRAG_MARGIN): Point {
  return { x: limit(position.x, margin, view.w - size.w - margin), y: limit(position.y, margin, view.h - size.h - margin) }
}

/**
 * The same for a box that sits at a natural place and is only moved by an offset (a centred dialog): the offset is limited so that
 * the box, natural place plus offset, stays inside the window.
 */
export function clampOffset(offset: Point, natural: Point & Size, view: Size, margin = DRAG_MARGIN): Point {
  const box = clampBox({ x: natural.x + offset.x, y: natural.y + offset.y }, { w: natural.w, h: natural.h }, view, margin)
  return { x: box.x - natural.x, y: box.y - natural.y }
}

/** What an arrow key does to a window; null for every other key. */
export function keyMove(key: string, large: boolean): Point | null {
  const step = large ? KEY_STEP_LARGE : KEY_STEP
  if (key === 'ArrowLeft') return { x: -step, y: 0 }
  if (key === 'ArrowRight') return { x: step, y: 0 }
  if (key === 'ArrowUp') return { x: 0, y: -step }
  if (key === 'ArrowDown') return { x: 0, y: step }
  return null
}

interface DragMoveOptions {
  /** Where the window is right now (read when a drag or a key press starts). */
  read: () => Point
  /** Takes the new position; it has been through `clamp` already. */
  write: (position: Point) => void
  /** Keeps a position inside the window. */
  clamp: (position: Point) => Point
}

/**
 * Moving a window by its head: drag with mouse or pen (pointer events, the pointer is captured so the drag cannot get lost) and, for
 * the same result without a pointer, the arrow keys on the grip. Anything inside the head marked data-no-drag stays clickable.
 * Nothing moves except in answer to the user.
 */
export function useDragMove({ read, write, clamp }: DragMoveOptions) {
  const start = useRef<{ pointer: Point; origin: Point } | null>(null)
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return
    // No text is marked while dragging, and no focus jumps to the head
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    start.current = { pointer: { x: event.clientX, y: event.clientY }, origin: read() }
    setDragging(true)
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = start.current
    if (!drag) return
    write(clamp({ x: drag.origin.x + event.clientX - drag.pointer.x, y: drag.origin.y + event.clientY - drag.pointer.y }))
  }

  const end = (event: PointerEvent<HTMLElement>) => {
    if (!start.current) return
    start.current = null
    setDragging(false)
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    } catch {
      // The capture was gone already (the element left the page): nothing to release.
    }
  }

  /** For the grip button: the arrow keys move the window, Shift in larger steps. */
  const onGripKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const move = keyMove(event.key, event.shiftKey)
    if (!move) return
    // Not the arrow keys of whatever listens above (the steps of the introduction), and not the scrolling of the page
    event.preventDefault()
    event.stopPropagation()
    const here = read()
    write(clamp({ x: here.x + move.x, y: here.y + move.y }))
  }

  return { dragging, headProps: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }, onGripKeyDown }
}
