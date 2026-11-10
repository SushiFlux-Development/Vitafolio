/**
 * The accent colours a document (CV, cover letter) can be printed in. These are data, not interface colours: they end up in the
 * PDF, so they are the same in the light and the dark theme. The name is only the tooltip.
 */
export const DOCUMENT_COLORS = [
  { label: 'Navy', hex: '#14213D' },
  { label: 'Blue', hex: '#0284C7' },
  { label: 'Emerald', hex: '#059669' },
  { label: 'Indigo', hex: '#4F46E5' },
  { label: 'Violet', hex: '#7C3AED' },
  { label: 'Rose', hex: '#E11D48' },
  { label: 'Gold', hex: '#B8872A' },
  { label: 'Slate', hex: '#334155' },
] as const

export const DEFAULT_DOCUMENT_COLOR = DOCUMENT_COLORS[0].hex

function luminance(hex: string): number {
  const channel = (value: number) => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

const DARK = '#14213d'
const LIGHT = '#ffffff'

/** The WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (high + 0.05) / (low + 0.05)
}

/** White or near-black, whichever has the better contrast on the given #rrggbb colour (the check mark on a chosen swatch). */
export function readableOn(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return LIGHT
  return contrast(hex, LIGHT) >= contrast(hex, DARK) ? LIGHT : DARK
}

// ---------- Own colour ----------

/**
 * What the server accepts as a colour (DocumentText.IsHexColor): '#' plus 3, 4, 6 or 8 hex digits. The picker accepts the same set;
 * it is never stricter than the server. A missing '#' and surrounding blanks are tolerated on input and fixed on the way out.
 */
export const HEX_DIGIT_COUNTS = [3, 4, 6, 8] as const
export const MAX_HEX_DIGITS = 8

/** The hex digits of what was typed ('#' and blanks around it removed), or null when there is any other character in it. */
export function hexDigitsOf(text: string): string | null {
  const digits = text.trim().replace(/^#/, '')
  return /^[0-9a-f]*$/i.test(digits) ? digits : null
}

/**
 * The canonical form the server stores and Typst reads: upper case, '#', short forms spread out (#abc becomes #AABBCC, #abcd becomes
 * #AABBCCDD). Null for anything that is not a complete colour.
 */
export function normalizeHexColor(text: string): string | null {
  const digits = hexDigitsOf(text)
  if (digits === null || !(HEX_DIGIT_COUNTS as readonly number[]).includes(digits.length)) return null
  const full = digits.length <= 4 ? [...digits].map((c) => c + c).join('') : digits
  return `#${full.toUpperCase()}`
}

export interface Rgba {
  r: number
  g: number
  b: number
  /** 0 to 1. */
  a: number
}

/** The channels of a canonical (or any complete) colour, null when it is not one. */
export function parseHexColor(text: string): Rgba | null {
  const hex = normalizeHexColor(text)
  if (!hex) return null
  const n = (start: number) => parseInt(hex.slice(start, start + 2), 16)
  return { r: n(1), g: n(3), b: n(5), a: hex.length === 9 ? n(7) / 255 : 1 }
}

function toHex({ r, g, b }: Pick<Rgba, 'r' | 'g' | 'b'>): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/** The colour as it looks on white paper: a transparent colour mixed with white, as #RRGGBB. Documents are printed on white. */
export function onWhite(text: string): string | null {
  const c = parseHexColor(text)
  if (!c) return null
  const mix = (channel: number) => channel * c.a + 255 * (1 - c.a)
  return toHex({ r: mix(c.r), g: mix(c.g), b: mix(c.b) })
}

/** Headings need 3:1 against the page (large text, WCAG 1.4.3); below this a calm hint is shown. Nothing is blocked. */
export const HEADING_CONTRAST_MIN = 3

/** The contrast of a heading in this colour on white paper, or null when the text is no complete colour. */
export function headingContrast(text: string): number | null {
  const flat = onWhite(text)
  return flat ? contrast(flat, LIGHT) : null
}

/** True when the colour is too light for readable headings on white. Incomplete or invalid text is not "too light". */
export function isTooLight(text: string): boolean {
  const ratio = headingContrast(text)
  return ratio !== null && ratio < HEADING_CONTRAST_MIN
}

export interface Hsv {
  /** 0 to 360. */
  h: number
  /** 0 to 1. */
  s: number
  /** 0 to 1. */
  v: number
}

export function rgbToHsv({ r, g, b }: Pick<Rgba, 'r' | 'g' | 'b'>): Hsv {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const delta = max - Math.min(rn, gn, bn)
  let h = 0
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max }
}

/** The opaque #RRGGBB for a hue, saturation and brightness. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return toHex({ r: f(5) * 255, g: f(3) * 255, b: f(1) * 255 })
}
