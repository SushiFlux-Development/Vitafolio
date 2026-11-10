import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { clampBox, clampOffset, DRAG_MARGIN, KEY_STEP, KEY_STEP_LARGE, keyMove, useDragMove } from './useDragMove'

const VIEW = { w: 1000, h: 700 }
const CARD = { w: 300, h: 200 }

describe('clampBox', () => {
  it('leaves a box that is inside the window where it is', () => {
    expect(clampBox({ x: 100, y: 100 }, CARD, VIEW)).toEqual({ x: 100, y: 100 })
  })

  it('moves a box back in at every edge, keeping the margin', () => {
    expect(clampBox({ x: -50, y: -50 }, CARD, VIEW)).toEqual({ x: DRAG_MARGIN, y: DRAG_MARGIN })
    expect(clampBox({ x: 5000, y: 5000 }, CARD, VIEW)).toEqual({ x: 1000 - 300 - DRAG_MARGIN, y: 700 - 200 - DRAG_MARGIN })
  })

  it('keeps a box that is larger than the window at the top left instead of throwing it out', () => {
    expect(clampBox({ x: 300, y: 300 }, { w: 2000, h: 2000 }, VIEW)).toEqual({ x: DRAG_MARGIN, y: DRAG_MARGIN })
  })

  it('follows a smaller window', () => {
    const position = clampBox({ x: 700, y: 480 }, CARD, { w: 600, h: 400 })
    expect(position).toEqual({ x: 600 - 300 - DRAG_MARGIN, y: 400 - 200 - DRAG_MARGIN })
  })
})

describe('clampOffset', () => {
  // A dialog centred in the window: natural place (350, 250), 300 x 200
  const natural = { x: 350, y: 250, ...CARD }

  it('allows a shift that keeps the box inside', () => {
    expect(clampOffset({ x: 100, y: -100 }, natural, VIEW)).toEqual({ x: 100, y: -100 })
  })

  it('limits the shift so that the box stops at the margin', () => {
    expect(clampOffset({ x: -900, y: -900 }, natural, VIEW)).toEqual({ x: DRAG_MARGIN - 350, y: DRAG_MARGIN - 250 })
    expect(clampOffset({ x: 900, y: 900 }, natural, VIEW)).toEqual({ x: 1000 - 300 - DRAG_MARGIN - 350, y: 700 - 200 - DRAG_MARGIN - 250 })
  })

  it('brings a shift back that no longer fits after the window got smaller', () => {
    const shifted = clampOffset({ x: 300, y: 0 }, { x: 150, y: 100, ...CARD }, { w: 600, h: 400 })
    expect(150 + shifted.x + 300).toBeLessThanOrEqual(600 - DRAG_MARGIN)
  })
})

describe('keyMove', () => {
  it('moves by a small step, by a large one with Shift, and ignores every other key', () => {
    expect(keyMove('ArrowLeft', false)).toEqual({ x: -KEY_STEP, y: 0 })
    expect(keyMove('ArrowRight', false)).toEqual({ x: KEY_STEP, y: 0 })
    expect(keyMove('ArrowUp', false)).toEqual({ x: 0, y: -KEY_STEP })
    expect(keyMove('ArrowDown', true)).toEqual({ x: 0, y: KEY_STEP_LARGE })
    for (const key of ['Enter', 'Tab', 'a', ' ', 'Home']) expect(keyMove(key, false)).toBeNull()
  })
})

// The hook is driven with hand-made events: jsdom has no pointer capture and no layout, and the calculation is what counts.
function pointer(over: Partial<{ clientX: number; clientY: number; button: number; pointerType: string; target: Element }> = {}) {
  const head = document.createElement('div')
  head.setPointerCapture = vi.fn()
  head.releasePointerCapture = vi.fn()
  const event = {
    clientX: 0,
    clientY: 0,
    button: 0,
    pointerType: 'mouse',
    pointerId: 1,
    target: over.target ?? head,
    currentTarget: head,
    preventDefault: vi.fn(),
    ...over,
  }
  return event as unknown as PointerEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn>; currentTarget: HTMLElement }
}

function setup(start = { x: 100, y: 100 }) {
  let position = start
  const write = vi.fn((next: { x: number; y: number }) => {
    position = next
  })
  const hook = renderHook(() => useDragMove({ read: () => position, write, clamp: (next) => clampBox(next, CARD, VIEW) }))
  return { hook, write, position: () => position }
}

describe('useDragMove, pointer', () => {
  it('moves the window by the distance the pointer travelled', () => {
    const { hook, position } = setup()
    const down = pointer({ clientX: 500, clientY: 300 })
    act(() => hook.result.current.headProps.onPointerDown(down))
    expect(hook.result.current.dragging).toBe(true)
    expect(down.preventDefault, 'text would be marked while dragging').toHaveBeenCalled()
    expect(down.currentTarget.setPointerCapture).toHaveBeenCalledWith(1)
    act(() => hook.result.current.headProps.onPointerMove(pointer({ clientX: 540, clientY: 270 })))
    expect(position()).toEqual({ x: 140, y: 70 })
    act(() => hook.result.current.headProps.onPointerUp(pointer()))
    expect(hook.result.current.dragging).toBe(false)
  })

  it('never lets the window leave the browser window, however far the pointer goes', () => {
    const { hook, position } = setup()
    act(() => hook.result.current.headProps.onPointerDown(pointer({ clientX: 500, clientY: 300 })))
    act(() => hook.result.current.headProps.onPointerMove(pointer({ clientX: 9000, clientY: 9000 })))
    expect(position()).toEqual({ x: 1000 - 300 - DRAG_MARGIN, y: 700 - 200 - DRAG_MARGIN })
    act(() => hook.result.current.headProps.onPointerMove(pointer({ clientX: -9000, clientY: -9000 })))
    expect(position()).toEqual({ x: DRAG_MARGIN, y: DRAG_MARGIN })
  })

  it('does nothing without a drag, and not for the right mouse button', () => {
    const { hook, write } = setup()
    act(() => hook.result.current.headProps.onPointerMove(pointer({ clientX: 50, clientY: 50 })))
    expect(write).not.toHaveBeenCalled()
    const right = pointer({ button: 2 })
    act(() => hook.result.current.headProps.onPointerDown(right))
    expect(hook.result.current.dragging).toBe(false)
    expect(right.preventDefault).not.toHaveBeenCalled()
  })

  it('works for a pen as well (button 0 is not demanded of it)', () => {
    const { hook } = setup()
    act(() => hook.result.current.headProps.onPointerDown(pointer({ pointerType: 'pen', button: -1 })))
    expect(hook.result.current.dragging).toBe(true)
  })

  it('leaves buttons in the head clickable: a press on them starts no drag', () => {
    const { hook } = setup()
    const head = document.createElement('div')
    head.innerHTML = '<button data-no-drag=""><span id="inner"></span></button>'
    const down = pointer({ target: head.querySelector('#inner')! })
    act(() => hook.result.current.headProps.onPointerDown(down))
    expect(hook.result.current.dragging).toBe(false)
    expect(down.preventDefault, 'the click must keep its default').not.toHaveBeenCalled()
  })

  it('ends the drag when the pointer is cancelled', () => {
    const { hook, write } = setup()
    act(() => hook.result.current.headProps.onPointerDown(pointer({ clientX: 10, clientY: 10 })))
    act(() => hook.result.current.headProps.onPointerCancel(pointer()))
    expect(hook.result.current.dragging).toBe(false)
    act(() => hook.result.current.headProps.onPointerMove(pointer({ clientX: 99, clientY: 99 })))
    expect(write).not.toHaveBeenCalled()
  })
})

describe('useDragMove, keyboard', () => {
  const key = (name: string, shiftKey = false) =>
    ({ key: name, shiftKey, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as KeyboardEvent<HTMLElement> & { preventDefault: ReturnType<typeof vi.fn>; stopPropagation: ReturnType<typeof vi.fn> }

  it('moves with the arrow keys, in large steps with Shift', () => {
    const { hook, position } = setup()
    act(() => hook.result.current.onGripKeyDown(key('ArrowRight')))
    expect(position()).toEqual({ x: 100 + KEY_STEP, y: 100 })
    act(() => hook.result.current.onGripKeyDown(key('ArrowDown', true)))
    expect(position()).toEqual({ x: 100 + KEY_STEP, y: 100 + KEY_STEP_LARGE })
    act(() => hook.result.current.onGripKeyDown(key('ArrowLeft')))
    act(() => hook.result.current.onGripKeyDown(key('ArrowUp', true)))
    expect(position()).toEqual({ x: 100, y: 100 })
  })

  it('stops at the edge of the window', () => {
    const { hook, position } = setup({ x: DRAG_MARGIN + 4, y: 100 })
    act(() => hook.result.current.onGripKeyDown(key('ArrowLeft', true)))
    expect(position().x).toBe(DRAG_MARGIN)
  })

  it('keeps the arrow keys for itself (no page scrolling, no steps of an introduction), and lets other keys through', () => {
    const { hook, write } = setup()
    const arrow = key('ArrowRight')
    act(() => hook.result.current.onGripKeyDown(arrow))
    expect(arrow.preventDefault).toHaveBeenCalled()
    expect(arrow.stopPropagation).toHaveBeenCalled()
    const tab = key('Tab')
    act(() => hook.result.current.onGripKeyDown(tab))
    expect(tab.preventDefault).not.toHaveBeenCalled()
    expect(tab.stopPropagation).not.toHaveBeenCalled()
    expect(write).toHaveBeenCalledTimes(1)
  })
})
