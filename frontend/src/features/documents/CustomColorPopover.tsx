import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/ui/Icon'
import { LiveTextField } from '../../components/ui/LiveTextField'
import { MessageSlot } from '../../components/ui/MessageSlot'
import { hexColorCheck } from '../../validation/rules'
import { HEADING_CONTRAST_MIN, headingContrast, hsvToHex, normalizeHexColor, parseHexColor, rgbToHsv } from './palette'
import type { Hsv } from './palette'

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])'
const GAP = 6
const MARGIN = 8

interface CustomColorPopoverProps {
  /** The button that opened it: the popover sits below (or above) it and gives the focus back to it. */
  anchor: RefObject<HTMLElement | null>
  /** The colour to start from (any complete colour; anything else starts at a neutral blue). */
  value: string
  onChange: (hex: string) => void
  onClose: () => void
}

/** The ratio with one decimal, always rounded down: "2.9" must never read "3.0" next to the 3:1 threshold. */
function ratioText(ratio: number, language: string): string {
  return (Math.floor(ratio * 10) / 10).toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/** Hue, saturation and brightness of a colour; the old hue stays when the new colour has none (grey, black, white). */
function hsvOf(hex: string, previous: Hsv | null): Hsv {
  const rgb = parseHexColor(hex)
  if (!rgb) return previous ?? { h: 210, s: 1, v: 0.8 }
  const next = rgbToHsv(rgb)
  return previous && (next.s === 0 || next.v === 0) ? { h: previous.h, s: next.s, v: next.v } : next
}

/**
 * The own-colour picker: a colour field (saturation and brightness), a hue slider and a hex field - our own control, never the browser's
 * or the operating system's colour dialog. It floats over the page (portal, fixed position), so opening it moves nothing, and the
 * room for its messages is reserved, so a message moves nothing inside it either.
 *
 * Every complete colour is passed on at once (the document updates and saves like a click on a swatch). In the hex field a six- or
 * eight-digit colour counts as soon as it is typed; a three- or four-digit short form only when the field is left or Enter is pressed,
 * because it is also the beginning of a longer colour and would flash through the preview. Esc closes it and returns the focus; so does
 * a click outside (without taking the focus).
 */
export function CustomColorPopover({ anchor, value, onChange, onClose }: CustomColorPopoverProps) {
  const { t, i18n } = useTranslation()
  const reduce = useReducedMotion() ?? false
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  const start = normalizeHexColor(value) ?? '#0284C7'
  // The last complete colour; the hint and the colour field follow it. The text is what the hex field shows right now.
  const [current, setCurrent] = useState(start)
  const [hsv, setHsv] = useState<Hsv>(() => hsvOf(start, null))
  const [text, setText] = useState(start)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  const apply = (hex: string, nextHsv?: Hsv) => {
    setCurrent(hex)
    setHsv((previous) => nextHsv ?? hsvOf(hex, previous))
    onChange(hex)
  }

  const fromPicker = (next: Hsv) => {
    const hex = hsvToHex(next)
    setText(hex)
    apply(hex, next)
  }

  const handleText = (typed: string) => {
    setText(typed)
    const hex = normalizeHexColor(typed)
    // Six or eight digits are final; three and four may still become more.
    const digits = typed.trim().replace(/^#/, '').length
    if (hex && (digits === 6 || digits === 8)) apply(hex)
  }

  const settleText = () => {
    const hex = normalizeHexColor(text)
    if (!hex) return
    setText(hex)
    if (hex !== current) apply(hex)
  }

  // Place the popover under the button (above it when there is no room below) and keep it there while the page scrolls or resizes.
  useLayoutEffect(() => {
    const place = () => {
      const button = anchor.current?.getBoundingClientRect()
      const box = panel.current
      if (!button || !box) return
      const { offsetWidth: width, offsetHeight: height } = box
      const left = Math.min(Math.max(MARGIN, button.left), Math.max(MARGIN, window.innerWidth - width - MARGIN))
      const below = button.bottom + GAP
      const above = button.top - GAP - height
      const top = below + height <= window.innerHeight - MARGIN || above < MARGIN ? Math.max(MARGIN, Math.min(below, window.innerHeight - height - MARGIN)) : above
      setPosition((old) => (old && old.top === top && old.left === left ? old : { top, left }))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  // The focus moves in once the popover has its place and is visible: a hidden element cannot take the focus, and until the first
  // placement the panel is hidden (this effect runs again in the commit that makes it visible).
  const placed = position !== null
  useEffect(() => {
    if (placed) panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [placed])

  // A click outside closes it (a click on the button is the button's own toggle).
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) onClose()
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
    // Runs once when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const close = () => {
    onClose()
    anchor.current?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
      event.preventDefault()
      settleText()
      return
    }
    if (event.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const ratio = headingContrast(current)
  const light = ratio !== null && ratio < HEADING_CONTRAST_MIN
  const transparent = current.length === 9 && !current.endsWith('FF')
  const lightText = (shown: number) => t('colorPicker.tooLight', { ratio: ratioText(shown, i18n.language), min: HEADING_CONTRAST_MIN })
  const hint = light && ratio !== null ? lightText(ratio) : transparent ? t('colorPicker.transparent') : undefined

  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 })

  return createPortal(
    <motion.div
      ref={panel}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed z-50 w-[17rem] max-w-[calc(100vw-1rem)] rounded-lg border border-line bg-surface p-4 text-ink shadow-pop"
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 36 }}
    >
      <p id={titleId} className="mb-3 text-sm font-semibold">
        {t('colorPicker.dialog')}
      </p>

      <Area hsv={hsv} pure={pure} onChange={fromPicker} label={t('colorPicker.area')} valueText={t('colorPicker.areaValue', { saturation: Math.round(hsv.s * 100), brightness: Math.round(hsv.v * 100) })} />
      <HueSlider hsv={hsv} onChange={fromPicker} label={t('colorPicker.hue')} valueText={t('colorPicker.hueValue', { hue: Math.round(hsv.h) })} />

      <LiveTextField
        className="mt-3"
        label={t('colorPicker.hex')}
        inputClassName="font-mono"
        placeholder="#14213D"
        spellCheck={false}
        autoComplete="off"
        check={hexColorCheck}
        value={text}
        onValueChange={handleText}
        onBlur={settleText}
      />

      {/* The hint has its room from the start (the longest of its texts), so it never moves the field above or the popover itself. */}
      <div className="mt-1 flex items-start gap-2">
        <span className="mt-0.5 flex w-4 shrink-0 text-warning-soft-ink">{hint && <Icon name="alertTriangle" size={16} />}</span>
        <div className="min-w-0 flex-1">
          <MessageSlot reserve={[lightText(0), t('colorPicker.transparent')]} message={hint} />
        </div>
      </div>
    </motion.div>,
    document.body,
  )
}

/** Position inside an element as 0 to 1 (clamped), from a pointer event. */
function fractions(event: ReactPointerEvent<HTMLElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect()
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  return { x: rect.width ? clamp((event.clientX - rect.left) / rect.width) : 0, y: rect.height ? clamp((event.clientY - rect.top) / rect.height) : 0 }
}

interface PartProps {
  hsv: Hsv
  onChange: (hsv: Hsv) => void
  label: string
  valueText: string
}

/** Saturation (left to right) and brightness (bottom to top) of the chosen hue. Pointer drag and arrow keys (Shift: ten times as far). */
function Area({ hsv, pure, onChange, label, valueText }: PartProps & { pure: string }) {
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const { x, y } = fractions(event)
    onChange({ h: hsv.h, s: x, v: 1 - y })
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01
    const delta = { ArrowRight: [step, 0], ArrowLeft: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key]
    if (!delta) return
    event.preventDefault()
    const clamp = (n: number) => Math.min(1, Math.max(0, n))
    onChange({ h: hsv.h, s: clamp(hsv.s + delta[0]!), v: clamp(hsv.v + delta[1]!) })
  }
  return (
    <div
      role="slider"
      tabIndex={0}
      data-autofocus
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsv.s * 100)}
      aria-valuetext={valueText}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        move(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event)
      }}
      className="relative h-36 w-full cursor-crosshair touch-none rounded-sm border border-line-strong"
      style={{ backgroundColor: pure, backgroundImage: 'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))' }}
    >
      <span className="picker-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
    </div>
  )
}

/** The hue from 0 to 360 degrees. Arrow keys move one degree (Shift or Page up/down: ten), Home and End jump to the ends. */
function HueSlider({ hsv, onChange, label, valueText }: PartProps) {
  const move = (event: ReactPointerEvent<HTMLDivElement>) => onChange({ ...hsv, h: fractions(event).x * 360 })
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const big = event.shiftKey ? 10 : 1
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowUp' ? hsv.h + big
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? hsv.h - big
      : event.key === 'PageUp' ? hsv.h + 10
      : event.key === 'PageDown' ? hsv.h - 10
      : event.key === 'Home' ? 0
      : event.key === 'End' ? 360
      : null
    if (target === null) return
    event.preventDefault()
    onChange({ ...hsv, h: Math.min(360, Math.max(0, target)) })
  }
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hsv.h)}
      aria-valuetext={valueText}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        move(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event)
      }}
      className="relative mt-3 h-4 w-full cursor-pointer touch-none rounded-sm border border-line-strong"
      style={{ backgroundImage: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
    >
      <span className="picker-thumb" style={{ left: `${(hsv.h / 360) * 100}%`, top: '50%' }} />
    </div>
  )
}
