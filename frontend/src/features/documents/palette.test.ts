import { describe, expect, it } from 'vitest'
import { contrast, DOCUMENT_COLORS, headingContrast, hexDigitsOf, hsvToHex, isTooLight, normalizeHexColor, onWhite, parseHexColor, readableOn, rgbToHsv } from './palette'

describe('document colours', () => {
  it('has a readable check mark on every swatch (3:1 for a graphical part, in the better of white and dark)', () => {
    for (const color of DOCUMENT_COLORS) {
      expect(contrast(color.hex, readableOn(color.hex)), color.label).toBeGreaterThanOrEqual(3)
    }
  })

  it('chooses white on dark colours and dark on light ones', () => {
    expect(readableOn('#14213D')).toBe('#ffffff')
    expect(readableOn('#fde68a')).toBe('#14213d')
  })

  it('falls back to white for something that is no #rrggbb colour', () => {
    expect(readableOn('red')).toBe('#ffffff')
  })

  it('keeps all eight fixed colours readable as headings on white (so the hint only ever concerns an own colour)', () => {
    for (const color of DOCUMENT_COLORS) {
      expect(isTooLight(color.hex), color.label).toBe(false)
    }
  })
})

describe('own colour: reading and writing hex', () => {
  it('spells every form the server accepts the same way', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC')
    expect(normalizeHexColor('#abcd')).toBe('#AABBCCDD')
    expect(normalizeHexColor('14213d')).toBe('#14213D')
    expect(normalizeHexColor(' #14213d80 ')).toBe('#14213D80')
  })

  it('refuses what the server refuses', () => {
    for (const bad of ['', '#', '#12', '#12345', '#1234567', '#123456789', '#ggg', 'red', '#14213D; background: red']) {
      expect(normalizeHexColor(bad), bad).toBeNull()
    }
  })

  it('tells hex digits from other characters', () => {
    expect(hexDigitsOf('#AbC')).toBe('AbC')
    expect(hexDigitsOf('')).toBe('')
    expect(hexDigitsOf('#xyz')).toBeNull()
  })

  it('reads the channels, with the alpha as a fraction', () => {
    expect(parseHexColor('#FF8000')).toEqual({ r: 255, g: 128, b: 0, a: 1 })
    expect(parseHexColor('#00000080')?.a).toBeCloseTo(0.502, 2)
    expect(parseHexColor('#12')).toBeNull()
  })

  it('mixes a transparent colour with white, because documents are printed on white', () => {
    expect(onWhite('#000000')).toBe('#000000')
    expect(onWhite('#00000000')).toBe('#FFFFFF')
    expect(onWhite('#0000007F')).toBe('#808080')
  })
})

describe('own colour: too light for headings', () => {
  it('warns below 3:1 on white and not at or above it', () => {
    expect(isTooLight('#FFFF00')).toBe(true)
    expect(isTooLight('#FDE68A')).toBe(true)
    expect(isTooLight('#14213D')).toBe(false)
    // #949494 is the classic 3:1 grey on white (just above), #A0A0A0 is clearly below.
    expect(isTooLight('#949494')).toBe(false)
    expect(isTooLight('#A0A0A0')).toBe(true)
  })

  it('judges a transparent colour by how it looks on paper', () => {
    expect(headingContrast('#14213D')).toBeGreaterThan(10)
    expect(isTooLight('#14213D20')).toBe(true)
  })

  it('has no opinion on something that is not a complete colour', () => {
    expect(isTooLight('#FF')).toBe(false)
    expect(headingContrast('nonsense')).toBeNull()
  })
})

describe('own colour: hue, saturation and brightness', () => {
  it('converts forth and back without drifting', () => {
    for (const hex of ['#14213D', '#0284C7', '#E11D48', '#B8872A', '#FFFFFF', '#000000', '#808080', '#FF0000']) {
      const rgb = parseHexColor(hex)!
      expect(hsvToHex(rgbToHsv(rgb)), hex).toBe(hex)
    }
  })

  it('knows the primaries', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 })
    expect(rgbToHsv({ r: 0, g: 255, b: 0 }).h).toBe(120)
    expect(rgbToHsv({ r: 0, g: 0, b: 255 }).h).toBe(240)
    expect(hsvToHex({ h: 60, s: 1, v: 1 })).toBe('#FFFF00')
  })
})
