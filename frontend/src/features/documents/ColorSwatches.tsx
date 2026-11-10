import type { KeyboardEvent } from 'react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../components/ui/Icon'
import { CustomColorPopover } from './CustomColorPopover'
import { DEFAULT_DOCUMENT_COLOR, DOCUMENT_COLORS, isTooLight, normalizeHexColor, onWhite, readableOn } from './palette'

interface ColorSwatchesProps {
  value: string | null | undefined
  onChange: (hex: string) => void
  /** Accessible name of the group ("Akzentfarbe"). */
  label: string
}

/**
 * The accent colour choice: a radio group of the eight fixed swatches (one tab stop, arrow keys move the choice, like a native radio
 * group) and, below them, the own colour. The chosen swatch carries a check mark in a readable colour, so it is recognisable without
 * relying on the ring around it.
 *
 * The own-colour button is "active" exactly when the stored colour is a valid one that is not among the eight; then it shows that colour.
 * Choosing one of the eight (also by typing its value) switches it off again. It opens {@link CustomColorPopover}.
 */
export function ColorSwatches({ value, onChange, label }: ColorSwatchesProps) {
  const { t } = useTranslation()
  const group = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  // The colour as the server reads it: with or without '#', any case, short forms spread out. Null = empty or no colour at all.
  const current = normalizeHexColor(value ?? '')
  const selectedIndex = DOCUMENT_COLORS.findIndex((color) => color.hex.toUpperCase() === current)
  const custom = current !== null && selectedIndex === -1 ? current : null
  // Nothing in the group is chosen for an own colour, an empty or an invalid value; the tab stop then sits on the first swatch.
  const tabStop = Math.max(0, selectedIndex)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const count = DOCUMENT_COLORS.length
    // From "nothing chosen" the first arrow goes to the first swatch (forward) or the last one (backward).
    const nextIndex = selectedIndex === -1 ? (step > 0 ? 0 : count - 1) : (selectedIndex + step + count) % count
    const next = DOCUMENT_COLORS[nextIndex]
    if (!next) return
    onChange(next.hex)
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex]?.focus()
  }

  // What the own-colour button is filled with: the colour as it looks on white paper (a transparent one is mixed with white).
  const fill = custom ? (onWhite(custom) ?? custom) : null
  const tooLight = custom !== null && isTooLight(custom)

  return (
    <div className="grid gap-2">
      <div ref={group} role="radiogroup" aria-label={label} onKeyDown={handleKeyDown} className="grid grid-cols-4 gap-2">
        {DOCUMENT_COLORS.map((color, index) => {
          const selected = index === selectedIndex
          return (
            <button
              key={color.hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${color.label} (${color.hex})`}
              title={`${color.label} (${color.hex})`}
              tabIndex={index === tabStop ? 0 : -1}
              onClick={() => onChange(color.hex)}
              className={`flex h-9 items-center justify-center rounded-sm border border-line-strong transition-shadow ${selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
              style={{ backgroundColor: color.hex }}
            >
              {selected && (
                <span style={{ color: readableOn(color.hex) }}>
                  <Icon name="check" size={16} />
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Same height and the same slots whether it is active or not: choosing an own colour changes colours only, never the size. */}
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={custom ? t('colorPicker.customChosen', { hex: custom }) : t('colorPicker.custom')}
        title={tooLight ? t('colorPicker.tooLightShort') : t('colorPicker.dialog')}
        onClick={() => setOpen((was) => !was)}
        className={`flex h-9 w-full items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-shadow ${
          custom ? 'border-line-strong ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'border-line-strong bg-surface text-ink hover:bg-surface-2'
        }`}
        style={fill ? { backgroundColor: fill, color: readableOn(fill) } : undefined}
      >
        <Icon name={custom ? 'check' : 'palette'} size={16} />
        <span className="flex-1 text-left">{t('colorPicker.custom')}</span>
        <span className="flex w-4 justify-center">{tooLight && <Icon name="alertTriangle" size={16} />}</span>
        <span className="w-[5.5rem] text-right font-mono text-xs">{custom ?? ''}</span>
      </button>

      {open && (
        <CustomColorPopover
          anchor={trigger}
          value={current ?? DEFAULT_DOCUMENT_COLOR}
          onChange={onChange}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
