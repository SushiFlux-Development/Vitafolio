import { describe, expect, it } from 'vitest'
import de from './locales/de.json'
import en from './locales/en.json'

/** Every text of a locale with its dotted key. */
function flatten(node: unknown, prefix = ''): [string, string][] {
  if (typeof node === 'string') return [[prefix, node]]
  if (node === null || typeof node !== 'object') return []
  return Object.entries(node).flatMap(([key, value]) => flatten(value, prefix ? `${prefix}.${key}` : key))
}

describe('texts', () => {
  for (const [language, locale] of [['de', de], ['en', en]] as const) {
    it(`${language}: the product name is never typed into a text (the texts say {{product}})`, () => {
      const offenders = flatten(locale).filter(([, text]) => /vitafolio/i.test(text))
      expect(offenders).toEqual([])
    })

    it(`${language}: the cover letter is "based on DIN 5008", never "compliant"`, () => {
      const texts = flatten(locale).filter(([, text]) => /normgerecht|DIN[- ]konform|compliant with DIN|DIN 5008[- ]compliant/i.test(text))
      expect(texts).toEqual([])
      expect(flatten(locale).find(([key]) => key === 'coverLetters.subtitle')?.[1]).toMatch(/DIN 5008/)
    })
  }
})
